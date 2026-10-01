'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { useCrmData } from './CrmDataProvider'

const SUBTABS = [
  { label: 'Executive', href: '/crm/executive' },
  { label: 'Workday',   href: '/crm/workday' },
  { label: 'Agents',    href: '/crm/agents' },
  { label: 'Clients',   href: '/crm/clients' },
] as const

/**
 * Segmented sub-nav for the four CRM sub-tabs. Badge counts are always
 * rendered, including 0 (spec requirement — "0" reads as honest telemetry,
 * not omitted). Active state via usePathname(), same pattern as TopRail.tsx.
 */
export function CrmSubNav() {
  const pathname = usePathname()
  const { data, activeMessageCount } = useCrmData()

  const badgeFor = (href: string): number => {
    switch (href) {
      case '/crm/executive':
        // Unacknowledged flagged messages + blocked jobs (per spec).
        return activeMessageCount + (data.jobs_by_state.blocked?.length ?? 0)
      case '/crm/workday':
        return data.inbox.length
      case '/crm/agents':
        return data.agents.filter(a => a.status === 'working').length
      case '/crm/clients':
        return data.clients.length
      default:
        return 0
    }
  }

  return (
    <nav
      className="flex gap-1 items-center flex-shrink-0"
      style={{ height: 44, boxSizing: 'border-box', borderBottom: '1px solid var(--ui-border)' }}
    >
      {SUBTABS.map(tab => {
        const active = pathname.startsWith(tab.href)
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
            <span className="card-badge">{badgeFor(tab.href)}</span>
          </Link>
        )
      })}
    </nav>
  )
}
