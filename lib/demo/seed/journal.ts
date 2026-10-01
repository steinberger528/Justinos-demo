// Sample data for the Journal tab: journal entries, the cached weekly reflection,
// organized ideas and the captures still waiting on the librarian. All invented.

import type { IdeaCaptureRow, IdeaRow, JournalEntryRow, NoteRow, ReflectionRow } from '../types'
import { addDays, isoAt, mondayOf } from '../dates'

export function seedJournal(today: string): { entries: JournalEntryRow[]; reflection: ReflectionRow } {
  const entry = (
    daysAgo: number, mood: number, named: string[], tags: string[], body: string,
    source: JournalEntryRow['source'] = 'text', prompt: string | null = null,
  ): JournalEntryRow => {
    const date = addDays(today, -daysAgo)
    const stamp = isoAt(date, '22:10')
    return {
      id: `jrn-${date}`, entry_date: date, emoji_mood: mood, named_moods: named, tags, prompt, body,
      source, image_ref: null, created_at: stamp, updated_at: stamp,
    }
  }

  const entries: JournalEntryRow[] = [
    entry(1, 4, ['focused', 'calm'], ['capstone', 'school'], 'Got the current-state map done with the team and it finally looks like the plant we walked through. Homework 3 slipped again, which is on me. Tomorrow it goes first.'),
    entry(2, 3, ['drained'], ['capstone'], 'Long studio day. The sponsor still has not sent the data, so we sketched around the gap. I need to stop saying yes to evening things on Thursdays.', 'voice'),
    entry(3, 5, ['energized'], ['running', 'agency'], 'Ran eight miles without stopping, first time. A prospect also replied on the agency side, which made the rest of the day easy.', 'text', 'What made today feel worth it?'),
    entry(5, 2, ['anxious', 'low'], ['admin'], 'Too many open loops. The reimbursement form, the lease, the reference letter. None of them are hard. They just keep sitting there.', 'text', "What's weighing on you right now?"),
    entry(6, 4, ['calm'], ['school'], 'Regression finally clicked in lab. Interaction terms are just a slope that depends on something else. Wrote that on the first page of my notes.'),
    entry(7, 3, ['focused'], ['agency'], 'Spent the agency hour approving drafts instead of rewriting them. That is the whole point of the briefing, and I still have to remind myself.'),
    entry(8, 4, ['energized', 'focused'], ['running'], 'Six miles before class. The plan had the workout at 5:30 pm and I moved it to the morning by texting the bot. It moved everything else and nothing broke.', 'voice'),
    entry(10, 3, ['calm'], ['school'], 'Quiet day. Two lectures, one problem set, in bed by eleven.'),
    entry(11, 4, ['focused'], ['capstone'], 'Sponsor signed off on the problem statement. It took four drafts and it was worth it, because now we can say no to things.'),
    entry(12, 2, ['drained'], ['school'], 'Quiz went badly. I studied the wrong half of the chapter. Adding topic checklists to every exam from now on.'),
    entry(13, 4, ['calm', 'focused'], ['routine'], 'Sunday reset worked. Plan for the week is in, laundry is done, and the fridge has food in it.'),
  ]

  const lastMonday = addDays(mondayOf(today), -7)
  const reflection: ReflectionRow = {
    week_start: lastMonday,
    summary: 'Energy followed your training more than your workload last week. The two best days both had a long run in them. The one low day came from small admin tasks piling up, not from school.',
    mood_trend: 'steady, one dip',
    themes: ['open loops', 'training', 'capstone', 'evening commitments'],
    observation: 'You mentioned the reimbursement form on three separate days.',
    generated_at: isoAt(addDays(lastMonday, 6), '09:02'),
  }

  return { entries, reflection }
}

