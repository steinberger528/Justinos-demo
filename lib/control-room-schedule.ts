import type { AgentName, Capability } from '@/components/dashboard/control-room-types'

export type ScheduleLane = 'local-scheduled' | 'script' | 'server-cron' | 'cloud-routine'

export interface ScheduleEvent {
  capabilityName: string
  agent: AgentName | 'none' | null
  lane: ScheduleLane
  hour: number
  minute: number
  minuteOfDay: number
}

export interface CollisionBand {
  startMinute: number
  endMinute: number
  eventCount: number
}

const LANES: ScheduleLane[] = ['local-scheduled', 'script', 'server-cron', 'cloud-routine']

// Matches "07:00", "3:35", etc. inside a trigger string. A trigger can name several
// times ("daily 12:00 / 18:00 / 23:00") — one marker per match, spec R7.2.
const TIME_RE = /\b([01]?\d|2[0-3]):([0-5]\d)\b/g

/**
 * Parses every scheduled capability's `trigger` text into 24-hour-clock markers.
 * Triggers with no parseable time ("on demand", "/capture-note, mid-conversation",
 * "step N of the nightly librarian") are excluded from the timeline — spec R7.2/edge
 * case — but the capability still appears in its tier group card grid untouched.
 */
export function parseScheduleEvents(capabilities: Capability[]): ScheduleEvent[] {
  const events: ScheduleEvent[] = []
  for (const cap of capabilities) {
    if (!cap.trigger) continue
    if (!(LANES as string[]).includes(cap.runtime)) continue
    const lane = cap.runtime as ScheduleLane
    const matches = [...cap.trigger.matchAll(TIME_RE)]
    for (const m of matches) {
      const hour = Number(m[1])
      const minute = Number(m[2])
      events.push({
        capabilityName: cap.name,
        agent: cap.agent,
        lane,
        hour,
        minute,
        minuteOfDay: hour * 60 + minute,
      })
    }
  }
  return events.sort((a, b) => a.minuteOfDay - b.minuteOfDay)
}

/**
 * Sliding 60-minute window collision detector (spec R7.2/edge case: "multiple
 * capabilities at the same trigger time" — 4 jobs currently fall between 07:00 and
 * 08:00). Data-driven rather than a hardcoded hour range, so it stays correct as
 * triggers change. Overlapping bands are merged.
 */
export function computeCollisionBands(events: ScheduleEvent[]): CollisionBand[] {
  const bands: CollisionBand[] = []
  const times = events.map(e => e.minuteOfDay).sort((a, b) => a - b)

  let i = 0
  while (i < times.length) {
    let j = i
    while (j + 1 < times.length && times[j + 1] - times[i] <= 60) j++
    const count = j - i + 1
    if (count >= 2) {
      const band = { startMinute: times[i], endMinute: times[j], eventCount: count }
      const last = bands[bands.length - 1]
      if (last && band.startMinute <= last.endMinute) {
        last.endMinute = Math.max(last.endMinute, band.endMinute)
        last.eventCount = Math.max(last.eventCount, band.eventCount)
      } else {
        bands.push(band)
      }
    }
    i = j + 1
  }
  return bands
}

export function formatHourMinute(hour: number, minute: number): string {
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

// ── "Run day · today" card helpers (spec R7.1, corrected 2026-09-10) ────────────────

export interface HourBucket {
  hour: number
  count: number
}

/** One bucket per hour 00-23, counting how many parsed trigger times land in it. */
export function computeHourlyHistogram(events: ScheduleEvent[]): HourBucket[] {
  const buckets: HourBucket[] = Array.from({ length: 24 }, (_, hour) => ({ hour, count: 0 }))
  for (const e of events) buckets[e.hour].count++
  return buckets
}

/** The single busiest hour, or null if nothing is scheduled at all. */
export function findBusiestHour(histogram: HourBucket[]): HourBucket | null {
  const busiest = histogram.reduce((best, b) => (b.count > best.count ? b : best), histogram[0])
  return busiest.count > 0 ? busiest : null
}

export interface QuietWindow {
  startMinute: number
  endMinute: number
  hours: number
}

/**
 * The longest unscheduled stretch of the day, bounded by 00:00 and 24:00 (today's
 * schedule doesn't wrap into tomorrow for this purpose). Data-driven — not hardcoded
 * to any particular hour range, so it stays correct as triggers change.
 */
export function findLongestQuietWindow(events: ScheduleEvent[]): QuietWindow | null {
  if (events.length === 0) return null
  const times = Array.from(new Set(events.map(e => e.minuteOfDay))).sort((a, b) => a - b)
  const bounds = [0, ...times, 24 * 60]
  let best: QuietWindow | null = null
  for (let i = 0; i < bounds.length - 1; i++) {
    const gapMinutes = bounds[i + 1] - bounds[i]
    if (!best || gapMinutes > best.hours * 60) {
      best = { startMinute: bounds[i], endMinute: bounds[i + 1], hours: gapMinutes / 60 }
    }
  }
  return best
}

/** The next event at or after `nowMinuteOfDay`, wrapping to the earliest event of the day if none remain. */
export function findNextRun(events: ScheduleEvent[], nowMinuteOfDay: number): ScheduleEvent | null {
  if (events.length === 0) return null
  const sorted = [...events].sort((a, b) => a.minuteOfDay - b.minuteOfDay)
  return sorted.find(e => e.minuteOfDay >= nowMinuteOfDay) ?? sorted[0]
}
