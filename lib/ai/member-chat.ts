import { prisma } from '@/lib/prisma'

export async function buildMemberChatSystemPrompt(
  userId: string,
  projectId: string,
): Promise<string> {
  // Load all required data in parallel
  const [project, milestones, tasks, thread, user] = await Promise.all([
    prisma.project.findUniqueOrThrow({ where: { id: projectId } }),
    prisma.milestone.findMany({
      where: { projectId },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.task.findMany({
      where: { projectId },
      orderBy: { createdAt: 'asc' },
      include: { assignee: { select: { id: true, name: true, email: true } } },
    }),
    prisma.thread.findUnique({
      where: { projectId_userId: { projectId, userId } },
    }),
    prisma.user.findUnique({ where: { id: userId }, select: { id: true, name: true, email: true } }),
  ])

  const projectContext =
    project.context != null && typeof project.context === 'object'
      ? (project.context as Record<string, unknown>)
      : {}

  // ─── 1. Persona ─────────────────────────────────────────────────────────────
  const persona = `You are John, an AI project manager for an engineering team. You're direct, helpful, and efficient. You help engineers stay focused and unblocked.`

  // ─── 2. Behavioral rules ────────────────────────────────────────────────────
  const rules = `## Behavioral rules
- Always confirm before writing to the database. Example: "I'll mark X as complete — shall I do that?"
- Ask only one question at a time.
- If a pending proposal is active and the user's message is NOT a clear confirmation (yes/yep/ok/sure/do it/confirmed), acknowledge the cancellation and clear the proposal.
- Never update tasks assigned to other team members.`

  // ─── 3. Shared project state ─────────────────────────────────────────────────
  const milestonesText = milestones.length === 0
    ? 'No milestones defined yet.'
    : milestones
        .map((m) => `- [${m.status}] ${m.title}${m.targetDate ? ` (target: ${m.targetDate.toISOString().split('T')[0]})` : ''}`)
        .join('\n')

  const tasksText = tasks.length === 0
    ? 'No tasks defined yet.'
    : tasks
        .map((t) => {
          const assigneeName = t.assignee ? (t.assignee.name ?? t.assignee.email) : 'Unassigned'
          return `- [${t.status}] [${t.priority}] ${t.title} — assignee: ${assigneeName}${t.dueDate ? ` — due: ${t.dueDate.toISOString().split('T')[0]}` : ''}`
        })
        .join('\n')

  interface RiskFlag {
    milestoneTitle: string
    targetDate: string | Date
    gap: number
  }

  const rawRisks = Array.isArray(projectContext.risks) ? projectContext.risks : []
  const risks: RiskFlag[] = rawRisks
    .filter(
      (r): r is RiskFlag =>
        r !== null &&
        typeof r === 'object' &&
        typeof (r as Record<string, unknown>).milestoneTitle === 'string',
    )
    .map((r) => r as RiskFlag)

  const risksText =
    risks.length === 0
      ? ''
      : `\n## Active Risk Flags\n${risks
          .map((r) => {
            const dateStr =
              r.targetDate instanceof Date
                ? r.targetDate.toISOString().split('T')[0]
                : String(r.targetDate).split('T')[0]
            return `- ${r.milestoneTitle} (due ${dateStr}, gap: ${Math.round(r.gap * 100)}% behind schedule)`
          })
          .join('\n')}\n→ Open your session by mentioning these risks and asking the user if they can help address them.`

  const projectState = `## Project state (loaded fresh this request)
Project: ${project.name} [${project.status}]

### Milestones
${milestonesText}

### All tasks
${tasksText}${risksText}`

  // ─── 4. Personal context ─────────────────────────────────────────────────────
  const myTasks = tasks.filter((t) => t.assigneeId === userId)
  const myTasksText = myTasks.length === 0
    ? 'No tasks currently assigned to this user.'
    : myTasks
        .map((t) => `- [${t.status}] [${t.priority}] ${t.title}${t.dueDate ? ` — due: ${t.dueDate.toISOString().split('T')[0]}` : ''}`)
        .join('\n')

  const userName = user?.name ?? user?.email ?? userId
  let personalContext = `## Personal context for ${userName}
### Your assigned tasks
${myTasksText}`

  if (thread?.pendingProposal != null) {
    const proposal = thread.pendingProposal as Record<string, unknown>
    personalContext += `\n\n### Pending proposal (awaiting confirmation)
${JSON.stringify(proposal, null, 2)}
Ask the user to confirm or cancel this proposal before proposing anything new.`
  }

  return [persona, rules, projectState, personalContext].join('\n\n')
}
