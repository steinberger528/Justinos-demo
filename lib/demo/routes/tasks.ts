// Task routes. Date-driven model: a task has a planned_date (when the work happens)
// and optionally a due_date (a real deadline). No urgency tier decides what shows.

import { BLOCK_TYPES, isBlockType } from '@/lib/block-types'
import { excludeSchoolEvents, groupFor } from '@/lib/task-groups'
import { audit, getDb, mutate } from '../db'
import { addDays, dateKey, todayKey } from '../dates'
import { fail, ok, route, type Route } from '../http'
import { newId } from '../ids'
import { makeTask } from '../seed/school'
import type { TaskRow } from '../types'

function sortByDate(a: TaskRow, b: TaskRow): number {
  const ad = a.due_date ?? a.planned_date ?? '9999-99-99'
  const bd = b.due_date ?? b.planned_date ?? '9999-99-99'
  return ad < bd ? -1 : ad > bd ? 1 : 0
}

const active = (tasks: TaskRow[]) => tasks.filter(t => !t.blocked && !t.completed_at)

const POST_KEYS = new Set(['title', 'planned_date', 'due_date', 'block_type'])
const PATCH_KEYS = new Set(['title', 'completed', 'due_date', 'planned_date', 'blocked', 'in_progress', 'block_type'])

export const taskRoutes: Route[] = [
  // Today's Tasks card: overdue separately from today, plus anything finished today.
  route('GET', '/api/tasks/today', () => {
    const today = todayKey()
    const { tasks } = getDb()
    const open = excludeSchoolEvents(active(tasks))
    const completedToday = excludeSchoolEvents(
      tasks.filter(t => !t.blocked && t.completed_at && dateKey(new Date(t.completed_at)) === today),
    )
    return ok({
      today,
      overdue: open.filter(t => groupFor(t, today) === 'overdue').sort(sortByDate),
      today_tasks: [...open.filter(t => groupFor(t, today) === 'today'), ...completedToday].sort(sortByDate),
    })
  }),

  // "N unfiled": tasks with neither date.
  route('GET', '/api/tasks/backlog', () => {
    const tasks = excludeSchoolEvents(active(getDb().tasks))
      .filter(t => t.due_date === null && t.planned_date === null)
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
    return ok({ tasks })
  }),

  // Key Blockers: waiting on someone else, longest wait first.
  route('GET', '/api/tasks/blocked', () => {
    const tasks = excludeSchoolEvents(getDb().tasks.filter(t => t.blocked && !t.completed_at))
      .sort((a, b) => (a.blocked_since ?? '').localeCompare(b.blocked_since ?? ''))
    return ok({ today: todayKey(), tasks })
  }),

  route('GET', '/api/tasks/all', () => {
    const tasks = excludeSchoolEvents(active(getDb().tasks)).sort((a, b) => {
      const byDue = (a.due_date ?? '9999-99-99').localeCompare(b.due_date ?? '9999-99-99')
      return byDue !== 0 ? byDue : a.created_at.localeCompare(b.created_at)
    })
    return ok({ today: todayKey(), tasks })
  }),

  // Plan my week: a deadline strip and a work area per day, plus the undated backlog.
  route('GET', '/api/tasks/planner', ({ query }) => {
    const start = query.get('start') ?? todayKey()
    if (Number.isNaN(new Date(`${start}T00:00:00`).getTime())) return fail(400, 'invalid start date')

    const days = Array.from({ length: 7 }, (_, i) => addDays(start, i))
    const tasks = excludeSchoolEvents(active(getDb().tasks))
    const backlog = tasks.filter(t => t.due_date === null && t.planned_date === null)
    const byDay: Record<string, { due: TaskRow[]; planned: TaskRow[] }> = {}
    for (const day of days) byDay[day] = { due: [], planned: [] }
    for (const task of tasks) {
      if (task.due_date && byDay[task.due_date]) byDay[task.due_date].due.push(task)
      if (task.planned_date && byDay[task.planned_date]) byDay[task.planned_date].planned.push(task)
    }
    return ok({ today: todayKey(), backlog, days: byDay })
  }),

  route('POST', '/api/tasks', ({ body }) => {
    const invalid = Object.keys(body).filter(k => !POST_KEYS.has(k))
    if (invalid.length > 0) return fail(400, `invalid field(s): ${invalid.join(', ')}`)

    const title = typeof body.title === 'string' ? body.title.trim() : ''
    if (!title) return fail(400, 'title is required')
    if (body.block_type !== undefined && body.block_type !== null && !isBlockType(body.block_type)) {
      return fail(400, `block_type must be one of ${BLOCK_TYPES.join(', ')}, or null`)
    }

    const today = todayKey()
    const plannedDate = (body.planned_date as string | null | undefined) ?? null
    const dueDate = (body.due_date as string | null | undefined) ?? null
    const now = new Date().toISOString()

    const id = mutate(db => {
      const task = makeTask(today, {
        id: newId('tsk'),
        title,
        planned_date: plannedDate,
        due_date: dueDate,
        block_type: (body.block_type as string | null | undefined) ?? null,
        urgency: plannedDate === today ? 'today' : 'someday',
        created_at: now,
        updated_at: now,
      })
      db.tasks.push(task)
      audit(db, 'create', 'task', task.id, { title, planned_date: plannedDate, due_date: dueDate })
      return task.id
    })
    return ok({ ok: true, id })
  }),

  route('PATCH', '/api/tasks/:id', ({ params, body }) => {
    const invalid = Object.keys(body).filter(k => !PATCH_KEYS.has(k))
    if (invalid.length > 0) return fail(400, `invalid field(s): ${invalid.join(', ')}`)
    if (body.block_type !== undefined && body.block_type !== null && !isBlockType(body.block_type)) {
      return fail(400, `block_type must be one of ${BLOCK_TYPES.join(', ')}, or null`)
    }
    if (body.title !== undefined && (typeof body.title !== 'string' || !body.title.trim())) {
      return fail(400, 'title must be a non-empty string')
    }

    return mutate(db => {
      const task = db.tasks.find(t => t.id === params.id)
      if (!task) return fail(404, 'Task not found')

      const change: Record<string, unknown> = {}
      if (typeof body.title === 'string') change.title = body.title.trim()
      if (body.block_type !== undefined) change.block_type = body.block_type
      if (body.due_date !== undefined) change.due_date = body.due_date
      if (body.planned_date !== undefined) change.planned_date = body.planned_date
      if (body.blocked !== undefined) {
        change.blocked = !!body.blocked
        // Stamped here so the Key Blockers card can show "waiting N days".
        change.blocked_since = body.blocked ? todayKey() : null
      }
      if (body.in_progress !== undefined) change.in_progress = !!body.in_progress
      if (body.completed !== undefined) change.completed_at = body.completed ? new Date().toISOString() : null

      Object.assign(task, change, { updated_at: new Date().toISOString() })
      audit(db, 'update', 'task', task.id, change)

      // Only one task holds focus at a time.
      if (body.in_progress === true) {
        for (const other of db.tasks) {
          if (other.id !== task.id && other.in_progress) {
            other.in_progress = false
            audit(db, 'update', 'task', other.id, { in_progress: false, cause: 'superseded_by_focus_change' })
          }
        }
      }
      return ok()
    })
  }),

  route('DELETE', '/api/tasks/:id', ({ params }) =>
    mutate(db => {
      const index = db.tasks.findIndex(t => t.id === params.id)
      if (index === -1) return fail(404, 'Task not found')
      const [removed] = db.tasks.splice(index, 1)
      audit(db, 'delete', 'task', removed.id, { title: removed.title })
      return ok()
    }),
  ),
]
