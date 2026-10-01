'use client'

import { KpiTile } from './KpiTile'
import type { MetricPoint } from './Sparkline'
import type { MetricsSnapshot } from './crm-types'

interface KpiBoardProps {
  /** Oldest-first, per GET /api/crm/overview's metrics_snapshots. */
  snapshots: MetricsSnapshot[]
  current: {
    revenue: number
    clients: number
    pipeline: number
    costToday: number
  }
}

/**
 * Builds sparkline points + "vs yesterday" delta% for one metric from
 * snapshot history. Fewer than 2 snapshots -> no points, null delta (KpiTile
 * then renders value-only, per spec).
 */
function series(
  snapshots: MetricsSnapshot[],
  key: keyof Pick<MetricsSnapshot, 'revenue_total' | 'clients_active' | 'prospects_in_pipeline' | 'cost_today_usd'>,
  currentValue: number,
): { points: MetricPoint[]; deltaPct: number | null } {
  const points: MetricPoint[] = snapshots.map(s => ({ captured_on: s.snapshot_date, value: Number(s[key]) }))
  if (points.length < 2) return { points: [], deltaPct: null }
  const previous = points[points.length - 2].value
  const deltaPct = previous !== 0
    ? ((currentValue - previous) / Math.abs(previous)) * 100
    : (currentValue !== 0 ? 100 : 0)
  return { points, deltaPct }
}

const fmtUsdWhole = (v: number) => `$${Math.round(v).toLocaleString()}`
const fmtUsdCents = (v: number) => `$${v.toFixed(2)}`

/**
 * Executive Dashboard KPI board — Revenue, Active Clients, Pipeline, Cost
 * Today. Deep-link mapping (Task 3 Step 4 of the plan, locked): Active
 * Clients -> /crm/clients, Cost Today -> /crm/agents. Revenue and Pipeline
 * have no better destination than staying put, so they render as non-link
 * tiles rather than inventing a fake href.
 */
export function KpiBoard({ snapshots, current }: KpiBoardProps) {
  const revenue = series(snapshots, 'revenue_total', current.revenue)
  const clients = series(snapshots, 'clients_active', current.clients)
  const pipeline = series(snapshots, 'prospects_in_pipeline', current.pipeline)
  const costToday = series(snapshots, 'cost_today_usd', current.costToday)

  return (
    <div className="grid gap-[12px]" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
      <KpiTile label="Revenue" value={current.revenue} fmt={fmtUsdWhole} points={revenue.points} deltaPct={revenue.deltaPct} />
      <KpiTile label="Active Clients" value={current.clients} points={clients.points} deltaPct={clients.deltaPct} href="/crm/clients" />
      <KpiTile label="Pipeline" value={current.pipeline} points={pipeline.points} deltaPct={pipeline.deltaPct} />
      <KpiTile label="Cost Today" value={current.costToday} fmt={fmtUsdCents} points={costToday.points} deltaPct={costToday.deltaPct} href="/crm/agents" lowerIsBetter />
    </div>
  )
}
