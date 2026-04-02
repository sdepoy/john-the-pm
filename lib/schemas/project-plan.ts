import { z } from 'zod'

export const TaskSchema = z.object({
  title: z.string(),
  description: z.string().optional(),
  priority: z.enum(['critical', 'high', 'medium', 'low']),
  storyPoints: z.number().optional(),
  riceScore: z.number().optional(),
  dependsOn: z.array(z.string()).default([]), // titles of tasks this depends on
  milestoneTitle: z.string().optional(),
  dueDate: z.string().optional(), // ISO date string
})

export const MilestoneSchema = z.object({
  title: z.string(),
  targetDate: z.string().optional(), // ISO date string
  status: z
    .enum(['not_started', 'in_progress', 'at_risk', 'complete'])
    .default('not_started'),
  successCriteria: z.string().optional(),
  tasks: z.array(TaskSchema).default([]),
})

export const ProjectPlanSchema = z.object({
  name: z.string(),
  objective: z.string(),
  milestones: z.array(MilestoneSchema),
  openRisks: z.array(z.string()).default([]),
  moscowSummary: z
    .object({
      must: z.array(z.string()).default([]),
      should: z.array(z.string()).default([]),
      could: z.array(z.string()).default([]),
      wont: z.array(z.string()).default([]),
    })
    .optional(),
  nextDiscoveryQuestions: z.array(z.string()).default([]),
  confidence: z.number().min(0).max(1).default(0.8),
})

export type ProjectPlan = z.infer<typeof ProjectPlanSchema>
export type Milestone = z.infer<typeof MilestoneSchema>
export type Task = z.infer<typeof TaskSchema>
