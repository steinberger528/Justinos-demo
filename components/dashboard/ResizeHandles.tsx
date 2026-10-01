'use client'

import type { ResizeHandle } from '@/lib/use-resizable'

const HANDLES: { handle: ResizeHandle; style: React.CSSProperties; cursor: string }[] = [
  { handle: 'n', style: { top: 0, left: 10, right: 10, height: 6 }, cursor: 'ns-resize' },
  { handle: 's', style: { bottom: 0, left: 10, right: 10, height: 6 }, cursor: 'ns-resize' },
  { handle: 'w', style: { top: 10, left: 0, bottom: 10, width: 6 }, cursor: 'ew-resize' },
  { handle: 'e', style: { top: 10, right: 0, bottom: 10, width: 6 }, cursor: 'ew-resize' },
  { handle: 'nw', style: { top: 0, left: 0, width: 12, height: 12 }, cursor: 'nwse-resize' },
  { handle: 'ne', style: { top: 0, right: 0, width: 12, height: 12 }, cursor: 'nesw-resize' },
  { handle: 'sw', style: { bottom: 0, left: 0, width: 12, height: 12 }, cursor: 'nesw-resize' },
  { handle: 'se', style: { bottom: 0, right: 0, width: 14, height: 14 }, cursor: 'nwse-resize' },
]

/**
 * Invisible drag strips along every edge and corner of a `position: relative`
 * container, wired to a `useResizable` drag handler — drop into any modal's
 * outer dialog `<div>` to make it resizable like a normal window. The
 * bottom-right corner gets a small diagonal-line grip as a visible affordance.
 */
export function ResizeHandles({ onStart }: { onStart: (handle: ResizeHandle) => (e: React.PointerEvent) => void }) {
  return (
    <>
      {HANDLES.map(({ handle, style, cursor }) => (
        <div
          key={handle}
          onPointerDown={onStart(handle)}
          style={{ position: 'absolute', cursor, zIndex: 5, ...style }}
        >
          {handle === 'se' && (
            <div style={{
              position: 'absolute', bottom: 3, right: 3, width: 8, height: 8,
              backgroundImage:
                'linear-gradient(135deg, transparent 40%, oklch(1 0 0 / 0.3) 40% 55%, transparent 55% 70%, oklch(1 0 0 / 0.3) 70% 85%, transparent 85%)',
            }} />
          )}
        </div>
      ))}
    </>
  )
}
