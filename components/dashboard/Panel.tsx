'use client'

import { cn } from '@/lib/utils'

interface PanelProps {
  label: React.ReactNode
  badge?: React.ReactNode
  /** Extra element in the header after the badge (e.g. an icon button) */
  action?: React.ReactNode
  /** Override card body padding/class */
  bodyClass?: string
  className?: string
  /**
   * When true, the card body grows to fill its flex/grid ancestor's height
   * and scrolls internally instead of the page scrolling — the mechanism
   * every "internal scroll instead of page scroll" CRM sub-tab card depends
   * on. `.card-body`'s base class has no `min-height: 0`, and a plain
   * `flex: 1` child inside a flex column won't shrink below its content size
   * without it (the classic flexbox scroll-clipping bug) — this also
   * requires the Panel's own wrapping `.glass` element to have a real,
   * bounded height from its parent (a flex/grid ancestor with
   * `min-height: 0`), not `items-start` auto-sizing.
   */
  fill?: boolean
  /**
   * Sizes to content (like the default, non-`fill` mode) but caps at the
   * grid row's available height and scrolls internally beyond that cap —
   * `fill`'s ceiling without `fill`'s forced stretch when content is
   * shorter than the row. Scoped addition for FlaggedMessagesCard
   * (specs/flagged-messages-expansion.md); reach for `fill` instead unless
   * a card specifically needs to shrink below the row height on its own.
   */
  capHeight?: boolean
  children: React.ReactNode
}

export function Panel({ label, badge, action, bodyClass, className, fill, capHeight, children }: PanelProps) {
  return (
    <div
      className={cn('glass accent-glow', className)}
      style={
        fill
          ? { minHeight: 0, height: '100%' }
          : capHeight
          ? { alignSelf: 'start', maxHeight: '100%', minHeight: 0 }
          : undefined
      }
    >
      <div className="card-header">
        <span className="card-label">{label}</span>
        {(badge || action) && (
          <div className="flex items-center gap-2">
            {badge && <span className="card-badge">{badge}</span>}
            {action}
          </div>
        )}
      </div>
      <div
        className={cn('card-body', bodyClass)}
        style={fill || capHeight ? { flex: 1, minHeight: 0, overflowY: 'auto' } : undefined}
      >
        {children}
      </div>
    </div>
  )
}