export function seedIdeas(today: string): {
  ideas: IdeaRow[]
  insight: { insight: string; generated_at: string }
  captures: IdeaCaptureRow[]
} {
  const idea = (
    id: string, daysAgo: number, theme: string | null, title: string, summary: string, body: string,
    tags: string[], related: string[] = [],
  ): IdeaRow => {
    const date = addDays(today, -daysAgo)
    const stamp = isoAt(date, '08:00')
    return {
      id, title, summary, body, tags, theme, source: 'dashboard-text', related,
      vault_path: `Ideas/${date}/${id}.md`, created_at: stamp, updated_at: stamp,
    }
  }

  const ideas: IdeaRow[] = [
    idea('weekly-review-that-writes-itself', 2, 'Dashboard', 'A weekly review that writes itself',
      'Build the Sunday review from the audit log and the week of plans, not from memory.',
      'Every write already lands in the audit log, and every day has a plan with what was placed and what was pushed. A weekly review could start as a diff between the two: planned, done, pushed twice, never touched. I would only have to answer the questions it raises.',
      ['automation', 'review'], ['[[agentic-os-build-plan]]', '[[weekly-review]]']),
    idea('show-what-the-planner-pushed', 4, 'Dashboard', 'Show what the planner pushed, and why',
      'The plan drops tasks when the day is full. Put that list where I can see it.',
      'Right now a pushed task only shows up in the morning message. A small "pushed today" list on the calendar card would make it obvious when the same task keeps losing its slot.',
      ['planner', 'calendar'], ['[[replan-day]]']),
    idea('deliverable-to-template', 3, 'Agency', 'Turn each client deliverable into a template',
      'Every finished client asset is one edit away from being a product.',
      'The schema pack and the FAQ block are the same shape for every local business. Strip the client details, write a short guide, and it becomes something the product agent can list.',
      ['products', 'reuse']),
    idea('ai-visibility-snapshot', 6, 'Agency', 'One-page AI visibility snapshot as the opener',
      'Lead outreach with what the AI assistants say about the prospect today.',
      'A prospect cares more about "your competitors are being recommended and you are not" than about a list of services. One page, three prompts, their name highlighted or missing.',
      ['outreach', 'geo']),
    idea('exam-notes-two-weeks-out', 5, 'School', 'Exam notes from lecture slides, two weeks out',
      'When an exam is fourteen days away, build the topic notes from the lectures already filed.',
      'The lecture notes are in the vault by course. Two weeks before an exam, collect the ones that match the topic checklist and draft a study guide I can mark up.',
      ['study', 'automation'], ['[[ingest-lectures]]']),
    idea('batch-the-phone-calls', 8, 'Life', 'Batch every phone call into one block',
      'Calls are easy to avoid one at a time and easy to do in a row.',
      'The planner already groups tasks by block type. Giving Calls its own short block after lunch means the three calls I have been avoiding take twenty minutes.',
      ['habits']),
    idea('walking-voice-memos', 1, null, 'Voice memos on the walk between classes',
      'Ten minutes of walking is enough to capture the idea from the lecture I just left.',
      'Send a voice note to the bot on the way out of class. It gets transcribed, filed overnight, and shows up here already sorted.',
      ['capture']),
  ]

  return {
    ideas,
    insight: {
      insight: JSON.stringify({
        summary: 'Three of your last seven ideas are about the same thing: closing the gap between what was planned and what happened. That is one build, not three notes.',
      }),
      generated_at: isoAt(addDays(mondayOf(today), -1), '09:04'),
    },
    captures: [
      { id: 'cap-1', text: 'idea: let study weights raise themselves the week before an exam', source: 'telegram', status: 'pending', created_at: isoAt(today, '10:52') },
      { id: 'cap-2', text: 'what if the briefing showed how long each block actually took yesterday', source: 'dashboard-text', status: 'pending', created_at: isoAt(today, '08:21') },
    ],
  }
}

export function seedNotes(today: string): NoteRow[] {
  return [
    { id: 'note-1', text: 'Dr. Ellison said the midterm will have one formulation problem and it will look like the network flow example from week 5.', source_type: 'raw_capture', created_at: isoAt(addDays(today, -2), '10:50') },
    { id: 'note-2', text: 'Sponsor liaison prefers one email per week, sent Friday morning.', source_type: 'raw_capture', created_at: isoAt(addDays(today, -6), '16:35') },
    { id: 'note-3', text: 'The parking office closes at 4 on Fridays.', source_type: 'raw_capture', created_at: isoAt(addDays(today, -9), '15:12') },
  ]
}
