import { convertToModelMessages, generateText } from 'ai'
import type { ModelMessage } from 'ai'
import type { Project, Thread, Message } from '@/app/generated/prisma/client'
import { prisma } from '@/lib/prisma'
import { anthropic } from '@ai-sdk/anthropic'
import { buildMemberChatSystemPrompt } from '@/lib/ai/member-chat'

const MAX_NON_SUMMARIZED = 20
const TOKEN_THRESHOLD = 140_000 // 70% of 200k context

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

export async function buildMemberContext(
  threadId: string,
  projectId: string,
  userId: string,
): Promise<{
  systemPrompt: string
  messages: ModelMessage[]
  thread: Thread & { messages: Message[] }
  project: Project
}> {
  // Load thread, project, and recent messages in parallel
  const [thread, project, recentMessages] = await Promise.all([
    prisma.thread.findUniqueOrThrow({
      where: { id: threadId },
      include: {
        messages: {
          where: { summarized: false },
          orderBy: { createdAt: 'desc' },
          take: MAX_NON_SUMMARIZED,
        },
      },
    }),
    prisma.project.findUniqueOrThrow({ where: { id: projectId } }),
    prisma.message.findMany({
      where: { threadId, summarized: false },
      orderBy: { createdAt: 'desc' },
      take: MAX_NON_SUMMARIZED,
    }),
  ])

  // Reverse to restore chronological order (desc fetch gives newest-first)
  recentMessages.reverse()

  // Build system prompt fresh each request
  const systemPrompt = await buildMemberChatSystemPrompt(userId, projectId)

  // Prepend summary as a synthetic message pair if available
  type UIMessageLike = { role: 'user' | 'assistant'; parts: Array<{ type: 'text'; text: string }> }

  const uiMessages: UIMessageLike[] = []

  if (thread.summary) {
    // Prepend as a user+assistant exchange so it works with convertToModelMessages
    uiMessages.push({
      role: 'user',
      parts: [{ type: 'text', text: '[Earlier conversation summary request]' }],
    })
    uiMessages.push({
      role: 'assistant',
      parts: [{ type: 'text', text: `[Earlier conversation summary]\n${thread.summary}` }],
    })
  }

  // Convert DB messages to UI message format
  for (const msg of recentMessages) {
    const role = msg.role as 'user' | 'assistant'
    if (role !== 'user' && role !== 'assistant') continue
    const content = msg.content
    const parts = Array.isArray(content) ? content as Array<{ type: string; text?: string }> : []
    uiMessages.push({
      role,
      parts: parts.filter((p) => p.type === 'text') as Array<{ type: 'text'; text: string }>,
    })
  }

  const messages = await convertToModelMessages(uiMessages)

  // Estimate tokens and condense if needed
  const allText = systemPrompt + JSON.stringify(messages)
  const estimatedTokens = estimateTokens(allText)

  if (estimatedTokens > TOKEN_THRESHOLD) {
    await maybeCondense(threadId)
  }

  return { systemPrompt, messages, thread, project }
}

export async function maybeCondense(threadId: string): Promise<void> {
  // Count total non-summarized messages
  const totalCount = await prisma.message.count({
    where: { threadId, summarized: false },
  })

  if (totalCount <= MAX_NON_SUMMARIZED) {
    // Nothing to condense beyond the window
    return
  }

  // Get IDs of the most recent 20 messages to keep
  const recentMessages = await prisma.message.findMany({
    where: { threadId, summarized: false },
    orderBy: { createdAt: 'desc' },
    take: MAX_NON_SUMMARIZED,
    select: { id: true },
  })

  const keepIds = new Set(recentMessages.map((m) => m.id))

  // Load older messages to be summarized
  const oldMessages = await prisma.message.findMany({
    where: {
      threadId,
      summarized: false,
      id: { notIn: Array.from(keepIds) },
    },
    orderBy: { createdAt: 'asc' },
  })

  if (oldMessages.length === 0) return

  // Build conversation text for summarization
  const conversationText = oldMessages
    .map((m) => {
      const content = m.content
      const parts = Array.isArray(content) ? content as Array<{ type: string; text?: string }> : []
      const text = parts
        .filter((p) => p.type === 'text' && typeof p.text === 'string')
        .map((p) => p.text as string)
        .join(' ')
      return `${m.role.toUpperCase()}: ${text}`
    })
    .join('\n\n')

  // Call Claude Haiku to summarize
  const { text: summary } = await generateText({
    model: anthropic('claude-haiku-4-5-20251001'),
    prompt: `Summarize this conversation. Focus on decisions made, blockers reported, and task updates agreed upon. Do NOT include project state facts like milestone status or task assignments — those are reloaded fresh from the database. Be concise.\n\n${conversationText}`,
  })

  // Load current thread for summaryAt count
  const thread = await prisma.thread.findUnique({
    where: { id: threadId },
    select: { summaryAt: true },
  })

  const currentMessageCount = (thread?.summaryAt ?? 0) + oldMessages.length

  // Update thread summary and mark old messages as summarized
  await prisma.$transaction([
    prisma.thread.update({
      where: { id: threadId },
      data: {
        summary,
        summaryAt: currentMessageCount,
      },
    }),
    prisma.message.updateMany({
      where: {
        threadId,
        id: { in: oldMessages.map((m) => m.id) },
      },
      data: { summarized: true },
    }),
  ])
}
