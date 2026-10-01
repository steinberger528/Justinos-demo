'use client'

import { useCrmData } from '@/components/dashboard/CrmDataProvider'
import { KpiBoard } from '@/components/dashboard/KpiBoard'
import { BusinessMetricsStrip } from '@/components/dashboard/BusinessMetricsStrip'
import { FlaggedMessagesCard } from '@/components/dashboard/FlaggedMessagesCard'
import { ExceptionsRollup } from '@/components/dashboard/ExceptionsRollup'

/**
 * Executive Dashboard — "What changed / what's on fire?" Roll-up + drill-down
 * only; holds no primary detail work. KPI board -> Business Metrics Strip
 * (Executive-only per spec) -> Flagged Messages + Exceptions roll-up side by
 * side: FlaggedMessagesCard sizes to its content (Panel `capHeight`, per
 * specs/flagged-messages-expansion.md) while ExceptionsRollup still uses
 * Panel `fill`, stretching to the row's full height so the row as a whole
 * still fills the viewport even when Flagged Messages is short.
 */
export default function ExecutivePage() {
  const { data, loading, error, hasLoaded, reload, messages, messagesError } = useCrmData()

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
    <div className="flex flex-col gap-[15px] flex-1" style={{ minHeight: 0 }}>
      <KpiBoard
        snapshots={data.metrics_snapshots}
        current={{
          revenue: data.business_metrics.revenue_total,
          clients: data.business_metrics.clients_active,
          pipeline: data.business_metrics.prospects_in_pipeline,
          costToday: data.cost.today_usd,
        }}
      />

      <BusinessMetricsStrip
        metrics={data.business_metrics}
        onUpdated={reload}
        messagesData={messages}
        messagesError={messagesError}
      />

      <div className="grid gap-[15px] flex-1" style={{ gridTemplateColumns: '1fr 330px', minHeight: 0 }}>
        <FlaggedMessagesCard />
        <ExceptionsRollup />
      </div>
    </div>
  )
}
