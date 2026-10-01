// The task shape every task card works with. In production this type lives beside the
// server-side query helpers; the demo has no server, so it lives on its own here.

export interface SessionTask {
  id: string
  title: string
  urgency: string
  key: boolean
  blocked: boolean
  blocked_since?: string | null
  priority_score: number
  tags: string[]
  block_type?: string | null
  due_date: string | null
  planned_date?: string | null
  date_is_placeholder?: boolean
  // Exams and quizzes are calendar events, not tasks, so task views filter on this.
  item_type?: string | null
  time_estimate_min: number | null
  in_progress: boolean
  is_working?: boolean
  completed_at?: string | null
  created_at?: string
}
