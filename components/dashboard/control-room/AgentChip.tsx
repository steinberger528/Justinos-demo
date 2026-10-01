'use client'

import type { AgentName } from '../control-room-types'
import { chipStyle, NEUTRAL_CHIP_STYLE } from './chip-style'

// Agent colors map onto the app's existing tokens (spec R8) — never a new hue.
// Neptune --ac, Athena --warn, Ares --danger, Iris --ag.
export const AGENT_STYLE: Record<AgentName, { color: string; label: string; role: string }> = {
  neptune: { color: 'var(--ac)', label: 'Neptune', role: 'Chief of staff' },
  athena: { color: 'var(--warn)', label: 'Athena', role: 'Librarian' },
  ares: { color: 'var(--danger)', label: 'Ares', role: 'Coach' },
  iris: { color: 'var(--ag)', label: 'Iris', role: 'Inbox' },
}

interface AgentChipProps {
  agent: AgentName | 'none' | null
}

/** The agent name is always rendered next to its color — color never carries identity alone (spec R8). */
export function AgentChip({ agent }: AgentChipProps) {
  if (!agent || agent === 'none') {
    return <span style={NEUTRAL_CHIP_STYLE}>No owner</span>
  }
  const s = AGENT_STYLE[agent]
  if (!s) return <span style={NEUTRAL_CHIP_STYLE}>{agent}</span>
  return <span style={chipStyle(s.color, 12, 30)}>{s.label}</span>
}
