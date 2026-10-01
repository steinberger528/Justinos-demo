import Link from 'next/link'
import { Shell }    from '@/components/dashboard/Shell'
import { TopRail }  from '@/components/dashboard/TopRail'
import { Panel }    from '@/components/dashboard/Panel'
import { TabGuide } from '@/components/demo/TabGuide'

const TODAY = [
  { name: 'Nutrition card', where: 'Home, left column', what: "Daily calories and macros, synced from a food log. Meeting the calorie goal checks the Nutrition habit on its own." },
  { name: 'Habit Tracker', where: 'Home, center column', what: 'Six daily habits. Two of them are routines with their own steps.' },
  { name: 'Workout window', where: 'Morning brief', what: 'The planner finds up to two open windows for a workout and offers them. It never schedules one without a yes.' },
]

// The Health tab has no page in the real dashboard yet. Rather than leave a dead
// link in the demo, this page says so and points at where the health data lives today.
export default function HealthPage() {
  return (
    <Shell>
      <TopRail />
      <div style={{ maxWidth: 860 }}>
        <TabGuide />
        <div className="mt-[15px]">
          <Panel label="Health" badge="not built yet">
            <div className="flex flex-col gap-[12px]">
              <p className="text-[12.5px] leading-[1.6]" style={{ color: 'var(--t2)' }}>
                This tab is a placeholder. The pieces below already exist and run every day, on other screens.
              </p>
              <div className="flex flex-col gap-[8px]">
                {TODAY.map(item => (
                  <div key={item.name} className="px-[11px] py-[9px] rounded-[8px]" style={{ border: '1px solid var(--ui-border)' }}>
                    <div className="flex items-baseline justify-between gap-[10px]">
                      <span className="text-[13px] font-semibold" style={{ color: 'var(--t1)' }}>{item.name}</span>
                      <span className="text-[10.5px]" style={{ color: 'var(--t3)', fontFamily: 'var(--font-jetbrains-mono, monospace)' }}>{item.where}</span>
                    </div>
                    <div className="text-[12px] mt-[3px] leading-[1.5]" style={{ color: 'var(--t2)' }}>{item.what}</div>
                  </div>
                ))}
              </div>
              <Link href="/" className="text-[12.5px] self-start" style={{ color: 'var(--acy)' }}>Go to Home →</Link>
            </div>
          </Panel>
        </div>
      </div>
    </Shell>
  )
}
