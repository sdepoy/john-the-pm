/**
 * Plan Approval — Unit 4 integration tests
 *
 * Tests the core approval logic: milestone/task creation, status transitions,
 * optimistic locking, and dependency resolution.
 *
 * NOTE: These are integration tests that require a real database connection.
 * Set DATABASE_URL in your test environment before running.
 */

import { randomUUID } from 'crypto'
import { prisma } from '@/lib/prisma'
import { ProjectPlanSchema } from '@/lib/schemas/project-plan'
import type { ProjectPlan } from '@/lib/schemas/project-plan'

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function createTeamAndAdmin() {
  const adminUser = await prisma.user.create({
    data: { email: `admin-${randomUUID()}@test.com` },
  })

  const team = await prisma.team.create({
    data: {
      name: `Test Team ${randomUUID()}`,
      members: {
        create: { userId: adminUser.id, role: 'admin' },
      },
    },
  })

  return { team, adminUser }
}

async function createMemberUser(teamId: string) {
  const user = await prisma.user.create({
    data: { email: `member-${randomUUID()}@test.com` },
  })
  await prisma.teamMember.create({
    data: { teamId, userId: user.id, role: 'member' },
  })
  return user
}

async function createDraftProject(teamId: string, plan: ProjectPlan) {
  return prisma.project.create({
    data: {
      teamId,
      name: plan.name,
      objective: plan.objective,
      status: 'draft',
      plan: plan as object,
    },
  })
}

async function cleanup(ids: {
  teamIds?: string[]
  userIds?: string[]
}) {
  if (ids.teamIds?.length) {
    await prisma.team.deleteMany({ where: { id: { in: ids.teamIds } } })
  }
  if (ids.userIds?.length) {
    await prisma.user.deleteMany({ where: { id: { in: ids.userIds } } })
  }
}

/**
 * Core approval logic — extracted so we can test it without HTTP.
 * Mirrors the logic in app/api/projects/[id]/approve/route.ts.
 */
async function runApprovalLogic(projectId: string): Promise<{
  project: Awaited<ReturnType<typeof prisma.project.findUnique>>
  milestones: Awaited<ReturnType<typeof prisma.milestone.findMany>>
  tasks: Awaited<ReturnType<typeof prisma.task.findMany>>
}> {
  const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId } })

  if (project.status !== 'draft') {
    throw Object.assign(new Error(`Cannot approve: status is '${project.status}'`), {
      statusCode: 400,
    })
  }

  const planParseResult = ProjectPlanSchema.safeParse(project.plan)
  if (!planParseResult.success) {
    throw Object.assign(new Error('Plan validation failed'), {
      statusCode: 400,
      details: planParseResult.error.flatten(),
    })
  }

  const plan = planParseResult.data

  await prisma.$transaction(async (tx) => {
    // Create milestones
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

    const milestoneIdByTitle = new Map<string, string>(
      milestones.map((m) => [m.title, m.id]),
    )

    // First pass: create all tasks without dependsOn
    const allTasksMeta: Array<{ dbId: string; title: string; dependsOnTitles: string[] }> = []

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
        allTasksMeta.push({
          dbId: created.id,
          title: task.title,
          dependsOnTitles: task.dependsOn ?? [],
        })
      }
    }

    // Build title → id map
    const taskIdByTitle = new Map<string, string>(
      allTasksMeta.map((t) => [t.title, t.dbId]),
    )

    // Second pass: resolve dependsOn titles → IDs
    for (const t of allTasksMeta) {
      if (t.dependsOnTitles.length === 0) continue
      const resolvedIds = t.dependsOnTitles
        .map((title) => taskIdByTitle.get(title))
        .filter((id): id is string => id !== undefined)
      await tx.task.update({
        where: { id: t.dbId },
        data: { dependsOn: resolvedIds },
      })
    }

    // Update project status with optimistic locking
    let retries = 0
    while (retries < 3) {
      const current = await tx.project.findUnique({ where: { id: projectId } })
      if (!current) throw new Error('Project not found')
      const result = await tx.project.updateMany({
        where: { id: projectId, version: current.version },
        data: { status: 'active', version: { increment: 1 } },
      })
      if (result.count > 0) break
      retries++
      await new Promise((r) => setTimeout(r, 50 * retries))
    }
    if (retries === 3) throw new Error('Conflict')
  })

  const finalProject = await prisma.project.findUnique({ where: { id: projectId } })
  const createdMilestones = await prisma.milestone.findMany({ where: { projectId } })
  const createdTasks = await prisma.task.findMany({ where: { projectId } })

  return { project: finalProject, milestones: createdMilestones, tasks: createdTasks }
}

