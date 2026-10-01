'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Panel } from './Panel'
import { GoalsModal } from './GoalsModal'
import { onGoalsChanged } from '@/lib/goal-events'

// ── Types ──────────────────────────────────────────────────────────────────────

export interface GoalStep {
  id: string
  goal_id: string
  text: string
  done: boolean
  sort_order: number
  created_at: string
}

export interface Goal {
  id: string
  user_id: string
  name: string
  type: 'checklist' | 'numeric'
  tab: 'ongoing' | 'timed'
  due_date: string | null
  target_number: number | null
  start_number: number | null
  current_number: number
  sort_order: number
  completed_at: string | null
  archived_at: string | null
  created_at: string
  steps: GoalStep[]
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatDueDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

// ── Edit Goal Form ─────────────────────────────────────────────────────────────

interface EditGoalFormProps {
  goal: Goal
  onSaved: () => void
  onCancel: () => void
  onDeleted: () => void
}

function EditGoalForm({ goal, onSaved, onCancel, onDeleted }: EditGoalFormProps) {
  const [name, setName]           = useState(goal.name)
  const [tab, setTab]             = useState<'ongoing' | 'timed'>(goal.tab)
  const [dueDate, setDueDate]     = useState(goal.due_date ?? '')
  const [targetNum, setTargetNum] = useState(goal.target_number != null ? String(goal.target_number) : '')
  const [startNum, setStartNum]   = useState(goal.start_number != null ? String(goal.start_number) : '')
  const [saving, setSaving]       = useState(false)
  const [deleting, setDeleting]   = useState(false)
  const [err, setErr]             = useState('')

  const handleSave = useCallback(async () => {
    if (!name.trim()) { setErr('Name is required'); return }
    if (tab === 'timed' && !dueDate) { setErr('Due date required for Timed goals'); return }
    setSaving(true)
    setErr('')
    const body: Record<string, unknown> = {
      name: name.trim(),
      tab,
      due_date: tab === 'timed' ? dueDate : null,
    }
    if (goal.type === 'numeric') {
      body.target_number = targetNum ? Number(targetNum) : null
      body.start_number = (startNum.trim() && !isNaN(Number(startNum))) ? Number(startNum) : null
    }
    try {
      const res = await fetch(`/api/goals/${goal.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const j = await res.json()
        setErr(j.error ?? 'Save failed')
      } else {
        onSaved()
      }
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setSaving(false)
    }
  }, [name, tab, dueDate, targetNum, startNum, goal.id, goal.type, onSaved])

  const handleDelete = useCallback(async () => {
    setDeleting(true)
    try {
      const res = await fetch(`/api/goals/${goal.id}`, { method: 'DELETE' })
      if (!res.ok) {
        console.error('[goals] delete failed', res.status)
        setErr('Delete failed')
        return
      }
      onDeleted()
    } catch (e) {
      console.error('[goals] delete error', e)
    } finally {
      setDeleting(false)
    }
  }, [goal.id, onDeleted])

  const inputStyle: React.CSSProperties = {
    background: 'oklch(1 0 0 / 0.04)',
    border: '1px solid oklch(1 0 0 / 0.1)',
    borderRadius: 6,
    color: 'var(--t1)',
    fontSize: 12,
    padding: '5px 8px',
    width: '100%',
    outline: 'none',
  }
  const labelStyle: React.CSSProperties = {
    color: 'var(--t3)',
    fontSize: 10.5,
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    marginBottom: 3,
    display: 'block',
  }
  const toggleBtn = (active: boolean): React.CSSProperties => ({
    background: active ? 'oklch(1 0 0 / 0.09)' : 'transparent',
    color: active ? 'var(--t1)' : 'var(--t3)',
    fontWeight: active ? 600 : 400,
    border: 'none',
    cursor: 'pointer',
    fontSize: 10.5,
    padding: '4px 8px',
    letterSpacing: '0.03em',
  })

  return (
    <div
      style={{
        background: 'oklch(1 0 0 / 0.04)',
        border: '1px solid oklch(1 0 0 / 0.1)',
        borderRadius: 8,
        padding: '10px 12px',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--t1)', marginBottom: 2 }}>Edit Goal</div>

      <div>
        <label style={labelStyle}>Name</label>
        <input style={inputStyle} value={name} onChange={e => setName(e.target.value)} />
      </div>

      <div>
        <label style={labelStyle}>Tab</label>
        <div style={{ display: 'flex', border: '1px solid oklch(1 0 0 / 0.09)', borderRadius: 7, overflow: 'hidden', background: 'oklch(1 0 0 / 0.03)' }}>
          {(['ongoing', 'timed'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} style={toggleBtn(tab === t)}>
              {t === 'ongoing' ? 'Ongoing' : 'Timed'}
            </button>
          ))}
        </div>
      </div>

      {tab === 'timed' && (
        <div>
          <label style={labelStyle}>Due Date</label>
          <input type="date" style={inputStyle} value={dueDate} onChange={e => setDueDate(e.target.value)} />
        </div>
      )}

      {goal.type === 'numeric' && (
        <div>
          <label style={labelStyle}>Target Number</label>
          <input
            type="number"
            style={inputStyle}
            value={targetNum}
            onChange={e => setTargetNum(e.target.value)}
            min={0}
          />
        </div>
      )}

      {goal.type === 'numeric' && (
        <div>
          <label style={labelStyle}>Starting Point (optional)</label>
          <input
            type="number"
            style={inputStyle}
            value={startNum}
            onChange={e => setStartNum(e.target.value)}
            placeholder="e.g. 220 (leave blank to clear)"
          />
        </div>
      )}

      {err && <div style={{ color: 'oklch(0.7 0.22 25)', fontSize: 11 }}>{err}</div>}

      <div style={{ display: 'flex', gap: 6, justifyContent: 'space-between', marginTop: 2 }}>
        <button
          onClick={handleDelete}
          disabled={deleting}
          style={{
            background: 'oklch(0.55 0.22 25 / 0.15)',
            border: '1px solid oklch(0.55 0.22 25 / 0.3)',
            borderRadius: 6,
            color: 'oklch(0.75 0.18 25)',
            cursor: deleting ? 'not-allowed' : 'pointer',
            fontSize: 11,
            opacity: deleting ? 0.6 : 1,
            padding: '4px 10px',
          }}
        >
          {deleting ? 'Deleting…' : 'Delete Goal'}
        </button>
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            onClick={onCancel}
            style={{
              background: 'transparent',
              border: '1px solid oklch(1 0 0 / 0.1)',
              borderRadius: 6,
              color: 'var(--t3)',
              cursor: 'pointer',
              fontSize: 11,
              padding: '4px 10px',
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              background: 'var(--ag)',
              border: 'none',
              borderRadius: 6,
              color: 'oklch(0.1 0 0)',
              cursor: saving ? 'not-allowed' : 'pointer',
              fontSize: 11,
              fontWeight: 600,
              opacity: saving ? 0.6 : 1,
              padding: '4px 12px',
            }}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Goal Row ───────────────────────────────────────────────────────────────────

export interface GoalRowProps {
  goal: Goal
  onRefresh: () => void
  /** Bigger text/controls for the full-screen Goals modal, where the 330px sidebar squeeze doesn't apply. */
  large?: boolean
}

export function GoalRow({ goal, onRefresh, large = false }: GoalRowProps) {
  const [expanded, setExpanded]     = useState(false)
  const [editMode, setEditMode]     = useState(false)
  const [editingGoal, setEditingGoal] = useState(false)
  const [newStepText, setNewStepText] = useState('')
  const [addingStep, setAddingStep]   = useState(false)
  const [localSteps, setLocalSteps]   = useState<GoalStep[]>(goal.steps)
  const [localCurrent, setLocalCurrent] = useState(goal.current_number)
  const [localCompleted, setLocalCompleted] = useState(goal.completed_at)
  const [archiving, setArchiving]     = useState(false)
  const [directEntry, setDirectEntry] = useState('')

  // Sync local state when goal prop changes
  const prevGoalIdRef = useRef<string>('')
  useEffect(() => {
    if (prevGoalIdRef.current === goal.id) {
      // Same goal, re-sync from server after an external refresh
      Promise.resolve(goal).then(g => {
        setLocalSteps(g.steps)
        setLocalCurrent(g.current_number)
        setLocalCompleted(g.completed_at)
      })
    }
    prevGoalIdRef.current = goal.id
  }, [goal])

  // Drag-to-reorder state
  const dragIndex = useRef<number | null>(null)
  const overIndex = useRef<number | null>(null)

  const pct = goal.type === 'numeric'
    ? (() => {
        if (goal.target_number == null) return 0
        if (goal.start_number != null) {
          const denom = goal.target_number - goal.start_number
          if (denom === 0) return 0
          return Math.round(((localCurrent - goal.start_number) / denom) * 100)
        }
        return goal.target_number > 0
          ? Math.round((localCurrent / goal.target_number) * 100)
          : 0
      })()
    : (localSteps.length > 0
        ? Math.round((localSteps.filter(s => s.done).length / localSteps.length) * 100)
        : 0)

  const overdue = goal.tab === 'timed' && goal.due_date && pct < 100 && (() => {
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const due = new Date(goal.due_date + 'T00:00:00')
    return due < today
  })()

  const isCompleted = pct >= 100 || !!localCompleted

  // ── Step toggle ──────────────────────────────────────────────────────────────

  const toggleStep = useCallback(async (step: GoalStep) => {
    const newDone = !step.done
    // Optimistic update
    setLocalSteps(prev => prev.map(s => s.id === step.id ? { ...s, done: newDone } : s))

    // Primary step-toggle PATCH — its own try/catch so a failure here (thrown or
    // non-OK) rolls back only this optimistic update, and so the secondary sync
    // below (which must never trigger this rollback once this PATCH has already
    // succeeded server-side) can't share this catch block.
    try {
      const res = await fetch(`/api/goals/${goal.id}/steps/${step.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ done: newDone }),
      })
      if (!res.ok) {
        console.error('[goals] step toggle failed', await res.text())
        // Roll back
        setLocalSteps(prev => prev.map(s => s.id === step.id ? { ...s, done: step.done } : s))
        return
      }
    } catch (e) {
      console.error('[goals] step toggle error', e)
      setLocalSteps(prev => prev.map(s => s.id === step.id ? { ...s, done: step.done } : s))
      return
    }

    // Secondary completed_at-sync — isolated in its own try/catch. The primary
    // step toggle above already succeeded and is persisted server-side by this
    // point, so a failure here (thrown or non-OK) must never roll back
    // `localSteps` — that would show the step as un-toggled locally while the
    // server actually has it toggled. On failure, surface an error but leave
    // the step's toggled state as-is; onRefresh() below still runs regardless,
    // so the real server state (including completed_at) reconciles on next fetch.
    try {
      // Check if now 100%
      const updatedSteps = localSteps.map(s => s.id === step.id ? { ...s, done: newDone } : s)
      const total = updatedSteps.length
      const doneCount = updatedSteps.filter(s => s.done).length
      if (total > 0 && doneCount >= total && !localCompleted) {
        const completedAt = new Date().toISOString()
        const completeRes = await fetch(`/api/goals/${goal.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ completed_at: completedAt }),
        })
        if (!completeRes.ok) {
          console.error('[goals] completed_at sync failed', completeRes.status)
        } else {
          setLocalCompleted(completedAt)
        }
      } else if (doneCount < total && localCompleted) {
        // Un-completing: clear completed_at
        const uncompleteRes = await fetch(`/api/goals/${goal.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ completed_at: null }),
        })
        if (!uncompleteRes.ok) {
          console.error('[goals] completed_at sync failed', uncompleteRes.status)
        } else {
          setLocalCompleted(null)
        }
      }
    } catch (e) {
      console.error('[goals] completed_at sync error', e)
    }

    // Sync the parent's `goals` array with what the server now holds — without
    // this, the change only lives in this row's local state, which is fine
    // until something remounts GoalRow (e.g. closing and reopening the Goals
    // modal) and it re-seeds from the parent's now-stale copy, making a
    // successfully saved toggle look like it never happened. Reachable
    // regardless of the secondary sync's outcome, since that block catches
    // its own errors above.
    onRefresh()
  }, [goal.id, localSteps, localCompleted, onRefresh])

  // ── Delete step ──────────────────────────────────────────────────────────────

  const deleteStep = useCallback(async (stepId: string) => {
    setLocalSteps(prev => prev.filter(s => s.id !== stepId))
    try {
      const res = await fetch(`/api/goals/${goal.id}/steps/${stepId}`, { method: 'DELETE' })
      if (!res.ok) {
        console.error('[goals] step delete failed')
      }
      onRefresh() // Sync the parent's copy either way — see toggleStep's comment
    } catch (e) {
      console.error('[goals] step delete error', e)
      onRefresh()
    }
  }, [goal.id, onRefresh])

  // ── Add step ─────────────────────────────────────────────────────────────────

  const addStep = useCallback(async () => {
    const text = newStepText.trim()
    if (!text) return
    setAddingStep(true)
    try {
      const res = await fetch(`/api/goals/${goal.id}/steps`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      })
      if (res.ok) {
        const j = await res.json()
        const newStep: GoalStep = {
          id: j.id,
          goal_id: goal.id,
          text,
          done: false,
          sort_order: localSteps.length,
          created_at: new Date().toISOString(),
        }
        setLocalSteps(prev => [...prev, newStep])
        setNewStepText('')
        onRefresh() // Sync the parent's copy — see toggleStep's comment
      } else {
        console.error('[goals] add step failed', await res.text())
      }
    } catch (e) {
      console.error('[goals] add step error', e)
    } finally {
      setAddingStep(false)
    }
  }, [goal.id, newStepText, localSteps.length, onRefresh])

  // ── Numeric stepper ──────────────────────────────────────────────────────────

  const saveNumeric = useCallback(async (newVal: number) => {
    setLocalCurrent(newVal)
    const target = goal.target_number
    const updatePayload: Record<string, unknown> = { current_number: newVal }
    // Determine completion based on progress pct using start_number when set
    const computedPct = (() => {
      if (target == null) return 0
      if (goal.start_number != null) {
        const denom = target - goal.start_number
        return denom === 0 ? 0 : ((newVal - goal.start_number) / denom) * 100
      }
      return target > 0 ? (newVal / target) * 100 : 0
    })()
    if (computedPct >= 100 && !localCompleted) {
      updatePayload.completed_at = new Date().toISOString()
      setLocalCompleted(updatePayload.completed_at as string)
    } else if (computedPct < 100 && localCompleted) {
      updatePayload.completed_at = null
      setLocalCompleted(null)
    }
    try {
      const res = await fetch(`/api/goals/${goal.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatePayload),
      })
      if (!res.ok) {
        console.error('[goals] numeric update failed')
        setLocalCurrent(goal.current_number)
        setLocalCompleted(goal.completed_at)
      } else {
        onRefresh() // Sync the parent's copy — see toggleStep's comment
      }
    } catch (e) {
      console.error('[goals] numeric update error', e)
      setLocalCurrent(goal.current_number)
      setLocalCompleted(goal.completed_at)
    }
  }, [goal.id, goal.current_number, goal.target_number, goal.start_number, goal.completed_at, localCompleted, onRefresh])

  const adjustNumeric = useCallback((delta: number) => {
    const newVal = Math.max(0, localCurrent + delta)
    saveNumeric(newVal)
  }, [localCurrent, saveNumeric])

  const commitDirectEntry = useCallback(() => {
    const trimmed = directEntry.trim()
    if (!trimmed || isNaN(Number(trimmed))) {
      setDirectEntry('')
      return
    }
    const newVal = Number(trimmed)
    setDirectEntry('')
    saveNumeric(newVal)
  }, [directEntry, saveNumeric])

  // ── Archive ──────────────────────────────────────────────────────────────────

  const archive = useCallback(async () => {
    setArchiving(true)
    try {
      const res = await fetch(`/api/goals/${goal.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ archived_at: new Date().toISOString() }),
      })
      if (res.ok) {
        onRefresh()
      } else {
        console.error('[goals] archive failed')
      }
    } catch (e) {
      console.error('[goals] archive error', e)
    } finally {
      setArchiving(false)
    }
  }, [goal.id, onRefresh])

  // ── Drag-to-reorder ──────────────────────────────────────────────────────────

  const onDragStart = useCallback((e: React.DragEvent, index: number) => {
    e.dataTransfer.effectAllowed = 'move'
    dragIndex.current = index
  }, [])

  const onDragOver = useCallback((e: React.DragEvent, index: number) => {
    e.preventDefault()
    overIndex.current = index
  }, [])

  const onDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    if (dragIndex.current === null || overIndex.current === null) return
    if (dragIndex.current === overIndex.current) return
    const newSteps = [...localSteps]
    const [moved] = newSteps.splice(dragIndex.current, 1)
    newSteps.splice(overIndex.current, 0, moved)
    setLocalSteps(newSteps)
    dragIndex.current = null
    overIndex.current = null

    try {
      const res = await fetch(`/api/goals/${goal.id}/steps/reorder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order: newSteps.map(s => s.id) }),
      })
      if (!res.ok) {
        console.error('[goals] reorder failed')
      }
      onRefresh() // Sync the parent's copy either way — see toggleStep's comment
    } catch (e) {
      console.error('[goals] reorder error', e)
      onRefresh()
    }
  }, [goal.id, localSteps, onRefresh])

  if (editingGoal) {
    return (
      <EditGoalForm
        goal={goal}
        onSaved={() => { setEditingGoal(false); onRefresh() }}
        onCancel={() => setEditingGoal(false)}
        onDeleted={onRefresh}
      />
    )
  }

  const progressBarColor = pct > 100
    ? 'oklch(0.78 0.16 85)'  // gold/amber — over-target, distinct from green and teal
    : isCompleted
      ? 'var(--acy, oklch(0.75 0.2 150))'  // teal — exactly 100%
      : 'var(--ag)'  // green — below 100%

  return (
    <div
      style={{
        border: overdue ? '1px solid oklch(0.55 0.22 25 / 0.45)' : '1px solid oklch(1 0 0 / 0.07)',
        borderRadius: 8,
        background: overdue ? 'oklch(0.55 0.22 25 / 0.06)' : 'transparent',
        overflow: 'hidden',
      }}
    >
      {/* Header row — click to expand */}
      <div
        style={{ padding: '8px 10px', cursor: 'pointer' }}
        onClick={() => setExpanded(e => !e)}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, flex: 1, minWidth: 0 }}>
            {isCompleted && (
              <span style={{ color: 'var(--acy, oklch(0.75 0.2 150))', fontSize: 11, flexShrink: 0 }}>✓</span>
            )}
            <span
              style={{
                color: 'var(--t1)',
                fontSize: large ? 16 : 12,
                fontWeight: 500,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {goal.name}
            </span>
            {overdue && (
              <span
                style={{
                  background: 'oklch(0.55 0.22 25 / 0.2)',
                  border: '1px solid oklch(0.55 0.22 25 / 0.4)',
                  borderRadius: 10,
                  color: 'oklch(0.78 0.18 25)',
                  fontSize: 10.5,
                  padding: '1px 5px',
                  flexShrink: 0,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}
              >
                overdue
              </span>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            <span
              style={{
                fontFamily: 'var(--font-jetbrains-mono, monospace)',
                fontSize: large ? 15 : 12,
                color: pct >= 100 ? 'var(--acy, oklch(0.75 0.2 150))' : 'var(--t2)',
              }}
            >
              {pct}%
            </span>

            {/* Edit goal icon */}
            <button
              onClick={e => { e.stopPropagation(); setEditingGoal(true) }}
              title="Edit goal"
              style={{
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--t3)',
                fontSize: 11,
                padding: '0 2px',
                lineHeight: 1,
              }}
            >
              ✎
            </button>

            {/* Edit steps icon — checklist goals only */}
            {goal.type === 'checklist' && (
              <button
                onClick={e => { e.stopPropagation(); setExpanded(true); setEditMode(m => !m) }}
                title="Edit steps"
                style={{
                  background: editMode ? 'oklch(1 0 0 / 0.09)' : 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  color: editMode ? 'var(--ag)' : 'var(--t3)',
                  fontSize: 11,
                  padding: '0 2px',
                  lineHeight: 1,
                }}
              >
                ≡
              </button>
            )}

            {/* Expand indicator */}
            <span style={{ color: 'var(--t3)', fontSize: 10.5 }}>{expanded ? '▲' : '▼'}</span>
          </div>
        </div>

        {/* Progress bar */}
        <div style={{ height: large ? 7 : 5, borderRadius: 3, overflow: 'hidden', background: 'oklch(1 0 0 / 0.07)' }}>
          <div
            style={{
              width: `${pct}%`,
              height: '100%',
              borderRadius: 3,
              background: progressBarColor,
              transition: 'width 0.4s ease',
            }}
          />
        </div>

        {/* Meta line */}
        {goal.tab === 'timed' && goal.due_date && (
          <div
            style={{
              fontSize: large ? 12 : 10,
              marginTop: 3,
              color: overdue ? 'oklch(0.78 0.18 25)' : 'var(--t3)',
            }}
          >
            Due {formatDueDate(goal.due_date)}
          </div>
        )}
      </div>

      {/* Expanded body */}
      {expanded && (
        <div
          style={{
            borderTop: '1px solid oklch(1 0 0 / 0.07)',
            padding: '8px 10px',
          }}
        >
          {/* Completed goal — archive action */}
          {isCompleted && (
            <div
              style={{
                background: 'var(--acy, oklch(0.75 0.2 150) / 0.12)',
                border: '1px solid oklch(0.75 0.2 150 / 0.3)',
                borderRadius: 6,
                padding: '6px 10px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 8,
              }}
            >
              <span style={{ color: 'var(--acy, oklch(0.75 0.2 150))', fontSize: 11 }}>
                Goal completed!
              </span>
              <button
                onClick={archive}
                disabled={archiving}
                style={{
                  background: 'var(--ag)',
                  border: 'none',
                  borderRadius: 5,
                  color: 'oklch(0.1 0 0)',
                  cursor: archiving ? 'not-allowed' : 'pointer',
                  fontSize: 10.5,
                  fontWeight: 600,
                  opacity: archiving ? 0.6 : 1,
                  padding: '3px 8px',
                }}
              >
                {archiving ? 'Archiving…' : 'Archive'}
              </button>
            </div>
          )}

          {/* Checklist steps — `large` (modal) mode lays steps out in a
              multi-column grid instead of one long vertical list, so a goal
              with a lot of steps reads at a glance instead of needing to
              scroll through it. */}
          {goal.type === 'checklist' && (
            <div
              style={
                large
                  ? { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', columnGap: 20, rowGap: 2 }
                  : { display: 'flex', flexDirection: 'column', gap: 3 }
              }
            >
              {localSteps.length === 0 && !editMode && (
                <div style={{ color: 'var(--t3)', fontSize: large ? 14 : 11 }}>No steps yet. Click ≡ to add steps.</div>
              )}

              {localSteps.map((step, i) => (
                <div
                  key={step.id}
                  draggable
                  onDragStart={e => onDragStart(e, i)}
                  onDragOver={e => onDragOver(e, i)}
                  onDrop={onDrop}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: large ? 8 : 6,
                    padding: large ? '3px 0' : '2px 0',
                  }}
                >
                  {/* Drag handle */}
                  <span style={{ color: 'var(--t3)', fontSize: large ? 12 : 10, userSelect: 'none', cursor: 'grab', flexShrink: 0 }}>
                    ⋮⋮
                  </span>

                  {/* Delete button (edit mode only) */}
                  {editMode && (
                    <button
                      onClick={() => deleteStep(step.id)}
                      style={{
                        background: 'oklch(0.55 0.22 25 / 0.2)',
                        border: '1px solid oklch(0.55 0.22 25 / 0.3)',
                        borderRadius: '50%',
                        color: 'oklch(0.78 0.18 25)',
                        cursor: 'pointer',
                        fontSize: 10.5,
                        fontWeight: 700,
                        height: 16,
                        width: 16,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                        padding: 0,
                        lineHeight: 1,
                      }}
                      title="Delete step"
                    >
                      ⊝
                    </button>
                  )}

                  {/* Checkbox + text — wrapped in a <label> so clicking anywhere
                      in the text (not just the tiny checkbox itself) toggles it. */}
                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: large ? 8 : 6,
                      flex: 1,
                      cursor: 'pointer',
                      minWidth: 0,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={step.done}
                      onChange={() => toggleStep(step)}
                      style={{
                        cursor: 'pointer',
                        flexShrink: 0,
                        accentColor: 'var(--ag)',
                        width: large ? 15 : undefined,
                        height: large ? 15 : undefined,
                      }}
                    />

                    {/* Step text */}
                    <span
                      style={{
                        fontSize: large ? 14 : 11,
                        lineHeight: large ? 1.4 : undefined,
                        color: step.done ? 'var(--t3)' : 'var(--t2)',
                        textDecoration: step.done ? 'line-through' : 'none',
                        flex: 1,
                      }}
                    >
                      {step.text}
                    </span>
                  </label>
                </div>
              ))}

              {/* Add step (edit mode) */}
              {editMode && (
                <div style={{ display: 'flex', gap: 5, marginTop: 4, gridColumn: large ? '1 / -1' : undefined }}>
                  <input
                    value={newStepText}
                    onChange={e => setNewStepText(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') addStep() }}
                    placeholder="+ Add a step"
                    style={{
                      background: 'oklch(1 0 0 / 0.04)',
                      border: '1px solid oklch(1 0 0 / 0.12)',
                      borderRadius: 5,
                      color: 'var(--t1)',
                      flex: 1,
                      fontSize: 11,
                      outline: 'none',
                      padding: '4px 8px',
                    }}
                    autoFocus
                  />
                  <button
                    onClick={addStep}
                    disabled={addingStep}
                    style={{
                      background: 'var(--ag)',
                      border: 'none',
                      borderRadius: 5,
                      color: 'oklch(0.1 0 0)',
                      cursor: addingStep ? 'not-allowed' : 'pointer',
                      fontSize: 11,
                      fontWeight: 600,
                      opacity: addingStep ? 0.6 : 1,
                      padding: '4px 8px',
                    }}
                  >
                    Add
                  </button>
                </div>
              )}

            </div>
          )}

          {/* Numeric target */}
          {goal.type === 'numeric' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {/* Stepper row */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <button
                  onClick={() => adjustNumeric(-1)}
                  style={{
                    background: 'oklch(1 0 0 / 0.07)',
                    border: '1px solid oklch(1 0 0 / 0.1)',
                    borderRadius: 5,
                    color: 'var(--t2)',
                    cursor: 'pointer',
                    fontSize: 14,
                    fontWeight: 600,
                    height: 28,
                    width: 28,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  −
                </button>
                <div style={{ textAlign: 'center', flex: 1 }}>
                  <span
                    style={{
                      fontFamily: 'var(--font-jetbrains-mono, monospace)',
                      fontSize: large ? 26 : 20,
                      fontWeight: 600,
                      color: 'var(--t1)',
                    }}
                  >
                    {localCurrent}
                  </span>
                  {goal.target_number != null && (
                    <span
                      style={{
                        fontFamily: 'var(--font-jetbrains-mono, monospace)',
                        fontSize: large ? 16 : 13,
                        color: 'var(--t3)',
                      }}
                    >
                      {' '}/ {goal.target_number}
                    </span>
                  )}
                </div>
                <button
                  onClick={() => adjustNumeric(1)}
                  style={{
                    background: 'oklch(1 0 0 / 0.07)',
                    border: '1px solid oklch(1 0 0 / 0.1)',
                    borderRadius: 5,
                    color: 'var(--t2)',
                    cursor: 'pointer',
                    fontSize: 14,
                    fontWeight: 600,
                    height: 28,
                    width: 28,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  +
                </button>
              </div>

              {/* Direct-entry row */}
              <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
                <input
                  type="number"
                  value={directEntry}
                  onChange={e => setDirectEntry(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') commitDirectEntry() }}
                  placeholder="Set exact value…"
                  style={{
                    background: 'oklch(1 0 0 / 0.04)',
                    border: '1px solid oklch(1 0 0 / 0.12)',
                    borderRadius: 5,
                    color: 'var(--t1)',
                    flex: 1,
                    fontSize: 12,
                    outline: 'none',
                    padding: '4px 8px',
                  }}
                />
                <button
                  onClick={commitDirectEntry}
                  style={{
                    background: 'var(--ag)',
                    border: 'none',
                    borderRadius: 5,
                    color: 'oklch(0.1 0 0)',
                    cursor: 'pointer',
                    fontSize: 11,
                    fontWeight: 600,
                    padding: '4px 10px',
                    flexShrink: 0,
                  }}
                >
                  Set
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Main Card ──────────────────────────────────────────────────────────────────

export const sectionLabelStyle: React.CSSProperties = {
  color: 'var(--t3)',
  fontSize: 10.5,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  marginBottom: 4,
  display: 'block',
}

export function GoalsCard() {
  const [goals, setGoals]       = useState<Goal[]>([])
  const [loading, setLoading]   = useState(true)
  const [showModal, setShowModal] = useState(false)
  const dirtyRef                = useRef(false)

  const loadGoals = useCallback(() => {
    fetch('/api/goals')
      .then(res => {
        if (!res.ok) { console.error('[goals] GET failed', res.status); return null }
        return res.json() as Promise<{ goals: Goal[] }>
      })
      .then(data => {
        if (!data) return
        if (dirtyRef.current) return
        setGoals(data.goals ?? [])
        setLoading(false)
      })
      .catch(e => {
        console.error('[goals] load error', e)
        setLoading(false)
      })
  }, [])

  useEffect(() => {
    loadGoals()
  }, [loadGoals])

  const handleRefresh = useCallback(() => {
    dirtyRef.current = false
    loadGoals()
  }, [loadGoals])

  // Goals are added from the Session card's + Goal form; refetch when it reports one.
  useEffect(() => onGoalsChanged(handleRefresh), [handleRefresh])

  const timedGoals    = goals.filter(g => g.tab === 'timed')
  const ongoingGoals  = goals.filter(g => g.tab === 'ongoing')
  const hasAnyGoals   = goals.length > 0

  return (
    <>
    <Panel
      label="Goals"
      action={
        <button
          onClick={() => setShowModal(true)}
          title="Expand goals"
          aria-label="Expand goals"
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
      {/* Goals list — unified with section labels */}
      {loading ? (
        <div style={{ color: 'var(--t3)', fontSize: 12 }}>Loading…</div>
      ) : !hasAnyGoals ? (
        <div style={{ color: 'var(--t3)', fontSize: 12 }}>No goals yet. Add one with + Goal on the Session card.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Timed section */}
          <div>
            <span style={sectionLabelStyle}>Timed</span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {timedGoals.length === 0 ? (
                <div style={{ color: 'var(--t3)', fontSize: 11 }}>No timed goals yet.</div>
              ) : (
                timedGoals.map(g => (
                  <GoalRow key={g.id} goal={g} onRefresh={handleRefresh} />
                ))
              )}
            </div>
          </div>

          {/* Ongoing section */}
          <div>
            <span style={sectionLabelStyle}>Ongoing</span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {ongoingGoals.length === 0 ? (
                <div style={{ color: 'var(--t3)', fontSize: 11 }}>No ongoing goals yet.</div>
              ) : (
                ongoingGoals.map(g => (
                  <GoalRow key={g.id} goal={g} onRefresh={handleRefresh} />
                ))
              )}
            </div>
          </div>
        </div>
      )}

    </Panel>

    <GoalsModal
      open={showModal}
      onClose={() => setShowModal(false)}
      goals={goals}
      onRefresh={handleRefresh}
    />
    </>
  )
}
