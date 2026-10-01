'use client'

import Link from 'next/link'
import { Sparkline, type MetricPoint } from './Sparkline'

interface KpiTileProps {
  label: string
  value: number
  fmt?: (v: number) => string
  /** Snapshot history points. Sparkline/delta only render when length >= 2. */
  points: MetricPoint[]
  /** Precomputed "vs yesterday" delta, as a percent. Null when not enough history. */
  deltaPct: number | null
  /** Deep-link target. Omit for tiles with no better destination (non-link tile, not a broken href). */
  href?: string
  /**
   * True for metrics where a falling value is the good direction (e.g. cost).
   * Mirrors ClientMetricsCard.tsx's SEO_METRICS `lowerIsBetter` flag, which
   * SeoMetricTile consumes the same way to invert green/red. Default false
   * (rising = improving), correct for Revenue/Active Clients/Pipeline.
   */
  lowerIsBetter?: boolean
}

const defaultFmt = (v: number) => v.toLocaleString()

/**
 * Executive Dashboard KPI tile — label + current value in the established
 * retro-mono/retro-glow style (matches SeoMetricTile, ClientMetricsCard.tsx),
 * plus a delta badge + sparkline ONLY when at least 2 snapshots exist. Below
 * that, renders value-only — no placeholder dash, no error state (spec
 * requirement: 0/low-data reads as honest telemetry, not noise).
 */
export function KpiTile({ label, value, fmt = defaultFmt, points, deltaPct, href, lowerIsBetter }: KpiTileProps) {
  const hasTrend = points.length >= 2 && deltaPct !== null
  const rising = hasTrend ? deltaPct! >= 0 : null
  const improving = hasTrend ? (lowerIsBetter ? !rising : rising) : null

  const body = (
    <div
      style={{
        padding: '10px 12px',
        borderRadius: 8,
        border: '1px solid oklch(1 0 0 / 0.07)',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        height: '100%',
        boxSizing: 'border-box',
      }}
    >
      <span style={{ fontSize: 10.5, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        {label}
      </span>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <div>
          <div className="retro-mono retro-glow" style={{ fontSize: 21, fontWeight: 600 }}>
            {fmt(value)}
          </div>
          {hasTrend && (
            <div
              style={{
                fontSize: 10.5,
                color: improving ? 'var(--ag)' : 'oklch(0.65 0.22 25)',
                marginTop: 2,
              }}
            >
              {deltaPct! > 0 ? '▲' : deltaPct! < 0 ? '▼' : '·'} {Math.abs(deltaPct!).toFixed(1)}%
            </div>
          )}
        </div>
        {hasTrend && <Sparkline points={points} width={68} height={24} />}
      </div>
    </div>
  )

  if (!href) return body

  return (
    <Link href={href} style={{ textDecoration: 'none', color: 'inherit', display: 'block', height: '100%', cursor: 'pointer' }}>
      {body}
    </Link>
  )
}
