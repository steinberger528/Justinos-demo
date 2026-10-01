'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useResizable } from '@/lib/use-resizable'
import { ResizeHandles } from './ResizeHandles'
import { MORNING_HABIT, type HabitState } from './HabitCard'

/**
 * The Briefing modal on the Session card (Agentic OS B2.13).
 *
 * Five tabs over one day, with prev/next navigation: Today, Schedule, Yesterday,
 * Questions, Email. Data comes from GET /api/briefing in one round trip; weather is
 * the caller's (the top rail already has it), and the Morning habit is read and
 * written through /api/habits — the same row HabitCard uses, not a copy of its state.
 *
 * Email is a placeholder until Iris exists, and says so rather than pretending.
 */

const TABS = ['Today', 'Schedule', 'Yesterday', 'Questions', 'Email'] as const
type Tab = (typeof TABS)[number]

interface PlanBlock {
  start: string
  end: string
  type: string
  title: string
  task_titles?: string[]
}

interface Plan {
  date: string
  status: string
  generated_at: string | null
  finalized_at: string | null
  blocks: PlanBlock[]
  pushed: { task_id: string; reason: string; title: string | null }[]
}

interface BriefingData {
  date: string
  plan: Plan | null
  quote: { id: string; text: string; attribution: string } | null
  questions: { id: string; kind: string; question: string; answer: string | null }[]
  shape: {
    blocks: number
    work_blocks: number
    work_minutes: number
    task_count: number
    first_commitment: { title: string; start: string } | null
  }
  yesterday: { date: string; plan: Plan | null; completed: string[] }
}

interface BriefingModalProps {
  open: boolean
  onClose: () => void
  date: string
  onDateChange: (date: string) => void
  /** From the top rail's Open-Meteo hook, e.g. "78°F · Clear". */
  weather?: string | null
  /** Earliest event on the selected day, if the caller knows one. */
  firstAppointment?: { title: string; start: string } | null
}

const DAY_MS = 86_400_000
const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

function shiftDay(date: string, n: number): string {
  return dayKey(new Date(new Date(`${date}T12:00:00`).getTime() + n * DAY_MS))
}

function hhmm12(hhmm: string): string {
  const h = Number(hhmm.slice(0, 2))
  const m = hhmm.slice(3, 5)
  return `${h % 12 === 0 ? 12 : h % 12}:${m}${h < 12 ? 'am' : 'pm'}`
}

