'use client'

import type { CapabilityStep, StepTag } from '../control-room-types'

// The design's three step hues — deliberately not app tokens, per spec R8.
const TAG_COLOR: Record<StepTag, string> = {
  ai: '#3987e5',
  manual: '#d95926',
  tool: '#199e70',
}

interface WorkflowStripProps {
  steps: CapabilityStep[]
  /** 6px inside a capability card, 10px in an aggregate/leaderboard context (spec R8). */
  size?: 'card' | 'aggregate'
}

/** Equal-width segments, one per step, in card order — 2px gaps so adjacent same-color steps stay countable. */
export function WorkflowStrip({ steps, size = 'card' }: WorkflowStripProps) {
  const height = size === 'aggregate' ? 10 : 6
  if (steps.length === 0) {
    return (
      <div style={{ height, borderRadius: 3, border: '1px dashed var(--ui-border)', background: 'oklch(1 0 0 / 0.02)' }} />
    )
  }
  return (
    <div style={{ display: 'flex', gap: 2, height }}>
      {steps.map((step, i) => (
        <span
          key={i}
          title={step.text}
          style={{ flex: 1, borderRadius: 2, background: TAG_COLOR[step.tag] ?? TAG_COLOR.tool }}
        />
      ))}
    </div>
  )
}

export { TAG_COLOR }
