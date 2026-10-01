'use client'

import { useCallback, useEffect, useState } from 'react'
import { Panel } from './Panel'
import { RULE_BLOCK_TYPES, RULE_DAYS, type DayRuleBody, type RuleDay, type RuleKind } from '@/lib/day-rules'

/**
 * Day rules editor (B2.14). These rows are what build-day places every morning around:
 * the wake anchor, the gym/lunch/dinner/school windows, and the per-course study weights
 * that rank School work. Before this, changing "gym is 2 hours" meant editing the database.
 */

interface DayRule extends DayRuleBody {
  id: string
}

interface Draft {
  label: string
  kind: RuleKind
  days: RuleDay[]
  duration_min: string
  window_start: string
  window_end: string
  block_type: string
  min_chunk_min: string
  splittable: boolean
  active: boolean
  course_code: string
  weight: string
  is_intention: boolean
}

const EMPTY: Draft = {
  label: '', kind: 'window', days: [...RULE_DAYS], duration_min: '', window_start: '', window_end: '',
  block_type: '', min_chunk_min: '', splittable: false, active: true, course_code: '', weight: '', is_intention: false,
}

const hhmm = (t: string | null) => (t ? t.slice(0, 5) : '')
const num = (s: string) => (s.trim() === '' ? null : Number(s))

function draftFrom(rule: DayRule): Draft {
  return {
    label: rule.label,
    kind: rule.kind,
    days: rule.days,
    duration_min: rule.duration_min?.toString() ?? '',
    window_start: hhmm(rule.window_start),
    window_end: hhmm(rule.window_end),
    block_type: rule.block_type ?? '',
    min_chunk_min: rule.min_chunk_min?.toString() ?? '',
    splittable: rule.splittable,
    active: rule.active,
    course_code: rule.course_code ?? '',
    weight: rule.weight?.toString() ?? '',
    is_intention: rule.is_intention,
  }
}

function bodyFrom(draft: Draft): Partial<DayRuleBody> {
  return {
    label: draft.label,
    kind: draft.kind,
    days: draft.days,
    duration_min: num(draft.duration_min),
    window_start: draft.window_start || null,
    window_end: draft.window_end || null,
    block_type: draft.block_type || null,
    min_chunk_min: num(draft.min_chunk_min),
    splittable: draft.splittable,
    active: draft.active,
    course_code: draft.course_code || null,
    weight: num(draft.weight),
    is_intention: draft.is_intention,
  }
}

/** Plain-language summary of when a rule applies, e.g. "2h · anywhere it fits · Mon–Fri". */
function summarize(rule: DayRule): string {
  if (rule.course_code) return `weight ${rule.weight ?? 0}`
  const parts: string[] = []
  if (rule.kind === 'anchor') parts.push(`at ${hhmm(rule.window_start)}`)
  else {
    const mins = rule.duration_min ?? 0
    parts.push(mins % 60 === 0 ? `${mins / 60}h` : `${mins} min`)
    parts.push(rule.window_start && rule.window_end ? `between ${hhmm(rule.window_start)} and ${hhmm(rule.window_end)}` : 'anywhere it fits')
    if (rule.splittable) parts.push(`splittable${rule.min_chunk_min ? ` (min ${rule.min_chunk_min} min)` : ''}`)
  }
  if (rule.block_type) parts.push(rule.block_type)
  parts.push(rule.days.length === 7 ? 'every day' : rule.days.join(' '))
  return parts.join(' · ')
}

const INPUT = 'px-[7px] py-[4px] rounded-[5px] text-[11.5px] w-full'
const inputStyle = { background: 'oklch(1 0 0 / 0.05)', border: '1px solid var(--ui-border)', color: 'var(--t1)' } as const
const BTN = 'px-[9px] py-[4px] rounded-[6px] text-[11px] font-semibold'

