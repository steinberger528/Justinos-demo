'use client'

import { Fragment } from 'react'
import { useControlRoomData } from '@/components/dashboard/ControlRoomDataProvider'
import { Panel } from '@/components/dashboard/Panel'
import { AgentChip, AGENT_STYLE } from '@/components/dashboard/control-room/AgentChip'
import type { AgentName } from '@/components/dashboard/control-room-types'

const ALL_AGENTS: AgentName[] = ['neptune', 'athena', 'ares', 'iris']

// Domain × agent coverage matrix rows — closed set from spec R11, minus `meta`
// (matches the approved artboard: the matrix tracks life domains, and nearly every
// capability today is `meta` plumbing, which would swamp the grid).
const DOMAINS: { key: string; label: string }[] = [
  { key: 'school', label: 'School' },
  { key: 'career', label: 'Career' },
  { key: 'business', label: 'Business' },
  { key: 'health', label: 'Health' },
  { key: 'finance', label: 'Finance' },
  { key: 'relationships', label: 'Relationships' },
]

/**
 * Section 2 — Agent Flows (spec R6). Signature flows and the connection graph are
 * hand-curated static content per R6.3/R6's own text ("not derived from data") —
 * flagged in the coverage report, not an invented requirement.
 */
export default function AgentFlowsPage() {
  const { data, loading, hasLoaded, search } = useControlRoomData()

  if (loading && !hasLoaded) {
    return <div style={{ color: 'var(--t3)', fontSize: 12, padding: '24px 0' }}>Loading Control Room…</div>
  }

  const { capabilities } = data
  const q = search.trim().toLowerCase()

  const rosterAgents = ALL_AGENTS.filter(a => !q || AGENT_STYLE[a].label.toLowerCase().includes(q))
  const unowned = capabilities.filter(c => !c.agent || c.agent === 'none')

  const coverage: Record<string, Record<AgentName, number>> = {}
  for (const d of DOMAINS) {
    coverage[d.key] = { neptune: 0, athena: 0, ares: 0, iris: 0 }
    for (const cap of capabilities) {
      if (cap.domain === d.key && cap.agent && cap.agent !== 'none') coverage[d.key][cap.agent as AgentName]++
    }
  }
  const filledCells = DOMAINS.reduce((sum, d) => sum + ALL_AGENTS.filter(a => coverage[d.key][a] > 0).length, 0)

  const agentsWithNoCapability = ALL_AGENTS.filter(a => !capabilities.some(c => c.agent === a))
  const domainsWithNoCapability = DOMAINS.filter(d => !capabilities.some(c => c.domain === d.key)).length

  // Unowned callout copy — derived from the actual `unowned` list grouped by `runtime`
  // rather than hand-naming capabilities, so it stays correct as capabilities change
  // (spec fix: the old hardcoded "jea-bridge and vault-lint" text was wrong — both are
  // script-tier, already covered by "every script-tier capability").
  const nonScript = unowned.filter(c => c.runtime !== 'script')
  const nonScriptGroups = Array.from(new Set(nonScript.map(c => c.runtime))).map(runtime => ({
    runtime,
    names: nonScript.filter(c => c.runtime === runtime).map(c => c.name),
  }))
  const unownedDescription =
    nonScriptGroups.length === 0
      ? 'every script-tier capability.'
      : `every script-tier capability, plus ${nonScriptGroups
          .map(g => `${g.names.length} ${g.runtime} job${g.names.length === 1 ? '' : 's'} (${g.names.join(', ')})`)
          .join(', ')}.`

  return (
    <div className="layout-rail">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 15, minWidth: 0 }}>
      {/* Agent roster */}
      {rosterAgents.length === 0 ? (
        <div style={{ fontSize: 12, color: 'var(--t3)', padding: '12px 2px' }}>No agent matches “{search}”.</div>
      ) : (
        <div className="layout-tiles" style={{ gap: 15 }}>
          {rosterAgents.map(agent => {
            const style = AGENT_STYLE[agent]
            const caps = capabilities.filter(c => c.agent === agent)
            const built = caps.length > 0
            const s1 = caps.filter(c => c.autonomy === 'S1').length
            const s3 = caps.filter(c => c.autonomy === 'S3').length
            return (
              <div key={agent} className="glass accent-glow">
                <div
                  className="card-body"
                  style={{ display: 'flex', flexDirection: 'column', gap: 10, borderTop: `2px solid ${style.color}` }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 14, fontWeight: 600 }}>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: style.color, display: 'inline-block' }} />
                        {style.label}
                      </span>
                      <span style={{ fontSize: 11, color: 'var(--t3)', paddingLeft: 15 }}>{style.role}</span>
                    </div>
                    <span className="card-badge" style={built ? { background: 'oklch(0.67 0.19 165 / 0.12)', borderColor: 'oklch(0.67 0.19 165 / 0.28)', color: 'var(--acy)' } : undefined}>
                      {built ? 'Live' : 'Planned'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                    <span style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)', fontSize: 24, fontWeight: 600, color: built ? undefined : 'var(--t3)' }}>{caps.length}</span>
                    <span style={{ fontSize: 11, color: 'var(--t3)' }}>
                      capabilities{built ? ` · ${s1} S1 · ${s3} S3` : ''}
                    </span>
                  </div>
                  {built ? (
                    <div style={{ display: 'flex', gap: 2, height: 5, borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{ width: `${(s1 / caps.length) * 100}%`, background: style.color, borderRadius: '3px 0 0 3px' }} />
                      <div style={{ width: `${((caps.length - s1) / caps.length) * 100}%`, background: style.color, opacity: 0.35, borderRadius: '0 3px 3px 0' }} />
                    </div>
                  ) : (
                    <div style={{ height: 5, borderRadius: 3, background: 'oklch(1 0 0 / 0.04)' }} />
                  )}
                  <span style={{ fontSize: 11, color: 'var(--t2)', lineHeight: 1.4 }}>
                    {AGENT_TAGLINE[agent]}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Unowned callout */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '11px 15px',
          borderRadius: 14,
          border: '1px dashed oklch(0.78 0.16 75 / 0.35)',
          background: 'oklch(0.78 0.16 75 / 0.05)',
        }}
      >
        <span style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)', fontSize: 17, fontWeight: 600, color: 'var(--warn)' }}>{unowned.length}</span>
        <span style={{ fontSize: 12.5 }}>
          {unowned.length === 1 ? 'capability has' : 'capabilities have'} no owning agent: {unownedDescription}
        </span>
        <span className="card-badge" style={{ marginLeft: 'auto' }}>agent: none</span>
      </div>

      {/* Agent skills · call graph — new card added in the 2026-09-10 artboard revision,
          absent from the original build entirely. Static/illustrative like Signature
          flows below, not derived from data (spec R6.3). */}
      <Panel label="Agent skills · call graph" badge="12 skills · 3 clusters">
        <AgentSkillsGraph />
      </Panel>

      {/* Signature flows — hand-curated per spec R6.3 */}
      <Panel label="Signature flows" badge="4 curated">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {SIGNATURE_FLOWS.map((flow, i) => (
            <div key={flow.name}>
              {i > 0 && <div style={{ height: 1, background: 'oklch(1 0 0 / 0.055)', margin: '0 0 16px' }} />}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 12.5, fontWeight: 600 }}>{flow.name}</span>
                  <span className="card-badge" style={flow.statusColor ? { color: flow.statusColor.color, background: flow.statusColor.bg, borderColor: flow.statusColor.border } : undefined}>
                    {flow.status}
                  </span>
                  <span style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)', fontSize: 10.5, color: 'var(--t3)' }}>{flow.meta}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                  {flow.nodes.map((node, ni) => (
                    <Fragment key={node.text}>
                      {ni > 0 && <span style={{ color: 'var(--t3)', fontSize: 12 }}>→</span>}
                      <span
                        style={{
                          padding: '7px 10px',
                          borderRadius: 8,
                          fontSize: 11.5,
                          whiteSpace: 'nowrap',
                          border: `1px ${node.planned ? 'dashed' : 'solid'} ${node.terminal ? 'oklch(0.78 0.16 75 / 0.5)' : node.color ?? 'var(--ui-border)'}`,
                          background: node.terminal ? 'oklch(0.78 0.16 75 / 0.07)' : 'oklch(1 0 0 / 0.03)',
                          opacity: node.planned ? 0.62 : 1,
                        }}
                      >
                        {node.text}
                      </span>
                    </Fragment>
                  ))}
                </div>
                {flow.legend && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 16, paddingTop: 4 }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 10.5, color: 'var(--t2)' }}>
                      <span style={{ width: 14, height: 0, borderTop: '2px solid var(--t2)', display: 'inline-block' }} />built
                    </span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 10.5, color: 'var(--t2)' }}>
                      <span style={{ width: 14, height: 0, borderTop: '2px dashed var(--t2)', display: 'inline-block' }} />planned
                    </span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 10.5, color: 'var(--t2)' }}>
                      <span style={{ width: 8, height: 8, borderRadius: 2, background: 'var(--warn)', display: 'inline-block' }} />reaches you
                    </span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </Panel>

      {/* What talks to what — full-width on its own row (spec R6.5, corrected
          2026-09-10: no longer paired side-by-side with the domain matrix, which
          moved to the right column below — see the artboard's own layout). */}
      <Panel label="What talks to what" badge="7 edges">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <LibrarianGraph />
          <div style={{ fontSize: 10.5, color: 'var(--t3)', borderTop: '1px dashed var(--ui-border)', paddingTop: 9, lineHeight: 1.45 }}>
            Edges are hand-curated from the librarian&apos;s step list. A generic wikilink crawl would draw &quot;see also&quot; lines that aren&apos;t real calls. A <span style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)' }}>talks_to</span> field is the open decision.
          </div>
        </div>
      </Panel>

      {/* Gaps + promotion */}
      <div className="layout-2">
        <Panel label="Coverage gaps" badge={<span style={{ color: 'var(--warn)' }}>{[agentsWithNoCapability.length > 0, unowned.length > 0, domainsWithNoCapability > 0].filter(Boolean).length}</span>}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--ui-border)' }}>
              <span style={{ fontSize: 12 }}>Agents with no capability</span>
              <span style={{ display: 'inline-flex', gap: 5 }}>
                {agentsWithNoCapability.length === 0 ? <span style={{ fontSize: 11, color: 'var(--t3)' }}>none</span> : agentsWithNoCapability.map(a => <AgentChip key={a} agent={a} />)}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--ui-border)' }}>
              <span style={{ fontSize: 12 }}>Capabilities with no owner</span>
              <span style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)', fontSize: 13, color: 'var(--warn)' }}>{unowned.length}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--ui-border)' }}>
              <span style={{ fontSize: 12 }}>Domains with no capability</span>
              <span style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)', fontSize: 13, color: 'var(--warn)' }}>{domainsWithNoCapability} of {DOMAINS.length}</span>
            </div>
          </div>
        </Panel>

        <Panel label="Promotion tracking" badge="S1 → S2">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {PROMOTION_CANDIDATES.map(c => (
              <div key={c.name} style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '8px 10px', borderRadius: 8, border: '1px dashed var(--ui-border)', opacity: 0.45 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 12 }}>{c.name}</span>
                  <span style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)', fontSize: 10.5, color: 'var(--t3)' }}>candidate</span>
                </div>
                <span style={{ fontSize: 11, color: 'var(--t2)' }}>{c.note}</span>
              </div>
            ))}
            <div style={{ fontSize: 10.5, color: 'var(--t3)', borderTop: '1px dashed var(--ui-border)', paddingTop: 9, lineHeight: 1.45 }}>
              Promotion happens on logged evidence, never on a schedule. The log itself is B7.6. Until it exists this card can only guess.
            </div>
          </div>
        </Panel>
      </div>
      </div>

      {/* Right column (spec R3 revision text says Waiting on you / What changed /
          Blast radius here — but the re-synced artboard's actual right column has
          neither of those for Agent Flows; it shows Domain × agent coverage and Live
          agent feed instead. Per this task's explicit instruction, the artboard wins
          over the spec's prose — flagged in the coverage report. */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 15 }}>
        <Panel label="Domain × agent coverage" badge={`${filledCells} of ${DOMAINS.length * ALL_AGENTS.length} filled`}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '90px repeat(4, minmax(0, 1fr))', gap: 5, alignItems: 'center' }}>
              <span />
              {ALL_AGENTS.map(a => (
                <span key={a} style={{ fontSize: 10.5, color: AGENT_STYLE[a].color, textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: 'center' }}>
                  {AGENT_STYLE[a].label.slice(0, 4)}
                </span>
              ))}
              {DOMAINS.map(d => (
                <Fragment key={d.key}>
                  <span style={{ fontSize: 11.5 }}>{d.label}</span>
                  {ALL_AGENTS.map(a => {
                    const count = coverage[d.key][a]
                    return (
                      <div
                        key={a}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          height: 26,
                          borderRadius: 6,
                          border: '1px solid oklch(1 0 0 / 0.05)',
                          background: 'oklch(1 0 0 / 0.015)',
                          fontFamily: 'var(--font-jetbrains-mono, monospace)',
                          fontSize: 11,
                          color: 'var(--t3)',
                        }}
                      >
                        {count > 0 ? count : ''}
                      </div>
                    )
                  })}
                </Fragment>
              ))}
            </div>
            <span style={{ fontSize: 10.5, color: 'var(--t3)', borderTop: '1px dashed var(--ui-border)', paddingTop: 9, lineHeight: 1.45 }}>
              {filledCells === 0
                ? 'Every capability built so far serves the machinery, not a domain. The empty grid is the build queue.'
                : `${filledCells} of ${DOMAINS.length * ALL_AGENTS.length} cells filled. Empty cells are still the build queue.`}
            </span>
          </div>
        </Panel>

        <Panel
          label="Live agent feed"
          className="flex-1"
          action={
            <span className="card-badge" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: 'var(--ag)', borderColor: 'oklch(0.67 0.19 165 / 0.3)', background: 'oklch(0.67 0.19 165 / 0.12)' }}>
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--ag)', display: 'inline-block' }} />
              live
            </span>
          }
        >
          <LiveAgentFeed />
        </Panel>
      </div>
    </div>
  )
}

