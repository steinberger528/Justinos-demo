// Shared types for the Control Room tab (specs/control-room-tab.md). Mirrors the
// crm-types.ts pattern: one file, no logic, imported by the provider + every card.

export type AgentName = 'neptune' | 'athena' | 'ares' | 'iris'
export type StepTag = 'ai' | 'manual' | 'tool'

export interface CapabilityStep {
  text: string
  tag: StepTag
}

/** Mirrors the `capabilities` table (0019_capabilities.sql + 0022_capabilities_domain.sql). */
export interface Capability {
  id: string
  name: string
  description: string
  area: string | null
  agent: AgentName | 'none' | null
  runtime: 'script' | 'local-session' | 'local-scheduled' | 'server-cron' | 'cloud-routine' | string
  autonomy: 'S1' | 'S2' | 'S3' | string
  trigger: string | null
  status: 'running' | 'planned' | string
  steps: CapabilityStep[]
  vault_path: string | null
  domain: string | null
  created_at: string
  updated_at: string
}

export interface GoalStep {
  id: string
  text: string
  done: boolean
  sort_order: number
  created_at: string
}

/** The `Agentic OS` goal (goals + goal_steps) — null if the goal is missing/renamed. */
export interface AgenticOsGoal {
  id: string
  name: string
  steps: GoalStep[]
}

export interface TelemetryRow<T> {
  payload: T
  captured_at: string
}

export interface LiveSession {
  repo: string
  title: string
  context_pct: number | null
  compactions: number
  duration_label: string
  status: 'live' | 'idle'
}
export interface LiveSessionsPayload {
  sessions: LiveSession[]
}

export interface RecentSession {
  title: string
  summary: string
  date_label: string
  duration_label: string
}
export interface RecentSessionsPayload {
  sessions: RecentSession[]
}

export interface RepoStatus {
  name: string
  branch: string
  sha: string
  changed_count: number
}
export interface GitStatusPayload {
  repos: RepoStatus[]
}

export interface ScheduledTaskHealth {
  name: string
  trigger_label: string
  status: 'ok' | 'error'
  consecutive_failures: number
}
export interface TaskHealthPayload {
  tasks: ScheduledTaskHealth[]
}

export interface FailureEntry {
  source: string
  date_label: string
  message: string
}
export interface FailuresPayload {
  failures: FailureEntry[]
  window_days: number
  clean_run_count: number
}

export interface WaitingOnYouPayload {
  reorg_proposals_unapplied: number
  reorg_oldest_date_label: string | null
  inbox_depth: number
}

export interface TokenUsageDay {
  date_label: string
  by_repo: Record<string, number>
}
export interface TokenUsagePayload {
  days: TokenUsageDay[]
  heaviest_repo: string | null
}

export interface ControlRoomTelemetry {
  live_sessions: TelemetryRow<LiveSessionsPayload> | null
  recent_sessions: TelemetryRow<RecentSessionsPayload> | null
  git_status: TelemetryRow<GitStatusPayload> | null
  task_health: TelemetryRow<TaskHealthPayload> | null
  failures: TelemetryRow<FailuresPayload> | null
  waiting_on_you: TelemetryRow<WaitingOnYouPayload> | null
  token_usage: TelemetryRow<TokenUsagePayload> | null
}

export interface ControlRoomOverview {
  capabilities: Capability[]
  goal: AgenticOsGoal | null
  telemetry: ControlRoomTelemetry
}

/** Stale badge threshold — R "Stale telemetry" edge case (2 hours). */
export const TELEMETRY_STALE_MS = 2 * 60 * 60 * 1000

export function isStale(capturedAt: string | undefined | null): boolean {
  if (!capturedAt) return false
  return Date.now() - new Date(capturedAt).getTime() > TELEMETRY_STALE_MS
}