function RuleForm({ draft, setDraft, saving, onSave, onCancel }: {
  draft: Draft
  setDraft: (d: Draft) => void
  saving: boolean
  onSave: () => void
  onCancel: () => void
}) {
  // A study-weight row is the one that carries a course/weight instead of a duration.
  const isWeight = draft.course_code !== '' || draft.weight !== ''
  return (
    <div className="flex flex-col gap-[9px] p-[11px] rounded-[8px]" style={{ border: '1px solid var(--ui-border)', background: 'oklch(1 0 0 / 0.03)' }}>
      <div className="grid gap-[8px]" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
        <label className="flex flex-col gap-[3px]">
          <span className="text-[10.5px]" style={{ color: 'var(--t3)' }}>Name</span>
          <input className={INPUT} style={inputStyle} value={draft.label} placeholder="Workout" onChange={e => setDraft({ ...draft, label: e.target.value })} />
        </label>

        {isWeight ? (
          <>
            <label className="flex flex-col gap-[3px]">
              <span className="text-[10.5px]" style={{ color: 'var(--t3)' }}>Course code</span>
              <input className={INPUT} style={inputStyle} value={draft.course_code} placeholder="OPS 410" onChange={e => setDraft({ ...draft, course_code: e.target.value })} />
            </label>
            <label className="flex flex-col gap-[3px]">
              <span className="text-[10.5px]" style={{ color: 'var(--t3)' }}>Weight (higher goes first)</span>
              <input className={INPUT} style={inputStyle} inputMode="decimal" value={draft.weight} onChange={e => setDraft({ ...draft, weight: e.target.value })} />
            </label>
          </>
        ) : (
          <>
            <label className="flex flex-col gap-[3px]">
              <span className="text-[10.5px]" style={{ color: 'var(--t3)' }}>Type</span>
              <select className={INPUT} style={inputStyle} value={draft.kind} onChange={e => setDraft({ ...draft, kind: e.target.value as RuleKind })}>
                <option value="window">Window (a length of time)</option>
                <option value="anchor">Anchor (a fixed clock time)</option>
              </select>
            </label>
            {draft.kind === 'anchor' ? (
              <label className="flex flex-col gap-[3px]">
                <span className="text-[10.5px]" style={{ color: 'var(--t3)' }}>Time</span>
                <input className={INPUT} style={inputStyle} type="time" value={draft.window_start} onChange={e => setDraft({ ...draft, window_start: e.target.value })} />
              </label>
            ) : (
              <>
                <label className="flex flex-col gap-[3px]">
                  <span className="text-[10.5px]" style={{ color: 'var(--t3)' }}>Length (minutes)</span>
                  <input className={INPUT} style={inputStyle} inputMode="numeric" value={draft.duration_min} placeholder="120" onChange={e => setDraft({ ...draft, duration_min: e.target.value })} />
                </label>
                <label className="flex flex-col gap-[3px]">
                  <span className="text-[10.5px]" style={{ color: 'var(--t3)' }}>Earliest (optional)</span>
                  <input className={INPUT} style={inputStyle} type="time" value={draft.window_start} onChange={e => setDraft({ ...draft, window_start: e.target.value })} />
                </label>
                <label className="flex flex-col gap-[3px]">
                  <span className="text-[10.5px]" style={{ color: 'var(--t3)' }}>Latest (optional)</span>
                  <input className={INPUT} style={inputStyle} type="time" value={draft.window_end} onChange={e => setDraft({ ...draft, window_end: e.target.value })} />
                </label>
                <label className="flex flex-col gap-[3px]">
                  <span className="text-[10.5px]" style={{ color: 'var(--t3)' }}>Block type (optional)</span>
                  <select className={INPUT} style={inputStyle} value={draft.block_type} onChange={e => setDraft({ ...draft, block_type: e.target.value })}>
                    <option value="">none</option>
                    {RULE_BLOCK_TYPES.map(bt => <option key={bt} value={bt}>{bt}</option>)}
                  </select>
                </label>
              </>
            )}
          </>
        )}
      </div>

      <div className="flex flex-col gap-[4px]">
        <span className="text-[10.5px]" style={{ color: 'var(--t3)' }}>Days</span>
        <div className="flex gap-[4px] flex-wrap">
          {RULE_DAYS.map(d => {
            const on = draft.days.includes(d)
            return (
              <button key={d} type="button"
                onClick={() => setDraft({ ...draft, days: on ? draft.days.filter(x => x !== d) : [...draft.days, d] })}
                className="px-[8px] py-[3px] rounded-[5px] text-[10.5px] font-semibold"
                style={{ background: on ? 'oklch(0.67 0.19 240 / 0.25)' : 'oklch(1 0 0 / 0.05)', border: `1px solid ${on ? 'oklch(0.67 0.19 240 / 0.5)' : 'var(--ui-border)'}`, color: on ? 'var(--t1)' : 'var(--t3)' }}>
                {d}
              </button>
            )
          })}
        </div>
      </div>

      {!isWeight && draft.kind === 'window' && (
        <div className="flex gap-[14px] flex-wrap items-center">
          <label className="flex items-center gap-[6px] text-[11px]" style={{ color: 'var(--t2)' }}>
            <input type="checkbox" checked={draft.splittable} onChange={e => setDraft({ ...draft, splittable: e.target.checked })} />
            Can be split across the day
          </label>
          {draft.splittable && (
            <label className="flex items-center gap-[6px] text-[11px]" style={{ color: 'var(--t2)' }}>
              Smallest piece (min)
              <input className="px-[6px] py-[3px] rounded-[5px] text-[11.5px] w-[70px]" style={inputStyle} inputMode="numeric" value={draft.min_chunk_min} onChange={e => setDraft({ ...draft, min_chunk_min: e.target.value })} />
            </label>
          )}
          <label className="flex items-center gap-[6px] text-[11px]" style={{ color: 'var(--t2)' }}>
            <input type="checkbox" checked={draft.is_intention} onChange={e => setDraft({ ...draft, is_intention: e.target.checked })} />
            Offer this instead of scheduling it
          </label>
        </div>
      )}

      <label className="flex items-center gap-[6px] text-[11px]" style={{ color: 'var(--t2)' }}>
        <input type="checkbox" checked={draft.active} onChange={e => setDraft({ ...draft, active: e.target.checked })} />
        Active (Neptune uses this rule)
      </label>

      <div className="flex gap-[8px]">
        <button className={BTN} disabled={saving} onClick={onSave}
          style={{ background: 'oklch(0.67 0.19 240 / 0.25)', border: '1px solid oklch(0.67 0.19 240 / 0.5)', color: 'var(--t1)', opacity: saving ? 0.6 : 1 }}>
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button className={BTN} onClick={onCancel}
          style={{ background: 'oklch(1 0 0 / 0.05)', border: '1px solid var(--ui-border)', color: 'var(--t2)' }}>
          Cancel
        </button>
      </div>
    </div>
  )
}


