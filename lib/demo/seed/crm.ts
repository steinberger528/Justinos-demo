// Sample data for the CRM tab: a small content agency run by seven specialist
// agents. The business, its clients and every number here are invented. Client
// domains use the reserved .example TLD so they cannot point at a real site.

import type {
  Agent, AgentJob, AgentRun, AgentStatus, Briefing, BriefingItem, BusinessMetrics, Client,
  ClientStatus, FlaggedMessage, JobState, MetricsSnapshot, RunStatus,
} from '@/components/dashboard/crm-types'
import type { ClientMetricRow, DemoDB } from '../types'
import { addDays, isoAt, minutesAgo } from '../dates'
import { DEMO_USER_ID } from '../ids'

const U = DEMO_USER_ID

/** Small deterministic generator so every visitor sees the same "random" series. */
function rng(seed: number): () => number {
  let s = seed % 2147483647
  if (s <= 0) s += 2147483646
  return () => {
    s = (s * 16807) % 2147483647
    return (s - 1) / 2147483646
  }
}

function seedClients(today: string): Client[] {
  const client = (id: string, name: string, domain: string, status: ClientStatus, tier: string | null, daysAgo: number): Client => ({
    id, user_id: U, name, domain, status, tier, metadata: {},
    created_at: isoAt(addDays(today, -daysAgo), '10:00'), updated_at: isoAt(addDays(today, -1), '10:00'),
  })
  return [
    client('cl-fernhollow', 'Fernhollow Dental', 'fernhollowdental.example', 'active', 'Content Engine + AI Visibility', 96),
    client('cl-ridgewick', 'Ridgewick Outfitters', 'ridgewickoutfitters.example', 'active', 'Content Engine', 71),
    client('cl-stonevale', 'Stonevale Heating & Air', 'stonevaleheating.example', 'active', 'Content Engine + AI Visibility', 44),
    client('cl-marrowby', 'Marrowby Bakehouse', 'marrowbybakehouse.example', 'onboarding', 'Content Engine', 6),
    client('cl-lakemoor', 'Lakemoor Physio', 'lakemoorphysio.example', 'paused', null, 120),
  ]
}

function seedAgents(today: string): Agent[] {
  const agent = (
    id: string, name: string, role: string, status: AgentStatus, task: string | null,
    clientId: string | null, lastOutput: string | null, updatedMinAgo: number,
  ): Agent => ({
    id, user_id: U, name, role, status, current_task: task, current_client_id: clientId, last_output: lastOutput,
    metadata: {}, created_at: isoAt(addDays(today, -100), '09:00'), updated_at: minutesAgo(updatedMinAgo),
  })
  return [
    agent('ag-orch', 'orchestrator', 'Reads state, sets priorities', 'working', "Writing tomorrow's briefing", null, 'Briefing draft: 7 checklist lines, 2 decisions', 4),
    agent('ag-scout', 'market-scout', 'Finds and qualifies prospects', 'idle', null, null, 'Qualified 12 of 30 shops in the new metro', 52),
    agent('ag-outreach', 'outreach-writer', 'Cold emails and reply drafts', 'blocked', 'Outreach batch 14', null, 'Waiting on the AI-visibility prompt run for the metro', 38),
    agent('ag-content', 'content-producer', 'Monthly client deliverables', 'working', 'Monthly AI-visibility report', 'cl-fernhollow', 'Citation counts pulled for four engines', 9),
    agent('ag-news', 'newsletter-editor', 'Weekly newsletter issue', 'done', 'Issue 11 is ready to send', null, 'Issue 11 saved to newsletter/issues/', 95),
    agent('ag-product', 'product-builder', 'Digital products and listing copy', 'blocked', 'Listing copy for the review-response templates', null, 'I need the price before I can finish the listing', 64),
    agent('ag-analyst', 'analyst', 'Weekly read on the numbers', 'idle', null, null, 'Weekly read posted. Reply rate is the bottleneck.', 140),
  ]
}