const AGENT_TAGLINE: Record<AgentName, string> = {
  neptune: 'Owns the day: briefs, re-planning, and every Telegram delivery.',
  athena: 'Memory, filing, profile, research, learning.',
  ares: 'Decides what deserves a nudge. Never delivers one himself.',
  iris: 'Triage, commitments, drafts. Never sends without a yes.',
}

// ── Hand-curated, static content (spec R6.3 — "not derived from data") ──────────────
interface FlowNode {
  text: string
  color?: string
  planned?: boolean
  terminal?: boolean
}
interface SignatureFlow {
  name: string
  status: string
  statusColor?: { color: string; bg: string; border: string }
  meta: string
  nodes: FlowNode[]
  legend?: boolean
}

const LIVE_CHIP = { color: 'var(--acy)', bg: 'oklch(0.67 0.19 165 / 0.12)', border: 'oklch(0.67 0.19 165 / 0.28)' }
const WARN_CHIP = { color: 'var(--warn)', bg: 'oklch(0.78 0.16 75 / 0.12)', border: 'oklch(0.78 0.16 75 / 0.3)' }

const SIGNATURE_FLOWS: SignatureFlow[] = [
  {
    name: 'Nightly librarian',
    status: 'Running',
    statusColor: LIVE_CHIP,
    meta: '07:30 daily · Athena',
    nodes: [
      { text: 'sweep-sessions', color: 'var(--warn)' },
      { text: 'file-inbox', color: 'var(--warn)' },
      { text: 'index-regeneration' },
      { text: 'capabilities-push' },
      { text: 'propose-reorg S1', color: 'var(--warn)' },
      { text: 'commit-sweep' },
      { text: 'you, in the morning', terminal: true },
    ],
  },
  {
    name: 'Morning brief',
    status: 'Running',
    statusColor: LIVE_CHIP,
    meta: 'server cron, 6:00 hour · Neptune',
    nodes: [
      { text: 'canvas-sync, an hour earlier' },
      { text: 'build-day · gather rules, events, tasks', color: 'var(--ac)' },
      { text: 'one model call places the day', color: 'var(--ac)' },
      { text: 'validate in code' },
      { text: 'Telegram brief + questions', color: 'var(--ac)' },
      { text: 'your phone, 6:00 hour', terminal: true },
    ],
  },
  {
    name: 'Re-plan',
    status: 'Running',
    statusColor: LIVE_CHIP,
    meta: 'on a message · Neptune',
    nodes: [
      { text: 'message on Telegram', terminal: true },
      { text: 'router · replan_day', color: 'var(--ac)' },
      { text: 'single-block move in code' },
      { text: 'or one model call, max 6 a day', color: 'var(--ac)' },
      { text: 'write plan + calendar sync' },
      { text: 'new timeline on your phone', terminal: true },
    ],
  },
  {
    name: 'Nudge',
    status: 'Planned',
    statusColor: WARN_CHIP,
    meta: 'Ares decides · Neptune delivers',
    nodes: [
      { text: 'stale-sweep', color: 'var(--danger)', planned: true },
      { text: 'nudge queue', color: 'var(--danger)', planned: true },
      { text: 'Neptune delivers', color: 'var(--ac)', planned: true },
      { text: 'capture pipeline' },
      { text: 'Athena files the reply', color: 'var(--warn)' },
    ],
    legend: true,
  },
]

