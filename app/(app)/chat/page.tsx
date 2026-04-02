import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import ChatView from './ChatView'
import type { UIMessage } from 'ai'

export default async function ChatPage() {
  const session = await auth()

  if (!session?.user?.id) {
    redirect('/auth/signin')
  }

  const teamId = session.user.teamId
  if (!teamId) {
    redirect('/onboarding')
  }

  const userId = session.user.id

  // Find active project for the user's team
  const project = await prisma.project.findFirst({
    where: { teamId, status: 'active' },
    orderBy: { updatedAt: 'desc' },
  })

  if (!project) {
    // Fall back to any non-archived project
    const anyProject = await prisma.project.findFirst({
      where: { teamId, status: { notIn: ['archived'] } },
      orderBy: { updatedAt: 'desc' },
    })
    if (!anyProject) {
      redirect('/discovery')
    }
  }

  const activeProject = project ?? (await prisma.project.findFirst({
    where: { teamId, status: { notIn: ['archived'] } },
    orderBy: { updatedAt: 'desc' },
  }))

  if (!activeProject) {
    redirect('/discovery')
  }

  // Find or create thread for this user + project
  let thread = await prisma.thread.findUnique({
    where: { projectId_userId: { projectId: activeProject.id, userId } },
  })

  if (!thread) {
    thread = await prisma.thread.create({
      data: { projectId: activeProject.id, userId },
    })
  }

  // Load last 20 non-summarized messages for initial hydration
  const dbMessages = await prisma.message.findMany({
    where: { threadId: thread.id, summarized: false },
    orderBy: { createdAt: 'asc' },
    take: 20,
  })

  // Convert DB messages to UIMessage shape for hydration
  const initialMessages: UIMessage[] = dbMessages.map((msg) => ({
    id: msg.id,
    role: msg.role as 'user' | 'assistant',
    parts: (Array.isArray(msg.content)
      ? (msg.content as Array<{ type: string; text?: string }>)
          .filter((p) => p.type === 'text')
          .map((p) => ({ type: 'text' as const, text: p.text ?? '' }))
      : []) as UIMessage['parts'],
    createdAt: msg.createdAt,
  }))

  const hasSummary = (thread.summaryAt ?? 0) > 0

  return (
    <ChatView
      projectId={activeProject.id}
      threadId={thread.id}
      projectName={activeProject.name}
      initialMessages={initialMessages}
      hasSummary={hasSummary}
      userName={session.user.name ?? session.user.email ?? 'Team member'}
    />
  )
}
