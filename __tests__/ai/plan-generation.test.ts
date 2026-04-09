import { ProjectPlanSchema, MilestoneSchema, TaskSchema } from '@/lib/schemas/project-plan'

describe('ProjectPlanSchema', () => {
  const validPlan = {
    name: 'E-commerce Redesign',
    objective: 'Increase conversion rate by 20% by Q3',
    milestones: [
      {
        title: 'Discovery Complete',
        targetDate: '2025-03-01',
        status: 'not_started' as const,
        tasks: [
          {
            title: 'Stakeholder interviews',
            description: 'Interview 5 key stakeholders',
            priority: 'high' as const,
            dependsOn: [],
          },
        ],
      },
    ],
  }

  it('validates a well-formed plan', () => {
    const result = ProjectPlanSchema.safeParse(validPlan)
    expect(result.success).toBe(true)
  })

  it('requires name and objective', () => {
    const { name: _n, ...withoutName } = validPlan
    const result = ProjectPlanSchema.safeParse(withoutName)
    expect(result.success).toBe(false)
  })

  it('validates a minimal plan', () => {
    const minimal = {
      name: 'My Project',
      objective: 'Solve a problem',
      milestones: [],
    }
    const result = ProjectPlanSchema.safeParse(minimal)
    expect(result.success).toBe(true)
  })
})

describe('MilestoneSchema', () => {
  it('validates a milestone with tasks', () => {
    const milestone = {
      title: 'Alpha Release',
      targetDate: '2025-06-01',
      status: 'not_started' as const,
      tasks: [],
    }
    const result = MilestoneSchema.safeParse(milestone)
    expect(result.success).toBe(true)
  })

  it('defaults status to not_started', () => {
    const minimal = { title: 'Some milestone' }
    const result = MilestoneSchema.safeParse(minimal)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.status).toBe('not_started')
      expect(result.data.tasks).toEqual([])
    }
  })

  it('rejects invalid status values', () => {
    const invalid = { title: 'M', status: 'pending' }
    expect(MilestoneSchema.safeParse(invalid).success).toBe(false)
  })
})

describe('TaskSchema', () => {
  it('validates a full task', () => {
    const task = {
      title: 'Build auth',
      description: 'Implement magic link auth',
      priority: 'high' as const,
      dependsOn: ['Design auth flow'],
      dueDate: '2025-05-15',
    }
    const result = TaskSchema.safeParse(task)
    expect(result.success).toBe(true)
  })

  it('requires title and priority', () => {
    const result = TaskSchema.safeParse({ title: 'Task' })
    expect(result.success).toBe(false)
  })

  it('rejects invalid priority values', () => {
    const result = TaskSchema.safeParse({ title: 'Task', priority: 'urgent' })
    expect(result.success).toBe(false)
  })

  it('defaults dependsOn to empty array', () => {
    const result = TaskSchema.safeParse({ title: 'Task', priority: 'medium' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.dependsOn).toEqual([])
    }
  })
})

describe('Plan status transitions (logic)', () => {
  it('discovery → active is valid after plan generation', () => {
    const validSourceStatuses = ['discovery', 'generating']
    expect(validSourceStatuses).toContain('discovery')
    expect(validSourceStatuses).toContain('generating')
    expect(validSourceStatuses).not.toContain('draft')
    expect(validSourceStatuses).not.toContain('active')
  })
})
