// Shared types for the CRM ops cockpit cards. Mirrors the schema in
// supabase/migrations/0006_crm.sql exactly — no fields invented here that
// don't exist in the DB.

export type ClientStatus = 'active' | 'paused' | 'onboarding' | 'churned'

export interface Client {
  id: string
  user_id: string
  name: string
  domain: string | null
  status: ClientStatus
  tier: string | null
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

export type AgentStatus = 'working' | 'idle' | 'blocked' | 'done' | 'error'

export interface Agent {
  id: string
  user_id: string
  name: string
  role: string
  status: AgentStatus
  current_task: string | null
  current_client_id: string | null
  last_output: string | null
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

export type RunStatus = 'ok' | 'error' | 'blocked'

export interface AgentRun {
  id: string
  user_id: string
  run_id: string
  agent_id: string
  client_id: string | null
  step_index: number
  tool: string
  input: Record<string, unknown>
  output: Record<string, unknown>
  status: RunStatus
  tokens: number | null
  cost_usd: number | null
  origin_type: string | null
  origin_id: string | null
  occurred_at: string
  created_at: string
}

export type JobState = 'queued' | 'running' | 'blocked' | 'done'

export interface AgentJob {
  id: string
  user_id: string
  title: string
  description: string | null
  agent_id: string | null
  client_id: string | null
  state: JobState
  needs_input: boolean
  sort_order: number
  created_at: string
  updated_at: string
  completed_at: string | null
}

export interface InboxItem {
  source: 'job' | 'agent'
  id: string
  title: string
  agent_id: string | null
  client_id: string | null
  reason: string
  occurred_at: string
}

export interface CostSummary {
  today_usd: number
  today_tokens: number
  rolling_30d_usd: number
  rolling_30d_tokens: number
}

// ─── Business metrics (single row per user) ─────────────────────────────────

export interface BusinessMetrics {
  user_id: string
  revenue_total: number
  clients_active: number
  ai_addon_clients: number
  prospects_in_pipeline: number
  outreach_drafted: number
  outreach_sent: number
  replies_received: number
  products_ready: number
  products_live: number
  content_ready: number
  content_published: number
  geo_reports_ready: number
  newsletter_subs: number
  phase: string
  updated_at: string
}

// ─── Briefings ───────────────────────────────────────────────────────────────

export type BriefingItemType = 'checklist' | 'decision'
export type DecisionStatus = 'pending' | 'approved' | 'rejected'

export interface Briefing {
  id: string
  user_id: string
  briefing_date: string  // YYYY-MM-DD
  notes: string | null
  created_at: string
  updated_at: string
}

export interface BriefingItem {
  id: string
  briefing_id: string
  user_id: string
  item_type: BriefingItemType
  section: string | null
  text: string
  file_path: string | null
  sort_order: number
  checked: boolean
  recommendation: string | null
  decision_status: DecisionStatus | null
  resolution_note: string | null
  created_at: string
  updated_at: string
}

// ─── Flagged messages ────────────────────────────────────────────────────────

export interface FlaggedMessage {
  id: string
  user_id: string
  from_agent: string
  to_agent: string
  subject: string
  body: string
  occurred_at: string
  acknowledged: boolean
  acknowledged_at: string | null
  created_at: string
}

// ─── Business metrics snapshots (daily history for KPI deltas/sparklines) ───

export interface MetricsSnapshot {
  snapshot_date: string
  revenue_total: number
  clients_active: number
  prospects_in_pipeline: number
  cost_today_usd: number
}

// ─── Overview (extended) ─────────────────────────────────────────────────────

export interface CrmOverview {
  clients: Client[]
  agents: Agent[]
  jobs_by_state: Record<JobState, AgentJob[]>
  feed: AgentRun[]
  inbox: InboxItem[]
  metrics_snapshots: MetricsSnapshot[]
  cost: CostSummary
  business_metrics: BusinessMetrics
}

export const AGENT_STATUS_COLOR: Record<AgentStatus, string> = {
  working: 'oklch(0.67 0.19 165)',   // mint — matches --ag
  idle:    'oklch(0.60 0.02 255)',   // muted t2
  blocked: 'oklch(0.78 0.16 75)',    // retro amber — first-class escalation
  done:    'oklch(0.67 0.19 200)',   // cyan — matches --acy
  error:   'oklch(0.65 0.22 25)',    // red — distinct from blocked
}

export function clientName(clients: Client[], id: string | null): string {
  if (!id) return '—'
  return clients.find(c => c.id === id)?.name ?? 'Unknown client'
}

export function agentName(agents: Agent[], id: string | null): string {
  if (!id) return '—'
  return agents.find(a => a.id === id)?.name ?? 'Unknown agent'
}
