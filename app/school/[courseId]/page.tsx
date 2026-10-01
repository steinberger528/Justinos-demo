import { Shell }              from '@/components/dashboard/Shell'
import { TopRail }            from '@/components/dashboard/TopRail'
import { SchoolCourseDetail } from '@/components/dashboard/SchoolCourseDetail'
import { COURSE_IDS }         from '@/lib/demo/ids'

// A static export needs every course page listed at build time. The demo's courses
// are fixed sample data, so the list is known.
export const dynamicParams = false

export function generateStaticParams() {
  return COURSE_IDS.map(courseId => ({ courseId }))
}

export default async function SchoolCoursePage({
  params,
}: {
  params: Promise<{ courseId: string }>
}) {
  const { courseId } = await params

  return (
    <Shell>
      <TopRail />
      <div className="mt-[18px]">
        <SchoolCourseDetail courseId={courseId} />
      </div>
    </Shell>
  )
}
