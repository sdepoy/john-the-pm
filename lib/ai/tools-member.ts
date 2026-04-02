import { tool } from 'ai'
import { z } from 'zod'
import { Prisma } from '@/app/generated/prisma/client'
import { prisma } from '@/lib/prisma'
import { getNextBestAction } from '@/lib/ai/recommendations'

export function buildMemberTools(userId: string, projectId: string, threadId: string) {
  return {
    proposeTaskUpdate: tool({
      description:
        'Propose a task status change. Stores the proposal and returns a confirmation request to the user. Does NOT write to the database until confirmTaskUpdate is called.',
      inputSchema: z.object({
        taskId: z.string().describe('ID of the task to update'),
        newStatus: z
          .enum(['unassigned', 'assigned', 'in_progress', 'blocked', 'complete'])
          .describe('New status for the task'),
        newPriority: z
          .enum(['critical', 'high', 'medium', 'low'])
          .optional()
          .describe('New priority (optional)'),
        reason: z.string().optional().describe('Reason for the change'),
      }),
      execute: async ({ taskId, newStatus, newPriority, reason }) => {
        const task = await prisma.task.findUnique({
          where: { id: taskId },
          include: { assignee: true },
        })

        if (!task) {
          return { success: false, error: `Task ${taskId} not found.` }
        }

        if (task.assigneeId !== userId) {
          const assigneeName = task.assignee?.name ?? task.assignee?.email ?? 'another team member'
          return {
            success: false,
            error: `Task "${task.title}" is assigned to ${assigneeName}. You can only update your own tasks.`,
          }
        }

        const proposal = {
          type: 'task_update',
          taskId,
          taskTitle: task.title,
          newStatus,
          newPriority: newPriority ?? null,
          reason: reason ?? null,
          proposedAt: Date.now(),
        }

        await prisma.thread.update({
          where: { id: threadId },
          data: { pendingProposal: proposal },
        })

        const parts = [`Mark "${task.title}" as **${newStatus}**`]
        if (newPriority) parts.push(`set priority to **${newPriority}**`)
        if (reason) parts.push(`reason: ${reason}`)

        return {
          success: true,
          proposal,
          message: `I'll ${parts.join(', ')}. Shall I do that?`,
        }
      },
    }),

    confirmTaskUpdate: tool({
      description:
        'Execute the pending proposal after the user confirms, or cancel it if the user declines.',
      inputSchema: z.object({
        confirmed: z.boolean().describe('Whether the user confirmed the proposal'),
      }),
      execute: async ({ confirmed }) => {
        if (!confirmed) {
          await prisma.thread.update({
            where: { id: threadId },
            data: { pendingProposal: Prisma.DbNull },
          })
          return { success: true, message: 'Update cancelled.' }
        }

        const thread = await prisma.thread.findUnique({
          where: { id: threadId },
          select: { pendingProposal: true },
        })

        if (!thread?.pendingProposal) {
          return { success: false, error: 'No pending proposal found.' }
        }

        const proposal = thread.pendingProposal as Record<string, unknown>

        if (proposal.type === 'blocker') {
          return confirmBlocker(proposal, threadId, projectId)
        }

        // task_update
        const taskId = proposal.taskId as string
        const newStatus = proposal.newStatus as string
        const newPriority = proposal.newPriority as string | null

        let retries = 0
        while (retries < 3) {
          const task = await prisma.task.findUnique({ where: { id: taskId } })
          if (!task) {
            return { success: false, error: 'Task not found.' }
          }

          const updateData: Record<string, unknown> = {
            status: newStatus,
            version: { increment: 1 },
          }
          if (newPriority) updateData.priority = newPriority

          const updated = await prisma.task.updateMany({
            where: { id: taskId, version: task.version },
            data: updateData,
          })

          if (updated.count > 0) {
            // Touch projects table to fire pg_notify trigger
            await prisma.project.update({
              where: { id: projectId },
              data: { updatedAt: new Date() },
            })

            await prisma.thread.update({
              where: { id: threadId },
              data: { pendingProposal: Prisma.DbNull },
            })

            return {
              success: true,
              message: `Done — "${task.title}" is now **${newStatus}**.`,
            }
          }

          // Version conflict — read current state and retry
          const current = await prisma.task.findUnique({
            where: { id: taskId },
            include: { assignee: true },
          })
          const updaterName = current?.assignee?.name ?? current?.assignee?.email ?? 'someone'
          retries++
          if (retries === 3) {
            return {
              success: false,
              error: `Couldn't save the update — ${updaterName} just changed this task (status: ${current?.status}). Do you still want to update it?`,
            }
          }
          await new Promise((r) => setTimeout(r, 50 * retries))
        }

        return { success: false, error: 'Update failed after retries.' }
      },
    }),

    reportBlocker: tool({
      description:
        'Propose marking a task as blocked with a blocker description. Goes through the confirm-before-write loop.',
      inputSchema: z.object({
        taskId: z.string().describe('ID of the blocked task'),
        blockerDescription: z.string().describe('What is blocking this task'),
      }),
      execute: async ({ taskId, blockerDescription }) => {
        const task = await prisma.task.findUnique({ where: { id: taskId } })

        if (!task) {
          return { success: false, error: `Task ${taskId} not found.` }
        }

        if (task.assigneeId !== userId) {
          return {
            success: false,
            error: `Task "${task.title}" is not assigned to you.`,
          }
        }

        const proposal = {
          type: 'blocker',
          taskId,
          taskTitle: task.title,
          blockerDescription,
          proposedAt: Date.now(),
        }

        await prisma.thread.update({
          where: { id: threadId },
          data: { pendingProposal: proposal },
        })

        return {
          success: true,
          proposal,
          message: `I'll mark "${task.title}" as blocked and note: "${blockerDescription}". Shall I do that?`,
        }
      },
    }),

    getMyTasks: tool({
      description: 'Returns all tasks assigned to the current user in this project.',
      inputSchema: z.object({}),
      execute: async () => {
        const tasks = await prisma.task.findMany({
          where: { projectId, assigneeId: userId },
          orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
        })

        if (tasks.length === 0) {
          return { tasks: [], message: 'No tasks are currently assigned to you.' }
        }

        return {
          tasks: tasks.map((t) => ({
            id: t.id,
            title: t.title,
            status: t.status,
            priority: t.priority,
            dueDate: t.dueDate?.toISOString() ?? null,
            dependsOn: t.dependsOn,
          })),
        }
      },
    }),

    getRecommendation: tool({
      description: 'Get a prioritized recommendation for what this team member should work on next.',
      inputSchema: z.object({}),
      execute: async () => {
        const result = await getNextBestAction(userId, projectId)
        if (!result.task) {
          return { message: result.reason }
        }
        return {
          task: {
            id: result.task.id,
            title: result.task.title,
            priority: result.task.priority,
            status: result.task.status,
          },
          reason: result.reason,
        }
      },
    }),
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function confirmBlocker(
  proposal: Record<string, unknown>,
  threadId: string,
  projectId: string,
) {
  const taskId = proposal.taskId as string
  const blockerDescription = proposal.blockerDescription as string

  let retries = 0
  while (retries < 3) {
    const task = await prisma.task.findUnique({ where: { id: taskId } })
    if (!task) return { success: false, error: 'Task not found.' }

    const updated = await prisma.task.updateMany({
      where: { id: taskId, version: task.version },
      data: { status: 'blocked', version: { increment: 1 } },
    })

    if (updated.count > 0) {
      // Touch projects table to fire pg_notify
      await prisma.project.update({
        where: { id: projectId },
        data: { updatedAt: new Date() },
      })

      await prisma.thread.update({
        where: { id: threadId },
        data: { pendingProposal: Prisma.DbNull },
      })

      return {
        success: true,
        message: `Done — "${task.title}" is marked as blocked. Blocker: "${blockerDescription}". Do you want to escalate this or loop in the team?`,
      }
    }

    retries++
    await new Promise((r) => setTimeout(r, 50 * retries))
  }

  return { success: false, error: 'Failed to update task after retries.' }
}
