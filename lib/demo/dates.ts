// Date helpers for the demo backend. Everything is keyed off the browser's local
// clock, the same convention the real dashboard uses on the client (localDateKey).

const pad = (n: number) => String(n).padStart(2, '0')

export function dateKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function todayKey(): string {
  return dateKey(new Date())
}

export function addDays(key: string, n: number): string {
  const d = new Date(`${key}T00:00:00`)
  d.setDate(d.getDate() + n)
  return dateKey(d)
}

/** Local Date for a day key plus a 24h "HH:MM" wall-clock time. */
export function at(key: string, hhmm: string): Date {
  return new Date(`${key}T${hhmm}:00`)
}

export function isoAt(key: string, hhmm: string): string {
  return at(key, hhmm).toISOString()
}

/** 0 = Sunday … 6 = Saturday. */
export function weekdayOf(key: string): number {
  return new Date(`${key}T00:00:00`).getDay()
}

export function mondayOf(key: string): string {
  const dow = weekdayOf(key)
  return addDays(key, dow === 0 ? -6 : 1 - dow)
}

export function toMin(hhmm: string): number {
  return Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5))
}

export function toHHMM(min: number): string {
  const clamped = Math.max(0, Math.min(23 * 60 + 59, Math.round(min)))
  return `${pad(Math.floor(clamped / 60))}:${pad(clamped % 60)}`
}

/** ISO timestamp `minutes` before now. */
export function minutesAgo(minutes: number): string {
  return new Date(Date.now() - minutes * 60_000).toISOString()
}

export function shortDate(key: string): string {
  return new Date(`${key}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export const DAY_CODES = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'] as const
export const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const
