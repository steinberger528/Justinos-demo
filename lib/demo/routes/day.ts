// Everything about the shape of a day: the calendar feed, fixed events, day rules,
// the plan Neptune built, and the briefing that summarizes it.

import { BLOCK_TYPES } from '@/lib/block-types'
import { dayRulePayload, validateDayRule, type DayRuleBody } from '@/lib/day-rules'
import { audit, getDb, mutate } from '../db'
import { DAY_CODES, addDays, at, dateKey, isoAt, toMin, todayKey, weekdayOf } from '../dates'
import { fail, isDateKey, ok, route, type Route } from '../http'
import { newId } from '../ids'
import { CALENDAR_CHANGED, emit } from '../notify'
import { QUOTES } from '../seed/home'
import type { DayPlanRow, DayRuleRow, DemoDB, FixedEventRow, PlanBlock } from '../types'

const FIXED_KINDS = ['class', 'work', 'protected', 'other']
const TASK_BLOCK_TYPES = new Set<string>(BLOCK_TYPES)

interface CalendarEventOut {
  id: string
  title: string
  start: string
  end: string
  location?: string
  source: 'google' | 'school'
  recurring?: boolean
}

function withTaskTitles(db: DemoDB, plan: DayPlanRow) {
  const titles = new Map(db.tasks.map(t => [t.id, t.title]))
  return {
    date: plan.date,
    status: plan.status,
    generated_at: plan.generated_at,
    finalized_at: plan.finalized_at,
    blocks: plan.blocks.map(b => ({
      ...b,
      task_titles: (b.task_ids ?? []).map(id => titles.get(id)).filter((t): t is string => !!t),
    })),
    pushed: plan.pushed.map(p => ({ ...p, title: titles.get(p.task_id) ?? null })),
  }
}

function validateFixedEvent(body: Record<string, unknown>, partial: boolean): string | null {
  if (!partial || 'label' in body) {
    if (!body.label || typeof body.label !== 'string') return 'label is required'
  }
  if (!partial || 'kind' in body) {
    if (!FIXED_KINDS.includes(body.kind as string)) return `kind must be one of ${FIXED_KINDS.join(', ')}`
  }
  if (!partial || 'days' in body) {
    const days = body.days
    if (!Array.isArray(days) || days.length === 0) return 'days must be a non-empty array'
    if (!days.every(d => (DAY_CODES as readonly string[]).includes(d as string))) return 'days must only contain MO, TU, WE, TH, FR, SA, SU'
  }
  if (!partial && (!body.start || !body.end)) return 'start and end are required'
  if (body.start && body.end && (body.end as string) <= (body.start as string)) return 'end must be after start'
  return null
}

/** Postgres `time` columns come back as "HH:MM:SS"; forms send "HH:MM". */
const asTime = (v: unknown): string => {
  const s = String(v)
  return s.length === 5 ? `${s}:00` : s
}

