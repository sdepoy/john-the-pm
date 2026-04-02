import { checkMilestoneRisk } from '@/lib/ai/risk'
import { prisma } from '@/lib/prisma'

jest.mock('@/lib/prisma', () => ({
  prisma: {
    project: {
      findUnique: jest.fn(),
      updateMany: jest.fn(),
    },
    milestone: {
      findMany: jest.fn(),
    },
  },
}))

const mockPrisma = prisma as jest.Mocked<typeof prisma>

const PROJECT_CREATED_AT = new Date('2026-01-01T00:00:00Z')

const makeProject = () => ({
  id: 'proj-1',
  createdAt: PROJECT_CREATED_AT,
  context: {},
  version: 1,
})

const makeMilestone = (
  overrides: Partial<{
    id: string
    projectId: string
    title: string
    targetDate: Date | null
    status: string
    tasks: { id: string; status: string }[]
    createdAt: Date
    updatedAt: Date
  }>,
) => ({
  id: 'ms-1',
  projectId: 'proj-1',
  title: 'Milestone 1',
  targetDate: null,
  status: 'not_started',
  tasks: [] as { id: string; status: string }[],
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
})

function setupMocks(milestones: ReturnType<typeof makeMilestone>[]) {
  ;(mockPrisma.project.findUnique as jest.Mock)
    .mockResolvedValueOnce(makeProject()) // initial load in checkMilestoneRisk
    .mockResolvedValueOnce(makeProject()) // optimistic lock re-read
  ;(mockPrisma.milestone.findMany as jest.Mock).mockResolvedValue(milestones)
  ;(mockPrisma.project.updateMany as jest.Mock).mockResolvedValue({ count: 1 })
}

describe('checkMilestoneRisk', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.useFakeTimers({ now: Date.now() })
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('marks milestone at risk when 60% through time but only 30% tasks complete', async () => {
    // Project created: 2026-01-01. Target: 2026-11-01 (~304 days total)
    // Set "now" to 60% through: ~182 days after project start
    const targetDate = new Date('2026-11-01T00:00:00Z')
    const totalTime = targetDate.getTime() - PROJECT_CREATED_AT.getTime()
    const sixtyPercentTime = Math.floor(PROJECT_CREATED_AT.getTime() + totalTime * 0.6)
    jest.setSystemTime(sixtyPercentTime)

    const tasks = [
      { id: 't1', status: 'complete' },
      { id: 't2', status: 'complete' },
      { id: 't3', status: 'complete' },
      { id: 't4', status: 'in_progress' },
      { id: 't5', status: 'assigned' },
      { id: 't6', status: 'assigned' },
      { id: 't7', status: 'assigned' },
      { id: 't8', status: 'assigned' },
      { id: 't9', status: 'assigned' },
      { id: 't10', status: 'assigned' },
    ] // 3/10 = 30% complete

    setupMocks([makeMilestone({ targetDate, tasks })])

    const results = await checkMilestoneRisk('proj-1')

    expect(results).toHaveLength(1)
    const r = results[0]
    expect(r.progressRatio).toBeCloseTo(0.3)
    expect(r.timeRatio).toBeCloseTo(0.6)
    expect(r.gap).toBeCloseTo(0.3)
    expect(r.atRisk).toBe(true)
  })

  it('does not mark at risk when 0% through time', async () => {
    // Set now to project creation time (0% elapsed)
    jest.setSystemTime(PROJECT_CREATED_AT.getTime())

    const targetDate = new Date('2026-12-01T00:00:00Z')
    const tasks = [
      { id: 't1', status: 'assigned' },
      { id: 't2', status: 'assigned' },
    ]

    setupMocks([makeMilestone({ targetDate, tasks })])

    const results = await checkMilestoneRisk('proj-1')

    expect(results).toHaveLength(1)
    const r = results[0]
    expect(r.timeRatio).toBeCloseTo(0)
    expect(r.gap).toBeCloseTo(-0) // timeRatio(0) - progressRatio(0) = 0
    expect(r.atRisk).toBe(false)
  })

  it('marks milestone with no tasks as at risk when timeRatio > 0.1', async () => {
    // 20% through time, no tasks
    const targetDate = new Date('2026-12-01T00:00:00Z')
    const totalTime = targetDate.getTime() - PROJECT_CREATED_AT.getTime()
    const twentyPercentTime = Math.floor(PROJECT_CREATED_AT.getTime() + totalTime * 0.2)
    jest.setSystemTime(twentyPercentTime)

    setupMocks([makeMilestone({ targetDate, tasks: [] })])

    const results = await checkMilestoneRisk('proj-1')

    expect(results).toHaveLength(1)
    expect(results[0].atRisk).toBe(true)
  })

  it('does not mark milestone with no tasks as at risk when timeRatio <= 0.1', async () => {
    // 5% through time, no tasks
    const targetDate = new Date('2026-12-01T00:00:00Z')
    const totalTime = targetDate.getTime() - PROJECT_CREATED_AT.getTime()
    const fivePercentTime = Math.floor(PROJECT_CREATED_AT.getTime() + totalTime * 0.05)
    jest.setSystemTime(fivePercentTime)

    setupMocks([makeMilestone({ targetDate, tasks: [] })])

    const results = await checkMilestoneRisk('proj-1')

    expect(results).toHaveLength(1)
    expect(results[0].atRisk).toBe(false)
  })

  it('does not mark milestone as at risk when all tasks are complete', async () => {
    // 50% through time, 100% tasks complete
    const targetDate = new Date('2026-12-01T00:00:00Z')
    const totalTime = targetDate.getTime() - PROJECT_CREATED_AT.getTime()
    const halfwayTime = Math.floor(PROJECT_CREATED_AT.getTime() + totalTime * 0.5)
    jest.setSystemTime(halfwayTime)

    const tasks = [
      { id: 't1', status: 'complete' },
      { id: 't2', status: 'complete' },
      { id: 't3', status: 'complete' },
    ]

    setupMocks([makeMilestone({ targetDate, tasks })])

    const results = await checkMilestoneRisk('proj-1')

    expect(results).toHaveLength(1)
    const r = results[0]
    expect(r.progressRatio).toBeCloseTo(1)
    expect(r.gap).toBeCloseTo(-0.5) // timeRatio(0.5) - progressRatio(1.0) = -0.5
    expect(r.atRisk).toBe(false)
  })

  it('skips milestones with no targetDate', async () => {
    jest.setSystemTime(new Date('2026-06-01').getTime())

    setupMocks([
      makeMilestone({ id: 'ms-no-date', targetDate: null, tasks: [] }),
    ])

    const results = await checkMilestoneRisk('proj-1')

    expect(results).toHaveLength(0)
  })

  it('caps timeRatio at 1 for overdue milestones', async () => {
    // Set now well past the target date
    const targetDate = new Date('2026-03-01T00:00:00Z')
    jest.setSystemTime(new Date('2026-05-01T00:00:00Z').getTime()) // past due

    const tasks = [{ id: 't1', status: 'in_progress' }]

    setupMocks([makeMilestone({ targetDate, tasks })])

    const results = await checkMilestoneRisk('proj-1')

    expect(results).toHaveLength(1)
    expect(results[0].timeRatio).toBe(1) // capped at 1
    expect(results[0].atRisk).toBe(true)
  })
})
