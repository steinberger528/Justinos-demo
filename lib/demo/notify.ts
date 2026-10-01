// Browser events the demo backend fires so cards refresh after a simulated
// background job finishes. In production the same refreshes happen when another card
// reports a change, or the next time the page loads.

export const TASKS_CHANGED = 'jos:tasks-changed'
export const GOALS_CHANGED = 'jos:goals-changed'
export const CALENDAR_CHANGED = 'jos:calendar-changed'
export const HABITS_CHANGED = 'habits:changed'
export const IDEAS_CHANGED = 'jos:ideas-changed'
/** A message the system would have sent to the operator's phone over Telegram. */
export const TELEGRAM_MESSAGE = 'demo:telegram'
/** Fired after "Reset sample data" so every mounted card reloads. */
export const DEMO_RESET = 'demo:reset'

export interface TelegramMessage {
  from: string
  text: string
  /** Inline keyboard buttons shown under the message. */
  buttons?: string[]
  /**
   * Set when the buttons are the urgency keyboard for this task. Those work in the demo.
   * Every other button needs the model or a phone, so it is shown and not wired up.
   */
  urgencyTaskId?: string
}

/** Dispatches after the current call stack unwinds, so a handler can return first. */
export function emit(name: string, detail?: unknown, delayMs = 0): void {
  if (typeof window === 'undefined') return
  window.setTimeout(() => window.dispatchEvent(new CustomEvent(name, { detail })), delayMs)
}

export function sendTelegram(message: TelegramMessage, delayMs = 0): void {
  emit(TELEGRAM_MESSAGE, message, delayMs)
}
