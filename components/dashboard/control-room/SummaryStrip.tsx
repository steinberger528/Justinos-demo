'use client'

import { useControlRoomData } from '../ControlRoomDataProvider'
import { AGENT_STYLE } from './AgentChip'
import { TAG_COLOR } from './WorkflowStrip'
import type { AgentName } from '../control-room-types'

const ALL_AGENTS: AgentName[] = ['neptune', 'athena', 'ares', 'iris']

function Divider() {
  return <div className="cr-summary-divider" style={{ width: 1, background: 'var(--ui-border)', margin: '0 18px', flexShrink: 0 }} />
}

function Segment({ width, wide, children }: { width?: number; wide?: boolean; children: React.ReactNode }) {
  return (
    <div className={wide ? 'cr-summary-wide' : undefined} style={{ flex: width ? `0 0 ${width}px` : 1, display: 'flex', flexDirection: 'column', gap: 3, minWidth: width ? undefined : 0 }}>
      {children}
    </div>
  )
}

const microStyle: React.CSSProperties = { fontSize: 10.5, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '0.06em' }
const monoStyle: React.CSSProperties = { fontFamily: 'var(--font-jetbrains-mono, monospace)' }

/**
 * Summary strip (spec R3) — one `.glass .accent-glow` card, segments for Capabilities,
 * Agents live, Cloud slots today, Agentic OS build, Step mix, and the search input.
 * Renders once in app/control-room/layout.tsx so it persists across section swaps.
 * Note: the spec text says "seven segments" but the approved artboards
 * (work-session.html etc.) show six — built to match the artboards per the spec's own
 * "artboards are the visual source of truth" instruction; flagged as a discrepancy.
 */
export function SummaryStrip() {
  const { data, search, setSearch } = useControlRoomData()
  const { capabilities, goal } = data

  const runningCount = capabilities.filter(c => c.status === 'running').length
  const plannedCount = capabilities.filter(c => c.status === 'planned').length

  const liveAgents = ALL_AGENTS.filter(a => capabilities.some(c => c.agent === a))
  const agentsLabel =
    liveAgents.length === 0
      ? 'none live yet'
      : liveAgents.length === 1
      ? `${AGENT_STYLE[liveAgents[0]].label} only`
      : liveAgents.map(a => AGENT_STYLE[a].label).join(', ')

  const cloudRoutineCount = capabilities.filter(c => c.runtime === 'cloud-routine').length

  const stepCounts = { ai: 0, manual: 0, tool: 0 }
  for (const cap of capabilities) for (const step of cap.steps) if (step.tag in stepCounts) stepCounts[step.tag]++
  const totalSteps = stepCounts.ai + stepCounts.manual + stepCounts.tool

  const doneSteps = goal ? goal.steps.filter(s => s.done).length : null
  const totalGoalSteps = goal ? goal.steps.length : null
  const goalPct = doneSteps !== null && totalGoalSteps ? Math.round((doneSteps / totalGoalSteps) * 100) : 0

  return (
    <div className="glass accent-glow" style={{ marginBottom: 15 }}>
      {/* One row on wide screens; .cr-summary (globals.css) wraps it into a grid below 1400px. */}
      <div className="cr-summary" style={{ padding: '12px 15px' }}>
        <Segment width={148}>
          <span style={microStyle}>Capabilities</span>
          <span style={{ ...monoStyle, fontSize: 21, fontWeight: 600 }}>{capabilities.length}</span>
          <span style={{ fontSize: 10.5, color: 'var(--t3)' }}>{runningCount} running · {plannedCount} planned</span>
        </Segment>
        <Divider />
        <Segment width={148}>
          <span style={microStyle}>Agents live</span>
          <span style={{ ...monoStyle, fontSize: 21, fontWeight: 600 }}>
            {liveAgents.length} <span style={{ color: 'var(--t3)', fontSize: 14 }}>/ {ALL_AGENTS.length}</span>
          </span>
          <span style={{ fontSize: 10.5, color: 'var(--t3)' }}>{agentsLabel}</span>
        </Segment>
        <Divider />
        <Segment width={168}>
          <span style={microStyle}>Cloud slots today</span>
          <span style={{ ...monoStyle, fontSize: 21, fontWeight: 600, color: 'var(--warn)' }}>
            0 <span style={{ color: 'var(--t3)', fontSize: 14 }}>/ 5</span>
          </span>
          <span style={{ fontSize: 10.5, color: 'var(--t3)' }}>{cloudRoutineCount === 0 ? 'none built yet' : `${cloudRoutineCount} routine(s) built`}</span>
        </Segment>
        <Divider />
        <Segment width={196}>
          <span style={microStyle}>Agentic OS build</span>
          <span style={{ ...monoStyle, fontSize: 21, fontWeight: 600 }}>
            {doneSteps === null ? '—' : doneSteps} <span style={{ color: 'var(--t3)', fontSize: 14 }}>{totalGoalSteps === null ? '' : `/ ${totalGoalSteps} steps`}</span>
          </span>
          <div style={{ width: 176, maxWidth: '100%', height: 5, borderRadius: 3, overflow: 'hidden', background: 'oklch(1 0 0 / 0.07)' }}>
            <div style={{ height: '100%', borderRadius: 3, width: `${goalPct}%`, background: 'var(--ag)' }} />
          </div>
        </Segment>
        <Divider />
        <Segment wide>
          <span style={microStyle}>Step mix · {totalSteps} steps across {capabilities.length} capabilities</span>
          <div style={{ display: 'flex', gap: 2, height: 10, borderRadius: 3, overflow: 'hidden' }}>
            {(['ai', 'manual', 'tool'] as const).map(tag =>
              totalSteps > 0 ? (
                <div key={tag} style={{ width: `${(stepCounts[tag] / totalSteps) * 100}%`, background: TAG_COLOR[tag] }} />
              ) : null,
            )}
          </div>
          <div style={{ display: 'flex', gap: 14, fontSize: 10.5, color: 'var(--t2)' }}>
            {(['ai', 'manual', 'tool'] as const).map(tag => (
              <span key={tag} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: TAG_COLOR[tag], display: 'inline-block' }} />
                {tag === 'ai' ? 'AI' : tag === 'manual' ? 'Manual' : 'Tool'} {stepCounts[tag]}
              </span>
            ))}
          </div>
        </Segment>
        <Divider />
        <Segment width={232} wide>
          <div style={{ display: 'flex', alignItems: 'center', height: '100%' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '7px 10px', borderRadius: 7, border: '1px solid var(--ui-border)', background: 'oklch(1 0 0 / 0.03)' }}>
              <svg width={13} height={13} viewBox="0 0 16 16" fill="none" style={{ opacity: 0.4, flexShrink: 0 }}>
                <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.3" />
                <path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
              </svg>
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search capabilities, agents"
                style={{ background: 'transparent', border: 'none', outline: 'none', fontSize: 12, color: 'var(--t1)', width: '100%' }}
              />
            </div>
          </div>
        </Segment>
      </div>
    </div>
  )
}
