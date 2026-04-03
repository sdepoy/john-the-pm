import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@/app/generated/prisma/client'
import { streamText, stepCountIs } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'
import { after } from 'next/server'
import { buildContext } from '@/lib/ai/context'
import { buildDiscoveryTools } from '@/lib/ai/tools'
import { buildPlanReviewTools } from '@/lib/ai/tools-plan-review'
import { buildPlanReviewSystemPrompt } from '@/lib/ai/plan-review'
import { buildMemberContext } from '@/lib/ai/memory'
import { buildMemberTools } from '@/lib/ai/tools-member'
import type { UIMessage } from 'ai'

export const runtime = 'nodejs'

// ─── Confirmation detection ───────────────────────────────────────────────────

const CONFIRMATION_WORDS = [
  'yes', 'yep', 'yeah', 'ok', 'okay', 'sure', 'do it', 'confirmed',
  'confirm', 'go ahead', 'please', 'sounds good', 'great',
]

function isConfirmation(text: string): boolean {
  const lower = text.toLowerCase().trim()
  return CONFIRMATION_WORDS.some(
    (w) => lower === w || lower.startsWith(w + ' ') || lower.endsWith(' ' + w),
  )
}

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

  // 6. streamText — select tools and system prompt by mode
  let planGenerationTriggered = false

  // ─── Member-chat mode ──────────────────────────────────────────────────────
  if (mode === 'member-chat') {
    // Handle abandoned proposal: if pending proposal exists and message is not a confirmation, clear it
    const currentThread = await prisma.thread.findUnique({
      where: { id: threadId },
      select: { pendingProposal: true },
    })

    let systemInjection = ''
    if (currentThread?.pendingProposal != null && !isConfirmation(userMessageText)) {
      // Clear the abandoned proposal
      await prisma.thread.update({
        where: { id: threadId },
        data: { pendingProposal: Prisma.DbNull },
      })
      systemInjection =
        '\n\n[SYSTEM NOTE: The previous pending proposal has been cancelled because the user sent a non-confirmation message. Acknowledge this briefly and move on.]'
    }

    const memberContext = await buildMemberContext(threadId, projectId, userId)
    const memberTools = buildMemberTools(userId, projectId, threadId)

    const memberResult = streamText({
      model: anthropic('claude-sonnet-4-6'),
      system: memberContext.systemPrompt + systemInjection,
      messages: [
        ...memberContext.messages,
        ...(userMessageText
          ? [{ role: 'user' as const, content: userMessageText }]
          : []),
      ],
      tools: memberTools,
      stopWhen: stepCountIs(5),
      onFinish: async (event) => {
        try {
          if (userMessageText && lastIncoming) {
            await prisma.message.create({
              data: {
                threadId,
                role: 'user',
                content: userMessageParts as object[],
              },
            })
          }

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
        } catch (err) {
          console.error('[chat:member-chat] onFinish persistence error:', err)
        }

        // Post-response: trigger risk check if a task update was confirmed
        const hadConfirmedUpdate = event.toolCalls?.some(
          (tc) => tc.toolName === 'confirmTaskUpdate',
        )

        if (hadConfirmedUpdate) {
          after(async () => {
            try {
              await fetch(
                `${process.env.NEXTAUTH_URL}/api/projects/${projectId}/risk`,
                {
                  method: 'POST',
                  headers: {
                    Authorization: `Bearer ${process.env.AUTH_SECRET}`,
                  },
                },
              )
            } catch {
              // Risk check is best-effort — ignore failures
            }
          })
        }
      },
    })

    return memberResult.toUIMessageStreamResponse()
  }

  // ─── Discovery / plan-review modes ────────────────────────────────────────

  let tools: ReturnType<typeof buildDiscoveryTools> | ReturnType<typeof buildPlanReviewTools>
  let effectiveSystemPrompt: string

  if (mode === 'plan-review') {
    tools = buildPlanReviewTools(projectId)
    const projectContext =
      project.context != null && typeof project.context === 'object'
        ? (project.context as Record<string, unknown>)
        : null
    effectiveSystemPrompt = buildPlanReviewSystemPrompt(project.plan, projectContext)
  } else {
    // discovery mode (default)
    tools = buildDiscoveryTools(projectId)
    effectiveSystemPrompt = systemPrompt
  }

  const result = streamText({
    model: anthropic('claude-sonnet-4-6'),
    system: effectiveSystemPrompt,
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
                Cookie: req.headers.get('cookie') ?? '',
              },
            },
          ).then(async (r) => {
            if (!r.ok) {
              const body = await r.text()
              console.error(`[chat] plan generation failed: ${r.status} ${body}`)
            } else {
              console.log('[chat] plan generation succeeded')
            }
          }).catch((err) => {
            console.error('[chat] plan generation fetch error:', err)
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
