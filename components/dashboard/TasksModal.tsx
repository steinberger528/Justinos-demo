'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { TaskRow, deleteTaskRequest } from './TasksCard'
import { TaskEditDialog } from './TaskFields'
import { useResizable } from '@/lib/use-resizable'
import { groupFor, addDays, earliestDate } from '@/lib/task-groups'
import { notifyTasksChanged } from '@/lib/task-events'
import { ResizeHandles } from './ResizeHandles'
import type { SessionTask } from '@/lib/task-types'

// Full-screen expansion of TasksCard (specs/tasks-date-driven-refactor.md).
// Shows every incomplete, active task grouped by date into five derived
// buckets. No drag-and-drop here — a derived range like "This Week" has no
// single date to write on drop, so reassigning dates happens in Plan My Week,
// where every column is one unambiguous day. Rows here can be completed,
// edited (dialog), marked waiting, re-typed, or deleted.
//
// Overdue and Today share one bucket (both are "deal with this now"), the
// old single "This Week" bucket is split into Next 3 Days / This Week (days
// 4-7) so the near-term doesn't get buried behind the whole week, and Later
// drops to its own full-width row underneath — same "prioritized top row,
// de-emphasized pile at the bottom" shape as TaskPlanner's Backlog/Waiting
// On/Neptune Recommended row.
type Bucket = 'now' | 'next3' | 'week' | 'later'

const TOP_ROW: { key: Bucket; label: string }[] = [
  { key: 'now', label: 'Overdue & Today' },
  { key: 'next3', label: 'Next 3 Days' },
  { key: 'week', label: 'This Week' },
]

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

function sortByDate(a: SessionTask, b: SessionTask): number {
  const ad = a.due_date ?? a.planned_date ?? '9999-99-99'
  const bd = b.due_date ?? b.planned_date ?? '9999-99-99'
  return ad < bd ? -1 : ad > bd ? 1 : 0
}

function TaskColumn({
  label,
  accent,
  todayKey,
  tasks,
  isOverdue,
  onToggle,
  onToggleBlocked,
  onBlockTypeChange,
  onEdit,
  onDelete,
}: {
  label: string
  accent?: boolean
  todayKey: string
  tasks: SessionTask[]
  isOverdue: (task: SessionTask) => boolean
  onToggle: (task: SessionTask) => void
  onToggleBlocked: (task: SessionTask) => void
  onBlockTypeChange: (task: SessionTask, blockType: string | null) => void
  onEdit: (task: SessionTask) => void
  onDelete: (task: SessionTask) => void
}) {
  return (
    <div
      className="flex flex-col gap-[12px] rounded-[10px] p-[14px]"
      style={{ background: 'oklch(1 0 0 / 0.06)', border: '1px solid oklch(1 0 0 / 0.12)', height: '100%', minHeight: 0, overflowY: 'auto' }}
    >
      <span
        className="text-[16px] font-semibold uppercase tracking-wider flex-shrink-0"
        style={{ color: accent ? 'var(--danger, #ef4444)' : 'var(--t3)' }}
      >
        {label}
      </span>
      <div className="flex flex-col gap-[11px]">
        {tasks.map(task => (
          <div key={task.id} className="rounded-[8px] p-[9px_11px]" style={{ background: 'oklch(1 0 0 / 0.03)' }}>
            {/* No onFocus here: several columns in one modal leave each row not much
                room, and a second button per row squeezed titles into wrapped lines.
                Focus is a today-list action anyway. */}
            <TaskRow
              task={task}
              isDone={false}
              large
              fontSize={21}
              overdue={isOverdue(task)}
              todayKey={todayKey}
              onToggle={onToggle}
              onToggleBlocked={onToggleBlocked}
              onBlockTypeChange={onBlockTypeChange}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          </div>
        ))}
        {tasks.length === 0 && (
          <span className="text-[15px]" style={{ color: 'var(--t3)' }}>Nothing here.</span>
        )}
      </div>
    </div>
  )
}

