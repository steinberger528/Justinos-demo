'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Panel } from '@/components/dashboard/Panel'
import { AGENT_STYLE } from '@/components/dashboard/control-room/AgentChip'
import { AutonomyChip } from '@/components/dashboard/control-room/AutonomyChip'
import { chipStyle, NEUTRAL_CHIP_STYLE } from '@/components/dashboard/control-room/chip-style'
import type { AgentName } from '@/components/dashboard/control-room-types'
import { ReplyButtons } from '@/components/demo/ReplyButtons'
import { runCapture, suggestQuickMove, type PipelineResult } from '@/lib/demo/capture'
import { getDb } from '@/lib/demo/db'
import { runLibrarian, type LibrarianStep } from '@/lib/demo/librarian'
import type { AuditRow } from '@/lib/demo/types'

/**
 * Control Room, section 0: how the system works.
 *
 * This section exists only in the demo. The other three sections are the production
 * status pages; this one is the walkthrough a visitor needs before those make sense.
 * The two interactive panels run against the demo database, so what they write shows
 * up on the other tabs.
 */

const mono: React.CSSProperties = { fontFamily: 'var(--font-jetbrains-mono, monospace)' }
const micro: React.CSSProperties = { fontSize: 10.5, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '0.06em' }
const prose: React.CSSProperties = { fontSize: 12.5, lineHeight: 1.6, color: 'oklch(0.78 0.015 255)' }

const ATHENA = 'oklch(0.76 0.17 78)'
const NEPTUNE = 'var(--ac)'
const SCRIPT = 'var(--ag)'

// ── The picture ──────────────────────────────────────────────────────────────

interface NodeProps {
  x: number
  y: number
  w: number
  h: number
  title: string
  lines: string[]
  color?: string
  /** Dashed outline: this part needs the laptop to be open. */
  laptop?: boolean
}

function Node({ x, y, w, h, title, lines, color, laptop }: NodeProps) {
  return (
    <g>
      <rect
        x={x} y={y} width={w} height={h} rx={9}
        fill="oklch(0.13 0.014 255)"
        stroke={color ?? 'oklch(1 0 0 / 0.14)'}
        strokeOpacity={color ? 0.55 : 1}
        strokeDasharray={laptop ? '5 4' : undefined}
      />
      {color && <rect x={x} y={y} width={3.5} height={h} rx={2} fill={color} />}
      <text x={x + 14} y={y + 22} fontSize={13.5} fontWeight={600} fill="var(--t1)">{title}</text>
      {lines.map((line, i) => (
        <text key={line} x={x + 14} y={y + 40 + i * 14} fontSize={10.5} fill="var(--t2)" fontFamily="var(--font-jetbrains-mono, monospace)">
          {line}
        </text>
      ))}
    </g>
  )
}

