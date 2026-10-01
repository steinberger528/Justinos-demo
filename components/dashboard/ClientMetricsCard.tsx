'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Panel } from './Panel'
import { Sparkline, type MetricPoint } from './Sparkline'
import type { Client } from './crm-types'

type SeoMetricKey = 'organic_traffic' | 'keyword_position_avg' | 'referring_domains' | 'organic_conversions' | 'technical_issues_open'
type GeoMetricKey = 'ai_share_of_voice' | 'citation_rate'
type Engine = 'chatgpt' | 'perplexity' | 'google_ai' | 'gemini'

interface MetricsResponse {
  client_id: string
  seo: Record<SeoMetricKey, MetricPoint[]>
  geo: Record<GeoMetricKey, Partial<Record<Engine, MetricPoint[]>>>
}

const SEO_METRICS: { key: SeoMetricKey; label: string; lowerIsBetter?: boolean; fmt: (v: number) => string }[] = [
  { key: 'organic_traffic',       label: 'Organic Traffic',      fmt: v => Math.round(v).toLocaleString() },
  { key: 'keyword_position_avg',  label: 'Avg Keyword Position', lowerIsBetter: true, fmt: v => v.toFixed(1) },
  { key: 'referring_domains',     label: 'Referring Domains',    fmt: v => Math.round(v).toLocaleString() },
  { key: 'organic_conversions',   label: 'Organic Conversions',  fmt: v => Math.round(v).toLocaleString() },
  { key: 'technical_issues_open', label: 'Open Technical Issues', lowerIsBetter: true, fmt: v => Math.round(v).toLocaleString() },
]

const ENGINES: { key: Engine; label: string }[] = [
  { key: 'chatgpt',    label: 'ChatGPT' },
  { key: 'perplexity', label: 'Perplexity' },
  { key: 'google_ai',  label: 'Google AI' },
  { key: 'gemini',     label: 'Gemini' },
]

function trendDelta(points: MetricPoint[]): { delta: number; pct: number } | null {
  if (points.length < 2) return null
  const first = points[0].value
  const last = points[points.length - 1].value
  const delta = last - first
  const pct = first !== 0 ? (delta / Math.abs(first)) * 100 : 0
  return { delta, pct }
}

