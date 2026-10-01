import { Shell } from '@/components/dashboard/Shell'
import { TopRail } from '@/components/dashboard/TopRail'
import { DayRulesSettings } from '@/components/dashboard/DayRulesSettings'
import { TabGuide } from '@/components/demo/TabGuide'

// Settings. Day rules and study weights first: they drive every plan Neptune builds.
// Reached from the avatar in the top rail (the avatar is the settings button, no gear icon).
export default function SettingsPage() {
  return (
    <Shell>
      <TopRail />
      <div style={{ maxWidth: 760 }}>
        <TabGuide />
        <div className="mt-[15px]">
          <DayRulesSettings />
        </div>
      </div>
    </Shell>
  )
}
