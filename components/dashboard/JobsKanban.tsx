'use client'

import { useCallback, useState } from 'react'
import { Panel } from './Panel'
import { agentName, clientName, type Agent, type AgentJob, type Client, type JobState } from './crm-types'

const COLUMNS: { state: JobState; label: string }[] = [
  { state: 'queued',  label: 'Queued' },
  { state: 'running', label: 'Running' },
  { state: 'blocked', label: 'Blocked' },
  { state: 'done',    label: 'Done' },
]

interface JobsKanbanProps {
  jobsByState: Record<JobState, AgentJob[]>
  agents: Agent[]
  clients: Client[]
  onChanged: () => void
  onDirtyChange: (dirty: boolean) => void
}

/**
 * Surface 4 — Jobs Kanban. Four columns (Queued/Running/Blocked/Done). Cards
 * are draggable between columns; drop persists state + sort_order via
 * PATCH /api/crm/jobs/[id] (writes audit_log server-side). Blocked column
 * visually flags needs_input jobs.
 */
export function JobsKanban({ jobsByState, agents, clients, onChanged, onDirtyChange }: JobsKanbanProps) {
  const [localJobs, setLocalJobs] = useState(jobsByState)
  const [dragging, setDragging] = useState<{ id: string; fromState: JobState } | null>(null)
  const [prevProp, setPrevProp] = useState(jobsByState)

  // Re-sync local copy when the parent's data changes (poll refresh) unless
  // the user is mid-drag. This adjusts state during render in response to a
  // prop change (React's documented pattern for this) rather than mutating a
  // ref during render or calling setState from inside an effect.
  if (prevProp !== jobsByState) {
    setPrevProp(jobsByState)
    if (!dragging) setLocalJobs(jobsByState)
  }

  const totalJobs = COLUMNS.reduce((n, c) => n + (localJobs[c.state]?.length ?? 0), 0)

  const onDragStart = useCallback((e: React.DragEvent, job: AgentJob) => {
    e.dataTransfer.effectAllowed = 'move'
    setDragging({ id: job.id, fromState: job.state })
    onDirtyChange(true)
  }, [onDirtyChange])

  // Universal reset — fires on every drag end (successful drop, drop outside
  // any column's drop zone, or cancellation via Escape), unlike onDrop which
  // only fires on a successful drop into a valid target. Without this, a drag
  // released outside all 4 columns leaves onDirtyChange(true) permanently set,
  // freezing CrmDataProvider's shared 15s poll for the entire CRM cockpit.
  // Safety net only — the onDrop-based reset below still runs for real moves.
  const onDragEnd = useCallback(() => {
    onDirtyChange(false)
  }, [onDirtyChange])

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
  }, [])

  const onDrop = useCallback(async (e: React.DragEvent, toState: JobState) => {
    e.preventDefault()
    if (!dragging) return
    const { id, fromState } = dragging
    setDragging(null)

    if (fromState === toState) {
      onDirtyChange(false)
      return
    }

    // New sort_order places the dropped card at the end of the destination
    // column — one past the current max sort_order there — so ordering
    // survives reload instead of resetting to the default 0 on every drop.
    const destJobs = localJobs[toState] ?? []
    const newSortOrder = destJobs.length > 0
      ? Math.max(...destJobs.map(j => j.sort_order)) + 1
      : 0

    // Optimistic move
    setLocalJobs(prev => {
      const job = prev[fromState]?.find(j => j.id === id)
      if (!job) return prev
      const updatedJob: AgentJob = {
        ...job,
        state: toState,
        sort_order: newSortOrder,
        completed_at: toState === 'done' ? new Date().toISOString() : null,
      }
      return {
        ...prev,
        [fromState]: prev[fromState].filter(j => j.id !== id),
        [toState]: [...(prev[toState] ?? []), updatedJob],
      }
    })

    try {
      const res = await fetch(`/api/crm/jobs/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state: toState, sort_order: newSortOrder }),
      })
      if (!res.ok) {
        console.error('[crm] job move failed', await res.text())
        onChanged() // re-sync from server on failure
      } else {
        onChanged()
      }
    } catch (err) {
      console.error('[crm] job move error', err)
      onChanged()
    } finally {
      onDirtyChange(false)
    }
  }, [dragging, localJobs, onChanged, onDirtyChange])

  return (
    <Panel label="Jobs" badge={totalJobs > 0 ? String(totalJobs) : undefined} fill>
      <div className="grid gap-[10px]" style={{ gridTemplateColumns: 'repeat(4, 1fr)', height: '100%' }}>
        {COLUMNS.map(col => {
          const jobs = localJobs[col.state] ?? []
          return (
            <div
              key={col.state}
              onDragOver={onDragOver}
              onDrop={e => onDrop(e, col.state)}
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
                height: '100%',
                minHeight: 80,
                overflowY: 'auto',
                padding: 6,
                borderRadius: 8,
                background: 'oklch(1 0 0 / 0.02)',
                border: '1px solid oklch(1 0 0 / 0.06)',
                boxSizing: 'border-box',
              }}
            >
              <div style={{
                fontSize: 10.5,
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                color: 'var(--t3)',
                padding: '2px 2px 4px',
              }}>
                {col.label} <span style={{ opacity: 0.7 }}>({jobs.length})</span>
              </div>

              {jobs.length === 0 && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1, color: 'var(--t3)', fontSize: 10.5 }}>No jobs</div>
              )}

              {jobs.map(job => {
                const flagged = job.state === 'blocked' && job.needs_input
                return (
                  <div
                    key={job.id}
                    draggable
                    onDragStart={e => onDragStart(e, job)}
                    onDragEnd={onDragEnd}
                    style={{
                      cursor: 'grab',
                      padding: '6px 8px',
                      borderRadius: 6,
                      border: flagged ? '1px solid oklch(0.78 0.16 75 / 0.4)' : '1px solid oklch(1 0 0 / 0.08)',
                      background: flagged ? 'oklch(0.78 0.16 75 / 0.07)' : 'oklch(1 0 0 / 0.03)',
                    }}
                  >
                    <div style={{
                      fontSize: 11,
                      color: 'var(--t1)',
                      fontWeight: 500,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                    }}>
                      {job.title}
                    </div>
                    <div style={{ fontSize: 10.5, color: 'var(--t3)', marginTop: 3 }}>
                      {clientName(clients, job.client_id)}
                    </div>
                    <div style={{ fontSize: 10.5, color: 'var(--t3)' }}>
                      {agentName(agents, job.agent_id)}
                    </div>
                    {flagged && (
                      <div style={{
                        marginTop: 4,
                        fontSize: 10.5,
                        fontWeight: 600,
                        textTransform: 'uppercase',
                        letterSpacing: '0.04em',
                        color: 'var(--retro-amber, oklch(0.78 0.16 75))',
                      }}>
                        Needs input
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>
    </Panel>
  )
}
