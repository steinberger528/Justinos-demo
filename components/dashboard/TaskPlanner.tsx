'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import { cn } from '@/lib/utils'
import { mondayOf } from '@/lib/date'
import { isOverdue, waitingLabel } from '@/lib/task-groups'
import { useResizable } from '@/lib/use-resizable'
import { notifyTasksChanged, onTasksChanged } from '@/lib/task-events'
import { ResizeHandles } from './ResizeHandles'
import type { SessionTask } from '@/lib/task-types'

// Two-zone day columns (specs/tasks-date-driven-refactor.md, Session B):
// a read-only-as-a-drop-target "due" strip (items whose due_date lands on that
// day — never written by this component) above a draggable "planned" work area
// (items whose planned_date lands there — the only field dragging ever sets).
// A task can appear in one day's due strip AND a different day's work area at
// once; dragging it only ever moves the work-area copy.

interface PlannerResponse {
  today: string
  backlog: SessionTask[]
  days: Record<string, { due: SessionTask[]; planned: SessionTask[] }>
}

interface BlockedResponse {
  today?: string
  tasks?: SessionTask[]
}

const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTH_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function toDateKey(d: Date): string {
  return d.toLocaleDateString('en-CA')
}

function dayLabel(dateKey: string): string {
  const d = new Date(`${dateKey}T00:00:00`)
  return `${DAY_SHORT[d.getDay()]} ${MONTH_SHORT[d.getMonth()]} ${d.getDate()}`
}

function shortLabel(dateKey: string): string {
  const d = new Date(`${dateKey}T00:00:00`)
  return `${MONTH_SHORT[d.getMonth()]} ${d.getDate()}`
}

