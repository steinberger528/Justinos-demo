// Sample data for the Home tab: tasks, calendar, the day plan Neptune would have
// built this morning, habits, nutrition and goals. All of it is invented and keyed
// off "today", so the dashboard looks lived-in on whatever day it is opened.

import type {
  BriefQuestionRow, CalendarEventRow, DailyLog, DayPlanRow, DayRuleRow, FixedEventRow,
  GoalRow, GoalStepRow, PlanBlock, Quote, TaskRow,
} from '../types'
import { DAY_CODES, addDays, isoAt, weekdayOf } from '../dates'
import { AGENTIC_OS_GOAL_ID, DEMO_USER_ID } from '../ids'
import { makeTask } from './school'

// ── Tasks ────────────────────────────────────────────────────────────────────

export function seedPersonalTasks(today: string): TaskRow[] {
  const daysAgo = (n: number, time = '09:00') => isoAt(addDays(today, -n), time)
  const t = (partial: Partial<TaskRow> & { id: string; title: string }) => makeTask(today, partial)

  return [
    // Overdue
    t({ id: 'tsk-reimburse', title: 'Submit travel reimbursement form', block_type: 'Computer', due_date: addDays(today, -2), planned_date: addDays(today, -3), urgency: 'week', created_at: daysAgo(8) }),

    // Today
    t({ id: 'tsk-recap', title: 'Send capstone sponsor the meeting recap', block_type: 'Computer', planned_date: today, urgency: 'today', in_progress: true, created_at: daysAgo(2) }),
    t({ id: 'tsk-drafts', title: 'Review two drafts in the agency outbox', block_type: 'Computer', planned_date: today, urgency: 'today', created_at: daysAgo(1) }),
    t({ id: 'tsk-bank', title: 'Call the bank about the replacement card', block_type: 'Calls', planned_date: today, due_date: today, urgency: 'today', created_at: daysAgo(4) }),
    t({ id: 'tsk-cleaning', title: 'Pick up dry cleaning', block_type: 'Errands', planned_date: today, urgency: 'today', created_at: daysAgo(3) }),
    t({ id: 'tsk-resume', title: 'Add the summer internship to my resume', block_type: 'Career', planned_date: today, urgency: 'today', created_at: daysAgo(6) }),
    t({ id: 'tsk-laundry', title: 'Laundry and reset the apartment', block_type: 'Home', planned_date: today, urgency: 'today', completed_at: isoAt(today, '07:40'), created_at: daysAgo(2) }),

    // Finished yesterday (feeds the Briefing modal's Yesterday tab)
    t({ id: 'tsk-landlord', title: 'Email the landlord about lease renewal', block_type: 'Computer', planned_date: addDays(today, -1), completed_at: isoAt(addDays(today, -1), '09:05'), created_at: daysAgo(5) }),
    t({ id: 'tsk-notes', title: 'Clean up forecasting lecture notes', block_type: 'School', planned_date: addDays(today, -1), completed_at: isoAt(addDays(today, -1), '16:30'), created_at: daysAgo(4) }),
    t({ id: 'tsk-outreach', title: 'Send three outreach emails from the outbox', block_type: 'Computer', planned_date: addDays(today, -1), completed_at: isoAt(addDays(today, -1), '20:35'), created_at: daysAgo(2) }),
    t({ id: 'tsk-groceries', title: 'Groceries for the week', block_type: 'Errands', planned_date: addDays(today, -1), completed_at: isoAt(addDays(today, -1), '18:40'), created_at: daysAgo(3) }),

    // This week
    t({ id: 'tsk-chat-prep', title: 'Draft questions for the alumni coffee chat', block_type: 'Career', planned_date: addDays(today, 1), urgency: 'week', created_at: daysAgo(3) }),
    t({ id: 'tsk-review-deck', title: 'Outline the design review deck', block_type: 'School', planned_date: addDays(today, 2), urgency: 'week', tags: ['school', 'MGT 480'], created_at: daysAgo(2) }),
    t({ id: 'tsk-permit', title: 'Renew parking permit', block_type: 'Errands', due_date: addDays(today, 3), urgency: 'week', created_at: daysAgo(9) }),
    t({ id: 'tsk-dentist', title: 'Schedule a dentist cleaning', block_type: 'Calls', planned_date: addDays(today, 4), urgency: 'week', created_at: daysAgo(7) }),
    t({ id: 'tsk-flights', title: 'Book flights home for the break', block_type: 'Computer', due_date: addDays(today, 5), urgency: 'week', created_at: daysAgo(10) }),

    // Later
    t({ id: 'tsk-backup', title: 'Back up the laptop to the external drive', block_type: 'Home', planned_date: addDays(today, 10), urgency: 'month', created_at: daysAgo(12) }),
    t({ id: 'tsk-certs', title: 'Research certifications worth adding', block_type: 'Career', planned_date: addDays(today, 12), urgency: 'month', created_at: daysAgo(15) }),
    t({ id: 'tsk-insurance', title: "Renew renter's insurance", block_type: 'Computer', due_date: addDays(today, 18), urgency: 'month', created_at: daysAgo(11) }),

    // Backlog: no dates. The oldest ones surface under "Neptune Recommended" in Plan my week.
    t({ id: 'tsk-phone', title: 'Compare phone plans', created_at: daysAgo(22) }),
    t({ id: 'tsk-lamp', title: 'Replace the desk lamp', block_type: 'Errands', created_at: daysAgo(17) }),
    t({ id: 'tsk-template', title: 'Find a better note template for lectures', block_type: 'School', created_at: daysAgo(13) }),
    t({ id: 'tsk-ta', title: 'Ask about teaching assistant openings', block_type: 'Career', created_at: daysAgo(9) }),
    t({ id: 'tsk-writeup', title: 'Write up the internship project for the portfolio', block_type: 'Career', created_at: daysAgo(6) }),
    t({ id: 'tsk-downloads', title: 'Clean out the downloads folder', block_type: 'Computer', created_at: daysAgo(3) }),

    // Waiting on someone else (Key Blockers)
    t({ id: 'tsk-data', title: 'Plant-floor data from the capstone sponsor', blocked: true, blocked_since: addDays(today, -6), block_type: 'School', created_at: daysAgo(9) }),
    t({ id: 'tsk-lease', title: "Landlord's counter on the lease", blocked: true, blocked_since: addDays(today, -3), created_at: daysAgo(5) }),
    t({ id: 'tsk-reference', title: 'Reference letter from my summer manager', blocked: true, blocked_since: addDays(today, -1), block_type: 'Career', created_at: daysAgo(4) }),
  ]
}

