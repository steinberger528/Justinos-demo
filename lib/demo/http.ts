// Minimal request/response plumbing for the in-browser API. A handler receives the
// parsed pieces of a request and returns a status plus a JSON body, the same contract
// the production route handlers have with the client.

export interface Ctx {
  params: Record<string, string>
  query: URLSearchParams
  /** Parsed JSON body, or {} when the request had none. */
  body: Record<string, unknown>
  /** Present when the request was multipart (journal and brainstorm capture). */
  form: FormData | null
}

export interface Reply {
  status: number
  json: unknown
  /** Extra simulated latency for calls that hit a model or a third party in production. */
  delayMs?: number
}

export type Handler = (ctx: Ctx) => Reply

export interface Route {
  method: string
  pattern: string
  handler: Handler
}

export const ok = (json: unknown = { ok: true }, delayMs?: number): Reply => ({ status: 200, json, delayMs })
export const fail = (status: number, error: string): Reply => ({ status, json: { error } })

/** The part of a request body a route lets the client write. Any other key is dropped. */
export function pick(body: Record<string, unknown>, keys: readonly string[]): Record<string, unknown> {
  const change: Record<string, unknown> = {}
  for (const key of keys) if (key in body) change[key] = body[key]
  return change
}

export function route(method: string, pattern: string, handler: Handler): Route {
  return { method, pattern, handler }
}

/** Matches `/api/tasks/abc` against `/api/tasks/:id`, returning the captured params. */
export function matchPattern(pattern: string, pathname: string): Record<string, string> | null {
  const want = pattern.split('/').filter(Boolean)
  const got = pathname.split('/').filter(Boolean)
  if (want.length !== got.length) return null
  const params: Record<string, string> = {}
  for (let i = 0; i < want.length; i++) {
    if (want[i].startsWith(':')) params[want[i].slice(1)] = decodeURIComponent(got[i])
    else if (want[i] !== got[i]) return null
  }
  return params
}

export function isDateKey(v: unknown): v is string {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)
}
