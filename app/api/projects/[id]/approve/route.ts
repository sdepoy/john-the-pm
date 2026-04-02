import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { ProjectPlanSchema } from '@/lib/schemas/project-plan'
import { Resend } from 'resend'
import type { NextRequest } from 'next/server'

export const runtime = 'nodejs'

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  // 1. Auth check — admin only
  const session = await auth()
  if (!session?.user?.id) {
    return new Response('Unauthorized', { status: 401 })
  }

  if (session.user.teamRole !== 'admin') {
    return new Response('Forbidden: admin only', { status: 403 })
  }

  const { id: projectId } = await params

  // 2. Load project, verify status === 'draft'
  const project = await prisma.project.findUnique({
    where: { id: projectId },
  })

  if (!project) {
    return new Response('Project not found', { status: 404 })
  }

  if (project.teamId !== session.user.teamId) {
    return new Response('Forbidden', { status: 403 })
  }

  if (project.status !== 'draft') {
    return Response.json(
      { error: `Cannot approve: project status is '${project.status}', expected 'draft'` },
      { status: 400 },
    )
  }

  // 3. Parse plan against ProjectPlanSchema
  const planParseResult = ProjectPlanSchema.safeParse(project.plan)
  if (!planParseResult.success) {
    return Response.json(
      {
        error: 'Plan validation failed — regenerate the plan before approving',
        details: planParseResult.error.flatten(),
      },
      { status: 400 },
    )
  }

  const plan = planParseResult.data

  // 4. Transaction: create milestones + tasks + update project status
  const { milestones: createdMilestones, tasks: createdTasks } =
    await prisma.$transaction(async (tx) => {
      // 4a. Create all Milestone records
      const milestones = await Promise.all(
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

      // Build milestone title → id map
      const milestoneIdByTitle = new Map<string, string>(
        milestones.map((m) => [m.title, m.id]),
      )

      // 4b. First pass: create all tasks without dependsOn
      const allTasksWithMeta: Array<{
        dbId: string
        title: string
        dependsOnTitles: string[]
      }> = []

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
              dependsOn: [], // resolve after all tasks created
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

      // Build task title → id map
      const taskIdByTitle = new Map<string, string>(
        allTasksWithMeta.map((t) => [t.title, t.dbId]),
      )

      // 4c. Second pass: resolve dependsOn titles → IDs
      const tasksWithDeps = allTasksWithMeta.filter(
        (t) => t.dependsOnTitles.length > 0,
      )
      const tasks = await Promise.all(
        allTasksWithMeta.map(async (t) => {
          if (t.dependsOnTitles.length === 0) {
            return tx.task.findUnique({ where: { id: t.dbId } })
          }
          const resolvedIds = t.dependsOnTitles
            .map((title) => taskIdByTitle.get(title))
            .filter((id): id is string => id !== undefined)
          return tx.task.update({
            where: { id: t.dbId },
            data: { dependsOn: resolvedIds },
          })
        }),
      )

      // Suppress unused variable warning
      void tasksWithDeps

      // 4d. Update project status with optimistic locking
      let retries = 0
      let updatedProject = null
      while (retries < 3) {
        const current = await tx.project.findUnique({
          where: { id: projectId },
        })
        if (!current) throw new Error('Project disappeared during transaction')

        const result = await tx.project.updateMany({
          where: { id: projectId, version: current.version },
          data: { status: 'active', version: { increment: 1 } },
        })

        if (result.count > 0) {
          updatedProject = await tx.project.findUnique({ where: { id: projectId } })
          break
        }
        retries++
        await new Promise((r) => setTimeout(r, 50 * retries))
      }

      if (!updatedProject) {
        throw new Error('Conflict updating project status — please try again')
      }

      return { milestones, tasks: tasks.filter(Boolean), project: updatedProject }
    })

  // 5. Send notification emails to non-admin team members (best-effort)
  try {
    const resend = new Resend(process.env.AUTH_RESEND_KEY)

    const teamMembers = await prisma.teamMember.findMany({
      where: { teamId: session.user.teamId!, role: { not: 'admin' } },
      include: { user: { select: { email: true, name: true } } },
    })

    const emailAddresses = teamMembers
      .map((m) => m.user.email)
      .filter((e): e is string => e != null)

    if (emailAddresses.length > 0) {
      await resend.emails.send({
        from: process.env.EMAIL_FROM ?? 'John the PM <noreply@johnthepm.app>',
        to: emailAddresses,
        subject: `Project plan approved: ${plan.name}`,
        html: `<p>Hi there,</p>
<p>The project plan for <strong>${plan.name}</strong> is now live.</p>
<p>Check in with John to get your assignment and see what's on your plate.</p>
<p>— John the PM</p>`,
      })
    }
  } catch (err) {
    console.error('[approve] Resend notification failed (non-fatal):', err)
  }

  // 6. Return results
  const finalProject = await prisma.project.findUnique({ where: { id: projectId } })

  return Response.json(
    {
      project: finalProject,
      milestones: createdMilestones,
      tasks: createdTasks,
    },
    { status: 200 },
  )
}