const PROMOTION_CANDIDATES = [
  { name: 'propose-reorg', note: 'Five proposals produced and none rejected, but nothing logs that yet.' },
  { name: 'vault-lint', note: 'Read-only by design. Promotion would mean fixing lint findings automatically.' },
]

/** Hand-curated 6-node graph — the librarian's own step order (spec R6, not a generic wikilink crawl). */
function LibrarianGraph() {
  return (
    <svg viewBox="0 0 490 268" width="100%" height={268} style={{ display: 'block' }}>
      <line x1="245" y1="134" x2="105" y2="52" stroke="oklch(0.76 0.17 78 / 0.45)" strokeWidth={1.5} />
      <line x1="245" y1="134" x2="392" y2="52" stroke="oklch(0.76 0.17 78 / 0.45)" strokeWidth={1.5} />
      <line x1="245" y1="134" x2="86" y2="196" stroke="oklch(0.76 0.17 78 / 0.45)" strokeWidth={1.5} />
      <line x1="245" y1="134" x2="245" y2="238" stroke="oklch(0.76 0.17 78 / 0.45)" strokeWidth={1.5} />
      <line x1="245" y1="134" x2="404" y2="196" stroke="oklch(0.76 0.17 78 / 0.45)" strokeWidth={1.5} />
      <line x1="404" y1="196" x2="404" y2="248" stroke="oklch(1 0 0 / 0.18)" strokeWidth={1.5} strokeDasharray="4 4" />
      <line x1="86" y1="196" x2="86" y2="248" stroke="oklch(1 0 0 / 0.18)" strokeWidth={1.5} strokeDasharray="4 4" />

      <circle cx="245" cy="134" r="30" fill="oklch(0.76 0.17 78 / 0.14)" stroke="oklch(0.76 0.17 78)" strokeWidth={1.5} />
      <text x="245" y="132" textAnchor="middle" fontSize={11} fontWeight={600} fill="var(--t1)">librarian</text>
      <text x="245" y="145" textAnchor="middle" fontSize={9} fill="var(--t2)" fontFamily="var(--font-jetbrains-mono, monospace)">Athena</text>

      <g fontSize={10.5} fill="var(--t1)">
        <rect x="36" y="38" width="138" height="28" rx="7" fill="oklch(0.15 0.018 255 / 0.9)" stroke="oklch(1 0 0 / 0.12)" /><text x="105" y="56" textAnchor="middle">sweep-sessions</text>
        <rect x="323" y="38" width="138" height="28" rx="7" fill="oklch(0.15 0.018 255 / 0.9)" stroke="oklch(1 0 0 / 0.12)" /><text x="392" y="56" textAnchor="middle">file-inbox</text>
        <rect x="17" y="182" width="138" height="28" rx="7" fill="oklch(0.15 0.018 255 / 0.9)" stroke="oklch(1 0 0 / 0.12)" /><text x="86" y="200" textAnchor="middle">index-regeneration</text>
        <rect x="176" y="224" width="138" height="28" rx="7" fill="oklch(0.15 0.018 255 / 0.9)" stroke="oklch(1 0 0 / 0.12)" /><text x="245" y="242" textAnchor="middle">propose-reorg</text>
        <rect x="335" y="182" width="138" height="28" rx="7" fill="oklch(0.15 0.018 255 / 0.9)" stroke="oklch(1 0 0 / 0.12)" /><text x="404" y="200" textAnchor="middle">capabilities-push</text>
        <rect x="335" y="234" width="138" height="26" rx="7" fill="oklch(0.15 0.018 255 / 0.5)" stroke="oklch(1 0 0 / 0.08)" strokeDasharray="4 4" /><text x="404" y="251" textAnchor="middle" fill="var(--t2)" fontSize={10}>Supabase</text>
        <rect x="17" y="234" width="138" height="26" rx="7" fill="oklch(0.15 0.018 255 / 0.5)" stroke="oklch(1 0 0 / 0.08)" strokeDasharray="4 4" /><text x="86" y="251" textAnchor="middle" fill="var(--t2)" fontSize={10}>INDEX.md</text>
      </g>
    </svg>
  )
}

