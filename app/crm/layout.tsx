'use client'

import { Shell } from '@/components/dashboard/Shell'
import { TopRail } from '@/components/dashboard/TopRail'
import { CrmDataProvider } from '@/components/dashboard/CrmDataProvider'
import { CrmSubNav } from '@/components/dashboard/CrmSubNav'
import { CrmViewport } from '@/components/dashboard/CrmViewport'
import { TabGuide } from '@/components/demo/TabGuide'

/**
 * Shared layout for all four CRM sub-tabs (/crm/executive, /workday, /agents,
 * /clients). Shell + TopRail render once per CRM section, not once per sub-tab.
 * CrmDataProvider is mounted here too — Next.js layouts persist across
 * sibling-route navigation, so switching sub-tabs (leaf page.tsx swap under this
 * layout) does not remount the provider or refetch /api/crm/overview.
 *
 * The column below is height-bounded so each sub-tab's cards scroll internally
 * instead of the page. The guide and the sub-nav take what they need and
 * CrmViewport gets the rest.
 */
export default function CrmLayout({ children }: { children: React.ReactNode }) {
  return (
    <Shell>
      <TopRail />
      <CrmDataProvider>
        <div className="crm-column">
          <TabGuide />
          <CrmSubNav />
          <CrmViewport>{children}</CrmViewport>
        </div>
      </CrmDataProvider>
    </Shell>
  )
}
