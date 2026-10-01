'use client'

import { useState } from 'react'

type Range = 'today' | '7d' | '14d' | '30d'
const RANGES: { key: Range; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: '7d', label: '7d' },
  { key: '14d', label: '14d' },
  { key: '30d', label: '30d' },
]

type BreakdownBy = 'agent' | 'skill' | 'mcp-tool' | 'session'
const BREAKDOWNS: { key: BreakdownBy; label: string }[] = [
  { key: 'agent', label: 'Agent' },
  { key: 'skill', label: 'Skill' },
  { key: 'mcp-tool', label: 'MCP tool' },
  { key: 'session', label: 'Session' },
]

const CATEGORY_COLOR = { agent: '#3987e5', skill: '#199e70', 'mcp-tool': '#d95926', manual: '#5a6b82' } as const
const CATEGORY_LABEL = { agent: 'Agents', skill: 'Skills', 'mcp-tool': 'MCP tools', manual: 'Manual chat' } as const
// Singular form for the per-tile leaderboard label (artboard: "Agent" / "Skill" / "MCP tool").
const CATEGORY_LABEL_SINGULAR = { agent: 'Agent', skill: 'Skill', 'mcp-tool': 'MCP tool', manual: 'Manual' } as const

// Sample 14-day dataset — literally derived from the approved artboard's own bar
// heights (work-session.html), so the chart matches its exact proportions. Spec R5.2:
// this card stays sample-only until the SessionEnd hook (B7.3) exists — its own
// categories (agent/skill/mcp-tool/manual) don't match what control-room-push.mjs's
// `token_usage` telemetry kind produces today (day+repo), so it is deliberately not
// wired to that feed, same posture as the Plan usage card.
const SAMPLE_VALUES: { agent: number; skill: number; 'mcp-tool': number; manual: number }[] = [
  { agent: 117000, skill: 57000, 'mcp-tool': 37000, manual: 17000 },
  { agent: 147000, skill: 52000, 'mcp-tool': 42000, manual: 22000 },
  { agent: 87000, skill: 37000, 'mcp-tool': 27000, manual: 12000 },
  { agent: 207000, skill: 87000, 'mcp-tool': 57000, manual: 27000 },
  { agent: 237000, skill: 107000, 'mcp-tool': 52000, manual: 32000 },
  { agent: 177000, skill: 67000, 'mcp-tool': 47000, manual: 17000 },
  { agent: 257000, skill: 117000, 'mcp-tool': 67000, manual: 27000 },
  { agent: 137000, skill: 47000, 'mcp-tool': 32000, manual: 15000 },
  { agent: 197000, skill: 82000, 'mcp-tool': 45000, manual: 19000 },
  { agent: 297000, skill: 127000, 'mcp-tool': 72000, manual: 37000 },
  { agent: 227000, skill: 92000, 'mcp-tool': 57000, manual: 25000 },
  { agent: 187000, skill: 77000, 'mcp-tool': 49000, manual: 21000 },
  { agent: 317000, skill: 142000, 'mcp-tool': 77000, manual: 39000 },
  { agent: 272000, skill: 112000, 'mcp-tool': 65000, manual: 32000 },
]

/** The sample values above, dated so the last bar is always today. */
function sampleDays() {
  const today = new Date()
  return SAMPLE_VALUES.map((values, i) => {
    const d = new Date(today)
    d.setDate(d.getDate() - (SAMPLE_VALUES.length - 1 - i))
    const label = d.getDate() === 1
      ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase()
      : String(d.getDate())
    return { label, ...values }
  })
}

const LEADERBOARD: { name: string; category: keyof typeof CATEGORY_COLOR; tokens: number }[] = [
  { name: 'Athena', category: 'agent', tokens: 1_420_000 },
  { name: 'deep-research', category: 'skill', tokens: 880_000 },
  { name: 'capabilities-push', category: 'skill', tokens: 610_000 },
  { name: 'daily-brain', category: 'agent', tokens: 540_000 },
  { name: 'playwright-cli', category: 'mcp-tool', tokens: 410_000 },
]

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000) return `${Math.round(n / 1000)}K`
  return String(Math.round(n))
}

