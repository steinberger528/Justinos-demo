'use client'

import { Fragment, useEffect, useRef, useState } from 'react'
import { Panel } from './Panel'
import { ClientMetricsCard } from './ClientMetricsCard'
import type { Client } from './crm-types'

type SeoMetricKey = 'organic_traffic' | 'keyword_position_avg' | 'referring_domains' | 'organic_conversions' | 'technical_issues_open'

const SEO_METRICS: { key: SeoMetricKey; label: string; lowerIsBetter?: boolean; fmt: (v: number) => string }[] = [
  { key: 'organic_traffic',       label: 'Organic Traffic',       fmt: v => Math.round(v).toLocaleString() },
  { key: 'keyword_position_avg',  label: 'Avg Keyword Position',  lowerIsBetter: true, fmt: v => v.toFixed(1) },
  { key: 'referring_domains',     label: 'Referring Domains',     fmt: v => Math.round(v).toLocaleString() },
  { key: 'organic_conversions',   label: 'Organic Conversions',   fmt: v => Math.round(v).toLocaleString() },
  { key: 'technical_issues_open', label: 'Open Technical Issues', lowerIsBetter: true, fmt: v => Math.round(v).toLocaleString() },
]

interface ClientMetricsRow {
  client_id: string
  name: string
  metrics: Record<SeoMetricKey, number | null>
}

interface MetricsSummaryResponse {
  clients: ClientMetricsRow[]
}

type SortKey = 'name' | SeoMetricKey
type SortDir = 'asc' | 'desc'

const GREEN = 'oklch(0.67 0.19 165)'
const AMBER = 'oklch(0.78 0.16 75)'
const RED = 'oklch(0.65 0.22 25)'

/**
 * Relative (within-column) health scoring: a client's value is scored
 * against the range of values for that metric across the whole book, with
 * `lowerIsBetter` metrics scored inverted. No variance in the column (all
 * clients tied, or only one data point) reads as neutral amber, not a false
 * red/green. Missing value (null) is handled by the caller — never colored.
 */
function healthColor(key: SeoMetricKey, value: number, allValues: number[]): string {
  const min = Math.min(...allValues)
  const max = Math.max(...allValues)
  if (min === max) return AMBER
  const def = SEO_METRICS.find(d => d.key === key)!
  let frac = (value - min) / (max - min)
  if (def.lowerIsBetter) frac = 1 - frac
  if (frac >= 0.66) return GREEN
  if (frac >= 0.33) return AMBER
  return RED
}

const thStyle: React.CSSProperties = {
  textAlign: 'left',
  fontSize: 10.5,
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  color: 'var(--t3)',
  padding: '6px 10px',
  cursor: 'pointer',
  userSelect: 'none',
  whiteSpace: 'nowrap',
}

const tdStyle: React.CSSProperties = {
  padding: '7px 10px',
  fontSize: 11.5,
  color: 'var(--t1)',
}

interface ClientHeatGridProps {
  /** Full Client objects, from CrmDataProvider — needed only to feed the row-click drill-down into ClientMetricsCard. */
  clients: Client[]
}

/**
 * Client Metrics — "How's the portfolio?" Sortable, health-color-scored
 * matrix: one row per client, one column per SEO metric, cell color scored
 * relative to the rest of the book. Replaces the old single-client selector
 * drill-down — row click expands an inline ClientMetricsCard for that one
 * client instead (cheapest drill-down, keeps everything on one screen).
 */
