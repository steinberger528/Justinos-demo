'use client'

import { chipStyle, NEUTRAL_CHIP_STYLE } from './chip-style'

interface WaitingRowProps {
  title: string
  /** Second line — omitted for dimmed (blocked-on-agent) rows. */
  description?: string
  chipLabel?: string
  chipColor?: string
  /** Amber wash — the row is actionable right now. */
  actionable?: boolean
  /** Blocked on an unbuilt agent — stays listed so the queue never lies about its length (R12), dashed + 45% opacity, no chip. */
  dimmed?: boolean
  dimmedNote?: string
}

/** Waiting-on-you row — spec R8 / component sheet "Waiting-on-you row". */
export function WaitingRow({ title, description, chipLabel, chipColor, actionable, dimmed, dimmedNote }: WaitingRowProps) {
  if (dimmed) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          padding: '8px 10px',
          borderRadius: 8,
          border: '1px dashed var(--ui-border)',
          opacity: 0.45,
        }}
      >
        <span style={{ fontSize: 12 }}>{title}</span>
        <span style={{ fontSize: 10.5, color: 'var(--t3)' }}>{dimmedNote}</span>
      </div>
    )
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 5,
        padding: '8px 10px',
        borderRadius: 8,
        border: `1px solid ${actionable ? 'oklch(0.78 0.16 75 / 0.3)' : 'var(--ui-border)'}`,
        background: actionable ? 'oklch(0.78 0.16 75 / 0.05)' : 'transparent',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ fontSize: 12.5, fontWeight: 500 }}>{title}</span>
        {chipLabel && <span style={chipColor ? chipStyle(chipColor, 12, 30) : NEUTRAL_CHIP_STYLE}>{chipLabel}</span>}
      </div>
      {description && <span style={{ fontSize: 11, color: 'var(--t2)' }}>{description}</span>}
    </div>
  )
}
