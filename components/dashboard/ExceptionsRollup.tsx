'use client'

import Link from 'next/link'
import { Panel } from './Panel'
import { useCrmData } from './CrmDataProvider'

/**
 * Executive Dashboard — counts-only summary of blocked jobs + open
 * escalations, each deep-linking to where they're resolved (blocked jobs ->
 * Agents, escalations -> Workday). Explicitly NOT a duplicate of the full
 * One-Hour Workday card (spec requirement) — no titles, no resolve actions,
 * just the two counts.
 */
export function ExceptionsRollup() {
  const { data } = useCrmData()
  const blockedJobs = data.jobs_by_state.blocked?.length ?? 0
  const openEscalations = data.inbox.length
  const total = blockedJobs + openEscalations

  const rowStyle: React.CSSProperties = {
    textDecoration: 'none',
    color: 'inherit',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '9px 12px',
    borderRadius: 8,
    border: '1px solid oklch(0.78 0.16 75 / 0.28)',
    background: 'oklch(0.78 0.16 75 / 0.06)',
  }

  return (
    <Panel label="Exceptions" badge={String(total)} fill>
      {total === 0 ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--t3)', fontSize: 12 }}>
          No exceptions
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, height: '100%', justifyContent: 'center' }}>
          <Link href="/crm/agents" style={rowStyle}>
            <span style={{ fontSize: 12, color: 'var(--t1)', fontWeight: 500 }}>Blocked jobs</span>
            <span className="retro-mono retro-glow" style={{ fontSize: 16, fontWeight: 600 }}>{blockedJobs}</span>
          </Link>
          <Link href="/crm/workday" style={rowStyle}>
            <span style={{ fontSize: 12, color: 'var(--t1)', fontWeight: 500 }}>Open escalations</span>
            <span className="retro-mono retro-glow" style={{ fontSize: 16, fontWeight: 600 }}>{openEscalations}</span>
          </Link>
        </div>
      )}
    </Panel>
  )
}
