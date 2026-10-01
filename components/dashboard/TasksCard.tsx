'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Panel } from './Panel'
import { TaskPlanner } from './TaskPlanner'
import { TasksModal } from './TasksModal'
import { TaskEditDialog } from './TaskFields'
import { cn } from '@/lib/utils'
import { BLOCK_TYPES } from '@/lib/block-types'
import { notifyTasksChanged, onTasksChanged } from '@/lib/task-events'
import type { SessionTask } from '@/lib/task-types'

// Adding tasks happens in one place: the Session card's + Task form. This card
// lists today's tasks and handles everything done TO a task (complete, focus,
// edit, wait, block type, delete).

const CHECK_ICON = (
  <svg viewBox="0 0 10 10" fill="none" className="w-[10px] h-[10px]">
    <path d="M2 5l2.5 2.5L8 3" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
)

async function patchTask(id: string, body: Record<string, unknown>): Promise<boolean> {
  try {
    const res = await fetch(`/api/tasks/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) console.error('[tasks] PATCH failed', id, res.status)
    return res.ok
  } catch (e) {
    console.error('[tasks] PATCH error', id, e)
    return false
  }
}

/** DELETE /api/tasks/[id]. A 404 means it's already gone, which counts as success. */
export async function deleteTaskRequest(id: string): Promise<boolean> {
  try {
    const res = await fetch(`/api/tasks/${id}`, { method: 'DELETE' })
    if (!res.ok && res.status !== 404) console.error('[tasks] DELETE failed', id, res.status)
    return res.ok || res.status === 404
  } catch (e) {
    console.error('[tasks] DELETE error', id, e)
    return false
  }
}

const actionBtn = 'text-[10.5px] flex-shrink-0 px-[6px] py-[2px] rounded-[4px] cursor-pointer whitespace-nowrap'
const actionStyle = { color: 'var(--t2)', background: 'oklch(1 0 0 / 0.07)' } as const

// ── Row component (module scope — avoids react-hooks/static-components) ────

// Shared row for TasksCard and TasksModal. Both only ever render active
// (blocked=false) tasks — blocked ones live on KeyBlockersCard, which has its
// own simpler row — so the wait button only ever needs the one direction.
// `onFocus` is optional: focus is a today-list concept, and the modal's narrow
// columns have no room for an always-visible second button per row.
//
// Buttons: "→ focus" is always visible; edit / block type / wait / delete sit
// in .task-row-actions, which globals.css shows on hover (or on their own line
// on touch screens). Delete takes two clicks.
export function TaskRow({
  task,
  large,
  fontSize,
  isDone,
  overdue,
  todayKey,
  onToggle,
  onFocus,
  onToggleBlocked,
  onBlockTypeChange,
  onEdit,
  onDelete,
}: {
  task: SessionTask
  large?: boolean
  // Overrides `large`'s fixed 16px, for a caller (TasksModal) that needs its
  // own larger size without changing every other `large` consumer (e.g. the
  // compact Today's Tasks card).
  fontSize?: number
  isDone: boolean
  overdue?: boolean
  todayKey?: string
  onToggle: (task: SessionTask) => void
  onFocus?: (task: SessionTask) => void
  onToggleBlocked: (task: SessionTask) => void
  // Optional: only TasksCard/TasksModal wire this up (B2.12) — a correction
  // here sticks instead of Neptune re-guessing the block type every morning.
  onBlockTypeChange?: (task: SessionTask, blockType: string | null) => void
  onEdit?: (task: SessionTask) => void
  onDelete?: (task: SessionTask) => void
}) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const courseTag = task.tags?.find(t => t !== 'school')
  const dueToday = !overdue && !!todayKey && task.due_date === todayKey

  useEffect(() => {
    if (!confirmDelete) return
    const t = setTimeout(() => setConfirmDelete(false), 3000)
    return () => clearTimeout(t)
  }, [confirmDelete])

  return (
    <div
      onClick={() => onToggle(task)}
      className={cn('task-row flex items-start gap-[9px] w-full cursor-pointer', large && 'py-[4px]')}
    >
      <button
        onClick={e => { e.stopPropagation(); onToggle(task) }}
        aria-label={isDone ? 'Mark not done' : 'Mark done'}
        className={cn(
          'rounded-[4px] flex-shrink-0 flex items-center justify-center border cursor-pointer',
          !fontSize && (large ? 'w-5 h-5 mt-[2px]' : 'w-4 h-4 mt-[1px]'),
          isDone ? 'border-[var(--ac)]' : 'border-[oklch(1_0_0/0.18)]',
        )}
        style={{
          ...(isDone ? { background: 'var(--ac)' } : undefined),
          ...(fontSize ? { width: fontSize + 4, height: fontSize + 4, marginTop: 2 } : undefined),
        }}
      >
        {isDone && CHECK_ICON}
      </button>

      <span
        className={cn('flex-1 min-w-0 text-left', large ? 'font-semibold' : '', !fontSize && (large ? 'text-[16px]' : 'text-[13px]'), isDone && 'line-through')}
        style={{ color: isDone ? 'var(--t3)' : overdue ? 'var(--danger, #ef4444)' : 'var(--t1)', fontSize }}
      >
        {courseTag && (
          <span
            className="text-[10.5px] font-semibold uppercase tracking-wider mr-[6px] inline-block whitespace-nowrap"
            style={{ color: 'var(--t3)' }}
          >
            {courseTag}
          </span>
        )}
        {task.title}
        {dueToday && <span style={{ color: 'var(--t3)' }}> · due today</span>}
      </span>

      {task.is_working && (
        <span
          className="text-[10.5px] font-bold uppercase tracking-wider px-[6px] py-[2px] rounded-[10px] flex-shrink-0 flex items-center gap-[4px]"
          style={{ background: 'oklch(0.67 0.19 165 / 0.15)', border: '1px solid oklch(0.67 0.19 165 / 0.45)', color: 'var(--acy)' }}
          title="Actively working on this now"
        >
          <span
            className="w-[5px] h-[5px] rounded-full flex-shrink-0"
            style={{ background: 'var(--acy)', boxShadow: '0 0 5px var(--acy)', animation: 'pulse-badge 2s ease-in-out infinite' }}
          />
          Working
        </span>
      )}

      <div className="task-row-tail" onClick={e => e.stopPropagation()}>
        <div className={cn('task-row-actions', confirmDelete && 'is-open')}>
          {onEdit && (
            <button onClick={() => onEdit(task)} aria-label="Edit task" title="Edit title, dates, block" className={actionBtn} style={actionStyle}>
              ✎ edit
            </button>
          )}

          {onBlockTypeChange && (
            <select
              value={task.block_type ?? ''}
              onChange={e => onBlockTypeChange(task, e.target.value || null)}
              aria-label="Block type"
              title="Block type"
              className="text-[10.5px] flex-shrink-0 px-[4px] py-[2px] rounded-[4px] cursor-pointer"
              style={{ color: task.block_type ? 'var(--t1)' : 'var(--t2)', background: 'oklch(1 0 0 / 0.07)', border: 'none' }}
            >
              <option value="">— block</option>
              {BLOCK_TYPES.map(bt => (
                <option key={bt} value={bt}>{bt}</option>
              ))}
            </select>
          )}

          <button
            onClick={() => onToggleBlocked(task)}
            aria-label="Mark waiting on someone"
            title="Waiting on someone else?"
            className={actionBtn}
            style={actionStyle}
          >
            ⏸ wait
          </button>

          {onDelete && (
            <button
              onClick={() => (confirmDelete ? onDelete(task) : setConfirmDelete(true))}
              aria-label={confirmDelete ? 'Confirm delete' : 'Delete task'}
              title="Delete task"
              className={actionBtn}
              style={
                confirmDelete
                  ? { color: 'white', background: 'oklch(0.60 0.22 25 / 0.85)' }
                  : { color: 'var(--danger)', background: 'oklch(0.60 0.22 25 / 0.12)' }
              }
            >
              {confirmDelete ? 'sure? delete' : '✕ delete'}
            </button>
          )}
        </div>

        {onFocus && !task.in_progress && (
          <button onClick={() => onFocus(task)} className={actionBtn} style={{ color: 'var(--t3)', background: 'oklch(1 0 0 / 0.05)' }}>
            → focus
          </button>
        )}
      </div>
    </div>
  )
}

// ── TasksCard ─────────────────────────────────────────────────────────────

export function TasksCard() {
  const [overdueTasks, setOverdueTasks] = useState<SessionTask[]>([])
  const [todayTasks, setTodayTasks] = useState<SessionTask[]>([])
  const [todayKey, setTodayKey] = useState<string | undefined>(undefined)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [done, setDone] = useState<Set<string>>(new Set())
  const dirtyRef = useRef(false)

  const [backlogCount, setBacklogCount] = useState<number | null>(null)
  const [backlogError, setBacklogError] = useState(false)
  const backlogDirtyRef = useRef(false)

  const [showAll, setShowAll] = useState(false)
  const [plannerOpen, setPlannerOpen] = useState(false)
  const [tasksModalOpen, setTasksModalOpen] = useState(false)
  const [editingTask, setEditingTask] = useState<SessionTask | null>(null)
  const [mutationError, setMutationError] = useState<string | null>(null)

  // /api/tasks/today now includes tasks completed earlier today (so they stay
  // visible, done-styled, through the rest of the day) — seed the local `done`
  // Set from whatever the server already reports as completed, so a freshly
  // fetched already-done task renders struck-through instead of looking open.
  function applyFetchedTasks(body: { today?: string; overdue?: SessionTask[]; today_tasks?: SessionTask[] }) {
    setTodayKey(body.today)
    setOverdueTasks(body.overdue ?? [])
    setTodayTasks(body.today_tasks ?? [])
    const doneIds = (body.today_tasks ?? []).filter(t => t.completed_at).map(t => t.id)
    if (doneIds.length > 0) {
      setDone(prev => new Set([...prev, ...doneIds]))
    }
  }

  useEffect(() => {
    fetch('/api/tasks/today')
      .then(r => r.json())
      .then((body: { today?: string; overdue?: SessionTask[]; today_tasks?: SessionTask[] }) => {
        if (!dirtyRef.current) applyFetchedTasks(body)
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    fetch('/api/tasks/backlog')
      .then(r => r.json())
      .then((body: { tasks?: SessionTask[] }) => {
        if (!backlogDirtyRef.current) {
          setBacklogCount((body.tasks ?? []).length)
        }
      })
      .catch(() => setBacklogError(true))
  }, [])

  useEffect(() => {
    if (!mutationError) return
    const t = setTimeout(() => setMutationError(null), 4000)
    return () => clearTimeout(t)
  }, [mutationError])

  // ── Refetch today's list + backlog count ─────────────────────────────────
  // Runs when the All Tasks modal closes, and whenever any card (Session's
  // + Task form, the edit dialog, Key Blockers) reports a task change. Not
  // gated by dirtyRef: these are explicit, deliberate refresh points, not a
  // stale background response.
  const refreshTasks = useCallback(() => {
    dirtyRef.current = false
    backlogDirtyRef.current = false
    fetch('/api/tasks/today')
      .then(r => r.json())
      .then((body: { today?: string; overdue?: SessionTask[]; today_tasks?: SessionTask[] }) => applyFetchedTasks(body))
      .catch(() => setError(true))
    fetch('/api/tasks/backlog')
      .then(r => r.json())
      .then((body: { tasks?: SessionTask[] }) => setBacklogCount((body.tasks ?? []).length))
      .catch(() => setBacklogError(true))
  }, [])

  const closeTasksModal = useCallback(() => {
    setTasksModalOpen(false)
    refreshTasks()
  }, [refreshTasks])

  const closeEditor = useCallback(() => setEditingTask(null), [])

  useEffect(() => onTasksChanged(refreshTasks), [refreshTasks])

  // Applies a local update to whichever of the two lists actually holds this
  // task id — mapping over the other list is a no-op, so this is simpler than
  // tracking which list a task came from at every call site.
  function updateTaskInLists(id: string, updater: (t: SessionTask) => SessionTask) {
    setOverdueTasks(prev => prev.map(t => (t.id === id ? updater(t) : t)))
    setTodayTasks(prev => prev.map(t => (t.id === id ? updater(t) : t)))
  }

  // ── Checkbox toggle ──────────────────────────────────────────────────────

  async function toggleComplete(task: SessionTask) {
    dirtyRef.current = true
    const wasFocused = task.in_progress
    const nowDone = !done.has(task.id)
    const wasInProgress = task.in_progress

    // Optimistic update — completing the focused task also clears its focus locally
    // so focus mode falls back to "unchosen" immediately.
    setDone(prev => {
      const next = new Set(prev)
      if (nowDone) next.add(task.id); else next.delete(task.id)
      return next
    })
    if (nowDone && wasFocused) {
      updateTaskInLists(task.id, t => ({ ...t, in_progress: false }))
    }

    const patchBody: Record<string, unknown> = { completed: nowDone }
    if (nowDone && wasFocused) patchBody.in_progress = false

    const ok = await patchTask(task.id, patchBody)
    if (!ok) {
      setDone(prev => {
        const next = new Set(prev)
        if (nowDone) next.delete(task.id); else next.add(task.id)
        return next
      })
      if (nowDone && wasFocused) {
        updateTaskInLists(task.id, t => ({ ...t, in_progress: wasInProgress }))
      }
      setMutationError('Could not update task. Reverted.')
    }
    // Mutation (and any revert) has fully resolved — safe to let subsequent GETs
    // apply again.
    dirtyRef.current = false
  }

  // ── Removal from today's list (wait / delete) ───────────────────────────
  // Both optimistically drop the row, run the request, and put it back on
  // failure. Waiting surfaces the task on Key Blockers; deleting removes it
  // for good.

  async function removeFromList(task: SessionTask, request: () => Promise<boolean>, failMessage: string) {
    dirtyRef.current = true
    const fromOverdue = overdueTasks.some(t => t.id === task.id)
    if (fromOverdue) setOverdueTasks(prev => prev.filter(t => t.id !== task.id))
    else setTodayTasks(prev => prev.filter(t => t.id !== task.id))

    const ok = await request()
    if (!ok) {
      if (fromOverdue) setOverdueTasks(prev => [...prev, task])
      else setTodayTasks(prev => [...prev, task])
      setMutationError(failMessage)
    } else {
      // Drop it from `done` too, or the "done / total" badge keeps counting a
      // row that's no longer listed (applyFetchedTasks only ever adds ids).
      setDone(prev => {
        if (!prev.has(task.id)) return prev
        const next = new Set(prev)
        next.delete(task.id)
        return next
      })
      notifyTasksChanged()
    }
    dirtyRef.current = false
  }

  function toggleBlocked(task: SessionTask) {
    void removeFromList(task, () => patchTask(task.id, { blocked: true }), 'Could not mark task as waiting. Reverted.')
  }

  function deleteTask(task: SessionTask) {
    void removeFromList(task, () => deleteTaskRequest(task.id), 'Could not delete task. Reverted.')
  }

  // ── Block type correction (B2.12) ───────────────────────────────────────

  async function changeBlockType(task: SessionTask, blockType: string | null) {
    dirtyRef.current = true
    const previous = task.block_type ?? null
    updateTaskInLists(task.id, t => ({ ...t, block_type: blockType }))

    const ok = await patchTask(task.id, { block_type: blockType })
    if (!ok) {
      updateTaskInLists(task.id, t => ({ ...t, block_type: previous }))
      setMutationError('Could not update block type. Reverted.')
    }
    dirtyRef.current = false
  }

  // ── Focus mode ────────────────────────────────────────────────────────────

  async function setFocus(task: SessionTask) {
    dirtyRef.current = true
    const previousFocus = [...overdueTasks, ...todayTasks].find(t => t.in_progress && t.id !== task.id)

    // Scope the optimistic update + revert to exactly the two tasks involved.
    updateTaskInLists(task.id, t => ({ ...t, in_progress: true }))
    if (previousFocus) updateTaskInLists(previousFocus.id, t => ({ ...t, in_progress: false }))

    const ok = await patchTask(task.id, { in_progress: true })
    if (!ok) {
      updateTaskInLists(task.id, t => ({ ...t, in_progress: false }))
      if (previousFocus) updateTaskInLists(previousFocus.id, t => ({ ...t, in_progress: true }))
      setMutationError('Could not set focus. Reverted.')
    }
    dirtyRef.current = false
  }

  const focusTask = todayTasks.find(t => t.in_progress)
  const otherTodayTasks = todayTasks.filter(t => !focusTask || t.id !== focusTask.id)
  const totalCount = overdueTasks.length + todayTasks.length
  const badge = loading ? '— / —' : `${done.size} / ${totalCount}`

  const rowHandlers = {
    todayKey,
    onToggle: toggleComplete,
    onFocus: setFocus,
    onToggleBlocked: toggleBlocked,
    onBlockTypeChange: changeBlockType,
    onEdit: setEditingTask,
    onDelete: deleteTask,
  }

  return (
    <>
    <Panel
      label="Today's Tasks"
      badge={badge}
      action={
        <button
          onClick={() => setTasksModalOpen(true)}
          title="Expand tasks"
          aria-label="Expand tasks"
          style={{
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--t3)',
            fontSize: 13,
            padding: '0 2px',
            lineHeight: 1,
          }}
        >
          ⤢
        </button>
      }
    >
      <div className="flex flex-col gap-2">
        {mutationError && (
          <div
            className="text-[11px] px-[8px] py-[5px] rounded-[6px]"
            style={{ background: 'oklch(0.45 0.19 25 / 0.2)', border: '1px solid oklch(0.6 0.19 25 / 0.4)', color: 'var(--t1)' }}
          >
            {mutationError}
          </div>
        )}

        {loading && Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-center gap-[9px] h-[22px]">
            <div className="w-4 h-4 rounded-[4px] flex-shrink-0 border border-[oklch(1_0_0/0.1)] animate-pulse" style={{ background: 'oklch(1 0 0 / 0.05)' }} />
            <div className="flex-1 h-[10px] rounded animate-pulse" style={{ background: 'oklch(1 0 0 / 0.07)' }} />
          </div>
        ))}

        {!loading && error && (
          <span className="text-[13px]" style={{ color: 'var(--t3)' }}>Couldn&apos;t load tasks.</span>
        )}

        {!loading && !error && totalCount === 0 && (
          <span className="text-[13px]" style={{ color: 'var(--t3)' }}>Nothing scheduled for today. Add one with + Task on the Session card.</span>
        )}

        {!loading && !error && overdueTasks.length > 0 && (
          <div className="flex flex-col gap-2">
            <span className="text-[10.5px] font-semibold uppercase tracking-wider" style={{ color: 'var(--danger, #ef4444)' }}>
              Overdue
            </span>
            {overdueTasks.map(task => (
              <TaskRow key={task.id} task={task} isDone={done.has(task.id)} overdue {...rowHandlers} />
            ))}
          </div>
        )}

        {!loading && !error && focusTask && (
          <div className="flex flex-col gap-2">
            <TaskRow task={focusTask} large isDone={done.has(focusTask.id)} {...rowHandlers} />
            {otherTodayTasks.length > 0 && (
              <button
                onClick={() => setShowAll(v => !v)}
                className="text-[11px] text-left cursor-pointer"
                style={{ color: 'var(--t3)' }}
              >
                {showAll ? 'Hide' : `Show all (${otherTodayTasks.length})`}
              </button>
            )}
            {showAll && (
              <div className="flex flex-col gap-2 mt-[4px]">
                {otherTodayTasks.map(task => (
                  <TaskRow key={task.id} task={task} isDone={done.has(task.id)} {...rowHandlers} />
                ))}
              </div>
            )}
          </div>
        )}

        {!loading && !error && !focusTask && todayTasks.map(task => (
          <TaskRow key={task.id} task={task} isDone={done.has(task.id)} {...rowHandlers} />
        ))}

        <div className="flex items-center justify-between mt-[6px] pt-[8px]" style={{ borderTop: '1px solid oklch(1 0 0 / 0.08)' }}>
          <button
            onClick={() => setPlannerOpen(true)}
            className="text-[12px] text-left cursor-pointer"
            style={{ color: 'var(--ac)' }}
          >
            Plan my week →
          </button>
          {backlogError && <span className="text-[10.5px]" style={{ color: 'var(--t3)' }}>backlog unavailable</span>}
          {!backlogError && backlogCount !== null && (
            <span
              className="text-[10.5px] font-semibold px-[6px] py-[2px] rounded-[10px] flex-shrink-0"
              style={{ background: 'oklch(1 0 0 / 0.06)', color: 'var(--t3)' }}
              title="Tasks with no dates. Give them a day in Plan my week."
            >
              {backlogCount} unfiled
            </span>
          )}
        </div>
      </div>
    </Panel>

    {plannerOpen && <TaskPlanner onClose={() => setPlannerOpen(false)} />}
    {tasksModalOpen && <TasksModal onClose={closeTasksModal} />}
    {editingTask && <TaskEditDialog task={editingTask} onClose={closeEditor} />}
    </>
  )
}