export function TasksModal({ onClose }: { onClose: () => void }) {
  const [tasks, setTasks] = useState<SessionTask[] | null>(null)
  const [todayKey, setTodayKey] = useState<string | null>(null)
  const [error, setError] = useState(false)
  const [mutationError, setMutationError] = useState<string | null>(null)
  // Guards the mount-time GET below against being stomped by (or stomping) an
  // in-flight mutation's optimistic update — same contract as TasksCard.tsx's
  // dirtyRef: set true while a mutation is in flight, reset to false once it
  // (and any revert-on-failure) has resolved, not left permanently one-way.
  const dirtyRef = useRef(false)
  const [editingTask, setEditingTask] = useState<SessionTask | null>(null)

  const { size, startResize } = useResizable(
    'dashboard.modalSize.tasks',
    { width: 1100, height: 700 },
    { width: 700, height: 420 },
  )

  const loadTasks = useCallback((signal?: AbortSignal) => {
    fetch('/api/tasks/all', { signal })
      .then(r => r.json())
      .then((body: { today?: string; tasks?: SessionTask[] }) => {
        if (!dirtyRef.current) {
          setTasks(body.tasks ?? [])
          setTodayKey(body.today ?? null)
        }
      })
      .catch(err => { if (err.name !== 'AbortError') setError(true) })
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    loadTasks(controller.signal)
    return () => controller.abort()
  }, [loadTasks])

  const closeEditor = useCallback(() => setEditingTask(null), [])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // Escape belongs to the edit dialog while it's open.
      if (e.key === 'Escape' && !editingTask) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, editingTask])

  useEffect(() => {
    if (!mutationError) return
    const t = setTimeout(() => setMutationError(null), 4000)
    return () => clearTimeout(t)
  }, [mutationError])

  // Grouped + sorted per bucket, recomputed from the flat `tasks` list so it
  // stays correct after local optimistic edits (completion, waiting toggle),
  // not just the initial fetch order. Uses the server-provided `todayKey`
  // (not the browser clock) so this never disagrees with TasksCard's grouping.
  // "week" (groupFor's 7-day bucket) is split again here at the 3-day mark —
  // groupFor itself is untouched since /api/tasks/today and KeyBlockersCard
  // also depend on its plain overdue/today/week/later/backlog taxonomy.
  const columns = useMemo(() => {
    if (!todayKey) return null
    const map: Record<Bucket, SessionTask[]> = { now: [], next3: [], week: [], later: [] }
    const next3Cutoff = addDays(todayKey, 3)
    for (const t of tasks ?? []) {
      const group = groupFor(t, todayKey)
      if (group === 'overdue' || group === 'today') {
        map.now.push(t)
      } else if (group === 'week') {
        const earliest = earliestDate(t)
        map[earliest !== null && earliest <= next3Cutoff ? 'next3' : 'week'].push(t)
      } else if (group === 'later') {
        map.later.push(t)
      }
      // 'backlog' (no dates at all) has no bucket here, same as before this split.
    }
    for (const key of Object.keys(map) as Bucket[]) {
      map[key].sort(sortByDate)
    }
    return map
  }, [tasks, todayKey])

  // ── Complete — removes the task from view optimistically, same as the compact card ──

  async function completeTask(task: SessionTask) {
    dirtyRef.current = true
    setTasks(prev => (prev ? prev.filter(t => t.id !== task.id) : prev))
    const ok = await patchTask(task.id, { completed: true })
    if (!ok) {
      setTasks(prev => (prev ? [...prev, task] : prev))
      setMutationError('Could not complete task. Reverted.')
    }
    dirtyRef.current = false
  }

  // ── Waiting toggle — removes the task from view; it resurfaces on Key Blockers ──

  async function toggleBlocked(task: SessionTask) {
    dirtyRef.current = true
    setTasks(prev => (prev ? prev.filter(t => t.id !== task.id) : prev))
    const ok = await patchTask(task.id, { blocked: true })
    if (!ok) {
      setTasks(prev => (prev ? [...prev, task] : prev))
      setMutationError('Could not mark task as waiting. Reverted.')
    } else {
      notifyTasksChanged()
    }
    dirtyRef.current = false
  }

  // ── Block type correction (B2.12) ───────────────────────────────────────

  async function changeBlockType(task: SessionTask, blockType: string | null) {
    dirtyRef.current = true
    setTasks(prev => (prev ? prev.map(t => (t.id === task.id ? { ...t, block_type: blockType } : t)) : prev))
    const ok = await patchTask(task.id, { block_type: blockType })
    if (!ok) {
      setTasks(prev => (prev ? prev.map(t => (t.id === task.id ? { ...t, block_type: task.block_type ?? null } : t)) : prev))
      setMutationError('Could not update block type. Reverted.')
    }
    dirtyRef.current = false
  }

  // ── Delete ──────────────────────────────────────────────────────────────

  async function deleteTask(task: SessionTask) {
    dirtyRef.current = true
    setTasks(prev => (prev ? prev.filter(t => t.id !== task.id) : prev))
    const ok = await deleteTaskRequest(task.id)
    if (!ok) {
      setTasks(prev => (prev ? [...prev, task] : prev))
      setMutationError('Could not delete task. Reverted.')
    } else {
      notifyTasksChanged()
    }
    dirtyRef.current = false
  }

  const loading = (tasks === null || todayKey === null) && !error

  function isOverdueTask(task: SessionTask): boolean {
    return !!todayKey && groupFor(task, todayKey) === 'overdue'
  }

  // Rendered via createPortal straight to document.body: the cards this opens from
  // use `backdrop-filter`, which (like `transform`/`filter`/`zoom`) makes an
  // element the containing block for `position: fixed` descendants in Chromium.
  // Left as a plain DOM descendant, this scrim would be clipped/positioned against
  // that card instead of the real viewport. A portal escapes it entirely.
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-[24px]"
      style={{ background: 'oklch(0 0 0 / 0.6)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="glass accent-glow flex flex-col"
        style={{
          width: size.width, height: size.height, position: 'relative',
          background: 'oklch(0.13 0.02 255 / 1)', backdropFilter: 'none', WebkitBackdropFilter: 'none',
        }}
      >
        <ResizeHandles onStart={startResize} />
        <div className="card-header">
          <span className="card-label">All Tasks</span>
          <button
            onClick={onClose}
            aria-label="Close tasks"
            className="text-[13px] px-[8px] py-[2px] rounded-[6px] cursor-pointer"
            style={{ color: 'var(--t3)' }}
          >
            ✕
          </button>
        </div>

        <div className="card-body" style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }}>
          {mutationError && (
            <div
              className="mb-[10px] text-[13px] px-[8px] py-[5px] rounded-[6px] flex-shrink-0"
              style={{ background: 'oklch(0.45 0.19 25 / 0.2)', border: '1px solid oklch(0.6 0.19 25 / 0.4)', color: 'var(--t1)' }}
            >
              {mutationError}
            </div>
          )}

          {loading && (
            <div className="text-[14px] py-[20px] text-center" style={{ color: 'var(--t3)' }}>Loading tasks…</div>
          )}

          {!loading && error && (
            <div className="text-[14px] py-[20px] text-center" style={{ color: 'var(--t3)' }}>Couldn&apos;t load tasks.</div>
          )}

          {!loading && !error && columns && todayKey && (
            <div className="flex flex-col gap-[14px]" style={{ flex: 1, minHeight: 0 }}>
              <div className="grid gap-[12px]" style={{ gridTemplateColumns: 'repeat(3, 1fr)', flex: '2 1 0', minHeight: 0 }}>
                {TOP_ROW.map(col => (
                  <TaskColumn
                    key={col.key}
                    label={col.label}
                    accent={col.key === 'now'}
                    todayKey={todayKey}
                    tasks={columns[col.key]}
                    isOverdue={isOverdueTask}
                    onToggle={completeTask}
                    onToggleBlocked={toggleBlocked}
                    onBlockTypeChange={changeBlockType}
                    onEdit={setEditingTask}
                    onDelete={deleteTask}
                  />
                ))}
              </div>

              <div style={{ flex: '1 1 0', minHeight: 0 }}>
                <TaskColumn
                  label="Later"
                  todayKey={todayKey}
                  tasks={columns.later}
                  isOverdue={isOverdueTask}
                  onToggle={completeTask}
                  onToggleBlocked={toggleBlocked}
                  onBlockTypeChange={changeBlockType}
                  onEdit={setEditingTask}
                  onDelete={deleteTask}
                />
              </div>
            </div>
          )}
        </div>
      </div>
      {editingTask && (
        <TaskEditDialog
          task={editingTask}
          onClose={closeEditor}
          onSaved={() => { dirtyRef.current = false; loadTasks() }}
        />
      )}
    </div>,
    document.body,
  )
}
