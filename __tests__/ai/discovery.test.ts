import {
  DISCOVERY_LAYERS,
  buildDiscoverySystemPrompt,
} from '@/lib/ai/discovery'

describe('DISCOVERY_LAYERS', () => {
  it('has exactly 6 layers', () => {
    expect(DISCOVERY_LAYERS).toHaveLength(6)
  })

  it('has the expected layer ids in order', () => {
    const ids = DISCOVERY_LAYERS.map((l) => l.id)
    expect(ids).toEqual([
      'problem',
      'outcome',
      'scope',
      'prioritization',
      'constraints',
      'stories',
    ])
  })

  it('each layer has required fields', () => {
    for (const layer of DISCOVERY_LAYERS) {
      expect(typeof layer.id).toBe('string')
      expect(typeof layer.name).toBe('string')
      expect(typeof layer.prompt).toBe('string')
      expect(typeof layer.depthSignal).toBe('string')
    }
  })
})

describe('buildDiscoverySystemPrompt', () => {
  it('returns a string', () => {
    const prompt = buildDiscoverySystemPrompt(null)
    expect(typeof prompt).toBe('string')
    expect(prompt.length).toBeGreaterThan(0)
  })

  it('mentions the current layer when no layers are complete', () => {
    const prompt = buildDiscoverySystemPrompt(null)
    expect(prompt).toContain('Problem Definition')
    expect(prompt).toContain('captureDiscoveryLayer')
  })

  it('identifies the correct current layer based on completedLayers', () => {
    const context = {
      completedLayers: [
        { layerId: 'problem', summary: 'The problem is X' },
        { layerId: 'outcome', summary: 'Success means Y' },
      ],
    }
    const prompt = buildDiscoverySystemPrompt(context)
    // Scope Definition should be the current (active) layer
    expect(prompt).toContain('Current layer: **Scope Definition**')
    // Problem Definition should only appear in the completed list, not as the current layer
    expect(prompt).not.toContain('Current layer: **Problem Definition**')
  })

  it('includes completed layer names in the prompt', () => {
    const context = {
      completedLayers: [
        { layerId: 'problem', summary: 'The problem is X' },
      ],
    }
    const prompt = buildDiscoverySystemPrompt(context)
    expect(prompt).toContain('Problem Definition')
    expect(prompt).toContain('Completed layers')
  })

  it('mentions proposePlanGeneration when all layers are complete', () => {
    const context = {
      completedLayers: DISCOVERY_LAYERS.map((l) => ({
        layerId: l.id,
        summary: `Summary for ${l.id}`,
      })),
    }
    const prompt = buildDiscoverySystemPrompt(context)
    expect(prompt).toContain('proposePlanGeneration')
    expect(prompt).toContain('All 6 discovery layers are complete')
  })

  it('handles null context gracefully (no layers complete)', () => {
    const prompt = buildDiscoverySystemPrompt(null)
    expect(prompt).toContain('No layers have been completed yet')
  })

  it('handles empty context object gracefully', () => {
    const prompt = buildDiscoverySystemPrompt({})
    expect(prompt).toContain('No layers have been completed yet')
  })

  it('instructs John to ask one question at a time', () => {
    const prompt = buildDiscoverySystemPrompt(null)
    expect(prompt.toLowerCase()).toContain('one question')
  })

  it('includes max 3 sentences instruction', () => {
    const prompt = buildDiscoverySystemPrompt(null)
    expect(prompt).toContain('3 sentences')
  })
})
