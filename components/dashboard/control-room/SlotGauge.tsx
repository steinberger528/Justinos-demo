'use client'

interface SlotGaugeProps {
  /** Slots spent today, 0-5. */
  spent: number
  /** Optional per-slot caption, e.g. ["1 · brief", "2 · re-plan", ...]. */
  labels?: string[]
}

/**
 * Five discrete slots, never a percentage (spec R7.1/R11 open decision 1 note) — the
 * cloud-routine budget is countable, so the gauge counts. Slot 1 keeps an amber
 * dashed outline when empty because the morning brief has a standing claim on it
 * (component sheet). All five spent tips the fill to danger red.
 */
export function SlotGauge({ spent, labels }: SlotGaugeProps) {
  const allSpent = spent >= 5
  return (
    <div style={{ display: 'flex', gap: 6 }}>
      {Array.from({ length: 5 }).map((_, i) => {
        const filled = i < spent
        const isSlotOne = i === 0
        const style: React.CSSProperties = filled
          ? allSpent
            ? { background: 'oklch(0.60 0.22 25 / 0.4)', border: '1px solid oklch(0.60 0.22 25 / 0.55)' }
            : { background: 'var(--ag)', opacity: 0.55, border: '1px solid oklch(0.67 0.19 165 / 0.5)' }
          : isSlotOne
          ? { border: '1px dashed oklch(0.78 0.16 75 / 0.4)', background: 'oklch(0.78 0.16 75 / 0.06)' }
          : { border: '1px dashed var(--ui-border)', background: 'oklch(1 0 0 / 0.02)' }

        return (
          <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 5 }}>
            <div style={{ height: 30, borderRadius: 6, ...style }} />
            {labels?.[i] && (
              <span
                style={{
                  fontFamily: 'var(--font-jetbrains-mono, monospace)',
                  fontSize: 10.5,
                  color: 'var(--t3)',
                  textAlign: 'center',
                }}
              >
                {labels[i]}
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}
