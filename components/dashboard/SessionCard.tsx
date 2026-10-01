'use client'

import { useState, useRef, useEffect } from 'react'
import { Panel } from './Panel'
import { TaskFields, type TaskDraft } from './TaskFields'
import { localDateKey } from '@/lib/date'
import { notifyTasksChanged } from '@/lib/task-events'
import { notifyGoalsChanged } from '@/lib/goal-events'
import { BriefingModal } from './BriefingModal'
import { useLiveLocationAndWeather } from './TopRail'
import { BRIEFING_AUTO_OPEN, OPERATOR } from '@/lib/demo/config'

// ─── Greeting + time utils ─────────────────────────────────────────────────────

const NAME = OPERATOR.firstName

const GREETINGS = {
  morning:   [`Good morning, ${NAME}`, `Ready to make today count, ${NAME}`, `Morning, ${NAME}. Let's get it`],
  afternoon: [`Good afternoon, ${NAME}`, "Hope the afternoon's treating you well", `Afternoon, ${NAME}`],
  evening:   [`Good evening, ${NAME}`, `Wrapping up, ${NAME}?`, `Evening check-in, ${NAME}`],
  night:     [`Burning the midnight oil, ${NAME}?`, `Late night, ${NAME}`, `Still at it, ${NAME}`],
}

function pickGreeting(): string {
  const h = new Date().getHours()
  const block =
    h >= 5 && h < 12  ? 'morning'
    : h >= 12 && h < 17 ? 'afternoon'
    : h >= 17 && h < 21 ? 'evening'
    : 'night'
  const pool = GREETINGS[block]
  return pool[Math.floor(Math.random() * pool.length)]
}

function pad(n: number) { return n < 10 ? `0${n}` : `${n}` }
function getTime() {
  const d = new Date()
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}
function getDateLabel() {
  return new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
}

function tomorrowDateKey(): string {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  return localDateKey(d)
}

// ─── Online badge (static) ─────────────────────────────────────────────────────

function OnlineBadge() {
  return (
    <span
      style={{
        fontFamily: 'var(--font-jetbrains-mono, monospace)',
        fontSize: '10.5px',
        padding: '1px 6px',
        borderRadius: '20px',
        background: 'oklch(0.67 0.19 165 / 0.12)',
        border: '1px solid oklch(0.67 0.19 165 / 0.30)',
        color: 'var(--acy)',
        whiteSpace: 'nowrap',
      }}
    >
      ● ONLINE
    </span>
  )
}

// ─── Shared quick-capture form styles ──────────────────────────────────────────

const qInputStyle = {
  background: 'oklch(0 0 0 / 0.2)',
  border: '1px solid oklch(1 0 0 / 0.09)',
  color: 'var(--t1)',
} as const

function Chip({ label, selected, onClick }: { label: string; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="px-[9px] h-[26px] rounded-[6px] text-[11px] font-medium whitespace-nowrap transition-colors duration-150 border"
      style={{
        background: selected ? 'oklch(0.67 0.19 165 / 0.14)' : 'oklch(1 0 0 / 0.05)',
        borderColor: selected ? 'oklch(0.67 0.19 165 / 0.4)' : 'oklch(1 0 0 / 0.09)',
        color: selected ? 'var(--acy)' : 'var(--t2)',
      }}
    >
      {label}
    </button>
  )
}

function SubmitButton({ label, canSubmit, qState, onClick }: {
  label: string
  canSubmit: boolean
  qState: 'idle' | 'saving' | 'ok' | 'err'
  onClick: () => void
}) {
  const text = qState === 'ok' ? '✓ Saved' : qState === 'err' ? '✕ Failed' : label
  const color = qState === 'ok' ? 'var(--acy)' : qState === 'err' ? 'var(--danger)' : 'var(--t1)'
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!canSubmit || qState === 'saving'}
      className="px-[14px] h-[30px] rounded-[7px] text-[11px] font-medium transition-colors duration-150 border whitespace-nowrap self-end"
      style={{
        background: qState === 'ok' ? 'oklch(0.67 0.19 165 / 0.12)' : qState === 'err' ? 'oklch(0.60 0.22 25 / 0.12)' : 'oklch(0.67 0.19 165 / 0.16)',
        borderColor: qState === 'ok' ? 'oklch(0.67 0.19 165 / 0.3)' : qState === 'err' ? 'oklch(0.60 0.22 25 / 0.3)' : 'oklch(0.67 0.19 165 / 0.35)',
        color,
        opacity: !canSubmit ? 0.4 : qState === 'saving' ? 0.6 : 1,
      }}
    >
      {text}
    </button>
  )
}

