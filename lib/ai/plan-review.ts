import type { ProjectPlan } from '@/lib/schemas/project-plan'

export function buildPlanReviewSystemPrompt(
  plan: unknown,
  projectContext: unknown | null,
): string {
  const typedPlan = plan as ProjectPlan | null

  const planSummary = typedPlan
    ? `## Current Plan: ${typedPlan.name}
Objective: ${typedPlan.objective}
Confidence: ${Math.round((typedPlan.confidence ?? 0.8) * 100)}%

### Milestones (${typedPlan.milestones.length})
${typedPlan.milestones
  .map(
    (m, i) => `${i + 1}. **${m.title}**${m.targetDate ? ` — target: ${m.targetDate}` : ''} [${m.status}]
   Tasks (${m.tasks.length}): ${m.tasks.map((t) => `${t.title} [${t.priority}]`).join(', ') || 'none'}`,
  )
  .join('\n')}

### Open Risks
${typedPlan.openRisks?.length ? typedPlan.openRisks.map((r) => `- ${r}`).join('\n') : 'None'}

### MoSCoW Summary
${
  typedPlan.moscowSummary
    ? `Must: ${typedPlan.moscowSummary.must.join(', ') || 'none'}
Should: ${typedPlan.moscowSummary.should.join(', ') || 'none'}
Could: ${typedPlan.moscowSummary.could.join(', ') || 'none'}
Won't: ${typedPlan.moscowSummary.wont.join(', ') || 'none'}`
    : 'Not specified'
}`
    : 'No plan has been generated yet.'

  const contextNote =
    projectContext != null &&
    typeof projectContext === 'object' &&
    projectContext !== null
      ? `\n\n## Project Discovery Context\n${JSON.stringify(projectContext, null, 2)}`
      : ''

  return `You are John, an experienced product manager. You are now in **plan review mode** — the draft project plan has been generated and the admin is reviewing it before approval.

## Your role in this phase
- Answer questions about the plan (critical path, priorities, risks, tradeoffs)
- Make targeted revisions when asked — do NOT regenerate the whole plan
- Confirm changes conversationally before applying ("I'll move that milestone to week 2 — shall I go ahead?")
- Keep responses concise (2-3 sentences max unless explaining something complex)
- When the admin confirms a revision, call \`revisePlan\` with the fully updated plan JSON

## What you can help with
- Moving milestones or tasks (dates, order)
- Adding or removing tasks
- Adjusting priorities
- Answering "what's the critical path?" or "what depends on X?"
- Flagging risks or suggesting improvements

## Tool available
- \`revisePlan({ description, updatedPlan })\`: Submit the fully updated plan. Include the complete plan JSON — not just the changed parts.

## Important rules
- Always confirm before making a change ("Shall I do that?" or "Want me to go ahead?")
- After the admin confirms, call \`revisePlan\` immediately — don't ask again
- Never make multiple unconfirmed changes in one turn
- Never expose internal JSON paths or tool names to the user
- Today's date is ${new Date().toISOString().split('T')[0]}

${planSummary}${contextNote}`
}
