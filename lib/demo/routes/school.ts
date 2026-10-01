// School routes. School items are ordinary task rows with item_type set, so the
// same rows also feed Today's Tasks, the planner and the calendar.

import type { SchoolComponent, SchoolItemType, Topic } from '@/lib/school-types'
import { audit, getDb, mutate } from '../db'
import { todayKey } from '../dates'
import { fail, ok, route, type Route } from '../http'
import { newId } from '../ids'
import { makeTask } from '../seed/school'
import type { TaskRow } from '../types'

const ITEM_TYPES: SchoolItemType[] = ['assignment', 'exam', 'quiz', 'project', 'milestone', 'lab', 'reading']
const COMPONENTS: SchoolComponent[] = ['group', 'individual']
const PATCH_KEYS = new Set([
  'title', 'description', 'due_date', 'date_is_placeholder', 'completed', 'in_progress',
  'is_working', 'blocked', 'urgency', 'key', 'priority_score', 'topics', 'topicToggle',
])

const byDueDate = (a: TaskRow, b: TaskRow) =>
  (a.due_date ?? '9999-99-99').localeCompare(b.due_date ?? '9999-99-99')

export const schoolRoutes: Route[] = [
  route('GET', '/api/school/overview', () => {
    const db = getDb()
    return ok({
      courses: db.courses,
      tasks: db.tasks.filter(t => t.item_type !== null).sort(byDueDate),
    })
  }),

  route('GET', '/api/school/courses/:id', ({ params }) => {
    const db = getDb()
    const course = db.courses.find(c => c.id === params.id)
    if (!course) return fail(404, 'course not found')
    return ok({
      course,
      tasks: db.tasks.filter(t => t.entity_id === params.id && t.item_type !== null).sort(byDueDate),
    })
  }),

  route('POST', '/api/school/tasks', ({ body }) => {
    const title = typeof body.title === 'string' ? body.title.trim() : ''
    if (!title) return fail(400, 'title is required')
    const itemType = body.item_type as SchoolItemType
    if (!ITEM_TYPES.includes(itemType)) return fail(400, `item_type must be one of: ${ITEM_TYPES.join(', ')}`)
    const component = (body.component ?? null) as SchoolComponent | null
    if (component !== null && !COMPONENTS.includes(component)) {
      return fail(400, `component must be one of: ${COMPONENTS.join(', ')}`)
    }

    const now = new Date().toISOString()
    const task = mutate(db => {
      const entityId = (body.entity_id as string | null | undefined) ?? null
      const course = db.courses.find(c => c.id === entityId)
      const row = makeTask(todayKey(), {
        id: newId('sch'),
        title,
        entity_id: entityId,
        item_type: itemType,
        due_date: (body.due_date as string | null | undefined) ?? null,
        date_is_placeholder: !!body.date_is_placeholder,
        component,
        parent_task_id: (body.parent_task_id as string | null | undefined) ?? null,
        urgency: 'month',
        description: (body.description as string | null | undefined) ?? null,
        tags: course ? ['school', course.metadata.code] : ['school'],
        block_type: 'School',
        created_at: now,
        updated_at: now,
      })
      db.tasks.push(row)
      audit(db, 'create', 'task', row.id, { title, item_type: itemType, entity_id: entityId })
      return row
    })
    return ok({ ok: true, task })
  }),

  route('PATCH', '/api/school/tasks/:id', ({ params, body }) => {
    const invalid = Object.keys(body).filter(k => !PATCH_KEYS.has(k))
    if (invalid.length > 0) return fail(400, `invalid field(s): ${invalid.join(', ')}`)

    return mutate(db => {
      const task = db.tasks.find(t => t.id === params.id)
      if (!task) return fail(404, 'Task not found')

      const change: Record<string, unknown> = {}
      if (body.title !== undefined) change.title = body.title
      if (body.description !== undefined) change.description = body.description
      if (body.due_date !== undefined) change.due_date = body.due_date
      if (body.date_is_placeholder !== undefined) change.date_is_placeholder = body.date_is_placeholder
      if (body.completed !== undefined) change.completed_at = body.completed ? new Date().toISOString() : null
      if (body.in_progress !== undefined) change.in_progress = body.in_progress
      if (body.blocked !== undefined) change.blocked = body.blocked
      if (body.urgency !== undefined) change.urgency = body.urgency
      if (body.key !== undefined) change.key = body.key
      if (body.priority_score !== undefined) change.priority_score = body.priority_score
      // Saving a real date over an estimated one confirms it.
      if (body.due_date !== undefined && body.date_is_placeholder === undefined) change.date_is_placeholder = false

      if (body.topics !== undefined) {
        change.topics = body.topics as Topic[]
      } else if (body.topicToggle !== undefined) {
        const { index, done } = body.topicToggle as { index: number; done: boolean }
        if (index < 0 || index >= task.topics.length) return fail(400, 'topic index out of range')
        change.topics = task.topics.map((t, i) => (i === index ? { ...t, done } : t))
      }

      // "Working" is a single slot across every task: setting one clears the rest,
      // and finishing a task releases it.
      let workingMode: 'set' | 'clear' | undefined
      if (body.is_working === true) workingMode = 'set'
      else if (body.is_working === false || body.completed === true) workingMode = 'clear'

      if (Object.keys(change).length === 0 && workingMode === undefined) return fail(400, 'no fields to update')

      Object.assign(task, change, { updated_at: new Date().toISOString() })
      if (Object.keys(change).length > 0) audit(db, 'update', 'task', task.id, change)

      if (workingMode === 'set') {
        for (const other of db.tasks) {
          if (other.id !== task.id && other.is_working) {
            other.is_working = false
            audit(db, 'update', 'task', other.id, { is_working: false, cause: 'superseded_by_working_change' })
          }
        }
        task.is_working = true
        audit(db, 'update', 'task', task.id, { is_working: true })
      } else if (workingMode === 'clear' && task.is_working) {
        task.is_working = false
        audit(db, 'update', 'task', task.id, { is_working: false, cause: 'working_cleared' })
      }

      return ok()
    })
  }),
]
