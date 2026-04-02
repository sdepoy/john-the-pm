'use server'

import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@/app/generated/prisma/client'
import { redirect } from 'next/navigation'

export async function approvePlan(projectId: string): Promise<void> {
  const session = await auth()
  if (!session?.user?.id) {
    redirect('/auth/signin')
  }

  const baseUrl = process.env.NEXT_PUBLIC_URL ?? 'http://localhost:3000'

  const res = await fetch(`${baseUrl}/api/projects/${projectId}/approve`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    // Server Actions run server-side, so we need to forward credentials.
    // Since this runs in a Server Action context we can pass the session cookie
    // via the request headers. Use next/headers to get cookies.
    cache: 'no-store',
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Plan approval failed: ${res.status} ${text}`)
  }

  redirect('/project')
}

export async function rejectPlan(projectId: string): Promise<void> {
  const session = await auth()
  if (!session?.user?.id) {
    redirect('/auth/signin')
  }

  if (session.user.teamRole !== 'admin') {
    throw new Error('Forbidden: admin only')
  }

  // Reset to discovery status and clear the plan
  await prisma.project.update({
    where: { id: projectId },
    data: {
      status: 'discovery',
      plan: Prisma.DbNull,
    },
  })

  redirect('/discovery')
}
