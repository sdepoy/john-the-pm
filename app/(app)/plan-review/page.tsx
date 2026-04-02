import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import PlanReviewChat from './PlanReviewChat'
import type { ProjectPlan } from '@/lib/schemas/project-plan'

export default async function PlanReviewPage() {
  const session = await auth()

  if (!session?.user?.id) {
    redirect('/auth/signin')
  }

  // Non-admins go to /project
  if (session.user.teamRole !== 'admin') {
    redirect('/project')
  }

  const teamId = session.user.teamId
  if (!teamId) {
    redirect('/onboarding')
  }

  // Find draft project for this team
  const project = await prisma.project.findFirst({
    where: { teamId, status: 'draft' },
    orderBy: { updatedAt: 'desc' },
  })

  // No draft project → back to discovery
  if (!project) {
    redirect('/discovery')
  }

  // Get or create a thread for plan-review
  const userId = session.user.id
  let thread = await prisma.thread.findUnique({
    where: { projectId_userId: { projectId: project.id, userId } },
  })

  if (!thread) {
    thread = await prisma.thread.create({
      data: { projectId: project.id, userId },
    })
  }

  const plan = project.plan as ProjectPlan | null

  return (
    <PlanReviewChat
      projectId={project.id}
      threadId={thread.id}
      projectName={project.name}
      plan={plan}
    />
  )
}
