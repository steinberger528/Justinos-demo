// The demo's login gate.
//
// Production signs an HMAC-SHA256 cookie on the server and checks it in middleware on
// every request, with a timing-safe password comparison. A static site has no server
// to do that, so the demo keeps the same flow (password form, 7-day session, a 401
// from the API when signed out) and stores the session flag in the browser instead.
// The password is public on purpose.

export const DEMO_PASSWORD = 'password'

const KEY = 'justinos-demo:auth'
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000
const AUTH_EVENT = 'demo:auth'

// Fallback for browsers that block storage, so the gate still opens for the page load.
let memorySession = false

/** Subscribe to sign-in and sign-out, including from another tab of the same browser. */
export function subscribeAuth(onChange: () => void): () => void {
  window.addEventListener(AUTH_EVENT, onChange)
  window.addEventListener('storage', onChange)
  return () => {
    window.removeEventListener(AUTH_EVENT, onChange)
    window.removeEventListener('storage', onChange)
  }
}

function announce(): void {
  window.dispatchEvent(new CustomEvent(AUTH_EVENT))
}

export function isAuthed(): boolean {
  if (typeof window === 'undefined') return false
  try {
    const raw = window.localStorage.getItem(KEY)
    if (!raw) return memorySession
    const { at } = JSON.parse(raw) as { at?: number }
    return typeof at === 'number' && Date.now() - at < MAX_AGE_MS
  } catch {
    return memorySession
  }
}

export function signIn(password: string): boolean {
  if (password !== DEMO_PASSWORD) return false
  memorySession = true
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ at: Date.now() }))
  } catch {
    // Storage blocked: the in-memory flag above still lets this page load through.
  }
  announce()
  return true
}

export function signOut(): void {
  memorySession = false
  try {
    window.localStorage.removeItem(KEY)
  } catch {
    // Nothing stored, nothing to clear.
  }
  announce()
}
