'use client'

import { useCrmData } from '@/components/dashboard/CrmDataProvider'
import { ClientHeatGrid } from '@/components/dashboard/ClientHeatGrid'

/**
 * Client Metrics — "How's the portfolio?" The book of business. Sortable,
 * health-scored heat-grid across all clients (replaces the old single-client
 * selector drill-down). Fetched independently on mount (its own aggregate
 * endpoint), not part of the polled overview payload.
 */
export default function ClientsPage() {
  const { data, loading, error, hasLoaded } = useCrmData()

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
    <div className="flex flex-col flex-1" style={{ minHeight: 0 }}>
      <ClientHeatGrid clients={data.clients} />
    </div>
  )
}
