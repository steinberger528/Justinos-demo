'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import type { SchoolTask, Topic } from '@/lib/school-types'

// ── Status derivation ────────────────────────────────────────────────────────
// No new parallel status enum — Not Started / In Progress / Working / Done are
// derived from in_progress + is_working + completed_at, per specs/school-tab.md.

export type SchoolStatus = 'not_started' | 'in_progress' | 'working' | 'done'

export function statusFor(t: SchoolTask): SchoolStatus {
  if (t.completed_at) return 'done'
  if (t.is_working) return 'working'
  if (t.in_progress) return 'in_progress'
  return 'not_started'
}

const STATUS_LABEL: Record<SchoolStatus, string> = {
  not_started: 'Not Started',
  in_progress: 'In Progress',
  working: 'Working',
  done: 'Done',
}

const STATUS_COLOR: Record<SchoolStatus, string> = {
  not_started: 'oklch(0.72 0.02 255)',
  in_progress: 'oklch(0.7 0.16 240)',
  working: 'oklch(0.67 0.19 165)',
  done: 'oklch(0.67 0.19 200)',
}

export function StatusBadge({ status }: { status: SchoolStatus }) {
  return (
    <span
      className="text-[10.5px] font-bold uppercase tracking-wider px-[7px] py-[2px] rounded-[10px] flex-shrink-0 flex items-center gap-[4px]"
      style={{
        color: STATUS_COLOR[status],
        border: `1px solid ${STATUS_COLOR[status].replace(')', ' / 0.4)')}`,
        backgroundColor: STATUS_COLOR[status].replace(')', ' / 0.14)'),
      }}
    >
      {status === 'working' && (
        <span
          className="w-[5px] h-[5px] rounded-full flex-shrink-0"
          style={{ background: STATUS_COLOR.working, boxShadow: `0 0 5px ${STATUS_COLOR.working}`, animation: 'pulse-badge 2s ease-in-out infinite' }}
        />
      )}
      {STATUS_LABEL[status]}
    </span>
  )
}

// ── Date helpers ──────────────────────────────────────────────────────────────

const MONTH_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

export function fmtDate(dateKey: string): string {
  const d = new Date(`${dateKey}T00:00:00`)
  return `${MONTH_SHORT[d.getMonth()]} ${d.getDate()}`
}

export function daysUntil(dateKey: string, todayKey: string): number {
  const a = new Date(`${todayKey}T00:00:00`)
  const b = new Date(`${dateKey}T00:00:00`)
  return Math.round((b.getTime() - a.getTime()) / 86_400_000)
}

// Urgency-scaled color for due-date text/pills — gets louder as the date
// approaches so nothing can quietly sneak up unnoticed.
function urgencyColor(daysLeft: number, overdue: boolean): string {
  if (overdue) return 'oklch(0.72 0.2 25)'      // red
  if (daysLeft <= 0) return 'oklch(0.75 0.19 40)'  // due today — orange-red
  if (daysLeft <= 3) return 'oklch(0.8 0.16 75)'   // amber
  if (daysLeft <= 7) return 'oklch(0.7 0.18 240)'  // blue
  return 'oklch(0.85 0.01 255)'                     // far out — bright neutral
}

function dueLabel(daysLeft: number, overdue: boolean): string {
  if (overdue) return `${Math.abs(daysLeft)}d overdue`
  if (daysLeft === 0) return 'Due today'
  if (daysLeft === 1) return 'Due tomorrow'
  return `${daysLeft}d left`
}

