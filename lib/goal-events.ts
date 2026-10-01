// Cross-card notification for goal creation — same bare-event pattern as
// lib/task-events.ts. The Session card's + Goal form is the only place goals
// are added, so GoalsCard listens for this to refetch instead of waiting for
// a page reload. Handlers must not re-dispatch.

const GOALS_CHANGED = 'jos:goals-changed'

export function notifyGoalsChanged(): void {
  window.dispatchEvent(new CustomEvent(GOALS_CHANGED))
}

/** Subscribe; returns an unsubscribe function suitable for a useEffect cleanup. */
export function onGoalsChanged(handler: () => void): () => void {
  window.addEventListener(GOALS_CHANGED, handler)
  return () => window.removeEventListener(GOALS_CHANGED, handler)
}
