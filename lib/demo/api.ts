// The in-browser API. Same paths, verbs and JSON shapes as the production route
// handlers, so the dashboard components call it without knowing the difference.

import { isAuthed } from './auth'
import { matchPattern, type Ctx, type Reply, type Route } from './http'
import { crmRoutes } from './routes/crm'
import { dayRoutes } from './routes/day'
import { homeRoutes } from './routes/home'
import { journalRoutes } from './routes/journal'
import { schoolRoutes } from './routes/school'
import { authRoutes, systemRoutes } from './routes/system'
import { taskRoutes } from './routes/tasks'

const ROUTES: Route[] = [
  ...authRoutes,
  ...systemRoutes,
  ...taskRoutes,
  ...dayRoutes,
  ...homeRoutes,
  ...schoolRoutes,
  ...journalRoutes,
  ...crmRoutes,
]

const paramCount = (pattern: string) => pattern.split('/').filter(s => s.startsWith(':')).length

export function handleApi(
  method: string,
  pathname: string,
  ctx: Omit<Ctx, 'params'>,
): Reply {
  // Everything except the login endpoints needs a session, as in production.
  if (!pathname.startsWith('/api/auth/') && !isAuthed()) {
    return { status: 401, json: { error: 'Unauthorized' } }
  }

  // A literal segment beats a parameter: /api/tasks/today wins over /api/tasks/:id.
  let best: { route: Route; params: Record<string, string> } | null = null
  for (const candidate of ROUTES) {
    if (candidate.method !== method) continue
    const params = matchPattern(candidate.pattern, pathname)
    if (!params) continue
    if (!best || paramCount(candidate.pattern) < paramCount(best.route.pattern)) best = { route: candidate, params }
  }

  if (!best) {
    console.warn(`[demo backend] no handler for ${method} ${pathname}`)
    return { status: 404, json: { error: 'Not found' } }
  }

  try {
    return best.route.handler({ ...ctx, params: best.params })
  } catch (err) {
    console.error(`[demo backend] ${method} ${pathname} failed`, err)
    return { status: 500, json: { error: (err as Error).message ?? 'demo backend error' } }
  }
}
