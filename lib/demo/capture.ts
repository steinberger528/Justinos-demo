// A stand-in for the capture pipeline.
//
// In production, every message (Telegram text, a transcribed voice note, or the
// dashboard's capture bar) goes through the same steps:
//   1. insert a raw_captures row before anything else can fail
//   2. one Claude call with a forced tool call returns an array of routes
//   3. each route is dispatched to its table (tasks, calendar, goals, ideas, memory)
//   4. the text is embedded into pgvector for semantic recall
//   5. an audit_log row is written
//   6. a Telegram reply confirms what happened
//
// The demo has no model to call, so step 2 is replaced by the keyword rules below.
// They are deliberately simple. They exist to make the rest of the pipeline visible,
// not to imitate the model's judgment.

import { BLOCK_TYPES } from '@/lib/block-types'
import { audit, getDb, mutate } from './db'
import { addDays, dateKey, toHHMM, toMin, todayKey, weekdayOf } from './dates'
import { newId } from './ids'
import type { TelegramMessage } from './notify'
import { makeTask } from './seed/school'
import type { DemoDB, PlanBlock } from './types'

export type Intent =
  | 'task' | 'note' | 'brainstorm' | 'morning_briefing' | 'wind_down' | 'habit_checkin'
  | 'calendar_event' | 'replan_day' | 'goal_create' | 'goal_log_numeric' | 'goal_status' | 'ignore'

export interface SimRoute {
  intent: Intent
  title?: string
  urgency?: 'today' | 'week' | 'month' | 'someday'
  tags?: string[]
  block_type?: string
  summary?: string
  due_date?: string | null
  event_title?: string
  event_start?: string | null
  event_end?: string | null
  event_has_time?: boolean
  goal_name?: string
  goal_type?: 'checklist' | 'numeric'
  goal_tab?: 'ongoing' | 'timed'
  goal_due_date?: string | null
  goal_target_number?: number | null
  goal_amount?: number
}

export interface PipelineStep {
  label: string
  detail: string
}

export interface PipelineResult {
  routes: SimRoute[]
  steps: PipelineStep[]
  replies: TelegramMessage[]
  /** Which parts of the dashboard changed, so the caller can refresh the right cards. */
  touched: { tasks: boolean; goals: boolean; calendar: boolean; ideas: boolean }
}

const pad = (n: number) => String(n).padStart(2, '0')
const BOT = 'Neptune'

// ── Date and time phrases ────────────────────────────────────────────────────

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

interface Hit<T> { value: T; phrase: string }

function findDate(text: string, today: string): Hit<string> | null {
  const lower = text.toLowerCase()
  let m: RegExpExecArray | null

  if ((m = /\b(?:by |for )?(today|tonight|this (?:morning|afternoon|evening))\b/.exec(lower))) return { value: today, phrase: m[0] }
  if ((m = /\b(?:by |for |until )?(tomorrow|tmrw)\b/.exec(lower))) return { value: addDays(today, 1), phrase: m[0] }

  // Full weekday names anywhere; short forms only after a preposition ("by fri").
  m = /\b(?:(?:by|on|this|next|before|until) )?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/.exec(lower)
    ?? /\b(?:by|on|this|next|before|until) (sun|mon|tues?|wed|thur?s?|fri|sat)\b/.exec(lower)
  if (m) {
    const target = WEEKDAYS.findIndex(d => d.startsWith(m![1].slice(0, 3)))
    let delta = (target - weekdayOf(today) + 7) % 7
    if (delta === 0) delta = 7
    return { value: addDays(today, delta), phrase: m[0] }
  }

  if ((m = /\bin (\d{1,2}) days?\b/.exec(lower))) return { value: addDays(today, Number(m[1])), phrase: m[0] }

  m = /\b(?:(?:by|on|due) )?(jan|feb|mar|apr|may|jun|jul|aug|sept?|oct|nov|dec)[a-z]*\.? (\d{1,2})(?:st|nd|rd|th)?\b/.exec(lower)
  if (m) {
    const month = MONTHS.indexOf(m[1].slice(0, 3))
    const year = Number(today.slice(0, 4))
    let key = `${year}-${pad(month + 1)}-${pad(Number(m[2]))}`
    if (key < today) key = `${year + 1}-${pad(month + 1)}-${pad(Number(m[2]))}`
    return { value: key, phrase: m[0] }
  }
  return null
}

