'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { Panel } from './Panel'
import { FixedEventsModal } from './FixedEventsModal'
import { onCalendarChanged } from '@/lib/calendar-events'

// ── Types ──────────────────────────────────────────────────────────────────────

interface CalEvent {
  id: string
  title: string
  start: string
  end: string
  location?: string
  source?: 'google' | 'school' | 'plan'
  /** Plan blocks only: the block type (Gym/Lunch rules are 'rule'; task blocks are School, Career, …). */
  blockType?: string
  /** Plan blocks only: titles of the tasks inside the block. */
  tasks?: string[]
  /** Expanded occurrence of a recurring Google Calendar event (e.g. a weekly
   *  class) — its id is synthesized per-occurrence, not a real Google Calendar
   *  instance id, so dragging it would break or reschedule the whole series. */
  recurring?: boolean
}

type ViewMode = 'week' | 'month' | 'day'

// ── Constants ──────────────────────────────────────────────────────────────────

const DAY_LABELS    = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU']
const MONTH_SHORT   = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const MONTH_FULL    = ['January','February','March','April','May','June',
                       'July','August','September','October','November','December']
const DAY_SHORT     = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']

// Timeline (day view)
const DEFAULT_START_HOUR = 8
const DEFAULT_END_HOUR   = 22
// The timeline is scaled by the minute and scrolls inside a fixed viewport, rather
// than squeezing the whole day into TIMELINE_VIEWPORT px. At the old fixed 560px for
// an 8am–10pm day, a 15-minute buffer block came out 10px tall and was then clamped
// up to MIN_BLOCK_HEIGHT — so every short block visually bled ~18px into the block
// after it and the day looked like a pile of overlaps. At 0.95px/min a 15-minute
// block is ~14px on its own, so the clamp almost never fires.
const PX_PER_MIN         = 0.95
const TIMELINE_VIEWPORT  = 560
const MIN_BLOCK_HEIGHT   = 14

function timelineHeight(s: number, e: number): number {
  return Math.max(TIMELINE_VIEWPORT, Math.round((e - s) * PX_PER_MIN))
}

// ── Date helpers ───────────────────────────────────────────────────────────────

function getWeekStart(d: Date): Date {
  const r = new Date(d)
  r.setDate(r.getDate() + (r.getDay() === 0 ? -6 : 1 - r.getDay()))
  r.setHours(0, 0, 0, 0)
  return r
}

function getWeekDays(start: Date): Date[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start)
    d.setDate(d.getDate() + i)
    return d
  })
}

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() &&
         a.getMonth()    === b.getMonth()    &&
         a.getDate()     === b.getDate()
}

function toDateKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

function groupByDay(events: CalEvent[]): Map<string, CalEvent[]> {
  const map = new Map<string, CalEvent[]>()
  for (const ev of events) {
    const k = toDateKey(new Date(ev.start))
    map.set(k, [...(map.get(k) ?? []), ev])
  }
  return map
}

// ── Time helpers ───────────────────────────────────────────────────────────────

function hhmm(d: Date) {
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
}

function mmdd(d: Date) {
  return `${MONTH_SHORT[d.getMonth()]} ${d.getDate()}`
}

function duration(start: Date, end: Date) {
  const m = Math.round((end.getTime() - start.getTime()) / 60000)
  if (m < 60) return `${m} min`
  const h = m / 60
  return `${h % 1 === 0 ? h : h.toFixed(1)}h`
}

function hToMin(h: number) { return h * 60 }
function dToMin(d: Date)   { return d.getHours() * 60 + d.getMinutes() }

function visibleRange(events: CalEvent[]) {
  let s = hToMin(DEFAULT_START_HOUR), e = hToMin(DEFAULT_END_HOUR)
  for (const ev of events) {
    if (ev.source === 'school') continue // all-day chips, not timed blocks
    const es = dToMin(new Date(ev.start)), ee = dToMin(new Date(ev.end))
    if (es < s) s = Math.floor(es / 60) * 60
    if (ee > e) e = Math.ceil(ee  / 60) * 60
  }
  return { s, e }
}

function evPos(evS: Date, evE: Date, s: number, e: number, h: number) {
  const rng = e - s
  const ts  = Math.max(dToMin(evS), s)
  const te  = Math.min(dToMin(evE), e)
  return {
    top:    ((ts - s) / rng) * h,
    height: Math.max(((te - ts) / rng) * h, MIN_BLOCK_HEIGHT),
  }
}

