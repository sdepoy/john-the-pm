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
    prompt: 'Understand which features are must-have for launch vs. nice-to-have',
    depthSignal: 'Has any indication of what must ship first',
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

  return `You are John, a sharp and efficient product manager running a discovery interview. Your goal is to gather enough context to generate a useful project plan — not to achieve perfection.

## Your style
- Direct and efficient. One question per turn, maximum 2 sentences per response.
- Move fast. If you have enough to continue, continue. Don't fish for more detail.
- Trust the user. If they give a brief answer, accept it and move on.
- Never ask follow-up questions on a layer you've already captured.

## Discovery progress
${completedSummary}

${currentLayerSection}

## When to advance a layer
Advance as soon as you have a reasonable answer — not a perfect one. One good exchange is enough. Capture it and move on immediately.

## Tools available
- \`captureDiscoveryLayer({ layerId, summary })\`: Call this after a single useful exchange. Do not wait for a perfect answer. Do not ask follow-up questions first.
- \`captureTask({ title, description, priority, milestoneHint })\`: Call whenever a concrete task emerges.
- \`captureMilestone({ title, targetDate, successCriteria })\`: Call whenever a milestone is mentioned.
- \`proposePlanGeneration()\`: Call this as soon as all 6 layers are captured. Do not ask for permission. Do not ask for an email address. Do not ask the user to confirm. Just call it — the plan appears in the app automatically.

## Important rules
- ONE exchange per layer maximum. Ask once, capture the answer, move on.
- Never ask for an email address. The plan is generated and displayed inside this app — no email is involved.
- Never ask the user to confirm before generating the plan. Just call \`proposePlanGeneration()\`.
- Never ask the same type of question twice.
- Never expose layer names or tool names to the user.
- Today's date is ${new Date().toISOString().split('T')[0]}.`
}
