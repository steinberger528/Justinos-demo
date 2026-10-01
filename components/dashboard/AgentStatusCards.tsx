'use client'

import { Panel } from './Panel'
import { AGENT_STATUS_COLOR, clientName, type Agent, type Client } from './crm-types'

interface AgentStatusCardsProps {
  agents: Agent[]
  clients: Client[]
}

/**
 * Surface 3 — Agent Status Cards. One compact card per agent: name, role,
 * color-coded status chip, current_task, client, last_output preview.
 * `blocked` is visually distinct (amber, drives the inbox); `error` (red) is
 * clearly differentiated. Exactly the five enum states — no extra noise.
 */
export function AgentStatusCards({ agents, clients }: AgentStatusCardsProps) {
  return (
    <Panel label="Agents" badge={agents.length > 0 ? String(agents.length) : undefined} fill>
      {agents.length === 0 ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--t3)', fontSize: 12 }}>
          No agents yet.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {agents.map(agent => {
            const color = AGENT_STATUS_COLOR[agent.status]
            const isEscalation = agent.status === 'blocked'
            return (
              <div
                key={agent.id}
                style={{
                  padding: '8px 10px',
                  borderRadius: 8,
                  border: `1px solid ${isEscalation ? 'oklch(0.78 0.16 75 / 0.35)' : 'oklch(1 0 0 / 0.07)'}`,
                  background: isEscalation ? 'oklch(0.78 0.16 75 / 0.05)' : 'transparent',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <div style={{ minWidth: 0 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--t1)' }}>{agent.name}</span>
                    <span style={{ fontSize: 10.5, color: 'var(--t3)', marginLeft: 6 }}>{agent.role}</span>
                  </div>
                  <span
                    style={{
                      flexShrink: 0,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      fontSize: 10.5,
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      padding: '2px 7px',
                      borderRadius: 20,
                      color,
                      background: `color-mix(in oklch, ${color} 15%, transparent)`,
                      border: `1px solid color-mix(in oklch, ${color} 40%, transparent)`,
                    }}
                  >
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: color, display: 'inline-block' }} />
                    {agent.status}
                  </span>
                </div>
                <div style={{ fontSize: 11, color: 'var(--t2)', marginTop: 4 }}>
                  {agent.current_task ?? <span style={{ color: 'var(--t3)' }}>No active task</span>}
                </div>
                <div style={{ fontSize: 10.5, color: 'var(--t3)', marginTop: 2, display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <span>{clientName(clients, agent.current_client_id)}</span>
                </div>
                {agent.last_output && (
                  <div
                    className="retro-mono"
                    style={{
                      fontSize: 10.5,
                      color: 'var(--t3)',
                      marginTop: 5,
                      padding: '4px 7px',
                      borderRadius: 5,
                      background: 'oklch(1 0 0 / 0.03)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {agent.last_output}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </Panel>
  )
}
