'use client'

import { computeCollisionBands, formatHourMinute, type ScheduleEvent } from '@/lib/control-room-schedule'
import { AGENT_STYLE } from './AgentChip'

interface ScheduleTimelineProps {
  events: ScheduleEvent[]
}

const VB_WIDTH = 1020
const AXIS_X0 = 132
const AXIS_X1 = 1004
const LANE_Y: Record<string, number> = { 'local-scheduled': 38, script: 74, 'server-cron': 110, 'cloud-routine': 146 }
const LANE_LABEL: Record<string, string> = {
  'local-scheduled': 'LOCAL SCHEDULED',
  script: 'SCRIPT',
  'server-cron': 'SERVER CRON',
  'cloud-routine': 'CLOUD ROUTINE',
}
const NO_OWNER_COLOR = '#199e70'

function xForMinute(minuteOfDay: number): number {
  return AXIS_X0 + (minuteOfDay / (24 * 60)) * (AXIS_X1 - AXIS_X0)
}

function markerColor(agent: ScheduleEvent['agent']): string {
  if (!agent || agent === 'none') return NO_OWNER_COLOR
  return AGENT_STYLE[agent]?.color ?? NO_OWNER_COLOR
}

/**
 * 24-hour schedule (spec R7.2) — every scheduled capability plotted by parsed trigger
 * time, one lane per runtime tier. Overlapping markers get a 2px surface ring
 * (stroke) and a dashed collision band is drawn where runs land within the same
 * 60-minute window (computeCollisionBands, data-driven — not hardcoded to 07:00-08:00).
 */
export function ScheduleTimeline({ events }: ScheduleTimelineProps) {
  const bands = computeCollisionBands(events)
  const cloudEvents = events.filter(e => e.lane === 'cloud-routine')

  return (
    <svg viewBox={`0 0 ${VB_WIDTH} 208`} width="100%" height={208} style={{ display: 'block', overflow: 'visible' }}>
      {bands.map((band, i) => {
        const x0 = xForMinute(band.startMinute) - 12
        const x1 = xForMinute(band.endMinute) + 12
        return (
          <g key={i}>
            <rect
              x={x0}
              y={10}
              width={x1 - x0}
              height={146}
              rx={5}
              fill="oklch(0.78 0.16 75 / 0.09)"
              stroke="oklch(0.78 0.16 75 / 0.3)"
              strokeDasharray="4 3"
            />
            <text x={x1 + 8} y={24} fontSize={10.5} fill="oklch(0.78 0.16 75)" fontFamily="var(--font-space-grotesk, sans-serif)">
              {formatHourMinute(Math.floor(band.startMinute / 60), band.startMinute % 60)}–
              {formatHourMinute(Math.floor((band.endMinute + 60) / 60) % 24, band.endMinute % 60)} · {band.eventCount} jobs in one hour
            </text>
          </g>
        )
      })}

      {(['local-scheduled', 'script', 'server-cron', 'cloud-routine'] as const).map(lane => (
        <g key={lane}>
          <text x={0} y={LANE_Y[lane] + 5} fontSize={10} fill="var(--t3)" fontFamily="var(--font-space-grotesk, sans-serif)" letterSpacing={0.6}>
            {LANE_LABEL[lane]}
          </text>
          <line
            x1={AXIS_X0}
            y1={LANE_Y[lane] - 5}
            x2={AXIS_X1}
            y2={LANE_Y[lane] - 5}
            stroke="oklch(1 0 0 / 0.06)"
            strokeWidth={1}
            strokeDasharray={lane === 'cloud-routine' ? '5 5' : undefined}
          />
        </g>
      ))}

      {cloudEvents.length === 0 && (
        <text x={(AXIS_X0 + AXIS_X1) / 2} y={LANE_Y['cloud-routine'] + 4} textAnchor="middle" fontSize={10.5} fill="var(--t3)" fontFamily="var(--font-space-grotesk, sans-serif)">
          nothing here yet, 5 slots free
        </text>
      )}

      <line x1={AXIS_X0} y1={164} x2={AXIS_X1} y2={164} stroke="oklch(1 0 0 / 0.12)" />
      {[0, 4, 8, 12, 16, 20, 24].map(h => {
        const x = xForMinute(h * 60)
        return (
          <g key={h} fontFamily="var(--font-jetbrains-mono, monospace)" fontSize={9.5} fill="var(--t3)" textAnchor="middle">
            <line x1={x} y1={164} x2={x} y2={170} stroke="oklch(1 0 0 / 0.12)" />
            <text x={x} y={184}>{String(h).padStart(2, '0')}</text>
          </g>
        )
      })}

      {events.map((ev, i) => {
        const x = xForMinute(ev.minuteOfDay)
        const y = LANE_Y[ev.lane]
        const collided = bands.some(b => ev.minuteOfDay >= b.startMinute && ev.minuteOfDay <= b.endMinute)
        return (
          <g key={i}>
            <circle
              cx={x}
              cy={y}
              r={5}
              fill={markerColor(ev.agent)}
              stroke={collided ? 'oklch(0.15 0.018 255)' : 'oklch(0.11 0.010 255)'}
              strokeWidth={collided ? 3 : 2}
            >
              <title>{`${ev.capabilityName} · ${formatHourMinute(ev.hour, ev.minute)}`}</title>
            </circle>
          </g>
        )
      })}
    </svg>
  )
}
