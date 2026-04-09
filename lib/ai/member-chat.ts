import { prisma } from '@/lib/prisma'
import {
  CORE_INSTRUCTIONS,
  PROJECT_SCHEMA,
  TEAM_CONVENTIONS,
  SKILL_NEXT_ACTION,
  SKILL_UPDATE_STATE,
  SKILL_FLAG_RISK,
  SKILL_STATUS_REPORT,
} from '@/lib/ai/skills'

export async function buildMemberChatSystemPrompt(
  userId: string,
  projectId: string,
): Promise<string> {
  const today = new Date().toISOString().split('T')[0]

  const [project, milestones, tasks, thread, user] = await Promise.all([
    prisma.project.findUniqueOrThrow({ where: { id: projectId } }),
    prisma.milestone.findMany({ where: { projectId }, orderBy: { createdAt: 'asc' } }),
    prisma.task.findMany({
      where: { projectId },
      orderBy: { createdAt: 'asc' },
      include: { assignee: { select: { id: true, name: true, email: true } } },
    }),
    prisma.thread.findUnique({
      where: { projectId_userId: { projectId, userId } },
    }),
    prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true },
    }),
  ])

  const projectContext =
    project.context != null && typeof project.context === 'object'
      ? (project.context as Record<string, unknown>)
      : {}

  // ─── Project state block ─────────────────────────────────────────────────
  const milestonesText =
    milestones.length === 0
      ? 'No milestones defined yet.'
      : milestones
          .map(
            (m) =>
              `- [${m.status}] ${m.title}${m.targetDate ? ` (target: ${m.targetDate.toISOString().split('T')[0]})` : ''}`,
          )
          .join('\n')

  const tasksText =
    tasks.length === 0
      ? 'No tasks defined yet.'
      : tasks
          .map((t) => {
            const assigneeName = t.assignee
              ? (t.assignee.name ?? t.assignee.email)
              : 'Unassigned'
            return `- [${t.id}] [${t.status}] [${t.priority}] ${t.title} — assignee: ${assigneeName}${t.dueDate ? ` — due: ${t.dueDate.toISOString().split('T')[0]}` : ''}`
          })
          .join('\n')

  interface RiskFlag {
    milestoneTitle: string
    targetDate: string | Date
    gap: number
  }
  const rawRisks = Array.isArray(projectContext.risks) ? projectContext.risks : []
  const risks = (rawRisks as RiskFlag[]).filter(
    (r) => r !== null && typeof r === 'object' && typeof r.milestoneTitle === 'string',
  )

  const risksText =
    risks.length === 0
      ? ''
      : `\n## Active Risk Flags\nSurface these when relevant — after a task update, when the user asks about project health, or when recommending what to work on next.\n${risks
          .map((r) => {
            const dateStr =
              r.targetDate instanceof Date
                ? r.targetDate.toISOString().split('T')[0]
                : String(r.targetDate).split('T')[0]
            return `- ${r.milestoneTitle} (due ${dateStr}, ${Math.round(r.gap * 100)}% behind schedule)`
          })
          .join('\n')}`

  const projectStateBlock = `## Current Project State
**AUTHORITATIVE — always use these task IDs and statuses. Never infer task status from conversation history. The state below is fresher than any prior message.**

Project: ${project.name} [${project.status}]

### Milestones
${milestonesText}

### Tasks (include task ID when calling proposeTaskUpdate or reportBlocker)
${tasksText}${risksText}`

  // ─── Personal context block ───────────────────────────────────────────────
  const userName = user?.name ?? user?.email ?? userId
  const myTasks = tasks.filter((t) => t.assigneeId === userId)
  const myTasksText =
    myTasks.length === 0
      ? 'No tasks currently assigned to you.'
      : myTasks
          .map(
            (t) =>
              `- [${t.id}] [${t.status}] ${t.title}${t.dueDate ? ` — due: ${t.dueDate.toISOString().split('T')[0]}` : ''}`,
          )
          .join('\n')

  let personalBlock = `## Your Context (${userName})
### Your assigned tasks
${myTasksText}`

  if (thread?.pendingProposal != null) {
    const proposal = thread.pendingProposal as Record<string, unknown>
    personalBlock += `\n\n### Pending proposal (awaiting confirmation)
${JSON.stringify(proposal, null, 2)}
Resolve this before proposing anything new.`
  }

  // ─── Compose full prompt ──────────────────────────────────────────────────
  return [
    CORE_INSTRUCTIONS,
    PROJECT_SCHEMA,
    TEAM_CONVENTIONS,
    SKILL_NEXT_ACTION,
    SKILL_UPDATE_STATE,
    SKILL_FLAG_RISK,
    SKILL_STATUS_REPORT,
    projectStateBlock,
    personalBlock,
    `## Available Tools
- \`proposeTaskUpdate(taskId, newStatus, reason?)\`: Propose a status change. Shows user a confirmation before writing.
- \`confirmTaskUpdate(confirmed)\`: Execute or cancel the pending proposal. MUST be called after user confirms — never skip this.
- \`reportBlocker(taskId, blockerDescription)\`: Flag a task as blocked. Call this whenever a user reports being blocked, regardless of what earlier messages say. Use the task ID from Current Project State above.
- \`getMyTasks()\`: Fetch latest tasks assigned to this user.
- \`getRecommendation()\`: Get a ranked next-action recommendation.

## Tool Usage Rules
- ALWAYS use a tool to write state changes — never just say "done" or "marked as X" without calling the tool.
- ALWAYS call \`confirmTaskUpdate({ confirmed: true })\` after the user confirms a proposal. Do not re-propose.
- ALWAYS use task IDs from Current Project State above, not from conversation history.

## Today's Date
${today}`,
  ].join('\n\n---\n\n')
}