function findTime(text: string, allowBareHour = false): Hit<string> | null {
  const lower = text.toLowerCase()
  let m: RegExpExecArray | null
  if ((m = /\b(?:at )?(\d{1,2})(?::([0-5]\d))?\s?(am|pm)\b/.exec(lower))) {
    const hour = (Number(m[1]) % 12) + (m[3] === 'pm' ? 12 : 0)
    return { value: `${pad(hour)}:${m[2] ?? '00'}`, phrase: m[0] }
  }
  if ((m = /\b(?:at )?([01]?\d|2[0-3]):([0-5]\d)\b/.exec(lower))) return { value: `${pad(Number(m[1]))}:${m[2]}`, phrase: m[0] }
  if ((m = /\b(?:at )?noon\b/.exec(lower))) return { value: '12:00', phrase: m[0] }
  if (allowBareHour && (m = /\b(?:at |to )(\d{1,2})\b/.exec(lower))) {
    const raw = Number(m[1])
    if (raw >= 1 && raw <= 12) {
      // "at 5" means the afternoon; "at 9" means the morning.
      const hour = raw < 8 ? raw + 12 : raw
      return { value: `${pad(hour)}:00`, phrase: m[0] }
    }
  }
  return null
}

const fmt12 = (hhmm: string) => {
  const h = Number(hhmm.slice(0, 2))
  return `${h % 12 === 0 ? 12 : h % 12}:${hhmm.slice(3, 5)} ${h < 12 ? 'AM' : 'PM'}`
}