function seedJobs(today: string): AgentJob[] {
  const job = (
    id: string, title: string, clientId: string | null, agentId: string, state: JobState, sort: number,
    extra: Partial<AgentJob> = {},
  ): AgentJob => ({
    id, user_id: U, title, description: null, agent_id: agentId, client_id: clientId, state,
    needs_input: false, sort_order: sort,
    created_at: isoAt(addDays(today, -4), '09:00'), updated_at: minutesAgo(30 + sort * 11),
    completed_at: state === 'done' ? isoAt(addDays(today, -1), '18:20') : null,
    ...extra,
  })
  return [
    job('job-calendar', "Next month's content calendar", 'cl-ridgewick', 'ag-content', 'queued', 0),
    job('job-prospects', 'Prospect batch: HVAC shops in the new metro', null, 'ag-scout', 'queued', 1),
    job('job-issue12', 'Newsletter issue 12 outline', null, 'ag-news', 'queued', 2),
    job('job-report', 'Monthly AI-visibility report', 'cl-fernhollow', 'ag-content', 'running', 0),
    job('job-reply', 'Reply draft for the interested bakery lead', 'cl-marrowby', 'ag-outreach', 'running', 1),
    job('job-batch14', 'Outreach batch 14', null, 'ag-outreach', 'blocked', 0, {
      needs_input: true,
      description: 'Run the three customer prompts for the metro and paste in who the assistants named',
      updated_at: minutesAgo(38),
    }),
    job('job-schema', 'Schema pack', 'cl-stonevale', 'ag-content', 'blocked', 1, {
      needs_input: true,
      description: 'Confirm business hours and the service-area list before the markup is final',
      updated_at: minutesAgo(121),
    }),
    job('job-faq', 'FAQ block for the services page', 'cl-fernhollow', 'ag-content', 'done', 0),
    job('job-issue11', 'Newsletter issue 11', null, 'ag-news', 'done', 1),
    job('job-weekly', 'Weekly read on the numbers', null, 'ag-analyst', 'done', 2),
    job('job-onboard', 'Onboarding intake: prompt set and business details', 'cl-marrowby', 'ag-orch', 'done', 3),
  ]
}

type RunSpec = [
  runId: string, agentId: string, clientId: string | null, step: number, tool: string,
  input: Record<string, unknown>, output: Record<string, unknown>, status: RunStatus,
  tokens: number, originType: string, originId: string | null,
]

/** Newest first. Each row is one traced step: tool, input, output, tokens and cost. */
const RUN_SPECS: RunSpec[] = [
  ['run-brief', 'ag-orch', null, 2, 'write_file', { path: 'business/briefings/tomorrow.md' }, { lines: 9 }, 'ok', 2140, 'schedule', 'evening-session'],
  ['run-brief', 'ag-orch', null, 1, 'log.status', { status: 'working' }, { ok: true }, 'ok', 180, 'schedule', 'evening-session'],
  ['run-brief', 'ag-orch', null, 0, 'read_state', { files: 3 }, { open_items: 9 }, 'ok', 1320, 'schedule', 'evening-session'],
  ['run-report', 'ag-content', 'cl-fernhollow', 4, 'write_file', { path: 'business/clients/fernhollow-dental/report-draft.md' }, { words: 640 }, 'ok', 5480, 'job', 'job-report'],
  ['run-report', 'ag-content', 'cl-fernhollow', 3, 'log.metric', { metric: 'citation_rate', engine: 'perplexity' }, { value: 58.3 }, 'ok', 210, 'job', 'job-report'],
  ['run-report', 'ag-content', 'cl-fernhollow', 2, 'visibility_check', { engine: 'perplexity', prompts: 12 }, { cited: 7 }, 'ok', 3890, 'job', 'job-report'],
  ['run-report', 'ag-content', 'cl-fernhollow', 1, 'visibility_check', { engine: 'chatgpt', prompts: 12 }, { cited: 5 }, 'ok', 4020, 'job', 'job-report'],
  ['run-report', 'ag-content', 'cl-fernhollow', 0, 'read_file', { path: 'business/clients/fernhollow-dental/prompts.md' }, { prompts: 12 }, 'ok', 760, 'job', 'job-report'],
  ['run-reply', 'ag-outreach', 'cl-marrowby', 2, 'log.message', { to: 'human', subject: 'Reply draft ready' }, { stored: true }, 'ok', 240, 'job', 'job-reply'],
  ['run-reply', 'ag-outreach', 'cl-marrowby', 1, 'draft_email', { max_words: 120 }, { words: 104 }, 'ok', 1870, 'job', 'job-reply'],
  ['run-reply', 'ag-outreach', 'cl-marrowby', 0, 'read_file', { path: 'business/outreach/inbox/marrowby-bakehouse.md' }, { intent: 'interested' }, 'ok', 690, 'job', 'job-reply'],
  ['run-batch14', 'ag-outreach', null, 1, 'log.status', { status: 'blocked' }, { reason: 'needs the AI-visibility prompt run' }, 'blocked', 190, 'job', 'job-batch14'],
  ['run-batch14', 'ag-outreach', null, 0, 'read_file', { path: 'business/prospects/metro-hvac.md' }, { prospects: 12 }, 'ok', 940, 'job', 'job-batch14'],
  ['run-product', 'ag-product', null, 1, 'log.status', { status: 'blocked' }, { reason: 'need the price' }, 'blocked', 170, 'job', null],
  ['run-product', 'ag-product', null, 0, 'write_file', { path: 'business/products/review-response-templates/listing.md' }, { error: 'missing price' }, 'error', 2260, 'job', null],
  ['run-scout', 'ag-scout', null, 3, 'log.metric', { metric: 'prospects_in_pipeline' }, { value: 46 }, 'ok', 200, 'job', 'job-prospects'],
  ['run-scout', 'ag-scout', null, 2, 'write_file', { path: 'business/prospects/metro-hvac.md' }, { rows: 12 }, 'ok', 1510, 'job', 'job-prospects'],
  ['run-scout', 'ag-scout', null, 1, 'qualify', { candidates: 30 }, { qualified: 12 }, 'ok', 6120, 'job', 'job-prospects'],
  ['run-scout', 'ag-scout', null, 0, 'web_search', { query: 'hvac repair, new metro' }, { results: 30 }, 'ok', 2870, 'job', 'job-prospects'],
  ['run-news', 'ag-news', null, 1, 'log.status', { status: 'done' }, { ok: true }, 'ok', 160, 'schedule', 'weekly-issue'],
  ['run-news', 'ag-news', null, 0, 'write_file', { path: 'business/newsletter/issues/011.md' }, { words: 820 }, 'ok', 4930, 'schedule', 'weekly-issue'],
  ['run-analyst', 'ag-analyst', null, 1, 'log.message', { to: 'human', subject: 'Reply rate dipped this week' }, { stored: true }, 'ok', 310, 'schedule', 'weekly-read'],
  ['run-analyst', 'ag-analyst', null, 0, 'read_state', { files: 2 }, { sends: 31, replies: 6 }, 'ok', 1640, 'schedule', 'weekly-read'],
]

