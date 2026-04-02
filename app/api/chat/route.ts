import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { streamText, stepCountIs } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'
import { buildContext } from '@/lib/ai/context'
import { buildDiscoveryTools } from '@/lib/ai/tools'
import type { UIMessage } from 'ai'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  // 1. Auth check
  const session = await auth()
  if (!session?.user?.id) {
    return new Response('Unauthorized', { status: 401 })
  }

  // 2. Parse body: { messages, threadId, projectId, mode? }
  const body = (await req.json()) as {
    messages: UIMessage[]
    threadId?: string
    projectId: string
    mode?: string
  }

  const { projectId, mode = 'discovery' } = body
  const incomingMessages: UIMessage[] = body.messages ?? []

  if (!projectId) {
    return new Response('projectId is required', { status: 400 })
  }

  // 3. Verify project belongs to user's team
  const project = await prisma.project.findUnique({
    where: { id: projectId },
  })

  if (!project) {
    return new Response('Project not found', { status: 404 })
  }

  if (project.teamId !== session.user.teamId) {
    return new Response('Forbidden', { status: 403 })
  }

  // 4. Get or create thread (UNIQUE on projectId+userId)
  const userId = session.user.id
  let thread = await prisma.thread.findUnique({
    where: { projectId_userId: { projectId, userId } },
  })

  if (!thread) {
    thread = await prisma.thread.create({
      data: { projectId, userId },
    })
  }

  const threadId = thread.id

  // 5. Build context (existing messages + system prompt)
  const { systemPrompt, messages: contextMessages } = await buildContext(
    threadId,
    projectId,
  )

  // The last message from the client is the new user message.
  // We use contextMessages (from DB) as the full history and append the
  // latest user message on top.
  const lastIncoming = incomingMessages[incomingMessages.length - 1]
  const userMessageParts = lastIncoming?.parts ?? []
  const userMessageText = userMessageParts
    .filter((p) => p.type === 'text')
    .map((p) => (p as { type: 'text'; text: string }).text)
    .join('')

  // Combine DB history with the new user message
  const messagesForModel = [
    ...contextMessages,
    ...(userMessageText
      ? [{ role: 'user' as const, content: userMessageText }]
      : []),
  ]

  // 6. streamText with discovery tools
  let planGenerationTriggered = false

  const tools = mode === 'discovery' ? buildDiscoveryTools(projectId) : {}

  const result = streamText({
    model: anthropic('claude-haiku-4-5'),
    system: systemPrompt,
    messages: messagesForModel,
    tools,
    stopWhen: stepCountIs(5),
    onFinish: async (event) => {
      try {
        // Persist user message
        if (userMessageText && lastIncoming) {
          await prisma.message.create({
            data: {
              threadId,
              role: 'user',
              content: userMessageParts as object[],
            },
          })
        }

        // Persist assistant response
        const assistantContent = event.content
        if (assistantContent && assistantContent.length > 0) {
          await prisma.message.create({
            data: {
              threadId,
              role: 'assistant',
              content: assistantContent as unknown as object[],
            },
          })
        }

        // Check if proposePlanGeneration was called
        const hadPlanProposal = event.toolCalls?.some(
          (tc) => tc.toolName === 'proposePlanGeneration',
        )

        if (hadPlanProposal && !planGenerationTriggered) {
          planGenerationTriggered = true
          // Fire-and-forget plan generation
          fetch(
            `${process.env.NEXT_PUBLIC_URL ?? 'http://localhost:3000'}/api/projects/${projectId}/plan`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                // Pass auth cookie so the internal request is authenticated
                Cookie: req.headers.get('cookie') ?? '',
              },
            },
          ).catch((err) => {
            console.error('[chat] plan generation fire-and-forget failed:', err)
          })
        }
      } catch (err) {
        console.error('[chat] onFinish persistence error:', err)
      }
    },
  })

  // 7. Return streaming response
  return result.toUIMessageStreamResponse()
}
