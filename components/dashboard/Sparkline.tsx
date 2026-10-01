'use client'

// Extracted from ClientMetricsCard.tsx (unchanged) so KpiTile can reuse the
// same implementation instead of a second, drifting sparkline.

export interface MetricPoint {
  captured_on: string
  value: number
}

export function Sparkline({ points, width = 88, height = 26 }: { points: MetricPoint[]; width?: number; height?: number }) {
  if (points.length === 0) {
    return <div style={{ width, height, color: 'var(--t3)', fontSize: 10.5, display: 'flex', alignItems: 'center' }}>—</div>
  }
  const values = points.map(p => p.value)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const step = points.length > 1 ? width / (points.length - 1) : 0
  const path = points
    .map((p, i) => {
      const x = i * step
      const y = height - ((p.value - min) / range) * height
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <path d={path} fill="none" stroke="var(--ag)" strokeWidth={1.5} />
    </svg>
  )
}
