// Shape of the demo's in-browser database. It mirrors the production Postgres tables
// closely enough that the handlers in ./routes read like the real API routes.

import type {
  Agent, AgentJob, AgentRun, Briefing, BriefingItem, BusinessMetrics, Client,
  FlaggedMessage, MetricsSnapshot,
} from '@/components/dashboard/crm-types'
import type { Capability, ControlRoomTelemetry } from '@/components/dashboard/control-room-types'
import type { CourseEntity, SchoolComponent, SchoolItemType, Topic } from '@/lib/school-types'
import type { DayRuleBody } from '@/lib/day-rules'

/** One `tasks` row. School items are ordinary tasks with the school columns filled in. */
export interface TaskRow {
  id: string
  title: string
  description: string | null
  urgency: string
  key: boolean
  blocked: boolean
  blocked_since: string | null
  priority_score: number
  tags: string[]
  block_type: string | null
  due_date: string | null
  planned_date: string | null
  date_is_placeholder: boolean
  time_estimate_min: number | null
  in_progress: boolean
  is_working: boolean
  completed_at: string | null
  created_at: string
  updated_at: string
  entity_id: string | null
  parent_task_id: string | null
  item_type: SchoolItemType | null
  component: SchoolComponent | null
  topics: Topic[]
  study_plan: unknown | null
}

export interface HabitState {
  done: boolean
  steps?: boolean[]
}

export interface MacroSnapshot { current: number; goal: number }

export interface NutritionSnapshot {
  calories: MacroSnapshot
  protein: MacroSnapshot
  carbs: MacroSnapshot
  fat: MacroSnapshot
  fiber: MacroSnapshot
  fatBreakdown?: { goodFat: number; badFat: number }
  meals: { name: string; kcal: number }[]
  syncedAt: string
  lastError?: string
  lastErrorStep?: string
}

/** One `daily_logs` row: habits and the nutrition snapshot share it, keyed by date. */
export interface DailyLog {
  habits?: Record<string, HabitState>
  nutrition?: NutritionSnapshot
  /** Set when the Nutrition habit was unchecked by hand, so a sync will not re-check it. */
  nutritionAutoSuppressed?: boolean
}

export interface GoalStepRow {
  id: string
  goal_id: string
  text: string
  done: boolean
  sort_order: number
  created_at: string
}

export interface GoalRow {
  id: string
  user_id: string
  name: string
  type: 'checklist' | 'numeric'
  tab: 'ongoing' | 'timed'
  due_date: string | null
  target_number: number | null
  start_number: number | null
  current_number: number
  sort_order: number
  completed_at: string | null
  archived_at: string | null
  created_at: string
}

/** A one-off calendar event (in production these live in Google Calendar). */
export interface CalendarEventRow {
  id: string
  title: string
  start: string
  end: string
  location?: string
}

export interface FixedEventRow {
  id: string
  label: string
  kind: 'class' | 'work' | 'protected' | 'other'
  days: string[]
  start: string
  end: string
  location: string | null
  buffer_before: number
  buffer_after: number
  hard: boolean
  effective_from: string | null
  effective_to: string | null
  source: 'manual' | 'vault' | 'google'
  vault_path: string | null
  gcal_event_id: string | null
}

export interface DayRuleRow extends DayRuleBody {
  id: string
}

export interface PlanBlock {
  start: string
  end: string
  type: string
  title: string
  task_ids?: string[]
  source_rule?: string | null
}

export interface DayPlanRow {
  date: string
  status: 'draft' | 'final'
  blocks: PlanBlock[]
  quote_used: string | null
  carried_over: string[]
  pushed: { task_id: string; reason: string }[]
  generated_at: string | null
  finalized_at: string | null
}

export interface BriefQuestionRow {
  id: string
  date: string
  kind: 'deadline' | 'rollover' | 'backlog' | 'progress' | 'open'
  question: string
  answer: string | null
}

export interface JournalEntryRow {
  id: string
  entry_date: string
  emoji_mood: number
  named_moods: string[]
  tags: string[]
  prompt: string | null
  body: string
  source: 'voice' | 'text' | 'photo'
  image_ref: string | null
  created_at: string
  updated_at: string
}

export interface ReflectionRow {
  week_start: string
  summary: string | null
  mood_trend: string | null
  themes: string[]
  observation: string | null
  generated_at: string
}

export interface IdeaRow {
  id: string
  title: string
  summary: string | null
  body: string | null
  tags: string[]
  theme: string | null
  source: string | null
  vault_path: string | null
  related: string[]
  created_at: string
  updated_at: string
}

export interface IdeaCaptureRow {
  id: string
  text: string
  source: string
  status: 'pending' | 'synced'
  created_at: string
}

export interface ClientMetricRow {
  client_id: string
  metric: string
  engine: string | null
  value: number
  captured_on: string
}

export interface AuditRow {
  id: string
  at: string
  action: string
  resource_type: string
  resource_id: string | null
  metadata: Record<string, unknown>
}

export interface NoteRow {
  id: string
  text: string
  source_type: string
  created_at: string
}

export interface RawCaptureRow {
  id: string
  raw_text: string
  source: string
  classification: unknown
  created_at: string
}

export interface Quote { id: string; text: string; attribution: string }

export interface DemoDB {
  version: number
  /** The local date the sample data was generated for. A new day re-seeds. */
  seededOn: string
  tasks: TaskRow[]
  courses: CourseEntity[]
  dailyLogs: Record<string, DailyLog>
  goals: GoalRow[]
  goalSteps: GoalStepRow[]
  calendarEvents: CalendarEventRow[]
  fixedEvents: FixedEventRow[]
  dayRules: DayRuleRow[]
  dayPlans: Record<string, DayPlanRow>
  briefQuestions: BriefQuestionRow[]
  journalEntries: JournalEntryRow[]
  journalReflection: ReflectionRow | null
  ideas: IdeaRow[]
  ideasInsight: { insight: string | null; generated_at: string | null } | null
  ideaCaptures: IdeaCaptureRow[]
  notes: NoteRow[]
  rawCaptures: RawCaptureRow[]
  crm: {
    clients: Client[]
    agents: Agent[]
    jobs: AgentJob[]
    runs: AgentRun[]
    businessMetrics: BusinessMetrics
    snapshots: MetricsSnapshot[]
    /** Spend before today, so the 30-day meter has history without 30 days of run rows. */
    costBaseline: { usd: number; tokens: number }
    messages: FlaggedMessage[]
    briefings: Briefing[]
    briefingItems: BriefingItem[]
    clientMetrics: ClientMetricRow[]
  }
  controlRoom: {
    capabilities: Capability[]
    goalId: string
    telemetry: ControlRoomTelemetry
  }
  audit: AuditRow[]
}
