'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { localDateKey } from '@/lib/date'
import { addDays } from '@/lib/task-groups'
import { BLOCK_TYPES } from '@/lib/block-types'
import { notifyTasksChanged } from '@/lib/task-events'
import type { SessionTask } from '@/lib/task-types'

// Shared task fields: the Session card's add form and the task-row edit
// dialog both render these, so creating and editing a task offer the same
// choices. Dates are picked from a row of day chips (today + the next six
// days) with a "Pick date…" chip for anything further out, instead of a bare
// native date input.

export interface TaskDraft {
  title: string
  planned_date: string | null
  due_date: string | null
  block_type: string | null
}

const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function parseKey(key: string): Date {
  return new Date(`${key}T00:00:00`)
}

function chipLabel(key: string, todayKey: string): string {
  if (key === todayKey) return 'Today'
  if (key === addDays(todayKey, 1)) return 'Tmrw'
  const d = parseKey(key)
  return `${WEEKDAY[d.getDay()]} ${d.getDate()}`
}

export function longDateLabel(key: string): string {
  const d = parseKey(key)
  return `${WEEKDAY[d.getDay()]}, ${MONTH[d.getMonth()]} ${d.getDate()}`
}

function Chip({ label, selected, onClick, title }: { label: string; selected: boolean; onClick: () => void; title?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className="px-[9px] h-[28px] rounded-[6px] text-[12px] font-medium whitespace-nowrap transition-colors duration-150 border cursor-pointer"
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

const fieldLabel = 'text-[11px] font-semibold uppercase tracking-[0.06em]'

function DayPicker({
  label,
  hint,
  noneLabel,
  value,
  onChange,
}: {
  label: string
  hint: string
  noneLabel: string
  value: string | null
  onChange: (key: string | null) => void
}) {
  const todayKey = localDateKey()
  const days = Array.from({ length: 7 }, (_, i) => addDays(todayKey, i))
  const dateInputRef = useRef<HTMLInputElement>(null)
  const isCustom = value !== null && !days.includes(value)

  function openPicker() {
    const input = dateInputRef.current
    if (!input) return
    try {
      input.showPicker()
    } catch {
      // Older browsers without showPicker(): focusing still lets the user type a date.
      input.focus()
    }
  }

  return (
    <div className="flex flex-col gap-[5px]">
      <span className={fieldLabel} style={{ color: 'var(--t3)' }}>
        {label} <span className="normal-case tracking-normal font-normal">· {hint}</span>
      </span>
      <div className="flex flex-wrap gap-[5px]">
        <Chip label={noneLabel} selected={value === null} onClick={() => onChange(null)} />
        {days.map(key => (
          <Chip key={key} label={chipLabel(key, todayKey)} title={longDateLabel(key)} selected={value === key} onClick={() => onChange(key)} />
        ))}
        <span className="relative inline-flex">
          <Chip label={isCustom && value ? longDateLabel(value) : 'Pick date…'} selected={isCustom} onClick={openPicker} />
          <input
            ref={dateInputRef}
            type="date"
            tabIndex={-1}
            aria-label={`${label} date`}
            value={value ?? ''}
            onChange={e => onChange(e.target.value || null)}
            className="absolute left-0 bottom-0 w-full h-0 opacity-0 pointer-events-none"
          />
        </span>
      </div>
    </div>
  )
}

export function TaskFields({
  draft,
  onChange,
  onSubmit,
  titleRef,
  autoFocus,
}: {
  draft: TaskDraft
  onChange: (next: TaskDraft) => void
  onSubmit: () => void
  titleRef?: React.Ref<HTMLInputElement>
  autoFocus?: boolean
}) {
  return (
    <div className="flex flex-col gap-[10px]">
      <input
        ref={titleRef}
        autoFocus={autoFocus}
        value={draft.title}
        onChange={e => onChange({ ...draft, title: e.target.value })}
        onKeyDown={e => { if (e.key === 'Enter') onSubmit() }}
        placeholder="What's the task?"
        className="w-full outline-none rounded-[8px] px-[10px] py-[8px] text-[13.5px]"
        style={{ background: 'oklch(0 0 0 / 0.2)', border: '1px solid oklch(1 0 0 / 0.09)', color: 'var(--t1)' }}
      />

      <DayPicker
        label="Do it"
        hint="when you'll work on it"
        noneLabel="No date"
        value={draft.planned_date}
        onChange={planned_date => onChange({ ...draft, planned_date })}
      />

      <DayPicker
        label="Due"
        hint="only if there's a real deadline"
        noneLabel="None"
        value={draft.due_date}
        onChange={due_date => onChange({ ...draft, due_date })}
      />

      <div className="flex flex-col gap-[5px]">
        <span className={fieldLabel} style={{ color: 'var(--t3)' }}>
          Block <span className="normal-case tracking-normal font-normal">· optional</span>
        </span>
        <div className="flex flex-wrap gap-[5px]">
          <Chip label="Any" selected={draft.block_type === null} onClick={() => onChange({ ...draft, block_type: null })} />
          {BLOCK_TYPES.map(bt => (
            <Chip key={bt} label={bt} selected={draft.block_type === bt} onClick={() => onChange({ ...draft, block_type: bt })} />
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Edit dialog ────────────────────────────────────────────────────────────

/**
 * Edit (or delete) one task. PATCHes only the fields that changed, then fires
 * notifyTasksChanged() so every task card refetches; `onSaved` lets a caller
 * that doesn't listen for that event (TasksModal) refresh itself.
 */
export function TaskEditDialog({
  task,
  onClose,
  onSaved,
}: {
  task: SessionTask
  onClose: () => void
  onSaved?: () => void
}) {
  const [draft, setDraft] = useState<TaskDraft>({
    title: task.title,
    planned_date: task.planned_date ?? null,
    due_date: task.due_date ?? null,
    block_type: task.block_type ?? null,
  })
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    if (!confirmDelete) return
    const t = setTimeout(() => setConfirmDelete(false), 4000)
    return () => clearTimeout(t)
  }, [confirmDelete])

  async function save() {
    if (!draft.title.trim()) { setError('Title is required.'); return }
    const patch: Record<string, unknown> = {}
    if (draft.title.trim() !== task.title) patch.title = draft.title.trim()
    if (draft.planned_date !== (task.planned_date ?? null)) patch.planned_date = draft.planned_date
    if (draft.due_date !== (task.due_date ?? null)) patch.due_date = draft.due_date
    if (draft.block_type !== (task.block_type ?? null)) patch.block_type = draft.block_type
    if (Object.keys(patch).length === 0) { onClose(); return }

    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/tasks/${task.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `Save failed (${res.status})`)
      }
      notifyTasksChanged()
      onSaved?.()
      onClose()
    } catch (e) {
      setError((e as Error).message)
      setSaving(false)
    }
  }

  async function remove() {
    if (!confirmDelete) { setConfirmDelete(true); return }
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/tasks/${task.id}`, { method: 'DELETE' })
      // 404 = already gone, which is the state we wanted.
      if (!res.ok && res.status !== 404) throw new Error(`Delete failed (${res.status})`)
      notifyTasksChanged()
      onSaved?.()
      onClose()
    } catch (e) {
      setError((e as Error).message)
      setSaving(false)
    }
  }

  // Portal to document.body: the cards this opens from use backdrop-filter, which
  // would otherwise become the containing block for this fixed-position scrim.
  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-[16px]"
      style={{ background: 'oklch(0 0 0 / 0.6)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        role="dialog"
        aria-label="Edit task"
        className="glass accent-glow w-full max-w-[560px] max-h-full overflow-y-auto"
        style={{ background: 'oklch(0.13 0.02 255 / 1)', backdropFilter: 'none', WebkitBackdropFilter: 'none' }}
      >
        <div className="card-header">
          <span className="card-label">Edit task</span>
          <button onClick={onClose} aria-label="Close" className="text-[13px] px-[8px] py-[2px] cursor-pointer" style={{ color: 'var(--t3)' }}>
            ✕
          </button>
        </div>
        <div className="card-body flex flex-col gap-[14px]">
          <TaskFields draft={draft} onChange={setDraft} onSubmit={() => void save()} autoFocus />

          {error && <div className="text-[12px]" style={{ color: 'var(--danger)' }}>{error}</div>}

          <div className="flex items-center justify-between gap-[8px] flex-wrap">
            <button
              type="button"
              onClick={() => void remove()}
              disabled={saving}
              className="px-[12px] h-[32px] rounded-[7px] text-[12px] font-medium border cursor-pointer"
              style={{
                background: confirmDelete ? 'oklch(0.60 0.22 25 / 0.2)' : 'transparent',
                borderColor: 'oklch(0.60 0.22 25 / 0.4)',
                color: 'var(--danger)',
              }}
            >
              {confirmDelete ? 'Click again to delete' : 'Delete task'}
            </button>
            <div className="flex gap-[8px]">
              <button
                type="button"
                onClick={onClose}
                className="px-[12px] h-[32px] rounded-[7px] text-[12px] border cursor-pointer"
                style={{ background: 'transparent', borderColor: 'oklch(1 0 0 / 0.1)', color: 'var(--t2)' }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void save()}
                disabled={saving}
                className="px-[14px] h-[32px] rounded-[7px] text-[12px] font-semibold border cursor-pointer"
                style={{
                  background: 'oklch(0.67 0.19 165 / 0.16)',
                  borderColor: 'oklch(0.67 0.19 165 / 0.35)',
                  color: 'var(--t1)',
                  opacity: saving ? 0.6 : 1,
                }}
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