function SystemPicture() {
  return (
    <svg viewBox="0 0 1180 372" width="100%" style={{ display: 'block', background: 'oklch(0.09 0.012 255 / 0.55)', borderRadius: 10 }} role="img" aria-label="Diagram of the system: captures go through a router into the database, which the dashboard, the agents and the vault all read and write.">
      <defs>
        <marker id="ov-arrow" viewBox="0 0 10 10" refX={9} refY={5} markerWidth={6} markerHeight={6} orient="auto-start-reverse">
          <path d="M0,1 L9,5 L0,9 z" fill="oklch(0.6 0.02 255)" />
        </marker>
      </defs>

      <g fill="none" stroke="oklch(0.6 0.02 255 / 0.7)" strokeWidth={1.4} markerEnd="url(#ov-arrow)">
        <path d="M206,58 L238,58" />
        <path d="M430,58 L468,58" />
        <path d="M206,172 L238,172" />
        <path d="M950,172 L982,172" />
      </g>
      <g fill="none" stroke="oklch(0.6 0.02 255 / 0.7)" strokeWidth={1.4} markerEnd="url(#ov-arrow)" markerStart="url(#ov-arrow)">
        <path d="M712,58 L748,58" />
        <path d="M432,172 L468,172" />
        <path d="M712,172 L748,172" />
        <path d="M335,206 L335,282" />
        <path d="M432,316 L468,316" />
      </g>

      <Node x={16} y={26} w={190} h={64} title="Capture" lines={['Telegram text and voice', 'Dashboard capture bar']} />
      <Node x={240} y={26} w={190} h={64} title="Router" color={NEPTUNE} lines={['One model call sorts', 'each message into routes']} />
      <Node x={16} y={140} w={190} h={64} title="Feeds" lines={['Course calendar', 'Google Calendar']} />
      <Node x={240} y={140} w={190} h={64} title="Scripts" color={SCRIPT} lines={['No model, free to run', 'One direction per script']} />

      <rect x={470} y={26} width={240} height={178} rx={11} fill="oklch(0.13 0.014 255)" stroke="oklch(1 0 0 / 0.2)" />
      <text x={486} y={50} fontSize={14} fontWeight={600} fill="var(--t1)">Database</text>
      <text x={486} y={68} fontSize={10.5} fill="var(--t2)" fontFamily="var(--font-jetbrains-mono, monospace)">Postgres with vector search</text>
      {['tasks and school items', 'day plans and rules', 'goals, habits, journal', 'ideas and memory', 'audit log of every write'].map((line, i) => (
        <text key={line} x={486} y={96 + i * 20} fontSize={11.5} fill="var(--t1)">{line}</text>
      ))}

      <Node x={750} y={26} w={200} h={64} title="Dashboard" lines={['Next.js app', 'The tabs you are looking at']} />
      <Node x={750} y={140} w={200} h={64} title="Neptune" color={NEPTUNE} lines={['Plans and re-plans the day', 'Runs on a server cron']} />
      <Node x={984} y={140} w={180} h={64} title="Phone" lines={['Telegram: the brief,', 'replies and check-ins']} />

      <Node x={240} y={284} w={190} h={64} title="Vault" color={ATHENA} laptop lines={['Markdown notes in git', 'Long-term memory']} />
      <Node x={470} y={284} w={240} h={64} title="Athena" color={ATHENA} laptop lines={['Files and indexes the vault nightly', 'Headless session on the laptop']} />

      <g fontSize={10.5} fill="var(--t2)">
        <rect x={750} y={292} width={16} height={12} rx={3} fill="oklch(0.13 0.014 255)" stroke="oklch(1 0 0 / 0.3)" />
        <text x={774} y={302}>runs with the laptop closed</text>
        <rect x={750} y={316} width={16} height={12} rx={3} fill="oklch(0.13 0.014 255)" stroke="oklch(1 0 0 / 0.3)" strokeDasharray="4 3" />
        <text x={774} y={326}>needs the laptop open</text>
      </g>
    </svg>
  )
}

// ── Agents ───────────────────────────────────────────────────────────────────

const AGENTS: { agent: AgentName; live: boolean; body: string }[] = [
  { agent: 'neptune', live: true, body: 'Owns the day. Builds the plan each morning, rebuilds it from a text message, and delivers every message that reaches the phone. The only agent that works with the laptop closed.' },
  { agent: 'athena', live: true, body: 'Owns memory. Files notes and ideas into the vault each night, keeps its indexes current, and proposes cleanups without applying them.' },
  { agent: 'ares', live: false, body: 'Will decide what deserves a nudge, then hand it to Neptune to deliver.' },
  { agent: 'iris', live: false, body: 'Will triage email, pull out commitments and draft replies. It will never send one without a yes.' },
]

// ── A day ────────────────────────────────────────────────────────────────────

interface DayStep {
  time: string
  title: string
  owner: string
  color: string
  laptop: boolean
  body: string
}

