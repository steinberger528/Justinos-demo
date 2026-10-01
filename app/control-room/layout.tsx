'use client'

import { Shell } from '@/components/dashboard/Shell'
import { TopRail } from '@/components/dashboard/TopRail'
import { ControlRoomDataProvider } from '@/components/dashboard/ControlRoomDataProvider'
import { SummaryStrip } from '@/components/dashboard/control-room/SummaryStrip'
import { ControlRoomSubNav } from '@/components/dashboard/control-room/ControlRoomSubNav'
import { TabGuide } from '@/components/demo/TabGuide'

/**
 * Shared layout for the Control Room sections. Follows app/crm/layout.tsx, with one
 * deliberate difference: no height-bounded viewport. This is a status page read on a
 * second monitor, so the leaf pages scroll the page normally.
 *
 * SummaryStrip and ControlRoomSubNav render here so switching sections (leaf
 * page.tsx swap under this layout) does not remount ControlRoomDataProvider or
 * refetch /api/control-room/overview.
 */
export default function ControlRoomLayout({ children }: { children: React.ReactNode }) {
  return (
    <Shell>
      <TopRail />
      <ControlRoomDataProvider>
        <TabGuide />
        <div style={{ paddingTop: 14, paddingBottom: 14 }}>
          <SummaryStrip />
          <ControlRoomSubNav />
          {children}
        </div>
      </ControlRoomDataProvider>
    </Shell>
  )
}
