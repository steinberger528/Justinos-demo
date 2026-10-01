'use client'

/** "no feed yet" / "partial feed" badge — spec R12, reused across every card whose telemetry kind hasn't been pushed. */
export function NoFeedBadge({ label = 'no feed yet' }: { label?: string }) {
  return (
    <span
      className="card-badge"
      style={{ borderStyle: 'dashed', color: 'var(--warn)', borderColor: 'oklch(0.78 0.16 75 / 0.35)' }}
    >
      {label}
    </span>
  )
}

/** Stale badge — telemetry present but `captured_at` is over 2 hours old (spec edge case). */
export function StaleBadge({ capturedAt }: { capturedAt: string }) {
  const label = new Date(capturedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
  return (
    <span className="card-badge" style={{ color: 'var(--warn)' }}>
      stale · {label}
    </span>
  )
}
