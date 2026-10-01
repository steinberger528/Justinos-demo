'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useResizable } from '@/lib/use-resizable'
import { ResizeHandles } from './ResizeHandles'

// ── Types ────────────────────────────────────────────────────────────────────

const KINDS = ['class', 'work', 'protected', 'other'] as const
const DAYS = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'] as const

type Kind = (typeof KINDS)[number]
type Day = (typeof DAYS)[number]
type Source = 'manual' | 'vault' | 'google'

interface FixedEvent {
  id: string
  label: string
  kind: Kind
  days: Day[]
  start: string // "HH:MM:SS" as returned by Postgres `time`
  end: string
  location: string | null
  buffer_before: number
  buffer_after: number
  hard: boolean
  effective_from: string | null
  effective_to: string | null
  source: Source
  vault_path: string | null
  // (specs/fixed-events-google-sync.md, D) set on 'manual' rows mirrored out to
  // Google Calendar and on 'google' rows imported from it — null otherwise.
  gcal_event_id: string | null
}

// Source badge styling — `base` is an oklch(...) color triple (no wrapping
// parens/alpha) so it can be reused at both full opacity and the standard
// 0.12/0.3-alpha tint/border this modal uses elsewhere; `null` falls back to
// the original neutral (manual) styling.
const SOURCE_BADGE: Record<Source, { label: string; base: string | null }> = {
  manual: { label: 'Manual', base: null },
  vault: { label: 'Vault', base: '0.78 0.16 75' },
  google: { label: 'Google', base: '0.60 0.15 145' },
}

interface Draft {
  label: string
  kind: Kind
  days: Day[]
  start: string
  end: string
  location: string
  buffer_before: string
  buffer_after: string
  hard: boolean
  effective_from: string
  effective_to: string
}

const EMPTY_DRAFT: Draft = {
  label: '',
  kind: 'class',
  days: [],
  start: '',
  end: '',
  location: '',
  buffer_before: '0',
  buffer_after: '0',
  hard: true,
  effective_from: '',
  effective_to: '',
}

const KIND_LABEL: Record<Kind, string> = {
  class: 'Class',
  work: 'Work',
  protected: 'Protected',
  other: 'Other',
}

function hhmm(t: string): string {
  return t.length >= 5 ? t.slice(0, 5) : t
}

function draftFromEvent(ev: FixedEvent): Draft {
  return {
    label: ev.label,
    kind: ev.kind,
    days: ev.days,
    start: hhmm(ev.start),
    end: hhmm(ev.end),
    location: ev.location ?? '',
    buffer_before: String(ev.buffer_before),
    buffer_after: String(ev.buffer_after),
    hard: ev.hard,
    effective_from: ev.effective_from ?? '',
    effective_to: ev.effective_to ?? '',
  }
}

function validateDraft(d: Draft): string | null {
  if (!d.label.trim()) return 'Label is required'
  if (d.days.length === 0) return 'Select at least one day'
  if (!d.start || !d.end) return 'Start and end are required'
  if (d.end <= d.start) return 'End must be after start'
  return null
}

function draftToBody(d: Draft): Record<string, unknown> {
  return {
    label: d.label.trim(),
    kind: d.kind,
    days: d.days,
    start: d.start,
    end: d.end,
    location: d.location.trim() || null,
    buffer_before: Number(d.buffer_before) || 0,
    buffer_after: Number(d.buffer_after) || 0,
    hard: d.hard,
    effective_from: d.effective_from || null,
    effective_to: d.effective_to || null,
  }
}

async function fetchFixedEvents(): Promise<FixedEvent[]> {
  const res = await fetch('/api/fixed-events', { credentials: 'include' })
  if (!res.ok) throw new Error(`GET /api/fixed-events failed (${res.status})`)
  const body = (await res.json()) as { fixed_events: FixedEvent[] }
  return body.fixed_events ?? []
}

// ── Shared field styles ─────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  padding: '5px 8px', borderRadius: 6, border: '1px solid oklch(1 0 0 / 0.1)',
  background: 'oklch(1 0 0 / 0.04)', color: 'var(--t1)', fontSize: 11.5,
}

