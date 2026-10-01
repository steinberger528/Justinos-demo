// Shared types for the School tab. Mirrors supabase/migrations/0013_school.sql
// exactly — school items are plain `tasks` rows with these columns populated,
// no parallel table. See specs/school-tab.md.

export type SchoolItemType = 'assignment' | 'exam' | 'quiz' | 'project' | 'milestone' | 'lab' | 'reading'
export type SchoolComponent = 'group' | 'individual'

export interface Topic {
  label: string
  done: boolean
}

export interface SchoolTask {
  id: string
  entity_id: string | null
  parent_task_id: string | null
  title: string
  description: string | null
  item_type: SchoolItemType | null
  component: SchoolComponent | null
  urgency: string
  key: boolean
  blocked: boolean
  in_progress: boolean
  is_working: boolean
  priority_score: number
  tags: string[]
  due_date: string | null
  date_is_placeholder: boolean
  completed_at: string | null
  topics: Topic[]
  study_plan: unknown | null
  created_at: string
  updated_at: string
}

export interface CourseScheduleBlock {
  day: string[]
  start: string   // "HH:MM", 24h
  end: string     // "HH:MM", 24h
  room: string
}

export interface CourseGradingComponent {
  component: string
  weight: number
  note?: string
}

export interface CourseMetadata {
  code: string
  title: string
  professor: string[]
  schedule: CourseScheduleBlock[]
  office_hours: string
  required_text: string
  grading_breakdown: CourseGradingComponent[]
  policies: string[]
  policy_severity: 'standard' | 'strict'
  topics: string[]
  semester: string
}

export interface CourseEntity {
  id: string
  user_id: string
  name: string
  kind: 'course'
  metadata: CourseMetadata
  created_at: string
}

export interface SchoolOverview {
  courses: CourseEntity[]
  tasks: SchoolTask[]
}
