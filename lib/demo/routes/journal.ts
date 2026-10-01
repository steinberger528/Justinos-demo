// Journal and Brainstorm routes. Both cards read cached AI output (the weekly
// reflection, the idea insights) and never trigger a model call on page load.

import { audit, getDb, mutate } from '../db'
import { PHOTO_OFF_MESSAGE, VOICE_OFF_MESSAGE } from '../config'
import { addDays, todayKey } from '../dates'
import { fail, isDateKey, ok, route, type Route } from '../http'
import { newId } from '../ids'
import type { JournalEntryRow } from '../types'

const RECENT_DAYS = 30

function parseList(value: FormDataEntryValue | null): string[] {
  if (typeof value !== 'string' || !value.trim()) return []
  try {
    const parsed = JSON.parse(value) as unknown
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

export const journalRoutes: Route[] = [
  route('GET', '/api/journal', ({ query }) => {
    const db = getDb()
    const today = query.get('today')
    const since = addDays(todayKey(), -RECENT_DAYS)
    const entries = db.journalEntries
      .filter(e => e.entry_date >= since)
      .sort((a, b) => b.entry_date.localeCompare(a.entry_date))
    return ok({
      entries,
      todayEntry: today ? entries.find(e => e.entry_date === today) ?? null : null,
      reflection: db.journalReflection,
    })
  }),

  // One entry per day: a second save on the same date updates the first.
  route('POST', '/api/journal', ({ form }) => {
    if (!form) return fail(400, 'invalid form data')
    const entryDate = form.get('entry_date')
    if (!isDateKey(entryDate)) return fail(400, 'entry_date (YYYY-MM-DD) is required')
    const mood = Number(form.get('emoji_mood'))
    if (!Number.isInteger(mood) || mood < 1 || mood > 5) return fail(400, 'emoji_mood (1-5) is required')

    if (form.get('audio')) return fail(422, VOICE_OFF_MESSAGE)
    if (form.get('photo')) return fail(422, PHOTO_OFF_MESSAGE)
    const text = form.get('text')
    if (typeof text !== 'string' || !text.trim()) return fail(400, 'audio, photo, or text is required')

    const promptRaw = form.get('prompt')
    const prompt = typeof promptRaw === 'string' && promptRaw.trim() ? promptRaw.trim() : null

    const entry = mutate(db => {
      const now = new Date().toISOString()
      const existing = db.journalEntries.find(e => e.entry_date === entryDate)
      const row: JournalEntryRow = {
        id: existing?.id ?? newId('jrn'),
        entry_date: entryDate,
        emoji_mood: mood,
        named_moods: parseList(form.get('named_moods')),
        tags: parseList(form.get('tags')),
        prompt,
        body: text.trim(),
        source: 'text',
        image_ref: null,
        created_at: existing?.created_at ?? now,
        updated_at: now,
      }
      db.journalEntries = [...db.journalEntries.filter(e => e.entry_date !== entryDate), row]
      audit(db, 'capture', 'journal_entry', row.id, { source: 'text', entry_date: entryDate, emoji_mood: mood })
      return row
    })
    return ok({ ok: true, entry }, 350)
  }),

  route('GET', '/api/ideas', () => {
    const db = getDb()
    return ok({
      ideas: [...db.ideas].sort((a, b) => b.updated_at.localeCompare(a.updated_at)),
      insight: db.ideasInsight,
      pendingCount: db.ideaCaptures.filter(c => c.status === 'pending').length,
    })
  }),

  // A capture is only queued here. Organizing it is the librarian's job, overnight.
  route('POST', '/api/ideas/capture', ({ form }) => {
    if (!form) return fail(400, 'invalid form data')
    if (form.get('audio')) return fail(422, VOICE_OFF_MESSAGE)
    const text = form.get('text')
    if (typeof text !== 'string' || !text.trim()) return fail(400, 'audio or text is required')

    const id = mutate(db => {
      const captureId = newId('cap')
      db.ideaCaptures.unshift({ id: captureId, text: text.trim(), source: 'dashboard-text', status: 'pending', created_at: new Date().toISOString() })
      audit(db, 'capture', 'idea_capture', captureId, { source: 'dashboard-text' })
      return captureId
    })
    return ok({ ok: true, id, text: text.trim(), source: 'dashboard-text' }, 300)
  }),
]