function RuleRow({ rule, editing, draft, setDraft, saving, confirmDelete, onEdit, onStartDelete, onCancelDelete, onDelete, onSave, onCancel }: {
  rule: DayRule
  editing: boolean
draft: Draft
  setDraft: (d: Draft) => void
saving: boolean
  confirmDelete: string | null
onEdit: () => void
  onStartDelete: () => void
onCancelDelete: () => void
  onDelete: () => void
onSave: () => void
  onCancel: () => void
}) {
  if (editing) return <RuleForm draft={draft} setDraft={setDraft} saving={saving} onSave={onSave} onCancel={onCancel} />
  return (
    <div className="flex items-center gap-[10px] px-[10px] py-[7px] rounded-[8px]" style={{ border: '1px solid var(--ui-border)', opacity: rule.active ? 1 : 0.5 }}>
      <div className="flex-1 min-w-0">
        <div className="text-[12.5px] font-semibold truncate" style={{ color: 'var(--t1)' }}>
          {rule.course_code ? `${rule.course_code} · ${rule.label}` : rule.label}
          {!rule.active && <span className="ml-[6px] text-[10.5px]" style={{ color: 'var(--t3)' }}>(off)</span>}
        </div>
        <div className="text-[10.5px] truncate" style={{ color: 'var(--t3)', fontFamily: 'var(--font-jetbrains-mono, monospace)' }}>{summarize(rule)}</div>
      </div>
      {confirmDelete === rule.id ? (
        <>
          <span className="text-[10.5px]" style={{ color: 'var(--t2)' }}>Delete?</span>
          <button className={BTN} disabled={saving} onClick={onDelete}
            style={{ background: 'oklch(0.55 0.2 25 / 0.25)', border: '1px solid oklch(0.65 0.2 25 / 0.5)', color: 'var(--t1)' }}>Yes</button>
          <button className={BTN} onClick={onCancelDelete}
            style={{ background: 'oklch(1 0 0 / 0.05)', border: '1px solid var(--ui-border)', color: 'var(--t2)' }}>No</button>
        </>
      ) : (
        <>
          <button className={BTN} onClick={onEdit}
            style={{ background: 'oklch(1 0 0 / 0.05)', border: '1px solid var(--ui-border)', color: 'var(--t2)' }}>Edit</button>
          <button className={BTN} onClick={onStartDelete}
            style={{ background: 'transparent', border: '1px solid var(--ui-border)', color: 'var(--t3)' }}>Delete</button>
        </>
      )}
    </div>
  )
}


