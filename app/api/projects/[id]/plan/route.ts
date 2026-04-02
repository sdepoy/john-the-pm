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

  const context =
    project.context != null && typeof project.context === 'object'
      ? (project.context as Record<string, unknown>)
      : {}

  const completedLayers = Array.isArray(context.completedLayers)
    ? context.completedLayers
    : []
  const discoveredTasks = Array.isArray(context.discoveredTasks)
    ? context.discoveredTasks
    : []
  const discoveredMilestones = Array.isArray(context.discoveredMilestones)
    ? context.discoveredMilestones
    : []

  const discoveryTranscript = `
Project: ${project.name}
Objective: ${project.objective ?? 'Not specified'}

## Discovery Layer Summaries
${(completedLayers as Array<{ layerId: string; summary: string }>)
  .map((l) => `### ${l.layerId}\n${l.summary}`)
  .join('\n\n')}

## Discovered Tasks
${
  discoveredTasks.length === 0
    ? 'None captured yet.'
    : (
        discoveredTasks as Array<{
          title: string
          description: string
          priority: string
          milestoneHint?: string
        }>
      )
        .map(
          (t) =>
            `- [${t.priority}] ${t.title}: ${t.description}${t.milestoneHint ? ` (milestone: ${t.milestoneHint})` : ''}`,
        )
        .join('\n')
}

## Discovered Milestones
${
  discoveredMilestones.length === 0
    ? 'None captured yet.'
    : (
        discoveredMilestones as Array<{
          title: string
          targetDate?: string
          successCriteria?: string
        }>
      )
        .map(
          (m) =>
            `- ${m.title}${m.targetDate ? ` (target: ${m.targetDate})` : ''}${m.successCriteria ? `\n  Success: ${m.successCriteria}` : ''}`,
        )
        .join('\n')
}
`.trim()

  const result = await generateText({
    model: anthropic('claude-sonnet-4-6'),
    output: Output.object({ schema: ProjectPlanSchema }),
    system: `You are an expert product manager. Given the discovery interview transcript below, generate a comprehensive project plan in the exact JSON structure requested.

Be specific and concrete. Derive milestones, tasks, priorities, and risks directly from what was discussed.
If any information is missing or ambiguous, make reasonable PM assumptions and note them in openRisks or nextDiscoveryQuestions.
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
