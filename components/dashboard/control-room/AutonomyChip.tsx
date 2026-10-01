'use client'

import { chipStyle, NEUTRAL_CHIP_STYLE } from './chip-style'

interface AutonomyChipProps {
  autonomy: 'S1' | 'S2' | 'S3' | string
  /** Longer label for the tier/autonomy key card (R7.3) — "S1 suggests" instead of bare "S1". */
  long?: boolean
}

const LABELS: Record<string, string> = { S1: 'suggests', S2: 'acts on a yes', S3: 'acts unattended' }

/** S1 = amber (--warn), S2 = neutral, S3 = cyan-on-mint (--acy text, --ag fill — matches the design's `.s3` class). */
export function AutonomyChip({ autonomy, long }: AutonomyChipProps) {
  const label = long ? `${autonomy} ${LABELS[autonomy] ?? ''}`.trim() : autonomy

  if (autonomy === 'S1') return <span style={chipStyle('var(--warn)', 12, 30)}>{label}</span>
  if (autonomy === 'S3') {
    return (
      <span style={{ ...chipStyle('var(--ag)', 12, 28), color: 'var(--acy)' }}>{label}</span>
    )
  }
  return <span style={NEUTRAL_CHIP_STYLE}>{label || autonomy}</span>
}
