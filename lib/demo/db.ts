// The demo's database: one plain object, held in memory and mirrored to localStorage
// so edits survive a reload. Each visitor gets a private copy in their own browser.
// Nothing is ever sent anywhere.
//
// The sample data is generated relative to today's date. When the date changes, the
// saved copy is replaced with a fresh seed, so "due today" is always today.

import type { AuditRow, DemoDB } from './types'
import { DB_VERSION, buildSeed } from './seed'
import { todayKey } from './dates'
import { newId } from './ids'

const STORAGE_KEY = 'justinos-demo:db'
const AUDIT_LIMIT = 200

let db: DemoDB | null = null

function load(): DemoDB | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as DemoDB
    if (parsed.version !== DB_VERSION || parsed.seededOn !== todayKey()) return null
    return parsed
  } catch {
    // Unreadable or blocked storage: fall back to a fresh in-memory seed.
    return null
  }
}

function persist(): void {
  if (!db) return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(db))
  } catch {
    // Storage full or unavailable (private mode). The demo still works for this
    // page load; edits just will not survive a reload.
  }
}

let persists: boolean | null = null

/** False when the browser blocks storage. Edits then last only until the page reloads. */
export function canPersist(): boolean {
  if (persists === null) {
    try {
      const probe = `${STORAGE_KEY}:probe`
      window.localStorage.setItem(probe, '1')
      window.localStorage.removeItem(probe)
      persists = true
    } catch {
      persists = false
    }
  }
  return persists
}

/** The live database. Seeds on first use and whenever the saved copy is from another day. */
export function getDb(): DemoDB {
  if (db && db.seededOn === todayKey()) return db
  db = load() ?? buildSeed(todayKey())
  persist()
  return db
}

/** Run a mutation and save. Handlers call this for every write. */
export function mutate<T>(fn: (db: DemoDB) => T): T {
  const current = getDb()
  const result = fn(current)
  persist()
  return result
}

/** Throws away every change and returns to the original sample data. */
export function resetDb(): void {
  db = buildSeed(todayKey())
  persist()
}

/**
 * Every write route in production inserts an audit_log row. The demo keeps the same
 * habit so the Control Room can show the trail a visitor's own clicks leave behind.
 */
export function audit(
  target: DemoDB,
  action: string,
  resourceType: string,
  resourceId: string | null,
  metadata: Record<string, unknown> = {},
): void {
  const row: AuditRow = {
    id: newId('aud'),
    at: new Date().toISOString(),
    action,
    resource_type: resourceType,
    resource_id: resourceId,
    metadata,
  }
  target.audit.unshift(row)
  if (target.audit.length > AUDIT_LIMIT) target.audit.length = AUDIT_LIMIT
}
