'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Panel } from './Panel'
import { notifyTasksChanged, onTasksChanged } from '@/lib/task-events'
import { waitingLabel } from '@/lib/task-groups'
import type { SessionTask } from '@/lib/task-types'

// Compact list of `blocked = true` tasks (specs/tasks-date-driven-refactor.md,
// Session B) — the "waiting on someone else" counterpart to Today's Tasks.
// Duration display only for now; "waiting on *who*" notes are deferred.
// Shares its "N days waiting" logic (lib/task-groups.ts) with TaskPlanner's
// own Waiting On column.

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

export function KeyBlockersCard() {
  const [tasks, setTasks] = useState<SessionTask[] | null>(null)
  const [todayKey, setTodayKey] = useState<string | null>(null)
  const [error, setError] = useState(false)
  const [mutationError, setMutationError] = useState<string | null>(null)
  const [unblockingId, setUnblockingId] = useState<string | null>(null)
  // Same dirtyRef contract as TasksCard.tsx: true while a mutation is
  // in-flight (including its own revert), so the mount-time GET below can't
  // stomp an optimistic update still resolving.
  const dirtyRef = useRef(false)

  const load = useCallback(() => {
    fetch('/api/tasks/blocked')
      .then(r => r.json())
      .then((body: { today?: string; tasks?: SessionTask[] }) => {
        if (!dirtyRef.current) {
          setTasks(body.tasks ?? [])
          setTodayKey(body.today ?? null)
        }
      })
      .catch(() => setError(true))
  }, [])

  useEffect(() => { load() }, [load])

  // Another card marked something as waiting — pick it up without a reload.
  useEffect(() => onTasksChanged(load), [load])

  useEffect(() => {
    if (!mutationError) return
    const t = setTimeout(() => setMutationError(null), 4000)
    return () => clearTimeout(t)
  }, [mutationError])

  async function unblock(task: SessionTask) {
    dirtyRef.current = true
    setUnblockingId(task.id)
    setTasks(prev => (prev ? prev.filter(t => t.id !== task.id) : prev))

    const ok = await patchTask(task.id, { blocked: false })
    if (!ok) {
      setTasks(prev => (prev ? [...prev, task] : prev))
      setMutationError('Could not mark task active. Reverted.')
    } else {
      notifyTasksChanged()
    }
    setUnblockingId(null)
    dirtyRef.current = false
  }

  const loading = tasks === null && !error

  return (
    <Panel label="Key Blockers" badge={tasks && tasks.length > 0 ? String(tasks.length) : undefined}>
      <div className="flex flex-col gap-2">
        {mutationError && (
          <div
            className="text-[11px] px-[8px] py-[5px] rounded-[6px]"
            style={{ background: 'oklch(0.45 0.19 25 / 0.2)', border: '1px solid oklch(0.6 0.19 25 / 0.4)', color: 'var(--t1)' }}
          >
            {mutationError}
          </div>
        )}

        {loading && Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="flex items-center gap-[9px] h-[22px]">
            <div className="flex-1 h-[10px] rounded animate-pulse" style={{ background: 'oklch(1 0 0 / 0.07)' }} />
          </div>
        ))}

        {!loading && error && (
          <span className="text-[13px]" style={{ color: 'var(--t3)' }}>Couldn&apos;t load blockers.</span>
        )}

        {!loading && !error && tasks && tasks.length === 0 && (
          <span className="text-[13px]" style={{ color: 'var(--t3)' }}>Nothing blocked.</span>
        )}

        {!loading && !error && tasks && tasks.map(task => (
          <div key={task.id} className="flex items-start gap-[9px] w-full">
            <div className="flex-1 min-w-0">
              <div className="text-[13px] truncate" style={{ color: 'var(--t1)' }}>{task.title}</div>
              <div className="text-[11px]" style={{ color: 'var(--t3)' }}>{waitingLabel(task.blocked_since, todayKey)}</div>
            </div>
            <button
              type="button"
              onClick={() => unblock(task)}
              disabled={unblockingId === task.id}
              className="text-[10.5px] flex-shrink-0 px-[6px] py-[2px] rounded-[4px] cursor-pointer"
              style={{
                color: 'var(--t3)',
                background: 'oklch(1 0 0 / 0.05)',
                cursor: unblockingId === task.id ? 'not-allowed' : 'pointer',
              }}
            >
              {unblockingId === task.id ? '…' : 'Mark active'}
            </button>
          </div>
        ))}
      </div>
    </Panel>
  )
}
