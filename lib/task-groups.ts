// Pure, clock-free grouping logic for the date-driven tasks model
// (specs/tasks-date-driven-refactor.md). Every caller — server routes and
// TasksModal client-side — passes in `todayKey` (a `YYYY-MM-DD` string) rather
// than letting this module read the clock itself, so "today" always comes
// from one place (zonedDateKey() on the server) and the server and client
// never disagree about what day it is.

export interface TaskDates {
  due_date: string | null
  planned_date?: string | null
  item_type?: string | null
}

export type TaskGroup = 'overdue' | 'today' | 'week' | 'later' | 'backlog'

const SCHOOL_EVENT_TYPES = new Set(['exam', 'quiz'])

/** Exams and quizzes are calendar events, not tasks — see the parent spec's data model. */
export function isSchoolEvent(task: Pick<TaskDates, 'item_type'>): boolean {
  return task.item_type != null && SCHOOL_EVENT_TYPES.has(task.item_type)
}

export function excludeSchoolEvents<T extends Pick<TaskDates, 'item_type'>>(tasks: T[]): T[] {
  return tasks.filter(t => !isSchoolEvent(t))
}

export function addDays(dateKey: string, days: number): string {
  const d = new Date(`${dateKey}T00:00:00`)
  d.setDate(d.getDate() + days)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** The sooner of a task's two dates, or null if it has neither. */
export function earliestDate(task: TaskDates): string | null {
  const dates = [task.due_date, task.planned_date ?? null].filter((d): d is string => d !== null)
  return dates.length === 0 ? null : dates.sort()[0]
}

/**
 * A task is overdue if either date has passed — a missed deadline, or a work
 * session you planned and skipped. Deliberately does NOT exempt a placeholder
 * due_date (`date_is_placeholder`, a date estimated from a syllabus): overdue
 * means the date passed, full stop. Exempting them silently disabled red-overdue
 * for the entire seeded school corpus, which is exactly the population that
 * needs it, and stranded past-dated items in the "This Week" bucket.
 */
export function isOverdue(task: TaskDates, todayKey: string): boolean {
  const dueOverdue = task.due_date !== null && task.due_date < todayKey
  const plannedOverdue = (task.planned_date ?? null) !== null && (task.planned_date as string) < todayKey
  return dueOverdue || plannedOverdue
}

/** True if the task belongs on today's list — due today or planned for today. */
export function isTodayRelevant(task: TaskDates, todayKey: string): boolean {
  return task.due_date === todayKey || task.planned_date === todayKey
}

export function groupFor(task: TaskDates, todayKey: string): TaskGroup {
  if (isOverdue(task, todayKey)) return 'overdue'
  if (isTodayRelevant(task, todayKey)) return 'today'
  const earliest = earliestDate(task)
  if (earliest === null) return 'backlog'
  return earliest <= addDays(todayKey, 7) ? 'week' : 'later'
}

// Shared by KeyBlockersCard and TaskPlanner's Waiting On column — both display
// `blocked = true` tasks. `todayKey` comes from the API (zonedDateKey()), not
// the browser clock: blocked_since is stamped server-side in USER_TIMEZONE.
export function daysWaiting(blockedSince: string, todayKey: string): number {
  const since = new Date(`${blockedSince}T00:00:00`)
  const today = new Date(`${todayKey}T00:00:00`)
  const diffMs = today.getTime() - since.getTime()
  return Math.max(0, Math.round(diffMs / 86_400_000))
}

export function waitingLabel(blockedSince: string | null | undefined, todayKey: string | null): string {
  if (!blockedSince || !todayKey) return 'waiting'
  const days = daysWaiting(blockedSince, todayKey)
  if (days === 0) return 'waiting since today'
  if (days === 1) return 'waiting 1 day'
  return `waiting ${days} days`
}