/**
 * "Agent skills · call graph" (spec R6.3, new in the 2026-09-10 artboard revision) —
 * three dashed cluster boxes (Vault core / Bridge & data / Delivery), skill-level
 * nodes, directional edges with inline labels, and a legend distinguishing built vs.
 * planned skills and S1-suggests vs. S3-acts-unattended edges. Static markup copied
 * from the artboard's own structure, same posture as Signature flows — illustrative,
 * not derived from data.
 */
function AgentSkillsGraph() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <svg viewBox="0 0 1352 400" width="100%" style={{ display: 'block', background: 'oklch(0.09 0.012 255 / 0.55)', borderRadius: 10 }}>
        <defs>
          <pattern id="sk-dots" width={18} height={18} patternUnits="userSpaceOnUse">
            <circle cx={1} cy={1} r={1} fill="oklch(1 0 0 / 0.055)" />
          </pattern>
          <marker id="sk-arrow" viewBox="0 0 10 10" refX={9} refY={5} markerWidth={6} markerHeight={6} orient="auto-start-reverse">
            <path d="M0,1 L9,5 L0,9 z" fill="oklch(0.55 0.02 255)" />
          </marker>
        </defs>
        <rect x={0} y={0} width={1352} height={400} fill="url(#sk-dots)" />

        <rect x={8} y={10} width={440} height={380} rx={12} fill="oklch(0.76 0.17 78 / 0.055)" stroke="oklch(0.76 0.17 78 / 0.30)" strokeDasharray="5 5" />
        <rect x={460} y={10} width={440} height={380} rx={12} fill="oklch(0.67 0.19 165 / 0.055)" stroke="oklch(0.67 0.19 165 / 0.30)" strokeDasharray="5 5" />
        <rect x={912} y={10} width={432} height={380} rx={12} fill="oklch(0.67 0.19 240 / 0.055)" stroke="oklch(0.67 0.19 240 / 0.30)" strokeDasharray="5 5" />

        <g fontFamily="var(--font-space-grotesk, sans-serif)">
          <circle cx={32} cy={38} r={5} fill="oklch(0.76 0.17 78)" />
          <text x={46} y={43} fontSize={15} fontWeight={600} fill="var(--t1)">Vault core</text>
          <rect x={140} y={29} width={64} height={18} rx={4} fill="oklch(0.76 0.17 78 / 0.14)" />
          <text x={172} y={42} textAnchor="middle" fontFamily="var(--font-jetbrains-mono, monospace)" fontSize={9.5} fill="oklch(0.76 0.17 78)">ATHENA</text>
          <text x={216} y={42} fontFamily="var(--font-jetbrains-mono, monospace)" fontSize={10.5} fill="var(--t3)">4 skills · S1 + S3</text>

          <circle cx={484} cy={38} r={5} fill="var(--ag)" />
          <text x={498} y={43} fontSize={15} fontWeight={600} fill="var(--t1)">Bridge &amp; data</text>
          <rect x={612} y={29} width={58} height={18} rx={4} fill="oklch(0.67 0.19 165 / 0.14)" />
          <text x={641} y={42} textAnchor="middle" fontFamily="var(--font-jetbrains-mono, monospace)" fontSize={9.5} fill="var(--ag)">UNOWNED</text>
          <text x={682} y={42} fontFamily="var(--font-jetbrains-mono, monospace)" fontSize={10.5} fill="var(--t3)">4 skills · scripts</text>

          <circle cx={936} cy={38} r={5} fill="var(--ac)" />
          <text x={950} y={43} fontSize={15} fontWeight={600} fill="var(--t1)">Delivery</text>
          <rect x={1030} y={29} width={70} height={18} rx={4} fill="oklch(0.67 0.19 240 / 0.14)" />
          <text x={1065} y={42} textAnchor="middle" fontFamily="var(--font-jetbrains-mono, monospace)" fontSize={9.5} fill="var(--ac)">NEPTUNE</text>
          <text x={1112} y={42} fontFamily="var(--font-jetbrains-mono, monospace)" fontSize={10.5} fill="var(--t3)">4 skills · server cron</text>
        </g>

        <g fill="none" stroke="oklch(0.55 0.02 255 / 0.6)" strokeWidth={1.4} markerEnd="url(#sk-arrow)">
          <path d="M208,124 L232,124" />
          <path d="M124,148 C124,196 124,220 124,252" />
          <path d="M208,284 L232,284" />
          <path d="M408,124 C444,124 442,186 486,186 C596,186 650,186 682,148" />
          <path d="M776,148 C776,196 776,220 776,252" />
          <path d="M576,148 C576,232 880,244 940,138" />
          <path d="M860,284 L936,284" />
          <path d="M1112,124 L1136,124" />
          <path d="M1228,148 C1228,196 1228,220 1228,252" />
          <path d="M1112,284 L1136,284" />
          <path d="M492,284 L416,284" />
          <path d="M324,148 C398,152 430,124 484,124" />
          <path d="M1028,308 C830,372 300,374 128,316" />
        </g>

        <g fontFamily="var(--font-space-grotesk, sans-serif)" fontSize={11}>
          <rect x={40} y={100} width={168} height={48} rx={8} fill="oklch(0.13 0.014 255)" stroke="oklch(1 0 0 / 0.10)" /><rect x={40} y={100} width={3.5} height={48} rx={2} fill="oklch(0.76 0.17 78)" />
          <text x={55} y={118} fontFamily="var(--font-jetbrains-mono, monospace)" fontSize={9} letterSpacing="0.08em" fill="oklch(0.76 0.17 78)">SCRIPT · S3</text>
          <text x={55} y={137} fontSize={13} fontWeight={600} fill="var(--t1)">sweep-sessions</text>

          <rect x={240} y={100} width={168} height={48} rx={8} fill="oklch(0.13 0.014 255)" stroke="oklch(1 0 0 / 0.10)" /><rect x={240} y={100} width={3.5} height={48} rx={2} fill="var(--ag)" />
          <text x={255} y={118} fontFamily="var(--font-jetbrains-mono, monospace)" fontSize={9} letterSpacing="0.08em" fill="var(--ag)">TOOL · S3</text>
          <text x={255} y={137} fontSize={13} fontWeight={600} fill="var(--t1)">index-regeneration</text>

          <rect x={40} y={260} width={168} height={48} rx={8} fill="oklch(0.13 0.014 255)" stroke="oklch(1 0 0 / 0.10)" /><rect x={40} y={260} width={3.5} height={48} rx={2} fill="oklch(0.76 0.17 78)" />
          <text x={55} y={278} fontFamily="var(--font-jetbrains-mono, monospace)" fontSize={9} letterSpacing="0.08em" fill="oklch(0.76 0.17 78)">SCRIPT · S3</text>
          <text x={55} y={297} fontSize={13} fontWeight={600} fill="var(--t1)">file-inbox</text>

          <rect x={240} y={260} width={168} height={48} rx={8} fill="oklch(0.13 0.014 255)" stroke="oklch(1 0 0 / 0.10)" /><rect x={240} y={260} width={3.5} height={48} rx={2} fill="var(--warn)" />
          <text x={255} y={278} fontFamily="var(--font-jetbrains-mono, monospace)" fontSize={9} letterSpacing="0.08em" fill="var(--warn)">SUGGEST · S1</text>
          <text x={255} y={297} fontSize={13} fontWeight={600} fill="var(--t1)">propose-reorg</text>

          <rect x={492} y={100} width={168} height={48} rx={8} fill="oklch(0.13 0.014 255)" stroke="oklch(1 0 0 / 0.10)" /><rect x={492} y={100} width={3.5} height={48} rx={2} fill="var(--ag)" />
          <text x={507} y={118} fontFamily="var(--font-jetbrains-mono, monospace)" fontSize={9} letterSpacing="0.08em" fill="var(--ag)">BRIDGE · CLI</text>
          <text x={507} y={137} fontSize={13} fontWeight={600} fill="var(--t1)">jea-bridge</text>

          <rect x={692} y={100} width={168} height={48} rx={8} fill="oklch(0.13 0.014 255)" stroke="oklch(1 0 0 / 0.10)" /><rect x={692} y={100} width={3.5} height={48} rx={2} fill="var(--ag)" />
          <text x={707} y={118} fontFamily="var(--font-jetbrains-mono, monospace)" fontSize={9} letterSpacing="0.08em" fill="var(--ag)">SYNC · S3</text>
          <text x={707} y={137} fontSize={13} fontWeight={600} fill="var(--t1)">capabilities-push</text>

          <rect x={492} y={260} width={168} height={48} rx={8} fill="oklch(0.13 0.014 255)" stroke="oklch(1 0 0 / 0.10)" /><rect x={492} y={260} width={3.5} height={48} rx={2} fill="var(--warn)" />
          <text x={507} y={278} fontFamily="var(--font-jetbrains-mono, monospace)" fontSize={9} letterSpacing="0.08em" fill="var(--warn)">AUDIT · READ-ONLY</text>
          <text x={507} y={297} fontSize={13} fontWeight={600} fill="var(--t1)">vault-lint</text>

          <rect x={692} y={260} width={168} height={48} rx={8} fill="oklch(0.13 0.014 255 / 0.6)" stroke="oklch(1 0 0 / 0.08)" strokeDasharray="4 4" />
          <text x={707} y={278} fontFamily="var(--font-jetbrains-mono, monospace)" fontSize={9} letterSpacing="0.08em" fill="var(--t3)">STORE</text>
          <text x={707} y={297} fontSize={13} fontWeight={600} fill="var(--t2)">Supabase</text>

          <rect x={944} y={100} width={168} height={48} rx={8} fill="oklch(0.13 0.014 255)" stroke="oklch(1 0 0 / 0.10)" /><rect x={944} y={100} width={3.5} height={48} rx={2} fill="var(--ac)" />
          <text x={959} y={118} fontFamily="var(--font-jetbrains-mono, monospace)" fontSize={9} letterSpacing="0.08em" fill="var(--ac)">PLAN · S3</text>
          <text x={959} y={137} fontSize={13} fontWeight={600} fill="var(--t1)">build-day</text>

          <rect x={1144} y={100} width={168} height={48} rx={8} fill="oklch(0.13 0.014 255)" stroke="oklch(1 0 0 / 0.10)" /><rect x={1144} y={100} width={3.5} height={48} rx={2} fill="var(--ac)" />
          <text x={1159} y={118} fontFamily="var(--font-jetbrains-mono, monospace)" fontSize={9} letterSpacing="0.08em" fill="var(--ac)">COMPOSE · AI</text>
          <text x={1159} y={137} fontSize={13} fontWeight={600} fill="var(--t1)">morning-brief</text>

          <rect x={944} y={260} width={168} height={48} rx={8} fill="oklch(0.13 0.014 255)" stroke="oklch(1 0 0 / 0.10)" /><rect x={944} y={260} width={3.5} height={48} rx={2} fill="var(--ag)" />
          <text x={959} y={278} fontFamily="var(--font-jetbrains-mono, monospace)" fontSize={9} letterSpacing="0.08em" fill="var(--ag)">INGEST · S3</text>
          <text x={959} y={297} fontSize={13} fontWeight={600} fill="var(--t1)">capture-pipeline</text>

          <rect x={1144} y={260} width={168} height={48} rx={8} fill="oklch(0.13 0.014 255)" stroke="oklch(1 0 0 / 0.10)" /><rect x={1144} y={260} width={3.5} height={48} rx={2} fill="var(--warn)" />
          <text x={1159} y={278} fontFamily="var(--font-jetbrains-mono, monospace)" fontSize={9} letterSpacing="0.08em" fill="var(--warn)">DELIVER · TELEGRAM</text>
          <text x={1159} y={297} fontSize={13} fontWeight={600} fill="var(--t1)">reaches you</text>
        </g>

        <g fontFamily="var(--font-space-grotesk, sans-serif)" fontSize={10.5} fill="var(--t2)">
          <rect x={58} y={192} width={132} height={20} rx={5} fill="oklch(0.16 0.014 255)" stroke="oklch(1 0 0 / 0.09)" /><text x={124} y={206} textAnchor="middle">hands off captures</text>
          <rect x={512} y={176} width={110} height={20} rx={5} fill="oklch(0.16 0.014 255)" stroke="oklch(1 0 0 / 0.09)" /><text x={567} y={190} textAnchor="middle">registry delta</text>
          <rect x={736} y={162} width={80} height={20} rx={5} fill="oklch(0.16 0.014 255)" stroke="oklch(1 0 0 / 0.09)" /><text x={776} y={176} textAnchor="middle">upsert rows</text>
          <rect x={690} y={222} width={168} height={20} rx={5} fill="oklch(0.16 0.014 255)" stroke="oklch(1 0 0 / 0.09)" /><text x={774} y={236} textAnchor="middle">fixed_events + tasks</text>
          <rect x={1188} y={192} width={80} height={20} rx={5} fill="oklch(0.16 0.014 255)" stroke="oklch(1 0 0 / 0.09)" /><text x={1228} y={206} textAnchor="middle">6:00 brief</text>
          <rect x={512} y={342} width={128} height={20} rx={5} fill="oklch(0.16 0.014 255)" stroke="oklch(1 0 0 / 0.09)" /><text x={576} y={356} textAnchor="middle">replies file back</text>
          <rect x={418} y={274} width={72} height={20} rx={5} fill="oklch(0.16 0.014 255)" stroke="oklch(1 0 0 / 0.09)" /><text x={454} y={288} textAnchor="middle" fontSize={9.5}>findings</text>
        </g>
      </svg>
      <div style={{ display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 10.5, color: 'var(--t2)' }}>
          <span style={{ width: 12, height: 12, borderRadius: 3, border: '1px solid oklch(1 0 0 / 0.16)', background: 'oklch(0.13 0.014 255)', display: 'inline-block' }} />built skill
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 10.5, color: 'var(--t2)' }}>
          <span style={{ width: 12, height: 12, borderRadius: 3, border: '1px dashed oklch(1 0 0 / 0.22)', display: 'inline-block' }} />planned skill
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 10.5, color: 'var(--t2)' }}>
          <span style={{ width: 3, height: 12, borderRadius: 2, background: 'var(--warn)', display: 'inline-block' }} />needs your yes (S1)
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 10.5, color: 'var(--t2)' }}>
          <span style={{ width: 3, height: 12, borderRadius: 2, background: 'var(--ag)', display: 'inline-block' }} />acts unattended (S3)
        </span>
        <span style={{ marginLeft: 'auto', fontSize: 10.5, color: 'var(--t3)' }}>
          Edges are declared calls, not <span style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)' }}>[[wikilinks]]</span>.
        </span>
      </div>
    </div>
  )
}

