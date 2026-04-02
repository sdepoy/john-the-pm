import { tool } from 'ai'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'

// ─── captureDiscoveryLayer ────────────────────────────────────────────────────

export const captureDiscoveryLayer = (projectId: string) =>
  tool({
    description:
      'Capture a completed discovery layer. Call this when the depth signal for the current layer is satisfied.',
    inputSchema: z.object({
      layerId: z.string().describe('The ID of the discovery layer being captured'),
      summary: z
        .string()
        .describe('A concise 2-3 sentence summary of what was learned in this layer'),
    }),
    execute: async ({ layerId, summary }) => {
      let retries = 0
      while (retries < 3) {
        const project = await prisma.project.findUnique({
          where: { id: projectId },
        })
        if (!project) throw new Error(`Project ${projectId} not found`)

        const ctx =
          project.context != null && typeof project.context === 'object'
            ? (project.context as Record<string, unknown>)
            : {}

        const existingLayers: Array<{ layerId: string; summary: string }> =
          Array.isArray(ctx.completedLayers)
            ? (ctx.completedLayers as Array<{ layerId: string; summary: string }>)
            : []

        // Avoid duplicates
        const alreadyCaptured = existingLayers.some((l) => l.layerId === layerId)
        const updatedLayers = alreadyCaptured
          ? existingLayers.map((l) => (l.layerId === layerId ? { layerId, summary } : l))
          : [...existingLayers, { layerId, summary }]

        const newContext = {
          ...ctx,
          completedLayers: updatedLayers,
        }

        const updated = await prisma.project.updateMany({
          where: { id: projectId, version: project.version },
          data: { context: newContext, version: { increment: 1 } },
        })

        if (updated.count > 0) {
          return { captured: true, layerId }
        }
        retries++
        await new Promise((r) => setTimeout(r, 50 * retries))
      }
      return { captured: false, layerId, error: 'Optimistic lock failed after 3 retries' }
    },
  })

// ─── captureTask ──────────────────────────────────────────────────────────────

export const captureTask = (projectId: string) =>
  tool({
    description:
      'Capture a task or user story discovered during the conversation.',
    inputSchema: z.object({
      title: z.string().describe('Short title for the task'),
      description: z.string().describe('What this task involves'),
      priority: z
        .enum(['critical', 'high', 'medium', 'low'])
        .describe('Task priority'),
      milestoneHint: z
        .string()
        .optional()
        .describe('The milestone this task likely belongs to (if known)'),
    }),
    execute: async ({ title, description, priority, milestoneHint }) => {
      let retries = 0
      while (retries < 3) {
        const project = await prisma.project.findUnique({
          where: { id: projectId },
        })
        if (!project) throw new Error(`Project ${projectId} not found`)

        const ctx =
          project.context != null && typeof project.context === 'object'
            ? (project.context as Record<string, unknown>)
            : {}

        const existingTasks: Array<{
          title: string
          description: string
          priority: string
          milestoneHint?: string
        }> = Array.isArray(ctx.discoveredTasks)
          ? (ctx.discoveredTasks as Array<{
              title: string
              description: string
              priority: string
              milestoneHint?: string
            }>)
          : []

        // Upsert by title
        const alreadyExists = existingTasks.some(
          (t) => t.title.toLowerCase() === title.toLowerCase(),
        )
        const updatedTasks = alreadyExists
          ? existingTasks.map((t) =>
              t.title.toLowerCase() === title.toLowerCase()
                ? { title, description, priority, milestoneHint }
                : t,
            )
          : [...existingTasks, { title, description, priority, milestoneHint }]

        const newContext = { ...ctx, discoveredTasks: updatedTasks }

        const updated = await prisma.project.updateMany({
          where: { id: projectId, version: project.version },
          data: { context: newContext, version: { increment: 1 } },
        })

        if (updated.count > 0) {
          return { captured: true, title }
        }
        retries++
        await new Promise((r) => setTimeout(r, 50 * retries))
      }
      return { captured: false, title, error: 'Optimistic lock failed after 3 retries' }
    },
  })

// ─── captureMilestone ─────────────────────────────────────────────────────────

export const captureMilestone = (projectId: string) =>
  tool({
    description: 'Capture a milestone or major deliverable discovered during the conversation.',
    inputSchema: z.object({
      title: z.string().describe('Milestone title'),
      targetDate: z
        .string()
        .optional()
        .describe('Target completion date (ISO format, e.g. 2025-06-30)'),
      successCriteria: z
        .string()
        .optional()
        .describe('What must be true for this milestone to be considered complete'),
    }),
    execute: async ({ title, targetDate, successCriteria }) => {
      let retries = 0
      while (retries < 3) {
        const project = await prisma.project.findUnique({
          where: { id: projectId },
        })
        if (!project) throw new Error(`Project ${projectId} not found`)

        const ctx =
          project.context != null && typeof project.context === 'object'
            ? (project.context as Record<string, unknown>)
            : {}

        const existingMilestones: Array<{
          title: string
          targetDate?: string
          successCriteria?: string
        }> = Array.isArray(ctx.discoveredMilestones)
          ? (ctx.discoveredMilestones as Array<{
              title: string
              targetDate?: string
              successCriteria?: string
            }>)
          : []

        // Upsert by title
        const alreadyExists = existingMilestones.some(
          (m) => m.title.toLowerCase() === title.toLowerCase(),
        )
        const updatedMilestones = alreadyExists
          ? existingMilestones.map((m) =>
              m.title.toLowerCase() === title.toLowerCase()
                ? { title, targetDate, successCriteria }
                : m,
            )
          : [...existingMilestones, { title, targetDate, successCriteria }]

        const newContext = { ...ctx, discoveredMilestones: updatedMilestones }

        const updated = await prisma.project.updateMany({
          where: { id: projectId, version: project.version },
          data: { context: newContext, version: { increment: 1 } },
        })

        if (updated.count > 0) {
          return { captured: true, title }
        }
        retries++
        await new Promise((r) => setTimeout(r, 50 * retries))
      }
      return { captured: false, title, error: 'Optimistic lock failed after 3 retries' }
    },
  })

// ─── proposePlanGeneration ────────────────────────────────────────────────────

export const proposePlanGeneration = (projectId: string) =>
  tool({
    description:
      'Signal that all discovery layers are complete and propose generating the full project plan. Call this only when all 6 layers are complete.',
    inputSchema: z.object({}),
    execute: async () => {
      // Mark project as generating — the route handler detects this tool call
      // and triggers actual plan generation asynchronously
      await prisma.project.update({
        where: { id: projectId },
        data: { status: 'generating' },
      })
      return { ready: true }
    },
  })

// ─── Factory: build all tools for a given project ────────────────────────────

export function buildDiscoveryTools(projectId: string) {
  return {
    captureDiscoveryLayer: captureDiscoveryLayer(projectId),
    captureTask: captureTask(projectId),
    captureMilestone: captureMilestone(projectId),
    proposePlanGeneration: proposePlanGeneration(projectId),
  }
}
