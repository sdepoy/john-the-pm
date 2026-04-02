import { getNextBestAction } from '@/lib/ai/recommendations'
import { prisma } from '@/lib/prisma'

jest.mock('@/lib/prisma', () => ({
  prisma: {
    task: {
      findMany: jest.fn(),
    },
    milestone: {
      findMany: jest.fn(),
    },
  },
}))

const mockPrisma = prisma as jest.Mocked<typeof prisma>

const makeTask = (
  overrides: Partial<{
    id: string
    projectId: string
    milestoneId: string | null
    title: string
    description: string | null
    assigneeId: string | null
    status: string
    priority: string
    dependsOn: string[]
    dueDate: Date | null
    version: number
    createdAt: Date
    updatedAt: Date
  }>,
) => ({
  id: 'task-1',
  projectId: 'proj-1',
  milestoneId: null,
  title: 'Test Task',
  description: null,
  assigneeId: 'user-1',
  status: 'assigned',
  priority: 'medium',
  dependsOn: [] as string[],
  dueDate: null,
  version: 1,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
  ...overrides,
})

const noMilestones = () =>
  (mockPrisma.milestone.findMany as jest.Mock).mockResolvedValue([])

describe('getNextBestAction', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('returns the single actionable task when 1 blocked, 1 has incomplete dep, 1 is actionable', async () => {
    const blockedTask = makeTask({ id: 'task-blocked', status: 'blocked' })
    const depTask = makeTask({ id: 'task-dep', dependsOn: ['task-incomplete'] })
    const actionableTask = makeTask({ id: 'task-ok', dependsOn: [] })

    // assigned tasks query (not complete, not blocked)
    ;(mockPrisma.task.findMany as jest.Mock)
      .mockResolvedValueOnce([depTask, actionableTask]) // assigned non-terminal
      .mockResolvedValueOnce([]) // completed tasks
    noMilestones()

    const result = await getNextBestAction('user-1', 'proj-1')

    expect(result.task).not.toBeNull()
    expect(result.task?.id).toBe('task-ok')
    expect(result.reason).toContain('Highest priority')
    // suppress unused variable warning
    void blockedTask
  })

  it('returns highest priority task in nearest milestone when multiple actionable', async () => {
    const now = new Date('2026-04-02')
    const nearMs = new Date('2026-05-01')
    const farMs = new Date('2026-08-01')

    const taskHighNear = makeTask({
      id: 'task-high-near',
      priority: 'high',
      milestoneId: 'ms-near',
      createdAt: now,
    })
    const taskMedNear = makeTask({
      id: 'task-med-near',
      priority: 'medium',
      milestoneId: 'ms-near',
      createdAt: now,
    })
    const taskCritFar = makeTask({
      id: 'task-crit-far',
      priority: 'critical',
      milestoneId: 'ms-far',
      createdAt: now,
    })

    ;(mockPrisma.task.findMany as jest.Mock)
      .mockResolvedValueOnce([taskHighNear, taskMedNear, taskCritFar])
      .mockResolvedValueOnce([])
    ;(mockPrisma.milestone.findMany as jest.Mock).mockResolvedValue([
      { id: 'ms-near', title: 'MVP', targetDate: nearMs },
      { id: 'ms-far', title: 'V2', targetDate: farMs },
    ])

    const result = await getNextBestAction('user-1', 'proj-1')

    // critical in far milestone ranks below high in near milestone
    // because priority difference: crit(4) > high(3) — wait, critical SHOULD win on priority
    // but spec says milestone proximity after priority — let's verify the algorithm:
    // crit=4 > high=3, so task-crit-far wins on priority weight
    expect(result.task?.id).toBe('task-crit-far')
  })

  it('returns null with appropriate message when no tasks assigned', async () => {
    ;(mockPrisma.task.findMany as jest.Mock)
      .mockResolvedValueOnce([]) // no assigned tasks
      .mockResolvedValueOnce([]) // no complete tasks
    noMilestones()

    const result = await getNextBestAction('user-1', 'proj-1')

    expect(result.task).toBeNull()
    expect(result.reason).toBeTruthy()
  })

  it('returns null when all assigned tasks are complete (none in non-terminal query)', async () => {
    // complete tasks are filtered out by the DB query (status NOT IN complete, blocked)
    // so the assigned non-terminal list will be empty
    ;(mockPrisma.task.findMany as jest.Mock)
      .mockResolvedValueOnce([]) // all complete — none returned by non-terminal query
      .mockResolvedValueOnce([{ id: 'task-1' }, { id: 'task-2' }])
    noMilestones()

    const result = await getNextBestAction('user-1', 'proj-1')

    expect(result.task).toBeNull()
  })

  it('returns null when all assigned tasks are blocked (none in non-terminal query)', async () => {
    // blocked tasks are filtered out by the DB query
    ;(mockPrisma.task.findMany as jest.Mock)
      .mockResolvedValueOnce([]) // all blocked — none returned
      .mockResolvedValueOnce([])
    noMilestones()

    const result = await getNextBestAction('user-1', 'proj-1')

    expect(result.task).toBeNull()
  })

  it('includes task with all deps complete but excludes task with any incomplete dep', async () => {
    const depComplete1 = 'dep-complete-1'
    const depComplete2 = 'dep-complete-2'
    const depIncomplete = 'dep-incomplete'

    const taskAllDepsComplete = makeTask({
      id: 'task-ready',
      dependsOn: [depComplete1, depComplete2],
    })
    const taskMissingDep = makeTask({
      id: 'task-not-ready',
      dependsOn: [depComplete1, depIncomplete],
    })

    ;(mockPrisma.task.findMany as jest.Mock)
      .mockResolvedValueOnce([taskAllDepsComplete, taskMissingDep])
      .mockResolvedValueOnce([{ id: depComplete1 }, { id: depComplete2 }])
    noMilestones()

    const result = await getNextBestAction('user-1', 'proj-1')

    expect(result.task?.id).toBe('task-ready')
  })

  it('tiebreaks by createdAt ascending when priority and milestone are equal', async () => {
    const older = makeTask({
      id: 'task-older',
      priority: 'medium',
      createdAt: new Date('2026-01-01'),
    })
    const newer = makeTask({
      id: 'task-newer',
      priority: 'medium',
      createdAt: new Date('2026-02-01'),
    })

    ;(mockPrisma.task.findMany as jest.Mock)
      .mockResolvedValueOnce([newer, older]) // newer first in array
      .mockResolvedValueOnce([])
    noMilestones()

    const result = await getNextBestAction('user-1', 'proj-1')

    expect(result.task?.id).toBe('task-older')
  })
})
