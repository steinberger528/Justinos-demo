'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Panel } from './Panel'
import { cn } from '@/lib/utils'
import { localDateKey } from '@/lib/date'

type SimpleHabit = { id: string; label: string }
type ExpandableHabit = { id: string; label: string; steps: string[] }
type HabitDef = SimpleHabit | ExpandableHabit

function isExpandable(h: HabitDef): h is ExpandableHabit {
  return 'steps' in h
}

// Sample habits for the demo. Two are routines with their own steps: a routine counts
// as done when every step is checked.
const HABITS: HabitDef[] = [
  { id: 'morning', label: 'Morning', steps: ['Make Bed', 'Water', 'Stretch', 'Review Plan'] },
  { id: 'workout',   label: 'Workout' },
  { id: 'nutrition', label: 'Nutrition Goal' },
  { id: 'deepwork',  label: 'Deep Work' },
  { id: 'journal',   label: 'Journal' },
  { id: 'nightly', label: 'Nightly', steps: ['Tidy Desk', 'Plan Tomorrow', 'Screens Off'] },
]

export type HabitState = {
  done: boolean
  steps?: boolean[]
}

type AllHabits = Record<string, HabitState>

/** The Morning habit, shared with the Briefing modal (B2.13) so it renders the real
 *  steps rather than its own hardcoded copy that would drift when these change. */
export const MORNING_HABIT = HABITS[0] as ExpandableHabit


function initState(): AllHabits {
  const s: AllHabits = {}
  for (const h of HABITS) {
    s[h.id] = isExpandable(h)
      ? { done: false, steps: h.steps.map(() => false) }
      : { done: false }
  }
  return s
}

function mergeFromDb(db: Record<string, unknown>): AllHabits {
  const s = initState()
  for (const h of HABITS) {
    const raw = db[h.id] as HabitState | undefined
    if (!raw) continue
    if (isExpandable(h) && Array.isArray(raw.steps)) {
      s[h.id] = { done: raw.done ?? false, steps: raw.steps }
    } else {
      s[h.id] = { done: raw.done ?? false }
    }
  }
  return s
}

const CHECK_ICON = (
  <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
    <path d="M2 5l2.5 2.5L8 3" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
)

const CHEVRON = (open: boolean) => (
  <svg
    width="10" height="10" viewBox="0 0 10 10" fill="none"
    style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 150ms' }}
  >
    <path d="M2 3.5l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
)

