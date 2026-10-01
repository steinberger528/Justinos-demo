'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Panel } from './Panel'
import { localDateKey } from '@/lib/date'

// ── Types ─────────────────────────────────────────────────────────────────────

interface MacroSnapshot {
  current: number
  goal: number
}

interface MealTotal {
  name: string
  kcal: number
}

interface FatBreakdown {
  goodFat: number
  badFat: number
}

interface NutritionSnapshot {
  calories: MacroSnapshot
  protein: MacroSnapshot
  carbs: MacroSnapshot
  fat: MacroSnapshot
  fiber: MacroSnapshot
  fatBreakdown?: FatBreakdown
  meals: MealTotal[]
  syncedAt: string
  lastError?: string
  lastErrorStep?: string
}

type ViewMode = 'macros' | 'breakdown'

// ── Colors matching existing card palette ─────────────────────────────────────

const COLOR_PROTEIN = 'oklch(0.72 0.28 295)' // purple
const COLOR_CARBS   = 'var(--ac)'             // blue
const COLOR_FAT     = 'var(--ag)'             // mint
const COLOR_FIBER   = 'oklch(0.50 0.22 240)'  // indigo


function pct(cur: number, goal: number): number {
  if (!goal) return 0
  return Math.min(100, Math.round((cur / goal) * 100))
}

// ── Pie chart ─────────────────────────────────────────────────────────────────

interface PieSlice {
  color: string
  label: string
  grams: number
}

function MacroPieChart({ protein, carbs, fat }: { protein: number; carbs: number; fat: number }) {
  const total = protein + carbs + fat
  if (total === 0) {
    return (
      <div
        className="flex items-center justify-center w-[120px] h-[120px] rounded-full text-[11px]"
        style={{ border: '2px solid oklch(1 0 0 / 0.08)', color: 'var(--t3)' }}
      >
        No data
      </div>
    )
  }

  const slices: PieSlice[] = [
    { label: 'Protein', grams: protein, color: COLOR_PROTEIN },
    { label: 'Carbs',   grams: carbs,   color: 'oklch(0.67 0.19 240)' },
    { label: 'Fat',     grams: fat,     color: 'oklch(0.67 0.19 165)' },
  ]

  // Build SVG pie from slices
  const radius = 52
  const cx = 60
  const cy = 60
  const size = 120

  function describeArc(startAngle: number, endAngle: number): string {
    const toRad = (deg: number) => (deg - 90) * (Math.PI / 180)
    const x1 = cx + radius * Math.cos(toRad(startAngle))
    const y1 = cy + radius * Math.sin(toRad(startAngle))
    const x2 = cx + radius * Math.cos(toRad(endAngle))
    const y2 = cy + radius * Math.sin(toRad(endAngle))
    const largeArc = endAngle - startAngle > 180 ? 1 : 0
    return `M ${cx} ${cy} L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2} Z`
  }

  let cumAngle = 0
  const paths = slices.map((s) => {
    const fraction = s.grams / total
    const sweep = fraction * 360
    const startAngle = cumAngle
    const endAngle = cumAngle + sweep
    cumAngle = endAngle
    // Avoid degenerate paths for zero slices
    if (sweep < 0.01) return null
    return <path key={s.label} d={describeArc(startAngle, endAngle)} fill={s.color} />
  })

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {paths}
      {/* Inner hole for donut effect */}
      <circle cx={cx} cy={cy} r={28} fill="transparent" style={{ fill: 'var(--glass, oklch(0.15 0.018 255 / 0.55))' }} />
    </svg>
  )
}

// ── Error badge prompt builder ────────────────────────────────────────────────

function buildFixPrompt(snap: NutritionSnapshot): string {
  return [
    'The nutrition sync failed. Please investigate and fix the scraper.',
    '',
    `Error: ${snap.lastError ?? 'Unknown error'}`,
    `Step that failed: ${snap.lastErrorStep ?? 'Unknown'}`,
    `Timestamp: ${snap.syncedAt}`,
  ].join('\n')
}

// ── Main component ────────────────────────────────────────────────────────────

