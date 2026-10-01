'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Panel } from './Panel'
import { localDateKey } from '@/lib/date'
import type { Briefing, BriefingItem, DecisionStatus } from './crm-types'

/**
 * Returns today's date string (YYYY-MM-DD) in the browser's local timezone,
 * matching the localDateKey() convention used server-side.
 */

function fmtDate(dateStr: string): string {
  const [y, m, day] = dateStr.split('-').map(Number)
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    .format(new Date(y, m - 1, day))
}

function prevDate(dateStr: string): string {
  const d = new Date(dateStr)
  d.setDate(d.getDate() - 1)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function nextDate(dateStr: string): string {
  const d = new Date(dateStr)
  d.setDate(d.getDate() + 1)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

interface BriefingData {
  briefing: Briefing | null
  items: BriefingItem[]
  date: string
}

/**
 * Daily Briefing card. Fetches today's briefing on mount; supports prev/next
 * date navigation. Past days are read-only (no toggle/resolve controls).
 *
 * Uses the dirtyRef pattern: in-flight poll responses are ignored when the user
 * has an action in progress, so local optimistic state isn't clobbered.
 */
export function DailyBriefingCard() {
  const today = localDateKey()
  const [selectedDate, setSelectedDate] = useState(today)
  const [data, setData] = useState<BriefingData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const dirtyRef = useRef(false)

  // ── Resolution state for decision items ─────────────────────────────────────
  const [decidingId, setDecidingId] = useState<string | null>(null)
  const [noteInputs, setNoteInputs] = useState<Record<string, string>>({})
  const [togglingId, setTogglingId] = useState<string | null>(null)

  const load = useCallback((date: string, showSpinner = false) => {
    if (showSpinner) setLoading(true)
    fetch(`/api/crm/briefings?date=${date}`, { credentials: 'include' })
      .then(async res => {
        if (!res.ok) throw new Error(`GET /api/crm/briefings failed (${res.status})`)
        return (await res.json()) as BriefingData
      })
      .then(d => {
        if (dirtyRef.current) return
        setData(d)
        setError(null)
      })
      .catch(e => {
        console.error('[briefing] load error', e)
        setError('Failed to load briefing')
      })
      .finally(() => setLoading(false))
  }, [])

  // Initial load + date changes. setLoading call is inside load()'s promise chain
  // (async, not synchronous in the effect body) — the lint rule is overly broad here.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load(selectedDate, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate])

  const isToday = selectedDate === today
  const items = data?.items ?? []
  const checklist = items.filter(i => i.item_type === 'checklist')
  const decisions = items.filter(i => i.item_type === 'decision')

  // Group checklist items by section (sort_order within each group), items with
  // no section grouped under "Other".
  const OTHER_SECTION = 'Other'
  const sectionOrder: string[] = []
  const sectionGroups = new Map<string, BriefingItem[]>()
  for (const item of checklist) {
    const key = item.section ?? OTHER_SECTION
    if (!sectionGroups.has(key)) {
      sectionGroups.set(key, [])
      sectionOrder.push(key)
    }
    sectionGroups.get(key)!.push(item)
  }
  // "Other" (unlabeled) renders last if present.
  if (sectionOrder.includes(OTHER_SECTION)) {
    sectionOrder.splice(sectionOrder.indexOf(OTHER_SECTION), 1)
    sectionOrder.push(OTHER_SECTION)
  }

  // ── Toggle a checklist item ─────────────────────────────────────────────────
  const toggleChecked = useCallback(async (item: BriefingItem) => {
    if (!isToday) return
    setTogglingId(item.id)
    dirtyRef.current = true

    // Optimistic update
    setData(prev => {
      if (!prev) return prev
      return {
        ...prev,
        items: prev.items.map(i =>
          i.id === item.id ? { ...i, checked: !i.checked } : i
        ),
      }
    })

    try {
      const res = await fetch(`/api/crm/briefings/items/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({}),
      })
      if (!res.ok) {
        console.error('[briefing] toggle failed', await res.text())
        load(selectedDate)  // revert
      }
    } catch (e) {
      console.error('[briefing] toggle error', e)
      load(selectedDate)
    } finally {
      setTogglingId(null)
      dirtyRef.current = false
    }
  }, [isToday, selectedDate, load])

  // ── Resolve a decision item ─────────────────────────────────────────────────
  const resolveDecision = useCallback(async (item: BriefingItem, status: DecisionStatus) => {
    if (!isToday) return
    setDecidingId(item.id)
    dirtyRef.current = true
    const note = noteInputs[item.id] ?? ''

    // Optimistic update
    setData(prev => {
      if (!prev) return prev
      return {
        ...prev,
        items: prev.items.map(i =>
          i.id === item.id
            ? { ...i, decision_status: status, resolution_note: note || null }
            : i
        ),
      }
    })

    try {
      const res = await fetch(`/api/crm/briefings/items/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ decision_status: status, resolution_note: note || undefined }),
      })
      if (!res.ok) {
        console.error('[briefing] decision failed', await res.text())
        load(selectedDate)
      }
    } catch (e) {
      console.error('[briefing] decision error', e)
      load(selectedDate)
    } finally {
      setDecidingId(null)
      dirtyRef.current = false
    }
  }, [isToday, selectedDate, load, noteInputs])

  const checkedCount = checklist.filter(i => i.checked).length

  const header = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <button
        onClick={() => setSelectedDate(prevDate(selectedDate))}
        style={{ background: 'none', border: 'none', color: 'var(--t3)', cursor: 'pointer', fontSize: 14, padding: '0 2px' }}
        title="Previous day"
      >
        ‹
      </button>
      <span style={{ fontSize: 11, color: 'var(--t2)', whiteSpace: 'nowrap' }}>
        {fmtDate(selectedDate)}{isToday ? ' (today)' : ''}
      </span>
      <button
        onClick={() => { if (selectedDate < today) setSelectedDate(nextDate(selectedDate)) }}
        disabled={selectedDate >= today}
        style={{
          background: 'none', border: 'none',
          color: selectedDate >= today ? 'var(--t3)' : 'var(--t2)',
          cursor: selectedDate >= today ? 'default' : 'pointer',
          fontSize: 14, padding: '0 2px',
          opacity: selectedDate >= today ? 0.3 : 1,
        }}
        title="Next day"
      >
        ›
      </button>
    </div>
  )

  return (
    <Panel
      label="Daily Briefing"
      badge={data?.briefing ? `${checkedCount}/${checklist.length}` : undefined}
      action={header}
      fill
    >
      {loading && !data ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--t3)', fontSize: 12 }}>Loading…</div>
      ) : error ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'oklch(0.65 0.22 25)', fontSize: 12 }}>{error}</div>
      ) : !data?.briefing ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--t3)', fontSize: 12, textAlign: 'center' }}>
          {isToday ? 'No briefing yet for today.' : `No briefing for ${fmtDate(selectedDate)}.`}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

          {/* Checklist sections */}
          {checklist.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {sectionOrder.map(sectionKey => (
                <div key={sectionKey}>
                  <div style={{
                    fontSize: 10.5, fontWeight: 600, textTransform: 'uppercase',
                    letterSpacing: '0.06em', color: 'var(--t3)', marginBottom: 6,
                  }}>
                    {sectionKey}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                    {sectionGroups.get(sectionKey)!.map(item => (
                      <label
                        key={item.id}
                        style={{
                          display: 'flex',
                          alignItems: 'flex-start',
                          gap: 8,
                          cursor: isToday ? 'pointer' : 'default',
                          padding: '5px 8px',
                          borderRadius: 7,
                          background: item.checked ? 'oklch(0.67 0.19 165 / 0.06)' : 'transparent',
                          border: '1px solid oklch(1 0 0 / 0.06)',
                          opacity: togglingId === item.id ? 0.6 : 1,
                          transition: 'opacity 0.15s',
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={item.checked}
                          disabled={!isToday || togglingId === item.id}
                          onChange={() => toggleChecked(item)}
                          style={{ marginTop: 1, flexShrink: 0, accentColor: 'oklch(0.67 0.19 165)' }}
                        />
                        <div style={{ minWidth: 0 }}>
                          <span style={{
                            fontSize: 12,
                            color: item.checked ? 'var(--t3)' : 'var(--t1)',
                            textDecoration: item.checked ? 'line-through' : 'none',
                            wordBreak: 'break-word',
                          }}>
                            {item.text}
                          </span>
                          {item.file_path && (
                            <div style={{ fontSize: 10.5, color: 'var(--t3)', marginTop: 2, fontFamily: 'var(--font-mono, monospace)' }}>
                              {item.file_path}
                            </div>
                          )}
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Decisions section */}
          {decisions.length > 0 && (
            <div>
              <div style={{
                fontSize: 10.5, fontWeight: 600, textTransform: 'uppercase',
                letterSpacing: '0.06em', color: 'var(--t3)', marginBottom: 6,
              }}>
                Decisions Needed
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {decisions.map(item => {
                  const resolved = item.decision_status === 'approved' || item.decision_status === 'rejected'
                  return (
                    <div
                      key={item.id}
                      style={{
                        padding: '8px 10px',
                        borderRadius: 8,
                        border: resolved
                          ? '1px solid oklch(1 0 0 / 0.06)'
                          : '1px solid oklch(0.78 0.16 75 / 0.28)',
                        background: resolved
                          ? 'transparent'
                          : 'oklch(0.78 0.16 75 / 0.05)',
                        opacity: decidingId === item.id ? 0.7 : 1,
                      }}
                    >
                      <div style={{ fontSize: 12, color: 'var(--t1)', fontWeight: 500, marginBottom: 4 }}>
                        {item.text}
                      </div>
                      {item.recommendation && (
                        <div style={{ fontSize: 11, color: 'var(--t2)', marginBottom: 6 }}>
                          <span style={{ color: 'var(--t3)' }}>Recommendation: </span>
                          {item.recommendation}
                        </div>
                      )}

                      {resolved ? (
                        <div style={{
                          display: 'inline-flex', alignItems: 'center', gap: 5,
                          fontSize: 10.5, fontWeight: 600,
                          color: item.decision_status === 'approved'
                            ? 'oklch(0.67 0.19 165)'
                            : 'oklch(0.65 0.22 25)',
                        }}>
                          {item.decision_status === 'approved' ? 'Approved' : 'Rejected'}
                          {item.resolution_note && (
                            <span style={{ fontWeight: 400, color: 'var(--t3)' }}>
                              {': '}{item.resolution_note}
                            </span>
                          )}
                        </div>
                      ) : isToday ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                          <input
                            type="text"
                            placeholder="Optional note…"
                            value={noteInputs[item.id] ?? ''}
                            onChange={e => setNoteInputs(prev => ({ ...prev, [item.id]: e.target.value }))}
                            disabled={decidingId === item.id}
                            style={{
                              fontSize: 11,
                              background: 'oklch(0.18 0 0)',
                              color: 'var(--t1)',
                              border: '1px solid oklch(1 0 0 / 0.1)',
                              borderRadius: 5,
                              padding: '4px 8px',
                              width: '100%',
                              boxSizing: 'border-box',
                            }}
                          />
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button
                              onClick={() => resolveDecision(item, 'approved')}
                              disabled={decidingId === item.id}
                              style={{
                                flex: 1,
                                padding: '4px 0',
                                borderRadius: 6,
                                border: 'none',
                                background: 'oklch(0.67 0.19 165)',
                                color: 'oklch(0.12 0 0)',
                                fontSize: 10.5,
                                fontWeight: 600,
                                cursor: decidingId === item.id ? 'not-allowed' : 'pointer',
                              }}
                            >
                              Approve
                            </button>
                            <button
                              onClick={() => resolveDecision(item, 'rejected')}
                              disabled={decidingId === item.id}
                              style={{
                                flex: 1,
                                padding: '4px 0',
                                borderRadius: 6,
                                border: '1px solid oklch(0.65 0.22 25 / 0.4)',
                                background: 'oklch(0.65 0.22 25 / 0.1)',
                                color: 'oklch(0.65 0.22 25)',
                                fontSize: 10.5,
                                fontWeight: 600,
                                cursor: decidingId === item.id ? 'not-allowed' : 'pointer',
                              }}
                            >
                              Reject
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div style={{ fontSize: 10.5, color: 'var(--t3)' }}>
                          Pending (read-only)
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {checklist.length === 0 && decisions.length === 0 && (
            <div style={{ color: 'var(--t3)', fontSize: 12 }}>No items in this briefing.</div>
          )}

          {/* Notes recap — non-interactive, rendered at the bottom when present */}
          {data.briefing.notes && (
            <div
              style={{
                marginTop: 4,
                padding: '8px 10px',
                borderRadius: 8,
                border: '1px solid oklch(1 0 0 / 0.06)',
                background: 'oklch(1 0 0 / 0.03)',
                fontSize: 11,
                color: 'var(--t2)',
                lineHeight: 1.45,
                fontStyle: 'italic',
              }}
            >
              {data.briefing.notes}
            </div>
          )}
        </div>
      )}
    </Panel>
  )
}