async function patchSchoolTask(id: string, body: Record<string, unknown>): Promise<boolean> {
  try {
    const res = await fetch(`/api/school/tasks/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    return res.ok
  } catch {
    return false
  }
}

// ── Row ───────────────────────────────────────────────────────────────────────

interface SchoolItemRowProps {
  task: SchoolTask
  courseLabel?: string
  todayKey: string
  childTasks?: SchoolTask[]
  onChanged: (id: string, patch: Partial<SchoolTask>) => void
  /** Any other task in the whole list currently holding is_working — cleared locally on toggle. */
  currentWorkingId: string | null
  /** 'row' (default) = the original full-width list row. 'tile' = a compact,
   * date-dominant card meant to sit in a wrapping row of tiles (Exam Center). */
  variant?: 'row' | 'tile'
  /** Controls open/closed from a parent (e.g. Exam Center keeps only one tile
   * expanded at a time). Falls back to internal state when omitted, so every
   * existing (row) call site keeps its original uncontrolled behavior. */
  forceOpen?: boolean
  onToggleOpen?: () => void
}

export function SchoolItemRow({ task, courseLabel, todayKey, childTasks, onChanged, currentWorkingId, variant = 'row', forceOpen, onToggleOpen }: SchoolItemRowProps) {
  const [openState, setOpenState] = useState(false)
  const open = forceOpen ?? openState
  const toggleOpen = () => (onToggleOpen ? onToggleOpen() : setOpenState(v => !v))
  const [childrenOpen, setChildrenOpen] = useState(false)
  const [titleDraft, setTitleDraft] = useState(task.title)
  const [dueDraft, setDueDraft] = useState(task.due_date ?? '')
  const [descDraft, setDescDraft] = useState(task.description ?? '')
  const [saving, setSaving] = useState(false)

  const status = statusFor(task)
  const isOverdue = !!task.due_date && !task.completed_at && task.due_date < todayKey
  const hasChildren = !!childTasks && childTasks.length > 0
  const doneChildren = hasChildren ? childTasks!.filter(c => !!c.completed_at).length : 0

  async function saveEdits() {
    setSaving(true)
    const patch: Record<string, unknown> = {}
    if (titleDraft.trim() && titleDraft !== task.title) patch.title = titleDraft.trim()
    if (dueDraft !== (task.due_date ?? '')) patch.due_date = dueDraft || null
    if (descDraft !== (task.description ?? '')) patch.description = descDraft || null
    if (Object.keys(patch).length > 0) {
      const ok = await patchSchoolTask(task.id, patch)
      if (ok) onChanged(task.id, patch as Partial<SchoolTask>)
    }
    setSaving(false)
  }

  async function toggleTopic(index: number, done: boolean) {
    const nextTopics = task.topics.map((t, i) => (i === index ? { ...t, done } : t))
    onChanged(task.id, { topics: nextTopics }) // optimistic
    const ok = await patchSchoolTask(task.id, { topicToggle: { index, done } })
    if (!ok) onChanged(task.id, { topics: task.topics }) // revert
  }

  async function setWorking() {
    const wasWorking = task.is_working
    onChanged(task.id, { is_working: !wasWorking })
    if (currentWorkingId && currentWorkingId !== task.id) {
      onChanged(currentWorkingId, { is_working: false })
    }
    const ok = await patchSchoolTask(task.id, { is_working: !wasWorking })
    if (!ok) onChanged(task.id, { is_working: wasWorking })
  }

  async function toggleDone() {
    const wasDone = !!task.completed_at
    onChanged(task.id, { completed_at: wasDone ? null : new Date().toISOString() })
    const ok = await patchSchoolTask(task.id, { completed: !wasDone })
    if (!ok) onChanged(task.id, { completed_at: task.completed_at })
  }

  async function setInProgress() {
    const was = task.in_progress
    onChanged(task.id, { in_progress: !was })
    const ok = await patchSchoolTask(task.id, { in_progress: !was })
    if (!ok) onChanged(task.id, { in_progress: was })
  }

  const dueDays = task.due_date ? daysUntil(task.due_date, todayKey) : null
  // Literal oklch(...) fallback (not a var() ref) — this feeds a `.replace(')', ...)`
  // opacity trick below that only works on literal color strings.
  const dueColor = dueDays !== null ? urgencyColor(dueDays, isOverdue) : 'oklch(0.6 0.02 255)'

  function renderExpandedBody() {
    return (
      <>
        {/* Manual-edit fields */}
        <div className="flex flex-col gap-[6px] mt-[8px]">
          <label className="text-[11.5px]" style={{ color: 'var(--t3)' }}>Title</label>
          <input
            value={titleDraft}
            onChange={e => setTitleDraft(e.target.value)}
            className="text-[14px] px-[8px] py-[5px] rounded-[5px] bg-transparent outline-none"
            style={{ border: '1px solid oklch(1 0 0 / 0.1)', color: 'var(--t1)' }}
          />
          <div className="flex items-center gap-[8px]">
            <label className="text-[11.5px]" style={{ color: 'var(--t3)' }}>Due date</label>
            <input
              type="date"
              value={dueDraft}
              onChange={e => setDueDraft(e.target.value)}
              className="text-[14px] px-[8px] py-[4px] rounded-[5px] bg-transparent outline-none"
              style={{ border: '1px solid oklch(1 0 0 / 0.1)', color: 'var(--t1)' }}
            />
            {task.date_is_placeholder && <span className="text-[11.5px]" style={{ color: 'var(--t3)' }}>currently approximate, saving a new date confirms it</span>}
          </div>
          <label className="text-[11.5px]" style={{ color: 'var(--t3)' }}>Notes</label>
          <textarea
            value={descDraft}
            onChange={e => setDescDraft(e.target.value)}
            rows={2}
            className="text-[14px] px-[8px] py-[5px] rounded-[5px] bg-transparent outline-none resize-none"
            style={{ border: '1px solid oklch(1 0 0 / 0.1)', color: 'var(--t1)' }}
          />
          <button
            type="button"
            onClick={() => void saveEdits()}
            disabled={saving}
            className="self-start text-[12.5px] px-[10px] py-[4px] rounded-[6px] cursor-pointer"
            style={{ background: 'oklch(0.67 0.19 165 / 0.14)', border: '1px solid oklch(0.67 0.19 165 / 0.4)', color: 'var(--acy)', opacity: saving ? 0.6 : 1 }}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>

        {/* Status controls */}
        <div className="flex items-center gap-[8px]">
          <button
            type="button"
            onClick={() => void setInProgress()}
            className="text-[12.5px] px-[8px] py-[3px] rounded-[5px] cursor-pointer"
            style={{ background: task.in_progress ? 'oklch(0.7 0.16 240 / 0.18)' : 'oklch(1 0 0 / 0.05)', color: task.in_progress ? 'oklch(0.75 0.16 240)' : 'var(--t2)' }}
          >
            {task.in_progress ? 'In Progress ✓' : 'Mark In Progress'}
          </button>
          <button
            type="button"
            onClick={() => void setWorking()}
            className="text-[12.5px] px-[8px] py-[3px] rounded-[5px] cursor-pointer"
            style={{ background: task.is_working ? 'oklch(0.67 0.19 165 / 0.18)' : 'oklch(1 0 0 / 0.05)', color: task.is_working ? 'var(--acy)' : 'var(--t2)' }}
          >
            {task.is_working ? 'Working ●' : 'Set as Working'}
          </button>
          <button
            type="button"
            onClick={() => void toggleDone()}
            className="text-[12.5px] px-[8px] py-[3px] rounded-[5px] cursor-pointer"
            style={{ background: task.completed_at ? 'oklch(0.67 0.19 200 / 0.18)' : 'oklch(1 0 0 / 0.05)', color: task.completed_at ? 'var(--acy)' : 'var(--t2)' }}
          >
            {task.completed_at ? 'Done ✓' : 'Mark Done'}
          </button>
        </div>

        {/* Exam/quiz topic checklist */}
        {(task.item_type === 'exam' || task.item_type === 'quiz') && task.topics.length > 0 && (
          <div className="flex flex-col gap-[4px]">
            <span className="text-[11.5px] uppercase tracking-wider" style={{ color: 'var(--t3)' }}>Topic checklist</span>
            {task.topics.map((topic: Topic, i: number) => (
              <label key={i} className="flex items-center gap-[7px] text-[14px] cursor-pointer" style={{ color: topic.done ? 'var(--t3)' : 'var(--t1)' }}>
                <input type="checkbox" checked={topic.done} onChange={e => void toggleTopic(i, e.target.checked)} />
                <span className={cn(topic.done && 'line-through')}>{topic.label}</span>
              </label>
            ))}
          </div>
        )}

        {/* Study plan placeholder slot */}
        {(task.item_type === 'exam' || task.item_type === 'quiz') && (
          <div
            className="text-[12.5px] px-[10px] py-[8px] rounded-[6px] italic"
            style={{ background: 'oklch(1 0 0 / 0.03)', border: '1px dashed oklch(1 0 0 / 0.12)', color: 'var(--t3)' }}
          >
            Study plan: not yet available. (Reserved for a future AI-generated study plan feature.)
          </div>
        )}

        {/* Milestone children */}
        {hasChildren && (
          <div>
            <button
              type="button"
              onClick={() => setChildrenOpen(v => !v)}
              className="text-[12.5px] cursor-pointer"
              style={{ color: 'var(--acy)' }}
            >
              {childrenOpen ? 'Hide' : 'Show'} milestones ({doneChildren}/{childTasks!.length} done)
            </button>
            {childrenOpen && (
              <div className="mt-[6px] pl-[10px]" style={{ borderLeft: '2px solid oklch(1 0 0 / 0.08)' }}>
                {childTasks!.map(child => (
                  <SchoolItemRow
                    key={child.id}
                    task={child}
                    todayKey={todayKey}
                    onChanged={onChanged}
                    currentWorkingId={currentWorkingId}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </>
    )
  }

  if (variant === 'tile') {
    return (
      <div
        className="rounded-[10px] flex-shrink-0"
        style={{
          width: open ? 320 : 132,
          background: 'oklch(1 0 0 / 0.03)',
          border: `1px solid ${isOverdue ? 'oklch(0.65 0.22 25 / 0.5)' : dueColor.replace(')', ' / 0.4)')}`,
          transition: 'width 0.15s ease',
        }}
      >
        <button
          type="button"
          onClick={toggleOpen}
          className="w-full flex flex-col items-center text-center px-[10px] py-[12px] cursor-pointer"
        >
          {task.date_is_placeholder && (
            <span className="text-[10.5px] mb-[2px]" style={{ color: 'oklch(0.8 0.14 75)' }} title="The syllabus didn't list an exact date for this. Estimate only.">
              ~ unconfirmed
            </span>
          )}
          <span className="text-[43.5px] font-black leading-none" style={{ color: dueDays === null ? 'var(--t2)' : dueColor, fontFamily: 'var(--font-jetbrains-mono, monospace)' }}>
            {dueDays === null ? '–' : isOverdue ? Math.abs(dueDays) : dueDays}
          </span>
          <span className="text-[11.5px] font-semibold uppercase tracking-wider mt-[2px]" style={{ color: dueDays === null ? 'var(--t2)' : dueColor }}>
            {dueDays === null ? 'no date' : isOverdue ? (Math.abs(dueDays) === 1 ? 'day overdue' : 'days overdue') : dueDays === 0 ? 'due today' : dueDays === 1 ? 'day left' : 'days left'}
          </span>
          <span className={cn('text-[14px] font-semibold mt-[8px] leading-tight', task.completed_at && 'line-through')} style={{ color: task.completed_at ? 'var(--t3)' : 'var(--t1)' }}>
            {task.title}
          </span>
          {courseLabel && (
            <span className="text-[11.5px] mt-[2px] truncate max-w-full" style={{ color: 'var(--t2)' }} title={courseLabel}>{courseLabel}</span>
          )}
          <span className="mt-[6px] inline-block"><StatusBadge status={status} /></span>
          {task.due_date && (
            <span className="text-[11.5px] mt-[6px]" style={{ color: 'var(--t3)', fontFamily: 'var(--font-jetbrains-mono, monospace)' }}>
              {fmtDate(task.due_date)}
            </span>
          )}
        </button>

        {open && (
          <div className="px-[12px] pb-[12px] pt-[2px] text-left flex flex-col gap-[10px]" style={{ borderTop: '1px solid oklch(1 0 0 / 0.06)' }}>
            {renderExpandedBody()}
          </div>
        )}
      </div>
    )
  }

  return (
    <div
      className="rounded-[8px] mb-[6px]"
      style={{ background: 'oklch(1 0 0 / 0.03)', border: `1px solid ${isOverdue ? 'oklch(0.65 0.22 25 / 0.4)' : 'oklch(1 0 0 / 0.08)'}` }}
    >
      {/* Collapsed row */}
      <button
        type="button"
        onClick={toggleOpen}
        className="w-full flex flex-wrap md:flex-nowrap items-center gap-[8px] px-[10px] py-[8px] text-left cursor-pointer"
      >
        <span className="text-[12.5px] flex-shrink-0" style={{ color: 'var(--t3)' }}>{open ? '▾' : '▸'}</span>

        {task.item_type && (
          <span
            className="text-[10.5px] font-semibold uppercase tracking-wider px-[6px] py-[2px] rounded-[4px] flex-shrink-0"
            style={{ background: 'oklch(1 0 0 / 0.08)', color: 'var(--t1)' }}
          >
            {task.item_type}
            {task.component ? ` · ${task.component}` : ''}
          </span>
        )}

        <span className={cn('flex-1 min-w-[55%] md:min-w-0 text-[15px] font-medium truncate', task.completed_at && 'line-through')} style={{ color: task.completed_at ? 'var(--t3)' : 'var(--t1)' }}>
          {task.title}
        </span>

        {courseLabel && (
          <span className="text-[11.5px] flex-shrink-0 truncate max-w-[150px]" style={{ color: 'var(--t2)' }} title={courseLabel}>{courseLabel}</span>
        )}

        {hasChildren && (
          <span className="text-[11.5px] flex-shrink-0" style={{ color: 'var(--t2)' }}>{doneChildren} / {childTasks!.length} milestones</span>
        )}

        {task.due_date && dueDays !== null && (
          <span className="flex-shrink-0 flex items-center gap-[6px]">
            <span
              className="text-[14px] font-bold"
              style={{ color: dueColor, fontFamily: 'var(--font-jetbrains-mono, monospace)' }}
            >
              {isOverdue && '⚠ '}{fmtDate(task.due_date)}
            </span>
            {!task.completed_at && (
              <span
                className="text-[11.5px] font-semibold px-[6px] py-[2px] rounded-[8px] whitespace-nowrap"
                style={{ color: dueColor, background: dueColor.replace(')', ' / 0.15)'), border: `1px solid ${dueColor.replace(')', ' / 0.4)')}` }}
              >
                {dueLabel(dueDays, isOverdue)}
              </span>
            )}
            {task.date_is_placeholder && (
              <span
                className="text-[10.5px] px-[4px] py-[1px] rounded-[3px] cursor-help"
                style={{ background: 'oklch(0.78 0.16 75 / 0.15)', border: '1px solid oklch(0.78 0.16 75 / 0.4)', color: 'oklch(0.8 0.14 75)' }}
                title="The syllabus didn't list an exact date for this. This date is an estimate. Edit the due date below once the real date is confirmed."
              >
                ~ unconfirmed
              </span>
            )}
          </span>
        )}

        <StatusBadge status={status} />
      </button>

      {/* Expanded detail */}
      {open && (
        <div className="px-[12px] pb-[12px] pt-[2px] flex flex-col gap-[10px]" style={{ borderTop: '1px solid oklch(1 0 0 / 0.06)' }}>
          {renderExpandedBody()}
        </div>
      )}
    </div>
  )
}
