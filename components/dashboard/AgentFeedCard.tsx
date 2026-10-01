'use client'

import { useState } from 'react'
import { Panel } from './Panel'
import { agentName, clientName, type Agent, type AgentRun, type Client, type RunStatus } from './crm-types'

const STATUS_COLOR: Record<RunStatus, string> = {
  ok:      'oklch(0.67 0.19 165)', // mint
  error:   'oklch(0.65 0.22 25)',  // red
  blocked: 'oklch(0.78 0.16 75)',  // amber
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
}

function summarizeIO(input: Record<string, unknown>, output: Record<string, unknown>): string {
  const inStr = Object.keys(input).length > 0 ? JSON.stringify(input) : '{}'
  const outStr = Object.keys(output).length > 0 ? JSON.stringify(output) : '{}'
  const trim = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s)
  return `${trim(inStr, 46)} → ${trim(outStr, 46)}`
}

interface FeedRowProps {
  run: AgentRun
  agents: Agent[]
  clients: Client[]
  index: number
  isHead: boolean
}

function FeedRow({ run, agents, clients, index, isHead }: FeedRowProps) {
  const [expanded, setExpanded] = useState(false)
  const color = STATUS_COLOR[run.status]
  const delayMs = Math.min(index * 45, 400)

  return (
    <div
      className="retro-reveal"
      style={{ animationDelay: `${delayMs}ms`, borderBottom: '1px solid oklch(1 0 0 / 0.05)' }}
    >
      <div
        onClick={() => setExpanded(e => !e)}
        style={{
          display: 'flex',
          alignItems: 'baseline',
          gap: 8,
          padding: '5px 2px',
          cursor: 'pointer',
          fontSize: 11.5,
        }}
        className="retro-mono"
      >
        <span style={{ color: 'var(--t3)', flexShrink: 0 }}>{formatTime(run.occurred_at)}</span>
        <span style={{ color: 'var(--t1)', flexShrink: 0 }}>{agentName(agents, run.agent_id)}</span>
        <span style={{ color: 'var(--t2)', flexShrink: 0 }}>{run.tool}</span>
        <span style={{ color: 'var(--t3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
          {summarizeIO(run.input, run.output)}
        </span>
        <span
          className="retro-glow"
          style={{ color, flexShrink: 0, textTransform: 'uppercase', fontSize: 10.5, letterSpacing: '0.04em' }}
        >
          {run.status}
          {isHead && <span className="retro-cursor" />}
        </span>
      </div>

      {expanded && (
        <div
          className="retro-mono"
          style={{
            padding: '6px 10px 10px 2px',
            fontSize: 11,
            color: 'var(--t2)',
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
          }}
        >
          <div><span style={{ color: 'var(--t3)' }}>client:</span> {clientName(clients, run.client_id)}</div>
          <div><span style={{ color: 'var(--t3)' }}>tool:</span> {run.tool}</div>
          <div><span style={{ color: 'var(--t3)' }}>input:</span> {JSON.stringify(run.input)}</div>
          <div><span style={{ color: 'var(--t3)' }}>output:</span> {JSON.stringify(run.output)}</div>
          <div><span style={{ color: 'var(--t3)' }}>tokens:</span> <span className="retro-glow">{run.tokens ?? '—'}</span></div>
          <div><span style={{ color: 'var(--t3)' }}>cost:</span> <span className="retro-glow">{run.cost_usd != null ? `$${Number(run.cost_usd).toFixed(4)}` : '—'}</span></div>
          {(run.origin_type || run.origin_id) && (
            <div><span style={{ color: 'var(--t3)' }}>provenance:</span> {run.origin_type ?? '—'}{run.origin_id ? ` / ${run.origin_id}` : ''}</div>
          )}
        </div>
      )}
    </div>
  )
}

interface AgentFeedCardProps {
  feed: AgentRun[]
  agents: Agent[]
  clients: Client[]
}

/**
 * Surface 2 — Live Agent Feed. Reverse-chronological stream of agent_runs
 * steps. Retro phosphor treatment (JetBrains Mono, glow on status/numerals,
 * scanlines, block cursor at the stream head, staggered reveal) is confined
 * to this card. Clicking a row expands full traceable step detail.
 *
 * Polling/visibility handling lives in CrmDataProvider (the shared context)
 * — this card only renders whatever feed rows it's given.
 */
export function AgentFeedCard({ feed, agents, clients }: AgentFeedCardProps) {
  return (
    <Panel
      label="Live Agent Feed"
      badge={feed.length > 0 ? <span className="retro-flicker">streaming</span> : undefined}
      fill
    >
      <div className="retro-scanlines" style={{ height: '100%' }}>
        {feed.length === 0 ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--t3)', fontSize: 12 }}>
            No agent activity, business paused
          </div>
        ) : (
          feed.map((run, i) => (
            <FeedRow
              key={run.id}
              run={run}
              agents={agents}
              clients={clients}
              index={i}
              isHead={i === 0}
            />
          ))
        )}
      </div>
    </Panel>
  )
}
