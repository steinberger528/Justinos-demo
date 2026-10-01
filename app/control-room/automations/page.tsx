'use client'

import { useMemo, useState } from 'react'
import { useControlRoomData } from '@/components/dashboard/ControlRoomDataProvider'
import { Panel } from '@/components/dashboard/Panel'
import { CapabilityCard } from '@/components/dashboard/control-room/CapabilityCard'
import { AutonomyChip } from '@/components/dashboard/control-room/AutonomyChip'
import { SlotGauge } from '@/components/dashboard/control-room/SlotGauge'
import { RunDayCard } from '@/components/dashboard/control-room/RunDayCard'
import { BlastRadiusCard } from '@/components/dashboard/control-room/BlastRadiusCard'
import { WorkflowStrip } from '@/components/dashboard/control-room/WorkflowStrip'
import { NoFeedBadge } from '@/components/dashboard/control-room/NoFeedBadge'
import { parseScheduleEvents } from '@/lib/control-room-schedule'
import type { Capability } from '@/components/dashboard/control-room-types'

type StatusFilter = 'all' | 'running' | 'planned'

// Rough blended estimate only — no per-run cost logging exists yet (R10's telemetry
// kinds don't include one). Labeled "partial feed" rather than presented as exact.
const EST_USD_PER_MILLION_TOKENS = 3

function findHealth(tasks: { name: string; status: string; trigger_label: string }[] | undefined, name: string) {
  return tasks?.find(t => t.name === name)
}