// ── Fixed events, day rules ──────────────────────────────────────────────────

export function seedManualFixedEvents(): FixedEventRow[] {
  const base = { buffer_before: 0, buffer_after: 0, effective_from: null, effective_to: null, vault_path: null }
  return [
    { ...base, id: 'fx-agency', label: 'Agency hour', kind: 'work', days: ['MO', 'TU', 'WE', 'TH', 'FR'], start: '20:00:00', end: '21:00:00', location: null, hard: false, source: 'manual', gcal_event_id: 'demo-gcal-agency' },
    { ...base, id: 'fx-sync', label: 'Capstone team sync', kind: 'other', days: ['TU'], start: '17:00:00', end: '17:45:00', location: 'Library room 3B', buffer_before: 5, hard: true, source: 'manual', gcal_event_id: 'demo-gcal-sync' },
    { ...base, id: 'fx-reset', label: 'Sunday reset', kind: 'protected', days: ['SU'], start: '18:00:00', end: '19:30:00', location: null, hard: true, source: 'manual', gcal_event_id: null },
  ]
}

export function seedDayRules(): DayRuleRow[] {
  const every = [...DAY_CODES.slice(1), DAY_CODES[0]] as DayRuleRow['days']
  const base = {
    days: every, duration_min: null, window_start: null, window_end: null, block_type: null,
    min_chunk_min: null, splittable: false, active: true, course_code: null, weight: null, is_intention: false,
  }
  return [
    { ...base, id: 'rule-wake', label: 'Wake', kind: 'anchor', window_start: '07:00' },
    { ...base, id: 'rule-lunch', label: 'Lunch', kind: 'window', duration_min: 45, window_start: '11:30', window_end: '14:00' },
    { ...base, id: 'rule-dinner', label: 'Dinner', kind: 'window', duration_min: 60, window_start: '18:00', window_end: '20:00' },
    { ...base, id: 'rule-workout', label: 'Workout', kind: 'window', duration_min: 75, window_start: '15:00', window_end: '20:00', is_intention: true },
    { ...base, id: 'rule-school', label: 'School block', kind: 'window', duration_min: 120, block_type: 'School', splittable: true, min_chunk_min: 45 },
    { ...base, id: 'rule-career', label: 'Career block', kind: 'window', duration_min: 45, block_type: 'Career', days: ['MO', 'WE', 'FR'] },
    { ...base, id: 'rule-shutdown', label: 'Evening shutdown', kind: 'window', duration_min: 30, window_start: '21:30', window_end: '22:30', active: false },
    { ...base, id: 'rule-w-ops', label: 'Supply Chain Analytics', kind: 'window', course_code: 'OPS 410', weight: 3 },
    { ...base, id: 'rule-w-cs', label: 'Databases and Data Engineering', kind: 'window', course_code: 'CS 331', weight: 2.5 },
    { ...base, id: 'rule-w-stat', label: 'Applied Regression', kind: 'window', course_code: 'STAT 355', weight: 2 },
    { ...base, id: 'rule-w-mgt', label: 'Capstone Studio', kind: 'window', course_code: 'MGT 480', weight: 1 },
  ]
}

