import {
  CORE_INSTRUCTIONS,
  PROJECT_SCHEMA,
  TEAM_CONVENTIONS,
  EXAMPLE_PLAN,
  SKILL_DISCOVERY,
} from '@/lib/ai/skills'

export function buildDiscoverySystemPrompt(): string {
  const today = new Date().toISOString().split('T')[0]

  return [
    CORE_INSTRUCTIONS,
    PROJECT_SCHEMA,
    TEAM_CONVENTIONS,
    EXAMPLE_PLAN,
    SKILL_DISCOVERY,
    `## Available Tools
- \`proposePlanGeneration(confirmedDescription)\`: Call ONLY after the user explicitly confirms your one-sentence summary. Not before.

## Today's Date
${today}`,
  ].join('\n\n---\n\n')
}