export function DayRulesSettings() {
  const [rules, setRules] = useState<DayRule[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft>(EMPTY)
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/day-rules?all=1', { credentials: 'include' })
      if (!res.ok) throw new Error('could not load rules')
      const body = (await res.json()) as { day_rules: DayRule[] }
      setRules(body.day_rules ?? [])
      setError(null)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  // Standard data-fetching effect: load() owns the loading/error/rules setState calls.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load() }, [load])

  function startNew(kind: 'schedule' | 'weight') {
    setEditingId('new')
    setDraft(kind === 'weight'
      ? { ...EMPTY, kind: 'window', course_code: '', weight: '1', label: '' }
      : { ...EMPTY })
  }

  async function save() {
    setSaving(true)
    setError(null)
    try {
      const isNew = editingId === 'new'
      const res = await fetch(isNew ? '/api/day-rules' : `/api/day-rules/${editingId}`, {
        method: isNew ? 'POST' : 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyFrom(draft)),
      })
      const body = (await res.json()) as { error?: string }
      if (!res.ok) throw new Error(body.error ?? 'save failed')
      setEditingId(null)
      await load()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  async function remove(id: string) {
    setSaving(true)
    try {
      const res = await fetch(`/api/day-rules/${id}`, { method: 'DELETE', credentials: 'include' })
      const body = (await res.json()) as { error?: string }
      if (!res.ok) throw new Error(body.error ?? 'delete failed')
      setConfirmDelete(null)
      await load()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  function cancelEdit() {
    setEditingId(null)
    setError(null)
  }

  const rowProps = (rule: DayRule) => ({
    editing: editingId === rule.id,
    draft,
    setDraft,
    saving,
    confirmDelete,
    onEdit: () => { setEditingId(rule.id); setDraft(draftFrom(rule)); setError(null) },
    onStartDelete: () => setConfirmDelete(rule.id),
    onCancelDelete: () => setConfirmDelete(null),
    onDelete: () => void remove(rule.id),
    onSave: () => void save(),
    onCancel: cancelEdit,
  })

  const schedule = rules.filter(r => !r.course_code)
  const weights = rules.filter(r => r.course_code)

  return (
    <div className="flex flex-col gap-[15px]">
      <Panel label="Day rules" badge={loading ? '…' : `${schedule.length}`}>
        <div className="flex flex-col gap-[9px]">
          <p className="text-[11px] leading-[1.5]" style={{ color: 'var(--t3)' }}>
            What Neptune places every morning around your classes: when you wake, and how long
            workouts, meals and school blocks get. Changes apply to the next plan.
          </p>
          {error && (
            <div className="px-[10px] py-[6px] rounded-[6px] text-[11px]" style={{ background: 'oklch(0.55 0.2 25 / 0.18)', border: '1px solid oklch(0.65 0.2 25 / 0.4)', color: 'var(--t1)' }}>{error}</div>
          )}
          {loading ? (
            <span className="text-[11.5px]" style={{ color: 'var(--t3)' }}>Loading…</span>
          ) : (
            schedule.map(rule => <RuleRow key={rule.id} rule={rule} {...rowProps(rule)} />)
          )}
          {editingId === 'new' && draft.course_code === '' && draft.weight === '' && <RuleForm draft={draft} setDraft={setDraft} saving={saving} onSave={() => void save()} onCancel={cancelEdit} />}
          {editingId !== 'new' && (
            <button className={BTN} onClick={() => startNew('schedule')}
              style={{ background: 'oklch(1 0 0 / 0.05)', border: '1px solid var(--ui-border)', color: 'var(--t2)', alignSelf: 'flex-start' }}>
              + Add rule
            </button>
          )}
        </div>
      </Panel>

      <Panel label="Study weights" badge={loading ? '…' : `${weights.length}`}>
        <div className="flex flex-col gap-[9px]">
          <p className="text-[11px] leading-[1.5]" style={{ color: 'var(--t3)' }}>
            Which course gets attention first inside a School block. Higher weight goes first.
            Courses with no weight fall back to due date.
          </p>
          {weights.map(rule => <RuleRow key={rule.id} rule={rule} {...rowProps(rule)} />)}
          {editingId === 'new' && (draft.course_code !== '' || draft.weight !== '') && <RuleForm draft={draft} setDraft={setDraft} saving={saving} onSave={() => void save()} onCancel={cancelEdit} />}
          {editingId !== 'new' && (
            <button className={BTN} onClick={() => startNew('weight')}
              style={{ background: 'oklch(1 0 0 / 0.05)', border: '1px solid var(--ui-border)', color: 'var(--t2)', alignSelf: 'flex-start' }}>
              + Add course weight
            </button>
          )}
        </div>
      </Panel>
    </div>
  )
}
