import type { CSSProperties } from 'react'

// Shared chip geometry — matches the existing CRM status chip (AgentStatusCards.tsx):
// 9.5px/600/uppercase/0.05em/2px 7px/radius 20, fill at ~12-15% and border at ~30-40%
// of the chip's own hue. Control Room's component sheet calls for the identical
// geometry, so this factors it out for the new agent/autonomy/status chips instead of
// re-inlining it three times.
export function chipStyle(color: string, fillPct = 12, borderPct = 30): CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    fontSize: 9.5,
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    padding: '2px 7px',
    borderRadius: 20,
    color,
    background: `color-mix(in oklch, ${color} ${fillPct}%, transparent)`,
    border: `1px solid color-mix(in oklch, ${color} ${borderPct}%, transparent)`,
  }
}

export const NEUTRAL_CHIP_STYLE: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  fontSize: 9.5,
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  padding: '2px 7px',
  borderRadius: 20,
  color: 'var(--t2)',
  background: 'oklch(1 0 0 / 0.05)',
  border: '1px solid var(--ui-border)',
}
