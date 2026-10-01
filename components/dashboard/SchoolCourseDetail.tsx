'use client'

import { useEffect, useRef, useState, useMemo } from 'react'
import Link from 'next/link'
import { Panel } from './Panel'
import { SchoolItemRow } from './SchoolItemRow'
import { localDateKey, isWithinCompletionWeek } from '@/lib/date'
import type { CourseEntity, SchoolItemType, SchoolTask } from '@/lib/school-types'

const ITEM_TYPES: SchoolItemType[] = ['assignment', 'exam', 'quiz', 'project', 'milestone', 'lab', 'reading']
type StatusFilter = 'all' | 'open' | 'done'

export function SchoolCourseDetail({ courseId }: { courseId: string }) {
  const [course, setCourse] = useState<CourseEntity | null>(null)
  const [tasks, setTasks] = useState<SchoolTask[]>([])
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [error, setError] = useState(false)
  const [typeFilter, setTypeFilter] = useState<SchoolItemType | 'all'>('all')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('open')
  const [recentOpen, setRecentOpen] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newType, setNewType] = useState<SchoolItemType>('assignment')
  const [adding, setAdding] = useState(false)
  const dirtyRef = useRef(false)
  const todayKey = localDateKey()

  useEffect(() => {
    fetch(`/api/school/courses/${courseId}`)
      .then(async r => {
        if (r.status === 404) { setNotFound(true); return null }
        return r.json()
      })
      .then((body: { course: CourseEntity; tasks: SchoolTask[] } | null) => {
        if (!body) return
        if (!dirtyRef.current) {
          setCourse(body.course)
          setTasks(body.tasks ?? [])
        }
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [courseId])

  function onChanged(id: string, patch: Partial<SchoolTask>) {
    dirtyRef.current = true
    setTasks(prev => prev.map(t => (t.id === id ? { ...t, ...patch } : t)))
  }

  async function addItem() {
    if (!newTitle.trim() || adding || !course) return
    setAdding(true)
    dirtyRef.current = true
    try {
      const res = await fetch('/api/school/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newTitle.trim(),
          entity_id: course.id,
          item_type: newType,
        }),
      })
      const body = (await res.json()) as { ok?: boolean; task?: SchoolTask; error?: string }
      if (res.ok && body.task) {
        setTasks(prev => [...prev, body.task as SchoolTask])
        setNewTitle('')
        setAddOpen(false)
      }
    } finally {
      setAdding(false)
    }
  }

  const currentWorkingId = tasks.find(t => t.is_working)?.id ?? null

  const { active, recentlyCompleted, childrenByParent } = useMemo(() => {
    const childrenByParent = new Map<string, SchoolTask[]>()
    for (const t of tasks) {
      if (t.parent_task_id) {
        childrenByParent.set(t.parent_task_id, [...(childrenByParent.get(t.parent_task_id) ?? []), t])
      }
    }

    const topLevel = tasks.filter(t => !t.parent_task_id)
    const active: SchoolTask[] = []
    const recentlyCompleted: SchoolTask[] = []

    for (const t of topLevel) {
      if (isWithinCompletionWeek(t.completed_at, todayKey)) active.push(t)
      else recentlyCompleted.push(t)
    }
    return { active, recentlyCompleted, childrenByParent }
  }, [tasks, todayKey])

  const filtered = active.filter(t => {
    if (typeFilter !== 'all' && t.item_type !== typeFilter) return false
    if (statusFilter === 'open' && t.completed_at) return false
    if (statusFilter === 'done' && !t.completed_at) return false
    return true
  })

  if (loading) return <div className="text-[15px] py-[24px] text-center" style={{ color: 'var(--t3)' }}>Loading course…</div>
  if (notFound) return <div className="text-[15px] py-[24px] text-center" style={{ color: 'var(--t3)' }}>Course not found.</div>
  if (error || !course) return <div className="text-[15px] py-[24px] text-center" style={{ color: 'var(--t3)' }}>Couldn&apos;t load course.</div>

  const meta = course.metadata
  const strict = meta.policy_severity === 'strict'

  return (
    <div className="flex flex-col gap-[15px]">
      <Link href="/school" className="text-[14px]" style={{ color: 'var(--acy)' }}>← Back to School</Link>

      <Panel label={meta.title} badge={meta.semester}>
        <div className="grid gap-[15px]" style={{ gridTemplateColumns: '1fr 1fr' }}>
          <div className="flex flex-col gap-[10px]">
            <div>
              <div className="text-[11.5px] uppercase tracking-wider mb-[4px]" style={{ color: 'var(--t3)' }}>Grading breakdown</div>
              <div className="flex flex-col gap-[3px]">
                {meta.grading_breakdown.map((g, i) => (
                  <div key={i} className="flex justify-between text-[14px]">
                    <span style={{ color: 'var(--t1)' }}>{g.component}{g.note ? ` (${g.note})` : ''}</span>
                    <span style={{ color: 'var(--t3)', fontFamily: 'var(--font-jetbrains-mono, monospace)' }}>{g.weight}%</span>
                  </div>
                ))}
              </div>
              <div className="text-[11.5px] mt-[4px]" style={{ color: 'var(--t3)' }}>Reference only. No grade or score entry.</div>
            </div>

            <div>
              <div className="text-[11.5px] uppercase tracking-wider mb-[4px]" style={{ color: 'var(--t3)' }}>Required text</div>
              <div className="text-[14px]" style={{ color: 'var(--t1)' }}>{meta.required_text}</div>
            </div>

            <div>
              <div className="text-[11.5px] uppercase tracking-wider mb-[4px]" style={{ color: 'var(--t3)' }}>Office hours</div>
              <div className="text-[14px]" style={{ color: 'var(--t1)' }}>{meta.office_hours}</div>
            </div>
          </div>

          <div className="flex flex-col gap-[10px]">
            <div>
              <div className="text-[11.5px] uppercase tracking-wider mb-[4px] flex items-center gap-[6px]" style={{ color: 'var(--t3)' }}>
                Policies
                {strict && (
                  <span className="text-[10.5px] font-bold uppercase tracking-wider px-[6px] py-[1px] rounded-[4px]" style={{ background: 'oklch(0.65 0.22 25 / 0.15)', border: '1px solid oklch(0.65 0.22 25 / 0.45)', color: 'oklch(0.72 0.2 25)' }}>
                    ⚠ Strict
                  </span>
                )}
              </div>
              <ul className="flex flex-col gap-[4px]">
                {meta.policies.map((p, i) => (
                  <li key={i} className="text-[13px] leading-snug" style={{ color: strict ? 'oklch(0.82 0.1 25)' : 'var(--t2)' }}>
                    {strict ? '⚠ ' : '· '}{p}
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <div className="text-[11.5px] uppercase tracking-wider mb-[4px]" style={{ color: 'var(--t3)' }}>Topics / weekly schedule</div>
              <ul className="flex flex-col gap-[2px]">
                {meta.topics.map((t, i) => (
                  <li key={i} className="text-[12.5px]" style={{ color: 'var(--t2)' }}>{t}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </Panel>

      <Panel
        label="Tasks"
        badge={`${filtered.length} shown`}
        action={
          <div className="flex items-center gap-[6px]">
            <button
              type="button"
              onClick={() => setAddOpen(v => !v)}
              className="text-[12.5px] px-[6px] py-[3px] rounded-[5px] cursor-pointer"
              style={{ border: '1px solid oklch(1 0 0 / 0.1)', color: 'var(--acy)' }}
            >
              + Add item
            </button>
            <select
              value={typeFilter}
              onChange={e => setTypeFilter(e.target.value as SchoolItemType | 'all')}
              className="text-[12.5px] px-[6px] py-[3px] rounded-[5px] bg-transparent outline-none"
              style={{ border: '1px solid oklch(1 0 0 / 0.1)', color: 'var(--t1)' }}
            >
              <option value="all">All types</option>
              {ITEM_TYPES.map(it => <option key={it} value={it}>{it}</option>)}
            </select>
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value as StatusFilter)}
              className="text-[12.5px] px-[6px] py-[3px] rounded-[5px] bg-transparent outline-none"
              style={{ border: '1px solid oklch(1 0 0 / 0.1)', color: 'var(--t1)' }}
            >
              <option value="all">All</option>
              <option value="open">Open</option>
              <option value="done">Done</option>
            </select>
          </div>
        }
      >
        {addOpen && (
          <div className="flex items-center gap-[6px] mb-[10px] pb-[10px]" style={{ borderBottom: '1px solid oklch(1 0 0 / 0.08)' }}>
            <input
              type="text"
              value={newTitle}
              onChange={e => setNewTitle(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') void addItem() }}
              placeholder="New item title…"
              autoFocus
              className="flex-1 text-[14px] px-[8px] py-[5px] rounded-[5px] bg-transparent outline-none"
              style={{ border: '1px solid oklch(1 0 0 / 0.12)', color: 'var(--t1)' }}
            />
            <select
              value={newType}
              onChange={e => setNewType(e.target.value as SchoolItemType)}
              className="text-[12.5px] px-[6px] py-[5px] rounded-[5px] bg-transparent outline-none"
              style={{ border: '1px solid oklch(1 0 0 / 0.1)', color: 'var(--t1)' }}
            >
              {ITEM_TYPES.map(it => <option key={it} value={it}>{it}</option>)}
            </select>
            <button
              type="button"
              onClick={() => void addItem()}
              disabled={adding || !newTitle.trim()}
              className="text-[12.5px] px-[8px] py-[5px] rounded-[5px] cursor-pointer disabled:opacity-50"
              style={{ border: '1px solid oklch(1 0 0 / 0.1)', color: 'var(--t1)' }}
            >
              {adding ? 'Adding…' : 'Add'}
            </button>
          </div>
        )}

        {filtered.length === 0 ? (
          <div className="text-[14px] py-[16px] text-center" style={{ color: 'var(--t3)' }}>No items match this filter.</div>
        ) : (
          <div>
            {filtered.map(t => (
              <SchoolItemRow
                key={t.id}
                task={t}
                todayKey={todayKey}
                onChanged={onChanged}
                currentWorkingId={currentWorkingId}
                childTasks={childrenByParent.get(t.id)}
              />
            ))}
          </div>
        )}

        {recentlyCompleted.length > 0 && (
          <div className="mt-[10px] pt-[10px]" style={{ borderTop: '1px solid oklch(1 0 0 / 0.08)' }}>
            <button
              type="button"
              onClick={() => setRecentOpen(v => !v)}
              className="text-[12.5px] cursor-pointer"
              style={{ color: 'var(--t3)' }}
            >
              {recentOpen ? '▾' : '▸'} Recently Completed ({recentlyCompleted.length})
            </button>
            {recentOpen && (
              <div className="mt-[6px]">
                {recentlyCompleted.map(t => (
                  <SchoolItemRow
                    key={t.id}
                    task={t}
                    todayKey={todayKey}
                    onChanged={onChanged}
                    currentWorkingId={currentWorkingId}
                    childTasks={childrenByParent.get(t.id)}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </Panel>
    </div>
  )
}
