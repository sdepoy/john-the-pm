import { convertToModelMessages } from 'ai'
import type { ModelMessage, UIMessage } from 'ai'
import type { Project, Thread } from '@/app/generated/prisma/client'
import { prisma } from '@/lib/prisma'
import { buildDiscoverySystemPrompt } from '@/lib/ai/discovery'

export async function buildContext(
  threadId: string,
  projectId: string,
): Promise<{
  systemPrompt: string
  messages: ModelMessage[]
  thread: Thread
  project: Project
}> {
  const [thread, project] = await Promise.all([
    prisma.thread.findUniqueOrThrow({
      where: { id: threadId },
    }),
    prisma.project.findUniqueOrThrow({
      where: { id: projectId },
    }),
  ])

  // Load last 20 non-summarized messages ordered by createdAt asc
  const dbMessages = await prisma.message.findMany({
    where: { threadId, summarized: false },
    orderBy: { createdAt: 'asc' },
    take: 20,
  })

  // Build system prompt
  let systemPrompt = buildDiscoverySystemPrompt()

  // Prepend thread summary if available
  if (thread.summary) {
    systemPrompt +=
      `\n\n## Conversation summary (earlier messages condensed)\n${thread.summary}`
  }

  // Convert DB messages to UIMessage format for convertToModelMessages
  const uiMessages: Omit<UIMessage, 'id'>[] = dbMessages.map((msg) => {
    const content = msg.content as UIMessage['parts']
    return {
      role: msg.role as UIMessage['role'],
      parts: Array.isArray(content) ? content : [],
    }
  })

  const messages = await convertToModelMessages(uiMessages)

  return { systemPrompt, messages, thread, project }
}