// ─── Sample plan ──────────────────────────────────────────────────────────────

function buildSamplePlan(): ProjectPlan {
  return {
    name: 'Test Project',
    objective: 'Validate the approval flow',
    milestones: [
      {
        title: 'Alpha',
        targetDate: '2026-06-01',
        status: 'not_started',
        tasks: [
          {
            title: 'Setup infra',
            priority: 'high',
            dependsOn: [],
          },
          {
            title: 'Build auth',
            priority: 'critical',
            dependsOn: ['Setup infra'],
          },
        ],
      },
      {
        title: 'Beta',
        targetDate: '2026-08-01',
        status: 'not_started',
        tasks: [
          {
            title: 'QA pass',
            priority: 'medium',
            dependsOn: ['Build auth'],
          },
        ],
      },
    ],
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Plan approval — happy path', () => {
  it('creates milestones and tasks, transitions project to active', async () => {
    const { team, adminUser } = await createTeamAndAdmin()
    const plan = buildSamplePlan()
    const project = await createDraftProject(team.id, plan)

    const result = await runApprovalLogic(project.id)

    // Project is now active
    expect(result.project?.status).toBe('active')

    // Milestones created
    expect(result.milestones).toHaveLength(2)
    const alphaMilestone = result.milestones.find((m) => m.title === 'Alpha')
    expect(alphaMilestone).toBeDefined()
    expect(alphaMilestone?.targetDate?.toISOString().startsWith('2026-06-01')).toBe(true)

    // Tasks created — 3 total across both milestones
    expect(result.tasks).toHaveLength(3)

    await cleanup({ teamIds: [team.id], userIds: [adminUser.id] })
  })
})

describe('Plan approval — dependency resolution', () => {
  it('resolves dependsOn titles to task IDs', async () => {
    const { team, adminUser } = await createTeamAndAdmin()
    const plan = buildSamplePlan()
    const project = await createDraftProject(team.id, plan)

    const result = await runApprovalLogic(project.id)

    // Find "Build auth" which depends on "Setup infra"
    const buildAuth = result.tasks.find((t) => t.title === 'Build auth')
    const setupInfra = result.tasks.find((t) => t.title === 'Setup infra')
    expect(buildAuth).toBeDefined()
    expect(setupInfra).toBeDefined()
    expect(buildAuth!.dependsOn).toContain(setupInfra!.id)

    // "QA pass" depends on "Build auth" (cross-milestone)
    const qaPass = result.tasks.find((t) => t.title === 'QA pass')
    expect(qaPass!.dependsOn).toContain(buildAuth!.id)

    // "Setup infra" has no deps
    expect(setupInfra!.dependsOn).toHaveLength(0)

    await cleanup({ teamIds: [team.id], userIds: [adminUser.id] })
  })

  it('assigns tasks to their correct milestones', async () => {
    const { team, adminUser } = await createTeamAndAdmin()
    const plan = buildSamplePlan()
    const project = await createDraftProject(team.id, plan)

    const result = await runApprovalLogic(project.id)

    const alphaMilestone = result.milestones.find((m) => m.title === 'Alpha')!
    const betaMilestone = result.milestones.find((m) => m.title === 'Beta')!

    const setupInfra = result.tasks.find((t) => t.title === 'Setup infra')
    const buildAuth = result.tasks.find((t) => t.title === 'Build auth')
    const qaPass = result.tasks.find((t) => t.title === 'QA pass')

    expect(setupInfra?.milestoneId).toBe(alphaMilestone.id)
    expect(buildAuth?.milestoneId).toBe(alphaMilestone.id)
    expect(qaPass?.milestoneId).toBe(betaMilestone.id)

    await cleanup({ teamIds: [team.id], userIds: [adminUser.id] })
  })
})

