'use client'

/**
 * Wrapper for the four CRM sub-tab leaf pages — supplies the "real ancestor
 * height" that Panel's `fill` prop needs to actually shrink and scroll
 * internally instead of the outer viewport silently clipping.
 *
 * It fills whatever is left of `.crm-column` (globals.css), which is sized to
 * the window minus the top rail, the demo banner and the shell's bottom
 * padding. `overflow-y: auto` is the graceful fallback for genuinely oversized
 * content: expanding a card must never be blocked or clipped.
 */
export function CrmViewport({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="flex flex-col"
      style={{
        flex: 1,
        overflowY: 'auto',
        minHeight: 0,
        boxSizing: 'border-box',
        paddingTop: 14,
        paddingBottom: 14,
      }}
    >
      {children}
    </div>
  )
}