function humanDate(date: string, today: string): string {
  if (date === today) return 'today'
  if (date === addDays(today, 1)) return 'tomorrow'
  return new Date(`${date}T12:00:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
}

// ── Router stand-in ──────────────────────────────────────────────────────────

const TASK_VERBS = /^(email|call|text|message|finish|submit|buy|schedule|set up|book|review|write|send|pay|fix|clean|pick up|drop off|study|read|prepare|update|apply|order|renew|cancel|return|print|file|draft|outline|ask|check|sign|register|practice|research|organize|plan|make|get|do|go to|follow up|reply|respond|upload|download|install|backup|back up)\b/i
const TASK_LEADS = /^(?:remind me to|i need to|i have to|i should|need to|have to|gotta|todo:?|to do:?|task:?|don'?t forget to|remember to)\s+/i
const EVENT_WORDS = /\b(with|meeting|standup|stand-up|lunch|dinner|breakfast|coffee|appointment|interview|call with|session|class|practice|game|party)\b/i

function inferBlockType(text: string): string | undefined {
  const t = text.toLowerCase()
  if (/\b(homework|study|exam|quiz|assignment|lecture|problem set|lab|reading|midterm|professor|class notes)\b/.test(t)) return 'School'
  if (/\b(resume|linkedin|recruiter|interview|application|apply|cover letter|networking|career|internship|job)\b/.test(t)) return 'Career'
  if (/\b(call|phone|ring|voicemail)\b/.test(t)) return 'Calls'
  if (/\b(buy|pick up|drop off|store|groceries|pharmacy|return|errand|post office|dry cleaning|permit)\b/.test(t)) return 'Errands'
  if (/\b(clean|laundry|cook|dishes|vacuum|tidy|trash|organize the|fridge)\b/.test(t)) return 'Home'
  if (/\b(email|write|draft|code|research|form|submit|review|update|spreadsheet|document|book|schedule|pay|renew|order|file)\b/.test(t)) return 'Computer'
  return undefined
}

function inferTags(text: string, blockType?: string): string[] {
  const t = text.toLowerCase()
  const tags = new Set<string>()
  if (blockType === 'School') tags.add('school')
  if (blockType === 'Career') tags.add('career')
  if (/\b(pay|bank|invoice|budget|rent|insurance|refund|reimbursement)\b/.test(t)) tags.add('finance')
  if (/\b(doctor|dentist|gym|workout|run|sleep|meal)\b/.test(t)) tags.add('health')
  if (/\b(client|agency|outreach|newsletter|prospect)\b/.test(t)) tags.add('work')
  if (tags.size === 0) tags.add(blockType === 'Home' || blockType === 'Errands' ? 'personal' : 'admin')
  return [...tags].slice(0, 4)
}

function tidyTitle(text: string, removePhrases: string[]): string {
  let t = text.replace(TASK_LEADS, '')
  for (const phrase of removePhrases) {
    if (phrase) t = t.replace(new RegExp(`\\s*\\b${phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i'), '')
  }
  t = t.replace(/\s+/g, ' ').replace(/[\s.,;:!-]+$/, '').trim()
  const words = t.split(' ')
  if (words.length > 8) t = words.slice(0, 8).join(' ')
  return t.charAt(0).toUpperCase() + t.slice(1)
}

function urgencyFor(text: string, due: string | null, today: string): SimRoute['urgency'] {
  if (due) {
    const days = Math.round((new Date(`${due}T00:00:00`).getTime() - new Date(`${today}T00:00:00`).getTime()) / 86_400_000)
    return days <= 0 ? 'today' : days <= 7 ? 'week' : days <= 30 ? 'month' : 'someday'
  }
  const t = text.toLowerCase()
  if (/\b(today|tonight|this morning|this afternoon|right now|now)\b/.test(t)) return 'today'
  if (/\b(this week|before the weekend)\b/.test(t)) return 'week'
  if (/\bthis month\b/.test(t)) return 'month'
  return 'someday'
}

function words(text: string): string[] {
  return text.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(w => w.length >= 3).map(w => w.replace(/s$/, ''))
}

function bestGoal(db: DemoDB, query: string, type?: 'checklist' | 'numeric') {
  const q = new Set(words(query))
  let best: { goal: DemoDB['goals'][number]; score: number } | null = null
  for (const goal of db.goals) {
    if (goal.archived_at || (type && goal.type !== type)) continue
    const score = words(goal.name).filter(w => q.has(w)).length
    if (score > 0 && (!best || score > best.score)) best = { goal, score }
  }
  return best?.goal ?? null
}

/** Blocks a message can move: anything Neptune placed, not classes or their buffers. */
function movableBlocks(plan: { blocks: PlanBlock[] } | undefined): PlanBlock[] {
  return (plan?.blocks ?? []).filter(b => !['fixed_event', 'buffer', 'anchor'].includes(b.type))
}

const blockAlias = (title: string) => title.toLowerCase().replace(/\s+block$/, '').trim()

interface Busy { title: string; start: number; end: number }

/** Everything already on today's timeline: plan blocks plus one-off calendar events. */
function busyToday(db: DemoDB, today: string, except: PlanBlock): Busy[] {
  const blocks = (db.dayPlans[today]?.blocks ?? [])
    .filter(b => b !== except)
    .map(b => ({ title: b.title, start: toMin(b.start), end: toMin(b.end) }))
  const events = db.calendarEvents
    .filter(ev => dateKey(new Date(ev.start)) === today)
    .map(ev => {
      const from = new Date(ev.start)
      const to = new Date(ev.end)
      return { title: ev.title, start: from.getHours() * 60 + from.getMinutes(), end: to.getHours() * 60 + to.getMinutes() }
    })
  return [...blocks, ...events]
}

interface QuickMove {
  kind: 'move' | 'shift' | 'remove' | 'resize'
  name: string
  time?: string
  minutes?: number
}

function parseQuickMove(text: string): QuickMove | null {
  const t = text.trim().replace(/[.!]+$/, '')
  let m: RegExpExecArray | null
  if ((m = /^(?:skip|cancel|drop)\s+(?:my |the )?(.+?)(?: today| tonight)?$/i.exec(t))) return { kind: 'remove', name: m[1] }
  if ((m = /^push\s+(?:my |the )?(.+?)\s+(?:back )?(?:by )?(\d{1,3})\s?(?:m|min|mins|minutes)$/i.exec(t))) return { kind: 'shift', name: m[1], minutes: Number(m[2]) }
  if ((m = /^make\s+(?:my |the )?(.+?)\s+(\d{1,3})\s?(?:m|min|mins|minutes)(?: long)?$/i.exec(t))) return { kind: 'resize', name: m[1], minutes: Number(m[2]) }
  if ((m = /^(?:move\s+)?(?:my |the )?(.+?)\s+(?:to|at)\s+(.+)$/i.exec(t))) {
    const time = findTime(`at ${m[2]}`, true)
    if (time) return { kind: 'move', name: m[1], time: time.value }
  }
  return null
}

/**
 * A single-block move that will apply cleanly to today's plan, phrased the way it
 * would be texted ("workout at 4:30pm"). The guides use it so their example always
 * works, whatever weekday the plan was built for.
 */
export function suggestQuickMove(): string | null {
  const db = getDb()
  const today = todayKey()
  const plan = db.dayPlans[today]
  if (!plan) return null
  const movable = movableBlocks(plan)
  const rank = (b: PlanBlock) => {
    const i = ['workout', 'lunch', 'dinner'].indexOf(blockAlias(b.title))
    return i === -1 ? 99 : i
  }
  for (const block of [...movable].sort((a, b) => rank(a) - rank(b))) {
    const alias = blockAlias(block.title)
    if (movable.filter(b => blockAlias(b.title) === alias).length !== 1) continue
    const length = toMin(block.end) - toMin(block.start)
    for (const shift of [-30, 30, -60, 60, -45, 45, -90, 90, -120, 120]) {
      const start = toMin(block.start) + shift
      const end = start + length
      if (start % 15 !== 0 || start < 6 * 60 || end > 23 * 60) continue
      if (busyToday(db, today, block).some(b => b.start < end && b.end > start)) continue
      const hour = Math.floor(start / 60)
      const minute = start % 60
      const clock = `${hour % 12 === 0 ? 12 : hour % 12}${minute ? `:${pad(minute)}` : ''}${hour < 12 ? 'am' : 'pm'}`
      return `${alias} at ${clock}`
    }
  }
  return null
}

function classifyOne(text: string, db: DemoDB, today: string, forceTask: boolean): SimRoute {
  const t = text.trim()
  const lower = t.toLowerCase()
  let m: RegExpExecArray | null

  if (!forceTask) {
    if (/^(good morning|morning|gm|brief me|what'?s my day|start my day|daily briefing|what'?s on today)\b/.test(lower)) return { intent: 'morning_briefing' }
    if (/^(good ?night|gn|wind down|end of day|wrap up|calling it|day'?s done|winding down|done for the day)\b/.test(lower)) return { intent: 'wind_down' }
    if (/^(ok|okay|thanks|thank you|got it|cool|nice|great|hi|hello|hey|yes|no|sure)[.! ]*$/.test(lower)) return { intent: 'ignore' }

    if ((m = /^(?:new|add|create)\s+(?:an? )?(?:(ongoing|timed) )?goal\b[:\s-]*(.+)$/i.exec(t))) {
      const rest = m[2]
      const target = /\b(?:target|goal of|numeric target)\s+(\d+(?:\.\d+)?)\b/i.exec(rest)
      const leadingNumber = /^[a-z ]*?\b(\d+)\s+(?:books|miles|sessions|hours|days|pages|workouts|times)\b/i.exec(rest)
      const due = findDate(rest, today)
      const name = tidyTitle(rest.split(/,|\bdue\b|\bby\b|\btarget\b|\bnumeric\b/i)[0], [])
      const targetNumber = target ? Number(target[1]) : leadingNumber ? Number(leadingNumber[1]) : null
      return {
        intent: 'goal_create',
        goal_name: name,
        goal_type: targetNumber !== null ? 'numeric' : 'checklist',
        goal_tab: m[1]?.toLowerCase() === 'timed' || due ? 'timed' : 'ongoing',
        goal_due_date: due?.value ?? null,
        goal_target_number: targetNumber,
      }
    }

    if (/^(idea|brainstorm)\s*[:-]/i.test(t) || /^(what if|maybe we)\b/i.test(t)) {
      return { intent: 'brainstorm', summary: t.replace(/^(idea|brainstorm)\s*[:-]\s*/i, '') }
    }

    if ((m = /^(?:logged|log|added?)\s+(\d+(?:\.\d+)?)\b.*?\b(?:on|to|for|toward)\s+(?:my |the )?(.+)$/i.exec(t))) {
      return { intent: 'goal_log_numeric', goal_amount: Number(m[1]), goal_name: m[2] }
    }
    if ((m = /^finished (?:another|a|one more)\s+(\w+)/i.exec(t)) && bestGoal(db, m[1], 'numeric')) {
      return { intent: 'goal_log_numeric', goal_amount: 1, goal_name: m[1] }
    }
    if ((m = /^(?:how(?:'s| is| are we on| are we doing on| far along is)|what'?s the status of|status of)\s+(?:my |the )?(.+?)\??$/i.exec(t)) && bestGoal(db, m[1])) {
      return { intent: 'goal_status', goal_name: m[1] }
    }

    if (/^(logged|did|completed|finished)\s+(my )?(workout|gym|run|journal|journaling|deep work|reading|morning routine)\b/.test(lower) || /\b(workout|gym|journal|deep work) (is )?done\b/.test(lower)) {
      return { intent: 'habit_checkin', summary: t }
    }

    // A message about how today's time is spent is one replan, never a pile of tasks.
    const quick = parseQuickMove(t)
    if (quick) {
      const matches = movableBlocks(db.dayPlans[today]).filter(b => blockAlias(b.title) === blockAlias(quick.name))
      if (matches.length > 0) return { intent: 'replan_day', summary: t }
    }
    if (/\b(running \d+ ?(min|minutes|hours?) late|i'?m running late|move my .+ to after|instead of .+ today)\b/.test(lower)) {
      return { intent: 'replan_day', summary: t }
    }

    const time = findTime(t)
    const date = findDate(t, today)
    if ((time || date) && EVENT_WORDS.test(t) && !/^(schedule|set up|book|arrange|plan|organize)\b/i.test(t) && !TASK_LEADS.test(t)) {
      const day = date?.value ?? today
      const title = tidyTitle(t, [time?.phrase ?? '', date?.phrase ?? ''])
      if (time) {
        const end = toHHMM(toMin(time.value) + 60)
        return { intent: 'calendar_event', event_title: title, event_start: `${day}T${time.value}:00`, event_end: `${day}T${end}:00`, event_has_time: true }
      }
      return { intent: 'calendar_event', event_title: title, event_start: null, event_end: null, event_has_time: false }
    }
  }

  const due = findDate(t, today)
  const looksLikeTask = forceTask || TASK_LEADS.test(t) || TASK_VERBS.test(t.replace(TASK_LEADS, '')) || (due !== null && /\b(by|due|before)\b/i.test(t))
  if (looksLikeTask) {
    const blockType = inferBlockType(t)
    return {
      intent: 'task',
      title: tidyTitle(t, [due?.phrase ?? '', 'this week', 'this month', 'right now']),
      urgency: urgencyFor(t, due?.value ?? null, today),
      tags: inferTags(t, blockType),
      block_type: blockType,
      summary: t,
      due_date: due && due.value !== today ? due.value : null,
    }
  }

  return { intent: 'note', summary: t.slice(0, 200), tags: inferTags(t) }
}

/** The rule-based replacement for the model's route_input tool call. */
export function simulateRouter(text: string, db: DemoDB, today: string): SimRoute[] {
  const list = /^(?:add\s+)?(?:a few\s+)?tasks?\s*:\s*([\s\S]+)$/i.exec(text.trim())
  if (list) {
    return list[1]
      .split(/\s*(?:,|;|\n|\band\b)\s*/i)
      .map(s => s.trim())
      .filter(Boolean)
      .map(item => classifyOne(item, db, today, true))
  }
  const lines = text.split(/\n+/).map(s => s.trim()).filter(Boolean)
  const routes = (lines.length > 1 ? lines : [text.trim()]).map(line => classifyOne(line, db, today, false))
  // One replan swallows the whole message, as it does in production.
  const replan = routes.find(r => r.intent === 'replan_day')
  return replan ? [{ ...replan, summary: text.trim() }] : routes
}

// ── Dispatch ─────────────────────────────────────────────────────────────────

function timeline(blocks: PlanBlock[], fromMin: number): string {
  const upcoming = blocks
    .filter(b => b.type !== 'buffer' && b.type !== 'anchor' && toMin(b.end) > fromMin)
    .slice(0, 7)
    .map(b => `${fmt12(b.start)}  ${b.title}`)
  return upcoming.join('\n')
}

function applyQuickMove(db: DemoDB, text: string, today: string): { reply: string; changed: boolean } {
  const plan = db.dayPlans[today]
  const move = parseQuickMove(text)
  const fullReplanNote = 'In production this goes to one Claude call that rebuilds the rest of the day. The demo only applies single-block moves, so your plan is unchanged.'
  if (!plan || !move) return { reply: fullReplanNote, changed: false }

  const matches = movableBlocks(plan).filter(b => blockAlias(b.title) === blockAlias(move.name))
  if (matches.length !== 1) {
    return { reply: `"${move.name}" matches ${matches.length} blocks today, so it is not a clean single-block move. ${fullReplanNote}`, changed: false }
  }
  const block = matches[0]

  if (move.kind === 'remove') {
    plan.blocks = plan.blocks.filter(b => b !== block)
    audit(db, 'update', 'quick_move', today, { op: 'remove', block: block.title })
    return { reply: `Dropped ${block.title} from today. No model call needed.\n\n${timeline(plan.blocks, nowMin())}`, changed: true }
  }

  const length = toMin(block.end) - toMin(block.start)
  let start = toMin(block.start)
  let end = toMin(block.end)
  if (move.kind === 'move' && move.time) { start = toMin(move.time); end = start + length }
  if (move.kind === 'shift' && move.minutes) { start += move.minutes; end += move.minutes }
  if (move.kind === 'resize' && move.minutes) { end = start + move.minutes }

  if (end > 23 * 60 + 59) return { reply: `That would run ${block.title} past midnight. ${fullReplanNote}`, changed: false }
  const clash = busyToday(db, today, block).find(b => b.start < end && b.end > start)
  if (clash) {
    return { reply: `That would overlap ${clash.title} (${fmt12(toHHMM(clash.start))} to ${fmt12(toHHMM(clash.end))}). ${fullReplanNote}`, changed: false }
  }

  block.start = toHHMM(start)
  block.end = toHHMM(end)
  plan.blocks.sort((a, b) => toMin(a.start) - toMin(b.start))
  audit(db, 'update', 'quick_move', today, { op: move.kind, block: block.title, start: block.start, end: block.end })
  return {
    reply: `${block.title} is now ${fmt12(block.start)} to ${fmt12(block.end)}. No model call needed.\n\n${timeline(plan.blocks, nowMin())}`,
    changed: true,
  }
}

function nowMin(): number {
  const now = new Date()
  return now.getHours() * 60 + now.getMinutes()
}

function morningBrief(db: DemoDB, today: string): TelegramMessage {
  const plan = db.dayPlans[today]
  const blocks = plan?.blocks ?? []
  const first = blocks.filter(b => b.type === 'fixed_event').sort((a, b) => toMin(a.start) - toMin(b.start))[0]
  const work = blocks.filter(b => (BLOCK_TYPES as readonly string[]).includes(b.type))
  const minutes = work.reduce((n, b) => n + toMin(b.end) - toMin(b.start), 0)
  const tasks = new Set(work.flatMap(b => b.task_ids ?? [])).size
  const overdue = db.tasks.filter(t => !t.completed_at && !t.blocked && t.item_type !== 'exam' && t.item_type !== 'quiz' && t.due_date !== null && t.due_date < today)
  const lines = [
    'Good morning. Here is today.',
    first ? `First up: ${first.title} at ${fmt12(first.start)}` : 'Nothing fixed on the calendar.',
    `${work.length} work blocks, ${Math.floor(minutes / 60)}h ${minutes % 60}m, ${tasks} tasks placed`,
    ...(overdue.length > 0 ? [`Overdue: ${overdue.map(t => t.title).join('; ')}`] : []),
    '',
    timeline(blocks, 0),
  ]
  return { from: BOT, text: lines.join('\n'), buttons: ['Replan now'] }
}

type Urgency = NonNullable<SimRoute['urgency']>

const URGENCY_BY_LABEL: Record<string, Urgency> = {
  'Today': 'today',
  'This week': 'week',
  'This month': 'month',
  'Someday': 'someday',
}
const URGENCY_SCORE: Record<Urgency, number> = { today: 100, week: 75, month: 50, someday: 25 }

/**
 * The urgency keyboard under a task reply. Tapping a choice updates the task, the way
 * the Telegram callback does in production, and returns the text the bot edits its
 * message to. Returns null when the task is gone or the label is not on the keyboard.
 */
export function answerUrgency(taskId: string, label: string): string | null {
  const level = URGENCY_BY_LABEL[label]
  if (!level) return null
  return mutate(db => {
    const task = db.tasks.find(t => t.id === taskId)
    if (!task) return null
    task.urgency = level
    task.priority_score = URGENCY_SCORE[level]
    // Same rule as the capture path: "today" is the one choice that also plans the day.
    if (level === 'today') task.planned_date = todayKey()
    task.updated_at = new Date().toISOString()
    audit(db, 'update', 'task', task.id, { kind: 'urgency_update', new_urgency: level, source: 'telegram' })
    return `✓ Task urgency updated to: ${level}`
  })
}

/**
 * Runs one message through the pipeline and writes its results to the demo database.
 * Returns the trace so the caller can show it, and the replies the bot would send.
 */
export function runCapture(text: string, source: 'web' | 'telegram' = 'web'): PipelineResult {
  const today = todayKey()
  const steps: PipelineStep[] = []
  const replies: TelegramMessage[] = []
  const touched = { tasks: false, goals: false, calendar: false, ideas: false }

  const routes = mutate(db => {
    const rawId = newId('raw')
    const routed = simulateRouter(text, db, today)
    db.rawCaptures.unshift({ id: rawId, raw_text: text, source, classification: routed, created_at: new Date().toISOString() })
    if (db.rawCaptures.length > 50) db.rawCaptures.length = 50

    steps.push({ label: 'raw_captures', detail: `Stored the original text as ${rawId} before anything else can fail.` })
    steps.push({
      label: 'router',
      detail: `${routed.length} route${routed.length === 1 ? '' : 's'}: ${routed.map(r => r.intent).join(', ')}. Production gets this from one Claude tool call. The demo uses keyword rules.`,
    })

    for (const r of routed) {
      switch (r.intent) {
        case 'task': {
          // A deadline comes only from a date in the text. "Today" becomes the planned day.
          const now = new Date().toISOString()
          const task = makeTask(today, {
            id: newId('tsk'),
            title: r.title ?? text.slice(0, 200),
            urgency: r.urgency ?? 'someday',
            tags: r.tags ?? [],
            block_type: r.block_type ?? null,
            priority_score: { today: 100, week: 75, month: 50, someday: 25 }[r.urgency ?? 'someday'],
            due_date: r.due_date ?? null,
            planned_date: r.urgency === 'today' ? today : null,
            created_at: now,
            updated_at: now,
          })
          db.tasks.push(task)
          audit(db, 'capture', 'task', task.id, { kind: 'task', source })
          touched.tasks = true
          const where = task.planned_date ? "today's list" : task.due_date ? `the planner, due ${humanDate(task.due_date, today)}` : 'the backlog'
          steps.push({ label: 'tasks', detail: `Inserted "${task.title}"${task.block_type ? ` under ${task.block_type}` : ''}. It lands in ${where}.` })
          replies.push(task.due_date
            ? { from: BOT, text: `✓ Task: ${task.title} · ${humanDate(task.due_date, today)}` }
            : { from: BOT, text: `✓ Task: ${task.title}. When does this need to happen?`, buttons: Object.keys(URGENCY_BY_LABEL), urgencyTaskId: task.id })
          break
        }
        case 'calendar_event': {
          const title = r.event_title ?? text.slice(0, 100)
          if (r.event_has_time && r.event_start && r.event_end) {
            const id = newId('cal')
            db.calendarEvents.push({ id, title, start: new Date(r.event_start).toISOString(), end: new Date(r.event_end).toISOString() })
            audit(db, 'capture', 'calendar_event', id, { kind: 'calendar_event', source, event_title: title, event_start: r.event_start })
            touched.calendar = true
            const when = new Date(r.event_start).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
            steps.push({ label: 'calendar', detail: `Created "${title}" for ${when}. Production writes this to Google Calendar.` })
            replies.push({ from: BOT, text: `✓ Event created: ${title} · ${when}` })
          } else {
            audit(db, 'capture', 'calendar_event_pending', null, { kind: 'calendar_event_pending', source, title })
            steps.push({ label: 'calendar', detail: `"${title}" has no clock time, so nothing is created yet. The bot asks when.` })
            replies.push({ from: BOT, text: `📅 "${title}". When is this happening?`, buttons: ['Today', 'Tomorrow', 'Pick a time'] })
          }
          break
        }
        case 'note': {
          const note = { id: newId('note'), text: r.summary ?? text, source_type: 'raw_capture', created_at: new Date().toISOString() }
          db.notes.unshift(note)
          audit(db, 'capture', 'raw_capture', rawId, { kind: 'note', source })
          steps.push({ label: 'memory_chunks', detail: 'Not actionable, so it is kept as a note for semantic recall.' })
          replies.push({ from: BOT, text: `✓ Noted: ${(r.summary ?? text).slice(0, 100)}` })
          break
        }
        case 'brainstorm': {
          const idea = r.summary ?? text.slice(0, 200)
          const id = newId('cap')
          db.ideaCaptures.unshift({ id, text: idea, source: source === 'telegram' ? 'telegram' : 'web', status: 'pending', created_at: new Date().toISOString() })
          audit(db, 'capture', 'idea_capture', id, { kind: 'brainstorm', source })
          touched.ideas = true
          steps.push({ label: 'idea_captures', detail: 'Queued as a pending idea. Tonight the librarian files it in the vault, and the organized version comes back to the Journal tab.' })
          replies.push({ from: BOT, text: `✓ Captured: ${idea.slice(0, 200)}` })
          break
        }
        case 'habit_checkin': {
          audit(db, 'capture', 'raw_capture', rawId, { kind: 'habit_checkin', source, filed_as_evidence: true })
          steps.push({ label: 'work_evidence', detail: "Filed as evidence for tomorrow's plan. A check-in never completes a task on its own." })
          replies.push({ from: BOT, text: '✓ Noted, and saved for tomorrow morning.' })
          break
        }
        case 'morning_briefing': {
          audit(db, 'capture', 'raw_capture', rawId, { kind: 'morning_briefing', source })
          steps.push({ label: 'brief', detail: "Read today's plan and sent the morning brief." })
          replies.push(morningBrief(db, today))
          break
        }
        case 'wind_down': {
          const done = db.tasks.filter(t => t.completed_at && dateKey(new Date(t.completed_at)) === today).length
          const open = db.tasks.filter(t => !t.completed_at && !t.blocked && (t.planned_date === today || t.due_date === today)).length
          audit(db, 'capture', 'raw_capture', rawId, { kind: 'wind_down', source, filed_as_evidence: true })
          steps.push({ label: 'work_evidence', detail: "Filed the recap as evidence for tomorrow's plan, then sent the wind-down summary." })
          replies.push({ from: BOT, text: `Day closed. ${done} done today, ${open} still open and carried to tomorrow's plan.\nYour recap is filed, so the morning plan starts from what happened.` })
          break
        }
        case 'goal_create': {
          const id = newId('goal')
          const name = r.goal_name ?? text.slice(0, 200)
          db.goals.push({
            id, user_id: 'demo-user', name, type: r.goal_type ?? 'checklist', tab: r.goal_tab ?? 'ongoing',
            due_date: r.goal_due_date ?? null,
            target_number: r.goal_type === 'numeric' ? (r.goal_target_number ?? null) : null,
            start_number: null, current_number: 0, sort_order: db.goals.length,
            completed_at: null, archived_at: null, created_at: new Date().toISOString(),
          })
          audit(db, 'insert', 'goal', id, { name, type: r.goal_type, tab: r.goal_tab, source })
          touched.goals = true
          steps.push({ label: 'goals', detail: `Created the ${r.goal_tab ?? 'ongoing'} ${r.goal_type ?? 'checklist'} goal "${name}".` })
          replies.push({ from: BOT, text: `✓ Goal created: ${name}` })
          break
        }
        case 'goal_log_numeric': {
          const goal = bestGoal(db, r.goal_name ?? text, 'numeric')
          if (!goal) {
            replies.push({ from: BOT, text: `⚠️ Could not find a matching numeric goal for "${r.goal_name}"` })
            steps.push({ label: 'goals', detail: 'No numeric goal matched, so nothing was written.' })
            break
          }
          const amount = r.goal_amount ?? 1
          goal.current_number += amount
          const target = goal.target_number ?? 0
          const pct = target
            ? goal.start_number != null
              ? ((goal.current_number - goal.start_number) / (target - goal.start_number || 1)) * 100
              : (goal.current_number / target) * 100
            : 0
          if (pct >= 100 && !goal.completed_at) goal.completed_at = new Date().toISOString()
          audit(db, 'update', 'goal', goal.id, { current_number: goal.current_number, amount_added: amount, source })
          touched.goals = true
          steps.push({ label: 'goals', detail: `Matched "${goal.name}" by name and added ${amount}.` })
          replies.push({ from: BOT, text: `✓ Updated "${goal.name}": ${goal.current_number}${target ? ` / ${target} (${Math.round(pct)}%)` : ''}` })
          break
        }
        case 'goal_status': {
          const goal = bestGoal(db, r.goal_name ?? text)
          if (!goal) {
            replies.push({ from: BOT, text: `⚠️ Could not find a matching goal for "${r.goal_name}"` })
            break
          }
          let reply = `${goal.name}\n`
          if (goal.type === 'numeric') {
            reply += `Progress: ${goal.current_number} / ${goal.target_number ?? 0}`
          } else {
            const list = db.goalSteps.filter(s => s.goal_id === goal.id).sort((a, b) => a.sort_order - b.sort_order)
            reply += `${list.filter(s => s.done).length} / ${list.length} steps done\n\n`
            reply += list.slice(0, 8).map(s => `${s.done ? '✅' : '⬜'} ${s.text}`).join('\n')
            if (list.length > 8) reply += `\n…and ${list.length - 8} more`
          }
          audit(db, 'read', 'goal', goal.id, { source, intent: 'goal_status' })
          steps.push({ label: 'goals', detail: `Read-only. Looked up "${goal.name}" and replied with its progress.` })
          replies.push({ from: BOT, text: reply })
          break
        }
        case 'replan_day': {
          const result = applyQuickMove(db, r.summary ?? text, today)
          touched.calendar = touched.calendar || result.changed
          steps.push({
            label: 'replan',
            detail: result.changed
              ? 'A single-block move, applied in code and re-validated against the rest of the plan. No model call.'
              : 'Not a clean single-block move. Production would make one Claude call to rebuild the rest of the day.',
          })
          replies.push({ from: BOT, text: result.reply, ...(result.changed ? { buttons: ['Replan now'] } : {}) })
          break
        }
        case 'ignore':
        default:
          steps.push({ label: 'ignore', detail: 'A greeting or confirmation. Nothing to file.' })
          break
      }
    }

    if (routed.some(r => ['task', 'note', 'brainstorm'].includes(r.intent))) {
      steps.push({ label: 'memory_chunks', detail: 'Production embeds the text (1536 dimensions) into pgvector so it can be found by meaning later. The demo skips the embedding.' })
    }
    steps.push({ label: 'audit_log', detail: 'One audit row per write, which is how silent failures get found.' })
    if (replies.length > 0) {
      steps.push({ label: 'telegram', detail: `${replies.length} repl${replies.length === 1 ? 'y' : 'ies'} sent back to the phone.` })
    }
    return routed
  })

  return { routes, steps, replies, touched }
}