async function patchTask(id: string, body: Record<string, unknown>): Promise<boolean> {
  try {
    const res = await fetch(`/api/tasks/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    return res.ok
  } catch {
    return false
  }
}

// Draggable ids are prefixed by the zone a card is rendered in (`due:`,
// `planned:`, `backlog:`, `neptune:`) so the same task can register as a
// draggable source in two places at once (its due-strip marker and its own,
// differently-dated work-area card) without colliding in @dnd-kit's id
// registry. The prefix is only ever used to look the card up for rendering
// (DragOverlay) — every drag always resolves back to the same underlying task
// id before mutating it.
function taskIdFromDraggableId(draggableId: string): string {
  return draggableId.slice(draggableId.indexOf(':') + 1)
}

function DueMarker({ id, task, isOverdue }: { id: string; task: SessionTask; isOverdue: boolean }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id })
  const style: React.CSSProperties = {
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    opacity: isDragging ? 0.4 : 1,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className="flex items-center gap-[9px] px-[11px] py-[7px] rounded-[6px] text-[17px] cursor-grab select-none"
      title={`Due ${dayLabel(task.due_date!)}`}
    >
      <span
        className="w-[8px] h-[8px] rounded-full flex-shrink-0"
        style={{ background: isOverdue ? 'var(--danger)' : 'var(--t3)' }}
      />
      <span
        className="flex-1 truncate"
        style={{ color: isOverdue ? 'var(--danger)' : 'var(--t2)' }}
      >
        {task.title}
      </span>
    </div>
  )
}

// `size="lg"` is used only by the top day-columns row — that row is the
// zoomed-in focal point of the planner, so its cards get more padding and a
// bigger font than the compact Backlog / Waiting On / Neptune Recommended
// row underneath.
function PlannedCard({ id, task, onDelete, size = 'sm' }: {
  id: string
  task: SessionTask
  onDelete?: (task: SessionTask) => void
  size?: 'sm' | 'lg'
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id })
  const style: React.CSSProperties = {
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    opacity: isDragging ? 0.4 : 1,
    padding: size === 'lg' ? '15px 17px' : '10px 12px',
    gap: size === 'lg' ? 11 : 9,
  }
  const fontSize = size === 'lg' ? 22 : 17

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className="flex items-center rounded-[7px] cursor-grab select-none"
      tabIndex={0}
      role="button"
      aria-label={task.title}
    >
      <span className="flex-1 truncate" style={{ color: 'var(--t1)', fontSize }}>{task.title}</span>
      {onDelete && (
        <button
          type="button"
          onClick={e => { e.stopPropagation(); onDelete(task) }}
          onPointerDown={e => e.stopPropagation()}
          aria-label={`Delete ${task.title}`}
          className="text-[12px] flex-shrink-0 px-[4px] cursor-pointer"
          style={{ color: 'var(--t3)' }}
        >
          ✕
        </button>
      )}
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
    </div>
  )
}

// The zoomed-in top row: bigger padding, bigger text, and a much taller work
// area than the old single-row layout gave these columns, so a day's planned
// tasks are actually legible at a glance instead of needing the window
// stretched to see them.
function DayColumn({ dateKey, due, planned, isToday, todayKey }: {
  dateKey: string
  due: SessionTask[]
  planned: SessionTask[]
  isToday: boolean
  todayKey: string
}) {
  // Only the work area is a drop target — the due strip is a display of
  // markers that happen to also be draggable sources, never a place to drop
  // a card onto (dropping there has no well-defined due_date write).
  const { setNodeRef, isOver } = useDroppable({ id: dateKey })

  return (
    <div
      className="flex flex-col gap-[8px] rounded-[10px] overflow-hidden"
      style={{ border: isToday ? '1.5px solid var(--ac)' : '1px solid oklch(1 0 0 / 0.12)', height: '100%', minHeight: 0 }}
    >
      <div className="px-[13px] pt-[13px] flex-shrink-0">
        <span
          className="text-[18px] font-semibold uppercase tracking-wider"
          style={{ color: isToday ? 'var(--ac)' : 'var(--t3)' }}
        >
          {dayLabel(dateKey)}
        </span>
      </div>

      {due.length > 0 && (
        <div className="flex flex-col gap-[4px] px-[7px] pb-[9px] flex-shrink-0" style={{ borderBottom: '1px solid oklch(1 0 0 / 0.08)' }}>
          {due.map(task => (
            <DueMarker
              key={task.id}
              id={`due:${task.id}`}
              task={task}
              // Shared rule (lib/task-groups.ts) so a deadline that reads red
              // here is exactly one that groups as Overdue on the cards.
              isOverdue={isOverdue({ due_date: task.due_date, planned_date: null }, todayKey)}
            />
          ))}
        </div>
      )}

      <div
        ref={setNodeRef}
        className="flex flex-col gap-[8px] p-[12px] flex-1"
        style={{
          minHeight: 0,
          overflowY: 'auto',
          background: isOver ? 'oklch(0.67 0.19 240 / 0.16)' : 'oklch(1 0 0 / 0.06)',
        }}
      >
        {planned.map(task => (
          <PlannedCard key={task.id} id={`planned:${task.id}`} task={task} size="lg" />
        ))}
        {due.length === 0 && planned.length === 0 && (
          <span className="text-[15px]" style={{ color: 'var(--t3)' }}>Nothing here.</span>
        )}
      </div>
    </div>
  )
}

const BACKLOG_PREVIEW_COUNT = 5

function BacklogColumn({ tasks, onDelete }: { tasks: SessionTask[]; onDelete: (task: SessionTask) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: 'backlog' })
  const [editing, setEditing] = useState(false)

  const hasMore = tasks.length > BACKLOG_PREVIEW_COUNT
  const visible = editing ? tasks : tasks.slice(0, BACKLOG_PREVIEW_COUNT)

  return (
    <div
      ref={setNodeRef}
      className="flex flex-col gap-[8px] rounded-[10px] p-[12px]"
      style={{
        background: isOver ? 'oklch(0.67 0.19 240 / 0.16)' : 'oklch(1 0 0 / 0.06)',
        border: '1px solid oklch(1 0 0 / 0.12)',
        height: '100%', minHeight: 0, overflowY: 'auto',
      }}
    >
      <div className="flex items-center justify-between flex-shrink-0">
        <span className="text-[16px] font-semibold uppercase tracking-wider" style={{ color: 'var(--t3)' }}>
          Backlog
        </span>
        {tasks.length > 0 && (
          <button
            type="button"
            onClick={() => setEditing(v => !v)}
            className="text-[14px] cursor-pointer"
            style={{ color: editing ? 'var(--ac)' : 'var(--t3)' }}
          >
            {editing ? 'Done' : 'Edit'}
          </button>
        )}
      </div>
      <div className="flex flex-col gap-[6px]">
        {visible.map(task => (
          <PlannedCard key={task.id} id={`backlog:${task.id}`} task={task} onDelete={editing ? onDelete : undefined} />
        ))}
        {tasks.length === 0 && (
          <span className="text-[15px]" style={{ color: 'var(--t3)' }}>Nothing unfiled.</span>
        )}
        {!editing && hasMore && (
          <span className="text-[15px]" style={{ color: 'var(--t3)' }}>
            +{tasks.length - BACKLOG_PREVIEW_COUNT} more. Edit to see all
          </span>
        )}
      </div>
    </div>
  )
}

// Read-only counterpart to KeyBlockersCard's list (same `blocked = true` data,
// same "Mark active" action) — not a drop target or a drag source, since a
// blocked task being planned for a day without first being unblocked isn't a
// well-defined action.
function WaitingOnColumn({ tasks, todayKey, error, onUnblock, unblockingId }: {
  tasks: SessionTask[]
  todayKey: string | null
  error: boolean
  onUnblock: (task: SessionTask) => void
  unblockingId: string | null
}) {
  return (
    <div
      className="flex flex-col gap-[8px] rounded-[10px] p-[12px]"
      style={{ background: 'oklch(1 0 0 / 0.06)', border: '1px solid oklch(1 0 0 / 0.12)', height: '100%', minHeight: 0, overflowY: 'auto' }}
    >
      <span className="text-[16px] font-semibold uppercase tracking-wider flex-shrink-0" style={{ color: 'var(--t3)' }}>
        Waiting On
      </span>
      <div className="flex flex-col gap-[7px]">
        {error && (
          <span className="text-[15px]" style={{ color: 'oklch(0.65 0.22 25)' }}>Couldn&apos;t load blocked tasks.</span>
        )}
        {!error && tasks.length === 0 && (
          <span className="text-[15px]" style={{ color: 'var(--t3)' }}>Nothing blocked.</span>
        )}
        {tasks.map(task => (
          <div
            key={task.id}
            className="flex items-start gap-[11px] px-[11px] py-[9px] rounded-[7px]"
            style={{ background: 'oklch(1 0 0 / 0.03)' }}
          >
            <div className="flex-1 min-w-0">
              <div className="text-[17px] truncate" style={{ color: 'var(--t1)' }}>{task.title}</div>
              <div className="text-[14px]" style={{ color: 'var(--t3)' }}>{waitingLabel(task.blocked_since, todayKey)}</div>
            </div>
            <button
              type="button"
              onClick={() => onUnblock(task)}
              disabled={unblockingId === task.id}
              className="text-[13px] flex-shrink-0 px-[8px] py-[4px] rounded-[5px] cursor-pointer"
              style={{ color: 'var(--t3)', background: 'oklch(1 0 0 / 0.05)', cursor: unblockingId === task.id ? 'not-allowed' : 'pointer' }}
            >
              {unblockingId === task.id ? '…' : 'Mark active'}
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

const NEPTUNE_RECOMMENDED_COUNT = 5

// A curated highlight of Backlog, not a separate pool — the same tasks still
// show in Backlog itself. "Recommended" here is a simple staleness heuristic
// (oldest created_at among undated tasks), not a live model call, framed
// under Neptune (components/dashboard/control-room-types.ts's "chief of
// staff" agent) since it's the same "here's what's been sitting" judgment
// call that persona already makes elsewhere in Control Room.
function NeptuneRecommendedColumn({ tasks }: { tasks: SessionTask[] }) {
  return (
    <div
      className="flex flex-col gap-[8px] rounded-[10px] p-[12px]"
      style={{ background: 'oklch(0.67 0.19 240 / 0.05)', border: '1px solid oklch(0.67 0.19 240 / 0.22)', height: '100%', minHeight: 0, overflowY: 'auto' }}
    >
      <span className="text-[16px] font-semibold uppercase tracking-wider flex-shrink-0" style={{ color: 'var(--ac)' }}>
        Neptune Recommended
      </span>
      <div className="flex flex-col gap-[6px]">
        {tasks.length === 0 && (
          <span className="text-[15px]" style={{ color: 'var(--t3)' }}>Nothing stale right now.</span>
        )}
        {tasks.map(task => (
          <PlannedCard key={task.id} id={`neptune:${task.id}`} task={task} />
        ))}
      </div>
    </div>
  )
}

export function TaskPlanner({ onClose }: { onClose: () => void }) {
  // Flattened, deduped-by-id task list — zones (backlog / due-strip / work-area)
  // are derived from each task's own due_date/planned_date via useMemo below,
  // the same "derive, don't hand-maintain buckets" approach TasksModal.tsx uses
  // for its urgency columns. This is what makes "a task can sit in one day's due
  // strip and a different day's work area at once" fall out for free, instead of
  // needing bespoke add/remove bookkeeping across two parallel nested maps.
  const [tasks, setTasks] = useState<SessionTask[] | null>(null)
  const [serverToday, setServerToday] = useState<string | null>(null)
  const [errorWeekStart, setErrorWeekStart] = useState<string | null>(null)
  const [loadedWeekStart, setLoadedWeekStart] = useState<string | null>(null)
  const [mutationError, setMutationError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [weekOffset, setWeekOffset] = useState(0)

  // Waiting On — independent of the week-scoped planner fetch above (blocked
  // tasks aren't scoped to a week), mirroring KeyBlockersCard.tsx's own
  // fetch/dirtyRef/unblock pattern so the two stay behaviorally identical.
  const [blockedTasks, setBlockedTasks] = useState<SessionTask[] | null>(null)
  const [blockedToday, setBlockedToday] = useState<string | null>(null)
  const [blockedError, setBlockedError] = useState(false)
  const [unblockingId, setUnblockingId] = useState<string | null>(null)
  const blockedDirtyRef = useRef(false)

  const { size, startResize } = useResizable(
    'dashboard.modalSize.planner',
    { width: 1600, height: 900 },
    { width: 900, height: 560 },
  )

  // The browser clock is only a placeholder until the first response lands —
  // the server's USER_TIMEZONE date wins as soon as it arrives, so "today" and
  // overdue-red match what the cards show.
  const browserToday = useMemo(() => toDateKey(new Date()), [])
  const todayKey = serverToday ?? browserToday
  const weekStart = useMemo(() => {
    const monday = mondayOf(new Date())
    monday.setDate(monday.getDate() + weekOffset * 7)
    return toDateKey(monday)
  }, [weekOffset])
  const dayKeys = useMemo(() => {
    const start = new Date(`${weekStart}T00:00:00`)
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start)
      d.setDate(d.getDate() + i)
      return toDateKey(d)
    })
  }, [weekStart])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  useEffect(() => {
    const controller = new AbortController()
    fetch(`/api/tasks/planner?start=${weekStart}`, { signal: controller.signal })
      .then(r => r.json())
      .then((body: PlannerResponse) => {
        const byId = new Map<string, SessionTask>()
        for (const t of body.backlog ?? []) byId.set(t.id, t)
        for (const day of Object.values(body.days ?? {})) {
          for (const t of day.due ?? []) byId.set(t.id, t)
          for (const t of day.planned ?? []) byId.set(t.id, t)
        }
        setTasks([...byId.values()])
        if (body.today) setServerToday(body.today)
        setLoadedWeekStart(weekStart)
      })
      .catch(err => { if (err.name !== 'AbortError') setErrorWeekStart(weekStart) })
    return () => controller.abort()
  }, [weekStart])

  const loadBlocked = useCallback(() => {
    fetch('/api/tasks/blocked')
      .then(r => r.json())
      .then((body: BlockedResponse) => {
        if (!blockedDirtyRef.current) {
          setBlockedTasks(body.tasks ?? [])
          setBlockedToday(body.today ?? null)
        }
      })
      .catch(() => setBlockedError(true))
  }, [])

  useEffect(() => { loadBlocked() }, [loadBlocked])
  // Another card (e.g. KeyBlockersCard on Home) changed blocked status — pick
  // it up without a reload. notifyTasksChanged() must never be called from
  // inside this handler, or the two cards would ping-pong (lib/task-events.ts).
  useEffect(() => onTasksChanged(loadBlocked), [loadBlocked])

  const data = loadedWeekStart === weekStart ? tasks : null
  const error = errorWeekStart === weekStart
  const loading = data === null && !error

  const backlog = useMemo(
    () => (data ?? []).filter(t => !t.due_date && !t.planned_date),
    [data],
  )
  const neptuneRecommended = useMemo(() => {
    return backlog
      .filter((t): t is SessionTask & { created_at: string } => !!t.created_at)
      .slice()
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .slice(0, NEPTUNE_RECOMMENDED_COUNT)
  }, [backlog])
  // Overdue tasks (due_date before todayKey) route to *today's* due strip
  // instead of their literal, now-past day — once a deadline is missed it's
  // a "deal with this now" problem, not a historical one, and a date before
  // this week's range would otherwise never appear in the planner at all,
  // leaving it stuck with no way to reschedule it. Only rerouted when today
  // is actually in the displayed week; a past/future week view shows each
  // task on its own literal date same as before.
  const dayBuckets = useMemo(() => {
    const map: Record<string, { due: SessionTask[]; planned: SessionTask[] }> = {}
    for (const key of dayKeys) map[key] = { due: [], planned: [] }
    const todayInView = dayKeys.includes(todayKey)
    for (const t of data ?? []) {
      if (t.due_date) {
        const dueBucket = todayInView && t.due_date < todayKey ? todayKey : t.due_date
        if (map[dueBucket]) map[dueBucket].due.push(t)
      }
      if (t.planned_date && map[t.planned_date]) map[t.planned_date].planned.push(t)
    }
    return map
  }, [data, dayKeys, todayKey])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    if (!mutationError) return
    const t = setTimeout(() => setMutationError(null), 4000)
    return () => clearTimeout(t)
  }, [mutationError])

  useEffect(() => {
    if (!notice) return
    const t = setTimeout(() => setNotice(null), 4000)
    return () => clearTimeout(t)
  }, [notice])

  function findTask(taskId: string): SessionTask | undefined {
    return (tasks ?? []).find(t => t.id === taskId)
  }

  // Sets planned_date only, locally and via PATCH — this component never
  // writes due_date, on any drag, including a drop onto Backlog (which clears
  // planned_date to null but must leave due_date untouched).
  function setPlannedLocal(taskId: string, plannedDate: string | null) {
    setTasks(prev => (prev ? prev.map(t => (t.id === taskId ? { ...t, planned_date: plannedDate } : t)) : prev))
  }

  async function handleDragEnd(event: DragEndEvent) {
    setActiveId(null)
    const { active, over } = event
    if (!over) return

    const taskId = taskIdFromDraggableId(active.id as string)
    const targetId = over.id as string
    const targetPlannedDate = targetId === 'backlog' ? null : targetId

    const task = findTask(taskId)
    if (!task) return
    const previousPlannedDate = task.planned_date ?? null

    if (previousPlannedDate === targetPlannedDate) return

    setPlannedLocal(taskId, targetPlannedDate)

    const ok = await patchTask(taskId, { planned_date: targetPlannedDate })
    if (!ok) {
      setPlannedLocal(taskId, previousPlannedDate)
      setMutationError('Could not reschedule task. Reverted.')
      return
    }

    // Dropping a task that still has a deadline onto Backlog clears only its
    // planned day, so it does NOT land in the Backlog column (that column is
    // strictly "no dates at all") — it drops back to being just a due marker.
    // Correct, but invisible enough to look like the drop failed, so say so.
    if (targetPlannedDate === null && task.due_date) {
      setNotice(`Cleared its planned day. Still due ${dayLabel(task.due_date)}.`)
    }
  }

  function handleDragStart(event: DragStartEvent) {
    setActiveId(event.active.id as string)
  }

  function removeTaskLocal(taskId: string) {
    setTasks(prev => (prev ? prev.filter(t => t.id !== taskId) : prev))
  }

  function restoreTaskLocal(task: SessionTask) {
    setTasks(prev => (prev ? [task, ...prev] : prev))
  }

  async function deleteTask(task: SessionTask) {
    removeTaskLocal(task.id)
    try {
      const res = await fetch(`/api/tasks/${task.id}`, { method: 'DELETE' })
      // 404 means the task is already gone (e.g. a duplicate request from a fast
      // double-click) — that's the desired end state, not a failure to revert.
      if (!res.ok && res.status !== 404) {
        restoreTaskLocal(task)
        setMutationError('Could not delete task. Reverted.')
      }
    } catch {
      restoreTaskLocal(task)
      setMutationError('Could not delete task. Reverted.')
    }
  }

  async function unblock(task: SessionTask) {
    blockedDirtyRef.current = true
    setUnblockingId(task.id)
    setBlockedTasks(prev => (prev ? prev.filter(t => t.id !== task.id) : prev))

    const ok = await patchTask(task.id, { blocked: false })
    if (!ok) {
      setBlockedTasks(prev => (prev ? [...prev, task] : prev))
      setMutationError('Could not mark task active. Reverted.')
    } else {
      notifyTasksChanged()
    }
    setUnblockingId(null)
    blockedDirtyRef.current = false
  }

  const activeTask = activeId ? findTask(taskIdFromDraggableId(activeId)) : undefined

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
          maxWidth: '96vw', width: size.width, height: size.height, position: 'relative',
          background: 'oklch(0.13 0.02 255 / 1)', backdropFilter: 'none', WebkitBackdropFilter: 'none',
        }}
      >
        <ResizeHandles onStart={startResize} />
        <div className="card-header">
          <div className="flex items-center gap-[10px]">
            <span className="card-label">Plan my week</span>
            <span className="text-[13px]" style={{ color: 'var(--t3)' }}>
              {shortLabel(dayKeys[0])} – {shortLabel(dayKeys[6])}
            </span>
          </div>
          <div className="flex items-center gap-[2px]">
            <button
              onClick={() => setWeekOffset(o => o - 1)}
              aria-label="Previous week"
              className="text-[13px] px-[8px] py-[2px] rounded-[6px] cursor-pointer"
              style={{ color: 'var(--t3)' }}
            >
              ←
            </button>
            <button
              onClick={() => setWeekOffset(o => o + 1)}
              aria-label="Next week"
              className="text-[13px] px-[8px] py-[2px] rounded-[6px] cursor-pointer"
              style={{ color: 'var(--t3)' }}
            >
              →
            </button>
            <button
              onClick={onClose}
              aria-label="Close planner"
              className="text-[13px] px-[8px] py-[2px] rounded-[6px] cursor-pointer"
              style={{ color: 'var(--t3)' }}
            >
              ✕
            </button>
          </div>
        </div>

        <div className="card-body" style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }}>
          {mutationError && (
            <div
              className="mb-[10px] text-[14px] px-[8px] py-[5px] rounded-[6px] flex-shrink-0"
              style={{ background: 'oklch(0.45 0.19 25 / 0.2)', border: '1px solid oklch(0.6 0.19 25 / 0.4)', color: 'var(--t1)' }}
            >
              {mutationError}
            </div>
          )}

          {notice && (
            <div
              className="mb-[10px] text-[14px] px-[8px] py-[5px] rounded-[6px] flex-shrink-0"
              style={{ background: 'oklch(1 0 0 / 0.07)', border: '1px solid oklch(1 0 0 / 0.15)', color: 'var(--t2)' }}
            >
              {notice}
            </div>
          )}

          {loading && (
            <div className="text-[15px] py-[20px] text-center" style={{ color: 'var(--t3)' }}>Loading planner…</div>
          )}

          {!loading && error && (
            <div className="text-[15px] py-[20px] text-center" style={{ color: 'var(--t3)' }}>Couldn&apos;t load planner.</div>
          )}

          {!loading && !error && data && (
            <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
              <div className="flex flex-col gap-[16px]" style={{ flex: 1, minHeight: 0 }}>
                <div className="grid gap-[12px]" style={{ gridTemplateColumns: 'repeat(7, 1fr)', flex: '3 1 0', minHeight: 0 }}>
                  {dayKeys.map(day => (
                    <DayColumn
                      key={day}
                      dateKey={day}
                      due={dayBuckets[day]?.due ?? []}
                      planned={dayBuckets[day]?.planned ?? []}
                      isToday={day === todayKey}
                      todayKey={todayKey}
                    />
                  ))}
                </div>

                <div className="grid gap-[12px]" style={{ gridTemplateColumns: 'repeat(3, 1fr)', flex: '2 1 0', minHeight: 0 }}>
                  <BacklogColumn tasks={backlog} onDelete={deleteTask} />
                  <WaitingOnColumn
                    tasks={blockedTasks ?? []}
                    todayKey={blockedToday}
                    error={blockedError}
                    onUnblock={unblock}
                    unblockingId={unblockingId}
                  />
                  <NeptuneRecommendedColumn tasks={neptuneRecommended} />
                </div>
              </div>

              <DragOverlay>
                {activeTask && (
                  <div
                    className={cn('flex items-center gap-[8px] px-[10px] py-[8px] rounded-[7px] text-[16px]')}
                    style={{ background: 'oklch(0.15 0 0 / 0.9)', border: '1px solid oklch(1 0 0 / 0.15)' }}
                  >
                    <span style={{ color: 'var(--t1)' }}>{activeTask.title}</span>
                  </div>
                )}
              </DragOverlay>
            </DndContext>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
