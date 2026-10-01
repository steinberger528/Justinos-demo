// CRM routes: the agency cockpit. One overview payload feeds all four sub-tabs.

import type { AgentJob, InboxItem, JobState } from '@/components/dashboard/crm-types'
import { audit, getDb, mutate } from '../db'
import { dateKey, todayKey } from '../dates'
import { fail, isDateKey, ok, route, type Route } from '../http'
import { LIVE_RUN_SPECS, makeRun } from '../seed/crm'
import type { DemoDB } from '../types'

const FEED_LIMIT = 40
const SNAPSHOT_LIMIT = 14
const RECENT_ACK_TAIL = 5
const ARCHIVE_PAGE_SIZE = 50
const LIVE_STEP_EVERY_MS = 25_000
const JOB_STATES: JobState[] = ['queued', 'running', 'blocked', 'done']

const SEO_METRICS = ['organic_traffic', 'keyword_position_avg', 'referring_domains', 'organic_conversions', 'technical_issues_open']
const GEO_METRICS = ['ai_share_of_voice', 'citation_rate']

/**
 * Keeps the Live Agent Feed moving. Each poll, if the newest step is old enough, the
 * next scripted step is appended as if an agent had just logged it.
 */
function advanceLiveFeed(db: DemoDB): void {
  const newest = db.crm.runs[0]
  if (newest && Date.now() - new Date(newest.occurred_at).getTime() < LIVE_STEP_EVERY_MS) return
  const liveCount = db.crm.runs.filter(r => r.id.includes('-live')).length
  const spec = LIVE_RUN_SPECS[liveCount % LIVE_RUN_SPECS.length]
  db.crm.runs.unshift(makeRun(spec, new Date().toISOString(), `live${liveCount}`))
  if (db.crm.runs.length > 120) db.crm.runs.length = 120
}

function todayCost(db: DemoDB): { usd: number; tokens: number } {
  const today = todayKey()
  let usd = 0
  let tokens = 0
  for (const run of db.crm.runs) {
    if (dateKey(new Date(run.occurred_at)) !== today) continue
    usd += Number(run.cost_usd ?? 0)
    tokens += Number(run.tokens ?? 0)
  }
  return { usd: Math.round(usd * 10000) / 10000, tokens }
}

/** Mirrors the production upsert: any metrics change rewrites today's snapshot. */
function writeSnapshot(db: DemoDB): void {
  const today = todayKey()
  const snapshot = {
    snapshot_date: today,
    revenue_total: db.crm.businessMetrics.revenue_total,
    clients_active: db.crm.businessMetrics.clients_active,
    prospects_in_pipeline: db.crm.businessMetrics.prospects_in_pipeline,
    cost_today_usd: todayCost(db).usd,
  }
  db.crm.snapshots = [...db.crm.snapshots.filter(s => s.snapshot_date !== today), snapshot]
    .sort((a, b) => a.snapshot_date.localeCompare(b.snapshot_date))
  audit(db, 'upsert', 'business_metrics_snapshot', null, { snapshot_date: today })
}