function nowBarTop(s: number, e: number, h: number) {
  const n = dToMin(new Date())
  return ((Math.max(s, Math.min(e, n)) - s) / (e - s)) * h
}

/**
 * Side-by-side columns for events that genuinely overlap in time.
 *
 * Every block used to render `absolute left-0 right-0`, so two events at the same
 * hour were drawn exactly on top of each other and whichever sorted last simply hid
 * the other — the "blocks look duplicated / I can't tell what's what" problem.
 * Events are grouped into clusters of transitively-overlapping events; within a
 * cluster each event takes the first column free at its start time, and every event
 * in that cluster is drawn at 1/cols width so the columns line up.
 */
interface Lane { col: number; cols: number }

function layoutLanes(events: CalEvent[]): Map<string, Lane> {
  const out = new Map<string, Lane>()
  const sorted = [...events].sort((a, b) => {
    const d = new Date(a.start).getTime() - new Date(b.start).getTime()
    return d !== 0 ? d : new Date(b.end).getTime() - new Date(a.end).getTime()
  })

  let cluster: CalEvent[] = []
  let clusterEnd = -Infinity

  function flush() {
    if (cluster.length === 0) return
    const laneEnds: number[] = []
    const col = new Map<string, number>()
    for (const ev of cluster) {
      const s = new Date(ev.start).getTime()
      let i = laneEnds.findIndex(end => end <= s)
      if (i === -1) { i = laneEnds.length; laneEnds.push(0) }
      laneEnds[i] = new Date(ev.end).getTime()
      col.set(ev.id, i)
    }
    for (const ev of cluster) out.set(ev.id, { col: col.get(ev.id) ?? 0, cols: laneEnds.length })
    cluster = []
    clusterEnd = -Infinity
  }

  for (const ev of sorted) {
    const s = new Date(ev.start).getTime()
    const e = new Date(ev.end).getTime()
    if (cluster.length > 0 && s >= clusterEnd) flush()
    cluster.push(ev)
    clusterEnd = Math.max(clusterEnd, e)
  }
  flush()
  return out
}

function hrLabels(s: number, e: number): number[] {
  const out: number[] = []
  for (let h = Math.ceil(s / 60); h <= Math.floor(e / 60); h++) out.push(h)
  return out
}

function hrLabel(h: number) {
  return `${h === 0 ? 12 : h > 12 ? h - 12 : h}${h < 12 ? 'AM' : 'PM'}`
}


// ── Day plan (Neptune) ─────────────────────────────────────────────────────────

interface PlanBlock { start: string; end: string; type: string; title: string; task_ids?: string[]; task_titles?: string[] }
interface DayPlan { date: string; blocks: PlanBlock[] }

/**
 * The day plan is the source of truth for Neptune's blocks, so the card reads them
 * straight from day_plans (instant) instead of waiting for Google's iCal feed. The
 * same blocks are also on Google Calendar; the feed's copy is dropped so nothing
 * shows twice. Fixed-event blocks come from Google as they always have.
 *
 * Matching is by title alone, NOT title + exact start. Google serves the iCal feed
 * from a cache that can lag by hours, so after a replan moves a block the feed still
 * hands back the old copy at the old time — an exact-start match missed it and the
 * card drew both, which is most of what "duplicate blocks" looked like. A plan only
 * ever loads for a single day (see fetchEvents), so one title here means one block,
 * wherever the stale copy happens to sit. School due-date chips are exempt: they are
 * local task rows, never Google events, and share titles with the work inside blocks.
 */
function mergePlan(events: CalEvent[], plan: DayPlan | null, day: Date): CalEvent[] {
  if (!plan) return events
  const planEvents: CalEvent[] = plan.blocks
    .filter(b => b.type !== 'fixed_event')
    .map((b, i) => {
      const s = new Date(day); const [sh, sm] = b.start.split(':').map(Number); s.setHours(sh, sm, 0, 0)
      const e = new Date(day); const [eh, em] = b.end.split(':').map(Number); e.setHours(eh, em, 0, 0)
      return { id: `plan-${plan.date}-${i}`, title: b.title, start: s.toISOString(), end: e.toISOString(), source: 'plan' as const, blockType: b.type, tasks: b.task_titles ?? [] }
    })

  const planTitles = new Set(planEvents.map(p => p.title.trim().toLowerCase()))
  return [
    ...events.filter(ev => ev.source === 'school' || !planTitles.has(ev.title.trim().toLowerCase())),
    ...planEvents,
  ]
}

