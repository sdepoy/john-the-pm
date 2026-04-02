import { maybeCondense } from '@/lib/ai/memory'
import { prisma } from '@/lib/prisma'

jest.mock('@/lib/prisma', () => ({
  prisma: {
    thread: {
      findUniqueOrThrow: jest.fn(),
      update: jest.fn(),
    },
    message: {
      findMany: jest.fn(),
      updateMany: jest.fn(),
    },
  },
}))

jest.mock('@ai-sdk/anthropic', () => ({
  anthropic: jest.fn().mockReturnValue('mock-model'),
}))

jest.mock('ai', () => ({
  ...jest.requireActual('ai'),
  generateText: jest.fn().mockResolvedValue({ text: 'Summary of earlier conversation.' }),
  convertToModelMessages: jest.fn().mockImplementation((msgs: unknown[]) => msgs),
}))

jest.mock('@/lib/ai/member-chat', () => ({
  buildMemberChatSystemPrompt: jest.fn().mockResolvedValue('System prompt'),
}))

const mockPrisma = prisma as jest.Mocked<typeof prisma>

const makeMessage = (id: string, summarized = false, createdAt = new Date()) => ({
  id,
  threadId: 'thread-1',
  role: 'user',
  content: [{ type: 'text', text: `Message ${id}` }],
  tokenCount: 50,
  summarized,
  createdAt,
})

describe('maybeCondense', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(mockPrisma.thread.findUniqueOrThrow as jest.Mock).mockResolvedValue({
      id: 'thread-1',
      summary: null,
      summaryAt: null,
      pendingProposal: null,
    })
    ;(mockPrisma.thread.update as jest.Mock).mockResolvedValue({})
    ;(mockPrisma.message.updateMany as jest.Mock).mockResolvedValue({ count: 5 })
  })

  it('does nothing if fewer than 20 non-summarized messages', async () => {
    // Return only 15 non-summarized messages — nothing to condense
    const messages = Array.from({ length: 15 }, (_, i) => makeMessage(`msg-${i}`))
    ;(mockPrisma.message.findMany as jest.Mock).mockResolvedValue(messages)

    await maybeCondense('thread-1')

    expect(mockPrisma.thread.update).not.toHaveBeenCalled()
  })

  it('summarizes messages beyond the last 20 when count exceeds threshold', async () => {
    // Return 25 non-summarized messages
    const messages = Array.from({ length: 25 }, (_, i) => makeMessage(`msg-${i}`))
    ;(mockPrisma.message.findMany as jest.Mock).mockResolvedValue(messages)

    await maybeCondense('thread-1')

    expect(mockPrisma.thread.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          summary: expect.any(String),
        }),
      }),
    )
  })

  it('marks older messages as summarized=true', async () => {
    const messages = Array.from({ length: 25 }, (_, i) => makeMessage(`msg-${i}`))
    ;(mockPrisma.message.findMany as jest.Mock).mockResolvedValue(messages)

    await maybeCondense('thread-1')

    expect(mockPrisma.message.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { summarized: true },
      }),
    )
  })

  it('does not delete summarized messages', async () => {
    const messages = Array.from({ length: 25 }, (_, i) => makeMessage(`msg-${i}`))
    ;(mockPrisma.message.findMany as jest.Mock).mockResolvedValue(messages)

    await maybeCondense('thread-1')

    // message.delete should never be called
    expect((mockPrisma.message as jest.Mocked<typeof mockPrisma.message> & { delete?: jest.Mock }).delete).toBeUndefined()
  })
})