interface FeedEntry {
  agent: string
  color: string
  time: string
  message: string
  chip?: { label: string; color: string; bg: string; border: string }
  dimmed?: boolean
}

const LIVE_FEED_ENTRIES: FeedEntry[] = [
  { agent: 'Athena', color: 'oklch(0.76 0.17 78)', time: '07:31:04', message: 'Swept 14 session notes. 2 reorg proposals waiting on your yes.' },
  { agent: 'capabilities-push', color: 'var(--ag)', time: '07:30:52', message: 'Upserted 23 rows to the database. Registry now matches the vault.' },
  {
    agent: 'vault-lint',
    color: 'var(--warn)',
    time: '07:29:18',
    message: '3 orphaned notes and 1 broken link. Read-only, nothing changed.',
    chip: { label: 'needs you', color: 'var(--warn)', bg: 'oklch(0.78 0.16 75 / 0.12)', border: 'oklch(0.78 0.16 75 / 0.3)' },
  },
  { agent: 'Athena', color: 'oklch(0.76 0.17 78)', time: '07:28:40', message: 'Filed 6 inbox captures into School and Agency.' },
  { agent: 'index-regeneration', color: 'var(--ag)', time: '07:28:02', message: 'INDEX.md rebuilt in 1.4s. 212 notes, 9 domains.' },
  { agent: 'Neptune', color: 'var(--ac)', time: '06:54:12', message: 'Morning brief sent. 11 blocks placed, 4 questions asked.' },
  {
    agent: 'jea-bridge',
    color: '#d95926',
    time: 'last week',
    message: 'Auth token rotated. Smoke test owed before the next brief.',
    chip: { label: 'manual', color: '#d95926', bg: 'oklch(0.60 0.20 40 / 0.12)', border: 'oklch(0.60 0.20 40 / 0.3)' },
  },
]

