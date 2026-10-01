'use client'

import { useCrmData } from '@/components/dashboard/CrmDataProvider'
import { AgentFeedCard } from '@/components/dashboard/AgentFeedCard'
import { JobsKanban } from '@/components/dashboard/JobsKanban'
import { AgentStatusCards } from '@/components/dashboard/AgentStatusCards'
import { CostMeterCard } from '@/components/dashboard/CostMeterCard'

/**
 * Agent Feed — "What are my agents doing?" The machine layer. Preserves the
 * old cockpit's two-column layout (feed+kanban wide, status+cost narrow),
 * now bounded to CrmViewport's height. Feed and kanban get Panel `fill` so
 * long lists scroll internally; kanban drag/`dirtyRef` wiring is unchanged,
 * just sourced from the shared CrmDataProvider instead of local cockpit state.
 */
export default function AgentsPage() {
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
    <div className="grid gap-[15px] flex-1" style={{ gridTemplateColumns: '1fr 330px', minHeight: 0 }}>
      <div className="flex flex-col gap-[15px]" style={{ minHeight: 0 }}>
        <div style={{ flex: 1, minHeight: 0 }}>
          <AgentFeedCard feed={data.feed} agents={data.agents} clients={data.clients} />
        </div>
        <div style={{ flex: 1, minHeight: 0 }}>
          <JobsKanban
            jobsByState={data.jobs_by_state}
            agents={data.agents}
            clients={data.clients}
            onChanged={reload}
            onDirtyChange={markDirty}
          />
        </div>
      </div>
      <div className="flex flex-col gap-[15px]" style={{ minHeight: 0 }}>
        <CostMeterCard cost={data.cost} />
        <div style={{ flex: 1, minHeight: 0 }}>
          <AgentStatusCards agents={data.agents} clients={data.clients} />
        </div>
      </div>
    </div>
  )
}
