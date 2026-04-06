import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import DiscoveryChat from './DiscoveryChat'

export default async function DiscoveryPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/auth/signin')

  const { id: userId, teamId, teamRole } = session.user as {
    id: string
    teamId?: string
    teamRole?: string
  }

  if (!teamId) redirect('/onboarding')
  if (teamRole !== 'admin') redirect('/project')

  // Find existing in-progress project (discovery or draft status)
  let project = await prisma.project.findFirst({
    where: { teamId, status: { in: ['discovery', 'generating'] } },
    orderBy: { updatedAt: 'desc' },
  })

  // If project is active/complete, send admin to the project view
  if (!project) {
    const activeProject = await prisma.project.findFirst({
      where: { teamId, status: { in: ['active', 'complete'] } },
    })
    if (activeProject) redirect('/project')
  }

  // Auto-create a project for this team if none exists
  if (!project) {
    project = await prisma.project.create({
      data: {
        teamId,
        name: 'New Project',
        status: 'discovery',
        version: 1,
      },
    })
  }

  // Find or create thread for this admin user
  let thread = await prisma.thread.findUnique({
    where: { projectId_userId: { projectId: project.id, userId } },
  })
  if (!thread) {
    thread = await prisma.thread.create({
      data: { projectId: project.id, userId },
    })
  }

  return <DiscoveryChat key={project.id} projectId={project.id} threadId={thread.id} />
}
