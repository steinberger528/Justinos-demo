'use client'

import { useCallback, useState } from 'react'
import { Panel } from './Panel'
import { clientName, type Agent, type Client, type InboxItem } from './crm-types'

const CAP = 6

interface OneHourWorkdayCardProps {
  inbox: InboxItem[]
  clients: Client[]
  agents: Agent[]
  onResolved: () => void
  onDirtyChange: (dirty: boolean) => void
}

/**
 * Surface 1 — One-Hour Workday: the capped decision inbox. Shows blocked-agent
 * escalations and needs-input jobs — the few high-leverage things the operator must
 * personally do today. Never renders an unbounded list.
 */
export function OneHourWorkdayCard({ inbox, clients, agents, onResolved, onDirtyChange }: OneHourWorkdayCardProps) {
  const [resolvingId, setResolvingId] = useState<string | null>(null)
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())

  // Dismissal key includes occurred_at (bumped whenever the underlying job/
  // agent row updates) so a genuinely re-blocked item — which gets a fresh
  // occurred_at — is a new key and is not hidden by a stale dismissal.
  const dismissKey = (item: InboxItem) => `${item.source}:${item.id}:${item.occurred_at}`

  const visible = inbox.filter(item => !dismissed.has(dismissKey(item)))
  const shown = visible.slice(0, CAP)
  const overflow = visible.length - shown.length

  const resolve = useCallback(async (item: InboxItem) => {
    const key = dismissKey(item)
    setResolvingId(key)
    onDirtyChange(true)
    try {
      const res = await fetch(`/api/crm/escalations/${item.id}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: item.source }),
      })
      if (res.ok) {
        setDismissed(prev => new Set(prev).add(key))
        onResolved()
      } else {
        console.error('[crm] escalation resolve failed', await res.text())
      }
    } catch (e) {
      console.error('[crm] escalation resolve error', e)
    } finally {
      setResolvingId(null)
      onDirtyChange(false)
    }
  }, [onResolved, onDirtyChange])

  return (
    <Panel label="One-Hour Workday" badge={shown.length > 0 ? `${visible.length}` : undefined} fill>
      {shown.length === 0 ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--t3)', fontSize: 12 }}>
          All clear. Agents are running unattended.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {shown.map(item => {
            const key = dismissKey(item)
            const agentLabel = agents.find(a => a.id === item.agent_id)?.name ?? 'Unknown agent'
            return (
              <div
                key={key}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 10,
                  padding: '7px 10px',
                  borderRadius: 8,
                  border: '1px solid oklch(0.78 0.16 75 / 0.28)',
                  background: 'oklch(0.78 0.16 75 / 0.06)',
                }}
              >
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 12, color: 'var(--t1)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {item.title}
                  </div>
                  <div style={{ fontSize: 10.5, color: 'var(--t3)', marginTop: 2 }}>
                    {agentLabel}{item.client_id ? ` · ${clientName(clients, item.client_id)}` : ''} · {item.reason}
                  </div>
                </div>
                <button
                  onClick={() => resolve(item)}
                  disabled={resolvingId === key}
                  style={{
                    background: 'var(--retro-amber, oklch(0.78 0.16 75))',
                    border: 'none',
                    borderRadius: 6,
                    color: 'oklch(0.15 0 0)',
                    cursor: resolvingId === key ? 'not-allowed' : 'pointer',
                    fontSize: 10.5,
                    fontWeight: 600,
                    opacity: resolvingId === key ? 0.6 : 1,
                    padding: '4px 10px',
                    flexShrink: 0,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {resolvingId === key ? 'Resolving…' : 'Resolve'}
                </button>
              </div>
            )
          })}

          {overflow > 0 && (
            <div style={{ color: 'var(--t3)', fontSize: 10.5, textAlign: 'center', padding: '2px 0' }}>
              +{overflow} more
            </div>
          )}
        </div>
      )}
    </Panel>
  )
}