/** $3 per million tokens, the same blended rate the Control Room cost card states. */
export const USD_PER_TOKEN = 3 / 1_000_000

export function makeRun(spec: RunSpec, occurredAt: string, idSuffix: string): AgentRun {
  const [runId, agentId, clientId, step, tool, input, output, status, tokens, originType, originId] = spec
  return {
    id: `${runId}-${step}-${idSuffix}`, user_id: U, run_id: runId, agent_id: agentId, client_id: clientId,
    step_index: step, tool, input, output, status, tokens,
    cost_usd: Math.round(tokens * USD_PER_TOKEN * 10000) / 10000,
    origin_type: originType, origin_id: originId, occurred_at: occurredAt, created_at: occurredAt,
  }
}

function seedRuns(): AgentRun[] {
  // Spread the scripted steps back over the last few hours, never past midnight,
  // so "Cost today" counts all of them.
  const minutesSinceMidnight = new Date().getHours() * 60 + new Date().getMinutes()
  const spacing = Math.max(1, Math.min(9, Math.floor(minutesSinceMidnight / (RUN_SPECS.length + 1))))
  return RUN_SPECS.map((spec, i) => makeRun(spec, minutesAgo(2 + i * spacing), 'seed'))
}

/** Steps the "live" feed cycles through while the Agents tab is open. */
export const LIVE_RUN_SPECS: RunSpec[] = [
  ['run-live-content', 'ag-content', 'cl-fernhollow', 0, 'visibility_check', { engine: 'google_ai', prompts: 12 }, { cited: 4 }, 'ok', 3760, 'job', 'job-report'],
  ['run-live-orch', 'ag-orch', null, 0, 'read_state', { files: 3 }, { open_items: 8 }, 'ok', 1280, 'schedule', 'evening-session'],
  ['run-live-content', 'ag-content', 'cl-fernhollow', 1, 'log.metric', { metric: 'citation_rate', engine: 'google_ai' }, { value: 33.3 }, 'ok', 220, 'job', 'job-report'],
  ['run-live-outreach', 'ag-outreach', 'cl-marrowby', 0, 'draft_email', { max_words: 120, variant: 'follow-up' }, { words: 96 }, 'ok', 1740, 'job', 'job-reply'],
  ['run-live-orch', 'ag-orch', null, 1, 'log.activity', { note: 'Reprioritized: reply drafts first' }, { ok: true }, 'ok', 260, 'schedule', 'evening-session'],
  ['run-live-content', 'ag-content', 'cl-ridgewick', 0, 'read_file', { path: 'business/clients/ridgewick-outfitters/calendar.md' }, { posts_planned: 8 }, 'ok', 820, 'job', 'job-calendar'],
  ['run-live-scout', 'ag-scout', null, 0, 'web_search', { query: 'independent bakeries, same metro' }, { results: 24 }, 'ok', 2590, 'job', 'job-prospects'],
  ['run-live-content', 'ag-content', 'cl-ridgewick', 1, 'write_file', { path: 'business/clients/ridgewick-outfitters/post-01.md' }, { words: 910 }, 'ok', 5210, 'job', 'job-calendar'],
]