const btnStyle: React.CSSProperties = {
  padding: '4px 10px', borderRadius: 5, border: '1px solid oklch(1 0 0 / 0.1)',
  background: 'oklch(1 0 0 / 0.05)', color: 'var(--t2)', fontSize: 10.5, cursor: 'pointer',
}

const primaryBtnStyle: React.CSSProperties = {
  ...btnStyle,
  border: '1px solid oklch(0.67 0.19 240 / 0.4)',
  background: 'oklch(0.67 0.19 240 / 0.15)',
  color: 'var(--t1)',
}

const dangerBtnStyle: React.CSSProperties = {
  ...btnStyle,
  border: '1px solid oklch(0.65 0.22 25 / 0.4)',
  background: 'oklch(0.65 0.22 25 / 0.15)',
  color: 'var(--t1)',
}

function DayToggles({ value, onChange, disabled }: { value: Day[]; onChange: (days: Day[]) => void; disabled?: boolean }) {
  return (
    <div className="flex items-center gap-[3px]">
      {DAYS.map((d) => {
        const active = value.includes(d)
        return (
          <button
            key={d}
            type="button"
            disabled={disabled}
            onClick={() => onChange(active ? value.filter((x) => x !== d) : [...value, d])}
            style={{
              width: 26, height: 22, borderRadius: 4, fontSize: 10.5, fontWeight: 700,
              border: active ? '1px solid oklch(0.67 0.19 240 / 0.5)' : '1px solid oklch(1 0 0 / 0.1)',
              background: active ? 'oklch(0.67 0.19 240 / 0.25)' : 'oklch(1 0 0 / 0.04)',
              color: active ? 'var(--t1)' : 'var(--t3)',
              cursor: disabled ? 'not-allowed' : 'pointer',
            }}
          >
            {d}
          </button>
        )
      })}
    </div>
  )
}

interface FixedEventsModalProps {
  open: boolean
  onClose: () => void
}

/**
 * Management-only modal for `fixed_events` (specs/fixed-events.md, B0.6) —
 * background planning constraints the Block-2 planner will read (out of scope
 * here). Fixed events are not rendered on the calendar grid in this pass; this
 * modal is the only UI surface for them. Independent fetch state, entirely
 * separate from CalendarCard's own event fetch, same structural pattern as
 * FlaggedMessagesModal: fixed-position overlay, glass panel, focus trap,
 * Escape-to-close.
 */
