import { Shell }     from '@/components/dashboard/Shell'
import { TopRail }   from '@/components/dashboard/TopRail'
import { SchoolTab } from '@/components/dashboard/SchoolTab'
import { TabGuide }  from '@/components/demo/TabGuide'

export default function SchoolPage() {
  return (
    <Shell>
      <TopRail />
      <TabGuide />
      <div className="mt-[15px]">
        <SchoolTab />
      </div>
    </Shell>
  )
}
