import { prisma } from '@/lib/prisma'
import type { Task } from '@/app/generated/prisma/client'

const PRIORITY_WEIGHT: Record<string, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
}

export async function getNextBestAction(
  userId: string,
  projectId: string,
): Promise<{ task: Task | null; reason: string }> {
  // 1. Load assigned, non-terminal tasks for this user
  const [assignedTasks, completedTasks, milestones] = await Promise.all([
    prisma.task.findMany({
      where: {
        projectId,
        assigneeId: userId,
        status: { notIn: ['complete', 'blocked'] },
      },
    }),
    prisma.task.findMany({
      where: { projectId, status: 'complete' },
      select: { id: true },
    }),
    prisma.milestone.findMany({
      where: { projectId },
      select: { id: true, title: true, targetDate: true },
    }),
  ])

  // 2. Build the complete set
  const completeSet = new Set(completedTasks.map((t) => t.id))

  // 3. Filter to actionable tasks (all deps complete)
  const actionable = assignedTasks.filter((t) =>
    t.dependsOn.every((depId) => completeSet.has(depId)),
  )

  if (actionable.length === 0) {
    return {
      task: null,
      reason: 'All your tasks have incomplete dependencies or are blocked.',
    }
  }

  // 4. Build milestone lookup for proximity scoring
  const FAR_FUTURE = new Date(8640000000000000) // max date
  const milestoneMap = new Map(
    milestones.map((m) => [m.id, { title: m.title, targetDate: m.targetDate ?? FAR_FUTURE }]),
  )

  // 5. Rank
  const ranked = [...actionable].sort((a, b) => {
    const aPriority = PRIORITY_WEIGHT[a.priority] ?? 1
    const bPriority = PRIORITY_WEIGHT[b.priority] ?? 1

    if (bPriority !== aPriority) return bPriority - aPriority

    const aDate = a.milestoneId
      ? (milestoneMap.get(a.milestoneId)?.targetDate ?? FAR_FUTURE)
      : FAR_FUTURE
    const bDate = b.milestoneId
      ? (milestoneMap.get(b.milestoneId)?.targetDate ?? FAR_FUTURE)
      : FAR_FUTURE

    const aTime = aDate.getTime()
    const bTime = bDate.getTime()

    if (aTime !== bTime) return aTime - bTime

    return a.createdAt.getTime() - b.createdAt.getTime()
  })

  const top = ranked[0]

  // 6. Build reason string
  let reason = `Highest priority task`
  if (top.milestoneId) {
    const ms = milestoneMap.get(top.milestoneId)
    if (ms) {
      const dateStr = ms.targetDate.getTime() === FAR_FUTURE.getTime()
        ? 'no due date'
        : ms.targetDate.toISOString().split('T')[0]
      reason += ` in the nearest milestone (${ms.title}, due ${dateStr})`
    }
  }

  return { task: top as Task, reason }
}
