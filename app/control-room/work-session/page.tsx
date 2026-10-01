'use client'

import { useControlRoomData } from '@/components/dashboard/ControlRoomDataProvider'
import { Panel } from '@/components/dashboard/Panel'
import { NoFeedBadge, StaleBadge } from '@/components/dashboard/control-room/NoFeedBadge'
import { TokenUsageAuditCard } from '@/components/dashboard/control-room/TokenUsageAuditCard'
import { BlastRadiusCard } from '@/components/dashboard/control-room/BlastRadiusCard'
import { WaitingRow } from '@/components/dashboard/control-room/WaitingRow'
import { isStale } from '@/components/dashboard/control-room-types'

const SESSION_ROW_COLS = '158px 1fr 190px 92px 74px'

const CHANGE_WINDOW_DAYS = 14
function daysAgo(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / (24 * 60 * 60 * 1000))
}
function formatDateLabel(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase()
}

/**
 * Section 1 — Work Session (spec R5, corrected 2026-09-10). No search filtering here:
 * R4 scopes the search input to capability/agent cards, which this section doesn't have.
 *
 * Structural change from the first build round: Row A (Plan usage / Agentic OS side by
 * side) is gone from the main column. "Agentic OS" as a standalone card is dropped
 * entirely (its data now surfaces only via the summary strip's build-progress segment).
 * Plan usage, Waiting on you, and Scheduled task health all moved into this page's own
 * right column (R3), which this page now owns directly (no longer rendered by the
 * shared layout).
 */
