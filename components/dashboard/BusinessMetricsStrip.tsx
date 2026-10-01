'use client'

import { useCallback, useState } from 'react'
import type { BusinessMetrics, FlaggedMessage } from './crm-types'

const PHASE_STAGES = ['P0', 'P1', 'P2', 'P3', 'P4'] as const
const ACCENT = 'oklch(0.67 0.19 165)'
const AMBER = 'oklch(0.78 0.16 75)'

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Extracts a leading P<digit> token from the phase string (case-insensitive). */
function parsePhaseStage(phase: string): number | null {
  const m = /^\s*p\s*(\d)/i.exec(phase)
  if (!m) return null
  const n = Number(m[1])
  if (n < 0 || n > 4) return null
  return n
}

/** Simple relative-time formatter — no library, matches FlaggedMessagesCard's approach. */
function relativeTime(iso: string | null | undefined): string | null {
  if (!iso) return null
  const t = new Date(iso).getTime()
  if (isNaN(t)) return null
  const diff = Date.now() - t
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

/** Clamps a bar width fraction to [0, 1] against a scale — never negative, never >1. */
function widthFrac(value: number, scale: number): number {
  if (!isFinite(value) || !isFinite(scale) || scale <= 0) return 0
  return Math.max(0, Math.min(1, value / scale))
}

// ─── Phase stepper ───────────────────────────────────────────────────────────

function PhaseStepper({ phase, onClick }: { phase: string; onClick: () => void }) {
  const stage = parsePhaseStage(phase)
  const uncertain = stage === null
  const activeStage = stage ?? 0

  return (
    <button
      onClick={onClick}
      title="Click to edit phase"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        padding: 0,
        textAlign: 'left',
        maxWidth: 340,
      }}
    >
      <div style={{ display: 'flex', gap: 4 }}>
        {PHASE_STAGES.map((label, i) => {
          const isCurrent = !uncertain && i === activeStage
          const isDone = !uncertain && i < activeStage
          return (
            <div
              key={label}
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 3,
              }}
            >
              <div
                style={{
                  width: '100%',
                  height: 6,
                  borderRadius: 3,
                  background: isCurrent
                    ? ACCENT
                    : isDone
                    ? 'oklch(0.67 0.19 165 / 0.35)'
                    : 'oklch(1 0 0 / 0.08)',
                  border: uncertain
                    ? '1px solid oklch(1 0 0 / 0.1)'
                    : isCurrent || isDone
                    ? 'none'
                    : '1px solid oklch(1 0 0 / 0.12)',
                }}
              />
              <span
                style={{
                  fontSize: 10.5,
                  fontWeight: isCurrent ? 700 : 500,
                  color: uncertain ? 'var(--t3)' : isCurrent ? ACCENT : isDone ? 'var(--t2)' : 'var(--t3)',
                  letterSpacing: '0.03em',
                }}
              >
                {label}
              </span>
            </div>
          )
        })}
      </div>
      <span
        style={{
          fontSize: 11.5,
          fontWeight: 500,
          color: 'var(--t2)',
          lineHeight: 1.4,
          whiteSpace: 'normal',
          wordBreak: 'break-word',
        }}
      >
        {phase}
      </span>
    </button>
  )
}

// ─── Funnel visual ───────────────────────────────────────────────────────────

interface FunnelStage {
  label: string
  value: number
}

function PipelineFunnel({ stages }: { stages: FunnelStage[] }) {
  const max = Math.max(1, ...stages.map(s => s.value))
  const allZero = stages.every(s => s.value === 0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <span style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        Pipeline Funnel
      </span>
      {stages.map(s => {
        const frac = allZero ? 0.04 : Math.max(0.04, widthFrac(s.value, max))
        return (
          <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 10.5, color: 'var(--t3)', width: 92, flexShrink: 0 }}>{s.label}</span>
            <div style={{ flex: 1, height: 10, borderRadius: 5, background: 'oklch(1 0 0 / 0.05)', overflow: 'hidden' }}>
              <div
                style={{
                  width: `${frac * 100}%`,
                  height: '100%',
                  borderRadius: 5,
                  background: allZero ? 'oklch(1 0 0 / 0.08)' : ACCENT,
                  transition: 'width 0.2s',
                }}
              />
            </div>
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--t1)', width: 32, textAlign: 'right', flexShrink: 0 }}>
              {s.value.toLocaleString()}
            </span>
          </div>
        )
      })}
    </div>
  )
}

