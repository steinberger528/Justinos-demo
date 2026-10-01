'use client'

import { useEffect, useRef, useState, useMemo } from 'react'
import Link from 'next/link'
import { Panel } from './Panel'
import { SchoolItemRow, fmtDate, daysUntil } from './SchoolItemRow'
import { localDateKey, isWithinCompletionWeek } from '@/lib/date'
import type { CourseEntity, SchoolOverview, SchoolTask } from '@/lib/school-types'

const DAY_ORDER = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function courseTag(courses: CourseEntity[], entityId: string | null): string {
  if (!entityId) return '—'
  return courses.find(c => c.id === entityId)?.metadata.title ?? '—'
}

// ── Overview surface ──────────────────────────────────────────────────────────

type OverviewView = 'list' | 'calendar'

function ViewToggle({ view, onChange }: { view: OverviewView; onChange: (v: OverviewView) => void }) {
  const options: { key: OverviewView; label: string }[] = [
    { key: 'list', label: 'List' },
    { key: 'calendar', label: 'Calendar' },
  ]
  return (
    <div className="flex rounded-[6px] overflow-hidden" style={{ border: '1px solid oklch(1 0 0 / 0.1)' }}>
      {options.map(o => (
        <button
          key={o.key}
          type="button"
          onClick={() => onChange(o.key)}
          className="text-[11.5px] font-semibold uppercase tracking-wider px-[8px] py-[3px] cursor-pointer"
          style={{
            background: view === o.key ? 'oklch(0.67 0.19 165 / 0.18)' : 'transparent',
            color: view === o.key ? 'var(--acy)' : 'var(--t2)',
          }}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

function OverviewSurface({ tasks, courses, todayKey, onChanged, currentWorkingId }: {
  tasks: SchoolTask[]
  courses: CourseEntity[]
  todayKey: string
  onChanged: (id: string, patch: Partial<SchoolTask>) => void
  currentWorkingId: string | null
}) {
  const [view, setView] = useState<OverviewView>('list')

  const { overdue, upcoming, completedThisWeek } = useMemo(() => {
    const dated = tasks.filter(t => t.due_date)
    const open = dated.filter(t => !t.completed_at)
    const overdue = open.filter(t => t.due_date! < todayKey).sort((a, b) => a.due_date!.localeCompare(b.due_date!))
    const upcoming = open
      .filter(t => t.due_date! >= todayKey)
      .sort((a, b) => a.due_date!.localeCompare(b.due_date!))
      .slice(0, 8)
    // A completed item stays visible with done styling (via SchoolItemRow) through
    // the end of its completion week rather than vanishing on completion — same
    // week-boundary logic as SchoolCourseDetail's active/recentlyCompleted split
    // (extracted to lib/date.ts so it isn't duplicated a third time).
    const completedThisWeek = dated
      .filter(t => t.completed_at && isWithinCompletionWeek(t.completed_at, todayKey))
      .sort((a, b) => (b.completed_at ?? '').localeCompare(a.completed_at ?? ''))
    return { overdue, upcoming, completedThisWeek }
  }, [tasks, todayKey])

  const combined = [...overdue, ...upcoming, ...completedThisWeek]

  return (
    <Panel label="Nothing sneaks up on me" badge={`${overdue.length} overdue`} action={<ViewToggle view={view} onChange={setView} />}>
      {view === 'list' ? (
        combined.length === 0 ? (
          <div className="text-[14px] py-[16px] text-center" style={{ color: 'var(--t3)' }}>No school data seeded yet.</div>
        ) : (
          <div>
            {combined.map(t => (
              <SchoolItemRow
                key={t.id}
                task={t}
                courseLabel={courseTag(courses, t.entity_id)}
                todayKey={todayKey}
                onChanged={onChanged}
                currentWorkingId={currentWorkingId}
              />
            ))}
          </div>
        )
      ) : (
        <CalendarSurface tasks={tasks} courses={courses} todayKey={todayKey} onChanged={onChanged} currentWorkingId={currentWorkingId} />
      )}
    </Panel>
  )
}

// ── Overview calendar view ──────────────────────────────────────────────────
// Alternate presentation of the same "everything with a due date" data as the
// list above — a month grid instead of a chronological stack, for when the operator
// wants to see shape-of-the-month rather than a flat queue.

const MONTH_NAME = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const WEEKDAY_HEADERS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function calendarChipColor(t: SchoolTask, todayKey: string): string {
  if (t.completed_at) return 'oklch(0.6 0.02 255)'
  if (t.due_date && t.due_date < todayKey) return 'oklch(0.72 0.2 25)'
  if (t.item_type === 'exam' || t.item_type === 'quiz') return 'oklch(0.8 0.16 75)'
  return 'oklch(0.7 0.18 240)'
}

function CalendarSurface({ tasks, courses, todayKey, onChanged, currentWorkingId }: {
  tasks: SchoolTask[]
  courses: CourseEntity[]
  todayKey: string
  onChanged: (id: string, patch: Partial<SchoolTask>) => void
  currentWorkingId: string | null
}) {
  const [monthCursor, setMonthCursor] = useState(() => {
    const t = new Date(`${todayKey}T00:00:00`)
    return new Date(t.getFullYear(), t.getMonth(), 1)
  })
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const byDate = useMemo(() => {
    const map = new Map<string, SchoolTask[]>()
    for (const t of tasks) {
      if (!t.due_date) continue
      const list = map.get(t.due_date) ?? []
      list.push(t)
      map.set(t.due_date, list)
    }
    return map
  }, [tasks])

  const year = monthCursor.getFullYear()
  const month = monthCursor.getMonth()
  const startWeekday = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const totalCells = Math.ceil((startWeekday + daysInMonth) / 7) * 7

  const cells = useMemo(() => {
    const out: { dateKey: string; dayNum: number; inMonth: boolean }[] = []
    for (let i = 0; i < totalCells; i++) {
      const d = new Date(year, month, i - startWeekday + 1)
      out.push({ dateKey: localDateKey(d), dayNum: d.getDate(), inMonth: d.getMonth() === month })
    }
    return out
  }, [year, month, startWeekday, totalCells])

  const selectedTask = selectedId ? tasks.find(t => t.id === selectedId) ?? null : null

  return (
    <div>
      <div className="flex items-center justify-between mb-[10px]">
        <button
          type="button"
          onClick={() => setMonthCursor(new Date(year, month - 1, 1))}
          className="text-[15px] px-[8px] py-[2px] rounded-[5px] cursor-pointer"
          style={{ color: 'var(--t2)', background: 'oklch(1 0 0 / 0.05)' }}
        >
          ‹
        </button>
        <span className="text-[14px] font-semibold" style={{ color: 'var(--t1)' }}>{MONTH_NAME[month]} {year}</span>
        <button
          type="button"
          onClick={() => setMonthCursor(new Date(year, month + 1, 1))}
          className="text-[15px] px-[8px] py-[2px] rounded-[5px] cursor-pointer"
          style={{ color: 'var(--t2)', background: 'oklch(1 0 0 / 0.05)' }}
        >
          ›
        </button>
      </div>

      <div className="grid grid-cols-7 gap-[4px]">
        {WEEKDAY_HEADERS.map(d => (
          <div key={d} className="text-center text-[10.5px] uppercase tracking-wider" style={{ color: 'var(--t3)' }}>{d}</div>
        ))}
        {cells.map(cell => {
          const items = byDate.get(cell.dateKey) ?? []
          const isToday = cell.dateKey === todayKey
          return (
            <div
              key={cell.dateKey}
              className="rounded-[6px] p-[4px]"
              style={{
                minHeight: 62,
                background: isToday ? 'oklch(0.67 0.19 240 / 0.1)' : 'oklch(1 0 0 / 0.02)',
                border: isToday ? '1px solid oklch(0.67 0.19 240 / 0.4)' : '1px solid oklch(1 0 0 / 0.06)',
                opacity: cell.inMonth ? 1 : 0.35,
              }}
            >
              <div className="text-[10.5px]" style={{ color: 'var(--t3)' }}>{cell.dayNum}</div>
              <div className="flex flex-col gap-[2px] mt-[2px]">
                {items.slice(0, 3).map(t => {
                  const color = calendarChipColor(t, todayKey)
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setSelectedId(id => (id === t.id ? null : t.id))}
                      title={t.title}
                      className="text-[10.5px] truncate text-left px-[4px] py-[1px] rounded-[3px] cursor-pointer"
                      style={{
                        background: color.replace(')', ' / 0.15)'),
                        color,
                        textDecoration: t.completed_at ? 'line-through' : 'none',
                      }}
                    >
                      {t.title}
                    </button>
                  )
                })}
                {items.length > 3 && (
                  <span className="text-[10.5px]" style={{ color: 'var(--t3)' }}>+{items.length - 3} more</span>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {selectedTask && (
        <div className="mt-[12px]">
          <SchoolItemRow
            task={selectedTask}
            courseLabel={courseTag(courses, selectedTask.entity_id)}
            todayKey={todayKey}
            onChanged={onChanged}
            currentWorkingId={currentWorkingId}
            forceOpen
            onToggleOpen={() => setSelectedId(null)}
          />
        </div>
      )}
    </div>
  )
}

// ── Exam Center ────────────────────────────────────────────────────────────
// Dedicated surface for exams/quizzes specifically — separate from the
// general "everything due" Overview, since exam prep (topic checklists,
// the study-plan slot) benefits from its own focused list.

// Urgency zones — spatial isolation, not just color, is the mechanism that
// research (docs/research/2026-08-24-glanceable-deadline-design-research.md)
// found actually works: the "This Week" zone is its own physically separate,
// biggest region, not a differently-colored row in one shared list.
type Zone = 'overdue' | 'thisWeek' | 'nextTwoWeeks' | 'later'

function zoneFor(daysLeft: number): Zone {
  if (daysLeft < 0) return 'overdue'
  if (daysLeft <= 6) return 'thisWeek'
  if (daysLeft <= 20) return 'nextTwoWeeks'
  return 'later'
}

const ZONE_META: Record<Zone, { label: string; wash: string; border: string }> = {
  overdue: { label: 'Overdue', wash: 'oklch(0.6 0.22 25 / 0.1)', border: 'oklch(0.6 0.22 25 / 0.4)' },
  thisWeek: { label: 'This Week', wash: 'oklch(0.65 0.2 25 / 0.06)', border: 'oklch(0.65 0.2 25 / 0.25)' },
  nextTwoWeeks: { label: 'Next 2 Weeks', wash: 'oklch(0.78 0.16 75 / 0.05)', border: 'oklch(0.78 0.16 75 / 0.2)' },
  later: { label: 'Later This Semester', wash: 'transparent', border: 'oklch(1 0 0 / 0.08)' },
}

function ExamCenterSurface({ tasks, courses, todayKey, onChanged, currentWorkingId }: {
  tasks: SchoolTask[]
  courses: CourseEntity[]
  todayKey: string
  onChanged: (id: string, patch: Partial<SchoolTask>) => void
  currentWorkingId: string | null
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [laterOpen, setLaterOpen] = useState(false)

  const { zones, undated, doneCount } = useMemo(() => {
    const items = tasks.filter(t => t.item_type === 'exam' || t.item_type === 'quiz')
    const open = items.filter(t => !t.completed_at)
    const dated = open.filter(t => t.due_date)
    const undated = open.filter(t => !t.due_date)

    const zones: Record<Zone, SchoolTask[]> = { overdue: [], thisWeek: [], nextTwoWeeks: [], later: [] }
    for (const t of dated) {
      const d = daysUntil(t.due_date!, todayKey)
      zones[zoneFor(d)].push(t)
    }
    for (const z of Object.keys(zones) as Zone[]) zones[z].sort((a, b) => a.due_date!.localeCompare(b.due_date!))

    return { zones, undated, doneCount: items.filter(t => !!t.completed_at).length }
  }, [tasks, todayKey])

  // "Upcoming" only counts items with a real date obligation — an undated
  // item isn't upcoming in any date sense, so it's shown separately below
  // but doesn't inflate this count.
  const totalUpcoming = zones.overdue.length + zones.thisWeek.length + zones.nextTwoWeeks.length + zones.later.length

  function tileRow(items: SchoolTask[]) {
    return (
      <div className="flex flex-wrap gap-[10px]">
        {items.map(t => (
          <SchoolItemRow
            key={t.id}
            task={t}
            variant="tile"
            courseLabel={courseTag(courses, t.entity_id)}
            todayKey={todayKey}
            onChanged={onChanged}
            currentWorkingId={currentWorkingId}
            forceOpen={expandedId === t.id}
            onToggleOpen={() => setExpandedId(id => (id === t.id ? null : t.id))}
          />
        ))}
      </div>
    )
  }

  return (
    <Panel label="Exam Center" badge={`${totalUpcoming} upcoming`}>
      {totalUpcoming === 0 && undated.length === 0 ? (
        <div className="text-[14px] py-[16px] text-center" style={{ color: 'var(--t3)' }}>No upcoming exams or quizzes.</div>
      ) : (
        <div className="flex flex-col gap-[14px]">
          {zones.overdue.length > 0 && (
            <div className="rounded-[10px] p-[10px]" style={{ background: ZONE_META.overdue.wash, border: `1px solid ${ZONE_META.overdue.border}` }}>
              <div className="text-[12.5px] font-bold uppercase tracking-wider mb-[8px]" style={{ color: 'oklch(0.72 0.2 25)' }}>⚠ {ZONE_META.overdue.label}</div>
              {tileRow(zones.overdue)}
            </div>
          )}

          {zones.thisWeek.length > 0 && (
            <div className="rounded-[10px] p-[10px]" style={{ background: ZONE_META.thisWeek.wash, border: `1px solid ${ZONE_META.thisWeek.border}` }}>
              <div className="text-[12.5px] font-bold uppercase tracking-wider mb-[8px]" style={{ color: 'oklch(0.75 0.19 40)' }}>{ZONE_META.thisWeek.label}</div>
              {tileRow(zones.thisWeek)}
            </div>
          )}

          {zones.nextTwoWeeks.length > 0 && (
            <div className="rounded-[10px] p-[10px]" style={{ background: ZONE_META.nextTwoWeeks.wash, border: `1px solid ${ZONE_META.nextTwoWeeks.border}` }}>
              <div className="text-[12.5px] font-bold uppercase tracking-wider mb-[8px]" style={{ color: 'oklch(0.8 0.16 75)' }}>{ZONE_META.nextTwoWeeks.label}</div>
              {tileRow(zones.nextTwoWeeks)}
            </div>
          )}

          {zones.later.length > 0 && (
            <div>
              <button
                type="button"
                onClick={() => setLaterOpen(v => !v)}
                className="text-[12.5px] font-semibold uppercase tracking-wider cursor-pointer mb-[8px]"
                style={{ color: 'var(--t2)' }}
              >
                {laterOpen ? '▾' : '▸'} {ZONE_META.later.label} ({zones.later.length})
              </button>
              {laterOpen && tileRow(zones.later)}
            </div>
          )}

          {undated.length > 0 && (
            <div>
              <div className="text-[12.5px] font-semibold uppercase tracking-wider mb-[8px]" style={{ color: 'var(--t2)' }}>No date yet</div>
              {tileRow(undated)}
            </div>
          )}
        </div>
      )}
      {doneCount > 0 && (
        <div className="text-[12.5px] mt-[10px]" style={{ color: 'var(--t2)' }}>{doneCount} completed this semester</div>
      )}
    </Panel>
  )
}

// ── Weekly schedule grid ────────────────────────────────────────────────────
// A real time-axis calendar (not just a list) so gaps between classes are
// visually obvious, plus a live "now" line to show where in the day you are.

const DEFAULT_DAY_START_MIN = 7 * 60   // 7:00 AM
const DEFAULT_DAY_END_MIN = 22 * 60    // 10:00 PM
const ROW_HEIGHT = 52                  // px per hour
const TIME_AXIS_WIDTH = 46

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

function formatHour(h: number): string {
  const period = h >= 12 ? 'PM' : 'AM'
  const hour12 = h % 12 === 0 ? 12 : h % 12
  return `${hour12} ${period}`
}

function useNowClock(): { day: string; minutes: number } {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(id)
  }, [])
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  return { day: dayNames[now.getDay()], minutes: now.getHours() * 60 + now.getMinutes() }
}

function ScheduleSurface({ courses }: { courses: CourseEntity[] }) {
  const byDay = useMemo(() => {
    const map = new Map<string, { title: string; room: string; start: string; end: string }[]>()
    for (const d of DAY_ORDER) map.set(d, [])
    for (const c of courses) {
      for (const block of c.metadata.schedule ?? []) {
        for (const day of block.day) {
          const entries = map.get(day)
          if (entries) entries.push({ title: c.metadata.title, room: block.room, start: block.start, end: block.end })
        }
      }
    }
    return map
  }, [courses])

  const { day: nowDay, minutes: nowMin } = useNowClock()

  // Days shown = Mon–Fri, extended to include Sat/Sun only if a course
  // actually meets then — avoids clutter in the common case while never
  // silently dropping a weekend class.
  const days = useMemo(() => {
    const weekend = ['Sat', 'Sun'].filter(d => (byDay.get(d) ?? []).length > 0)
    return [...DAY_ORDER.slice(0, 5), ...weekend]
  }, [byDay])

  // Time range = the wider of the default 7am–10pm window and whatever the
  // actual course blocks need, rounded to whole hours — a class outside the
  // default window still gets a fully on-grid, unclipped slot.
  const { rangeStart, rangeEnd } = useMemo(() => {
    let min = DEFAULT_DAY_START_MIN
    let max = DEFAULT_DAY_END_MIN
    for (const entries of byDay.values()) {
      for (const b of entries) {
        min = Math.min(min, Math.floor(toMinutes(b.start) / 60) * 60)
        max = Math.max(max, Math.ceil(toMinutes(b.end) / 60) * 60)
      }
    }
    return { rangeStart: min, rangeEnd: max }
  }, [byDay])

  const totalMin = rangeEnd - rangeStart
  const gridHeight = (totalMin / 60) * ROW_HEIGHT
  const gridCols = `repeat(${days.length}, 1fr)`
  const hours: number[] = []
  for (let h = rangeStart / 60; h <= rangeEnd / 60; h++) hours.push(h)

  const nowTop = ((nowMin - rangeStart) / totalMin) * gridHeight
  const showNowLine = days.includes(nowDay) && nowMin >= rangeStart && nowMin <= rangeEnd

  // Narrower now that it's one of three columns rather than most of the page
  // width — scrolls horizontally instead of squeezing day columns illegible,
  // with the time axis pinned so hours stay visible while scrolling.
  const minGridWidth = TIME_AXIS_WIDTH + days.length * 64

  return (
    <Panel label="Weekly Schedule" badge={`${courses.length} courses`}>
      <div className="overflow-x-auto">
      <div className="flex flex-col" style={{ minWidth: minGridWidth }}>
        {/* Day header row */}
        <div className="flex">
          <div style={{ width: TIME_AXIS_WIDTH, flexShrink: 0 }} />
          <div className="flex-1 grid" style={{ gridTemplateColumns: gridCols }}>
            {days.map(day => (
              <div
                key={day}
                className="text-[11.5px] uppercase font-semibold tracking-wider text-center py-[4px]"
                style={{ color: day === nowDay ? 'var(--ac)' : 'var(--t1)' }}
              >
                {day}
              </div>
            ))}
          </div>
        </div>

        {/* Time-axis + day columns */}
        <div className="flex" style={{ height: gridHeight }}>
          <div className="relative flex-shrink-0 sticky left-0 z-10" style={{ width: TIME_AXIS_WIDTH, background: 'var(--glass)' }}>
            {hours.map(h => (
              <div
                key={h}
                className="absolute w-full pr-[6px] text-right text-[10.5px]"
                style={{ top: ((h - rangeStart / 60) / (totalMin / 60)) * gridHeight - 5, color: 'var(--t2)' }}
              >
                {formatHour(h)}
              </div>
            ))}
          </div>

          <div className="flex-1 grid relative" style={{ gridTemplateColumns: gridCols }}>
            {/* Hour gridlines */}
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                backgroundImage: `repeating-linear-gradient(to bottom, oklch(1 0 0 / 0.07) 0, oklch(1 0 0 / 0.07) 1px, transparent 1px, transparent ${ROW_HEIGHT}px)`,
              }}
            />

            {days.map(day => {
              const isToday = day === nowDay
              return (
                <div
                  key={day}
                  className="relative"
                  style={{ borderLeft: '1px solid oklch(1 0 0 / 0.07)', background: isToday ? 'oklch(0.67 0.19 240 / 0.06)' : 'transparent' }}
                >
                  {(byDay.get(day) ?? []).map((b, i) => {
                    const top = ((toMinutes(b.start) - rangeStart) / totalMin) * gridHeight
                    const height = Math.max(((toMinutes(b.end) - toMinutes(b.start)) / totalMin) * gridHeight, 28)
                    return (
                      <div
                        key={i}
                        className="absolute left-[2px] right-[2px] rounded-[6px] px-[6px] py-[4px] overflow-hidden"
                        style={{ top, height, background: 'oklch(0.67 0.19 240 / 0.18)', border: '1px solid oklch(0.67 0.19 240 / 0.45)' }}
                        title={`${b.title} · ${b.room} · ${b.start} to ${b.end}`}
                      >
                        <div className="text-[11.5px] font-semibold leading-tight truncate" style={{ color: 'var(--t1)' }}>{b.title}</div>
                        <div className="text-[10.5px] mt-[2px]" style={{ color: 'var(--t1)', fontFamily: 'var(--font-jetbrains-mono, monospace)' }}>{b.start}–{b.end}</div>
                        <div className="text-[10.5px] truncate" style={{ color: 'var(--t2)' }}>{b.room}</div>
                      </div>
                    )
                  })}
                </div>
              )
            })}

            {/* Live "now" bar */}
            {showNowLine && (
              <div className="absolute left-0 right-0 pointer-events-none" style={{ top: nowTop, zIndex: 5 }}>
                <div style={{ height: 2, background: 'oklch(0.72 0.2 25)', boxShadow: '0 0 6px oklch(0.72 0.2 25 / 0.7)' }} />
                <div
                  className="absolute rounded-full"
                  style={{ left: -3, top: -3, width: 8, height: 8, background: 'oklch(0.72 0.2 25)', boxShadow: '0 0 5px oklch(0.72 0.2 25 / 0.8)' }}
                />
              </div>
            )}
          </div>
        </div>
      </div>
      </div>
    </Panel>
  )
}

// ── Course bar ─────────────────────────────────────────────────────────────
// One horizontal strip at the top of the tab — click a course to go deeper.
// Everything else (schedule/overview/exam center) lives in the 3-column area
// below it, so this bar is the single "pick a course" entry point rather
// than a fourth block competing for column space.

function CourseBar({ courses, tasks }: { courses: CourseEntity[]; tasks: SchoolTask[] }) {
  return (
    <Panel label="Courses" badge={`${courses.length}`}>
      <div className="flex flex-wrap gap-[10px]">
        {courses.map(c => {
          const courseTasks = tasks.filter(t => t.entity_id === c.id)
          const open = courseTasks.filter(t => !t.completed_at)
          const next = open.filter(t => t.due_date).sort((a, b) => a.due_date!.localeCompare(b.due_date!))[0]
          return (
            <Link
              key={c.id}
              href={`/school/${c.id}`}
              className="flex-1 flex items-center gap-[10px] px-[12px] py-[10px] rounded-[8px] cursor-pointer transition-colors"
              style={{ background: 'oklch(1 0 0 / 0.03)', border: '1px solid oklch(1 0 0 / 0.08)', minWidth: 220 }}
            >
              <div className="flex-1 min-w-0">
                <div className="text-[15px] font-semibold truncate" style={{ color: 'var(--t1)' }} title={c.metadata.title}>{c.metadata.title}</div>
                <div className="text-[12.5px] mt-[2px] truncate" style={{ color: 'var(--t2)' }}>
                  {next ? `Next: ${next.title} (${fmtDate(next.due_date!)})` : 'No open items'}
                </div>
              </div>
              <span className="text-[11.5px] font-semibold px-[8px] py-[3px] rounded-[10px] flex-shrink-0" style={{ background: 'oklch(1 0 0 / 0.06)', color: 'var(--t2)' }}>
                {open.length} open
              </span>
            </Link>
          )
        })}
      </div>
    </Panel>
  )
}

// ── SchoolTab (top-level) ─────────────────────────────────────────────────────

export function SchoolTab() {
  const [courses, setCourses] = useState<CourseEntity[]>([])
  const [tasks, setTasks] = useState<SchoolTask[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const dirtyRef = useRef(false)
  const todayKey = localDateKey()

  useEffect(() => {
    fetch('/api/school/overview')
      .then(r => r.json())
      .then((body: SchoolOverview) => {
        if (!dirtyRef.current) {
          setCourses(body.courses ?? [])
          setTasks(body.tasks ?? [])
        }
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [])

  function onChanged(id: string, patch: Partial<SchoolTask>) {
    dirtyRef.current = true
    setTasks(prev => prev.map(t => (t.id === id ? { ...t, ...patch } : t)))
  }

  const currentWorkingId = tasks.find(t => t.is_working)?.id ?? null

  if (loading) {
    return <div className="text-[15px] py-[24px] text-center" style={{ color: 'var(--t3)' }}>Loading School…</div>
  }

  if (error) {
    return <div className="text-[15px] py-[24px] text-center" style={{ color: 'var(--t3)' }}>Couldn&apos;t load School data.</div>
  }

  return (
    // This page is deliberately set to read bigger: its text sizes
    // are ~15% above the rest of the app (they used to come from a
    // `zoom: 1.15` wrapper, removed along with the app-wide zoom).
    <div className="flex flex-col gap-[15px]">
      <CourseBar courses={courses} tasks={tasks} />

      {/* Overview's row (type badge + title + course + date + countdown badge +
          status, all inline) needs more room than a 1/3 column gives it at the
          boosted size — the trailing badges clipped there. Full-width fixes
          that; Schedule + Exam Center are compact widgets that read fine
          paired in a narrower column. */}
      <OverviewSurface tasks={tasks} courses={courses} todayKey={todayKey} onChanged={onChanged} currentWorkingId={currentWorkingId} />

      <div className="layout-2">
        <ScheduleSurface courses={courses} />
        <ExamCenterSurface tasks={tasks} courses={courses} todayKey={todayKey} onChanged={onChanged} currentWorkingId={currentWorkingId} />
      </div>

      {courses.length === 0 && (
        <div className="text-[14px] py-[16px] text-center" style={{ color: 'var(--t3)' }}>
          No courses yet.
        </div>
      )}
    </div>
  )
}
