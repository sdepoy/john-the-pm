import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import type { NextRequest } from 'next/server'

export const runtime = 'nodejs'

// Reset a stuck project back to discovery status so the user can start over.
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session?.user) return new Response('Unauthorized', { status: 401 })

  const { id: projectId } = await params

  const project = await prisma.project.findUnique({ where: { id: projectId } })
  if (!project) return new Response('Not found', { status: 404 })
  if (project.teamId !== session.user.teamId) return new Response('Forbidden', { status: 403 })

  // Only allow resetting a stuck generating project
  if (project.status !== 'generating') {
    return new Response('Project is not in generating state', { status: 409 })
  }

  await prisma.$transaction(async (tx) => {
    await tx.project.update({
      where: { id: projectId },
      data: { status: 'discovery', plan: undefined, name: 'New Project', objective: undefined },
    })
    // Clear thread messages so conversation restarts clean
    const threads = await tx.thread.findMany({ where: { projectId } })
    for (const thread of threads) {
      await tx.message.deleteMany({ where: { threadId: thread.id } })
    }
  })

  return Response.json({ reset: true })
}