// ─── Ready vs. done paired bar ───────────────────────────────────────────────

function ReadyVsDonePair({
  title,
  readyLabel,
  doneLabel,
  ready,
  done,
  gapNoun,
}: {
  title: string
  readyLabel: string
  doneLabel: string
  ready: number
  done: number
  gapNoun: string
}) {
  const max = Math.max(1, ready, done)
  const readyFrac = widthFrac(ready, max)
  const doneFrac = widthFrac(done, max)
  const gap = Math.max(0, ready - done)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <span style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {title}
      </span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 10.5, color: 'var(--t3)', width: 60, flexShrink: 0 }}>{readyLabel}</span>
        <div style={{ flex: 1, height: 9, borderRadius: 5, background: 'oklch(1 0 0 / 0.05)', overflow: 'hidden' }}>
          <div style={{ width: `${Math.max(readyFrac, ready > 0 ? 0.04 : 0) * 100}%`, height: '100%', borderRadius: 5, background: AMBER }} />
        </div>
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--t1)', width: 22, textAlign: 'right', flexShrink: 0 }}>{ready}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 10.5, color: 'var(--t3)', width: 60, flexShrink: 0 }}>{doneLabel}</span>
        <div style={{ flex: 1, height: 9, borderRadius: 5, background: 'oklch(1 0 0 / 0.05)', overflow: 'hidden' }}>
          <div style={{ width: `${Math.max(doneFrac, done > 0 ? 0.04 : 0) * 100}%`, height: '100%', borderRadius: 5, background: ACCENT }} />
        </div>
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--t1)', width: 22, textAlign: 'right', flexShrink: 0 }}>{done}</span>
      </div>
      <span style={{ fontSize: 10.5, color: 'var(--t3)' }}>
        {ready === 0 && done === 0
          ? 'No activity yet'
          : gap > 0
          ? `${ready} ${readyLabel.toLowerCase()}, ${done} ${doneLabel.toLowerCase()}, ${gap} waiting on ${gapNoun}`
          : `${ready} ${readyLabel.toLowerCase()}, ${done} ${doneLabel.toLowerCase()}`}
      </span>
    </div>
  )
}

// ─── AI add-on attach rate ───────────────────────────────────────────────────

function AttachRate({ addon, clients }: { addon: number; clients: number }) {
  const frac = clients > 0 ? widthFrac(addon, clients) : 0
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5, minWidth: 110 }}>
      <span style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        AI Add-on Attach
      </span>
      {clients === 0 ? (
        <span style={{ fontSize: 11.5, color: 'var(--t3)' }}>
          {addon > 0 ? `${addon} of 0 · No clients yet` : 'No clients yet'}
        </span>
      ) : (
        <>
          <div style={{ height: 9, borderRadius: 5, background: 'oklch(1 0 0 / 0.05)', overflow: 'hidden' }}>
            <div style={{ width: `${Math.max(frac, addon > 0 ? 0.04 : 0) * 100}%`, height: '100%', borderRadius: 5, background: 'oklch(0.67 0.19 200)' }} />
          </div>
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--t1)' }}>
            {addon} of {clients} clients
          </span>
        </>
      )}
    </div>
  )
}

// ─── Standalone stat ─────────────────────────────────────────────────────────

function StandaloneStat({ label, value }: { label: string; value: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 70 }}>
      <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--t1)' }}>{value.toLocaleString()}</span>
      <span style={{ fontSize: 10.5, fontWeight: 500, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>
        {label}
      </span>
    </div>
  )
}

// ─── Orchestrator note callout ───────────────────────────────────────────────

interface MessagesData {
  active: FlaggedMessage[]
  recent_acknowledged: FlaggedMessage[]
}

function OrchestratorNoteCallout({ msg }: { msg: FlaggedMessage }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 3,
        padding: '8px 10px',
        borderRadius: 8,
        border: '1px solid oklch(0.78 0.16 75 / 0.22)',
        background: 'oklch(0.78 0.16 75 / 0.04)',
        borderLeft: '3px solid oklch(0.78 0.16 75 / 0.5)',
        maxWidth: 380,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span
          style={{
            fontSize: 10.5,
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
            color: AMBER,
            background: 'oklch(0.78 0.16 75 / 0.12)',
            border: '1px solid oklch(0.78 0.16 75 / 0.3)',
            borderRadius: 4,
            padding: '1px 5px',
            flexShrink: 0,
          }}
        >
          {msg.from_agent}
        </span>
        <span style={{ fontSize: 10.5, color: 'var(--t3)' }}>{relativeTime(msg.occurred_at)}</span>
      </div>
      <div style={{ fontSize: 11.5, color: 'var(--t1)', fontWeight: 500 }}>{msg.subject}</div>
      <div
        style={{
          fontSize: 11,
          color: 'var(--t2)',
          lineHeight: 1.4,
          wordBreak: 'break-word',
          whiteSpace: 'pre-wrap',
        }}
      >
        {msg.body}
      </div>
      <span style={{ fontSize: 10.5, color: 'var(--t3)' }}>See all in Flagged Messages ↓</span>
    </div>
  )
}

