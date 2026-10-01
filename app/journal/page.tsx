import { Shell }          from '@/components/dashboard/Shell'
import { TopRail }        from '@/components/dashboard/TopRail'
import { BrainstormCard } from '@/components/dashboard/BrainstormCard'
import { JournalCard }    from '@/components/dashboard/JournalCard'
import { TabGuide }       from '@/components/demo/TabGuide'

export default function JournalPage() {
  return (
    <Shell>
      <TopRail />
      <TabGuide />
      <div className="grid gap-[15px] mt-[15px] items-start grid-cols-1 min-[1150px]:[grid-template-columns:1fr_1fr]">
        <BrainstormCard />
        <JournalCard />
      </div>
    </Shell>
  )
}