// ── Calendar ─────────────────────────────────────────────────────────────────

/** One-off events. Times sit in slots no class ever uses, whatever weekday today is. */
export function seedCalendarEvents(today: string): CalendarEventRow[] {
  const ev = (id: string, offset: number, start: string, end: string, title: string, location?: string): CalendarEventRow => {
    const day = addDays(today, offset)
    return { id, title, start: isoAt(day, start), end: isoAt(day, end), ...(location ? { location } : {}) }
  }
  return [
    ev('cal-lab-partner', -3, '12:30', '13:15', 'Coffee with lab partner', 'Union Café'),
    ev('cal-groceries', -1, '18:15', '18:45', 'Grocery run'),
    ev('cal-mentor', 0, '12:30', '13:15', 'Coffee chat with an alumni mentor', 'Union Café'),
    ev('cal-advising', 1, '12:30', '13:00', 'Advising appointment', 'Hale Hall 110'),
    ev('cal-workshop', 2, '18:15', '19:15', 'Career fair prep workshop', 'Career Center'),
    ev('cal-roommates', 3, '19:00', '20:00', 'Dinner with roommates'),
    ev('cal-client', 5, '12:30', '13:00', 'Client call: Fernhollow Dental', 'Video'),
    ev('cal-study', 7, '18:15', '19:45', 'Study group: STAT 355', 'Library, 3rd floor'),
    ev('cal-fair', 9, '12:30', '13:45', 'Career fair', 'Student Center ballroom'),
    ev('cal-visit', 12, '12:30', '13:30', 'Sponsor site visit debrief', 'Studio B'),
  ]
}

// ── Day plan ─────────────────────────────────────────────────────────────────
// In production a Claude call places rule windows and task blocks into the open time
// around fixed events. The demo ships one hand-built layout per weekday pattern and
// drops that day's tasks into the matching block types.

type Slot = [start: string, end: string, type: string, title: string]

const classBlock = (start: string, end: string, label: string, prep = true): Slot[] => {
  const [h, m] = start.split(':').map(Number)
  const prepStart = `${String(Math.floor((h * 60 + m - 15) / 60)).padStart(2, '0')}:${String((h * 60 + m - 15) % 60).padStart(2, '0')}`
  const [eh, em] = end.split(':').map(Number)
  const travelEnd = `${String(Math.floor((eh * 60 + em + 10) / 60)).padStart(2, '0')}:${String((eh * 60 + em + 10) % 60).padStart(2, '0')}`
  return [
    ...(prep ? [[prepStart, start, 'buffer', `Prep / travel: ${label}`] as Slot] : []),
    [start, end, 'fixed_event', label],
    [end, travelEnd, 'buffer', `Travel: ${label}`],
  ]
}

const WAKE: Slot = ['07:00', '07:15', 'anchor', 'Wake']
const AGENCY: Slot = ['20:00', '21:00', 'fixed_event', 'Agency hour']

