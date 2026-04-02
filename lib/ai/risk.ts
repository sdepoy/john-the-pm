import { prisma } from '@/lib/prisma'

export interface MilestoneRiskResult {
  milestoneId: string
  milestoneTitle: string
  targetDate: Date
  progressRatio: number
  timeRatio: number
  gap: number
  atRisk: boolean
}

export async function checkMilestoneRisk(projectId: string): Promise<MilestoneRiskResult[]> {
  // 1. Load project and milestones with tasks in parallel
  const [project, milestones] = await Promise.all([
    prisma.project.findUnique({ where: { id: projectId } }),
    prisma.milestone.findMany({
      where: { projectId },
      include: { tasks: { select: { id: true, status: true } } },
    }),
  ])

  if (!project) return []

  const now = Date.now()
  const projectCreatedAt = project.createdAt.getTime()

  // 2. Compute metrics for each milestone that has a targetDate
  const results: MilestoneRiskResult[] = []

  for (const milestone of milestones) {
    if (!milestone.targetDate) continue

    const totalTasks = milestone.tasks.length
    const completedTasks = milestone.tasks.filter((t) => t.status === 'complete').length
    const progressRatio = totalTasks === 0 ? 0 : completedTasks / totalTasks

    const totalTime = milestone.targetDate.getTime() - projectCreatedAt
    const elapsed = now - projectCreatedAt
    const timeRatio = totalTime <= 0 ? 1 : Math.min(elapsed / totalTime, 1)

    const gap = timeRatio - progressRatio
    const atRisk = gap > 0.2 || (totalTasks === 0 && timeRatio > 0.1)

    results.push({
      milestoneId: milestone.id,
      milestoneTitle: milestone.title,
      targetDate: milestone.targetDate,
      progressRatio,
      timeRatio,
      gap,
      atRisk,
    })
  }

  // 3. Persist at-risk milestones to project.context.risks with optimistic locking
  const risks = results.filter((r) => r.atRisk)

  let retries = 0
  while (retries < 3) {
    const currentProject = await prisma.project.findUnique({ where: { id: projectId } })
    if (!currentProject) break

    const current = (currentProject.context ?? {}) as Record<string, unknown>
    const newContext = { ...current, risks } as unknown as Record<string, unknown>
    const updated = await prisma.project.updateMany({
      where: { id: projectId, version: currentProject.version },
      data: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        context: newContext as any,
        version: { increment: 1 },
      },
    })

    if (updated.count > 0) break

    retries++
    await new Promise((r) => setTimeout(r, 50 * retries))
  }

  return results
}
