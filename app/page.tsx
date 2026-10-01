import { Shell }         from '@/components/dashboard/Shell'
import { TopRail }       from '@/components/dashboard/TopRail'
import { TasksCard }     from '@/components/dashboard/TasksCard'
import { KeyBlockersCard } from '@/components/dashboard/KeyBlockersCard'
import { NutritionCard } from '@/components/dashboard/NutritionCard'
import { SessionCard }   from '@/components/dashboard/SessionCard'
import { HabitCard }     from '@/components/dashboard/HabitCard'
import { CalendarCard }  from '@/components/dashboard/CalendarCard'
import { InsightCard }   from '@/components/dashboard/InsightCard'
import { GoalsCard }     from '@/components/dashboard/GoalsCard'
import { TabGuide }      from '@/components/demo/TabGuide'

export default function HomePage() {
  return (
    <Shell>
      <TopRail />
      <TabGuide />

      {/* Layout lives in globals.css (.home-grid): desktop is
          [left | session over (center | right)], a split window drops the
          right column under the center one, and a phone stacks everything
          with the Session capture bar first. */}
      <div className="home-grid mt-[15px]">
        <div className="home-left">
          <TasksCard />
          <KeyBlockersCard />
          <NutritionCard />
        </div>

        <div className="home-main">
          <div className="home-session">
            <SessionCard />
          </div>

          <div className="home-sub">
            <div className="home-center">
              <HabitCard />
              <CalendarCard />
            </div>
            <div className="home-right">
              <InsightCard />
              <GoalsCard />
            </div>
          </div>
        </div>
      </div>
    </Shell>
  )
}
