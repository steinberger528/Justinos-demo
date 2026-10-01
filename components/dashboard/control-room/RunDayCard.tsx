'use client'

import {
  computeHourlyHistogram,
  findBusiestHour,
  findLongestQuietWindow,
  findNextRun,
  formatHourMinute,
  type ScheduleEvent,
} from '@/lib/control-room-schedule'
import { Panel } from '../Panel'
import { AGENT_STYLE } from './AgentChip'
import { TAG_COLOR } from './WorkflowStrip'

interface RunDayCardProps {
  events: ScheduleEvent[]
  /** Capabilities with no parseable trigger time — excluded from the histogram/list but still counted (spec R7.1 edge case). */
  onDemandCount: number
}

function formatBoundary(minuteOfDay: number): string {
  const hour = Math.floor(minuteOfDay / 60) % 24
  const minute = minuteOfDay % 60
  return minute === 0 ? String(hour).padStart(2, '0') : formatHourMinute(hour, minute)
}

function formatHours(hours: number): string {
  const rounded = Math.round(hours * 10) / 10
  return Number.isInteger(rounded) ? `${rounded}h` : `${rounded.toFixed(1)}h`
}

const microStyle: React.CSSProperties = { fontSize: 10.5, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '0.06em' }

/**
 * "Run day · today" (spec R7.1, corrected 2026-09-10) — replaces the old standalone
 * "24-hour schedule" card. Headline stats + a compact hourly histogram (not the old
 * per-lane SVG timeline with collision bands — read the artboard's own structure) +
 * every scheduled run as a 2-column list + a legend + the on-demand note.
 */
