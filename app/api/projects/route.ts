import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return new Response('Unauthorized', { status: 401 })
  }

  // Admin only
  if (session.user.teamRole !== 'admin') {
    return new Response('Forbidden: admin only', { status: 403 })
  }

  const teamId = session.user.teamId
  if (!teamId) {
    return new Response('No team associated with this account', { status: 400 })
  }

  const body = (await req.json()) as { name?: string; objective?: string }
  const { name, objective } = body

  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return new Response('name is required', { status: 400 })
  }

  // Enforce one active/discovery project per team at the application level
  const existingActive = await prisma.project.findFirst({
    where: {
      teamId,
      status: { in: ['discovery', 'draft', 'active', 'generating'] },
    },
    select: { id: true, name: true, status: true },
  })

  if (existingActive) {
    return Response.json(
      {
        error: `Team already has an active project: "${existingActive.name}" (${existingActive.status}). Archive it before creating a new one.`,
        existingProjectId: existingActive.id,
      },
      { status: 409 },
    )
  }

  // Create project + initial thread for the admin user in a transaction
  const userId = session.user.id

  const [project, thread] = await prisma.$transaction(async (tx) => {
    const newProject = await tx.project.create({
      data: {
        teamId,
        name: name.trim(),
        objective: objective?.trim() ?? null,
        status: 'discovery',
      },
    })

    const newThread = await tx.thread.create({
      data: {
        projectId: newProject.id,
        userId,
      },
    })

    return [newProject, newThread]
  })

  return Response.json({ project, thread }, { status: 201 })
}
