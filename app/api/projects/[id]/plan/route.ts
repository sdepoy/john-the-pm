import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { generateText, Output } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'
import { ProjectPlanSchema } from '@/lib/schemas/project-plan'
import type { NextRequest } from 'next/server'

export const runtime = 'nodejs'

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session?.user) {
    return new Response('Unauthorized', { status: 401 })
  }

  const { id: projectId } = await params

  const project = await prisma.project.findUnique({
    where: { id: projectId },
  })

  if (!project) {
    return new Response('Project not found', { status: 404 })
  }

  // Verify team access
  if (project.teamId !== session.user.teamId) {
    return new Response('Forbidden', { status: 403 })
  }

  if (project.status !== 'discovery' && project.status !== 'generating') {
    return new Response(
      `Cannot generate plan: project status is '${project.status}'`,
      { status: 409 },
    )
  }

  // Load discovery conversation from all threads for this project
  const threads = await prisma.thread.findMany({
    where: { projectId },
    include: {
      messages: {
        orderBy: { createdAt: 'asc' },
      },
    },
  })

  const conversationLines: string[] = []
  for (const thread of threads) {
    for (const msg of thread.messages) {
      const parts = Array.isArray(msg.content)
        ? (msg.content as Array<{ type: string; text?: string }>)
        : []
      const text = parts
        .filter((p) => p.type === 'text' && typeof p.text === 'string')
        .map((p) => p.text as string)
        .join(' ')
        .trim()
      if (text) {
        conversationLines.push(`${msg.role.toUpperCase()}: ${text}`)
      }
    }
  }

  const conversationTranscript = conversationLines.length > 0
    ? conversationLines.join('\n\n')
    : 'No conversation transcript available.'

  const discoveryTranscript = `Project: ${project.name}

## Discovery Conversation
${conversationTranscript}`.trim()

  const result = await generateText({
    model: anthropic('claude-sonnet-4-6'),
    output: Output.object({ schema: ProjectPlanSchema }),
    system: `You are an expert product manager. Given the discovery conversation below, generate a comprehensive project plan in the exact JSON structure requested.

Be specific and concrete. Derive milestones and tasks directly from what was discussed.
Infer task priorities yourself based on dependencies, complexity, and what must ship first.
If any information is missing or ambiguous, make reasonable PM assumptions and note them in openRisks.
Today's date is ${new Date().toISOString().split('T')[0]}.`,
    prompt: discoveryTranscript,
  })

  const plan = result.experimental_output

  // Persist the plan and update status to 'draft'
  const updatedProject = await prisma.project.update({
    where: { id: projectId },
    data: {
      plan: plan as object,
      status: 'draft',
    },
  })

  return Response.json({ plan, project: updatedProject })
}