export function ClientHeatGrid({ clients }: ClientHeatGridProps) {
  const [rows, setRows] = useState<ClientMetricsRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [sortKey, setSortKey] = useState<SortKey>('name')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  // Generation counter — "latest request wins" guard (same pattern as
  // ClientMetricsCard's requestedIdRef / CrmDataProvider's dirtyRef): a
  // slower, stale fetch must never overwrite a newer one's result.
  const requestIdRef = useRef(0)

  useEffect(() => {
    const requestId = ++requestIdRef.current
    fetch('/api/crm/clients/metrics-summary', { credentials: 'include' })
      .then(async res => {
        if (!res.ok) throw new Error(`GET /api/crm/clients/metrics-summary failed (${res.status})`)
        return (await res.json()) as MetricsSummaryResponse
      })
      .then(d => {
        if (requestIdRef.current !== requestId) return // stale response — a newer request superseded this one
        setRows(d.clients)
        setError(null)
      })
      .catch(e => {
        if (requestIdRef.current !== requestId) return
        console.error('[crm] metrics-summary load error', e)
        setError('Failed to load client metrics')
      })
  }, [])

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  const sorted = [...(rows ?? [])].sort((a, b) => {
    let cmp: number
    if (sortKey === 'name') {
      cmp = a.name.localeCompare(b.name)
    } else {
      const av = a.metrics[sortKey]
      const bv = b.metrics[sortKey]
      if (av === null && bv === null) cmp = 0
      else if (av === null) return 1   // nulls sort last regardless of direction
      else if (bv === null) return -1
      else cmp = av - bv
    }
    return sortDir === 'asc' ? cmp : -cmp
  })

  // Per-column value pools (non-null only) for relative health scoring.
  const columnValues: Record<SeoMetricKey, number[]> = {
    organic_traffic: [], keyword_position_avg: [], referring_domains: [],
    organic_conversions: [], technical_issues_open: [],
  }
  for (const r of rows ?? []) {
    for (const def of SEO_METRICS) {
      const v = r.metrics[def.key]
      if (v !== null) columnValues[def.key].push(v)
    }
  }

  const sortArrow = (key: SortKey) => (sortKey === key ? (sortDir === 'asc' ? ' ▲' : ' ▼') : '')

  return (
    <Panel label="Client Metrics · Heat Grid" fill>
      {rows === null && !error ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--t3)', fontSize: 12 }}>
          Loading…
        </div>
      ) : error ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'oklch(0.65 0.22 25)', fontSize: 12 }}>
          {error}
        </div>
      ) : sorted.length === 0 ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--t3)', fontSize: 12 }}>
          No clients yet.
        </div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid oklch(1 0 0 / 0.08)' }}>
              <th style={thStyle} onClick={() => toggleSort('name')}>Client{sortArrow('name')}</th>
              {SEO_METRICS.map(def => (
                <th key={def.key} style={thStyle} onClick={() => toggleSort(def.key)}>
                  {def.label}{sortArrow(def.key)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map(row => (
              <Fragment key={row.client_id}>
                <tr
                  onClick={() => setExpandedId(id => (id === row.client_id ? null : row.client_id))}
                  style={{ cursor: 'pointer', borderTop: '1px solid oklch(1 0 0 / 0.05)' }}
                >
                  <td style={{ ...tdStyle, fontWeight: 600 }}>{row.name}</td>
                  {SEO_METRICS.map(def => {
                    const v = row.metrics[def.key]
                    return (
                      <td key={def.key} style={tdStyle}>
                        {v === null ? (
                          <span style={{ color: 'var(--t3)' }}>—</span>
                        ) : (
                          <span
                            className="retro-mono"
                            style={{
                              display: 'inline-block',
                              padding: '2px 8px',
                              borderRadius: 5,
                              color: healthColor(def.key, v, columnValues[def.key]),
                              background: `color-mix(in oklch, ${healthColor(def.key, v, columnValues[def.key])} 14%, transparent)`,
                            }}
                          >
                            {def.fmt(v)}
                          </span>
                        )}
                      </td>
                    )
                  })}
                </tr>
                {expandedId === row.client_id && (
                  <tr>
                    <td colSpan={SEO_METRICS.length + 1} style={{ padding: '4px 4px 16px' }}>
                      <ClientMetricsCard clients={clients.filter(c => c.id === row.client_id)} />
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      )}
    </Panel>
  )
}