// Every layout leaves half an hour free on one side of the Workout block, so the
// guides can always offer a single-block move that applies cleanly.
const TEMPLATES: Record<string, Slot[]> = {
  MW: [
    WAKE,
    ['08:00', '09:10', 'Computer', 'Computer block'],
    ...classBlock('09:30', '10:45', 'OPS 410 lecture'),
    ['11:00', '11:30', 'Calls', 'Calls'],
    ['11:30', '12:15', 'rule', 'Lunch'],
    ['13:15', '13:45', 'Errands', 'Errands'],
    ...classBlock('14:00', '15:15', 'CS 331 lecture'),
    ['15:30', '17:00', 'School', 'School block'],
    ['17:30', '18:45', 'rule', 'Workout'],
    ['19:00', '19:50', 'rule', 'Dinner'],
    AGENCY,
    ['21:10', '21:40', 'Career', 'Career block'],
  ],
  TU: [
    WAKE,
    ['08:00', '09:15', 'Computer', 'Computer block'],
    ['09:30', '10:40', 'School', 'School block'],
    ...classBlock('11:00', '12:15', 'STAT 355 lecture'),
    ['13:15', '14:00', 'rule', 'Lunch'],
    ['14:10', '14:40', 'Calls', 'Calls'],
    ['15:00', '16:15', 'rule', 'Workout'],
    ['16:55', '17:00', 'buffer', 'Prep / travel: Capstone team sync'],
    ['17:00', '17:45', 'fixed_event', 'Capstone team sync'],
    ['18:00', '18:30', 'Errands', 'Errands'],
    ['18:45', '19:35', 'rule', 'Dinner'],
    AGENCY,
    ['21:10', '22:00', 'School', 'School block'],
    ['22:00', '22:30', 'Career', 'Career block'],
  ],
  TH: [
    WAKE,
    ['08:00', '09:15', 'Computer', 'Computer block'],
    ['09:30', '10:40', 'School', 'School block'],
    ...classBlock('11:00', '12:15', 'STAT 355 lecture'),
    ['13:15', '13:45', 'rule', 'Lunch'],
    ...classBlock('14:00', '16:30', 'MGT 480 studio'),
    ['16:45', '17:05', 'Calls', 'Calls'],
    ['17:05', '17:30', 'Errands', 'Errands'],
    ['18:00', '19:15', 'rule', 'Workout'],
    ['19:15', '20:00', 'rule', 'Dinner'],
    AGENCY,
    ['21:10', '21:55', 'School', 'School block'],
    ['21:55', '22:25', 'Career', 'Career block'],
  ],
  FR: [
    WAKE,
    ['08:00', '09:30', 'Computer', 'Computer block'],
    ['09:45', '11:30', 'School', 'School block'],
    ['11:30', '12:15', 'rule', 'Lunch'],
    ['13:15', '13:45', 'Calls', 'Calls'],
    ['13:45', '14:15', 'Errands', 'Errands'],
    ['14:30', '16:00', 'School', 'School block'],
    ['16:15', '17:00', 'Career', 'Career block'],
    ['17:30', '18:45', 'rule', 'Workout'],
    ['19:00', '19:50', 'rule', 'Dinner'],
    AGENCY,
  ],
  SA: [
    WAKE,
    ['09:00', '10:30', 'School', 'School block'],
    ['10:45', '11:40', 'Computer', 'Computer block'],
    ['11:40', '12:25', 'rule', 'Lunch'],
    ['13:30', '14:00', 'Errands', 'Errands'],
    ['14:00', '14:30', 'Calls', 'Calls'],
    ['14:45', '16:15', 'School', 'School block'],
    ['16:45', '18:00', 'rule', 'Workout'],
    ['18:30', '19:30', 'rule', 'Dinner'],
    ['19:45', '20:30', 'Career', 'Career block'],
  ],
  SU: [
    WAKE,
    ['09:00', '10:30', 'School', 'School block'],
    ['10:45', '11:40', 'Computer', 'Computer block'],
    ['11:40', '12:25', 'rule', 'Lunch'],
    ['13:30', '14:00', 'Errands', 'Errands'],
    ['14:00', '14:30', 'Calls', 'Calls'],
    ['14:30', '16:00', 'School', 'School block'],
    ['16:30', '17:45', 'rule', 'Workout'],
    ['18:00', '19:30', 'fixed_event', 'Sunday reset'],
    ['19:30', '20:15', 'rule', 'Dinner'],
    ['20:30', '21:15', 'Career', 'Career block'],
  ],
}

