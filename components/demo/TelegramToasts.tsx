'use client'

import { useEffect, useState } from 'react'
import { TELEGRAM_MESSAGE, type TelegramMessage } from '@/lib/demo/notify'
import { ReplyButtons } from './ReplyButtons'

interface Toast extends TelegramMessage {
  id: number
}

const VISIBLE_MS = 12_000
const KEYBOARD_VISIBLE_MS = 30_000
const MAX_TOASTS = 6
let nextId = 1

/** Keeps the stack short. A plain message goes first, so a reply waiting on an answer stays. */
function trim(toasts: Toast[]): Toast[] {
  const kept = [...toasts]
  while (kept.length > MAX_TOASTS) {
    const plain = kept.findIndex(t => !t.urgencyTaskId)
    kept.splice(plain === -1 ? 0 : plain, 1)
  }
  return kept
}

/**
 * In production the system answers on the operator's phone, over Telegram. The demo has
 * no phone to send to, so those replies appear here instead, in the corner of the page.
 */
export function TelegramToasts() {
  const [toasts, setToasts] = useState<Toast[]>([])

  useEffect(() => {
    function onMessage(e: Event) {
      const message = (e as CustomEvent<TelegramMessage>).detail
      if (!message?.text) return
      const toast: Toast = { ...message, id: nextId++ }
      setToasts(prev => trim([...prev, toast]))
      // A message with a working keyboard stays long enough to be answered.
      const visibleFor = message.urgencyTaskId ? KEYBOARD_VISIBLE_MS : VISIBLE_MS
      window.setTimeout(() => setToasts(prev => prev.filter(t => t.id !== toast.id)), visibleFor)
    }
    window.addEventListener(TELEGRAM_MESSAGE, onMessage)
    return () => window.removeEventListener(TELEGRAM_MESSAGE, onMessage)
  }, [])

  if (toasts.length === 0) return null

  return (
    <div className="demo-toasts" aria-live="polite">
      {toasts.map(toast => (
        <div key={toast.id} className="demo-toast" onClick={() => setToasts(prev => prev.filter(t => t.id !== toast.id))}>
          <div className="demo-toast-head">
            <span className="demo-toast-from">{toast.from}</span>
            <span>Telegram reply, simulated</span>
          </div>
          <div className="demo-toast-text">{toast.text}</div>
          <ReplyButtons
            message={toast}
            onAnswered={text => setToasts(prev => prev.map(t => (
              t.id === toast.id ? { ...t, text, buttons: undefined, urgencyTaskId: undefined } : t
            )))}
          />
        </div>
      ))}
    </div>
  )
}