function seedMessages(today: string): FlaggedMessage[] {
  const msg = (
    id: string, from: string, subject: string, body: string, minutesBack: number, acknowledged = false,
  ): FlaggedMessage => {
    const occurred = minutesAgo(minutesBack)
    return {
      id, user_id: U, from_agent: from, to_agent: 'human', subject, body, occurred_at: occurred,
      acknowledged, acknowledged_at: acknowledged ? minutesAgo(Math.max(1, minutesBack - 180)) : null,
      created_at: occurred,
    }
  }
  void today
  const DAY = 24 * 60
  return [
    msg('msg-1', 'outreach-writer', 'Reply draft ready', 'The bakery lead asked about pricing. Draft is in the outbox and stays under 120 words. It needs your read before it goes anywhere.', 18),
    msg('msg-2', 'analyst', 'Reply rate dipped this week', 'Six replies on 31 sends is 19%, down from 27%. Most of the drop is the HVAC opener, which leans on a ranking claim we cannot back up. I would pause that variant.', 140),
    msg('msg-3', 'content-producer', 'One number missing from the Fernhollow report', 'I have citation counts for all four engines but not their September call volume. Paste it into the client folder and I will finish the report.', 205),
    msg('msg-4', 'product-builder', 'Need a price for the template pack', 'Listing copy is written. I cannot finish it without a price. The other two listings are at $19.', 310),
    msg('msg-5', 'orchestrator', 'Three drafts waited overnight', 'Three reviewed emails sat in the outbox since yesterday. I moved them to the top of this morning’s briefing.', DAY + 60, true),
    msg('msg-6', 'market-scout', 'New metro looks worth opening', 'Thirty HVAC shops, twelve qualified. None of the twelve were named by the assistants for the three test prompts, which makes the opener easy.', DAY + 300, true),
    msg('msg-7', 'newsletter-editor', 'Issue 11 is ready', 'Issue 11 is in the issues folder with two subject line options. It runs 820 words.', DAY * 2 + 45, true),
    msg('msg-8', 'content-producer', 'FAQ block drafted for Fernhollow', 'Eight questions, each answered in under 60 words so an assistant can quote them whole. Needs a spot-check on the insurance answer.', DAY * 2 + 400, true),
    msg('msg-9', 'analyst', 'Weekly read: one thing to stop', 'Stop sending on Fridays. Zero replies in four weeks of Friday sends.', DAY * 5 + 30, true),
    msg('msg-10', 'orchestrator', 'Onboarding is waiting on the client', 'Marrowby has not sent their business hours or service list. Their first deliverable cannot start without them.', DAY * 6 + 200, true),
    msg('msg-11', 'outreach-writer', 'A prospect asked to be removed', 'One HVAC prospect replied asking not to be contacted. I pulled them from every sequence.', DAY * 8 + 90, true),
  ]
}