// ─── Main component ──────────────────────────────────────────────────────────

interface BusinessMetricsStripProps {
  metrics: BusinessMetrics
  onUpdated: () => void
  /**
   * Sourced from CrmDataProvider's shared GET /api/crm/messages poll (Task 4
   * Step 2 of the crm-tab-reorg plan) instead of an independent fetch here —
   * one fewer duplicate poller, same shape the old inline fetch produced.
   */
  messagesData: MessagesData | null
  messagesError: string | null
}

/**
 * Header card above One-Hour Workday — business health snapshot.
 * Phase stepper + prominent revenue/freshness + funnel/pair visuals built
 * from `business_metrics` fields only, plus an orchestrator-note callout
 * sourced from the shared CrmDataProvider messages poll.
 * revenue_total and phase remain click-to-edit inline (PATCH /api/crm/business-metrics).
 */
export function BusinessMetricsStrip({ metrics, onUpdated, messagesData, messagesError }: BusinessMetricsStripProps) {
  const [editingRevenue, setEditingRevenue] = useState(false)
  const [revenueInput, setRevenueInput] = useState('')
  const [editingPhase, setEditingPhase] = useState(false)
  const [phaseInput, setPhaseInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const saveRevenue = useCallback(async () => {
    const val = parseFloat(revenueInput.replace(/[^0-9.]/g, ''))
    if (isNaN(val) || val < 0) {
      setSaveError('Enter a valid non-negative number')
      return
    }
    setSaving(true)
    setSaveError(null)
    try {
      const res = await fetch('/api/crm/business-metrics', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ revenue_total: val }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        setSaveError((err as { error?: string }).error ?? 'Save failed')
      } else {
        setEditingRevenue(false)
        onUpdated()
      }
    } catch {
      setSaveError('Network error')
    } finally {
      setSaving(false)
    }
  }, [revenueInput, onUpdated])

  const savePhase = useCallback(async () => {
    const phase = phaseInput.trim()
    if (!phase) {
      setSaveError('Phase cannot be empty')
      return
    }
    setSaving(true)
    setSaveError(null)
    try {
      const res = await fetch('/api/crm/business-metrics', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ phase }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        setSaveError((err as { error?: string }).error ?? 'Save failed')
      } else {
        setEditingPhase(false)
        onUpdated()
      }
    } catch {
      setSaveError('Network error')
    } finally {
      setSaving(false)
    }
  }, [phaseInput, onUpdated])

  const freshness = relativeTime(metrics.updated_at)

  // Prefer most recent unacknowledged; fall back to most recent acknowledged.
  const calloutMessage: FlaggedMessage | null =
    messagesData?.active?.[0] ?? messagesData?.recent_acknowledged?.[0] ?? null

  return (
    <div className="glass accent-glow" style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '14px 18px' }}>
      {/* Top row: phase stepper + revenue/freshness */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', gap: 24 }}>
        {/* Phase stepper */}
        <div style={{ flex: '1 1 320px', minWidth: 280 }}>
          {editingPhase ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <input
                autoFocus
                type="text"
                value={phaseInput}
                onChange={e => setPhaseInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') savePhase(); if (e.key === 'Escape') setEditingPhase(false) }}
                disabled={saving}
                placeholder={metrics.phase}
                style={{
                  width: 260,
                  fontSize: 12,
                  fontWeight: 600,
                  background: 'oklch(0.18 0 0)',
                  color: 'var(--t1)',
                  border: '1px solid oklch(0.67 0.19 165 / 0.5)',
                  borderRadius: 6,
                  padding: '3px 8px',
                }}
              />
              <button
                onClick={savePhase}
                disabled={saving}
                style={{ fontSize: 10.5, fontWeight: 600, color: ACCENT, background: 'none', border: 'none', cursor: saving ? 'not-allowed' : 'pointer', padding: '2px 4px' }}
              >
                {saving ? '…' : 'Save'}
              </button>
              <button
                onClick={() => setEditingPhase(false)}
                disabled={saving}
                style={{ fontSize: 10.5, color: 'var(--t3)', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px' }}
              >
                Cancel
              </button>
            </div>
          ) : (
            <PhaseStepper phase={metrics.phase} onClick={() => { setPhaseInput(metrics.phase); setEditingPhase(true) }} />
          )}
        </div>

        {/* Revenue + freshness */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {editingRevenue ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ fontSize: 13, color: 'var(--t3)' }}>$</span>
              <input
                autoFocus
                type="text"
                value={revenueInput}
                onChange={e => setRevenueInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') saveRevenue(); if (e.key === 'Escape') setEditingRevenue(false) }}
                disabled={saving}
                placeholder={String(metrics.revenue_total)}
                style={{
                  width: 110,
                  fontSize: 16,
                  fontWeight: 700,
                  background: 'oklch(0.18 0 0)',
                  color: 'var(--t1)',
                  border: '1px solid oklch(0.67 0.19 165 / 0.5)',
                  borderRadius: 6,
                  padding: '4px 8px',
                }}
              />
              <button
                onClick={saveRevenue}
                disabled={saving}
                style={{ fontSize: 10.5, fontWeight: 600, color: ACCENT, background: 'none', border: 'none', cursor: saving ? 'not-allowed' : 'pointer', padding: '2px 4px' }}
              >
                {saving ? '…' : 'Save'}
              </button>
              <button
                onClick={() => setEditingRevenue(false)}
                disabled={saving}
                style={{ fontSize: 10.5, color: 'var(--t3)', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px' }}
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => { setRevenueInput(String(metrics.revenue_total)); setEditingRevenue(true) }}
              title="Click to edit revenue"
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: 0,
                textAlign: 'right',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-end',
              }}
            >
              <span style={{ fontSize: 26, fontWeight: 700, color: 'var(--t1)', lineHeight: 1.1 }}>
                ${Number(metrics.revenue_total).toLocaleString()}
              </span>
              <span style={{ fontSize: 10.5, fontWeight: 500, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Revenue
              </span>
            </button>
          )}
          {freshness && (
            <span style={{ fontSize: 10.5, color: 'var(--t3)', textAlign: 'right' }}>updated {freshness}</span>
          )}
        </div>
      </div>

      {saveError && (
        <span style={{ fontSize: 10.5, color: 'oklch(0.65 0.22 25)' }}>{saveError}</span>
      )}

      {/* Funnel / progress visuals */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24 }}>
        <div style={{ flex: '1 1 260px', minWidth: 220 }}>
          <PipelineFunnel
            stages={[
              { label: 'Prospects', value: metrics.prospects_in_pipeline },
              { label: 'Outreach Draft', value: metrics.outreach_drafted },
              { label: 'Outreach Sent', value: metrics.outreach_sent },
              { label: 'Replies', value: metrics.replies_received },
              { label: 'Clients Active', value: metrics.clients_active },
            ]}
          />
        </div>

        <div style={{ flex: '1 1 160px', minWidth: 150 }}>
          <ReadyVsDonePair
            title="Content"
            readyLabel="Ready"
            doneLabel="Published"
            ready={metrics.content_ready}
            done={metrics.content_published}
            gapNoun="you"
          />
        </div>

        <div style={{ flex: '1 1 160px', minWidth: 150 }}>
          <ReadyVsDonePair
            title="Products"
            readyLabel="Ready"
            doneLabel="Live"
            ready={metrics.products_ready}
            done={metrics.products_live}
            gapNoun="you"
          />
        </div>

        <div style={{ flex: '1 1 120px', minWidth: 110 }}>
          <AttachRate addon={metrics.ai_addon_clients} clients={metrics.clients_active} />
        </div>

        <div style={{ flex: '1 1 140px', minWidth: 130, display: 'flex', gap: 18 }}>
          <StandaloneStat label="GEO Reports" value={metrics.geo_reports_ready} />
          <StandaloneStat label="Newsletter Subs" value={metrics.newsletter_subs} />
        </div>
      </div>

      {/* Orchestrator note callout — independent fetch, calm omission if none */}
      {calloutMessage && <OrchestratorNoteCallout msg={calloutMessage} />}
      {!calloutMessage && messagesError && (
        <span style={{ fontSize: 10.5, color: 'var(--t3)' }}>{messagesError}</span>
      )}
    </div>
  )
}