export function FixedEventsModal({ open, onClose }: FixedEventsModalProps) {
  const [items, setItems] = useState<FixedEvent[]>([])
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [addDraft, setAddDraft] = useState<Draft>(EMPTY_DRAFT)
  const [addError, setAddError] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState<Draft | null>(null)
  const [editError, setEditError] = useState<string | null>(null)
  const [savingId, setSavingId] = useState<string | null>(null)

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const containerRef = useRef<HTMLDivElement>(null)
  const previouslyFocusedRef = useRef<HTMLElement | null>(null)
  const requestIdRef = useRef(0)

  const { size, startResize } = useResizable(
    'dashboard.modalSize.fixedEvents',
    { width: 640, height: 680 },
    { width: 460, height: 360 },
  )

  const load = useCallback(() => {
    const requestId = ++requestIdRef.current
    setLoading(true)
    setLoadError(null)
    fetchFixedEvents()
      .then((rows) => {
        if (requestIdRef.current !== requestId) return
        setItems(rows)
      })
      .catch((e) => {
        if (requestIdRef.current !== requestId) return
        console.error('[fixed-events] load error', e)
        setLoadError('Failed to load fixed events')
      })
      .finally(() => {
        if (requestIdRef.current !== requestId) return
        setLoading(false)
      })
  }, [])

  // Reset to a fresh fetch every time the modal opens; invalidate any
  // in-flight request when it closes. Deferred to a microtask for the same
  // react-hooks/set-state-in-effect reason as FlaggedMessagesModal.
  useEffect(() => {
    queueMicrotask(() => {
      if (open) {
        setAddDraft(EMPTY_DRAFT)
        setAddError(null)
        setEditingId(null)
        setEditDraft(null)
        setEditError(null)
        setConfirmDeleteId(null)
        load()
      } else {
        requestIdRef.current++
        setItems([])
        setLoadError(null)
      }
    })
  }, [open, load])

  // Focus management: move focus in on open, trap Tab within the dialog,
  // Escape closes, and focus returns to the triggering element on close.
  useEffect(() => {
    if (!open) return
    previouslyFocusedRef.current = document.activeElement as HTMLElement | null
    const t = setTimeout(() => containerRef.current?.focus(), 0)

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
        return
      }
      if (e.key === 'Tab') {
        const container = containerRef.current
        if (!container) return
        const focusables = Array.from(
          container.querySelectorAll<HTMLElement>(
            'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'
          )
        ).filter((el) => el.offsetParent !== null)
        if (focusables.length === 0) return
        const first = focusables[0]
        const last = focusables[focusables.length - 1]
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }
    window.addEventListener('keydown', onKeyDown, true)

    return () => {
      clearTimeout(t)
      window.removeEventListener('keydown', onKeyDown, true)
      previouslyFocusedRef.current?.focus?.()
    }
  }, [open, onClose])

  const handleAdd = useCallback(async () => {
    const err = validateDraft(addDraft)
    if (err) {
      setAddError(err)
      return
    }
    setAdding(true)
    setAddError(null)
    try {
      const res = await fetch('/api/fixed-events', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draftToBody(addDraft)),
      })
      if (!res.ok) {
        const b = (await res.json().catch(() => ({}))) as { error?: string }
        setAddError(b.error ?? `Failed (${res.status})`)
        return
      }
      setAddDraft(EMPTY_DRAFT)
      load()
    } catch (e) {
      console.error('[fixed-events] add error', e)
      setAddError('Failed to add fixed event')
    } finally {
      setAdding(false)
    }
  }, [addDraft, load])

  const startEdit = useCallback((ev: FixedEvent) => {
    setEditingId(ev.id)
    setEditDraft(draftFromEvent(ev))
    setEditError(null)
  }, [])

  const cancelEdit = useCallback(() => {
    setEditingId(null)
    setEditDraft(null)
    setEditError(null)
  }, [])

  const saveEdit = useCallback(async () => {
    if (!editingId || !editDraft) return
    const err = validateDraft(editDraft)
    if (err) {
      setEditError(err)
      return
    }
    setSavingId(editingId)
    setEditError(null)
    try {
      const res = await fetch(`/api/fixed-events/${editingId}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draftToBody(editDraft)),
      })
      if (!res.ok) {
        const b = (await res.json().catch(() => ({}))) as { error?: string }
        setEditError(b.error ?? `Failed (${res.status})`)
        return
      }
      setEditingId(null)
      setEditDraft(null)
      load()
    } catch (e) {
      console.error('[fixed-events] edit error', e)
      setEditError('Failed to save changes')
    } finally {
      setSavingId(null)
    }
  }, [editingId, editDraft, load])

  const doDelete = useCallback(async (id: string) => {
    setDeletingId(id)
    try {
      const res = await fetch(`/api/fixed-events/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      if (!res.ok) {
        console.error('[fixed-events] delete failed', await res.text())
        return
      }
      load()
    } catch (e) {
      console.error('[fixed-events] delete error', e)
    } finally {
      setDeletingId(null)
      setConfirmDeleteId(null)
    }
  }, [load])

  const grouped = useMemo(() => {
    const groups: { kind: Kind; rows: FixedEvent[] }[] = KINDS.map((k) => ({ kind: k, rows: [] }))
    for (const ev of items) {
      const g = groups.find((x) => x.kind === ev.kind)
      if (g) g.rows.push(ev)
    }
    for (const g of groups) g.rows.sort((a, b) => a.start.localeCompare(b.start))
    return groups.filter((g) => g.rows.length > 0)
  }, [items])

  if (!open) return null

  return (
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
        aria-label="Fixed Events"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="glass"
        style={{
          width: size.width, height: size.height,
          display: 'flex', flexDirection: 'column', borderRadius: 12, overflow: 'hidden',
          outline: 'none', position: 'relative',
          // Nearly-opaque override of `.glass`'s ~55%-alpha background — same
          // fix as GoalsModal (e7293a8): over the busy dashboard behind it,
          // that translucency made the modal's own text hard to read.
          background: 'oklch(0.13 0.02 255 / 0.97)',
        }}
      >
        <ResizeHandles onStart={startResize} />
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '13px 18px', borderBottom: '1px solid oklch(1 0 0 / 0.08)', flexShrink: 0,
        }}>
          <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--t1)' }}>Fixed Events</span>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              border: '1px solid oklch(1 0 0 / 0.1)', background: 'oklch(1 0 0 / 0.05)',
              color: 'var(--t3)', borderRadius: 6, width: 26, height: 26, cursor: 'pointer', fontSize: 14,
            }}
          >
            ×
          </button>
        </div>

        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '14px 18px 18px' }}>
          {/* ── List ────────────────────────────────────────────────────── */}
          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '30px 0', color: 'var(--t3)', fontSize: 12 }}>
              Loading…
            </div>
          ) : loadError ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '30px 0', color: 'oklch(0.65 0.22 25)', fontSize: 12 }}>
              {loadError}
            </div>
          ) : items.length === 0 ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '30px 0', color: 'var(--t3)', fontSize: 12 }}>
              No fixed events yet.
            </div>
          ) : (
            grouped.map((group) => (
              <div key={group.kind} style={{ marginBottom: 14 }}>
                <div style={{
                  fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em',
                  color: 'var(--t3)', padding: '4px 0 6px',
                }}>
                  {KIND_LABEL[group.kind]}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                  {group.rows.map((ev) => {
                    const isEditing = editingId === ev.id
                    const draft = isEditing ? editDraft! : null
                    const isConfirmingDelete = confirmDeleteId === ev.id
                    const isSaving = savingId === ev.id
                    const isDeleting = deletingId === ev.id

                    return (
                      <div
                        key={ev.id}
                        style={{
                          padding: '9px 12px', borderRadius: 8,
                          border: '1px solid oklch(1 0 0 / 0.07)',
                          background: 'oklch(1 0 0 / 0.02)',
                        }}
                      >
                        {isEditing && draft ? (
                          <div className="flex flex-col gap-[7px]">
                            <div className="flex items-center gap-[6px]">
                              <input
                                value={draft.label}
                                onChange={(e) => setEditDraft({ ...draft, label: e.target.value })}
                                placeholder="Label"
                                style={{ ...inputStyle, flex: 1 }}
                              />
                              <select
                                value={draft.kind}
                                onChange={(e) => setEditDraft({ ...draft, kind: e.target.value as Kind })}
                                style={inputStyle}
                              >
                                {KINDS.map((k) => (
                                  <option key={k} value={k}>{KIND_LABEL[k]}</option>
                                ))}
                              </select>
                            </div>
                            <DayToggles value={draft.days} onChange={(days) => setEditDraft({ ...draft, days })} />
                            <div className="flex items-center gap-[6px] flex-wrap">
                              <input type="time" value={draft.start} onChange={(e) => setEditDraft({ ...draft, start: e.target.value })} style={inputStyle} />
                              <span style={{ color: 'var(--t3)', fontSize: 11 }}>–</span>
                              <input type="time" value={draft.end} onChange={(e) => setEditDraft({ ...draft, end: e.target.value })} style={inputStyle} />
                              <input
                                value={draft.location}
                                onChange={(e) => setEditDraft({ ...draft, location: e.target.value })}
                                placeholder="Location (optional)"
                                style={{ ...inputStyle, flex: 1, minWidth: 100 }}
                              />
                            </div>
                            <div className="flex items-center gap-[6px] flex-wrap">
                              <label style={{ fontSize: 10.5, color: 'var(--t3)' }}>Buffer before (min)</label>
                              <input
                                type="number" min={0} value={draft.buffer_before}
                                onChange={(e) => setEditDraft({ ...draft, buffer_before: e.target.value })}
                                style={{ ...inputStyle, width: 60 }}
                              />
                              <label style={{ fontSize: 10.5, color: 'var(--t3)' }}>after (min)</label>
                              <input
                                type="number" min={0} value={draft.buffer_after}
                                onChange={(e) => setEditDraft({ ...draft, buffer_after: e.target.value })}
                                style={{ ...inputStyle, width: 60 }}
                              />
                              <label className="flex items-center gap-[4px]" style={{ fontSize: 10.5, color: 'var(--t3)' }}>
                                <input
                                  type="checkbox" checked={draft.hard}
                                  onChange={(e) => setEditDraft({ ...draft, hard: e.target.checked })}
                                />
                                Hard
                              </label>
                            </div>
                            <div className="flex items-center gap-[6px] flex-wrap">
                              <label style={{ fontSize: 10.5, color: 'var(--t3)' }}>Effective from</label>
                              <input
                                type="date" value={draft.effective_from}
                                onChange={(e) => setEditDraft({ ...draft, effective_from: e.target.value })}
                                style={inputStyle}
                              />
                              <label style={{ fontSize: 10.5, color: 'var(--t3)' }}>to</label>
                              <input
                                type="date" value={draft.effective_to}
                                onChange={(e) => setEditDraft({ ...draft, effective_to: e.target.value })}
                                style={inputStyle}
                              />
                            </div>
                            {ev.source === 'vault' && (
                              <div style={{
                                fontSize: 10.5, color: 'oklch(0.78 0.16 75)', padding: '4px 8px',
                                borderRadius: 5, background: 'oklch(0.78 0.16 75 / 0.08)',
                                border: '1px solid oklch(0.78 0.16 75 / 0.25)',
                              }}>
                                This is a vault-synced row. Editing it does not change its ownership. The next
                                vault sync will overwrite these changes back (or leave them if the vault side is unchanged).
                              </div>
                            )}
                            {editError && (
                              <div style={{ fontSize: 10.5, color: 'oklch(0.65 0.22 25)' }}>{editError}</div>
                            )}
                            <div className="flex items-center gap-[6px]">
                              <button onClick={saveEdit} disabled={isSaving} style={primaryBtnStyle}>
                                {isSaving ? 'Saving…' : 'Save'}
                              </button>
                              <button onClick={cancelEdit} disabled={isSaving} style={btnStyle}>Cancel</button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-start justify-between gap-[10px]">
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div className="flex items-center gap-[6px] flex-wrap" style={{ marginBottom: 3 }}>
                                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--t1)' }}>{ev.label}</span>
                                {!ev.hard && (
                                  <span style={{
                                    fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em',
                                    color: 'var(--t3)', border: '1px solid oklch(1 0 0 / 0.15)', borderRadius: 4, padding: '1px 5px',
                                  }}>
                                    Soft
                                  </span>
                                )}
                                <span style={{
                                  fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em',
                                  color: SOURCE_BADGE[ev.source].base ? `oklch(${SOURCE_BADGE[ev.source].base})` : 'var(--t3)',
                                  background: SOURCE_BADGE[ev.source].base ? `oklch(${SOURCE_BADGE[ev.source].base} / 0.12)` : 'oklch(1 0 0 / 0.05)',
                                  border: SOURCE_BADGE[ev.source].base ? `1px solid oklch(${SOURCE_BADGE[ev.source].base} / 0.3)` : '1px solid oklch(1 0 0 / 0.1)',
                                  borderRadius: 4, padding: '1px 5px',
                                }}>
                                  {SOURCE_BADGE[ev.source].label}
                                </span>
                                {ev.gcal_event_id && (
                                  <span
                                    title="Also on Google Calendar"
                                    aria-label="Also on Google Calendar"
                                    style={{
                                      fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em',
                                      color: 'oklch(0.60 0.15 145)', background: 'oklch(0.60 0.15 145 / 0.12)',
                                      border: '1px solid oklch(0.60 0.15 145 / 0.3)', borderRadius: 4, padding: '1px 5px',
                                    }}
                                  >
                                    GCal
                                  </span>
                                )}
                              </div>
                              <div style={{ fontSize: 10.5, color: 'var(--t2)' }}>
                                {ev.days.join(', ')} · {hhmm(ev.start)}–{hhmm(ev.end)}
                                {ev.location ? ` · ${ev.location}` : ''}
                              </div>
                              {ev.source === 'vault' && (
                                <div style={{ fontSize: 10.5, color: 'var(--t3)', marginTop: 3 }}>
                                  Synced from vault. The next vault sync will overwrite it.
                                </div>
                              )}
                            </div>
                            <div className="flex items-center gap-[6px]" style={{ flexShrink: 0 }}>
                              {isConfirmingDelete ? (
                                <>
                                  <button onClick={() => doDelete(ev.id)} disabled={isDeleting} style={dangerBtnStyle}>
                                    {isDeleting ? '…' : 'Confirm'}
                                  </button>
                                  <button onClick={() => setConfirmDeleteId(null)} disabled={isDeleting} style={btnStyle}>
                                    Cancel
                                  </button>
                                </>
                              ) : (
                                <>
                                  <button onClick={() => startEdit(ev)} style={btnStyle}>Edit</button>
                                  <button onClick={() => setConfirmDeleteId(ev.id)} style={btnStyle}>Delete</button>
                                </>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            ))
          )}

          {/* ── Add form ────────────────────────────────────────────────── */}
          <div style={{
            marginTop: 16, paddingTop: 14, borderTop: '1px solid oklch(1 0 0 / 0.08)',
            display: 'flex', flexDirection: 'column', gap: 7,
          }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--t3)' }}>
              Add fixed event
            </div>
            <div className="flex items-center gap-[6px]">
              <input
                value={addDraft.label}
                onChange={(e) => setAddDraft({ ...addDraft, label: e.target.value })}
                placeholder="Label (e.g. OPS 410 lecture)"
                style={{ ...inputStyle, flex: 1 }}
              />
              <select
                value={addDraft.kind}
                onChange={(e) => setAddDraft({ ...addDraft, kind: e.target.value as Kind })}
                style={inputStyle}
              >
                {KINDS.map((k) => (
                  <option key={k} value={k}>{KIND_LABEL[k]}</option>
                ))}
              </select>
            </div>
            <DayToggles value={addDraft.days} onChange={(days) => setAddDraft({ ...addDraft, days })} />
            <div className="flex items-center gap-[6px] flex-wrap">
              <input type="time" value={addDraft.start} onChange={(e) => setAddDraft({ ...addDraft, start: e.target.value })} style={inputStyle} />
              <span style={{ color: 'var(--t3)', fontSize: 11 }}>–</span>
              <input type="time" value={addDraft.end} onChange={(e) => setAddDraft({ ...addDraft, end: e.target.value })} style={inputStyle} />
              <input
                value={addDraft.location}
                onChange={(e) => setAddDraft({ ...addDraft, location: e.target.value })}
                placeholder="Location (optional)"
                style={{ ...inputStyle, flex: 1, minWidth: 100 }}
              />
            </div>
            <div className="flex items-center gap-[6px] flex-wrap">
              <label style={{ fontSize: 10.5, color: 'var(--t3)' }}>Buffer before (min)</label>
              <input
                type="number" min={0} value={addDraft.buffer_before}
                onChange={(e) => setAddDraft({ ...addDraft, buffer_before: e.target.value })}
                style={{ ...inputStyle, width: 60 }}
              />
              <label style={{ fontSize: 10.5, color: 'var(--t3)' }}>after (min)</label>
              <input
                type="number" min={0} value={addDraft.buffer_after}
                onChange={(e) => setAddDraft({ ...addDraft, buffer_after: e.target.value })}
                style={{ ...inputStyle, width: 60 }}
              />
              <label className="flex items-center gap-[4px]" style={{ fontSize: 10.5, color: 'var(--t3)' }}>
                <input
                  type="checkbox" checked={addDraft.hard}
                  onChange={(e) => setAddDraft({ ...addDraft, hard: e.target.checked })}
                />
                Hard (never schedule over)
              </label>
            </div>
            <div className="flex items-center gap-[6px] flex-wrap">
              <label style={{ fontSize: 10.5, color: 'var(--t3)' }}>Effective from</label>
              <input
                type="date" value={addDraft.effective_from}
                onChange={(e) => setAddDraft({ ...addDraft, effective_from: e.target.value })}
                style={inputStyle}
              />
              <label style={{ fontSize: 10.5, color: 'var(--t3)' }}>to</label>
              <input
                type="date" value={addDraft.effective_to}
                onChange={(e) => setAddDraft({ ...addDraft, effective_to: e.target.value })}
                style={inputStyle}
              />
            </div>
            {addError && <div style={{ fontSize: 10.5, color: 'oklch(0.65 0.22 25)' }}>{addError}</div>}
            <div>
              <button onClick={handleAdd} disabled={adding} style={primaryBtnStyle}>
                {adding ? 'Adding…' : 'Add'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