export default function WorkSessionPage() {
  const { data, loading, hasLoaded } = useControlRoomData()

  if (loading && !hasLoaded) {
    return <div style={{ color: 'var(--t3)', fontSize: 12, padding: '24px 0' }}>Loading Control Room…</div>
  }

  const { capabilities, telemetry } = data
  const liveTelemetry = telemetry.live_sessions
  const sessions = liveTelemetry?.payload.sessions ?? []
  const liveCount = sessions.filter(s => s.status === 'live').length

  const recentTelemetry = telemetry.recent_sessions
  const recent = recentTelemetry?.payload.sessions ?? []

  const taskHealthTelemetry = telemetry.task_health
  const tasks = taskHealthTelemetry?.payload.tasks ?? []
  const healthyCount = tasks.filter(t => t.status === 'ok').length

  const failuresTelemetry = telemetry.failures
  const failuresPayload = failuresTelemetry?.payload ?? null

  const gitTelemetry = telemetry.git_status
  const repos = gitTelemetry?.payload.repos ?? []
  const dirtyCount = repos.filter(r => r.changed_count > 0).length

  // ── What changed (moved here from the right column into Row D, spec R5.3) ────────
  const recentAdditions = capabilities
    .filter(c => daysAgo(c.created_at) <= CHANGE_WINDOW_DAYS)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

  // ── Waiting on you (right column) ─────────────────────────────────────────────────
  const waiting = telemetry.waiting_on_you?.payload ?? null
  const reorgCount = waiting?.reorg_proposals_unapplied ?? 0
  const plannedCaps = capabilities.filter(c => c.status === 'planned')
  const jeaBridge = capabilities.find(c => c.name === 'jea-bridge')
  const actionableCount = (reorgCount > 0 ? 1 : 0) + plannedCaps.length + (jeaBridge ? 1 : 0)
  const waitingEmpty = actionableCount === 0

  return (
    <div className="layout-rail">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 15, minWidth: 0 }}>
        {/* Today's live sessions */}
        <Panel
          label="Today's live sessions"
          action={
            !liveTelemetry ? (
              <NoFeedBadge />
            ) : (
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {isStale(liveTelemetry.captured_at) && <StaleBadge capturedAt={liveTelemetry.captured_at} />}
                <span className="card-badge" style={{ background: 'oklch(0.67 0.19 165 / 0.12)', borderColor: 'oklch(0.67 0.19 165 / 0.28)', color: 'var(--acy)' }}>
                  {liveCount} live
                </span>
                <span className="card-badge">{sessions.length} today</span>
              </span>
            )
          }
        >
          {!liveTelemetry ? (
            <span style={{ fontSize: 11.5, color: 'var(--t2)', lineHeight: 1.5 }}>
              Session telemetry hasn&apos;t been pushed yet. <code>control-room-push.mjs</code> (B1.9) fills this card in every 30 minutes.
            </span>
          ) : sessions.length === 0 ? (
            <span style={{ fontSize: 12.5 }}>No sessions started today.</span>
          ) : (
            // Table-shaped rows: scroll sideways on narrow screens instead of crushing columns.
            <div style={{ overflowX: 'auto' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 640 }}>
              <div style={{ display: 'grid', gridTemplateColumns: SESSION_ROW_COLS, gap: 12, padding: '0 10px 2px' }}>
                {['Repo', 'Session', 'Context window', 'Compactions', 'Elapsed'].map(h => (
                  <span key={h} style={{ fontSize: 10.5, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</span>
                ))}
              </div>
              {sessions.map((s, i) => {
                const amber = (s.context_pct ?? 0) >= 75
                return (
                  <div
                    key={i}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: SESSION_ROW_COLS,
                      gap: 12,
                      alignItems: 'center',
                      padding: '8px 10px',
                      borderRadius: 8,
                      border: `1px solid ${amber ? 'oklch(0.78 0.16 75 / 0.35)' : s.status === 'live' ? 'oklch(0.67 0.19 165 / 0.22)' : 'var(--ui-border)'}`,
                      background: amber ? 'oklch(0.78 0.16 75 / 0.05)' : undefined,
                    }}
                  >
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: 'var(--t2)' }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: s.status === 'live' ? 'var(--ag)' : 'var(--t3)', display: 'inline-block' }} />
                      {s.repo}
                    </span>
                    <span style={{ fontSize: 12.5, color: s.status === 'live' ? undefined : 'var(--t2)' }}>{s.title}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ flex: 1, height: 5, borderRadius: 3, overflow: 'hidden', background: 'oklch(1 0 0 / 0.07)' }}>
                        <div style={{ height: '100%', width: `${s.context_pct ?? 0}%`, background: amber ? 'var(--warn)' : 'var(--ag)' }} />
                      </div>
                      <span style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)', fontSize: 11, width: 34, textAlign: 'right', color: amber ? 'var(--warn)' : undefined }}>
                        {s.context_pct === null ? '—' : `${s.context_pct}%`}
                      </span>
                    </div>
                    <span style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)', fontSize: 11.5, color: amber ? 'var(--warn)' : 'var(--t2)' }}>{s.compactions}</span>
                    <span style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)', fontSize: 11.5, color: 'var(--t2)' }}>{s.duration_label}</span>
                  </div>
                )
              })}
            </div>
            </div>
          )}
        </Panel>

        {/* Token usage · audit — redesigned, sample data until the SessionEnd hook (B7.3) exists */}
        <TokenUsageAuditCard />

        {/* Row D */}
        <div className="layout-2">
          <Panel
            label="Recent sessions"
            action={
              !recentTelemetry ? (
                <NoFeedBadge />
              ) : (
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {isStale(recentTelemetry.captured_at) && <StaleBadge capturedAt={recentTelemetry.captured_at} />}
                  <span className="card-badge">last 5</span>
                </span>
              )
            }
          >
            {!recentTelemetry ? (
              <span style={{ fontSize: 11.5, color: 'var(--t2)' }}>No feed yet. Pushed by control-room-push.mjs (B1.9).</span>
            ) : recent.length === 0 ? (
              <span style={{ fontSize: 12.5 }}>No prior sessions recorded.</span>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {recent.slice(0, 5).map((s, i) => (
                  <div key={i} style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--ui-border)', display: 'flex', flexDirection: 'column', gap: 3 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                      <span style={{ fontSize: 12.5, fontWeight: 500 }}>{s.title}</span>
                      <span style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)', fontSize: 10.5, color: 'var(--t3)' }}>{s.date_label} · {s.duration_label}</span>
                    </div>
                    <span style={{ fontSize: 11, color: 'var(--t2)' }}>{s.summary}</span>
                  </div>
                ))}
              </div>
            )}
          </Panel>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 15 }}>
            {/* What changed — moved here from the right column (spec R5.3) */}
            <Panel label="What changed" badge={`since ${recentAdditions.length > 0 ? formatDateLabel(recentAdditions[recentAdditions.length - 1].created_at) : `${CHANGE_WINDOW_DAYS}d ago`}`}>
              {recentAdditions.length === 0 ? (
                <span style={{ fontSize: 11.5, color: 'var(--t2)' }}>No capability additions in the last {CHANGE_WINDOW_DAYS} days.</span>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                  {recentAdditions.map(cap => (
                    <div key={cap.id} style={{ display: 'flex', gap: 9 }}>
                      <span style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)', fontSize: 10.5, color: 'var(--t3)', width: 38, flexShrink: 0, paddingTop: 1 }}>
                        {formatDateLabel(cap.created_at)}
                      </span>
                      <span style={{ fontSize: 11.5 }}>Capability added · {cap.name}</span>
                    </div>
                  ))}
                </div>
              )}
            </Panel>

            <div className="layout-2">
              <Panel
                label="Failure feed"
                action={
                  !failuresTelemetry ? (
                    <NoFeedBadge />
                  ) : (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {isStale(failuresTelemetry.captured_at) && <StaleBadge capturedAt={failuresTelemetry.captured_at} />}
                      <span className="card-badge">last {failuresPayload?.window_days ?? 30} days</span>
                    </span>
                  )
                }
              >
                {!failuresTelemetry ? (
                  <span style={{ fontSize: 11.5, color: 'var(--t2)' }}>No feed yet. Pushed by control-room-push.mjs (B1.9).</span>
                ) : failuresPayload!.failures.length === 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'flex-start', minHeight: 60, justifyContent: 'center' }}>
                    <svg width={22} height={22} viewBox="0 0 16 16" fill="none">
                      <path d="M3 8.5L6.2 11.5L13 4.5" stroke="var(--ag)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    <span style={{ fontSize: 12.5 }}>No failed runs in {failuresPayload!.window_days} days.</span>
                    <span style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)', fontSize: 10.5, color: 'var(--t3)' }}>{failuresPayload!.clean_run_count} scheduled runs · {failuresPayload!.clean_run_count} clean</span>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {failuresPayload!.failures.map((f, i) => (
                      <div key={i} style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid oklch(0.60 0.22 25 / 0.3)', background: 'oklch(0.60 0.22 25 / 0.05)', display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <span style={{ fontSize: 12, fontWeight: 500 }}>{f.source}</span>
                          <span style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)', fontSize: 10.5, color: 'var(--danger)' }}>{f.date_label}</span>
                        </div>
                        <span style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)', fontSize: 10.5, color: 'var(--t2)' }}>{f.message}</span>
                      </div>
                    ))}
                  </div>
                )}
              </Panel>

              <Panel
                label="Repos"
                action={
                  !gitTelemetry ? (
                    <NoFeedBadge />
                  ) : (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {isStale(gitTelemetry.captured_at) && <StaleBadge capturedAt={gitTelemetry.captured_at} />}
                      {dirtyCount > 0 ? (
                        <span className="card-badge" style={{ color: 'var(--warn)' }}>{dirtyCount} dirty</span>
                      ) : (
                        <span className="card-badge" style={{ color: 'var(--ag)' }}>clean</span>
                      )}
                    </span>
                  )
                }
              >
                {!gitTelemetry ? (
                  <span style={{ fontSize: 11.5, color: 'var(--t2)' }}>No feed yet. Pushed by control-room-push.mjs (B1.9).</span>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {repos.map((r, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--ui-border)' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                          <span style={{ fontSize: 12 }}>{r.name}</span>
                          <span style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)', fontSize: 10.5, color: 'var(--t3)' }}>{r.branch} · {r.sha}</span>
                        </div>
                        <span style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)', fontSize: 11, color: r.changed_count > 0 ? 'var(--warn)' : 'var(--ag)' }}>
                          {r.changed_count > 0 ? `${r.changed_count} changed` : 'clean'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </Panel>
            </div>
          </div>
        </div>
      </div>

      {/* Right column (spec R3, corrected): Plan usage → Waiting on you → Scheduled task health → Blast radius */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 15 }}>
        <Panel label="Plan usage" action={<NoFeedBadge />}>
          {/* No data source exists — nothing exposes the account-level Pro/Max window
              to a script or tool (spec R5.1 / open decision 1). Sample values, per the
              spec's own instruction not to invent a feed. */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 10.5, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>5-hour window</span>
                <span style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)', fontSize: 17, fontWeight: 600, color: 'var(--warn)' }}>72%</span>
              </div>
              <div style={{ height: 7, borderRadius: 3, overflow: 'hidden', background: 'oklch(1 0 0 / 0.07)' }}>
                <div style={{ height: '100%', width: '72%', background: 'var(--warn)' }} />
              </div>
              <span style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)', fontSize: 10.5, color: 'var(--t3)' }}>1h 48m left</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 10.5, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Weekly</span>
                <span style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)', fontSize: 17, fontWeight: 600, color: 'var(--warn)' }}>41%</span>
              </div>
              <div style={{ height: 7, borderRadius: 3, overflow: 'hidden', background: 'oklch(1 0 0 / 0.07)' }}>
                <div style={{ height: '100%', width: '41%', background: 'var(--ag)' }} />
              </div>
              <span style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)', fontSize: 10.5, color: 'var(--t3)' }}>resets Thu</span>
            </div>
            <div style={{ fontSize: 10.5, color: 'var(--t3)', lineHeight: 1.45 }}>Sample values. No plan feed is exposed yet.</div>
          </div>
        </Panel>

        <Panel
          label="Waiting on you"
          action={
            <span
              className="card-badge"
              style={actionableCount > 0 ? { background: 'oklch(0.78 0.16 75 / 0.12)', borderColor: 'oklch(0.78 0.16 75 / 0.3)', color: 'var(--warn)' } : undefined}
            >
              {actionableCount}
            </span>
          }
        >
          {waitingEmpty ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <span style={{ fontSize: 12.5 }}>Nothing needs you right now.</span>
              <span style={{ fontSize: 11, color: 'var(--t2)', lineHeight: 1.45 }}>The queue is empty as of the last telemetry push.</span>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {reorgCount > 0 && (
                <WaitingRow
                  title={`${reorgCount} reorg proposal${reorgCount === 1 ? '' : 's'} unapplied`}
                  description={waiting?.reorg_oldest_date_label ? `Oldest ${waiting.reorg_oldest_date_label}. Say "apply the reorg proposal".` : 'Say "apply the reorg proposal".'}
                  chipLabel="S1"
                  chipColor="var(--warn)"
                  actionable
                />
              )}
              {plannedCaps.map(cap => (
                <WaitingRow key={cap.id} title={`${cap.name} has no trigger`} description="Card is written; nothing schedules it yet." chipLabel="Planned" />
              ))}
              {jeaBridge && (
                <WaitingRow title="jea-bridge · run the smoke test" description="Owed after every auth change to the dashboard API." chipLabel="Manual" chipColor="#d95926" />
              )}
              <WaitingRow title="Nudge queue" dimmed dimmedNote="needs Ares" />
              <WaitingRow title="Draft replies to approve" dimmed dimmedNote="needs Iris" />
            </div>
          )}
        </Panel>

        <Panel
          label="Scheduled task health"
          action={
            !taskHealthTelemetry ? (
              <NoFeedBadge />
            ) : (
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {isStale(taskHealthTelemetry.captured_at) && <StaleBadge capturedAt={taskHealthTelemetry.captured_at} />}
                <span className="card-badge" style={{ color: 'var(--ag)' }}>{healthyCount} healthy</span>
              </span>
            )
          }
        >
          {!taskHealthTelemetry ? (
            <span style={{ fontSize: 11.5, color: 'var(--t2)' }}>No feed yet. Reads `_meta/daily-brain-jea-health.json` and each card&apos;s trigger field.</span>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {tasks.map((t, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 2px' }}>
                  <span style={{ fontSize: 12 }}>{t.name}</span>
                  <span style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)', fontSize: 10.5, color: 'var(--t2)' }}>
                    {t.trigger_label} · <span style={{ color: t.status === 'ok' ? 'var(--ag)' : 'var(--danger)' }}>{t.status}</span>
                    {t.consecutive_failures > 0 && <span style={{ color: 'var(--danger)' }}> · {t.consecutive_failures}x in a row</span>}
                  </span>
                </div>
              ))}
              <div style={{ fontSize: 10.5, color: 'var(--t3)', borderTop: '1px dashed var(--ui-border)', paddingTop: 8, lineHeight: 1.45 }}>
                Reading the health JSON and trigger fields only. Full per-run status arrives with B1.9.
              </div>
            </div>
          )}
        </Panel>

        <BlastRadiusCard />
      </div>
    </div>
  )
}
