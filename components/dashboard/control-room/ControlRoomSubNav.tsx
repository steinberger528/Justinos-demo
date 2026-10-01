'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { useControlRoomData } from '../ControlRoomDataProvider'

const SUBTABS = [
  { label: 'How it works', href: '/control-room/overview' },
  { label: 'Work Session', href: '/control-room/work-session' },
  { label: 'Agent Flows', href: '/control-room/agent-flows' },
  { label: 'Automations', href: '/control-room/automations' },
] as const

/**
 * Segmented sub-nav, CrmSubNav's exact markup and geometry. Badge counts always
 * render on the three status sections, including 0: "0" is honest telemetry, not
 * omitted. The walkthrough section has nothing to count, so it has no badge.
 */
export function ControlRoomSubNav() {
  const pathname = usePathname()
  const { data } = useControlRoomData()

  const liveSessionsToday = data.telemetry.live_sessions?.payload.sessions.length ?? 0

  const badgeFor = (href: string): number | null => {
    switch (href) {
      case '/control-room/work-session':
        return liveSessionsToday
      case '/control-room/agent-flows':
        return 4 // fixed agent roster size (Neptune / Athena / Ares / Iris)
      case '/control-room/automations':
        return data.capabilities.length
      default:
        return null
    }
  }

  return (
    <nav
      className="flex gap-1 items-center flex-shrink-0 overflow-x-auto [scrollbar-width:none]"
      style={{ height: 44, boxSizing: 'border-box', borderBottom: '1px solid var(--ui-border)', marginBottom: 15 }}
    >
      {SUBTABS.map(tab => {
        const active = pathname.startsWith(tab.href)
        const badge = badgeFor(tab.href)
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              'flex items-center gap-[6px] px-[12px] py-[5px] rounded-[7px] text-[12.5px] font-medium whitespace-nowrap transition-colors duration-150 border',
              active
                ? 'border-[var(--ui-border)] text-[var(--t1)]'
                : 'border-transparent text-[var(--t2)] hover:text-[var(--t1)]',
            )}
            style={active ? { background: 'oklch(1 0 0 / 0.09)' } : undefined}
          >
            {tab.label}
            {badge !== null && <span className="card-badge">{badge}</span>}
          </Link>
        )
      })}
    </nav>
  )
}
