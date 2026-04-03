import { buildDiscoverySystemPrompt } from '@/lib/ai/discovery'

describe('buildDiscoverySystemPrompt', () => {
  it('returns a non-empty string', () => {
    const prompt = buildDiscoverySystemPrompt()
    expect(typeof prompt).toBe('string')
    expect(prompt.length).toBeGreaterThan(0)
  })

  it('instructs John to ask "What are you building?"', () => {
    const prompt = buildDiscoverySystemPrompt()
    expect(prompt).toContain('What are you building?')
  })

  it('mentions proposePlanGeneration', () => {
    const prompt = buildDiscoverySystemPrompt()
    expect(prompt).toContain('proposePlanGeneration')
  })

  it('includes today\'s date', () => {
    const prompt = buildDiscoverySystemPrompt()
    const today = new Date().toISOString().split('T')[0]
    expect(prompt).toContain(today)
  })
})