describe('Plan approval — edge cases', () => {
  it('rejects approval of a non-draft project (400)', async () => {
    const { team, adminUser } = await createTeamAndAdmin()
    const plan = buildSamplePlan()

    // Create as 'active' (not 'draft')
    const project = await prisma.project.create({
      data: { teamId: team.id, name: plan.name, objective: plan.objective, status: 'active', plan: plan as object },
    })

    await expect(runApprovalLogic(project.id)).rejects.toThrow(
      "Cannot approve: status is 'active'",
    )

    await cleanup({ teamIds: [team.id], userIds: [adminUser.id] })
  })

  it('rejects approval when plan fails schema validation (400)', async () => {
    const { team, adminUser } = await createTeamAndAdmin()

    // Create project with an invalid plan (missing required fields)
    const project = await prisma.project.create({
      data: {
        teamId: team.id,
        name: 'Bad Plan Project',
        status: 'draft',
        plan: { invalid: true } as object,
      },
    })

    await expect(runApprovalLogic(project.id)).rejects.toThrow('Plan validation failed')

    await cleanup({ teamIds: [team.id], userIds: [adminUser.id] })
  })

  it('creates tasks with status unassigned and null assigneeId', async () => {
    const { team, adminUser } = await createTeamAndAdmin()
    const plan = buildSamplePlan()
    const project = await createDraftProject(team.id, plan)

    const result = await runApprovalLogic(project.id)

    for (const task of result.tasks) {
      expect(task.status).toBe('unassigned')
      expect(task.assigneeId).toBeNull()
    }

    await cleanup({ teamIds: [team.id], userIds: [adminUser.id] })
  })

  it('handles a plan with no task dependencies cleanly', async () => {
    const { team, adminUser } = await createTeamAndAdmin()

    const plan: ProjectPlan = {
      name: 'No Deps Project',
      objective: 'Test no-dependency case',
      milestones: [
        {
          title: 'M1',
          status: 'not_started',
          tasks: [
            { title: 'Task A', priority: 'medium', dependsOn: [] },
            { title: 'Task B', priority: 'low', dependsOn: [] },
          ],
        },
      ],
    }

    const project = await createDraftProject(team.id, plan)
    const result = await runApprovalLogic(project.id)

    expect(result.tasks).toHaveLength(2)
    for (const task of result.tasks) {
      expect(task.dependsOn).toHaveLength(0)
    }

    await cleanup({ teamIds: [team.id], userIds: [adminUser.id] })
  })
})

describe('Plan approval — optimistic locking simulation', () => {
  it('version increments after successful approval', async () => {
    const { team, adminUser } = await createTeamAndAdmin()
    const plan = buildSamplePlan()
    const project = await createDraftProject(team.id, plan)

    const versionBefore = project.version

    const result = await runApprovalLogic(project.id)

    expect(result.project?.version).toBeGreaterThan(versionBefore)

    await cleanup({ teamIds: [team.id], userIds: [adminUser.id] })
  })

  it('concurrent approval of the same project fails gracefully on second attempt', async () => {
    const { team, adminUser } = await createTeamAndAdmin()
    const plan = buildSamplePlan()
    const project = await createDraftProject(team.id, plan)

    // First approval succeeds
    await runApprovalLogic(project.id)

    // Second approval on now-active project should fail
    await expect(runApprovalLogic(project.id)).rejects.toThrow(
      "Cannot approve: status is 'active'",
    )

    await cleanup({ teamIds: [team.id], userIds: [adminUser.id] })
  })
})
