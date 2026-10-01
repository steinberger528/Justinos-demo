// Cross-card notification for calendar changes — same bare-event pattern as
// lib/task-events.ts. The Calendar card listens and refetches the range in view.
// Handlers must not re-dispatch.

const CALENDAR_CHANGED = 'jos:calendar-changed'

export function notifyCalendarChanged(): void {
  window.dispatchEvent(new CustomEvent(CALENDAR_CHANGED))
}

/** Subscribe; returns an unsubscribe function suitable for a useEffect cleanup. */
export function onCalendarChanged(handler: () => void): () => void {
  window.addEventListener(CALENDAR_CHANGED, handler)
  return () => window.removeEventListener(CALENDAR_CHANGED, handler)
}