function seedBriefings(today: string): { briefings: Briefing[]; items: BriefingItem[] } {
  const yesterday = addDays(today, -1)
  const briefing = (date: string, notes: string): Briefing => ({
    id: `brf-${date}`, user_id: U, briefing_date: date, notes,
    created_at: isoAt(date, '06:10'), updated_at: isoAt(date, '06:10'),
  })
  const briefings = [
    briefing(today, 'Yesterday: three of three outreach emails sent, the FAQ block drafted, and issue 11 finished. Nothing is stuck in review.'),
    briefing(yesterday, 'A full hour. Outreach first, then the FAQ block spot-check.'),
  ]

  let n = 0
  const item = (date: string, partial: Partial<BriefingItem> & { text: string }): BriefingItem => {
    n += 1
    return {
      id: `bri-${date}-${n}`, briefing_id: `brf-${date}`, user_id: U, item_type: 'checklist', section: null,
      file_path: null, sort_order: n, checked: false, recommendation: null, decision_status: null,
      resolution_note: null, created_at: isoAt(date, '06:10'), updated_at: isoAt(date, '06:10'),
      ...partial,
    }
  }

  const OUT = 'Outreach · about 25 min'
  const QA = 'QA and publish · about 20 min'
  const HOUSE = 'Housekeeping · about 15 min'

  const items: BriefingItem[] = [
    item(today, { section: OUT, text: "Send the three reviewed emails in today's outbox", file_path: `business/outreach/outbox/${today}/` }),
    item(today, { section: OUT, text: 'Send the reply to the bakery lead', file_path: `business/outreach/outbox/${today}/marrowby-bakehouse-reply.md`, checked: true }),
    item(today, { section: QA, text: 'Spot-check the Fernhollow FAQ block, then publish it', file_path: 'business/clients/fernhollow-dental/faq-block.md', checked: true }),
    item(today, { section: QA, text: 'Read the AI-visibility report draft before it goes out', file_path: 'business/clients/fernhollow-dental/report-draft.md' }),
    item(today, { section: QA, text: "Approve next month's content calendar", file_path: 'business/clients/ridgewick-outfitters/calendar.md' }),
    item(today, { section: HOUSE, text: 'Schedule newsletter issue 11', file_path: 'business/newsletter/issues/011.md' }),
    item(today, { section: HOUSE, text: 'Run the three prompts for the new metro and paste in the results', file_path: 'business/prospects/metro-hvac.md' }),
    item(today, { item_type: 'decision', text: 'Price for the review-response template pack', recommendation: '$19. It matches the other two listings and leaves room for a bundle.', decision_status: 'pending' }),
    item(today, { item_type: 'decision', text: 'Pause the HVAC opener that leans on a ranking claim', recommendation: 'Pause it. Reply rate on that variant is half the others, and the claim is hard to back up.', decision_status: 'pending' }),

    item(yesterday, { section: OUT, text: 'Send the three emails in the outbox', file_path: `business/outreach/outbox/${yesterday}/`, checked: true }),
    item(yesterday, { section: QA, text: 'Review the FAQ block draft for Fernhollow', file_path: 'business/clients/fernhollow-dental/faq-block.md', checked: true }),
    item(yesterday, { section: HOUSE, text: 'Read issue 11 and pick a subject line', file_path: 'business/newsletter/issues/011.md', checked: true }),
    item(yesterday, { item_type: 'decision', text: 'Open the new metro for HVAC outreach', recommendation: 'Open it. Twelve qualified prospects and none are named by the assistants today.', decision_status: 'approved', resolution_note: 'Start with the twelve, no more.' }),
  ]
  return { briefings, items }
}

function seedBusinessMetrics(): BusinessMetrics {
  return {
    user_id: U,
    revenue_total: 4350,
    clients_active: 3,
    ai_addon_clients: 2,
    prospects_in_pipeline: 46,
    outreach_drafted: 38,
    outreach_sent: 31,
    replies_received: 6,
    products_ready: 3,
    products_live: 2,
    content_ready: 9,
    content_published: 7,
    geo_reports_ready: 2,
    newsletter_subs: 184,
    phase: 'P3 Delivery: client work first, the add-on is the upsell',
    updated_at: minutesAgo(35),
  }
}

function seedSnapshots(today: string, costToday: number): MetricsSnapshot[] {
  const revenue = [2400, 2400, 2400, 2850, 2850, 2850, 3150, 3150, 3150, 3600, 3600, 3900, 3900, 4350]
  const clients = [2, 2, 2, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3, 3]
  const pipeline = [28, 29, 31, 31, 33, 34, 36, 36, 38, 40, 41, 43, 44, 46]
  const cost = [0.21, 0.34, 0.18, 0.29, 0.41, 0.12, 0.09, 0.27, 0.38, 0.31, 0.22, 0.36, 0.28, costToday]
  return revenue.map((r, i) => ({
    snapshot_date: addDays(today, i - (revenue.length - 1)),
    revenue_total: r,
    clients_active: clients[i],
    prospects_in_pipeline: pipeline[i],
    cost_today_usd: cost[i],
  }))
}