/**
 * "Live agent feed" — present in the re-synced artboard's right column but absent
 * from every version of the spec text (R1-R12). No telemetry kind in R10 covers a
 * free-form agent activity log, so this is hand-curated/static, same posture as
 * Signature flows — flagged in the coverage report as an artboard-only addition.
 */
function LiveAgentFeed() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {LIVE_FEED_ENTRIES.map((entry, i) => (
        <div key={i}>
          {i > 0 && <div style={{ height: 1, background: 'oklch(1 0 0 / 0.05)', margin: '0 -15px' }} />}
          <div style={{ display: 'flex', gap: 9, padding: '9px 0', opacity: entry.dimmed ? 0.45 : 1, background: entry.chip?.label === 'needs you' ? 'oklch(0.78 0.16 75 / 0.05)' : undefined }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: entry.color, flexShrink: 0, marginTop: 5 }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 7 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: entry.dimmed ? undefined : entry.color }}>{entry.agent}</span>
                <span style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)', fontSize: 10.5, color: 'var(--t3)' }}>{entry.time}</span>
              </div>
              <span style={{ fontSize: 11.5, color: entry.dimmed ? 'var(--t2)' : 'var(--t1)', lineHeight: 1.42 }}>{entry.message}</span>
              {entry.chip && (
                <span
                  className="card-badge"
                  style={{ alignSelf: 'flex-start', marginTop: 2, color: entry.chip.color, background: entry.chip.bg, borderColor: entry.chip.border }}
                >
                  {entry.chip.label}
                </span>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
