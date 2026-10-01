// A simulated run of the nightly routine, for the Control Room walkthrough.
//
// In production this is a headless Claude Code session started by Windows Task
// Scheduler at 07:30, with plain scripts on either side of it. Here the same steps run
// in order against the demo database, so a visitor can watch a capture travel from the
// dashboard into the vault and back out as an organized idea.

import { audit, mutate } from './db'
import { isoAt, todayKey } from './dates'
import type { IdeaRow } from './types'

export interface LibrarianStep {
  capability: string
  owner: 'Athena' | 'script'
  autonomy: 'S1' | 'S3'
  detail: string
}

function themeFor(text: string): string {
  const t = text.toLowerCase()
  if (/\b(dashboard|planner|briefing|calendar|plan|block|task|habit|card|bot|telegram)\b/.test(t)) return 'Dashboard'
  if (/\b(client|agency|outreach|newsletter|prospect|product|report)\b/.test(t)) return 'Agency'
  if (/\b(exam|study|lecture|class|course|quiz|homework|professor|weights?)\b/.test(t)) return 'School'
  return 'Life'
}

function titleFor(text: string): string {
  const cleaned = text
    .replace(/^(idea|brainstorm)\s*[:-]\s*/i, '')
    .replace(/^(what if|maybe)\s+(we|i|the)?\s*/i, '')
    .replace(/[.?!]+$/, '')
    .trim()
  const words = cleaned.split(/\s+/)
  const short = words.length > 9 ? `${words.slice(0, 9).join(' ')}…` : cleaned
  return short.charAt(0).toUpperCase() + short.slice(1)
}

const slug = (title: string) =>
  title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48)

export function runLibrarian(): { steps: LibrarianStep[]; filed: number } {
  const today = todayKey()
  return mutate(db => {
    const pending = db.ideaCaptures.filter(c => c.status === 'pending')
    const steps: LibrarianStep[] = []

    steps.push({
      capability: 'idea-inbox-sync', owner: 'script', autonomy: 'S3',
      detail: pending.length > 0
        ? `Pulled ${pending.length} pending capture${pending.length === 1 ? '' : 's'} out of the database and wrote each one as a note in the vault inbox.`
        : 'No pending captures in the database. Nothing to pull.',
    })

    steps.push({
      capability: 'sweep-sessions', owner: 'Athena', autonomy: 'S3',
      detail: 'Read the session transcripts since the last watermark. One held a decision worth keeping and became an inbox note. The rest were skipped.',
    })

    const now = new Date().toISOString()
    const filed: IdeaRow[] = pending.map(capture => {
      const title = titleFor(capture.text)
      return {
        id: `idea-${capture.id}`,
        title,
        summary: capture.text.replace(/^(idea|brainstorm)\s*[:-]\s*/i, ''),
        body: `Captured on ${new Date(capture.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} from ${capture.source === 'telegram' ? 'Telegram' : 'the dashboard'}. Filed by the librarian with no edits to the idea itself, only a title, a theme and tags.`,
        tags: ['captured', themeFor(capture.text).toLowerCase()],
        theme: themeFor(capture.text),
        source: capture.source,
        vault_path: `Ideas/${today}/${slug(title)}.md`,
        related: [],
        created_at: now,
        updated_at: now,
      }
    })
    for (const capture of pending) capture.status = 'synced'

    steps.push({
      capability: 'file-inbox', owner: 'Athena', autonomy: 'S3',
      detail: filed.length > 0
        ? `Filed ${filed.length} idea${filed.length === 1 ? '' : 's'} into Ideas/${today}/ with a title, theme and tags, and moved the session note into its area. Nothing is ever deleted, only archived.`
        : 'Inbox was already empty apart from the session note, which was moved into its area.',
    })
    steps.push({
      capability: 'index-regeneration', owner: 'script', autonomy: 'S3',
      detail: 'Rebuilt the vault catalog and the memory index from note frontmatter.',
    })
    steps.push({
      capability: 'capabilities-push', owner: 'script', autonomy: 'S3',
      detail: `Checked ${db.controlRoom.capabilities.length} capability cards against the dashboard. None changed.`,
    })

    const waiting = db.controlRoom.telemetry.waiting_on_you
    if (waiting) {
      waiting.payload.reorg_proposals_unapplied += 1
      waiting.payload.inbox_depth = 0
    }
    steps.push({
      capability: 'propose-reorg', owner: 'Athena', autonomy: 'S1',
      detail: 'Ran the lint pass and wrote a reorg proposal with two suggestions. It changes nothing until the operator says to apply it.',
    })
    steps.push({
      capability: 'librarian', owner: 'Athena', autonomy: 'S3',
      detail: 'Logged the run and made one commit with everything above.',
    })

    db.ideas.unshift(...filed)
    steps.push({
      capability: 'ideas-push', owner: 'script', autonomy: 'S3',
      detail: filed.length > 0
        ? `Pushed ${filed.length} organized idea${filed.length === 1 ? '' : 's'} back to the dashboard. Open the Journal tab to see ${filed.length === 1 ? 'it' : 'them'} under a theme.`
        : 'Nothing new to push. The dashboard already matches the vault.',
    })

    const health = db.controlRoom.telemetry.task_health?.payload.tasks.find(t => t.name === 'ideas-push')
    if (health) { health.status = 'ok'; health.consecutive_failures = 0 }
    if (db.controlRoom.telemetry.failures) db.controlRoom.telemetry.failures.payload.failures = []

    audit(db, 'run', 'librarian', null, { filed: filed.length, at: isoAt(today, '07:30') })
    return { steps, filed: filed.length }
  })
}