export const crmRoutes: Route[] = [
  route('GET', '/api/crm/overview', () =>
    mutate(db => {
      advanceLiveFeed(db)
      const { clients, agents, jobs, runs, businessMetrics, snapshots, costBaseline } = db.crm

      const jobsByState: Record<JobState, AgentJob[]> = { queued: [], running: [], blocked: [], done: [] }
      for (const job of [...jobs].sort((a, b) => a.sort_order - b.sort_order)) jobsByState[job.state]?.push(job)

      // The decision inbox: blocked jobs that need input, plus blocked agents with no
      // such job. This is the short list of things only a person can do.
      const blockedJobs = jobs.filter(j => j.state === 'blocked' && j.needs_input)
      const blockedJobAgentIds = new Set(blockedJobs.map(j => j.agent_id).filter(Boolean))
      const inbox: InboxItem[] = [
        ...blockedJobs.map((j): InboxItem => ({
          source: 'job', id: j.id, title: j.title, agent_id: j.agent_id, client_id: j.client_id,
          reason: j.description ?? 'Needs your decision to continue', occurred_at: j.updated_at,
        })),
        ...agents
          .filter(a => a.status === 'blocked' && !blockedJobAgentIds.has(a.id))
          .map((a): InboxItem => ({
            source: 'agent', id: a.id, title: a.current_task ?? `${a.name} is blocked`, agent_id: a.id,
            client_id: a.current_client_id, reason: a.last_output ?? 'Agent is blocked and needs input',
            occurred_at: a.updated_at,
          })),
      ].sort((a, b) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime())

      const feed = [...runs]
        .sort((a, b) => b.occurred_at.localeCompare(a.occurred_at) || b.step_index - a.step_index)
        .slice(0, FEED_LIMIT)

      const today = todayCost(db)
      return ok({
        clients,
        agents,
        jobs_by_state: jobsByState,
        feed,
        inbox,
        metrics_snapshots: snapshots.slice(-SNAPSHOT_LIMIT),
        cost: {
          today_usd: today.usd,
          today_tokens: today.tokens,
          rolling_30d_usd: Math.round((costBaseline.usd + today.usd) * 10000) / 10000,
          rolling_30d_tokens: costBaseline.tokens + today.tokens,
        },
        business_metrics: businessMetrics,
      })
    }),
  ),

  // ── Flagged messages (agent to human) ──────────────────────────────────────
  route('GET', '/api/crm/messages', () => {
    const { messages } = getDb().crm
    return ok({
      active: messages.filter(m => !m.acknowledged).sort((a, b) => b.occurred_at.localeCompare(a.occurred_at)),
      recent_acknowledged: messages
        .filter(m => m.acknowledged)
        .sort((a, b) => (b.acknowledged_at ?? '').localeCompare(a.acknowledged_at ?? ''))
        .slice(0, RECENT_ACK_TAIL),
    })
  }),

  // Reverse-chronological archive with search. The cursor is an offset into the
  // filtered list, which is enough for a single-user demo.
  route('GET', '/api/crm/messages/archive', ({ query }) => {
    const q = query.get('q')?.trim().toLowerCase() ?? ''
    const offset = Number(query.get('cursor') ?? 0)
    if (!Number.isInteger(offset) || offset < 0) return fail(400, 'invalid cursor')

    const all = [...getDb().crm.messages]
      .filter(m => !q || [m.subject, m.body, m.from_agent].some(field => field.toLowerCase().includes(q)))
      .sort((a, b) => b.occurred_at.localeCompare(a.occurred_at) || b.id.localeCompare(a.id))
    const page = all.slice(offset, offset + ARCHIVE_PAGE_SIZE)
    const next = offset + ARCHIVE_PAGE_SIZE < all.length ? String(offset + ARCHIVE_PAGE_SIZE) : null
    return ok({ messages: page, next_cursor: next })
  }),

  route('POST', '/api/crm/messages/dismiss-all', () =>
    mutate(db => {
      const now = new Date().toISOString()
      let count = 0
      for (const m of db.crm.messages) {
        if (m.acknowledged) continue
        m.acknowledged = true
        m.acknowledged_at = now
        count += 1
      }
      audit(db, 'dismiss_all', 'flagged_message', null, { count, acknowledged_at: now })
      return ok({ ok: true, count })
    }),
  ),

  route('PATCH', '/api/crm/messages/:id', ({ params }) =>
    mutate(db => {
      const msg = db.crm.messages.find(m => m.id === params.id)
      if (!msg) return fail(404, 'message not found')
      if (msg.acknowledged) return ok({ ok: true, already_acknowledged: true })
      msg.acknowledged = true
      msg.acknowledged_at = new Date().toISOString()
      audit(db, 'update', 'flagged_message', msg.id, { acknowledged: true })
      return ok()
    }),
  ),

  // ── Daily briefing ─────────────────────────────────────────────────────────
  route('GET', '/api/crm/briefings', ({ query }) => {
    const date = query.get('date') ?? todayKey()
    if (!isDateKey(date)) return fail(400, 'date must be YYYY-MM-DD')
    const { briefings, briefingItems } = getDb().crm
    const briefing = briefings.find(b => b.briefing_date === date) ?? null
    if (!briefing) return ok({ briefing: null, items: [], date })
    return ok({
      briefing,
      items: briefingItems.filter(i => i.briefing_id === briefing.id).sort((a, b) => a.sort_order - b.sort_order),
      date,
    })
  }),

  // Checking a box is the signal the next agent session reads as "this happened".
  route('PATCH', '/api/crm/briefings/items/:id', ({ params, body }) =>
    mutate(db => {
      const item = db.crm.briefingItems.find(i => i.id === params.id)
      if (!item) return fail(404, 'item not found')
      const briefing = db.crm.briefings.find(b => b.id === item.briefing_id)
      if (briefing?.briefing_date !== todayKey()) return fail(403, 'past briefing items are read-only')

      const change: Record<string, unknown> = {}
      if (item.item_type === 'checklist') {
        change.checked = !item.checked
      } else {
        const status = body.decision_status
        if (status !== 'approved' && status !== 'rejected') return fail(400, "decision_status must be 'approved' or 'rejected'")
        change.decision_status = status
        if (typeof body.resolution_note === 'string') change.resolution_note = body.resolution_note
      }
      Object.assign(item, change, { updated_at: new Date().toISOString() })
      audit(db, 'update', 'briefing_item', item.id, { ...change, item_type: item.item_type })
      return ok({ ok: true, ...change })
    }),
  ),

  // ── Business metrics ───────────────────────────────────────────────────────
  // Only revenue and phase are edited by hand. Every other number is reported by agents.
  route('PATCH', '/api/crm/business-metrics', ({ body }) => {
    const change: Record<string, unknown> = {}
    if ('revenue_total' in body) {
      const v = body.revenue_total
      if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) return fail(400, 'revenue_total must be a non-negative finite number')
      change.revenue_total = v
    }
    if ('phase' in body) {
      const v = body.phase
      if (typeof v !== 'string' || v.trim().length === 0) return fail(400, 'phase must be a non-empty string')
      change.phase = v
    }
    if (Object.keys(change).length === 0) return fail(400, 'provide revenue_total and/or phase')

    return mutate(db => {
      Object.assign(db.crm.businessMetrics, change, { updated_at: new Date().toISOString() })
      audit(db, 'update', 'business_metrics', null, change)
      writeSnapshot(db)
      return ok()
    })
  }),

  // ── Client metrics ─────────────────────────────────────────────────────────
  route('GET', '/api/crm/clients/metrics-summary', () => {
    const { clients, clientMetrics } = getDb().crm
    const latest = new Map<string, number>()
    for (const row of [...clientMetrics].sort((a, b) => b.captured_on.localeCompare(a.captured_on))) {
      if (!SEO_METRICS.includes(row.metric)) continue
      const key = `${row.client_id}:${row.metric}`
      if (!latest.has(key)) latest.set(key, row.value)
    }
    return ok({
      clients: clients.map(c => ({
        client_id: c.id,
        name: c.name,
        metrics: Object.fromEntries(SEO_METRICS.map(m => [m, latest.get(`${c.id}:${m}`) ?? null])),
      })),
    })
  }),

  route('GET', '/api/crm/clients/:id/metrics', ({ params }) => {
    const rows = getDb().crm.clientMetrics
      .filter(r => r.client_id === params.id)
      .sort((a, b) => a.captured_on.localeCompare(b.captured_on))

    const seo: Record<string, { captured_on: string; value: number }[]> = {}
    for (const m of SEO_METRICS) seo[m] = []
    const geo: Record<string, Record<string, { captured_on: string; value: number }[]>> = {}
    for (const m of GEO_METRICS) geo[m] = {}

    for (const row of rows) {
      const point = { captured_on: row.captured_on, value: row.value }
      if (SEO_METRICS.includes(row.metric)) {
        seo[row.metric].push(point)
      } else if (GEO_METRICS.includes(row.metric)) {
        // Kept per engine and never blended: each assistant answers differently.
        const engine = row.engine ?? 'unknown'
        geo[row.metric][engine] = [...(geo[row.metric][engine] ?? []), point]
      }
    }
    return ok({ client_id: params.id, seo, geo })
  }),

  // ── Escalations and jobs ───────────────────────────────────────────────────
  route('POST', '/api/crm/escalations/:id/resolve', ({ params, body }) => {
    if (body.source !== 'job' && body.source !== 'agent') return fail(400, "source must be 'job' or 'agent'")
    return mutate(db => {
      const now = new Date().toISOString()
      if (body.source === 'job') {
        const job = db.crm.jobs.find(j => j.id === params.id)
        if (job) {
          job.needs_input = false
          job.state = 'running'
          job.updated_at = now
          const agent = db.crm.agents.find(a => a.id === job.agent_id && a.status === 'blocked')
          if (agent) { agent.status = 'working'; agent.updated_at = now }
          audit(db, 'resolve', 'agent_job', job.id, { unblocked_agent_id: agent?.id ?? null })
        }
      } else {
        const agent = db.crm.agents.find(a => a.id === params.id)
        if (agent) { agent.status = 'working'; agent.updated_at = now }
        audit(db, 'resolve', 'agent', params.id, {})
      }
      return ok({ ok: true }, 250)
    })
  }),

  // Dragging a card between kanban columns.
  route('PATCH', '/api/crm/jobs/:id', ({ params, body }) => {
    const state = body.state as JobState | undefined
    if (state !== undefined && !JOB_STATES.includes(state)) return fail(400, `state must be one of ${JOB_STATES.join(', ')}`)
    return mutate(db => {
      const job = db.crm.jobs.find(j => j.id === params.id)
      if (!job) return fail(404, 'job not found')
      const change: Record<string, unknown> = {}
      if (state !== undefined) {
        change.state = state
        change.completed_at = state === 'done' ? new Date().toISOString() : null
      }
      if (typeof body.sort_order === 'number') change.sort_order = body.sort_order
      if (typeof body.needs_input === 'boolean') change.needs_input = body.needs_input
      if (Object.keys(change).length === 0) return fail(400, 'no fields to update')
      Object.assign(job, change, { updated_at: new Date().toISOString() })
      audit(db, 'update', 'agent_job', job.id, change)
      return ok()
    })
  }),
]