export function HabitCard() {
  const [habits, setHabits] = useState<AllHabits>(initState)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [saveFailed, setSaveFailed] = useState(false)
  const pendingRef = useRef<AllHabits | null>(null)
  const dateRef = useRef(localDateKey())
  // Guards against the mount-time GET overwriting a user edit that lands first:
  // set true on any user-initiated habit change (applyAndSave), checked before
  // applying the mount GET's response.
  const dirtyRef = useRef(false)

  // Load from DB on mount
  useEffect(() => {
    const date = localDateKey()
    dateRef.current = date
    fetch(`/api/habits?date=${date}`)
      .then(r => {
        if (!r.ok) { console.error('[habits] GET failed', r.status); return null }
        return r.json()
      })
      .then(data => {
        if (!data) return
        if (dirtyRef.current) return
        const { habits: db } = data as { habits: Record<string, unknown> }
        if (db && typeof db === 'object') setHabits(mergeFromDb(db))
      })
      .catch(err => console.error('[habits] load error', err))
  }, [])

  // The Briefing modal (B2.13) writes the Morning habit to the same daily_logs row.
  // Without this the card would keep showing its pre-toggle state until a reload, so
  // the two views would disagree about the same record.
  useEffect(() => {
    function onChanged(e: Event) {
      const detail = (e as CustomEvent<{ date?: string }>).detail
      if (detail?.date && detail.date !== dateRef.current) return
      fetch(`/api/habits?date=${dateRef.current}`)
        .then(r => (r.ok ? r.json() : null))
        .then(data => {
          if (!data) return
          const { habits: db } = data as { habits: Record<string, unknown> }
          if (db && typeof db === 'object') setHabits(mergeFromDb(db))
        })
        .catch(err => console.error('[habits] external-change refetch error', err))
    }
    window.addEventListener('habits:changed', onChanged)
    return () => window.removeEventListener('habits:changed', onChanged)
  }, [])

  const save = useCallback(async (state: AllHabits) => {
    try {
      const res = await fetch('/api/habits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: dateRef.current, habits: state }),
      })
      if (!res.ok) {
        const body = await res.text()
        console.error('[habits] POST failed', res.status, body)
        throw new Error(`save failed: ${res.status}`)
      }
      pendingRef.current = null
      setSaveFailed(false)
    } catch (err) {
      console.error('[habits] save error', err)
      pendingRef.current = state
      setSaveFailed(true)
    }
  }, [])

  // Retry queue: fire on reconnect
  useEffect(() => {
    function handleOnline() {
      if (pendingRef.current) {
        save(pendingRef.current)
      }
    }
    window.addEventListener('online', handleOnline)
    return () => window.removeEventListener('online', handleOnline)
  }, [save])

  function applyAndSave(next: AllHabits) {
    dirtyRef.current = true
    const today = localDateKey()
    if (today !== dateRef.current) {
      // Date rolled over — discard the stale toggle, load fresh state for today
      dateRef.current = today
      const fresh = initState()
      setHabits(fresh)
      fetch(`/api/habits?date=${today}`)
        .then(r => r.json())
        .then(({ habits: db }) => {
          if (db && typeof db === 'object') setHabits(mergeFromDb(db))
        })
        .catch(err => console.error('[habits] day-rollover refetch error', err))
      return
    }
    setHabits(next)
    save(next)
  }

  function toggleSimple(id: string) {
    const next = { ...habits, [id]: { done: !habits[id].done } }
    applyAndSave(next)
    // When unchecking the nutrition habit, set a per-day suppression flag so
    // subsequent auto-syncs that day do not re-check it automatically.
    if (id === 'nutrition' && habits[id]?.done) {
      const date = dateRef.current
      fetch('/api/habits/suppress-nutrition', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date }),
      }).catch(err => console.error('[habits] suppress-nutrition error', err))
    }
  }

  function toggleStep(habitId: string, stepIdx: number) {
    const h = habits[habitId]
    const def = HABITS.find(x => x.id === habitId) as ExpandableHabit
    const steps = [...(h.steps ?? def.steps.map(() => false))]
    steps[stepIdx] = !steps[stepIdx]
    const done = steps.every(Boolean)
    const next = { ...habits, [habitId]: { done, steps } }
    applyAndSave(next)
  }

  function toggleExpand(id: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const count = HABITS.filter(h => habits[h.id]?.done).length
  const total = HABITS.length
  const pct = Math.round((count / total) * 100)

  const saveIndicator = saveFailed ? (
    <span
      style={{ color: 'oklch(0.7 0.18 30)', fontSize: 10.5, fontWeight: 600, letterSpacing: '0.02em' }}
      title="Save failed. Check console for details"
    >
      ⚠ unsaved
    </span>
  ) : null

  return (
    <Panel label="Habit Tracker" badge={`${count} / ${total}`} action={saveIndicator}>
      {/* Progress bar */}
      <div
        className="h-1 rounded-[3px] overflow-hidden mb-[9px]"
        style={{ background: 'oklch(1 0 0 / 0.08)' }}
      >
        <div
          className="h-full rounded-[3px] transition-[width] duration-[450ms]"
          style={{
            width: `${pct}%`,
            background: 'var(--acy)',
            boxShadow: '0 0 8px oklch(0.67 0.19 200 / 0.5)',
          }}
        />
      </div>

      {/* Habit grid */}
      <div className="grid grid-cols-3 gap-[6px]">
        {HABITS.map(h => {
          const state = habits[h.id]
          const on = state?.done ?? false
          const canExpand = isExpandable(h)
          const open = expanded.has(h.id)

          return (
            <div
              key={h.id}
              className={cn(
                'rounded-[8px] border overflow-hidden',
                canExpand && open ? 'col-span-3' : '',
              )}
              style={{
                background: on ? 'oklch(0.67 0.19 165 / 0.07)' : 'oklch(0 0 0 / 0.16)',
                borderColor: on ? 'oklch(0.67 0.19 165 / 0.22)' : 'oklch(1 0 0 / 0.07)',
              }}
            >
              {/* Parent row */}
              <button
                onClick={() => {
                  if (canExpand) {
                    toggleExpand(h.id)
                  } else {
                    toggleSimple(h.id)
                  }
                }}
                className="flex flex-row items-center px-2 py-[6px] gap-2 cursor-pointer select-none w-full text-left"
              >
                {/* Checkbox (non-expandable) or visual indicator (expandable) */}
                {!canExpand ? (
                  <div
                    className="w-[15px] h-[15px] rounded-[4px] flex-shrink-0 flex items-center justify-center transition-colors duration-150 border"
                    style={{
                      background: on ? 'var(--acy)' : 'transparent',
                      borderColor: on ? 'var(--acy)' : 'oklch(1 0 0 / 0.2)',
                    }}
                  >
                    {on && CHECK_ICON}
                  </div>
                ) : (
                  <div
                    className="w-[15px] h-[15px] rounded-[4px] flex-shrink-0 flex items-center justify-center border"
                    style={{
                      background: on ? 'var(--acy)' : 'transparent',
                      borderColor: on ? 'var(--acy)' : 'oklch(1 0 0 / 0.2)',
                    }}
                  >
                    {on && CHECK_ICON}
                  </div>
                )}
                <span
                  className="text-[10.5px] font-medium leading-[1.3] overflow-hidden text-ellipsis transition-colors duration-150 flex-1 whitespace-nowrap"
                  style={{ color: on ? 'var(--t3)' : '#fff', textDecoration: on ? 'line-through' : 'none' }}
                >
                  {h.label}
                </span>
                {canExpand && (
                  <span style={{ color: 'var(--t3)', flexShrink: 0 }}>
                    {CHEVRON(open)}
                  </span>
                )}
              </button>

              {/* Sub-steps */}
              {canExpand && open && (
                <div className="px-2 pb-[6px] flex flex-col gap-[4px]">
                  {(h as ExpandableHabit).steps.map((step, idx) => {
                    const stepOn = state?.steps?.[idx] ?? false
                    return (
                      <button
                        key={idx}
                        onClick={() => toggleStep(h.id, idx)}
                        className="flex flex-row items-center gap-2 cursor-pointer select-none text-left py-[3px]"
                      >
                        <div
                          className="w-[13px] h-[13px] rounded-[3px] flex-shrink-0 flex items-center justify-center border transition-colors duration-150"
                          style={{
                            background: stepOn ? 'var(--acy)' : 'transparent',
                            borderColor: stepOn ? 'var(--acy)' : 'oklch(1 0 0 / 0.2)',
                          }}
                        >
                          {stepOn && (
                            <svg width="8" height="8" viewBox="0 0 10 10" fill="none">
                              <path d="M2 5l2.5 2.5L8 3" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          )}
                        </div>
                        <span
                          className="text-[10.5px] leading-[1.3] transition-colors duration-150"
                          style={{
                            color: stepOn ? 'var(--t3)' : 'oklch(1 0 0 / 0.7)',
                            textDecoration: stepOn ? 'line-through' : 'none',
                          }}
                        >
                          {step}
                        </span>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </Panel>
  )
}