function templateFor(date: string): Slot[] {
  const dow = weekdayOf(date)
  if (dow === 1 || dow === 3) return TEMPLATES.MW
  if (dow === 2) return TEMPLATES.TU
  if (dow === 4) return TEMPLATES.TH
  if (dow === 5) return TEMPLATES.FR
  if (dow === 6) return TEMPLATES.SA
  return TEMPLATES.SU
}

const TASK_BLOCK_TYPES = ['Computer', 'Home', 'Errands', 'Calls', 'School', 'Career']

/** Builds a plan for `date` from that weekday's layout and the given tasks. */
export function buildPlanBlocks(date: string, tasks: Pick<TaskRow, 'id' | 'block_type'>[]): PlanBlock[] {
  const byType = new Map<string, string[]>()
  for (const t of tasks) {
    const type = t.block_type && TASK_BLOCK_TYPES.includes(t.block_type) ? t.block_type : 'Computer'
    byType.set(type, [...(byType.get(type) ?? []), t.id])
  }

  const slots = templateFor(date)
  const blocks: PlanBlock[] = []
  for (const [start, end, type, title] of slots) {
    if (!TASK_BLOCK_TYPES.includes(type)) {
      blocks.push({ start, end, type, title, task_ids: [] })
      continue
    }
    const remaining = byType.get(type) ?? []
    if (remaining.length === 0) continue // nothing of this type today, so the block is not planned
    // A type with two blocks in the day (School) shares its tasks across them.
    const laterBlocks = slots.filter(s => s[2] === type && s[0] > start).length
    const take = laterBlocks > 0 ? Math.ceil(remaining.length / (laterBlocks + 1)) : remaining.length
    blocks.push({ start, end, type, title, task_ids: remaining.slice(0, take) })
    byType.set(type, remaining.slice(take))
  }
  return blocks
}

// Short public-domain lines. Production reads its quote bank from a markdown file and
// never repeats one within 30 days.
export const QUOTES: Quote[] = [
  { id: 'q-begun', text: 'Well begun is half done.', attribution: 'Proverb, after Aristotle' },
  { id: 'q-lost-time', text: 'Lost time is never found again.', attribution: 'Benjamin Franklin' },
  { id: 'q-well-done', text: 'Well done is better than well said.', attribution: 'Benjamin Franklin' },
  { id: 'q-perseverance', text: 'Great works are performed not by strength but by perseverance.', attribution: 'Samuel Johnson' },
  { id: 'q-suddenly', text: 'No great thing is created suddenly.', attribution: 'Epictetus' },
]

export function seedDayPlans(today: string, tasks: TaskRow[]): Record<string, DayPlanRow> {
  const yesterday = addDays(today, -1)
  const todayDate = new Date(`${today}T00:00:00`)
  const dayOfYear = Math.floor((todayDate.getTime() - new Date(todayDate.getFullYear(), 0, 0).getTime()) / 86_400_000)

  const isTodayTask = (t: TaskRow) =>
    !t.blocked && t.item_type !== 'exam' && t.item_type !== 'quiz' && t.item_type !== 'milestone' && (
      t.planned_date === today || t.due_date === today ||
      (!t.completed_at && ((t.due_date !== null && t.due_date < today) || (t.planned_date !== null && t.planned_date < today)))
    )
  const todayTasks = tasks.filter(isTodayTask)
  const yesterdayTasks = tasks.filter(t =>
    !!t.completed_at && t.item_type !== 'milestone' && (t.planned_date === yesterday || t.due_date === yesterday))

  // The 9:00 cutoff finalizes the morning draft; before that it is still a draft.
  const pastCutoff = new Date().getHours() >= 9

  return {
    [today]: {
      date: today,
      status: pastCutoff ? 'final' : 'draft',
      blocks: buildPlanBlocks(today, todayTasks),
      quote_used: QUOTES[dayOfYear % QUOTES.length].id,
      carried_over: ['tsk-reimburse', 'sch-ops-hw3'],
      pushed: [{ task_id: 'tsk-downloads', reason: 'No room today. It has no deadline.' }],
      generated_at: isoAt(today, '06:54'),
      finalized_at: pastCutoff ? isoAt(today, '09:37') : null,
    },
    [yesterday]: {
      date: yesterday,
      status: 'final',
      blocks: buildPlanBlocks(yesterday, yesterdayTasks),
      quote_used: QUOTES[(dayOfYear + QUOTES.length - 1) % QUOTES.length].id,
      carried_over: [],
      pushed: [{ task_id: 'tsk-reimburse', reason: 'Pushed when the School block ran long.' }],
      generated_at: isoAt(yesterday, '06:55'),
      finalized_at: isoAt(yesterday, '09:36'),
    },
  }
}

