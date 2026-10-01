'use client'

import { chipStyle, NEUTRAL_CHIP_STYLE } from './chip-style'

interface StatusChipProps {
  status: 'running' | 'planned' | 'failed' | string
}

/** Running = cyan-on-mint (same geometry as AutonomyChip's S3), Planned = neutral, Failed = danger red. */
export function StatusChip({ status }: StatusChipProps) {
  if (status === 'running') {
    return <span style={{ ...chipStyle('var(--ag)', 12, 28), color: 'var(--acy)' }}>Running</span>
  }
  if (status === 'failed') {
    return <span style={chipStyle('var(--danger)', 12, 30)}>Failed</span>
  }
  if (status === 'planned') {
    return <span style={NEUTRAL_CHIP_STYLE}>Planned</span>
  }
  return <span style={NEUTRAL_CHIP_STYLE}>{status}</span>
}
