import { tool } from 'ai'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { ProjectPlanSchema } from '@/lib/schemas/project-plan'

export function buildPlanReviewTools(projectId: string) {
  return {
    revisePlan: tool({
      description:
        'Submit a revised version of the project plan. Call this after the admin has confirmed the change. Include the complete updated plan JSON.',
      inputSchema: z.object({
        description: z
          .string()
          .describe('A concise description of what was changed, e.g. "Moved auth milestone to week 2"'),
        updatedPlan: z
          .unknown()
          .describe('The complete updated plan JSON conforming to the ProjectPlanSchema'),
      }),
      execute: async ({ description, updatedPlan }) => {
        // Validate the plan against ProjectPlanSchema
        const parseResult = ProjectPlanSchema.safeParse(updatedPlan)
        if (!parseResult.success) {
          return {
            success: false,
            error: 'Plan validation failed',
            details: parseResult.error.flatten(),
          }
        }

        const validatedPlan = parseResult.data

        // Optimistic locking: retry up to 3 times
        let retries = 0
        while (retries < 3) {
          const current = await prisma.project.findUnique({
            where: { id: projectId },
          })

          if (!current) {
            return { success: false, error: `Project ${projectId} not found` }
          }

          const result = await prisma.project.updateMany({
            where: { id: projectId, version: current.version },
            data: {
              plan: validatedPlan as object,
              version: { increment: 1 },
            },
          })

          if (result.count > 0) {
            return {
              success: true,
              description,
              milestonesCount: validatedPlan.milestones.length,
              tasksCount: validatedPlan.milestones.reduce(
                (sum, m) => sum + m.tasks.length,
                0,
              ),
            }
          }

          retries++
          await new Promise((r) => setTimeout(r, 50 * retries))
        }

        return {
          success: false,
          error: 'Optimistic lock failed after 3 retries — please try again',
        }
      },
    }),
  }
}