export function seedBriefQuestions(today: string): BriefQuestionRow[] {
  return [
    { id: 'bq-1', date: today, kind: 'progress', question: 'You worked on the sponsor meeting recap yesterday. Did you finish it?', answer: 'Almost. Sending it in the first Computer block.' },
    { id: 'bq-2', date: today, kind: 'deadline', question: 'Homework 3 for OPS 410 was due yesterday and is still open. Do it first in the School block?', answer: 'Yes, first thing.' },
    { id: 'bq-3', date: today, kind: 'rollover', question: '"Submit travel reimbursement form" has rolled over three days. Keep it today or push it to the weekend?', answer: 'Keep it today.' },
    { id: 'bq-4', date: today, kind: 'backlog', question: '"Compare phone plans" has sat in the backlog for three weeks. Give it a day, or drop it?', answer: null },
    { id: 'bq-5', date: today, kind: 'open', question: 'Anything else I should plan around today?', answer: 'Coffee chat at 12:30. Keep the hour before it light.' },
  ]
}

// ── Habits and nutrition ─────────────────────────────────────────────────────

export function seedDailyLogs(today: string): Record<string, DailyLog> {
  const logs: Record<string, DailyLog> = {}

  logs[today] = {
    habits: {
      morning: { done: false, steps: [true, true, false, false] },
      workout: { done: false },
      nutrition: { done: false },
      deepwork: { done: true },
      journal: { done: false },
      nightly: { done: false, steps: [false, false, false] },
    },
    nutrition: {
      calories: { current: 1640, goal: 2400 },
      protein: { current: 122, goal: 170 },
      carbs: { current: 171, goal: 270 },
      fat: { current: 52, goal: 78 },
      fiber: { current: 19, goal: 34 },
      fatBreakdown: { goodFat: 35.5, badFat: 16.5 },
      meals: [
        { name: 'Breakfast', kcal: 480 },
        { name: 'Lunch', kcal: 720 },
        { name: 'Snacks', kcal: 440 },
      ],
      syncedAt: new Date(Date.now() - 47 * 60_000).toISOString(),
    },
  }

  // A week and a half of history, so stepping back through the Briefing modal has
  // something to show. The pattern is fixed, not random, so every visitor sees the same.
  const pattern = [
    [1, 1, 1, 1, 1, 0], [1, 0, 1, 1, 0, 1], [1, 1, 0, 1, 1, 1], [0, 1, 1, 0, 1, 0], [1, 1, 1, 1, 1, 1],
    [1, 0, 1, 1, 0, 0], [1, 1, 1, 0, 1, 1], [0, 0, 1, 1, 1, 0], [1, 1, 1, 1, 0, 1], [1, 1, 0, 1, 1, 1],
  ]
  pattern.forEach((p, i) => {
    const [morning, workout, nutrition, deepwork, journal, nightly] = p.map(Boolean)
    logs[addDays(today, -(i + 1))] = {
      habits: {
        morning: { done: morning, steps: [true, true, morning, morning] },
        workout: { done: workout },
        nutrition: { done: nutrition },
        deepwork: { done: deepwork },
        journal: { done: journal },
        nightly: { done: nightly, steps: [nightly, nightly, nightly] },
      },
    }
  })

  return logs
}

// ── Goals ────────────────────────────────────────────────────────────────────