const DAY: DayStep[] = [
  { time: '03:15', title: 'Daily brain', owner: 'headless session', color: SCRIPT, laptop: true, body: 'A headless session writes an evidence-only note of what happened yesterday. The part that says what got done is pushed to the database for the planner.' },
  { time: '05:00', title: 'Course sync', owner: 'script', color: SCRIPT, laptop: false, body: 'Assignments from the course calendar feed become School tasks. If a date was changed by hand, the sync reports the conflict and writes nothing.' },
  { time: '06:00', title: 'Morning brief', owner: 'Neptune', color: NEPTUNE, laptop: false, body: 'Neptune gathers the rules, fixed events and open tasks, makes one model call to place the day, checks the result in code, and sends the plan to the phone with a few questions.' },
  { time: '07:00', title: 'Vault catches up', owner: 'scripts', color: SCRIPT, laptop: true, body: 'The database is mirrored into the vault as markdown, and new idea captures are pulled into its inbox.' },
  { time: '07:30', title: 'Librarian', owner: 'Athena', color: ATHENA, laptop: true, body: 'Athena files the inbox, rebuilds the indexes and writes a reorg proposal. Filing is automatic. The reorg waits for a yes.' },
  { time: '09:00', title: 'Cutoff', owner: 'Neptune', color: NEPTUNE, laptop: false, body: 'Answers to the morning questions are applied and the plan becomes final.' },
  { time: '10 · 14 · 20', title: 'Heartbeat', owner: 'Neptune', color: NEPTUNE, laptop: true, body: 'Checks five things that can go wrong with the day. It sends one message when something did and stays silent when nothing did.' },
  { time: 'any time', title: 'Re-plan', owner: 'Neptune', color: NEPTUNE, laptop: false, body: 'A message like "workout at 5" moves one block in code. Anything bigger gets one model call, capped at six a day.' },
  { time: 'evening', title: 'Recap', owner: 'Neptune', color: NEPTUNE, laptop: false, body: "A message about how the day went is filed as evidence for tomorrow's plan. Evidence can prompt a question. It never marks a task done." },
  { time: '12 · 18 · 23', title: 'Commit sweep', owner: 'script', color: SCRIPT, laptop: true, body: 'Commits anything a scheduled task wrote but never committed, for example when the laptop slept in the middle of a run.' },
]

// ── The two dials ────────────────────────────────────────────────────────────

const RUNTIMES: [string, string][] = [
  ['script', 'No model judgment. A cron job or a plain Node script. Free.'],
  ['local-session', 'Runs inside a session someone is attending. Needs local files or tools.'],
  ['local-scheduled', 'Headless Claude Code started by Task Scheduler. The laptop has to be open.'],
  ['server-cron', 'Runs on Vercel and calls the model API directly. Works with the laptop closed.'],
  ['cloud-routine', 'A hosted routine, limited to five runs a day. Nothing uses one yet.'],
]

const EXAMPLES = [
  'Email Dr. Ellison about the midterm by Friday',
  'Lunch with Sam tomorrow at 1pm',
  'idea: let the planner learn how long tasks really take',
  'tasks: renew passport, buy a desk lamp, call the dentist',
  'new goal: read 20 books, target 20',
  'how is the half marathon going?',
  'good morning',
]

const WHAT_IS_REAL: [string, string][] = [
  ['Same as production', 'The cards and layouts on every tab are the production components, with personal details replaced.'],
  ['Replaced', 'The API and database run in your browser. Keyword rules stand in for the model that routes captures. Telegram replies appear on screen.'],
  ['Left out', 'Voice transcription, reading photos, embeddings, Google Calendar, the course feed and the vault itself.'],
  ['Invented', 'Every name, number and date you see.'],
]

function pendingCaptures(): number {
  if (typeof window === 'undefined') return 0
  return getDb().ideaCaptures.filter(c => c.status === 'pending').length
}

function recentAudit(): AuditRow[] {
  if (typeof window === 'undefined') return []
  return getDb().audit.slice(0, 9)
}

const buttonStyle: React.CSSProperties = {
  padding: '6px 13px', borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: 'pointer',
  color: 'var(--t1)', background: 'oklch(0.67 0.19 165 / 0.16)', border: '1px solid oklch(0.67 0.19 165 / 0.38)',
}

