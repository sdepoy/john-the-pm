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
- \`proposePlanGeneration\`: Call this immediately after the user answers "What are you building?"

## Today's Date
${today}`,
  ].join('\n\n---\n\n')
}