const fieldLabelStyle = { color: 'var(--t3)', fontSize: '10.5px' } as const

// ─── Task quick-capture form ───────────────────────────────────────────────────

// The dashboard's one place to add a task. Stays open after each add (title
// clears, dates and block stay) so several tasks can go in back to back;
// "Done" closes it. Date-driven model (specs/tasks-date-driven-refactor.md):
// "Do it" writes planned_date, "Due" writes due_date only when a real
// deadline is picked.
function TaskForm({ onClose }: { onClose: () => void }) {
  const [draft, setDraft] = useState<TaskDraft>(() => ({
    title: '',
    planned_date: localDateKey(),
    due_date: null,
    block_type: null,
  }))
  const [qState, setQState] = useState<'idle' | 'saving' | 'ok' | 'err'>('idle')
  const [errorText, setErrorText] = useState<string | null>(null)
  const titleRef = useRef<HTMLInputElement>(null)

  const canSubmit = draft.title.trim().length > 0

  useEffect(() => {
    if (qState !== 'ok') return
    const t = setTimeout(() => setQState('idle'), 1500)
    return () => clearTimeout(t)
  }, [qState])

  async function submit() {
    if (!canSubmit || qState === 'saving') return
    setQState('saving')
    setErrorText(null)
    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: draft.title.trim(),
          planned_date: draft.planned_date,
          due_date: draft.due_date,
          block_type: draft.block_type,
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `Add failed (${res.status})`)
      }
      setQState('ok')
      setDraft(d => ({ ...d, title: '' }))
      titleRef.current?.focus()
      notifyTasksChanged()
    } catch (e) {
      setQState('err')
      setErrorText((e as Error).message)
    }
  }

  return (
    <div className="px-[15px] pb-[13px] pt-[12px] flex flex-col gap-[12px]" style={{ borderTop: '1px solid oklch(1 0 0 / 0.055)' }}>
      <TaskFields draft={draft} onChange={setDraft} onSubmit={() => void submit()} titleRef={titleRef} autoFocus />
      {errorText && <span className="text-[12px]" style={{ color: 'var(--danger)' }}>{errorText}</span>}
      <div className="flex items-center justify-end gap-[8px]">
        <button
          type="button"
          onClick={onClose}
          className="px-[12px] h-[30px] rounded-[7px] text-[11px] border cursor-pointer"
          style={{ background: 'transparent', borderColor: 'oklch(1 0 0 / 0.1)', color: 'var(--t2)' }}
        >
          Done
        </button>
        <SubmitButton label="Add task" canSubmit={canSubmit} qState={qState} onClick={() => void submit()} />
      </div>
    </div>
  )
}

// ─── Event quick-capture form ──────────────────────────────────────────────────

const TIME_CHIPS = [
  { label: '9am', value: '09:00' },
  { label: '12pm', value: '12:00' },
  { label: '3pm', value: '15:00' },
  { label: '6pm', value: '18:00' },
]

