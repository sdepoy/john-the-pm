import { z } from 'zod'

export const TaskSchema = z.object({
  title: z.string(),
  description: z.string().optional(),
  priority: z.enum(['critical', 'high', 'medium', 'low']),
  dependsOn: z.array(z.string()).default([]), // titles of tasks this depends on
  dueDate: z.string().optional(), // ISO date string
})

export const MilestoneSchema = z.object({
  title: z.string(),
  targetDate: z.string().optional(), // ISO date string
  status: z
    .enum(['not_started', 'in_progress', 'at_risk', 'complete'])
    .default('not_started'),
  tasks: z.array(TaskSchema).default([]),
})

export const ProjectPlanSchema = z.object({
  name: z.string(),
  objective: z.string(),
  milestones: z.array(MilestoneSchema),
})

export type ProjectPlan = z.infer<typeof ProjectPlanSchema>
export type Milestone = z.infer<typeof MilestoneSchema>
export type Task = z.infer<typeof TaskSchema>
