'use client'

import { useControlRoomData } from '../ControlRoomDataProvider'

/**
 * Shared "Blast radius" card (spec R3 — the one right-column card that appears in
 * every section that has a right column: Work Session and Automations, per the
 * re-synced artboards; Agent Flows' artboard has no Blast radius card at all — see
 * the build's coverage report). Extracted out of the old shared RightRail.tsx.
 *
 * Write-target counts (vault/Supabase/git) are Open Decision 1 in the spec,
 * unresolved — ships with option (c): S1/S3 tiles + the two policy assertions only,
 * no per-target counts (matches the prior build's posture).
 */
export function BlastRadiusCard() {
  const { data } = useControlRoomData()
  const { capabilities } = data

  const s3Count = capabilities.filter(c => c.autonomy === 'S3').length
  const s1Count = capabilities.filter(c => c.autonomy === 'S1').length

  return (
    <div className="glass accent-glow">
      <div className="card-header">
        <span className="card-label">Blast radius</span>
        <span className="card-badge" style={{ color: 'var(--ag)' }}>clear</span>
      </div>
      <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ flex: 1, padding: '10px 12px', borderRadius: 8, border: '1px solid var(--ui-border)', display: 'flex', flexDirection: 'column', gap: 3 }}>
            <span style={{ fontSize: 10.5, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Act unattended</span>
            <span style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)', fontSize: 19, fontWeight: 600 }}>
              {s3Count} <span style={{ fontSize: 12, color: 'var(--t3)' }}>S3</span>
            </span>
          </div>
          <div style={{ flex: 1, padding: '10px 12px', borderRadius: 8, border: '1px solid var(--ui-border)', display: 'flex', flexDirection: 'column', gap: 3 }}>
            <span style={{ fontSize: 10.5, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Suggest only</span>
            <span style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)', fontSize: 19, fontWeight: 600 }}>
              {s1Count} <span style={{ fontSize: 12, color: 'var(--t3)' }}>S1</span>
            </span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '9px 10px', borderRadius: 8, border: '1px solid oklch(0.67 0.19 165 / 0.28)', background: 'oklch(0.67 0.19 165 / 0.06)' }}>
          <svg width={14} height={14} viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0, marginTop: 1 }}>
            <path d="M3 8.5L6.2 11.5L13 4.5" stroke="var(--ag)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span style={{ fontSize: 11, lineHeight: 1.45 }}>No S3 capability can send email, delete vault content, or touch money.</span>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '9px 10px', borderRadius: 8, border: '1px solid oklch(0.78 0.16 75 / 0.28)', background: 'oklch(0.78 0.16 75 / 0.05)' }}>
          <svg width={14} height={14} viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0, marginTop: 1 }}>
            <path d="M8 3.5V9" stroke="var(--warn)" strokeWidth="1.6" strokeLinecap="round" />
            <circle cx="8" cy="12" r="1" fill="var(--warn)" />
          </svg>
          <span style={{ fontSize: 11, lineHeight: 1.45 }}>Cloud routines ship every connector with write access. None running yet.</span>
        </div>
      </div>
    </div>
  )
}
