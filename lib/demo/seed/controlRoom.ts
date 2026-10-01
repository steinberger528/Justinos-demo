// Sample data for the Control Room tab.
//
// The capability list is the real shape of the system: the same automations, owners,
// runtimes, autonomy levels, triggers and step lists that run in production, with
// wording generalized. The telemetry (sessions, repos, token counts, failures) is
// invented, because the real numbers describe one person's working day.

import type {
  Capability, CapabilityStep, ControlRoomTelemetry, StepTag,
} from '@/components/dashboard/control-room-types'
import type { DemoDB } from '../types'
import { addDays, isoAt, minutesAgo, shortDate } from '../dates'
import { AGENTIC_OS_GOAL_ID } from '../ids'

type StepSpec = [text: string, tag: StepTag]

interface CapSpec {
  name: string
  description: string
  agent: Capability['agent']
  runtime: string
  autonomy: string
  trigger: string
  status?: string
  domain?: string
  createdDaysAgo: number
  steps: StepSpec[]
}

const CAPABILITIES: CapSpec[] = [
  // ── Athena: memory and filing ──────────────────────────────────────────────
  {
    name: 'librarian', agent: 'athena', runtime: 'local-scheduled', autonomy: 'S3', createdDaysAgo: 31,
    description: 'Runs the whole nightly routine: sweep sessions, file the inbox, regenerate indexes, flag stale tasks, propose a reorg, log and commit.',
    trigger: '/librarian, or Task Scheduler daily 07:30',
    steps: [
      ['Invoke /sweep-sessions', 'ai'],
      ['Invoke /file-inbox', 'ai'],
      ['Regenerate the catalog and the memory index', 'tool'],
      ['Flag stale done-tasks in the run summary', 'ai'],
      ['Invoke /propose-reorg', 'ai'],
      ['Log the run', 'tool'],
      ['Commit everything as one librarian commit', 'tool'],
      ['Operator applies a reorg proposal', 'manual'],
    ],
  },
  {
    name: 'sweep-sessions', agent: 'athena', runtime: 'local-session', autonomy: 'S3', createdDaysAgo: 31,
    description: 'Mines Claude Code session transcripts since the last watermark into inbox notes. Durable decisions, discoveries and open questions only.',
    trigger: '/sweep-sessions, or step 1 of the nightly librarian',
    steps: [
      ['Read the sweep watermark', 'tool'],
      ['List transcripts newer than the watermark, capped at 10', 'tool'],
      ['Judge each digest for durable knowledge', 'ai'],
      ['Write an inbox note when durable, skip otherwise', 'ai'],
      ['Update the watermark', 'tool'],
    ],
  },
  {
    name: 'file-inbox', agent: 'athena', runtime: 'local-session', autonomy: 'S3', createdDaysAgo: 31,
    description: 'Files every inbox note to its correct vault folder, merging on a subject match and rewriting idea captures into organized notes.',
    trigger: '/file-inbox, or step 2 of the nightly librarian',
    steps: [
      ['Search the vault for an existing note on the same subject', 'ai'],
      ['Merge into it, or normalize frontmatter and move to the right folder', 'ai'],
      ['Rewrite idea captures into organized idea notes', 'ai'],
      ['Frontmatter sweep on notes created since the last librarian commit', 'tool'],
    ],
  },
  {
    name: 'propose-reorg', agent: 'athena', runtime: 'local-session', autonomy: 'S1', createdDaysAgo: 31,
    description: 'Runs the vault lint, applies judgment to its findings, and writes a dated reorg proposal. Propose-only, never auto-applied.',
    trigger: '/propose-reorg, or step 5 of the nightly librarian',
    steps: [
      ['Run vault-lint', 'tool'],
      ['Apply judgment and discard noise', 'ai'],
      ['Check whether filed facts should propagate into other notes', 'ai'],
      ['Write a dated reorg proposal', 'ai'],
      ['Operator says "apply the reorg proposal"', 'manual'],
    ],
  },
  {
    name: 'capture-note', agent: 'athena', runtime: 'local-session', autonomy: 'S3', createdDaysAgo: 31,
    description: 'Records one fact, decision or lesson mid-conversation as a short inbox note, without ending the session.',
    trigger: '/capture-note, mid-conversation',
    steps: [
      ['Write two or three sentences capturing the fact or decision', 'ai'],
      ['Save it to the inbox with standard frontmatter', 'tool'],
    ],
  },
  {
    name: 'capture-session', agent: 'athena', runtime: 'local-session', autonomy: 'S3', createdDaysAgo: 31,
    description: 'Distills the current session into an inbox note: decisions, discoveries, open questions. Offered after substantive work.',
    trigger: '/capture-session, offered after substantive work',
    steps: [
      ['Review the conversation for durable knowledge', 'ai'],
      ['Write an inbox note if anything durable happened', 'ai'],
      ['Mark the session as processed', 'tool'],
    ],
  },
  {
    name: 'ingest-lectures', agent: 'athena', runtime: 'local-session', autonomy: 'S3', domain: 'school', createdDaysAgo: 1,
    description: 'Turns lecture PDFs and slide decks into study-grade course notes, filed and linked per course.',
    trigger: '/ingest-lectures, after lecture files land in the inbox',
    steps: [
      ['Drop lecture PDFs or decks in the inbox', 'manual'],
      ['Convert decks to PDF and split into 10-page chunks', 'tool'],
      ["Identify each file's course, and ask when it is ambiguous", 'ai'],
      ['Read every slide and write one study-grade note per lecture', 'ai'],
      ['Link the note from the course page', 'ai'],
      ['Move the original out of the vault, log and commit', 'tool'],
    ],
  },

  // ── Neptune: the day ───────────────────────────────────────────────────────
  {
    name: 'build-day', agent: 'neptune', runtime: 'server-cron', autonomy: 'S3', domain: 'productivity', createdDaysAgo: 19,
    description: "Drafts today's schedule from day rules, fixed events, tasks and yesterday's plan, then sends the morning brief with a few questions.",
    trigger: 'Vercel cron in the 6:00 local hour',
    steps: [
      ['Gather day rules, fixed events, tasks, recent plans and exams in one pass', 'tool'],
      ['Place rule windows and task blocks in the open time with one Claude call', 'ai'],
      ['Decide which overflow becomes a morning question and which is a silent push', 'ai'],
      ['Validate the plan with one corrective retry. On failure, write nothing and send a notice', 'tool'],
      ['Compute candidate windows for each offered intention', 'tool'],
      ['Write the draft plan and the brief questions', 'tool'],
      ['Send the Telegram brief with questions and the Replan button', 'tool'],
    ],
  },
  {
    name: 'replan-day', agent: 'neptune', runtime: 'server-cron', autonomy: 'S3', domain: 'productivity', createdDaysAgo: 13,
    description: 'Rebuilds the rest of today from a Telegram message, the Replan button, or the morning cutoff. A cheap block move in code when it can, one Claude call otherwise.',
    trigger: 'Telegram message, the Replan button, or the 9:00 cutoff',
    steps: [
      ['Router classifies the message as a replan', 'ai'],
      ['Try a single-block move first, with no model call', 'tool'],
      ['Budget guard: past six model-backed replans in a day, park the request', 'tool'],
      ['Otherwise one Claude call rebuilds the rest of the day', 'ai'],
      ['Flag any pushed task that was due today', 'tool'],
      ['Write the plan, sync the calendar and reply with the new timeline', 'tool'],
    ],
  },
  {
    name: 'heartbeat', agent: 'neptune', runtime: 'local-scheduled', autonomy: 'S2', domain: 'productivity', createdDaysAgo: 13,
    description: 'Three check-ins a day that read the plan and tasks and speak only when there is a reason. Otherwise it exits silently.',
    trigger: 'Task Scheduler daily 10:00 / 14:00 / 20:00',
    steps: [
      ["Read today's plan, open tasks and today's error rows", 'tool'],
      ['Check five reasons in priority order. Plain comparisons, no model judgment', 'tool'],
      ['If one fired, send a single Telegram message. Otherwise exit silently', 'tool'],
    ],
  },

  // ── Unowned scripts: no judgment, free to run ──────────────────────────────
  {
    name: 'canvas-sync', agent: 'none', runtime: 'script', autonomy: 'S3', domain: 'school', createdDaysAgo: 13,
    description: 'Reads the course calendar feed and turns assignments into School tasks, matching syllabus-seeded tasks and keeping due dates current.',
    trigger: 'Vercel cron daily 5:00 local, an hour before build-day',
    steps: [
      ['Fetch the course calendar feed and parse assignments', 'tool'],
      ['Match each item to a syllabus task, or plan a new School task', 'tool'],
      ['Write links, new tasks and changed dates, and audit every write', 'tool'],
      ['Send a Telegram summary when anything changed', 'tool'],
      ['Check off completed assignments, since the feed has no submission status', 'manual'],
    ],
  },
  {
    name: 'supabase-mirror', agent: 'none', runtime: 'script', autonomy: 'S3', createdDaysAgo: 31,
    description: 'One-way full refresh from the database into generated markdown in the vault, so agents can read dashboard state as files.',
    trigger: 'Task Scheduler daily 07:00, and as a pre-step of the daily brain',
    steps: [
      ['Pull tasks, daily logs, day plans, entities and journal entries', 'tool'],
      ['Overwrite the generated mirror files in place', 'tool'],
    ],
  },
  {
    name: 'idea-inbox-sync', agent: 'none', runtime: 'script', autonomy: 'S3', createdDaysAgo: 31,
    description: 'Pulls pending brainstorm captures out of the database and writes each one as an inbox note for the librarian to file.',
    trigger: 'Task Scheduler daily 07:05',
    steps: [
      ['Query idea captures where status is pending', 'tool'],
      ['Write one inbox note per row', 'tool'],
      ['Flip each row to synced', 'tool'],
    ],
  },
  {
    name: 'ideas-push', agent: 'none', runtime: 'script', autonomy: 'S3', createdDaysAgo: 31,
    description: "One-way push from the vault's organized idea notes into the dashboard. The vault stays the source of truth.",
    trigger: 'Task Scheduler daily 08:00',
    steps: [
      ['Scan the Ideas folder for organized notes', 'tool'],
      ['Upsert by vault path and delete stale rows', 'tool'],
    ],
  },
  {
    name: 'capabilities-push', agent: 'none', runtime: 'script', autonomy: 'S3', createdDaysAgo: 30,
    description: 'One-way push from the capability cards in the vault into the dashboard table this tab reads.',
    trigger: 'Step 3 of the nightly librarian',
    steps: [
      ['Scan capability cards for frontmatter and steps', 'tool'],
      ['Upsert by vault path and delete stale rows', 'tool'],
    ],
  },
  {
    name: 'index-regeneration', agent: 'none', runtime: 'script', autonomy: 'S3', createdDaysAgo: 31,
    description: 'Regenerates the vault catalog and the memory index from note frontmatter. Never edited by hand.',
    trigger: 'Step 3 of the nightly librarian, and after memory or note writes',
    steps: [
      ['Walk the vault for frontmatter and write the catalog files', 'tool'],
      ['Walk the memory folder and write its index', 'tool'],
    ],
  },
  {
    name: 'vault-lint', agent: 'none', runtime: 'script', autonomy: 'S1', createdDaysAgo: 31,
    description: 'Read-only vault health check: orphaned notes, broken links, stale notes, missing frontmatter and catalog size against budget.',
    trigger: 'Step 1 of /propose-reorg, and on demand',
    steps: [
      ['Scan every note for the findings above', 'tool'],
      ['Print a findings report and write nothing', 'tool'],
    ],
  },
  {
    name: 'commit-sweep', agent: 'none', runtime: 'script', autonomy: 'S3', createdDaysAgo: 31,
    description: 'Safety net that commits vault output stranded by a scheduled task that wrote files but never reached its own commit step.',
    trigger: 'Task Scheduler daily 12:00 / 18:00 / 23:00',
    steps: [
      ['Check for uncommitted output from the mirror, idea sync, daily brain and librarian', 'tool'],
      ['Commit stranded files and regenerate the task status note', 'tool'],
    ],
  },
  {
    name: 'work-evidence-push', agent: 'none', runtime: 'script', autonomy: 'S3', domain: 'productivity', createdDaysAgo: 9,
    description: 'Pushes what actually got done yesterday into the database, so the morning plan starts from evidence. It never completes a task on its own.',
    trigger: 'Chained after the daily brain, about 3:35 local',
    steps: [
      ['Read the last three daily notes', 'tool'],
      ["Extract each note's Done section", 'tool'],
      ['Upsert one evidence row per date', 'tool'],
    ],
  },
  {
    name: 'jea-bridge', agent: 'none', runtime: 'script', autonomy: 'S3', createdDaysAgo: 30,
    description: 'Command-line bridge that lets a vault session or a scheduled task read and write dashboard state over its authenticated HTTP API.',
    trigger: 'On demand',
    steps: [
      ['Read tasks, fixed events, school and calendar state', 'tool'],
      ['A write needs --confirm, or an approval prompt in an attended session', 'manual'],
      ['POST or PATCH the change to the dashboard API', 'tool'],
    ],
  },
  {
    name: 'fixed-events-push', agent: 'none', runtime: 'script', autonomy: 'S3', status: 'planned', createdDaysAgo: 30,
    description: "One-way push from each course page's meeting blocks into the fixed events table. Rows entered by hand are never touched.",
    trigger: 'Not scheduled yet',
    steps: [
      ['Scan course pages for meeting blocks', 'tool'],
      ['Upsert one fixed event per block', 'tool'],
      ['Delete vault-sourced rows whose meeting no longer exists', 'tool'],
    ],
  },

  // ── Headless nightly sessions ──────────────────────────────────────────────
  {
    name: 'daily-brain', agent: 'none', runtime: 'local-scheduled', autonomy: 'S3', createdDaysAgo: 31,
    description: "Nightly narrative brief for the agency repo. Gathers the day's activity and writes an evidence-only note into the vault.",
    trigger: 'Task Scheduler daily 03:15',
    steps: [
      ["Fetch the day's activity", 'tool'],
      ['Write an evidence-only note and commit it in the vault', 'ai'],
      ['Run the post-run health check and escalate on failure', 'tool'],
    ],
  },
  {
    name: 'daily-brain-jea', agent: 'none', runtime: 'local-scheduled', autonomy: 'S3', createdDaysAgo: 31,
    description: 'Nightly narrative brief for the dashboard. Refreshes the vault mirror, then writes an evidence-only note about the day.',
    trigger: 'Task Scheduler daily 03:35',
    steps: [
      ['Refresh the generated vault mirror, best effort', 'tool'],
      ['Write an evidence-only note about the day', 'ai'],
      ['Run the post-run health check and escalate on failure', 'tool'],
    ],
  },
]

