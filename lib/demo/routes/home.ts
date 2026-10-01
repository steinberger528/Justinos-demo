// Habits, nutrition and goals: the cards on Home that read and write their own rows.

import { audit, getDb, mutate } from '../db'
import { fail, ok, pick, route, type Route } from '../http'
import { DEMO_USER_ID, newId } from '../ids'
import { HABITS_CHANGED, emit } from '../notify'
import type { GoalRow, HabitState, NutritionSnapshot } from '../types'

// The fields the Goals card may change. Ids, owner and timestamps are not writable.
const GOAL_PATCH_KEYS = [
  'name', 'tab', 'due_date', 'target_number', 'start_number', 'current_number',
  'completed_at', 'archived_at', 'sort_order',
] as const
const STEP_PATCH_KEYS = ['text', 'done', 'sort_order'] as const

/** What the next "sync" finds in the food log. Runs out, like a real day does. */
const PENDING_MEALS = [
  { name: 'Dinner', kcal: 760, protein: 48, carbs: 82, fat: 24, fiber: 11, goodFat: 17, badFat: 7 },
  { name: 'Evening snack', kcal: 180, protein: 12, carbs: 20, fat: 6, fiber: 3, goodFat: 4.5, badFat: 1.5 },
]

export const homeRoutes: Route[] = [
  // ── Habits ─────────────────────────────────────────────────────────────────
  route('GET', '/api/habits', ({ query }) => {
    const date = query.get('date')
    if (!date) return fail(400, 'date required')
    return ok({ habits: getDb().dailyLogs[date]?.habits ?? {} })
  }),

  // Replaces the whole habits object for the date, so callers send every habit.
  route('POST', '/api/habits', ({ body }) => {
    const date = body.date as string | undefined
    const habits = body.habits as Record<string, HabitState> | undefined
    if (!date || !habits) return fail(400, 'date and habits required')
    return mutate(db => {
      db.dailyLogs[date] = { ...(db.dailyLogs[date] ?? {}), habits }
      audit(db, 'update', 'daily_logs', date, { source: 'habit_tracker', date })
      return ok()
    })
  }),

  // Unchecking the nutrition habit by hand stops the sync from re-checking it that day.
  route('POST', '/api/habits/suppress-nutrition', ({ body }) => {
    const date = body.date as string | undefined
    if (!date) return fail(400, 'date required')
    return mutate(db => {
      db.dailyLogs[date] = { ...(db.dailyLogs[date] ?? {}), nutritionAutoSuppressed: true }
      audit(db, 'update', 'daily_logs', date, { source: 'nutrition_suppress', date })
      return ok()
    })
  }),

  // ── Nutrition ──────────────────────────────────────────────────────────────
  // The card only ever reads a stored snapshot. Nothing is scraped on page load.
  route('GET', '/api/nutrition', ({ query }) => {
    const date = query.get('date')
    if (!date) return fail(400, 'date required')
    return ok({ nutrition: getDb().dailyLogs[date]?.nutrition ?? null })
  }),

  // Production pulls the day's totals from a food-logging app. The demo "finds" the
  // next meal instead, then applies the same rule: meeting the calorie goal checks
  // the Nutrition habit, unless it was unchecked by hand today.
  route('POST', '/api/nutrition/sync', ({ body }) => {
    const date = body.date as string | undefined
    if (!date) return fail(400, 'date required')

    let habitChecked = false
    const snapshot = mutate(db => {
      const log = db.dailyLogs[date] ?? {}
      const prev: NutritionSnapshot = log.nutrition ?? {
        calories: { current: 0, goal: 2400 },
        protein: { current: 0, goal: 170 },
        carbs: { current: 0, goal: 270 },
        fat: { current: 0, goal: 78 },
        fiber: { current: 0, goal: 34 },
        fatBreakdown: { goodFat: 0, badFat: 0 },
        meals: [],
        syncedAt: new Date().toISOString(),
      }

      const meal = PENDING_MEALS.find(m => !prev.meals.some(logged => logged.name === m.name))
      const next: NutritionSnapshot = meal
        ? {
            ...prev,
            calories: { ...prev.calories, current: prev.calories.current + meal.kcal },
            protein: { ...prev.protein, current: prev.protein.current + meal.protein },
            carbs: { ...prev.carbs, current: prev.carbs.current + meal.carbs },
            fat: { ...prev.fat, current: prev.fat.current + meal.fat },
            fiber: { ...prev.fiber, current: prev.fiber.current + meal.fiber },
            fatBreakdown: {
              goodFat: (prev.fatBreakdown?.goodFat ?? 0) + meal.goodFat,
              badFat: (prev.fatBreakdown?.badFat ?? 0) + meal.badFat,
            },
            meals: [...prev.meals, { name: meal.name, kcal: meal.kcal }],
            syncedAt: new Date().toISOString(),
          }
        : { ...prev, syncedAt: new Date().toISOString() }

      const calMet = next.calories.goal > 0 && next.calories.current >= next.calories.goal
      let habits = log.habits
      if (calMet && !log.nutritionAutoSuppressed && !habits?.nutrition?.done) {
        habits = { ...(habits ?? {}), nutrition: { ...(habits?.nutrition ?? {}), done: true } }
        habitChecked = true
      }

      db.dailyLogs[date] = { ...log, nutrition: next, habits }
      audit(db, 'sync', 'daily_logs', date, { source: 'nutrition_sync', success: true, calories: next.calories })
      return next
    })

    if (habitChecked) emit(HABITS_CHANGED, { date }, 1000)
    return ok({ ok: true, nutrition: snapshot }, 900)
  }),

  // ── Goals ──────────────────────────────────────────────────────────────────
  route('GET', '/api/goals', () => {
    const db = getDb()
    const goals = db.goals
      .filter(g => !g.archived_at)
      .sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at))
      .map(g => ({
        ...g,
        steps: db.goalSteps
          .filter(s => s.goal_id === g.id)
          .sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at)),
      }))
    return ok({ goals })
  }),

  route('POST', '/api/goals', ({ body }) => {
    const name = typeof body.name === 'string' ? body.name.trim() : ''
    const type = body.type as GoalRow['type'] | undefined
    const tab = body.tab as GoalRow['tab'] | undefined
    if (!name || !type || !tab) return fail(400, 'name, type, and tab are required')

    const id = mutate(db => {
      const now = new Date().toISOString()
      const goalId = newId('goal')
      db.goals.push({
        id: goalId,
        user_id: DEMO_USER_ID,
        name,
        type,
        tab,
        due_date: (body.due_date as string | null | undefined) ?? null,
        target_number: type === 'numeric' ? ((body.target_number as number | null | undefined) ?? null) : null,
        start_number: type === 'numeric' ? ((body.start_number as number | null | undefined) ?? null) : null,
        current_number: 0,
        sort_order: db.goals.length,
        completed_at: null,
        archived_at: null,
        created_at: now,
      })
      if (type === 'checklist' && Array.isArray(body.initial_steps)) {
        ;(body.initial_steps as string[]).forEach((text, i) => {
          db.goalSteps.push({ id: newId('step'), goal_id: goalId, text, done: false, sort_order: i, created_at: now })
        })
      }
      audit(db, 'insert', 'goal', goalId, { name, type, tab })
      return goalId
    })
    return ok({ ok: true, id })
  }),

  route('PATCH', '/api/goals/:id', ({ params, body }) =>
    mutate(db => {
      const goal = db.goals.find(g => g.id === params.id)
      if (!goal) return fail(404, 'goal not found')
      const change = pick(body, GOAL_PATCH_KEYS)
      Object.assign(goal, change)
      audit(db, 'update', 'goal', goal.id, change)
      return ok()
    }),
  ),

  route('DELETE', '/api/goals/:id', ({ params }) =>
    mutate(db => {
      db.goals = db.goals.filter(g => g.id !== params.id)
      db.goalSteps = db.goalSteps.filter(s => s.goal_id !== params.id)
      audit(db, 'delete', 'goal', params.id, {})
      return ok()
    }),
  ),

  route('POST', '/api/goals/:id/steps', ({ params, body }) => {
    const text = typeof body.text === 'string' ? body.text.trim() : ''
    if (!text) return fail(400, 'text required')
    const id = mutate(db => {
      const existing = db.goalSteps.filter(s => s.goal_id === params.id)
      const sortOrder = existing.length > 0 ? Math.max(...existing.map(s => s.sort_order)) + 1 : 0
      const stepId = newId('step')
      db.goalSteps.push({ id: stepId, goal_id: params.id, text, done: false, sort_order: sortOrder, created_at: new Date().toISOString() })
      audit(db, 'insert', 'goal_step', stepId, { goal_id: params.id, text })
      return stepId
    })
    return ok({ ok: true, id })
  }),

  route('POST', '/api/goals/:id/steps/reorder', ({ params, body }) => {
    if (!Array.isArray(body.order)) return fail(400, 'order array required')
    const order = body.order as string[]
    return mutate(db => {
      order.forEach((stepId, i) => {
        const step = db.goalSteps.find(s => s.id === stepId && s.goal_id === params.id)
        if (step) step.sort_order = i
      })
      audit(db, 'reorder', 'goal_steps', null, { goal_id: params.id, order })
      return ok()
    })
  }),

  route('PATCH', '/api/goals/:id/steps/:stepId', ({ params, body }) =>
    mutate(db => {
      const step = db.goalSteps.find(s => s.id === params.stepId && s.goal_id === params.id)
      if (!step) return fail(404, 'step not found')
      const change = pick(body, STEP_PATCH_KEYS)
      Object.assign(step, change)
      audit(db, 'update', 'goal_step', step.id, { goal_id: params.id, ...change })
      return ok()
    }),
  ),

  route('DELETE', '/api/goals/:id/steps/:stepId', ({ params }) =>
    mutate(db => {
      db.goalSteps = db.goalSteps.filter(s => !(s.id === params.stepId && s.goal_id === params.id))
      audit(db, 'delete', 'goal_step', params.stepId, { goal_id: params.id })
      return ok()
    }),
  ),
]