export default function AutomationsPage() {
  const { data, loading, hasLoaded, search } = useControlRoomData()
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [ownerFilter, setOwnerFilter] = useState<'all' | 'athena' | 'neptune' | 'none'>('all')

  const scheduleEvents = useMemo(() => parseScheduleEvents(data.capabilities), [data.capabilities])

  if (loading && !hasLoaded) {
    return <div style={{ color: 'var(--t3)', fontSize: 12, padding: '24px 0' }}>Loading Control Room…</div>
  }

  const { capabilities, telemetry } = data
  const q = search.trim().toLowerCase()

  const runningCount = capabilities.filter(c => c.status === 'running').length
  const plannedCount = capabilities.filter(c => c.status === 'planned').length
  const athenaCount = capabilities.filter(c => c.agent === 'athena').length
  const neptuneCount = capabilities.filter(c => c.agent === 'neptune').length
  const noneCount = capabilities.filter(c => !c.agent || c.agent === 'none').length

  const visible = capabilities.filter(c => {
    if (q && !c.name.toLowerCase().includes(q)) return false
    if (statusFilter !== 'all' && c.status !== statusFilter) return false
    if (ownerFilter === 'athena' && c.agent !== 'athena') return false
    if (ownerFilter === 'neptune' && c.agent !== 'neptune') return false
    if (ownerFilter === 'none' && c.agent && c.agent !== 'none') return false
    return true
  })

  const byRuntime = (runtime: Capability['runtime']) => visible.filter(c => c.runtime === runtime)
  const scriptCaps = byRuntime('script')
  const sessionCaps = byRuntime('local-session')
  const scheduledCaps = byRuntime('local-scheduled')
  const serverCronCaps = byRuntime('server-cron')
  const cloudCaps = byRuntime('cloud-routine')

  const taskHealthTasks = telemetry.task_health?.payload.tasks

  // Manual leaderboard — ranked by real manual-step count, description pulled from
  // the capability's own most recent manual step text (no fabricated copy).
  const manualLeaderboard = [...capabilities]
    .map(c => ({ cap: c, manualSteps: c.steps.filter(s => s.tag === 'manual') }))
    .filter(x => x.manualSteps.length > 0)
    .sort((a, b) => b.manualSteps.length - a.manualSteps.length)
    .slice(0, 5)
  const totalManualSteps = capabilities.reduce((sum, c) => sum + c.steps.filter(s => s.tag === 'manual').length, 0)
  const totalSteps = capabilities.reduce((sum, c) => sum + c.steps.length, 0)

  const tokenDays = telemetry.token_usage?.payload.days ?? []
  const todayTokens = tokenDays.length > 0 ? Object.values(tokenDays[tokenDays.length - 1].by_repo).reduce((a, b) => a + b, 0) : 0
  const last30 = tokenDays.slice(-30)
  const rolling30Tokens = last30.reduce((sum, d) => sum + Object.values(d.by_repo).reduce((a, b) => a + b, 0), 0)

  // Capabilities with no parseable trigger time at all — excluded from the histogram/
  // list but still counted in the "Run day" card's on-demand note (spec R7.1 edge case).
  const scheduledNames = new Set(scheduleEvents.map(e => e.capabilityName))
  const onDemandCount = capabilities.filter(c => !scheduledNames.has(c.name)).length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 15 }}>
      {/* Page-wide 1fr / 330px split (spec R7, corrected 2026-09-10) — replaces the old
          standalone "24-hour schedule" card and the Cloud-routine-budget/Automation-cost
          row. Left: "Run day · today". Right: this section's own right column
          (Automation cost → Cloud routine budget → Blast radius, spec R3). */}
      <div className="layout-rail" style={{ alignItems: 'stretch' }}>
        <RunDayCard events={scheduleEvents} onDemandCount={onDemandCount} />

        <div style={{ display: 'flex', flexDirection: 'column', gap: 15 }}>
          <Panel label="Automation cost" action={!telemetry.token_usage ? <NoFeedBadge /> : <NoFeedBadge label="partial feed" />}>
            {!telemetry.token_usage ? (
              <span style={{ fontSize: 11.5, color: 'var(--t2)', lineHeight: 1.5 }}>No token telemetry pushed yet. Real per-run cost arrives with B1.9.</span>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
                <div style={{ display: 'flex', gap: 14 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 10.5, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Today (est.)</div>
                    <div style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)', fontSize: 20, fontWeight: 600, marginTop: 2, color: 'var(--warn)' }}>
                      ${((todayTokens / 1_000_000) * EST_USD_PER_MILLION_TOKENS).toFixed(2)}
                    </div>
                    <div style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)', fontSize: 10.5, color: 'var(--t3)', marginTop: 1 }}>{todayTokens.toLocaleString()} tok</div>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 10.5, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Rolling 30d (est.)</div>
                    <div style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)', fontSize: 20, fontWeight: 600, marginTop: 2, color: 'var(--warn)' }}>
                      ${((rolling30Tokens / 1_000_000) * EST_USD_PER_MILLION_TOKENS).toFixed(2)}
                    </div>
                    <div style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)', fontSize: 10.5, color: 'var(--t3)', marginTop: 1 }}>{rolling30Tokens.toLocaleString()} tok</div>
                  </div>
                </div>
                <div style={{ fontSize: 10.5, color: 'var(--t3)', borderTop: '1px dashed var(--ui-border)', paddingTop: 9, lineHeight: 1.45 }}>
                  Estimated from total token usage at a blended ${EST_USD_PER_MILLION_TOKENS}/M rate. No per-capability run log exists yet. Real per-run cost arrives with B1.9.
                </div>
              </div>
            )}
          </Panel>

          <Panel label="Cloud routine budget" badge="5 / day">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <span style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)', fontSize: 20, fontWeight: 600, lineHeight: 1, color: 'var(--warn)' }}>0</span>
                <span style={{ fontSize: 11.5, color: 'var(--t3)' }}>of 5 slots spent today</span>
              </div>
              <SlotGauge spent={0} />
              <div style={{ fontSize: 10.5, color: 'var(--t3)', lineHeight: 1.45 }}>
                Unspent by design. A hosted routine cannot reach the dashboard API, so the unattended work runs as server cron instead.
              </div>
            </div>
          </Panel>

          <BlastRadiusCard />
        </div>
      </div>

      {/* Tier and autonomy key — always on the page, never a tooltip (R7.3) */}
      <div className="glass accent-glow">
        <div className="card-body" style={{ display: 'flex', alignItems: 'center', gap: 26, padding: '11px 15px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 10.5, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Runtime</span>
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 11, color: 'var(--t2)' }}><span style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)', color: 'var(--t1)' }}>script</span>: no judgment, free</span>
              <span style={{ fontSize: 11, color: 'var(--t2)' }}><span style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)', color: 'var(--t1)' }}>local-session</span>: attended</span>
              <span style={{ fontSize: 11, color: 'var(--t2)' }}><span style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)', color: 'var(--t1)' }}>local-scheduled</span>: headless, laptop open</span>
              <span style={{ fontSize: 11, color: 'var(--t2)' }}><span style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)', color: 'var(--t1)' }}>server-cron</span>: laptop closed, Vercel + API</span>
              <span style={{ fontSize: 11, color: 'var(--t2)' }}><span style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)', color: 'var(--t1)' }}>cloud-routine</span>: laptop closed, 1 of 5</span>
            </div>
          </div>
          <div style={{ width: 1, alignSelf: 'stretch', background: 'var(--ui-border)' }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 10.5, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Autonomy</span>
            <div style={{ display: 'flex', gap: 14 }}>
              <span style={{ fontSize: 11, color: 'var(--t2)' }}><AutonomyChip autonomy="S1" /> suggests</span>
              <span style={{ fontSize: 11, color: 'var(--t2)' }}><AutonomyChip autonomy="S2" /> acts on a yes</span>
              <span style={{ fontSize: 11, color: 'var(--t2)' }}><AutonomyChip autonomy="S3" /> acts unattended</span>
            </div>
          </div>
          <div style={{ width: 1, alignSelf: 'stretch', background: 'var(--ui-border)' }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 10.5, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Steps</span>
            <div style={{ display: 'flex', gap: 14 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--t2)' }}><span style={{ width: 10, height: 6, borderRadius: 2, background: '#3987e5', display: 'inline-block' }} />ai</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--t2)' }}><span style={{ width: 10, height: 6, borderRadius: 2, background: '#d95926', display: 'inline-block' }} />manual</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--t2)' }}><span style={{ width: 10, height: 6, borderRadius: 2, background: '#199e70', display: 'inline-block' }} />tool</span>
            </div>
          </div>
        </div>
      </div>

      {/* Filter row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 10.5, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Status</span>
        {(['all', 'running', 'planned'] as StatusFilter[]).map(f => (
          <button
            key={f}
            onClick={() => setStatusFilter(f)}
            className="card-badge"
            style={{
              cursor: 'pointer',
              fontSize: 10.5,
              padding: '2px 9px',
              ...(f === statusFilter ? { background: 'oklch(1 0 0 / 0.09)', color: 'var(--t1)', borderColor: 'oklch(1 0 0 / 0.14)' } : {}),
            }}
          >
            {f === 'all' ? `All ${capabilities.length}` : f === 'running' ? `Running ${runningCount}` : `Planned ${plannedCount}`}
          </button>
        ))}
        <span style={{ width: 1, height: 16, background: 'var(--ui-border)', margin: '0 6px' }} />
        <span style={{ fontSize: 10.5, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Owner</span>
        {(['all', 'athena', 'neptune', 'none'] as const).map(f => (
          <button
            key={f}
            onClick={() => setOwnerFilter(f)}
            className="card-badge"
            style={{
              cursor: 'pointer',
              fontSize: 10.5,
              padding: '2px 9px',
              ...(f === ownerFilter ? { background: 'oklch(1 0 0 / 0.09)', color: 'var(--t1)', borderColor: 'oklch(1 0 0 / 0.14)' } : {}),
            }}
          >
            {f === 'all' ? 'All owners' : f === 'athena' ? `Athena ${athenaCount}` : f === 'neptune' ? `Neptune ${neptuneCount}` : `None ${noneCount}`}
          </button>
        ))}
      </div>

      {q && visible.length === 0 && (
        <div style={{ fontSize: 12, color: 'var(--t3)', padding: '12px 2px' }}>No capability matches &ldquo;{search}&rdquo;.</div>
      )}

      {/* Script tier */}
      <Panel label="Script · free, no judgment" badge={scriptCaps.length}>
        {scriptCaps.length === 0 ? (
          <span style={{ fontSize: 12, color: 'var(--t3)' }}>No script-tier capabilities match the current filters.</span>
        ) : (
          <div className="layout-tiles">
            {scriptCaps.map(cap => {
              const health = findHealth(taskHealthTasks, cap.name)
              return <CapabilityCard key={cap.id} capability={cap} lastRunLabel={health ? `ran ${health.trigger_label}` : undefined} failed={health?.status === 'error'} />
            })}
          </div>
        )}
      </Panel>

      {/* Local session tier */}
      <Panel label="Local session · attended" badge={sessionCaps.length}>
        {sessionCaps.length === 0 ? (
          <span style={{ fontSize: 12, color: 'var(--t3)' }}>No local-session capabilities match the current filters.</span>
        ) : (
          <div className="layout-tiles">
            {sessionCaps.map(cap => (
              <CapabilityCard key={cap.id} capability={cap} />
            ))}
          </div>
        )}
      </Panel>

      {/* Local scheduled + cloud */}
      <div className="layout-split">
        <Panel label="Local scheduled · headless" badge={scheduledCaps.length}>
          {scheduledCaps.length === 0 ? (
            <span style={{ fontSize: 12, color: 'var(--t3)' }}>No local-scheduled capabilities match the current filters.</span>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {scheduledCaps.map(cap => {
                const health = findHealth(taskHealthTasks, cap.name)
                return <CapabilityCard key={cap.id} capability={cap} lastRunLabel={health ? `${health.status} ${health.trigger_label}` : undefined} failed={health?.status === 'error'} />
              })}
            </div>
          )}
        </Panel>

        <Panel label="Laptop closed · server cron + cloud routine" badge={serverCronCaps.length + cloudCaps.length}>
          {serverCronCaps.length + cloudCaps.length === 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'flex-start', justifyContent: 'center', minHeight: 148 }}>
              <svg width={26} height={26} viewBox="0 0 24 24" fill="none" style={{ opacity: 0.35 }}>
                <path d="M6.5 18h11a4 4 0 0 0 .3-8 6 6 0 0 0-11.6-1.2A3.9 3.9 0 0 0 6.5 18Z" stroke="var(--t2)" strokeWidth="1.4" strokeLinejoin="round" />
              </svg>
              <span style={{ fontSize: 12.5, color: 'var(--t2)', lineHeight: 1.5 }}>Nothing runs with the laptop closed yet.</span>
              <span style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)', fontSize: 10.5, color: 'var(--t3)' }}>B2.3 · Neptune</span>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[...serverCronCaps, ...cloudCaps].map(cap => (
                <CapabilityCard key={cap.id} capability={cap} />
              ))}
            </div>
          )}
        </Panel>
      </div>

      {/* Manual leaderboard */}
      <Panel label="Most manual steps left" badge={`${totalManualSteps} of ${totalSteps} steps`}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
          {manualLeaderboard.length === 0 ? (
            <span style={{ fontSize: 12, color: 'var(--t3)' }}>No manual steps recorded across any capability.</span>
          ) : (
            manualLeaderboard.map(({ cap, manualSteps }) => (
              <div key={cap.id} className="layout-cap-row" style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--ui-border)' }}>
                <span style={{ fontSize: 12.5, fontWeight: 500 }}>{cap.name}</span>
                <WorkflowStrip steps={cap.steps} size="aggregate" />
                <span style={{ fontSize: 11, color: 'var(--t2)' }}>{manualSteps[manualSteps.length - 1].text}</span>
              </div>
            ))
          )}
        </div>
      </Panel>
    </div>
  )
}