function SeoMetricTile({ def, points }: { def: (typeof SEO_METRICS)[number]; points: MetricPoint[] }) {
  const latest = points.length > 0 ? points[points.length - 1].value : null
  const trend = trendDelta(points)
  const improving = trend ? (def.lowerIsBetter ? trend.delta < 0 : trend.delta > 0) : null

  return (
    <div style={{
      padding: '8px 10px',
      borderRadius: 8,
      border: '1px solid oklch(1 0 0 / 0.07)',
      display: 'flex',
      flexDirection: 'column',
      gap: 4,
    }}>
      <div style={{ fontSize: 10.5, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {def.label}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div>
          <div className="retro-mono retro-glow" style={{ fontSize: 16, fontWeight: 600 }}>
            {latest != null ? def.fmt(latest) : '—'}
          </div>
          {trend && (
            <div style={{
              fontSize: 10.5,
              color: improving ? 'var(--ag)' : 'oklch(0.65 0.22 25)',
              marginTop: 1,
            }}>
              {trend.delta > 0 ? '▲' : trend.delta < 0 ? '▼' : '·'} {Math.abs(trend.pct).toFixed(1)}%
            </div>
          )}
        </div>
        <Sparkline points={points} />
      </div>
    </div>
  )
}

function GeoEnginePanel({ metricLabel, byEngine }: { metricLabel: string; byEngine: Partial<Record<Engine, MetricPoint[]>> }) {
  return (
    <div>
      <div style={{ fontSize: 10.5, color: 'var(--t3)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {metricLabel}
      </div>
      <div className="grid gap-[8px]" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
        {ENGINES.map(eng => {
          const points = byEngine[eng.key]
          const hasData = points && points.length > 0
          const latest = hasData ? points[points.length - 1].value : null
          return (
            <div
              key={eng.key}
              style={{
                padding: '7px 8px',
                borderRadius: 7,
                border: '1px solid oklch(1 0 0 / 0.06)',
                background: 'oklch(1 0 0 / 0.02)',
              }}
            >
              <div style={{ fontSize: 10.5, color: 'var(--t3)' }}>{eng.label}</div>
              {hasData ? (
                <>
                  <div className="retro-mono retro-glow" style={{ fontSize: 15, fontWeight: 600, marginTop: 2 }}>
                    {latest!.toFixed(1)}
                  </div>
                  <Sparkline points={points!} width={64} height={20} />
                </>
              ) : (
                <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 6 }}>No data</div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

interface ClientMetricsCardProps {
  clients: Client[]
}

/**
 * Client Metrics drill-down (SEO + GEO) — optional detail view opened by
 * clicking a row in ClientHeatGrid (crm-tab-reorg: the heat-grid is now the
 * primary Client Metrics surface; this card is no longer mounted directly at
 * the top level). At-a-glance SEO five (no bloat metrics) with sparkline
 * trends, plus a GEO panel showing AI Share of Voice and Citation Rate broken
 * out per engine (never blended). All values come from
 * GET /api/crm/clients/[id]/metrics — nothing hardcoded. Still accepts a
 * multi-client array with its selector row (general-purpose), but callers
 * doing a single-client drill-down should pass a 1-item array.
 */
export function ClientMetricsCard({ clients }: ClientMetricsCardProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [metrics, setMetrics] = useState<MetricsResponse | null>(null)
  // Tracks the client id the current in-flight/most-recent request was made
  // for, so a slower earlier response can never overwrite a newer selection
  // (the latest-request guard; this read-only card has no local edits to protect).
  const requestedIdRef = useRef<string | null>(null)

  // Derive the effective selection during render instead of syncing it via
  // an effect — avoids calling setSelectedId() as a side effect of a prop
  // change. The only other place selectedId is set is the client button's
  // onClick below.
  const effectiveSelectedId = selectedId ?? clients[0]?.id ?? null

  // Loading is derived from whether the metrics we're holding belong to the
  // currently-selected client, rather than a separate boolean flipped
  // synchronously inside an effect (mirrors CrmCockpit's load(), whose
  // setState calls live only inside the fetch promise chain).
  const loading = effectiveSelectedId !== null && metrics?.client_id !== effectiveSelectedId

  const load = useCallback((clientId: string) => {
    requestedIdRef.current = clientId
    fetch(`/api/crm/clients/${clientId}/metrics`, { credentials: 'include' })
      .then(async res => {
        if (!res.ok) { console.error('[crm] metrics GET failed', res.status); return null }
        return (await res.json()) as MetricsResponse
      })
      .then(data => {
        if (!data) return
        // Ignore stale responses: only apply if this request is still for
        // the currently-selected client.
        if (requestedIdRef.current !== clientId) return
        if (data.client_id !== clientId) return
        setMetrics(data)
      })
      .catch(e => console.error('[crm] metrics load error', e))
  }, [])

  // Mirrors CrmCockpit's fetch-on-mount effect structure: the effect body
  // only invokes `load`, whose own setState calls live inside the fetch
  // promise chain (not synchronously in the effect body), so it does not
  // trip react-hooks/set-state-in-effect.
  useEffect(() => {
    if (effectiveSelectedId) load(effectiveSelectedId)
  }, [effectiveSelectedId, load])

  return (
    <Panel label="Client Metrics · SEO + GEO">
      {clients.length === 0 ? (
        <div style={{ color: 'var(--t3)', fontSize: 12, padding: '4px 0' }}>No clients yet.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Client selector — hidden for the Client Metrics heat-grid's single-client
              drill-down usage (ClientHeatGrid passes a 1-item filtered array), since a
              lone pill button matching the already-clicked row would be redundant. */}
          {clients.length > 1 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {clients.map(c => (
                <button
                  key={c.id}
                  onClick={() => setSelectedId(c.id)}
                  style={{
                    padding: '4px 10px',
                    borderRadius: 20,
                    fontSize: 11,
                    border: effectiveSelectedId === c.id ? '1px solid var(--ag)' : '1px solid oklch(1 0 0 / 0.1)',
                    background: effectiveSelectedId === c.id ? 'oklch(0.67 0.19 165 / 0.12)' : 'transparent',
                    color: effectiveSelectedId === c.id ? 'var(--ag)' : 'var(--t2)',
                    cursor: 'pointer',
                  }}
                >
                  {c.name}
                </button>
              ))}
            </div>
          )}

          {loading && !metrics ? (
            <div style={{ color: 'var(--t3)', fontSize: 12 }}>Loading metrics…</div>
          ) : (
            <>
              {/* SEO five */}
              <div>
                <div style={{ fontSize: 10.5, color: 'var(--t3)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  SEO
                </div>
                <div className="grid gap-[8px]" style={{ gridTemplateColumns: 'repeat(5, 1fr)' }}>
                  {SEO_METRICS.map(def => (
                    <SeoMetricTile key={def.key} def={def} points={metrics?.seo?.[def.key] ?? []} />
                  ))}
                </div>
                {(!metrics || SEO_METRICS.every(d => (metrics.seo?.[d.key]?.length ?? 0) === 0)) && (
                  <div style={{ color: 'var(--t3)', fontSize: 11, marginTop: 6 }}>
                    No SEO metrics yet for this client.
                  </div>
                )}
              </div>

              {/* GEO panel */}
              <div>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontSize: 10.5, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    GEO, per engine
                  </span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <GeoEnginePanel metricLabel="AI Share of Voice" byEngine={metrics?.geo?.ai_share_of_voice ?? {}} />
                  <GeoEnginePanel metricLabel="Citation Rate" byEngine={metrics?.geo?.citation_rate ?? {}} />
                </div>
                <div style={{ fontSize: 10.5, color: 'var(--t3)', marginTop: 8, lineHeight: 1.5 }}>
                  AI Share of Voice is position-weighted (0 to 100): earlier/more prominent brand
                  mentions in an engine&apos;s response score higher than late or buried mentions.
                  Citation Rate is the % of a fixed prompt set where the brand is cited at all.
                  Both are trends from a fixed prompt set re-run periodically, not live snapshots.
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </Panel>
  )
}
