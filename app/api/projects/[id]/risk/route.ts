import { checkMilestoneRisk } from '@/lib/ai/risk'

export const runtime = 'nodejs'

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  // Verify internal caller via Authorization header
  const authHeader = req.headers.get('Authorization')
  const expected = `Bearer ${process.env.AUTH_SECRET}`

  if (!authHeader || authHeader !== expected) {
    return new Response('Unauthorized', { status: 401 })
  }

  const { id: projectId } = await params

  const risks = await checkMilestoneRisk(projectId)

  return Response.json({ risks })
}
