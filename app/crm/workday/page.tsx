'use client'

import { useCrmData } from '@/components/dashboard/CrmDataProvider'
import { DailyBriefingCard } from '@/components/dashboard/DailyBriefingCard'
import { OneHourWorkdayCard } from '@/components/dashboard/OneHourWorkdayCard'

/**
 * Workday — "What do I do next?" Today's actions + briefing; nothing about
 * agent internals. Both cards use Panel `fill` so a long escalation list or
 * an oversized briefing scrolls internally by default (still allowed to
 * push page scroll if a user-expanded section genuinely exceeds the
 * viewport, per spec).
 */
export default function WorkdayPage() {
  const { data, loading, error, hasLoaded, reload, markDirty } = useCrmData()

  if (loading && !hasLoaded) {
    return (
      <div style={{ color: 'var(--t3)', fontSize: 12, padding: '24px 0' }}>
        Loading cockpit…
      </div>
    )
  }

  if (error && !hasLoaded) {
    return (
      <div style={{ color: 'oklch(0.7 0.22 25)', fontSize: 12, padding: '24px 0' }}>
        {error}
      </div>
    )
  }

  return (
    <div className="grid gap-[15px] flex-1" style={{ gridTemplateColumns: '1fr 1fr', minHeight: 0 }}>
      <DailyBriefingCard />
      <OneHourWorkdayCard
        inbox={data.inbox}
        clients={data.clients}
        agents={data.agents}
        onResolved={reload}
        onDirtyChange={markDirty}
      />
    </div>
  )
}
