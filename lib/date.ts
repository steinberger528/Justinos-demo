/**
 * Shared date-key helpers. A "date key" is a `YYYY-MM-DD` string used as the
 * primary bucket for daily rows (habits, journal, nutrition, briefings).
 *
 * Two variants, because the correct "today" depends on where the code runs:
 * - `localDateKey()` — browser clock. Use in Client Components; the user's own
 *   device time is the source of truth for when their day rolls over.
 * - `zonedDateKey()` — USER_TIMEZONE via Intl. Use on the server (API routes,
 *   cron, lib) where there is no browser and the server's UTC clock can be a
 *   day off from the user's local date near midnight.
 *
 * Both produce the same format, so a value made by one is comparable to the other.
 */

const pad = (n: number) => String(n).padStart(2, '0')

/** Browser-local date key (`YYYY-MM-DD`). Client Components only. */
export function localDateKey(d: Date = new Date()): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** Date key in USER_TIMEZONE (`YYYY-MM-DD`). Server-side only. */
export function zonedDateKey(now: Date = new Date()): string {
  const timeZone = process.env.USER_TIMEZONE ?? 'UTC'
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}

/**
 * Monday on/before `d` (local clock), matching the app's Monday-start week
 * convention already used by TaskPlanner.tsx and app/api/tasks/rollover/route.ts.
 */
export function mondayOf(d: Date): Date {
  const monday = new Date(d)
  const dow = monday.getDay()
  const diff = dow === 0 ? -6 : 1 - dow
  monday.setDate(monday.getDate() + diff)
  monday.setHours(0, 0, 0, 0)
  return monday
}

/**
 * True if `completedAt` (a UTC ISO timestamp, or null for an item that isn't
 * completed at all) falls within the local Monday-start week containing
 * `todayKey`. Shared by SchoolTab.tsx (OverviewSurface) and
 * SchoolCourseDetail.tsx so a completed school item stays visible with done
 * styling through the end of its completion week before it rolls into a
 * collapsed "Recently Completed" section, per specs/school-tab.md's
 * Completed-item-behavior requirement.
 */
export function isWithinCompletionWeek(completedAt: string | null, todayKey: string): boolean {
  if (!completedAt) return true
  const weekStartKey = localDateKey(mondayOf(new Date(`${todayKey}T00:00:00`)))
  // completedAt is a UTC ISO timestamp — convert through localDateKey() (the
  // same conversion weekStartKey itself uses) rather than a raw slice of the
  // UTC string, or a task completed near local midnight can land in the wrong week.
  const completedLocalKey = localDateKey(new Date(completedAt))
  return completedLocalKey >= weekStartKey
}

/**
 * Current hour (0-23) in `timeZone`. Vercel crons run in UTC and DST shifts which
 * UTC hour lands on a given local hour, so local-time crons are scheduled at both
 * candidate UTC hours and no-op on the one that doesn't match (day-plan-cutoff,
 * build-day).
 */
/** Current wall-clock time in `timeZone`, rounded up to the next `stepMin` minutes, as 24h "HH:MM" (capped at 23:45). */
export function nextSlotInZone(timeZone: string, stepMin = 15, now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now)
  const minutes = Number(parts.find(p => p.type === 'hour')!.value) * 60 + Number(parts.find(p => p.type === 'minute')!.value)
  const rounded = Math.min(Math.ceil(minutes / stepMin) * stepMin, 23 * 60 + 45)
  return `${String(Math.floor(rounded / 60)).padStart(2, '0')}:${String(rounded % 60).padStart(2, '0')}`
}

export function currentHourInZone(timeZone: string, now: Date = new Date()): number {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, hour: '2-digit', hourCycle: 'h23' }).formatToParts(now)
  return Number(parts.find(p => p.type === 'hour')!.value)
}
