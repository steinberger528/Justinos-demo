// Cross-card notification for task mutations.
//
// TasksCard and KeyBlockersCard are sibling cards on the dashboard grid with
// independent mount-time fetches and no shared parent state. Without this,
// marking a task "waiting" made it vanish from Today's Tasks with nothing
// confirming it had landed on Key Blockers until a full page reload — and the
// same in reverse when resuming one.
//
// Deliberately a bare notification, not a state container: each card still owns
// its own fetching and just re-runs it. Handlers must not re-dispatch, or two
// listening cards would ping-pong.

const TASKS_CHANGED = 'jos:tasks-changed'

export function notifyTasksChanged(): void {
  window.dispatchEvent(new CustomEvent(TASKS_CHANGED))
}

/** Subscribe; returns an unsubscribe function suitable for a useEffect cleanup. */
export function onTasksChanged(handler: () => void): () => void {
  window.addEventListener(TASKS_CHANGED, handler)
  return () => window.removeEventListener(TASKS_CHANGED, handler)
}
