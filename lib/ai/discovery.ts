export const DISCOVERY_LAYERS = [
  {
    id: 'problem',
    name: 'Problem Definition',
    prompt:
      'Understand the core problem being solved, who is affected, and why it matters now',
    depthSignal:
      'Has identified the problem, affected users, and business motivation',
  },
  {
    id: 'outcome',
    name: 'Desired Outcome',
    prompt: 'Clarify what success looks like in concrete, measurable terms',
    depthSignal: 'Has defined specific, measurable success criteria',
  },
  {
    id: 'scope',
    name: 'Scope Definition',
    prompt:
      'Establish what is in scope and what is explicitly out of scope for this project',
    depthSignal: 'Has clear boundaries: what will and will not be built',
  },
  {
    id: 'prioritization',
    name: 'Prioritization',
    prompt: 'Understand which features are critical vs. nice-to-have, and why',
    depthSignal:
      'Has MoSCoW or equivalent prioritization of major features',
  },
  {
    id: 'constraints',
    name: 'Constraints & Dependencies',
    prompt:
      'Surface technical constraints, team constraints, deadlines, and external dependencies',
    depthSignal:
      'Has identified key constraints: timeline, team size, technical blockers',
  },
  {
    id: 'stories',
    name: 'User Stories',
    prompt:
      'Decompose the work into concrete user stories or engineering tasks',
    depthSignal:
      'Has 3+ concrete user stories or task descriptions with enough detail to estimate',
  },
]

export function buildDiscoverySystemPrompt(
  projectContext: Record<string, unknown> | null,
): string {
  // completedLayers is stored as [{ layerId, summary }] objects by the tool
  const rawCompleted = Array.isArray(projectContext?.completedLayers)
    ? (projectContext.completedLayers as Array<unknown>)
    : []

  // Normalize to an array of layerId strings, supporting both string[] and {layerId}[] shapes
  const completedLayerIds: string[] = rawCompleted
    .map((item) => {
      if (typeof item === 'string') return item
      if (item && typeof item === 'object' && 'layerId' in item) {
        return (item as { layerId: string }).layerId
      }
      return null
    })
    .filter((id): id is string => id !== null)

  const allLayerIds = DISCOVERY_LAYERS.map((l) => l.id)
  const allComplete = allLayerIds.every((id) => completedLayerIds.includes(id))

  // Find the current layer — the first one not yet completed
  const currentLayer =
    DISCOVERY_LAYERS.find((l) => !completedLayerIds.includes(l.id)) ?? null

  const completedSummary =
    completedLayerIds.length === 0
      ? 'No layers have been completed yet.'
      : `Completed layers: ${completedLayerIds
          .map((id) => {
            const layer = DISCOVERY_LAYERS.find((l) => l.id === id)
            return layer ? layer.name : id
          })
          .join(', ')}.`

  const currentLayerSection = allComplete
    ? `All 6 discovery layers are complete. Call the \`proposePlanGeneration\` tool now to generate the project plan.`
    : currentLayer
      ? `Current layer: **${currentLayer.name}**
Goal: ${currentLayer.prompt}
You may advance to the next layer once this signal is met: "${currentLayer.depthSignal}"
When satisfied, call \`captureDiscoveryLayer\` with layerId="${currentLayer.id}" and a concise summary of what was learned.`
      : ''

  return `You are John, an experienced product manager conducting a structured discovery interview. Your job is to help engineering teams clarify their project before writing a single line of code.

## Your style
- Conversational, warm, and direct — you are a trusted advisor, not a form to fill out.
- Concise: keep each response to a maximum of 3 sentences.
- Ask only ONE question per turn. Never stack multiple questions.
- Listen carefully and reflect back what you hear before probing deeper.
- Do not repeat yourself. If you already have information, don't ask for it again.

## Discovery progress
${completedSummary}

${currentLayerSection}

## Tools available
- \`captureDiscoveryLayer({ layerId, summary })\`: Call this when the current layer's depth signal is fully satisfied. Summarize the key insight in 2–3 sentences.
- \`captureTask({ title, description, priority, milestoneHint })\`: Call this when a concrete task or user story emerges from the conversation. You may call it mid-conversation without waiting for a layer to complete.
- \`captureMilestone({ title, targetDate, successCriteria })\`: Call this when a milestone or major deliverable is mentioned.
- \`proposePlanGeneration()\`: Call this ONLY when all 6 layers are complete. This signals that you are ready to generate the full project plan.

## Important rules
- Stay focused on the current layer until its depth signal is satisfied. Do not jump ahead.
- After calling a tool, acknowledge it briefly and ask the next question naturally.
- Never expose internal layer IDs or technical tool names to the user.
- Today's date is ${new Date().toISOString().split('T')[0]}.`
}
