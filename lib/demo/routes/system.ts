// Login, the capture bar, and the Control Room overview.

import { signIn, signOut } from '../auth'
import { runCapture } from '../capture'
import { getDb } from '../db'
import { fail, ok, route, type Route } from '../http'
import { CALENDAR_CHANGED, GOALS_CHANGED, TASKS_CHANGED, emit, sendTelegram } from '../notify'

/** How long the simulated pipeline takes. The real one waits on a model call. */
const PIPELINE_MS = 1100

/** Production telemetry is pushed from the laptop every 30 minutes. */
function lastPush(): string {
  const now = new Date()
  now.setMinutes(now.getMinutes() < 30 ? 0 : 30, 0, 0)
  return now.toISOString()
}

export const authRoutes: Route[] = [
  route('POST', '/api/auth/login', ({ body }) => {
    const password = typeof body.password === 'string' ? body.password : ''
    if (!password) return fail(400, 'Password required')
    if (!signIn(password)) return { status: 401, json: { error: 'Invalid password' }, delayMs: 250 }
    return ok({ ok: true }, 250)
  }),

  route('POST', '/api/auth/logout', () => {
    signOut()
    return ok()
  }),
]

export const systemRoutes: Route[] = [
  // The Session card's capture bar. Like production, it answers immediately and does
  // the routing afterwards, so the input never waits on the model.
  route('POST', '/api/capture', ({ body }) => {
    const text = typeof body.text === 'string' ? body.text.trim() : ''
    if (!text) return fail(400, 'text is required')

    window.setTimeout(() => {
      const result = runCapture(text, 'web')
      if (result.touched.tasks) emit(TASKS_CHANGED)
      if (result.touched.goals) emit(GOALS_CHANGED)
      if (result.touched.calendar) emit(CALENDAR_CHANGED)
      result.replies.forEach((reply, i) => sendTelegram(reply, i * 450))
    }, PIPELINE_MS)

    return ok()
  }),

  // Everything the Control Room needs for first paint. Read-only, no model call.
  route('GET', '/api/control-room/overview', () => {
    const db = getDb()
    const { capabilities, goalId, telemetry } = db.controlRoom

    const goalRow =
      db.goals.find(g => g.id === goalId && !g.archived_at) ??
      db.goals.find(g => g.name === 'Agentic OS' && !g.archived_at) ??
      null
    const goal = goalRow
      ? {
          id: goalRow.id,
          name: goalRow.name,
          steps: db.goalSteps
            .filter(s => s.goal_id === goalRow.id)
            .sort((a, b) => a.sort_order - b.sort_order)
            .map(({ id, text, done, sort_order, created_at }) => ({ id, text, done, sort_order, created_at })),
        }
      : null

    const captured_at = lastPush()
    const fresh = Object.fromEntries(
      Object.entries(telemetry).map(([kind, row]) => [kind, row ? { ...row, captured_at } : null]),
    )

    return ok({ capabilities, goal, telemetry: fresh })
  }),
]