export function seedGoals(today: string): { goals: GoalRow[]; steps: GoalStepRow[] } {
  const created = isoAt(addDays(today, -45), '10:00')
  const goal = (partial: Partial<GoalRow> & { id: string; name: string; type: GoalRow['type']; tab: GoalRow['tab'] }): GoalRow => ({
    user_id: DEMO_USER_ID,
    due_date: null,
    target_number: null,
    start_number: null,
    current_number: 0,
    sort_order: 0,
    completed_at: null,
    archived_at: null,
    created_at: created,
    ...partial,
  })

  const goals: GoalRow[] = [
    goal({ id: 'goal-review', name: 'Capstone design review 1', type: 'checklist', tab: 'timed', due_date: addDays(today, 15), sort_order: 0 }),
    goal({ id: 'goal-half', name: 'Run a half marathon', type: 'checklist', tab: 'timed', due_date: addDays(today, 47), sort_order: 1 }),
    goal({ id: 'goal-portfolio', name: 'Refresh the portfolio site', type: 'checklist', tab: 'timed', due_date: addDays(today, -3), sort_order: 2 }),
    goal({ id: AGENTIC_OS_GOAL_ID, name: 'Agentic OS', type: 'checklist', tab: 'ongoing', sort_order: 3 }),
    goal({ id: 'goal-books', name: 'Read 12 books this year', type: 'numeric', tab: 'ongoing', target_number: 12, current_number: 8, sort_order: 4 }),
    goal({ id: 'goal-fund', name: 'Emergency fund', type: 'numeric', tab: 'ongoing', start_number: 1200, target_number: 5000, current_number: 3350, sort_order: 5 }),
  ]

  const stepSpecs: Record<string, [text: string, done: boolean][]> = {
    'goal-review': [
      ['Problem statement signed off', true],
      ['Current-state process map', true],
      ['Three concept sketches', false],
      ['Review slides', false],
    ],
    'goal-half': [
      ['Pick a race and register', true],
      ['Long run: 6 miles', true],
      ['Long run: 8 miles', true],
      ['Long run: 10 miles', false],
      ['Taper week', false],
      ['Race day', false],
    ],
    'goal-portfolio': [
      ['Pick three projects to feature', true],
      ['Write the project pages', true],
      ['New headshot and bio', false],
      ['Publish and share the link', false],
    ],
    [AGENTIC_OS_GOAL_ID]: [
      ['B0 · Global instructions file every session loads', true],
      ['B0 · A capability card for every running automation', true],
      ['B0 · Runtime and autonomy tiers written down', true],
      ['B0 · Fixed events table and dashboard modal', true],
      ['B1 · Bridge CLI between the vault and the dashboard API', true],
      ['B1 · Capability cards pushed to the dashboard', true],
      ['B1 · Control Room tab', true],
      ['B1 · Run telemetry pushed from the laptop', true],
      ['B2 · Neptune: day rules, day plans and brief questions', true],
      ['B2 · Neptune: morning brief on a server cron', true],
      ['B2 · Neptune: re-plan from Telegram with a budget guard', true],
      ['B2 · Neptune: heartbeat check-ins', true],
      ['B2 · Neptune: briefing modal and settings page', true],
      ['B2 · Neptune: nightly recap feeds the next plan', true],
      ['B3 · School: Canvas sync', true],
      ['B3 · School: lecture ingestion into course notes', true],
      ['B3 · School: study plans and an exam-minus-14 trigger', false],
      ['B4 · Ares: stale sweep and nudge queue', false],
      ['B4 · Ares: weekly review', false],
      ['B5 · Iris: inbox triage and commitment extraction', false],
      ['B5 · Iris: draft replies, never sent without a yes', false],
      ['B6 · Career: tailored CV and application tracking', false],
      ['B7 · Session hooks and a promotion log', false],
      ['B8 · Quiet domains: health, finance, relationships', false],
    ],
  }

  const steps: GoalStepRow[] = []
  for (const [goalId, list] of Object.entries(stepSpecs)) {
    list.forEach(([text, done], i) => {
      steps.push({ id: `${goalId}-s${i + 1}`, goal_id: goalId, text, done, sort_order: i, created_at: created })
    })
  }
  return { goals, steps }
}
