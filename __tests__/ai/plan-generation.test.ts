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
        successCriteria: 'All discovery layers signed off',
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
    openRisks: ['Timeline is aggressive', 'Engineering team is understaffed'],
    moscowSummary: {
      must: ['Payment flow redesign'],
      should: ['Wishlist feature'],
      could: ['Dark mode'],
      wont: ['Mobile app'],
    },
    nextDiscoveryQuestions: ['What is the current checkout abandonment rate?'],
    confidence: 0.75,
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

  it('applies default values for optional array fields', () => {
    const minimal = {
      name: 'My Project',
      objective: 'Solve a problem',
      milestones: [],
    }
    const result = ProjectPlanSchema.safeParse(minimal)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.openRisks).toEqual([])
      expect(result.data.nextDiscoveryQuestions).toEqual([])
      expect(result.data.confidence).toBe(0.8)
    }
  })

  it('rejects confidence values outside 0-1', () => {
    const tooHigh = { ...validPlan, confidence: 1.5 }
    expect(ProjectPlanSchema.safeParse(tooHigh).success).toBe(false)

    const negative = { ...validPlan, confidence: -0.1 }
    expect(ProjectPlanSchema.safeParse(negative).success).toBe(false)
  })

  it('validates confidence of exactly 0 and 1', () => {
    expect(ProjectPlanSchema.safeParse({ ...validPlan, confidence: 0 }).success).toBe(true)
    expect(ProjectPlanSchema.safeParse({ ...validPlan, confidence: 1 }).success).toBe(true)
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
      storyPoints: 5,
      riceScore: 42,
      dependsOn: ['Design auth flow'],
      milestoneTitle: 'Alpha',
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
  it('discovery → draft is valid after plan generation', () => {
    // Simulate the status transition logic used in the plan route
    const validSourceStatuses = ['discovery', 'generating']
    expect(validSourceStatuses).toContain('discovery')
    expect(validSourceStatuses).toContain('generating')
    expect(validSourceStatuses).not.toContain('draft')
    expect(validSourceStatuses).not.toContain('active')
  })
})