export function RunDayCard({ events, onDemandCount }: RunDayCardProps) {
  const histogram = computeHourlyHistogram(events)
  const busiest = findBusiestHour(histogram)
  const quiet = findLongestQuietWindow(events)
  const now = new Date()
  const next = findNextRun(events, now.getHours() * 60 + now.getMinutes())
  const sorted = [...events].sort((a, b) => a.minuteOfDay - b.minuteOfDay)
  const collision = busiest && busiest.count > 1 ? busiest : null

  return (
    <Panel
      label="Run day · today"
      action={
        <>
          {collision && (
            <span className="card-badge" style={{ background: 'oklch(0.78 0.16 75 / 0.12)', borderColor: 'oklch(0.78 0.16 75 / 0.3)', color: 'var(--warn)' }}>
              {String(collision.hour).padStart(2, '0')}:00 · {collision.count} jobs stack up
            </span>
          )}
          <span className="card-badge">{events.length} scheduled runs</span>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', gap: 26, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={microStyle}>Next run</span>
            <span style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)', fontSize: 18, fontWeight: 600 }}>
              {next ? formatHourMinute(next.hour, next.minute) : '—'}{' '}
              <span style={{ fontSize: 12, color: 'var(--t3)' }}>{next ? next.capabilityName : 'nothing scheduled'}</span>
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={microStyle}>Busiest hour</span>
            <span style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)', fontSize: 18, fontWeight: 600, color: 'var(--warn)' }}>
              {busiest ? `${String(busiest.hour).padStart(2, '0')}:00` : '—'}{' '}
              <span style={{ fontSize: 12, color: 'var(--t3)' }}>{busiest ? `${busiest.count} job${busiest.count === 1 ? '' : 's'}` : ''}</span>
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={microStyle}>Longest quiet window</span>
            <span style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)', fontSize: 18, fontWeight: 600 }}>
              {quiet ? `${formatBoundary(quiet.startMinute)}–${formatBoundary(quiet.endMinute)}` : '—'}{' '}
              <span style={{ fontSize: 12, color: 'var(--t3)' }}>{quiet ? `${formatHours(quiet.hours)} free` : ''}</span>
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 3, alignItems: 'flex-end' }}>
          {histogram.map(({ hour, count }) => {
            const isBusiest = collision !== null && hour === collision.hour
            const background = count === 0
              ? 'oklch(1 0 0 / 0.035)'
              : isBusiest
              ? 'oklch(0.78 0.16 75 / 0.28)'
              : count >= 2
              ? 'oklch(1 0 0 / 0.16)'
              : 'oklch(1 0 0 / 0.09)'
            const border = count === 0
              ? '1px solid oklch(1 0 0 / 0.05)'
              : isBusiest
              ? '1px solid oklch(0.78 0.16 75 / 0.55)'
              : '1px solid oklch(1 0 0 / 0.16)'
            const textColor = isBusiest ? 'var(--warn)' : 'var(--t1)'
            const showHourLabel = hour % 3 === 0
            return (
              <div key={hour} style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 5, alignItems: 'center' }}>
                <div
                  style={{
                    width: '100%',
                    height: 46,
                    borderRadius: 5,
                    background,
                    border,
                    display: 'flex',
                    alignItems: 'flex-end',
                    justifyContent: 'center',
                    paddingBottom: 4,
                    boxSizing: 'border-box',
                    fontFamily: 'var(--font-jetbrains-mono, monospace)',
                    fontSize: 11,
                    fontWeight: 600,
                    color: count > 0 ? textColor : 'transparent',
                  }}
                >
                  {count > 0 ? count : ''}
                </div>
                <span
                  style={{
                    fontFamily: 'var(--font-jetbrains-mono, monospace)',
                    fontSize: 10.5,
                    color: 'var(--t2)',
                    height: 14,
                    visibility: showHourLabel ? 'visible' : 'hidden',
                  }}
                >
                  {String(hour).padStart(2, '0')}
                </span>
              </div>
            )
          })}
        </div>

        {sorted.length === 0 ? (
          <span style={{ fontSize: 12, color: 'var(--t3)' }}>Nothing scheduled today.</span>
        ) : (
          <div className="layout-tiles" style={{ gap: '6px 12px', borderTop: '1px solid oklch(1 0 0 / 0.055)', paddingTop: 11 }}>
            {sorted.map((ev, i) => {
              const isAthena = ev.agent === 'athena'
              const tierLabel = ev.lane === 'local-scheduled' ? (isAthena ? 'local-scheduled · Athena' : 'local-scheduled') : ev.lane
              return (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '7px 10px', borderRadius: 8, border: '1px solid var(--ui-border)' }}>
                  {isAthena ? (
                    <span style={{ width: 9, height: 9, borderRadius: '50%', border: `2px solid ${AGENT_STYLE.athena.color}`, boxSizing: 'border-box', flexShrink: 0 }} />
                  ) : ev.lane === 'local-scheduled' ? (
                    <span style={{ width: 8, height: 8, borderRadius: 2, background: 'var(--acy)', flexShrink: 0 }} />
                  ) : (
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: TAG_COLOR.tool, flexShrink: 0 }} />
                  )}
                  <span style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)', fontSize: 11.5, width: 40, flexShrink: 0 }}>{formatHourMinute(ev.hour, ev.minute)}</span>
                  <span style={{ fontSize: 12.5, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ev.capabilityName}</span>
                  <span style={{ fontSize: 10.5, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{tierLabel}</span>
                </div>
              )
            })}
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 10.5, color: 'var(--t2)' }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: TAG_COLOR.tool, display: 'inline-block' }} />script
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 10.5, color: 'var(--t2)' }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: 'var(--acy)', display: 'inline-block' }} />local-scheduled
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 10.5, color: 'var(--t2)' }}>
            <span style={{ width: 9, height: 9, borderRadius: '50%', border: `2px solid ${AGENT_STYLE.athena.color}`, boxSizing: 'border-box', display: 'inline-block' }} />Athena-owned
          </span>
          <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-jetbrains-mono, monospace)', fontSize: 10.5, color: 'var(--t3)' }}>
            {onDemandCount} capabilit{onDemandCount === 1 ? 'y runs' : 'ies run'} on demand and never appear here
          </span>
        </div>
      </div>
    </Panel>
  )
}