function EventForm({ onClose }: { onClose: () => void }) {
  const [title, setTitle] = useState('')
  const [date, setDate] = useState(localDateKey())
  const [time, setTime] = useState('')
  const [qState, setQState] = useState<'idle' | 'saving' | 'ok' | 'err'>('idle')

  const canSubmit = title.trim().length > 0 && date.length > 0 && time.length > 0

  async function submit() {
    if (!canSubmit) return
    setQState('saving')
    try {
      const res = await fetch('/api/calendar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title.trim(), start: `${date}T${time}:00` }),
      })
      if (!res.ok) throw new Error()
      setQState('ok')
      setTimeout(onClose, 1500)
    } catch {
      setQState('err')
    }
  }

  return (
    <div className="px-[15px] pb-[13px] pt-[10px] flex flex-col gap-[8px]" style={{ borderTop: '1px solid oklch(1 0 0 / 0.055)' }}>
      <input
        autoFocus
        value={title}
        onChange={e => setTitle(e.target.value)}
        placeholder="Event title"
        className="w-full outline-none rounded-[8px] px-[10px] py-[7px] text-[12.5px]"
        style={qInputStyle}
      />

      <div className="flex gap-[6px]">
        <Chip label="Today" selected={date === localDateKey()} onClick={() => setDate(localDateKey())} />
        <Chip label="Tomorrow" selected={date === tomorrowDateKey()} onClick={() => setDate(tomorrowDateKey())} />
      </div>
      <div className="flex gap-[6px] flex-wrap">
        {TIME_CHIPS.map(c => (
          <Chip key={c.value} label={c.label} selected={time === c.value} onClick={() => setTime(c.value)} />
        ))}
      </div>

      <div className="flex items-end justify-between gap-[8px] flex-wrap">
        <div className="flex gap-[6px]">
          <input
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            className="outline-none rounded-[7px] px-[8px] h-[30px] text-[11.5px]"
            style={qInputStyle}
          />
          <input
            type="time"
            value={time}
            onChange={e => setTime(e.target.value)}
            className="outline-none rounded-[7px] px-[8px] h-[30px] text-[11.5px]"
            style={qInputStyle}
          />
        </div>
        <SubmitButton label="Add event" canSubmit={canSubmit} qState={qState} onClick={submit} />
      </div>
    </div>
  )
}

// ─── Goal quick-capture form ───────────────────────────────────────────────────

function GoalForm({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState('')
  const [type, setType] = useState<'checklist' | 'numeric'>('checklist')
  const [tab, setTab] = useState<'ongoing' | 'timed'>('ongoing')
  const [targetNumber, setTargetNumber] = useState('')
  const [startNumber, setStartNumber] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [stepsRaw, setStepsRaw] = useState('')
  const [qState, setQState] = useState<'idle' | 'saving' | 'ok' | 'err'>('idle')

  const canSubmit =
    name.trim().length > 0 &&
    (type !== 'numeric' || targetNumber.trim().length > 0) &&
    (tab !== 'timed' || dueDate.length > 0)

  async function submit() {
    if (!canSubmit) return
    setQState('saving')
    try {
      const res = await fetch('/api/goals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          type,
          tab,
          due_date: tab === 'timed' ? dueDate : null,
          target_number: type === 'numeric' ? Number(targetNumber) : null,
          ...(type === 'numeric' && startNumber.trim() ? { start_number: Number(startNumber) } : {}),
          ...(type === 'checklist' && stepsRaw.trim()
            ? { initial_steps: stepsRaw.split('\n').map(line => line.trim()).filter(Boolean) }
            : {}),
        }),
      })
      if (!res.ok) throw new Error()
      setQState('ok')
      notifyGoalsChanged()
      setTimeout(onClose, 1500)
    } catch {
      setQState('err')
    }
  }

  return (
    <div className="px-[15px] pb-[13px] pt-[10px] flex flex-col gap-[8px]" style={{ borderTop: '1px solid oklch(1 0 0 / 0.055)' }}>
      <input
        autoFocus
        value={name}
        onChange={e => setName(e.target.value)}
        placeholder="Goal name"
        className="w-full outline-none rounded-[8px] px-[10px] py-[7px] text-[12.5px]"
        style={qInputStyle}
      />

      <div className="flex gap-[6px]">
        <Chip label="Checklist" selected={type === 'checklist'} onClick={() => setType('checklist')} />
        <Chip label="Numeric" selected={type === 'numeric'} onClick={() => setType('numeric')} />
        <span className="w-[1px] self-stretch" style={{ background: 'oklch(1 0 0 / 0.09)' }} />
        <Chip label="Ongoing" selected={tab === 'ongoing'} onClick={() => setTab('ongoing')} />
        <Chip label="Timed" selected={tab === 'timed'} onClick={() => setTab('timed')} />
      </div>

      {type === 'numeric' && (
        <div className="flex gap-[6px]">
          <div className="flex flex-col gap-[3px]">
            <span style={fieldLabelStyle}>Target</span>
            <input
              type="number"
              value={targetNumber}
              onChange={e => setTargetNumber(e.target.value)}
              placeholder="e.g. 24"
              className="w-[90px] outline-none rounded-[7px] px-[8px] h-[30px] text-[11.5px]"
              style={qInputStyle}
            />
          </div>
          <div className="flex flex-col gap-[3px]">
            <span style={fieldLabelStyle}>Starting at (optional)</span>
            <input
              type="number"
              value={startNumber}
              onChange={e => setStartNumber(e.target.value)}
              placeholder="e.g. 0"
              className="w-[90px] outline-none rounded-[7px] px-[8px] h-[30px] text-[11.5px]"
              style={qInputStyle}
            />
          </div>
        </div>
      )}

      {type === 'checklist' && (
        <div className="flex flex-col gap-[3px]">
          <span style={fieldLabelStyle}>Steps (one per line, optional)</span>
          <textarea
            value={stepsRaw}
            onChange={e => setStepsRaw(e.target.value)}
            placeholder={'Step 1\nStep 2'}
            rows={3}
            className="w-full outline-none rounded-[7px] px-[8px] py-[6px] text-[12px] resize-y"
            style={qInputStyle}
          />
        </div>
      )}

      {tab === 'timed' && (
        <div className="flex flex-col gap-[3px]">
          <span style={fieldLabelStyle}>Due date</span>
          <input
            type="date"
            value={dueDate}
            onChange={e => setDueDate(e.target.value)}
            className="w-[150px] outline-none rounded-[7px] px-[8px] h-[30px] text-[11.5px]"
            style={qInputStyle}
          />
        </div>
      )}

      <div className="flex justify-end">
        <SubmitButton label="Add goal" canSubmit={canSubmit} qState={qState} onClick={submit} />
      </div>
    </div>
  )
}