function seedClientMetrics(today: string): ClientMetricRow[] {
  const rows: ClientMetricRow[] = []
  const WEEKS = 8

  // start value, weekly drift, noise
  const seo: Record<string, Partial<Record<string, [number, number, number]>>> = {
    'cl-fernhollow': {
      organic_traffic: [1840, 95, 60], keyword_position_avg: [14.2, -0.7, 0.4], referring_domains: [38, 2, 1],
      organic_conversions: [21, 2, 2], technical_issues_open: [9, -1, 0.6],
    },
    'cl-ridgewick': {
      organic_traffic: [5120, 40, 220], keyword_position_avg: [9.8, -0.1, 0.5], referring_domains: [112, 1, 2],
      organic_conversions: [64, 1, 5], technical_issues_open: [17, 0.3, 1.2],
    },
    'cl-stonevale': {
      organic_traffic: [960, 70, 45], keyword_position_avg: [22.5, -1.1, 0.6], referring_domains: [19, 1, 1],
      organic_conversions: [8, 1, 1.5], technical_issues_open: [14, -1.2, 0.8],
    },
    // Onboarding: a baseline audit only, no conversions tracked yet.
    'cl-marrowby': {
      organic_traffic: [410, 4, 25], keyword_position_avg: [31.0, 0, 0.6], referring_domains: [7, 0, 0.4],
      technical_issues_open: [26, 0, 0.8],
    },
    // Paused: numbers drifting the wrong way.
    'cl-lakemoor': {
      organic_traffic: [1320, -45, 50], keyword_position_avg: [16.4, 0.5, 0.4], referring_domains: [41, -0.4, 0.8],
      organic_conversions: [15, -0.8, 1.5], technical_issues_open: [11, 0.9, 0.7],
    },
  }

  let seed = 11
  for (const [clientId, metrics] of Object.entries(seo)) {
    for (const [metric, spec] of Object.entries(metrics)) {
      if (!spec) continue
      const [start, drift, noise] = spec
      const next = rng(seed++)
      const weeks = clientId === 'cl-marrowby' ? 2 : WEEKS
      for (let w = 0; w < weeks; w++) {
        const raw = start + drift * w + (next() - 0.5) * 2 * noise
        const value = metric === 'keyword_position_avg' ? Math.round(Math.max(1, raw) * 10) / 10 : Math.max(0, Math.round(raw))
        rows.push({ client_id: clientId, metric, engine: null, value, captured_on: addDays(today, -7 * (weeks - 1 - w)) })
      }
    }
  }

  // GEO metrics exist only for clients on the AI-visibility add-on, and only for the
  // engines their prompt set has been run against. The gaps are deliberate.
  const geo: Record<string, Record<string, Record<string, [number, number]>>> = {
    'cl-fernhollow': {
      ai_share_of_voice: { chatgpt: [31, 2.4], perplexity: [44, 1.9], google_ai: [22, 1.6] },
      citation_rate: { chatgpt: [33, 1.5], perplexity: [50, 1.2], google_ai: [25, 1.3] },
    },
    'cl-stonevale': {
      ai_share_of_voice: { chatgpt: [12, 2.1], perplexity: [19, 2.6] },
      citation_rate: { chatgpt: [16, 1.8], perplexity: [25, 2.2] },
    },
  }
  for (const [clientId, metrics] of Object.entries(geo)) {
    for (const [metric, engines] of Object.entries(metrics)) {
      for (const [engine, [start, drift]] of Object.entries(engines)) {
        const next = rng(seed++)
        for (let w = 0; w < 6; w++) {
          const value = Math.round((start + drift * w + (next() - 0.5) * 3) * 10) / 10
          rows.push({ client_id: clientId, metric, engine, value: Math.max(0, Math.min(100, value)), captured_on: addDays(today, -7 * (5 - w)) })
        }
      }
    }
  }

  return rows
}

export function seedCrm(today: string): DemoDB['crm'] {
  const runs = seedRuns()
  const costToday = Math.round(runs.reduce((sum, r) => sum + Number(r.cost_usd ?? 0), 0) * 100) / 100
  const { briefings, items } = seedBriefings(today)
  return {
    clients: seedClients(today),
    agents: seedAgents(today),
    jobs: seedJobs(today),
    runs,
    businessMetrics: seedBusinessMetrics(),
    snapshots: seedSnapshots(today, costToday),
    costBaseline: { usd: 7.62, tokens: 2_540_000 },
    messages: seedMessages(today),
    briefings,
    briefingItems: items,
    clientMetrics: seedClientMetrics(today),
  }
}
