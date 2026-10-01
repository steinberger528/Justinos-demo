// Installs the demo backend by wrapping window.fetch.
//
// Every dashboard card talks to its data through fetch('/api/...'). In production
// those requests reach Next.js route handlers backed by Postgres. Here they are
// answered in the page by lib/demo/api.ts, against a database kept in localStorage.
// Requests to anything other than /api/* pass through untouched.

import { handleApi } from './api'

declare global {
  interface Window {
    __justinosDemoHandle?: typeof handleApi
    __justinosDemoInstalled?: boolean
  }
}

const sleep = (ms: number) => new Promise<void>(resolve => window.setTimeout(resolve, ms))

function abortError(): DOMException {
  return new DOMException('The operation was aborted.', 'AbortError')
}

/** `/api/tasks` from either `/api/tasks` or `/<base-path>/api/tasks`, else null. */
function apiPath(url: URL): string | null {
  if (url.origin !== window.location.origin) return null
  const match = /^(?:\/[^/]+)?(\/api\/.*)$/.exec(url.pathname)
  if (!match) return null
  return match[1].length > 1 ? match[1].replace(/\/+$/, '') : match[1]
}

async function readBody(input: RequestInfo | URL, init?: RequestInit): Promise<{ body: Record<string, unknown>; form: FormData | null }> {
  const raw = init?.body
  if (raw instanceof FormData) return { body: {}, form: raw }
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw) as unknown
      return { body: parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {}, form: null }
    } catch {
      return { body: {}, form: null }
    }
  }
  if (raw === undefined && input instanceof Request) {
    try {
      return { body: (await input.clone().json()) as Record<string, unknown>, form: null }
    } catch {
      return { body: {}, form: null }
    }
  }
  return { body: {}, form: null }
}

export function installDemoBackend(): void {
  if (typeof window === 'undefined') return
  // Re-point on every module evaluation so hot reload picks up edited handlers.
  window.__justinosDemoHandle = handleApi
  if (window.__justinosDemoInstalled) return
  window.__justinosDemoInstalled = true

  const realFetch = window.fetch.bind(window)

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const href = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const url = new URL(href, window.location.href)
    const path = apiPath(url)
    if (!path) return realFetch(input, init)

    const signal = init?.signal ?? (input instanceof Request ? input.signal : undefined)
    if (signal?.aborted) throw abortError()

    const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase()
    const { body, form } = await readBody(input, init)

    const reply = window.__justinosDemoHandle!(method, path, { query: url.searchParams, body, form })

    // A little latency, so loading states and optimistic updates behave as they do
    // against a real network.
    await sleep(90 + Math.random() * 140 + (reply.delayMs ?? 0))
    if (signal?.aborted) throw abortError()

    return new Response(JSON.stringify(reply.json), {
      status: reply.status,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