export default function ControlRoomOverviewPage() {
  const [message, setMessage] = useState('')
  const [result, setResult] = useState<PipelineResult | null>(null)
  const [sent, setSent] = useState('')

  const [pending, setPending] = useState(pendingCaptures)
  const [librarianSteps, setLibrarianSteps] = useState<LibrarianStep[]>([])
  const [shown, setShown] = useState(0)
  const [filed, setFiled] = useState<number | null>(null)

  const [audit, setAudit] = useState<AuditRow[]>(recentAudit)

  // One example moves a block on today's plan. Which move is clean depends on the day,
  // so it is worked out from the plan rather than hard-coded.
  const [quickMove] = useState(() => (typeof window === 'undefined' ? null : suggestQuickMove()))
  const examples = quickMove ? [...EXAMPLES.slice(0, 3), quickMove, ...EXAMPLES.slice(3)] : EXAMPLES

  // Reveal the nightly run one step at a time, the way it would scroll past in a log.
  useEffect(() => {
    if (shown >= librarianSteps.length) return
    const t = setTimeout(() => setShown(n => n + 1), 520)
    return () => clearTimeout(t)
  }, [shown, librarianSteps.length])

  function send(text: string) {
    const trimmed = text.trim()
    if (!trimmed) return
    setResult(runCapture(trimmed, 'telegram'))
    setSent(trimmed)
    setMessage('')
    setPending(pendingCaptures())
    setAudit(recentAudit())
  }

  // A tapped keyboard button: the bot edits its message and the keyboard goes away.
  function answered(index: number, text: string) {
    setResult(prev => prev && {
      ...prev,
      replies: prev.replies.map((reply, i) => (i === index ? { from: reply.from, text } : reply)),
    })
    setAudit(recentAudit())
  }

  function runNightly() {
    const run = runLibrarian()
    setLibrarianSteps(run.steps)
    setShown(0)
    setFiled(run.filed)
    setPending(pendingCaptures())
    setAudit(recentAudit())
  }

  const running = shown < librarianSteps.length

  return (
    <div className="layout-rail">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 15, minWidth: 0 }}>
        <Panel label="The system in one picture" badge="simplified">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <p style={prose}>
              The dashboard is the part you can see. Behind it, two agents and a set of plain scripts run on
              schedules, share one database and one folder of notes, and report to a phone over Telegram. The
              other tabs are where their work shows up.
            </p>
            <div style={{ overflowX: 'auto' }}>
              <div style={{ minWidth: 760 }}>
                <SystemPicture />
              </div>
            </div>
          </div>
        </Panel>

        <Panel label="Send a message through the pipeline" badge="simulated router">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
            <p style={prose}>
              Every message takes the same path, whether it was typed here or spoken into Telegram. In production
              the routing step is one Claude call with a forced tool call. The demo swaps that call for keyword
              rules and keeps every other step. What you send here is written to the demo data, so a new task
              will be on Home afterwards.
            </p>
            <form
              onSubmit={e => { e.preventDefault(); send(message) }}
              style={{ display: 'flex', gap: 8 }}
            >
              <input
                value={message}
                onChange={e => setMessage(e.target.value)}
                placeholder="Type a message as you would text it"
                aria-label="Message to route"
                style={{ flex: 1, minWidth: 0, padding: '8px 11px', borderRadius: 8, fontSize: 13, color: 'var(--t1)', background: 'oklch(0 0 0 / 0.22)', border: '1px solid oklch(1 0 0 / 0.12)', outline: 'none' }}
              />
              <button type="submit" style={buttonStyle} disabled={!message.trim()}>Send</button>
            </form>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {examples.map(example => (
                <button
                  key={example}
                  type="button"
                  onClick={() => send(example)}
                  className="card-badge"
                  style={{ cursor: 'pointer', fontSize: 11, padding: '3px 10px', color: 'var(--t2)' }}
                >
                  {example}
                </button>
              ))}
            </div>

            {result && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, borderTop: '1px solid oklch(1 0 0 / 0.07)', paddingTop: 11 }}>
                <span style={micro}>Trace for &quot;{sent}&quot;</span>
                <ol style={{ display: 'flex', flexDirection: 'column', gap: 6, listStyle: 'none', padding: 0, margin: 0 }}>
                  {result.steps.map((step, i) => (
                    <li key={`${step.label}-${i}`} style={{ display: 'flex', gap: 10, alignItems: 'baseline' }}>
                      <span style={{ ...mono, fontSize: 11, color: 'var(--t3)', width: 16, flexShrink: 0 }}>{i + 1}</span>
                      <span style={{ ...mono, fontSize: 11.5, color: 'var(--acy)', width: 118, flexShrink: 0 }}>{step.label}</span>
                      <span style={{ fontSize: 12.5, lineHeight: 1.5 }}>{step.detail}</span>
                    </li>
                  ))}
                </ol>
                <div className="layout-2" style={{ gap: 10 }}>
                  <div>
                    <span style={micro}>Router output</span>
                    <pre style={{ ...mono, fontSize: 11, lineHeight: 1.5, color: 'var(--t2)', margin: '5px 0 0', padding: '9px 11px', borderRadius: 8, background: 'oklch(0 0 0 / 0.25)', border: '1px solid oklch(1 0 0 / 0.07)', whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 220, overflowY: 'auto' }}>
                      {JSON.stringify(result.routes, null, 2)}
                    </pre>
                  </div>
                  <div>
                    <span style={micro}>Reply on the phone</span>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 5 }}>
                      {result.replies.length === 0 && <span style={{ fontSize: 12, color: 'var(--t3)' }}>Nothing to reply to.</span>}
                      {result.replies.map((reply, i) => (
                        <div key={i} style={{ padding: '8px 11px', borderRadius: 10, background: 'oklch(0.67 0.19 240 / 0.1)', border: '1px solid oklch(0.67 0.19 240 / 0.32)' }}>
                          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--ac)', marginBottom: 2 }}>{reply.from}</div>
                          <div style={{ fontSize: 12.5, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{reply.text}</div>
                          <ReplyButtons message={reply} onAnswered={text => answered(i, text)} />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </Panel>

        <Panel label="Run tonight's librarian" badge="simulated run">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
            <p style={prose}>
              An idea captured on the Journal tab is only queued. Overnight a script pulls it into the vault,
              Athena files it under a theme, and another script pushes the organized note back to the dashboard.
              The real run starts at 07:30 as a headless session. This button plays the same steps against the
              demo data.
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <button type="button" style={{ ...buttonStyle, opacity: running ? 0.6 : 1 }} disabled={running} onClick={runNightly}>
                {running ? 'Running…' : 'Run the nightly routine'}
              </button>
              <span style={{ ...mono, fontSize: 11.5, color: 'var(--t2)' }}>
                {pending} capture{pending === 1 ? '' : 's'} waiting
              </span>
              <Link href="/journal" style={{ fontSize: 12, color: 'var(--acy)' }}>Capture an idea on Journal →</Link>
            </div>

            {librarianSteps.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7, borderTop: '1px solid oklch(1 0 0 / 0.07)', paddingTop: 11 }}>
                {librarianSteps.slice(0, shown).map((step, i) => (
                  <div key={`${step.capability}-${i}`} className="retro-reveal" style={{ display: 'flex', gap: 10, alignItems: 'baseline' }}>
                    <span style={{ ...mono, fontSize: 11.5, width: 138, flexShrink: 0, color: step.owner === 'Athena' ? ATHENA : SCRIPT }}>{step.capability}</span>
                    <span style={{ flexShrink: 0 }}><AutonomyChip autonomy={step.autonomy} /></span>
                    <span style={{ fontSize: 12.5, lineHeight: 1.5 }}>{step.detail}</span>
                  </div>
                ))}
                {!running && filed !== null && filed > 0 && (
                  <Link href="/journal" style={{ fontSize: 12, color: 'var(--acy)', marginTop: 2 }}>
                    See the {filed} filed idea{filed === 1 ? '' : 's'} on Journal →
                  </Link>
                )}
              </div>
            )}
          </div>
        </Panel>

        <Panel label="A day in the system" badge={`${DAY.length} moments`}>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {DAY.map((step, i) => (
              <div key={step.title} style={{ display: 'flex', gap: 12, padding: '9px 0', borderTop: i === 0 ? 'none' : '1px solid oklch(1 0 0 / 0.055)' }}>
                <span style={{ ...mono, fontSize: 11.5, color: 'var(--t2)', width: 82, flexShrink: 0, paddingTop: 1 }}>{step.time}</span>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>{step.title}</span>
                    <span style={chipStyle(step.color, 12, 30)}>{step.owner}</span>
                    <span style={NEUTRAL_CHIP_STYLE}>{step.laptop ? 'laptop' : 'server'}</span>
                  </div>
                  <p style={{ ...prose, marginTop: 3 }}>{step.body}</p>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 15 }}>
        <Panel label="Four agents" badge="2 live · 2 planned">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {AGENTS.map(({ agent, live, body }) => {
              const style = AGENT_STYLE[agent]
              return (
                <div key={agent} style={{ padding: '9px 11px', borderRadius: 9, border: `1px ${live ? 'solid' : 'dashed'} var(--ui-border)`, borderLeft: `3px solid ${style.color}`, opacity: live ? 1 : 0.72 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>
                      {style.label} <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--t2)' }}>{style.role}</span>
                    </span>
                    <span style={live ? { ...chipStyle('var(--ag)', 12, 28), color: 'var(--acy)' } : NEUTRAL_CHIP_STYLE}>{live ? 'Live' : 'Planned'}</span>
                  </div>
                  <p style={{ fontSize: 12, lineHeight: 1.55, color: 'var(--t2)', marginTop: 4 }}>{body}</p>
                </div>
              )
            })}
          </div>
        </Panel>

        <Panel label="Two dials on every automation">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={micro}>Where it runs</span>
              {RUNTIMES.map(([name, body]) => (
                <div key={name} style={{ fontSize: 12, lineHeight: 1.5, color: 'var(--t2)' }}>
                  <span style={{ ...mono, color: 'var(--t1)' }}>{name}</span> {body}
                </div>
              ))}
              <p style={{ fontSize: 11.5, lineHeight: 1.5, color: 'var(--t3)' }}>
                The rule: use a script when no judgment is needed, stay local when the work touches local
                files, and pay for a server run only when it has to happen with the laptop closed.
              </p>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, borderTop: '1px solid oklch(1 0 0 / 0.07)', paddingTop: 11 }}>
              <span style={micro}>How much it may do alone</span>
              <div style={{ fontSize: 12, color: 'var(--t2)' }}><AutonomyChip autonomy="S1" /> Suggests. A person does the work.</div>
              <div style={{ fontSize: 12, color: 'var(--t2)' }}><AutonomyChip autonomy="S2" /> Proposes one action and waits for a yes.</div>
              <div style={{ fontSize: 12, color: 'var(--t2)' }}><AutonomyChip autonomy="S3" /> Acts without asking.</div>
              <p style={{ fontSize: 11.5, lineHeight: 1.5, color: 'var(--t3)' }}>
                Sending email, deleting notes and anything involving money never reach S3. A capability moves
                up a level on logged evidence, never on a schedule.
              </p>
            </div>
          </div>
        </Panel>

        <Panel label="Audit trail" badge="this browser">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            <p style={{ fontSize: 12, lineHeight: 1.55, color: 'var(--t2)' }}>
              Every write in production adds a row to an audit log. The demo does the same, so these are
              your own clicks.
            </p>
            {audit.length === 0 ? (
              <span style={{ fontSize: 12, color: 'var(--t3)' }}>Nothing yet. Check off a task, then come back.</span>
            ) : (
              audit.map(row => (
                <div key={row.id} style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, fontSize: 11.5 }}>
                  <span style={{ ...mono, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    <span style={{ color: 'var(--acy)' }}>{row.action}</span> {row.resource_type}
                  </span>
                  <span style={{ ...mono, color: 'var(--t3)', flexShrink: 0 }}>
                    {new Date(row.at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}
                  </span>
                </div>
              ))
            )}
            <button type="button" className="card-badge" style={{ alignSelf: 'flex-start', cursor: 'pointer', marginTop: 2 }} onClick={() => setAudit(recentAudit())}>
              Refresh
            </button>
          </div>
        </Panel>

        <Panel label="What is real in this demo">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
            {WHAT_IS_REAL.map(([name, body]) => (
              <div key={name}>
                <div style={{ fontSize: 12, fontWeight: 600 }}>{name}</div>
                <div style={{ fontSize: 12, lineHeight: 1.55, color: 'var(--t2)' }}>{body}</div>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  )
}