export function NutritionCard() {
  const [snap, setSnap]             = useState<NutritionSnapshot | null>(null)
  const [view, setView]             = useState<ViewMode>('macros')
  const [syncing, setSyncing]       = useState(false)
  const [errorOpen, setErrorOpen]   = useState(false)
  const [copyLabel, setCopyLabel]   = useState('Copy')
  const dirtyRef                    = useRef(false)
  const dateRef                     = useRef(localDateKey())

  // Load snapshot on mount (never triggers a scrape)
  useEffect(() => {
    const date = localDateKey()
    dateRef.current = date
    fetch(`/api/nutrition?date=${date}`)
      .then(r => {
        if (!r.ok) { console.error('[nutrition] GET failed', r.status); return null }
        return r.json()
      })
      .then((data: { nutrition: NutritionSnapshot | null } | null) => {
        if (!data) return
        if (dirtyRef.current) return // user already triggered a manual refresh
        if (data.nutrition) setSnap(data.nutrition)
      })
      .catch(err => console.error('[nutrition] load error', err))
  }, [])

  const runSync = useCallback(async () => {
    if (syncing) return
    setSyncing(true)
    dirtyRef.current = true
    const date = localDateKey()
    if (date !== dateRef.current) {
      dateRef.current = date
    }
    try {
      const res = await fetch('/api/nutrition/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date }),
      })
      if (!res.ok) {
        console.error('[nutrition] sync request failed', res.status)
        return
      }
      const body = (await res.json()) as { ok: boolean; nutrition?: NutritionSnapshot; error?: string; step?: string }
      if (body.nutrition) {
        setSnap(body.nutrition)
      } else if (!body.ok && body.error) {
        // Scrape failed — re-read snapshot from DB to show error state
        const readRes = await fetch(`/api/nutrition?date=${date}`)
        if (readRes.ok) {
          const readBody = (await readRes.json()) as { nutrition: NutritionSnapshot | null }
          if (readBody.nutrition) setSnap(readBody.nutrition)
        } else {
          console.error('[nutrition] error-state re-read failed', readRes.status)
        }
      }
    } catch (err) {
      console.error('[nutrition] sync error', err)
    } finally {
      setSyncing(false)
    }
  }, [syncing])

  // ── Status badge ────────────────────────────────────────────────────────────

  const hasError = !!(snap?.lastError)
  const badge = hasError ? (
    <button
      onClick={() => setErrorOpen(o => !o)}
      className="card-badge"
      style={{
        background: 'oklch(0.55 0.22 25 / 0.18)',
        borderColor: 'oklch(0.55 0.22 25 / 0.4)',
        color: 'oklch(0.75 0.18 25)',
        cursor: 'pointer',
        fontFamily: 'var(--font-jetbrains-mono, monospace)',
        fontSize: 10.5,
        padding: '1px 6px',
        borderRadius: 20,
        border: '1px solid',
      }}
    >
      ● ERROR
    </button>
  ) : (
    <span className="badge-live card-badge">● ONLINE</span>
  )

  const fixPrompt = snap ? buildFixPrompt(snap) : ''

  // ── Macros data ─────────────────────────────────────────────────────────────

  const cal = snap?.calories ?? { current: 0, goal: 0 }
  const calPct = pct(cal.current, cal.goal)

  const MACROS = [
    { name: 'Protein', snap: snap?.protein ?? { current: 0, goal: 0 }, unit: 'g', color: COLOR_PROTEIN },
    { name: 'Carbs',   snap: snap?.carbs   ?? { current: 0, goal: 0 }, unit: 'g', color: COLOR_CARBS },
    { name: 'Fat',     snap: snap?.fat     ?? { current: 0, goal: 0 }, unit: 'g', color: COLOR_FAT },
    { name: 'Fiber',   snap: snap?.fiber   ?? { current: 0, goal: 0 }, unit: 'g', color: COLOR_FIBER },
  ]

  const meals = snap?.meals ?? []

  // ── Breakdown data ──────────────────────────────────────────────────────────

  const proteinG = snap?.protein?.current ?? 0
  const carbsG   = snap?.carbs?.current   ?? 0
  const fatG     = snap?.fat?.current     ?? 0
  const fatBreak = snap?.fatBreakdown

  // Good/bad fat bar totals
  const fatTotal = fatBreak ? fatBreak.goodFat + fatBreak.badFat : 0
  const goodPct  = fatTotal > 0 ? Math.round((fatBreak!.goodFat / fatTotal) * 100) : 0

  return (
    <Panel label="Nutrition" badge={badge}>
      {/* Error copyable prompt panel */}
      {hasError && errorOpen && (
        <div
          className="mx-[13px] mb-[10px] rounded-[8px] p-[10px]"
          style={{
            background: 'oklch(0.55 0.22 25 / 0.08)',
            border: '1px solid oklch(0.55 0.22 25 / 0.22)',
          }}
        >
          <div
            className="text-[10.5px] uppercase tracking-[0.08em] mb-[6px] flex items-center justify-between"
            style={{ color: 'oklch(0.75 0.18 25)' }}
          >
            <span>Scraper Error · Fix Prompt</span>
            <button
              onClick={() => {
                navigator.clipboard.writeText(fixPrompt)
                  .then(() => { setCopyLabel('Copied!'); setTimeout(() => setCopyLabel('Copy'), 2000) })
                  .catch(() => { setCopyLabel('Failed'); setTimeout(() => setCopyLabel('Copy'), 2000) })
              }}
              style={{
                color: 'var(--t3)',
                background: 'oklch(1 0 0 / 0.05)',
                border: '1px solid oklch(1 0 0 / 0.08)',
                borderRadius: 4,
                padding: '1px 6px',
                fontSize: 10.5,
                cursor: 'pointer',
              }}
            >
              {copyLabel}
            </button>
          </div>
          <pre
            className="text-[10.5px] whitespace-pre-wrap break-all"
            style={{ color: 'var(--t2)', fontFamily: 'var(--font-jetbrains-mono, monospace)' }}
          >
            {fixPrompt}
          </pre>
        </div>
      )}

      {/* ── Macros view ──────────────────────────────────────────────────────── */}
      {view === 'macros' && (
        <>
          {/* Calorie display */}
          <div className="flex items-end gap-[5px] mb-[11px]">
            <span
              className="text-[36px] font-semibold leading-none"
              style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)', color: 'var(--t1)' }}
            >
              {cal.current.toLocaleString()}
            </span>
            <span
              className="text-[14px] pb-[3px]"
              style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)', color: 'var(--t3)' }}
            >
              / {cal.goal.toLocaleString()}
            </span>
            <span
              className="text-[11px] uppercase tracking-[0.08em] pb-[4px] ml-auto"
              style={{ color: 'var(--t3)' }}
            >
              kcal
            </span>
          </div>

          {/* Calorie bar */}
          <div className="h-[5px] rounded-[3px] overflow-hidden mb-[13px]" style={{ background: 'oklch(1 0 0 / 0.07)' }}>
            <div
              className="h-full rounded-[3px]"
              style={{
                width: `${calPct}%`,
                background: 'linear-gradient(90deg, var(--ac), var(--ag))',
              }}
            />
          </div>

          {/* Macro rows — fat shows total only (no good/bad split in this view) */}
          <div className="flex flex-col gap-[9px]">
            {MACROS.map(m => (
              <div key={m.name} className="flex items-center gap-[10px]">
                <span className="text-[12px] w-[52px] flex-shrink-0" style={{ color: 'var(--t2)' }}>
                  {m.name}
                </span>
                <div className="flex-1 h-1 rounded-[2px] overflow-hidden" style={{ background: 'oklch(1 0 0 / 0.07)' }}>
                  <div
                    className="h-full rounded-[2px]"
                    style={{ width: `${pct(m.snap.current, m.snap.goal)}%`, background: m.color }}
                  />
                </div>
                <span
                  className="text-[11px] min-w-[56px] text-right"
                  style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)', color: 'var(--t2)' }}
                >
                  {m.snap.current} / {m.snap.goal}{m.unit}
                </span>
              </div>
            ))}
          </div>

          {/* Today's Meals */}
          <div className="mt-3 pt-[10px]" style={{ borderTop: '1px solid oklch(1 0 0 / 0.055)' }}>
            <div className="text-[10.5px] uppercase tracking-[0.08em] mb-[6px]" style={{ color: 'var(--t3)' }}>
              Today&apos;s Meals
            </div>
            {meals.length === 0 ? (
              <div className="text-[12px]" style={{ color: 'var(--t3)' }}>No meals logged yet</div>
            ) : meals.map(m => (
              <div key={m.name} className="flex justify-between py-0.5 text-[12px]" style={{ color: 'var(--t2)' }}>
                <span>{m.name}</span>
                <span
                  style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)', color: 'var(--t3)' }}
                >
                  {m.kcal} kcal
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ── Breakdown view ────────────────────────────────────────────────────── */}
      {view === 'breakdown' && (
        <>
          {/* Pie chart centered */}
          <div className="flex flex-col items-center gap-[14px] mb-[14px]">
            <MacroPieChart protein={proteinG} carbs={carbsG} fat={fatG} />

            {/* Legend */}
            <div className="flex gap-[14px]">
              {[
                { label: 'Protein', color: COLOR_PROTEIN, g: proteinG },
                { label: 'Carbs',   color: 'oklch(0.67 0.19 240)', g: carbsG },
                { label: 'Fat',     color: 'oklch(0.67 0.19 165)', g: fatG },
              ].map(item => (
                <div key={item.label} className="flex items-center gap-[5px]">
                  <div
                    className="w-[8px] h-[8px] rounded-[2px] flex-shrink-0"
                    style={{ background: item.color }}
                  />
                  <span className="text-[11px]" style={{ color: 'var(--t2)' }}>
                    {item.label}
                  </span>
                  <span
                    className="text-[11px]"
                    style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)', color: 'var(--t3)' }}
                  >
                    {item.g}g
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Good/bad fat split — only rendered if fat breakdown data is present */}
          {fatBreak && (
            <div
              className="pt-[10px]"
              style={{ borderTop: '1px solid oklch(1 0 0 / 0.055)' }}
            >
              <div className="text-[10.5px] uppercase tracking-[0.08em] mb-[7px]" style={{ color: 'var(--t3)' }}>
                Fat Quality
              </div>

              {/* Split bar */}
              <div className="flex h-[6px] rounded-[3px] overflow-hidden mb-[6px]" style={{ background: 'oklch(1 0 0 / 0.07)' }}>
                <div
                  className="h-full"
                  style={{ width: `${goodPct}%`, background: 'var(--acy)' }}
                />
                <div
                  className="h-full flex-1"
                  style={{ background: 'oklch(0.60 0.22 25)' }}
                />
              </div>

              {/* Labels */}
              <div className="flex justify-between text-[11px]">
                <div className="flex items-center gap-[5px]">
                  <div className="w-[8px] h-[8px] rounded-[2px]" style={{ background: 'var(--acy)' }} />
                  <span style={{ color: 'var(--t2)' }}>Good fat</span>
                  <span style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)', color: 'var(--t3)' }}>
                    {fatBreak.goodFat.toFixed(1)}g
                  </span>
                </div>
                <div className="flex items-center gap-[5px]">
                  <div className="w-[8px] h-[8px] rounded-[2px]" style={{ background: 'oklch(0.60 0.22 25)' }} />
                  <span style={{ color: 'var(--t2)' }}>Bad fat</span>
                  <span style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)', color: 'var(--t3)' }}>
                    {fatBreak.badFat.toFixed(1)}g
                  </span>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* ── View toggle + manual refresh ────────────────────────────────────── */}
      <div
        className="flex items-center justify-between mt-[12px] pt-[10px]"
        style={{ borderTop: '1px solid oklch(1 0 0 / 0.055)' }}
      >
        {/* View toggle buttons */}
        <div
          className="flex rounded-[7px] overflow-hidden"
          style={{ border: '1px solid oklch(1 0 0 / 0.09)', background: 'oklch(1 0 0 / 0.03)' }}
        >
          {(['macros', 'breakdown'] as ViewMode[]).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className="text-[10.5px] px-[8px] py-[4px] capitalize transition-colors duration-150"
              style={{
                background: view === v ? 'oklch(1 0 0 / 0.09)' : 'transparent',
                color: view === v ? 'var(--t1)' : 'var(--t3)',
                fontWeight: view === v ? 600 : 400,
                letterSpacing: '0.03em',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              {v === 'macros' ? 'Macros' : 'Breakdown'}
            </button>
          ))}
        </div>

        {/* Manual refresh button */}
        <button
          onClick={runSync}
          disabled={syncing}
          className="text-[10.5px] px-[8px] py-[4px] rounded-[6px] transition-opacity duration-150"
          style={{
            background: 'oklch(1 0 0 / 0.05)',
            border: '1px solid oklch(1 0 0 / 0.08)',
            color: syncing ? 'var(--t3)' : 'var(--t2)',
            cursor: syncing ? 'not-allowed' : 'pointer',
            opacity: syncing ? 0.5 : 1,
            fontFamily: 'var(--font-jetbrains-mono, monospace)',
          }}
        >
          {syncing ? 'Syncing…' : '↻ Sync'}
        </button>
      </div>
    </Panel>
  )
}