const PLAN_HUE: Record<string, number> = { School: 300, Career: 160, Computer: 240, Calls: 60, Errands: 30, Home: 120, rule: 200, anchor: 260, buffer: 0 }
function planColors(type: string | undefined) {
  const hue = PLAN_HUE[type ?? ''] ?? 200
  return { background: `oklch(0.72 0.14 ${hue} / 0.18)`, border: `1px solid oklch(0.72 0.14 ${hue} / 0.5)` }
}

// ── CalendarCard ───────────────────────────────────────────────────────────────

export function CalendarCard() {
  const today = useMemo(() => { const d = new Date(); d.setSeconds(0,0); return d }, [])

  const [view, setView]           = useState<ViewMode>('day')
  const [sel, setSel]             = useState<Date>(today)       // selected / nav anchor day
  const [byDay, setByDay]         = useState<Map<string, CalEvent[]>>(new Map())
  const [loading, setLoading]     = useState(true)
  const [connected, setConnected] = useState<boolean | null>(null)
  const [toast, setToast]         = useState<string | null>(null)
  const [nowBar, setNowBar]       = useState(0)

  const dragRef  = useRef<{ id: string; os: string; oe: string; y0: number; dMin: number } | null>(null)
  const dirtyRef = useRef(false)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const [dragOv, setDragOv]       = useState<{ id: string; dMin: number } | null>(null)
  const [fixedEventsOpen, setFixedEventsOpen] = useState(false)

  // ── Compute range from view + sel ────────────────────────────────────────

  const { rangeStart, rangeEnd, weekDays } = useMemo(() => {
    if (view === 'week') {
      const ws = getWeekStart(sel)
      const wd = getWeekDays(ws)
      return { rangeStart: ws, rangeEnd: wd[6], weekDays: wd }
    }
    if (view === 'month') {
      return {
        rangeStart: new Date(sel.getFullYear(), sel.getMonth(), 1),
        rangeEnd:   new Date(sel.getFullYear(), sel.getMonth() + 1, 0),
        weekDays:   [] as Date[],
      }
    }
    // day
    const d = new Date(sel); d.setHours(0,0,0,0)
    return { rangeStart: d, rangeEnd: d, weekDays: [] as Date[] }
  }, [view, sel])

  // ── Date title ────────────────────────────────────────────────────────────

  const dateTitle = useMemo(() => {
    if (view === 'week') {
      const s = rangeStart, e = rangeEnd
      return s.getMonth() === e.getMonth()
        ? `${MONTH_SHORT[s.getMonth()]} ${s.getDate()} – ${e.getDate()}`
        : `${MONTH_SHORT[s.getMonth()]} ${s.getDate()} – ${MONTH_SHORT[e.getMonth()]} ${e.getDate()}`
    }
    if (view === 'month') return `${MONTH_FULL[sel.getMonth()]} ${sel.getFullYear()}`
    return `${DAY_SHORT[sel.getDay()]}., ${MONTH_SHORT[sel.getMonth()]} ${sel.getDate()}`
  }, [view, sel, rangeStart, rangeEnd])

  // ── Fetch ─────────────────────────────────────────────────────────────────

  const fetchEvents = useCallback(async (start: Date, end: Date) => {
    try {
      const sameDay = toDateKey(start) === toDateKey(end)
      const [res, planRes] = await Promise.all([
        fetch(`/api/calendar?start=${toDateKey(start)}&end=${toDateKey(end)}`, { credentials: 'include' }),
        sameDay ? fetch(`/api/day-plans?date=${toDateKey(start)}`, { credentials: 'include' }) : Promise.resolve(null),
      ])
      if (!res.ok) { setConnected(false); return }
      const body = await res.json() as { events: CalEvent[] }
      const plan = planRes?.ok ? (await planRes.json() as { day_plan: DayPlan | null }).day_plan : null
      setConnected(true)
      if (!dirtyRef.current) setByDay(groupByDay(mergePlan(body.events ?? [], plan, start)))
    } catch {
      setConnected(false)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    // Standard data-fetching-effect shape: show the loading state immediately
    // when the requested range changes, then let fetchEvents' own setState
    // calls (setConnected/setByDay/setLoading) resolve it once the fetch lands.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true)
    void fetchEvents(rangeStart, rangeEnd)
    // rangeStart/rangeEnd change whenever view or sel changes — intentional
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, sel, fetchEvents])

  // Another card (the Session card's + Event form, the fixed-events modal, a replan
  // typed into the capture bar) changed what belongs on the calendar. Refetch the
  // range in view, same bare-event pattern as lib/task-events.ts.
  useEffect(
    () => onCalendarChanged(() => { void fetchEvents(rangeStart, rangeEnd) }),
    [fetchEvents, rangeStart, rangeEnd],
  )

  // ── Now-bar ticker ────────────────────────────────────────────────────────

  const dayEvs = useMemo(() => byDay.get(toDateKey(sel)) ?? [], [byDay, sel])
  const { s: rS, e: rE } = useMemo(() => visibleRange(dayEvs), [dayEvs])
  const tlH = useMemo(() => timelineHeight(rS, rE), [rS, rE])

  // Timed blocks share the timeline; school due-dates are local task rows the API
  // parks at a nominal 9:00–9:30, so several items due the same day landed exactly
  // on top of each other. They belong above the timeline as all-day chips.
  const timedEvs  = useMemo(() => dayEvs.filter(ev => ev.source !== 'school'), [dayEvs])
  const allDayEvs = useMemo(() => dayEvs.filter(ev => ev.source === 'school'), [dayEvs])
  const lanes     = useMemo(() => layoutLanes(timedEvs), [timedEvs])

  useEffect(() => {
    const tick = () => setNowBar(nowBarTop(rS, rE, tlH))
    tick(); const t = setInterval(tick, 30_000); return () => clearInterval(t)
  }, [rS, rE, tlH])

  // The timeline is taller than its viewport now, so opening today on a day that
  // starts at 7am would otherwise show the morning and hide where he actually is.
  // Scroll the current hour into the middle when the day view lands on today.
  useEffect(() => {
    const el = scrollRef.current
    if (!el || view !== 'day' || !isSameDay(sel, today)) return
    el.scrollTop = Math.max(0, nowBarTop(rS, rE, tlH) - TIMELINE_VIEWPORT / 2)
  }, [view, sel, today, rS, rE, tlH])

  // ── Toast ─────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 3500)
    return () => clearTimeout(t)
  }, [toast])

  // ── Navigation ────────────────────────────────────────────────────────────

  function navigate(dir: -1 | 1) {
    setSel(prev => {
      const d = new Date(prev)
      if (view === 'week')  d.setDate(d.getDate() + dir * 7)
      if (view === 'month') d.setMonth(d.getMonth() + dir)
      if (view === 'day')   d.setDate(d.getDate() + dir)
      return d
    })
  }

  function cycleView() {
    const order: ViewMode[] = ['week', 'month', 'day']
    setView(order[(order.indexOf(view) + 1) % 3])
  }

  // ── Drag (day view) ───────────────────────────────────────────────────────

  function onMouseDown(ev: CalEvent, e: React.MouseEvent) {
    // School-sourced entries are local task due-dates, not real Google Calendar
    // events — /api/calendar/reschedule only knows how to move gcal events, so
    // dragging is disabled for this source rather than firing a doomed request.
    // Recurring occurrences (e.g. a weekly class) carry a synthesized id, not a
    // real Google Calendar instance id — dragging one would either fail or
    // reschedule the entire series via the master event id, so it's disabled too.
    if (ev.source === 'school' || ev.source === 'plan' || ev.recurring) return
    e.preventDefault()
    dirtyRef.current = true
    dragRef.current = { id: ev.id, os: ev.start, oe: ev.end, y0: e.clientY, dMin: 0 }
    setDragOv({ id: ev.id, dMin: 0 })
  }

  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (!dragRef.current) return
      const rng  = rE - rS
      const dMin = Math.round((e.clientY - dragRef.current.y0) / tlH * rng / 15) * 15
      dragRef.current.dMin = dMin
      setDragOv({ id: dragRef.current.id, dMin })
    }

    async function onUp() {
      if (!dragRef.current) return
      const drag = dragRef.current
      dragRef.current = null; setDragOv(null)
      if (drag.dMin === 0) return

      const ns = new Date(new Date(drag.os).getTime() + drag.dMin * 60_000)
      const ne = new Date(new Date(drag.oe).getTime() + drag.dMin * 60_000)
      const k  = toDateKey(new Date(drag.os))

      const patch = (s: string, e: string) =>
        setByDay(prev => {
          const next = new Map(prev)
          next.set(k, (next.get(k) ?? []).map(ev => ev.id === drag.id ? { ...ev, start: s, end: e } : ev))
          return next
        })

      patch(ns.toISOString(), ne.toISOString())

      try {
        const res = await fetch('/api/calendar/reschedule', {
          method: 'POST', credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ eventId: drag.id, newStart: ns.toISOString(), newEnd: ne.toISOString() }),
        })
        if (!res.ok) {
          dirtyRef.current = false
          patch(drag.os, drag.oe)
          const b = await res.json().catch(() => ({})) as { error?: string }
          setToast(`Failed: ${b.error ?? 'unknown'}`)
          return
        }
        dirtyRef.current = false
        await fetchEvents(rangeStart, rangeEnd)
        setToast('Rescheduled')
      } catch {
        dirtyRef.current = false
        patch(drag.os, drag.oe)
        setToast('Reschedule failed')
      }
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  }, [rS, rE, tlH, fetchEvents, rangeStart, rangeEnd])

  // ── Derived ───────────────────────────────────────────────────────────────

  const totalEvents = useMemo(() => [...byDay.values()].reduce((n, a) => n + a.length, 0), [byDay])

  const dotColor = connected === null ? 'oklch(0.5 0 0)' : connected ? 'oklch(0.7 0.2 142)' : 'oklch(0.65 0.2 25)'

  const labelNode = (
    <span className="flex items-center gap-[6px]">
      <span className="inline-block w-[7px] h-[7px] rounded-full flex-shrink-0"
            style={{ background: dotColor, boxShadow: connected ? `0 0 5px ${dotColor}` : 'none', transition: 'background 0.4s' }} />
      Calendar
    </span>
  )

  // ── Sub-renders ───────────────────────────────────────────────────────────

  function WeekStrip() {
    return (
      <div className="grid gap-[3px]" style={{ gridTemplateColumns: 'repeat(7, 1fr)' }}>
        {weekDays.map((day, i) => {
          const k       = toDateKey(day)
          const hasEvs  = (byDay.get(k)?.length ?? 0) > 0
          const isToday = isSameDay(day, today)
          const isSel   = isSameDay(day, sel)

          return (
            <button key={k} onClick={() => setSel(day)}
              className="flex flex-col items-center py-[8px] px-[2px] rounded-[8px] transition-colors select-none gap-[1px]"
              style={{
                background: isSel ? 'var(--ac)' : isToday ? 'oklch(1 0 0 / 0.06)' : 'transparent',
                border: isSel ? '1px solid transparent' : isToday ? '1px solid oklch(1 0 0 / 0.1)' : '1px solid transparent',
              }}>
              <span className="text-[10.5px] uppercase font-semibold tracking-wider"
                    style={{ color: isSel ? 'oklch(0.05 0 0)' : isToday ? 'var(--ac)' : 'var(--t3)' }}>
                {DAY_LABELS[i]}
              </span>
              <span className="text-[15px] font-bold leading-none"
                    style={{ color: isSel ? 'oklch(0.05 0 0)' : isToday ? 'var(--ac)' : 'var(--t1)',
                             fontFamily: 'var(--font-jetbrains-mono, monospace)' }}>
                {day.getDate()}
              </span>
              <span className="w-[4px] h-[4px] rounded-full mt-[2px]"
                    style={{ background: hasEvs ? (isSel ? 'oklch(0.05 0 0)' : 'var(--ac)') : 'transparent' }} />
            </button>
          )
        })}
      </div>
    )
  }

  function EventList() {
    const selKey = toDateKey(sel)
    const all: CalEvent[] = []
    for (const evs of byDay.values()) all.push(...evs)
    all.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())

    const selEvs   = all.filter(ev => toDateKey(new Date(ev.start)) === selKey)
    const upcoming = all.filter(ev => {
      const d = new Date(ev.start)
      return toDateKey(d) !== selKey && d >= sel
    })

    const list = [...selEvs, ...upcoming]

    if (list.length === 0) return (
      <div className="text-[12px] py-[20px] text-center" style={{ color: 'var(--t3)' }}>No events this week</div>
    )

    return (
      <div>
        {list.map((ev, i) => {
          const start   = new Date(ev.start)
          const end     = new Date(ev.end)
          const isToday = toDateKey(start) === selKey
          const lbl     = isToday ? hhmm(start) : mmdd(start)
          const sub     = [ev.location, duration(start, end)].filter(Boolean).join(' · ')

          return (
            <div key={ev.id} className="flex gap-[12px] py-[10px]"
                 style={{ borderTop: i === 0 ? 'none' : '1px solid oklch(1 0 0 / 0.07)' }}>
              <div className="text-[11px] font-semibold flex-shrink-0 pt-[1px]"
                   style={{ width: 40, color: isToday ? 'var(--ac)' : 'var(--t3)',
                            fontFamily: 'var(--font-jetbrains-mono, monospace)' }}>
                {lbl}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[12px] font-semibold leading-tight truncate flex items-center gap-[6px]" style={{ color: 'var(--t1)' }}>
                  {ev.source === 'school' && (
                    <span
                      className="text-[10.5px] font-bold uppercase tracking-wider px-[5px] py-[1px] rounded-[4px] flex-shrink-0"
                      style={{ background: 'oklch(0.75 0.16 300 / 0.16)', border: '1px solid oklch(0.75 0.16 300 / 0.4)', color: 'oklch(0.8 0.13 300)' }}
                    >
                      School
                    </span>
                  )}
                  <span className="truncate">{ev.title}</span>
                </div>
                {sub && <div className="text-[10.5px] mt-[2px] truncate" style={{ color: 'var(--t3)' }}>{sub}</div>}
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  function MonthGrid() {
    const yr  = sel.getFullYear(), mo = sel.getMonth()
    const ws  = getWeekStart(new Date(yr, mo, 1))
    const end = new Date(yr, mo + 1, 0)
    const cells: Date[] = []
    const cur = new Date(ws)
    while (cur <= end || cells.length % 7 !== 0 || cells.length < 35) {
      cells.push(new Date(cur)); cur.setDate(cur.getDate() + 1)
      if (cells.length >= 42) break
    }

    return (
      <div>
        <div className="grid mb-[4px]" style={{ gridTemplateColumns: 'repeat(7, 1fr)' }}>
          {DAY_LABELS.map(l => (
            <div key={l} className="text-center text-[10.5px] uppercase font-semibold" style={{ color: 'var(--t3)' }}>{l}</div>
          ))}
        </div>
        <div className="grid gap-[2px]" style={{ gridTemplateColumns: 'repeat(7, 1fr)' }}>
          {cells.map((cell, i) => {
            const k       = toDateKey(cell)
            const hasEvs  = (byDay.get(k)?.length ?? 0) > 0
            const inMonth = cell.getMonth() === mo
            const isToday = isSameDay(cell, today)
            const isSel   = isSameDay(cell, sel)

            return (
              <button key={i} onClick={() => { setSel(cell); setView('day') }}
                className="flex flex-col items-center py-[5px] rounded-[5px] transition-colors"
                style={{ background: isSel ? 'var(--ac)' : isToday ? 'oklch(1 0 0 / 0.08)' : 'transparent',
                         opacity: inMonth ? 1 : 0.25 }}>
                <span className="text-[11px] font-semibold"
                      style={{ color: isSel ? 'oklch(0.05 0 0)' : isToday ? 'var(--ac)' : 'var(--t1)',
                               fontFamily: 'var(--font-jetbrains-mono, monospace)' }}>
                  {cell.getDate()}
                </span>
                <span className="w-[3px] h-[3px] rounded-full mt-[2px]"
                      style={{ background: hasEvs ? (isSel ? 'oklch(0.05 0 0)' : 'var(--ac)') : 'transparent' }} />
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  function DayTimeline() {
    const labels = hrLabels(rS, rE)
    const inView = dToMin(today) >= rS && dToMin(today) <= rE

    if (dayEvs.length === 0) return (
      <div className="text-[12px] py-[24px] text-center" style={{ color: 'var(--t3)' }}>
        No events on {MONTH_SHORT[sel.getMonth()]} {sel.getDate()}
      </div>
    )

    return (
      <>
      {allDayEvs.length > 0 && (
        <div className="flex flex-wrap gap-[4px] mb-[8px] pb-[8px]"
             style={{ borderBottom: '1px solid oklch(1 0 0 / 0.07)' }}>
          {allDayEvs.map(ev => (
            <span key={ev.id} className="text-[10.5px] leading-none px-[6px] py-[4px] rounded-[5px] truncate"
                  title={ev.location ? `${ev.title} · ${ev.location}` : ev.title}
                  style={{ maxWidth: '100%', background: 'oklch(0.75 0.16 300 / 0.16)',
                           border: '1px solid oklch(0.75 0.16 300 / 0.4)', color: 'oklch(0.85 0.1 300)' }}>
              🎓 {ev.title} <span style={{ opacity: 0.6 }}>due</span>
            </span>
          ))}
        </div>
      )}

      <div ref={scrollRef} className="overflow-y-auto overflow-x-hidden"
           style={{ maxHeight: TIMELINE_VIEWPORT }}>
      <div className="relative flex" style={{ height: tlH }}>
        {/* Hour labels */}
        <div className="relative flex-shrink-0" style={{ width: 36 }}>
          {labels.map(h => (
            <div key={h} className="absolute text-[10.5px] leading-none select-none"
                 style={{ top: ((hToMin(h)-rS)/(rE-rS))*tlH, right: 6,
                          transform: 'translateY(-50%)', fontFamily: 'var(--font-jetbrains-mono, monospace)', color: 'var(--t3)' }}>
              {hrLabel(h)}
            </div>
          ))}
        </div>

        <div className="relative flex-1" style={{ minWidth: 0 }}>
          {labels.map(h => (
            <div key={h} className="absolute left-0 right-0"
                 style={{ top: ((hToMin(h)-rS)/(rE-rS))*tlH, height: 1, background: 'oklch(1 0 0 / 0.06)' }} />
          ))}

          {isSameDay(sel, today) && inView && (
            <div className="absolute left-0 right-0 z-10 flex items-center" style={{ top: nowBar, pointerEvents: 'none' }}>
              <div className="w-[7px] h-[7px] rounded-full flex-shrink-0" style={{ background: 'var(--ac)', marginLeft: -3.5 }} />
              <div className="flex-1 h-[1.5px]" style={{ background: 'var(--ac)' }} />
            </div>
          )}

          {timedEvs.map(ev => {
            const es = new Date(ev.start), ee = new Date(ev.end)
            const ds = dragOv?.id === ev.id && dragOv.dMin !== 0 ? new Date(es.getTime() + dragOv.dMin*60_000) : es
            const de = dragOv?.id === ev.id && dragOv.dMin !== 0 ? new Date(ee.getTime() + dragOv.dMin*60_000) : ee
            const { top, height } = evPos(ds, de, rS, rE, tlH)
            const isDrag = dragRef.current?.id === ev.id
            const { col, cols } = lanes.get(ev.id) ?? { col: 0, cols: 1 }

            // Only what fits gets drawn: a 15-minute buffer has room for its title
            // and nothing else, so the time and task lines would otherwise overflow
            // into the block below and read as an overlap.
            const showTime  = height >= 32
            const showTasks = height >= 48

            return (
              <div key={ev.id} onMouseDown={e => onMouseDown(ev, e)}
                className="absolute rounded-[5px] px-[7px] py-[3px] overflow-hidden select-none"
                style={{ top, height,
                         left: `calc(${(col / cols) * 100}% + 2px)`,
                         width: `calc(${(1 / cols) * 100}% - 4px)`,
                         cursor: ev.source === 'plan' ? 'default' : 'grab', zIndex: isDrag ? 20 : 5,
                         ...(ev.source === 'plan' ? planColors(ev.blockType) : {}),
                         ...(ev.source === 'plan' ? {} : { background: isDrag ? 'oklch(0.67 0.19 240 / 0.45)' : 'oklch(0.67 0.19 240 / 0.28)',
                         border: '1px solid oklch(0.67 0.19 240 / 0.45)' }),
                         transition: isDrag ? 'none' : 'top 0.15s ease' }}>
                <div className="text-[11px] font-semibold leading-tight truncate" style={{ color: 'var(--t1)' }}>
                  {ev.title}
                </div>
                {showTime && (
                  <div className="text-[10.5px] leading-tight mt-[2px] truncate"
                       style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)', color: 'var(--t3)' }}>
                    {hhmm(ds)} – {hhmm(de)}{ev.location ? ` · ${ev.location}` : ''}
                  </div>
                )}
                {showTasks && ev.tasks && ev.tasks.length > 0 && (
                  <div className="text-[10.5px] leading-tight mt-[2px] truncate" style={{ color: 'var(--t2)' }}>{ev.tasks.join(' · ')}</div>
                )}
              </div>
            )
          })}
        </div>
      </div>
      </div>
      </>
    )
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
    <Panel
      label={labelNode}
      badge={loading ? '…' : `${totalEvents} event${totalEvents !== 1 ? 's' : ''}`}
      action={
        <button
          onClick={() => setFixedEventsOpen(true)}
          title="Manage fixed events"
          aria-label="Manage fixed events"
          className="w-[22px] h-[22px] flex items-center justify-center rounded-[5px] text-[12px] transition-colors"
          style={{ color: 'var(--t3)', background: 'oklch(1 0 0 / 0.05)', border: '1px solid oklch(1 0 0 / 0.1)' }}
        >
          📌
        </button>
      }
    >
      {toast && (
        <div className="mb-[8px] px-[10px] py-[5px] rounded-[6px] text-[11px]"
             style={{ background: 'oklch(0.45 0.19 200 / 0.3)', border: '1px solid oklch(0.6 0.19 200 / 0.4)', color: 'var(--t1)' }}>
          {toast}
        </div>
      )}

      {/* ── Navigation bar ────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-[14px]">
        <button onClick={() => navigate(-1)}
          className="w-[28px] h-[28px] flex items-center justify-center rounded-[6px] text-[16px] transition-colors"
          style={{ color: 'var(--t2)', background: 'oklch(1 0 0 / 0.05)' }}
          onMouseEnter={e => (e.currentTarget.style.background = 'oklch(1 0 0 / 0.1)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'oklch(1 0 0 / 0.05)')}>
          ‹
        </button>

        <button onClick={cycleView}
          className="flex items-center gap-[8px] px-[10px] py-[4px] rounded-[6px] transition-colors"
          onMouseEnter={e => (e.currentTarget.style.background = 'oklch(1 0 0 / 0.05)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
          <span className="text-[13px] font-semibold" style={{ color: 'var(--t1)' }}>{dateTitle}</span>
          <span className="text-[10.5px] font-bold uppercase tracking-wider px-[6px] py-[2px] rounded-[4px]"
                style={{ background: 'oklch(0.67 0.19 240 / 0.15)', border: '1px solid oklch(0.67 0.19 240 / 0.4)', color: 'var(--ac)' }}>
            {view}
          </span>
        </button>

        <button onClick={() => navigate(1)}
          className="w-[28px] h-[28px] flex items-center justify-center rounded-[6px] text-[16px] transition-colors"
          style={{ color: 'var(--t2)', background: 'oklch(1 0 0 / 0.05)' }}
          onMouseEnter={e => (e.currentTarget.style.background = 'oklch(1 0 0 / 0.1)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'oklch(1 0 0 / 0.05)')}>
          ›
        </button>
      </div>

      {/* ── Content ───────────────────────────────────────────────────── */}
      {loading ? (
        <div className="text-[12px] py-[16px] text-center" style={{ color: 'var(--t3)' }}>Loading…</div>
      ) : connected === false ? (
        <div className="text-[12px] py-[16px] text-center" style={{ color: 'var(--t3)' }}>Calendar unavailable</div>
      ) : view === 'week' ? (
        <>
          {/* eslint-disable-next-line react-hooks/static-components -- WeekStrip/EventList/MonthGrid/DayTimeline are closures over local render state (sel, byDay, drag refs, etc.); extracting them to module scope would require threading a large prop surface, so they're kept as in-render helper renders, same pattern as before this lint rule existed */}
          <WeekStrip />
          <div className="my-[10px]" style={{ height: 1, background: 'oklch(1 0 0 / 0.08)' }} />
          {/* eslint-disable-next-line react-hooks/static-components */}
          <EventList />
        </>
      ) : view === 'month' ? (
        // eslint-disable-next-line react-hooks/static-components
        <MonthGrid />
      ) : (
        // eslint-disable-next-line react-hooks/static-components
        <DayTimeline />
      )}
    </Panel>
    <FixedEventsModal open={fixedEventsOpen} onClose={() => setFixedEventsOpen(false)} />
    </>
  )
}