export function seedCapabilities(today: string): Capability[] {
  return CAPABILITIES
    .map((c): Capability => {
      const created = isoAt(addDays(today, -c.createdDaysAgo), '09:00')
      return {
        id: `cap-${c.name}`,
        name: c.name,
        description: c.description,
        area: 'capabilities',
        agent: c.agent,
        runtime: c.runtime,
        autonomy: c.autonomy,
        trigger: c.trigger,
        status: c.status ?? 'running',
        steps: c.steps.map(([text, tag]): CapabilityStep => ({ text, tag })),
        vault_path: `capabilities/${c.name}.md`,
        domain: c.domain ?? 'meta',
        created_at: created,
        updated_at: created,
      }
    })
    .sort((a, b) => a.name.localeCompare(b.name))
}

function seedTelemetry(today: string): ControlRoomTelemetry {
  const captured_at = minutesAgo(12)
  const row = <T,>(payload: T) => ({ payload, captured_at })

  // Thirty days of token counts per repo. A fixed wave, not random, so the totals
  // are the same for every visitor.
  const days = Array.from({ length: 30 }, (_, i) => {
    const date = addDays(today, i - 29)
    const weekend = [0, 6].includes(new Date(`${date}T00:00:00`).getDay())
    const base = weekend ? 0.55 : 1
    return {
      date_label: shortDate(date),
      by_repo: {
        dashboard: Math.round((190_000 + 70_000 * Math.sin(i / 2.3)) * base),
        'second-brain': Math.round((120_000 + 45_000 * Math.cos(i / 3.1)) * base),
        agency: Math.round((60_000 + 30_000 * Math.sin(i / 1.7 + 1)) * base),
      },
    }
  })

  return {
    live_sessions: row({
      sessions: [
        { repo: 'dashboard', title: 'Goals card: undo for an archived goal', context_pct: 58, compactions: 1, duration_label: '1h 12m', status: 'live' as const },
        { repo: 'second-brain', title: 'File two new lecture decks', context_pct: 81, compactions: 2, duration_label: '2h 05m', status: 'live' as const },
        { repo: 'agency', title: 'Review outreach batch 14', context_pct: 34, compactions: 0, duration_label: '38m', status: 'idle' as const },
        { repo: 'dashboard', title: 'Journal: keyboard shortcut for save', context_pct: 22, compactions: 0, duration_label: '19m', status: 'idle' as const },
      ],
    }),
    recent_sessions: row({
      sessions: [
        { title: 'Habit tracker: weekly streak view', summary: 'Added a seven-day strip under the tracker. Reads the same daily log rows, no new table.', date_label: shortDate(addDays(today, -1)), duration_label: '1h 40m' },
        { title: 'Planner: explain why a task was pushed', summary: 'Each pushed task now carries a one-line reason, shown in the briefing under the schedule.', date_label: shortDate(addDays(today, -2)), duration_label: '2h 15m' },
        { title: 'School: sort the exam center by days left', summary: 'Tiles were sorted by course. Sorting by date puts the nearest exam first.', date_label: shortDate(addDays(today, -3)), duration_label: '45m' },
        { title: 'Agency: template for the monthly report', summary: 'Pulled the report layout into a template so each client report starts from the same sections.', date_label: shortDate(addDays(today, -4)), duration_label: '35m' },
        { title: 'Vault: tidy the templates folder', summary: 'Merged three overlapping note templates into one and updated the notes that linked to them.', date_label: shortDate(addDays(today, -6)), duration_label: '1h 05m' },
      ],
    }),
    git_status: row({
      repos: [
        { name: 'dashboard', branch: 'main', sha: 'c4e91ab', changed_count: 0 },
        { name: 'second-brain', branch: 'main', sha: '7d02f6e', changed_count: 3 },
        { name: 'agency', branch: 'main', sha: 'b81a5c0', changed_count: 0 },
      ],
    }),
    task_health: row({
      tasks: [
        { name: 'daily-brain', trigger_label: '03:15', status: 'ok' as const, consecutive_failures: 0 },
        { name: 'daily-brain-jea', trigger_label: '03:35', status: 'ok' as const, consecutive_failures: 0 },
        { name: 'supabase-mirror', trigger_label: '07:00', status: 'ok' as const, consecutive_failures: 0 },
        { name: 'idea-inbox-sync', trigger_label: '07:05', status: 'ok' as const, consecutive_failures: 0 },
        { name: 'librarian', trigger_label: '07:30', status: 'ok' as const, consecutive_failures: 0 },
        { name: 'ideas-push', trigger_label: '08:00', status: 'error' as const, consecutive_failures: 1 },
        { name: 'heartbeat', trigger_label: '10:00', status: 'ok' as const, consecutive_failures: 0 },
        { name: 'commit-sweep', trigger_label: '12:00', status: 'ok' as const, consecutive_failures: 0 },
      ],
    }),
    failures: row({
      failures: [
        { source: 'ideas-push', date_label: `${shortDate(today)} 08:00`, message: 'fetch failed: network unreachable. The laptop was asleep at the trigger time. It retries on the next run.' },
      ],
      window_days: 30,
      clean_run_count: 212,
    }),
    waiting_on_you: row({
      reorg_proposals_unapplied: 2,
      reorg_oldest_date_label: shortDate(addDays(today, -3)),
      inbox_depth: 4,
    }),
    token_usage: row({ days, heaviest_repo: 'dashboard' }),
  }
}

export function seedControlRoom(today: string): DemoDB['controlRoom'] {
  return {
    capabilities: seedCapabilities(today),
    goalId: AGENTIC_OS_GOAL_ID,
    telemetry: seedTelemetry(today),
  }
}
