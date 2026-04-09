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

  const project = await prisma.project.findUnique({ where: { id: projectId } })

  if (!project) {
    return new Response('Project not found', { status: 404 })
  }

  if (project.teamId !== session.user.teamId) {
    return new Response('Forbidden', { status: 403 })
  }

  if (project.status !== 'discovery' && project.status !== 'generating') {
    return new Response(
      `Cannot generate plan: project status is '${project.status}'`,
      { status: 409 },
    )
  }

  // Load the actual discovery conversation to use as generation input
  const threads = await prisma.thread.findMany({
    where: { projectId },
    include: { messages: { orderBy: { createdAt: 'asc' } } },
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
      if (text) conversationLines.push(`${msg.role.toUpperCase()}: ${text}`)
    }
  }

  const transcript =
    conversationLines.length > 0
      ? conversationLines.join('\n\n')
      : 'No conversation transcript available.'

  // Generate structured plan from the conversation
  const result = await generateText({
    model: anthropic('claude-sonnet-4-6'),
    output: Output.object({ schema: ProjectPlanSchema }),
    system: `You are an expert product manager. Given the discovery conversation below, generate a project plan.

Be specific and concrete. Derive milestones and tasks directly from what was discussed.
Infer task priorities based on dependencies, complexity, and what must ship first.
If anything is ambiguous, make reasonable PM assumptions.
Today's date is ${new Date().toISOString().split('T')[0]}.`,
    prompt: `Project: ${project.name}\n\n${transcript}`,
  })

  const plan = result.experimental_output

  if (!plan) {
    return new Response('Plan generation failed', { status: 500 })
  }

  // Write plan, milestones, and tasks to DB in one transaction → status 'active'
  await prisma.$transaction(async (tx) => {
    // Update project with plan JSON and activate
    await tx.project.update({
      where: { id: projectId },
      data: {
        plan: plan as object,
        name: plan.name,
        objective: plan.objective,
        status: 'active',
      },
    })

    // Clear discovery messages from all threads so member chat starts clean
    const threads = await tx.thread.findMany({ where: { projectId } })
    for (const thread of threads) {
      await tx.message.deleteMany({ where: { threadId: thread.id } })
    }

    // Create milestones
    const createdMilestones = await Promise.all(
      plan.milestones.map((m) =>
        tx.milestone.create({
          data: {
            projectId,
            title: m.title,
            targetDate: m.targetDate ? new Date(m.targetDate) : null,
            status: m.status,
          },
        }),
      ),
    )

    const milestoneIdByTitle = new Map(createdMilestones.map((m) => [m.title, m.id]))

    // First pass: create all tasks without dependsOn
    const allTasksWithMeta: Array<{ dbId: string; title: string; dependsOnTitles: string[] }> = []

    for (const milestone of plan.milestones) {
      const milestoneId = milestoneIdByTitle.get(milestone.title)!
      for (const task of milestone.tasks) {
        const created = await tx.task.create({
          data: {
            projectId,
            milestoneId,
            title: task.title,
            description: task.description ?? null,
            priority: task.priority,
            status: 'unassigned',
            assigneeId: null,
            dependsOn: [],
            dueDate: task.dueDate ? new Date(task.dueDate) : null,
          },
        })
        allTasksWithMeta.push({
          dbId: created.id,
          title: task.title,
          dependsOnTitles: task.dependsOn ?? [],
        })
      }
    }

    // Second pass: resolve dependsOn titles → IDs
    const taskIdByTitle = new Map(allTasksWithMeta.map((t) => [t.title, t.dbId]))
    await Promise.all(
      allTasksWithMeta
        .filter((t) => t.dependsOnTitles.length > 0)
        .map((t) => {
          const resolvedIds = t.dependsOnTitles
            .map((title) => taskIdByTitle.get(title))
            .filter((id): id is string => id !== undefined)
          return tx.task.update({
            where: { id: t.dbId },
            data: { dependsOn: resolvedIds },
          })
        }),
    )
  })

  console.log(`[plan] project ${projectId} activated with ${plan.milestones.length} milestones`)

  return Response.json({ status: 'active', name: plan.name })
}