function prettyDate(date: string): string {
  return new Date(`${date}T12:00:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
}

function hours(min: number): string {
  const h = Math.floor(min / 60)
  const m = min % 60
  return h === 0 ? `${m}m` : m === 0 ? `${h}h` : `${h}h ${m}m`
}

const labelStyle: React.CSSProperties = {
  fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.08em',
  fontWeight: 700, color: 'var(--t3)',
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 12, padding: '7px 0', borderBottom: '1px solid oklch(1 0 0 / 0.06)' }}>
      <span style={{ ...labelStyle, width: 120, flexShrink: 0, paddingTop: 1 }}>{label}</span>
      <span style={{ fontSize: 12.5, color: 'var(--t1)', minWidth: 0 }}>{value}</span>
    </div>
  )
}

function Timeline({ plan, empty }: { plan: Plan | null; empty: string }) {
  if (!plan || plan.blocks.length === 0) {
    return <div style={{ fontSize: 12.5, color: 'var(--t3)', padding: '16px 0' }}>{empty}</div>
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {plan.blocks.map((b, i) => (
        <div key={i} style={{
          display: 'flex', gap: 12, padding: '8px 0',
          borderBottom: i === plan.blocks.length - 1 ? 'none' : '1px solid oklch(1 0 0 / 0.06)',
          opacity: b.type === 'fixed_event' ? 0.72 : 1,
        }}>
          <span style={{
            fontSize: 11.5, color: 'var(--t3)', width: 118, flexShrink: 0,
            fontFamily: 'var(--font-jetbrains-mono, monospace)',
          }}>
            {hhmm12(b.start)} – {hhmm12(b.end)}
          </span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--t1)' }}>{b.title}</div>
            {b.task_titles && b.task_titles.length > 0 && (
              <div style={{ fontSize: 11.5, color: 'var(--t2)', marginTop: 2 }}>{b.task_titles.join(' · ')}</div>
            )}
          </div>
        </div>
      ))}
      {plan.pushed.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <span style={labelStyle}>Pushed</span>
          <div style={{ fontSize: 12, color: 'var(--t2)', marginTop: 5 }}>
            {plan.pushed.map(p => p.title).filter(Boolean).join(', ') || '—'}
          </div>
        </div>
      )}
    </div>
  )
}

export function BriefingModal({ open, onClose, date, onDateChange, weather, firstAppointment }: BriefingModalProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const previouslyFocusedRef = useRef<HTMLElement | null>(null)

  const [tab, setTab] = useState<Tab>('Today')
  const [data, setData] = useState<BriefingData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // The whole habits object for the day, not just Morning: POST /api/habits
  // REPLACES habits wholesale, so writing a partial object here would wipe Gym,
  // Nutrition and the rest for that date.
  const [habits, setHabits] = useState<Record<string, HabitState>>({})

  const { size, startResize } = useResizable(
    'dashboard.modalSize.briefing',
    { width: 880, height: 700 },
    { width: 520, height: 420 },
  )

  const load = useCallback(async (d: string) => {
    setLoading(true)
    setError(null)
    try {
      const [bRes, hRes] = await Promise.all([
        fetch(`/api/briefing?date=${d}`, { credentials: 'include' }),
        fetch(`/api/habits?date=${d}`, { credentials: 'include' }),
      ])
      if (!bRes.ok) throw new Error(`briefing ${bRes.status}`)
      setData(await bRes.json() as BriefingData)
      if (hRes.ok) {
        const { habits: h } = await hRes.json() as { habits: Record<string, HabitState> }
        setHabits(h ?? {})
      }
    } catch (err) {
      setError((err as Error).message)
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!open) return
    // Standard data-fetching-effect shape, same as CalendarCard's: load() flips the
    // loading flag immediately and its own setState calls resolve it once the fetch
    // lands. Showing the spinner is exactly this effect's job, not a cascading render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load(date)
  }, [open, date, load])

  useEffect(() => {
    if (!open) return
    previouslyFocusedRef.current = document.activeElement as HTMLElement | null
    const t = setTimeout(() => containerRef.current?.focus(), 0)

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', onKeyDown, true)

    return () => {
      clearTimeout(t)
      window.removeEventListener('keydown', onKeyDown, true)
      previouslyFocusedRef.current?.focus?.()
    }
  }, [open, onClose])

  async function toggleMorningStep(idx: number) {
    const current = habits[MORNING_HABIT.id] ?? { done: false, steps: [] }
    const steps = [...(current.steps ?? [])]
    steps[idx] = !steps[idx]
    const done = MORNING_HABIT.steps.every((_, i) => steps[i])
    const next = { ...habits, [MORNING_HABIT.id]: { done, steps } }

    setHabits(next)
    try {
      const res = await fetch('/api/habits', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, habits: next }),
      })
      if (!res.ok) throw new Error(String(res.status))
      // HabitCard holds the same row in its own state; tell it to re-read rather
      // than letting the two drift until the next reload.
      window.dispatchEvent(new CustomEvent('habits:changed', { detail: { date } }))
    } catch {
      setHabits(habits) // put the optimistic toggle back
    }
  }

  if (!open) return null

  const morning = habits[MORNING_HABIT.id] ?? { done: false, steps: [] }
  const appt = firstAppointment ?? (data?.shape.first_commitment
    ? { title: data.shape.first_commitment.title, start: data.shape.first_commitment.start }
    : null)

  const navBtn: React.CSSProperties = {
    border: '1px solid oklch(1 0 0 / 0.1)', background: 'oklch(1 0 0 / 0.05)',
    color: 'var(--t2)', borderRadius: 6, width: 24, height: 24, cursor: 'pointer', fontSize: 13, lineHeight: 1,
  }

  return createPortal(
    <div
      style={{
        position: 'fixed', inset: 0, background: 'oklch(0 0 0 / 0.55)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-label="Briefing"
        tabIndex={-1}
        onClick={e => e.stopPropagation()}
        className="glass"
        style={{
          width: size.width, height: size.height,
          display: 'flex', flexDirection: 'column', borderRadius: 12, overflow: 'hidden',
          outline: 'none', position: 'relative',
          background: 'oklch(0.13 0.02 255 / 0.97)',
        }}
      >
        <ResizeHandles onStart={startResize} />

        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '13px 18px', borderBottom: '1px solid oklch(1 0 0 / 0.08)', flexShrink: 0, gap: 12,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--t1)' }}>Briefing</span>
            <button onClick={() => onDateChange(shiftDay(date, -1))} aria-label="Previous day" style={navBtn}>‹</button>
            <span style={{ fontSize: 12, color: 'var(--t2)', whiteSpace: 'nowrap' }}>{prettyDate(date)}</span>
            <button onClick={() => onDateChange(shiftDay(date, 1))} aria-label="Next day" style={navBtn}>›</button>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              border: '1px solid oklch(1 0 0 / 0.1)', background: 'oklch(1 0 0 / 0.05)',
              color: 'var(--t3)', borderRadius: 6, width: 26, height: 26, cursor: 'pointer', fontSize: 14, flexShrink: 0,
            }}
          >
            ×
          </button>
        </div>

        <div role="tablist" style={{ display: 'flex', gap: 2, padding: '8px 14px 0', flexShrink: 0 }}>
          {TABS.map(t => (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              style={{
                border: 'none', cursor: 'pointer', borderRadius: '6px 6px 0 0',
                padding: '6px 12px', fontSize: 12, fontWeight: tab === t ? 600 : 500,
                color: tab === t ? 'var(--t1)' : 'var(--t3)',
                background: tab === t ? 'oklch(1 0 0 / 0.07)' : 'transparent',
              }}
            >
              {t}
            </button>
          ))}
        </div>

        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '14px 20px 20px' }}>
          {loading && <div style={{ fontSize: 12.5, color: 'var(--t3)' }}>Loading…</div>}
          {error && <div style={{ fontSize: 12.5, color: 'oklch(0.7 0.19 25)' }}>Could not load the briefing: {error}</div>}

          {!loading && !error && data && (
            <>
              {tab === 'Today' && (
                <div>
                  <Row label="First up" value={appt ? `${appt.title} at ${hhmm12(appt.start)}` : 'Nothing fixed on the calendar'} />
                  <Row label="Weather" value={weather ?? '—'} />
                  <Row
                    label="The day"
                    value={data.plan
                      ? `${data.shape.work_blocks} work block${data.shape.work_blocks === 1 ? '' : 's'}, ${hours(data.shape.work_minutes)} of it, ${data.shape.task_count} task${data.shape.task_count === 1 ? '' : 's'} placed`
                      : 'No plan for this day'}
                  />
                  <Row label="Plan status" value={data.plan ? data.plan.status : '—'} />
                  {data.quote && (
                    <Row label="Quote" value={<em>{data.quote.text} <span style={{ color: 'var(--t3)' }}>({data.quote.attribution})</span></em>} />
                  )}

                  <div style={{ marginTop: 18 }}>
                    <span style={labelStyle}>Morning habit</span>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginTop: 8 }}>
                      {MORNING_HABIT.steps.map((step, i) => {
                        const on = !!morning.steps?.[i]
                        return (
                          <button
                            key={step}
                            onClick={() => void toggleMorningStep(i)}
                            style={{
                              cursor: 'pointer', borderRadius: 7, padding: '6px 11px', fontSize: 12,
                              color: on ? 'oklch(0.9 0.12 150)' : 'var(--t2)',
                              background: on ? 'oklch(0.7 0.18 150 / 0.16)' : 'oklch(1 0 0 / 0.05)',
                              border: `1px solid ${on ? 'oklch(0.7 0.18 150 / 0.45)' : 'oklch(1 0 0 / 0.1)'}`,
                            }}
                          >
                            {on ? '✓ ' : ''}{step}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                </div>
              )}

              {tab === 'Schedule' && <Timeline plan={data.plan} empty="No plan was built for this day." />}

              {tab === 'Yesterday' && (
                <div>
                  <Row label="Date" value={prettyDate(data.yesterday.date)} />
                  <Row
                    label="Completed"
                    value={data.yesterday.completed.length > 0 ? data.yesterday.completed.join(', ') : 'Nothing marked done'}
                  />
                  <div style={{ marginTop: 16 }}>
                    <span style={labelStyle}>What the day looked like</span>
                    <div style={{ marginTop: 6 }}>
                      <Timeline plan={data.yesterday.plan} empty="No plan was built that day." />
                    </div>
                  </div>
                </div>
              )}

              {tab === 'Questions' && (
                data.questions.length === 0
                  ? <div style={{ fontSize: 12.5, color: 'var(--t3)' }}>No questions were asked this morning.</div>
                  : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                      {data.questions.map(q => (
                        <div key={q.id}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                            <span style={{
                              ...labelStyle, fontSize: 9.5, padding: '2px 6px', borderRadius: 4,
                              background: 'oklch(1 0 0 / 0.07)', border: '1px solid oklch(1 0 0 / 0.1)',
                            }}>
                              {q.kind}
                            </span>
                            <span style={{ fontSize: 12.5, color: 'var(--t1)' }}>{q.question}</span>
                          </div>
                          <div style={{ fontSize: 12, color: q.answer ? 'var(--t2)' : 'var(--t3)', marginTop: 4, paddingLeft: 2 }}>
                            {q.answer ?? 'Unanswered'}
                          </div>
                        </div>
                      ))}
                    </div>
                  )
              )}

              {tab === 'Email' && (
                <div style={{ fontSize: 12.5, color: 'var(--t3)', padding: '20px 0', textAlign: 'center' }}>
                  Email is not connected yet. It arrives with Iris.
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