export const dayRoutes: Route[] = [
  // ── Calendar ───────────────────────────────────────────────────────────────
  // Production parses a Google Calendar iCal feed. Here the same three sources are
  // assembled locally: one-off events, recurring fixed events, and school due dates.
  route('GET', '/api/calendar', ({ query }) => {
    const db = getDb()
    const startKey = query.get('start') ?? todayKey()
    const endKey = query.get('end') ?? startKey
    if (!isDateKey(startKey) || !isDateKey(endKey)) return fail(400, 'start and end must be YYYY-MM-DD')
    const rangeStart = at(startKey, '00:00')
    const rangeEnd = new Date(`${endKey}T23:59:59.999`)

    const events: CalendarEventOut[] = []

    for (const ev of db.calendarEvents) {
      if (new Date(ev.end) < rangeStart || new Date(ev.start) > rangeEnd) continue
      events.push({ ...ev, source: 'google' })
    }

    for (let day = startKey; day <= endKey; day = addDays(day, 1)) {
      const code = DAY_CODES[weekdayOf(day)]
      for (const fx of db.fixedEvents) {
        if (!fx.days.includes(code)) continue
        if (fx.effective_from && day < fx.effective_from) continue
        if (fx.effective_to && day > fx.effective_to) continue
        events.push({
          id: `${fx.id}-${day}`,
          title: fx.label,
          start: isoAt(day, fx.start.slice(0, 5)),
          end: isoAt(day, fx.end.slice(0, 5)),
          source: 'google',
          // A weekly series, so the card will not let it be dragged to a new time.
          recurring: true,
          ...(fx.location ? { location: fx.location } : {}),
        })
      }
    }

    for (const t of db.tasks) {
      if (!t.item_type || !t.due_date || t.due_date < startKey || t.due_date > endKey) continue
      const courseTag = t.tags.find(tag => tag !== 'school')
      events.push({
        id: `school-${t.id}`,
        title: t.title,
        start: isoAt(t.due_date, '09:00'),
        end: isoAt(t.due_date, '09:30'),
        source: 'school',
        ...(courseTag ? { location: courseTag } : {}),
      })
    }

    events.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())
    return ok({ events })
  }),

  // Session card "+ Event": a one-hour event at a bare wall-clock time.
  route('POST', '/api/calendar', ({ body }) => {
    const title = typeof body.title === 'string' ? body.title.trim() : ''
    const start = typeof body.start === 'string' ? body.start : ''
    if (!title || !start) return fail(400, 'title and start are required')
    const startDate = new Date(start)
    if (Number.isNaN(startDate.getTime())) return fail(400, 'start must be a datetime')

    const id = mutate(db => {
      const eventId = newId('cal')
      db.calendarEvents.push({
        id: eventId,
        title,
        start: startDate.toISOString(),
        end: new Date(startDate.getTime() + 60 * 60_000).toISOString(),
      })
      audit(db, 'insert', 'calendar_event', eventId, { event_title: title, event_start: start })
      return eventId
    })
    emit(CALENDAR_CHANGED)
    return ok({ ok: true, id }, 500)
  }),

  // Dragging an event in the day view.
  route('POST', '/api/calendar/reschedule', ({ body }) => {
    const { eventId, newStart, newEnd } = body as { eventId?: string; newStart?: string; newEnd?: string }
    if (!eventId || !newStart || !newEnd) return fail(400, 'eventId, newStart, and newEnd are required')
    return mutate(db => {
      const ev = db.calendarEvents.find(e => e.id === eventId)
      if (!ev) return fail(404, 'calendar event not found')
      ev.start = newStart
      ev.end = newEnd
      audit(db, 'reschedule', 'calendar_event', ev.id, { newStart, newEnd, title: ev.title })
      return ok({ ok: true }, 350)
    })
  }),

  // ── Fixed events ───────────────────────────────────────────────────────────
  route('GET', '/api/fixed-events', () => {
    const rows = [...getDb().fixedEvents].sort((a, b) => a.start.localeCompare(b.start))
    return ok({ fixed_events: rows })
  }),

  route('POST', '/api/fixed-events', ({ body }) => {
    const invalid = validateFixedEvent(body, false)
    if (invalid) return fail(400, invalid)
    const id = mutate(db => {
      const rowId = newId('fx')
      const row: FixedEventRow = {
        id: rowId,
        label: body.label as string,
        kind: body.kind as FixedEventRow['kind'],
        days: body.days as string[],
        start: asTime(body.start),
        end: asTime(body.end),
        location: (body.location as string | null | undefined) ?? null,
        buffer_before: Number(body.buffer_before) || 0,
        buffer_after: Number(body.buffer_after) || 0,
        hard: body.hard === undefined ? true : !!body.hard,
        effective_from: (body.effective_from as string | null | undefined) ?? null,
        effective_to: (body.effective_to as string | null | undefined) ?? null,
        source: 'manual',
        vault_path: null,
        // Production mirrors a manual row out to Google Calendar and stores its event id.
        gcal_event_id: `demo-gcal-${rowId}`,
      }
      db.fixedEvents.push(row)
      audit(db, 'insert', 'fixed_event', rowId, { label: row.label, kind: row.kind, days: row.days, gcal_sync: 'ok' })
      return rowId
    })
    emit(CALENDAR_CHANGED)
    return ok({ ok: true, id, gcal_sync: 'ok' }, 400)
  }),

  route('PATCH', '/api/fixed-events/:id', ({ params, body }) => {
    // Ownership fields are never client-writable.
    const change = { ...body }
    delete change.source
    delete change.vault_path
    delete change.gcal_event_id
    const invalid = validateFixedEvent(change, true)
    if (invalid) return fail(400, invalid)

    const reply = mutate(db => {
      const row = db.fixedEvents.find(f => f.id === params.id)
      if (!row) return fail(404, 'fixed event not found')
      if (change.start !== undefined) change.start = asTime(change.start)
      if (change.end !== undefined) change.end = asTime(change.end)
      Object.assign(row, change)
      const gcalSync = row.gcal_event_id && row.source === 'manual' ? 'ok' : 'skipped'
      audit(db, 'update', 'fixed_event', row.id, { ...change, gcal_sync: gcalSync })
      return ok({ ok: true, gcal_sync: gcalSync }, 300)
    })
    if (reply.status === 200) emit(CALENDAR_CHANGED)
    return reply
  }),

  route('DELETE', '/api/fixed-events/:id', ({ params }) => {
    const reply = mutate(db => {
      const index = db.fixedEvents.findIndex(f => f.id === params.id)
      if (index === -1) return fail(404, 'fixed event not found')
      const [removed] = db.fixedEvents.splice(index, 1)
      audit(db, 'delete', 'fixed_event', removed.id, { label: removed.label })
      return ok({ ok: true })
    })
    if (reply.status === 200) emit(CALENDAR_CHANGED)
    return reply
  }),

  // ── Day rules ──────────────────────────────────────────────────────────────
  route('GET', '/api/day-rules', ({ query }) => {
    const all = query.get('all') === '1'
    const rows = getDb().dayRules
      .filter(r => all || r.active)
      .sort((a, b) => a.kind.localeCompare(b.kind) || a.label.localeCompare(b.label))
    return ok({ day_rules: rows })
  }),

  route('POST', '/api/day-rules', ({ body }) => {
    const input = body as Partial<DayRuleBody>
    const invalid = validateDayRule(input)
    if (invalid) return fail(400, invalid)
    const row = mutate(db => {
      const rule = {
        id: newId('rule'),
        duration_min: null, window_start: null, window_end: null, block_type: null, min_chunk_min: null,
        splittable: false, active: true, course_code: null, weight: null, is_intention: false,
        ...dayRulePayload(input),
      } as DayRuleRow
      db.dayRules.push(rule)
      audit(db, 'insert', 'day_rule', rule.id, { label: rule.label, kind: rule.kind })
      return rule
    })
    return ok({ ok: true, day_rule: row })
  }),

  route('PATCH', '/api/day-rules/:id', ({ params, body }) =>
    mutate(db => {
      const rule = db.dayRules.find(r => r.id === params.id)
      if (!rule) return fail(404, 'rule not found')
      const payload = dayRulePayload(body as Partial<DayRuleBody>)
      const merged = { ...rule, ...payload } as Partial<DayRuleBody>
      const invalid = validateDayRule(merged)
      if (invalid) return fail(400, invalid)
      Object.assign(rule, payload)
      audit(db, 'update', 'day_rule', rule.id, { label: rule.label, changed: Object.keys(payload) })
      return ok({ ok: true, day_rule: rule })
    }),
  ),

  route('DELETE', '/api/day-rules/:id', ({ params }) =>
    mutate(db => {
      const index = db.dayRules.findIndex(r => r.id === params.id)
      if (index === -1) return fail(404, 'rule not found')
      const [removed] = db.dayRules.splice(index, 1)
      audit(db, 'delete', 'day_rule', removed.id, { label: removed.label })
      return ok({ ok: true })
    }),
  ),

  // ── Day plan and briefing ──────────────────────────────────────────────────
  route('GET', '/api/day-plans', ({ query }) => {
    const date = query.get('date')
    if (!date) return fail(400, 'date query param is required')
    const db = getDb()
    const plan = db.dayPlans[date]
    return ok({ day_plan: plan ? withTaskTitles(db, plan) : null })
  }),

  // Everything the Briefing modal shows for one day, in one round trip. No model call:
  // the "shape of the day" line is counted from the plan, not narrated.
  route('GET', '/api/briefing', ({ query }) => {
    const date = query.get('date')
    if (!isDateKey(date)) return fail(400, 'date required as YYYY-MM-DD')
    const db = getDb()
    const yesterday = addDays(date, -1)
    const plan = db.dayPlans[date] ?? null
    const prev = db.dayPlans[yesterday] ?? null

    const blocks: PlanBlock[] = plan?.blocks ?? []
    const workBlocks = blocks.filter(b => TASK_BLOCK_TYPES.has(b.type))
    const firstFixed = blocks
      .filter(b => b.type === 'fixed_event')
      .sort((a, b) => toMin(a.start) - toMin(b.start))[0]

    return ok({
      date,
      plan: plan ? withTaskTitles(db, plan) : null,
      quote: plan?.quote_used ? QUOTES.find(q => q.id === plan.quote_used) ?? null : null,
      questions: db.briefQuestions.filter(q => q.date === date).map(({ id, kind, question, answer }) => ({ id, kind, question, answer })),
      shape: {
        blocks: blocks.length,
        work_blocks: workBlocks.length,
        work_minutes: workBlocks.reduce((n, b) => n + (toMin(b.end) - toMin(b.start)), 0),
        task_count: new Set(blocks.flatMap(b => b.task_ids ?? [])).size,
        first_commitment: firstFixed ? { title: firstFixed.title, start: firstFixed.start } : null,
      },
      yesterday: {
        date: yesterday,
        plan: prev ? withTaskTitles(db, prev) : null,
        completed: db.tasks
          .filter(t => t.completed_at && dateKey(new Date(t.completed_at)) === yesterday)
          .map(t => t.title),
      },
    })
  }),
]
