'use client'

import { answerUrgency } from '@/lib/demo/capture'
import { TASKS_CHANGED, emit, type TelegramMessage } from '@/lib/demo/notify'

const STATIC_NOTE = 'Shown the way it appears on the phone. This button is not wired up in the demo.'

/**
 * The inline keyboard under a bot message. The urgency keyboard works: tapping a choice
 * files the task and the bot edits its message, as the Telegram callback does in
 * production. The other buttons need the model or a phone, so they are only shown.
 */
export function ReplyButtons({ message, onAnswered }: {
  message: TelegramMessage
  /** Called with the text the bot would edit its message to. */
  onAnswered: (text: string) => void
}) {
  if (!message.buttons || message.buttons.length === 0) return null
  const taskId = message.urgencyTaskId

  return (
    <div className="demo-reply-buttons" onClick={e => e.stopPropagation()}>
      {message.buttons.map(label => taskId ? (
        <button
          key={label}
          type="button"
          className="demo-reply-button"
          onClick={() => {
            const edited = answerUrgency(taskId, label)
            if (edited === null) return
            emit(TASKS_CHANGED)
            onAnswered(edited)
          }}
        >
          {label}
        </button>
      ) : (
        <span key={label} className="demo-reply-button demo-reply-button-static" title={STATIC_NOTE}>{label}</span>
      ))}
    </div>
  )
}