// ─── Main component ────────────────────────────────────────────────────────────

type ActiveForm = 'task' | 'event' | 'goal' | null

export function SessionCard() {
  const [greeting, setGreeting] = useState('')
  const [time, setTime] = useState('')
  const [dateLabel, setDateLabel] = useState('')
  const [input, setInput] = useState('')
  const [attachedFile, setAttachedFile] = useState<{ name: string } | null>(null)
  const [state, setState] = useState<'idle' | 'saving' | 'ok' | 'err'>('idle')
  const [activeForm, setActiveForm] = useState<ActiveForm>(null)

  const [briefingOpen, setBriefingOpen] = useState(false)
  const [briefingDate, setBriefingDate] = useState(() => localDateKey())

  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const screenshotInputRef = useRef<HTMLInputElement>(null)

  const { weather } = useLiveLocationAndWeather()

  // B2.13: the briefing opens itself once a morning, since the machine is left on
  // overnight with the dashboard up. Bounded to the 7:00–10:00 window rather than
  // "any time past 7:00" so opening the dashboard fresh in the evening doesn't pop a
  // stale briefing, and guarded by a per-date localStorage flag so closing it sticks.
  useEffect(() => {
    if (!BRIEFING_AUTO_OPEN) return
    function check() {
      const hour = new Date().getHours()
      if (hour < 7 || hour >= 10) return
      const key = `dashboard.briefingAutoOpen.${localDateKey()}`
      try {
        if (localStorage.getItem(key)) return
        localStorage.setItem(key, '1')
      } catch {
        return // blocked storage: never auto-open, rather than re-opening every minute
      }
      setBriefingDate(localDateKey())
      setBriefingOpen(true)
    }
    check()
    const id = setInterval(check, 60_000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    // Intentional: greeting/time/date are computed client-side only (Math.random
    // + wall-clock time would mismatch server-rendered output), so this effect's
    // job is exactly to set that initial client-only state — not a candidate for
    // a useState lazy initializer.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setGreeting(pickGreeting())
    setTime(getTime())
    setDateLabel(getDateLabel())
    const id = setInterval(() => setTime(getTime()), 30_000)
    return () => clearInterval(id)
  }, [])

  function handleInputChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInput(e.target.value)
    e.target.style.height = 'auto'
    e.target.style.height = Math.min(e.target.scrollHeight, 140) + 'px'
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleCapture()
    }
  }

  function resetTextarea() {
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
  }

  async function handleCapture() {
    const text = input.trim()
    const captureText = attachedFile
      ? (text ? `${text}\n\n[Attached: ${attachedFile.name}]` : `[Attached: ${attachedFile.name}]`)
      : text
    if (!captureText) { textareaRef.current?.focus(); return }

    setState('saving')
    try {
      const res = await fetch('/api/capture', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: captureText }),
      })
      if (!res.ok) throw new Error()
      setState('ok')
      setInput('')
      setAttachedFile(null)
      resetTextarea()
    } catch {
      setState('err')
    } finally {
      setTimeout(() => setState('idle'), 2000)
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    if (f.size > 10 * 1024 * 1024) { alert('File must be under 10MB'); return }
    setAttachedFile({ name: f.name })
    e.target.value = ''
  }

  function toggleForm(form: ActiveForm) {
    setActiveForm(prev => (prev === form ? null : form))
  }

  const iconBtn = 'w-[30px] h-[30px] rounded-[7px] flex-shrink-0 flex items-center justify-center transition-colors duration-150 border text-[15px]'
  const iconBtnStyle = { background: 'oklch(1 0 0 / 0.06)', borderColor: 'oklch(1 0 0 / 0.10)', color: 'var(--t2)' } as const

  const isBusy = state === 'saving'
  const captureLabel = state === 'ok' ? '✓ Saved' : state === 'err' ? '✕ Failed' : 'Log'
  const captureColor = state === 'ok' ? 'var(--acy)' : state === 'err' ? 'var(--danger)' : 'var(--t2)'

  const quickBtnBase = 'flex-1 h-[28px] rounded-[7px] text-[11px] font-medium transition-colors duration-150 border'

  return (
    <>
    <Panel
      label="Session"
      action={
        <span className="flex items-center gap-[7px]">
          <button
            type="button"
            onClick={() => { setBriefingDate(localDateKey()); setBriefingOpen(true) }}
            title="Open today's briefing"
            className="px-[8px] h-[22px] rounded-[5px] text-[10.5px] font-semibold uppercase tracking-wider transition-colors"
            style={{ color: 'var(--t3)', background: 'oklch(1 0 0 / 0.05)', border: '1px solid oklch(1 0 0 / 0.1)' }}
          >
            Briefing
          </button>
          <OnlineBadge />
        </span>
      }
      bodyClass="p-0 flex flex-col"
    >

      {/* Greeting row */}
      <div className="px-[15px] pt-[13px] pb-[11px] flex-shrink-0 flex items-start justify-between gap-[10px]"
        style={{ borderBottom: '1px solid oklch(1 0 0 / 0.055)' }}
      >
        <div className="flex flex-col gap-[3px] min-w-0">
          <span className="text-[20px] font-medium leading-tight" style={{ color: 'var(--t1)' }}>
            {greeting}
          </span>
          <span className="text-[11px]" style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)', color: 'var(--t3)' }}>
            {dateLabel}
          </span>
        </div>
        <span
          className="text-[20px] font-semibold tracking-[-0.02em] leading-none flex-shrink-0 pt-[3px]"
          style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)', color: 'var(--t1)' }}
        >
          {time}
        </span>
      </div>

      {/* File attachment preview */}
      {attachedFile && (
        <div
          className="mx-[15px] mt-[8px] px-[10px] py-[5px] rounded-[7px] flex items-center justify-between gap-2 text-[11px]"
          style={{ background: 'oklch(0.67 0.19 200 / 0.08)', border: '1px solid oklch(0.67 0.19 200 / 0.2)', color: 'var(--acy)' }}
        >
          <span className="truncate">📎 {attachedFile.name}</span>
          <button onClick={() => setAttachedFile(null)} className="flex-shrink-0 opacity-60 hover:opacity-100" style={{ color: 'var(--t3)' }}>✕</button>
        </div>
      )}

      {/* Input row */}
      <div className="px-[15px] pb-[13px] pt-[10px] flex items-end gap-[6px] flex-shrink-0">
        <textarea
          ref={textareaRef}
          value={input}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          placeholder="Capture a thought, task, or note…"
          rows={1}
          className="flex-1 resize-none outline-none rounded-[8px] px-[10px] py-[7px] text-[12.5px] leading-[1.5]"
          style={{
            background: 'oklch(0 0 0 / 0.2)',
            border: '1px solid oklch(1 0 0 / 0.09)',
            color: 'var(--t1)',
            minHeight: '34px',
            maxHeight: '140px',
            overflow: 'auto',
          }}
          onFocus={e => {
            e.currentTarget.style.borderColor = 'oklch(0.67 0.19 165 / 0.4)'
            e.currentTarget.style.boxShadow = '0 0 0 3px oklch(0.67 0.19 165 / 0.07)'
          }}
          onBlur={e => {
            e.currentTarget.style.borderColor = 'oklch(1 0 0 / 0.09)'
            e.currentTarget.style.boxShadow = 'none'
          }}
        />

        <input ref={fileInputRef} type="file" accept=".pdf,.txt,.md,image/*" className="hidden" onChange={handleFileChange} />
        <button onClick={() => fileInputRef.current?.click()} title="Upload file" className={iconBtn} style={iconBtnStyle}>📎</button>

        <input ref={screenshotInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFileChange} />
        <button onClick={() => screenshotInputRef.current?.click()} title="Screenshot" className={iconBtn} style={iconBtnStyle}>📸</button>

        <button
          onClick={handleCapture}
          disabled={isBusy}
          className="px-[12px] h-[30px] rounded-[7px] flex-shrink-0 text-[11px] font-medium transition-colors duration-150 border whitespace-nowrap"
          style={{
            background: state === 'ok' ? 'oklch(0.67 0.19 165 / 0.12)' : state === 'err' ? 'oklch(0.60 0.22 25 / 0.12)' : 'oklch(1 0 0 / 0.06)',
            borderColor: state === 'ok' ? 'oklch(0.67 0.19 165 / 0.3)' : state === 'err' ? 'oklch(0.60 0.22 25 / 0.3)' : 'oklch(1 0 0 / 0.10)',
            color: captureColor,
            opacity: isBusy ? 0.6 : 1,
          }}
        >
          {captureLabel}
        </button>
      </div>

      {/* Quick-capture buttons */}
      <div className="px-[15px] pb-[13px] flex-shrink-0 flex gap-[6px]">
        <button
          onClick={() => toggleForm('task')}
          className={quickBtnBase}
          style={{
            background: activeForm === 'task' ? 'oklch(0.67 0.19 165 / 0.12)' : 'oklch(1 0 0 / 0.05)',
            borderColor: activeForm === 'task' ? 'oklch(0.67 0.19 165 / 0.35)' : 'oklch(1 0 0 / 0.09)',
            color: activeForm === 'task' ? 'var(--acy)' : 'var(--t2)',
          }}
        >
          + Task
        </button>
        <button
          onClick={() => toggleForm('event')}
          className={quickBtnBase}
          style={{
            background: activeForm === 'event' ? 'oklch(0.67 0.19 165 / 0.12)' : 'oklch(1 0 0 / 0.05)',
            borderColor: activeForm === 'event' ? 'oklch(0.67 0.19 165 / 0.35)' : 'oklch(1 0 0 / 0.09)',
            color: activeForm === 'event' ? 'var(--acy)' : 'var(--t2)',
          }}
        >
          + Event
        </button>
        <button
          onClick={() => toggleForm('goal')}
          className={quickBtnBase}
          style={{
            background: activeForm === 'goal' ? 'oklch(0.67 0.19 165 / 0.12)' : 'oklch(1 0 0 / 0.05)',
            borderColor: activeForm === 'goal' ? 'oklch(0.67 0.19 165 / 0.35)' : 'oklch(1 0 0 / 0.09)',
            color: activeForm === 'goal' ? 'var(--acy)' : 'var(--t2)',
          }}
        >
          + Goal
        </button>
      </div>

      {activeForm === 'task' && <TaskForm onClose={() => setActiveForm(null)} />}
      {activeForm === 'event' && <EventForm onClose={() => setActiveForm(null)} />}
      {activeForm === 'goal' && <GoalForm onClose={() => setActiveForm(null)} />}
    </Panel>

    <BriefingModal
      open={briefingOpen}
      onClose={() => setBriefingOpen(false)}
      date={briefingDate}
      onDateChange={setBriefingDate}
      weather={weather}
    />
    </>
  )
}