function median(nums: number[]): number {
  if (nums.length === 0) return 0
  const sorted = [...nums].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

const microStyle: React.CSSProperties = { fontSize: 10.5, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '0.06em' }

/**
 * "Token usage · audit" (spec R5.2, corrected 2026-09-10) — the breakdown dimension
 * changed from repo to source-of-spend (Agent/Skill/MCP tool/Manual chat). Range tabs
 * and the "Break down by" row are interactive UI state only; the underlying dataset
 * is the fixed sample above, since no real feed exists yet (see the sample-data note
 * at the top of this file). Footnoted "fed by the SessionEnd hook · B7.3" per spec.
 */
export function TokenUsageAuditCard() {
  const [range, setRange] = useState<Range>('14d')
  const [breakdown, setBreakdown] = useState<BreakdownBy>('agent')

  const allDays = sampleDays()
  const windowSize = range === 'today' ? 1 : range === '7d' ? 7 : range === '14d' ? 14 : Math.min(30, allDays.length)
  const days = allDays.slice(Math.max(0, allDays.length - windowSize))

  const dayTotals = days.map(d => d.agent + d.skill + d['mcp-tool'] + d.manual)
  const total = dayTotals.reduce((a, b) => a + b, 0)
  const dailyMedian = median(dayTotals)
  const topSpender = LEADERBOARD[0].name

  const W = 1020
  const H = 232
  const marginLeft = 48
  const marginRight = 16
  const axisTop = 18
  const axisBottom = 198
  const maxY = Math.max(1, ...dayTotals)
  const barWidth = days.length > 0 ? Math.min(40, (W - marginLeft - marginRight) / days.length - 28) : 40
  const step = days.length > 1 ? (W - marginLeft - marginRight - barWidth) / (days.length - 1) : 0
  const xFor = (i: number) => marginLeft + i * step
  const yFor = (v: number) => axisBottom - (v / maxY) * (axisBottom - axisTop)

  const maxLeaderboard = LEADERBOARD[0].tokens

  return (
    <div className="glass accent-glow">
      <div className="card-header">
        <span className="card-label">Token usage · audit</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {RANGES.map(r => (
            <button
              key={r.key}
              onClick={() => setRange(r.key)}
              className="card-badge"
              style={r.key === range ? { background: 'oklch(1 0 0 / 0.09)', color: 'var(--t1)', borderColor: 'oklch(1 0 0 / 0.14)', cursor: 'pointer' } : { cursor: 'pointer' }}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>
      <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 26, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={microStyle}>Total, {days.length} day{days.length === 1 ? '' : 's'}</span>
            <span style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)', fontSize: 24, fontWeight: 600, lineHeight: 1.1, color: 'var(--warn)' }}>{formatTokens(total)}</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={microStyle}>Daily median</span>
            <span style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)', fontSize: 24, fontWeight: 600, lineHeight: 1.1 }}>{formatTokens(dailyMedian)}</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={microStyle}>Top spender</span>
            <span style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)', fontSize: 24, fontWeight: 600, lineHeight: 1.1 }}>{topSpender}</span>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 14, fontSize: 11, color: 'var(--t2)', flexWrap: 'wrap' }}>
            {(['agent', 'skill', 'mcp-tool', 'manual'] as const).map(cat => (
              <span key={cat} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: CATEGORY_COLOR[cat], display: 'inline-block' }} />
                {CATEGORY_LABEL[cat]}
              </span>
            ))}
          </div>
        </div>

        {days.length >= 1 && (
          <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} style={{ display: 'block', overflow: 'visible' }}>
            {[0, 0.25, 0.5, 0.75, 1].map(f => {
              const y = axisTop + (1 - f) * (axisBottom - axisTop)
              return (
                <g key={f}>
                  <line x1={marginLeft} y1={y} x2={W - marginRight} y2={y} stroke={f === 0 ? 'oklch(1 0 0 / 0.12)' : 'oklch(1 0 0 / 0.05)'} strokeWidth={1} />
                  <text x={marginLeft - 8} y={y + 3} textAnchor="end" fontFamily="var(--font-jetbrains-mono, monospace)" fontSize={10} fill="var(--t3)">
                    {formatTokens(maxY * f)}
                  </text>
                </g>
              )
            })}

            {days.map((d, i) => {
              const x = xFor(i)
              let cursorY = axisBottom
              const segments: { key: string; value: number }[] = [
                { key: 'agent', value: d.agent },
                { key: 'skill', value: d.skill },
                { key: 'mcp-tool', value: d['mcp-tool'] },
                { key: 'manual', value: d.manual },
              ]
              return (
                <g key={i}>
                  {segments.map(seg => {
                    const h = axisBottom - yFor(seg.value)
                    const y = cursorY - h
                    cursorY = y
                    return <rect key={seg.key} x={x} y={y} width={barWidth} height={h} fill={CATEGORY_COLOR[seg.key as keyof typeof CATEGORY_COLOR]} fillOpacity={0.9} rx={seg.key === 'manual' ? 2 : 0} />
                  })}
                  <text x={x + barWidth / 2} y={axisBottom + 20} textAnchor="middle" fontFamily="var(--font-jetbrains-mono, monospace)" fontSize={9.5} fill="var(--t3)" opacity={i % 2 === 0 ? 1 : 0.5}>
                    {d.label}
                  </text>
                </g>
              )
            })}
          </svg>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, borderTop: '1px solid oklch(1 0 0 / 0.055)', paddingTop: 10, flexWrap: 'wrap' }}>
          <span style={microStyle}>Break down by</span>
          {BREAKDOWNS.map(b => (
            <button
              key={b.key}
              onClick={() => setBreakdown(b.key)}
              className="card-badge"
              style={b.key === breakdown ? { background: 'oklch(1 0 0 / 0.09)', color: 'var(--t1)', borderColor: 'oklch(1 0 0 / 0.14)', cursor: 'pointer' } : { cursor: 'pointer' }}
            >
              {b.label}
            </button>
          ))}
          <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-jetbrains-mono, monospace)', fontSize: 10.5, color: 'var(--t3)' }}>fed by the SessionEnd hook · B7.3</span>
        </div>

        <div className="layout-tiles-sm">
          {LEADERBOARD.map(item => (
            <div key={item.name} style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--ui-border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <span style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)', fontSize: 11.5 }}>{item.name}</span>
                <span style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)', fontSize: 11.5 }}>{formatTokens(item.tokens)}</span>
              </div>
              <div style={{ height: 5, borderRadius: 3, overflow: 'hidden', background: 'oklch(1 0 0 / 0.07)' }}>
                <div style={{ height: '100%', width: `${(item.tokens / maxLeaderboard) * 100}%`, background: CATEGORY_COLOR[item.category] }} />
              </div>
              <span style={{ fontSize: 10.5, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{CATEGORY_LABEL_SINGULAR[item.category]}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
