'use client'

import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useResizable } from '@/lib/use-resizable'
import { GoalRow, sectionLabelStyle, type Goal } from './GoalsCard'
import { ResizeHandles } from './ResizeHandles'

interface GoalsModalProps {
  open: boolean
  onClose: () => void
  goals: Goal[]
  onRefresh: () => void
}

/**
 * Full-screen expansion of the Goals card (specs/... none — quick UX tweak).
 * Reuses GoalRow as-is so step-toggle/edit/numeric-stepper/reorder logic isn't
 * duplicated; each row keeps its own independent expand state, so opening the
 * modal starts with everything collapsed and the user "focuses" on a goal
 * simply by clicking it — no separate accordion state needed.
 */
export function GoalsModal({ open, onClose, goals, onRefresh }: GoalsModalProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const previouslyFocusedRef = useRef<HTMLElement | null>(null)

  const { size, startResize } = useResizable(
    'dashboard.modalSize.goals',
    { width: 820, height: 680 },
    { width: 480, height: 360 },
  )

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

  if (!open) return null

  const timedGoals = goals.filter(g => g.tab === 'timed')
  const ongoingGoals = goals.filter(g => g.tab === 'ongoing')

  // Rendered via createPortal straight to document.body: the cards this opens from
  // use `backdrop-filter`, which (like `transform`/`filter`/`zoom`) makes an
  // element the containing block for `position: fixed` descendants in Chromium.
  // Left as a plain DOM descendant, this scrim would be clipped/positioned against
  // that card instead of the real viewport. A portal escapes it entirely.
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
        aria-label="Goals"
        tabIndex={-1}
        onClick={e => e.stopPropagation()}
        className="glass"
        style={{
          width: size.width, height: size.height,
          display: 'flex', flexDirection: 'column', borderRadius: 12, overflow: 'hidden',
          outline: 'none', position: 'relative',
          // Nearly-opaque override of `.glass`'s ~55%-alpha background — over
          // the busy dashboard behind it, that translucency made the modal's
          // own text hard to read.
          background: 'oklch(0.13 0.02 255 / 0.97)',
        }}
      >
        <ResizeHandles onStart={startResize} />
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '13px 18px', borderBottom: '1px solid oklch(1 0 0 / 0.08)', flexShrink: 0,
        }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--t1)' }}>Goals</span>
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

        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '16px 20px' }}>
          {goals.length === 0 ? (
            <div style={{ color: 'var(--t3)', fontSize: 13, padding: '20px 0', textAlign: 'center' }}>
              No goals yet.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div>
                <span style={sectionLabelStyle}>Timed</span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {timedGoals.length === 0 ? (
                    <div style={{ color: 'var(--t3)', fontSize: 12 }}>No timed goals yet.</div>
                  ) : (
                    timedGoals.map(g => (
                      <GoalRow key={g.id} goal={g} onRefresh={onRefresh} large />
                    ))
                  )}
                </div>
              </div>

              <div>
                <span style={sectionLabelStyle}>Ongoing</span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {ongoingGoals.length === 0 ? (
                    <div style={{ color: 'var(--t3)', fontSize: 12 }}>No ongoing goals yet.</div>
                  ) : (
                    ongoingGoals.map(g => (
                      <GoalRow key={g.id} goal={g} onRefresh={onRefresh} large />
                    ))
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
