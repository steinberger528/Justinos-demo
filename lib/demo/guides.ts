// The short guide shown at the top of each tab: what the tab is for in the system,
// and a few things worth trying in the demo.

export interface TabGuideEntry {
  title: string
  body: string
  /** Extra line for the current sub-tab, keyed by its path. */
  sections?: Record<string, { label: string; body: string }>
  /** Things to try. "{quickMove}" is replaced with a block move that fits today's plan. */
  tryIt?: string[]
}

export const GUIDES: Record<string, TabGuideEntry> = {
  '/': {
    title: 'Home',
    body: "The page the day runs from. The Session bar takes anything typed in plain language and files it in the right place. Today's Tasks holds what is due or planned for today, with one task in focus. The calendar shows the plan the scheduling agent built this morning around classes and other fixed events, and habits, nutrition and goals sit beside it.",
    tryIt: [
      'Type "Email the professor about the midterm by Friday" in the Session bar and press Enter',
      'Type "{quickMove}" to move a block on today\'s plan',
      'Hover a task, click "→ focus", then check it off',
      'Open Briefing on the Session card',
      'Click "Plan my week" and drag a task onto a day',
    ],
  },
  '/control-room': {
    title: 'Control Room',
    body: 'A view of the automation behind the dashboard: which agents and scripts exist, when each one runs, how much each is allowed to do without asking, and whether the last runs were healthy. Nothing on this tab is typed in by hand. It reads the same capability cards the agents read.',
    sections: {
      '/control-room/overview': { label: 'How it works', body: 'A walkthrough of the whole system. You can send a message through the capture pipeline and step through a nightly run.' },
      '/control-room/work-session': { label: 'Work Session', body: 'What is running right now: open coding sessions and how full their context is, token spend, repo state, failed runs, and the short list of things waiting on a person.' },
      '/control-room/agent-flows': { label: 'Agent Flows', body: 'Who owns what: the four agents, the skills each one calls, and where coverage is still missing.' },
      '/control-room/automations': { label: 'Automations', body: "Every capability grouped by where it runs, with today's schedule and the steps that still need a human." },
    },
    tryIt: [
      'On How it works, send a message through the pipeline',
      "Step through tonight's librarian run",
      'On Automations, search for "replan"',
    ],
  },
  '/crm': {
    title: 'CRM',
    body: 'The cockpit for a small content agency whose drafting and research is done by seven specialist agents. The agents never send or publish anything. A person reviews, decides and approves here, and the briefing is sized to fit in about an hour a day.',
    sections: {
      '/crm/executive': { label: 'Executive', body: 'What changed and what needs attention: revenue, pipeline and cost, the outreach funnel, and messages the agents flagged for a human.' },
      '/crm/workday': { label: 'Workday', body: "What to do next: today's briefing as a checklist, decisions waiting on a yes or no, and escalations from blocked agents." },
      '/crm/agents': { label: 'Agents', body: 'What the agents are doing: a live feed of every step with its tool, input, output and cost, a board of jobs, and the status of each agent.' },
      '/crm/clients': { label: 'Clients', body: 'How the book of business is doing: search metrics for each client scored against the others, with AI visibility for each engine one click down.' },
    },
    tryIt: [
      'On Workday, approve or reject a decision',
      'Resolve an escalation and the blocked agent goes back to work',
      'On Agents, click a feed row, or drag a job to another column',
      'On Clients, click a row',
    ],
  },
  '/school': {
    title: 'School',
    body: 'Everything with a due date across every course, on one page. Assignments arrive from a daily sync with the course calendar feed and from each syllabus. Exams and quizzes get their own area with a countdown and a topic checklist. The same items appear on Home and in the morning plan.',
    tryIt: [
      'Open an exam tile and tick off a topic',
      'Switch the first panel from List to Calendar',
      'Open a course to see its grading, policies and tasks',
      'Expand an item and mark it In Progress',
    ],
  },
  '/journal': {
    title: 'Journal',
    body: 'Two kinds of capture that are not tasks. Brainstorm takes a raw idea and queues it. Overnight the librarian agent files it in the notes vault under a theme, and the organized version comes back here. Journal takes one entry a day with a mood, and a weekly reflection summarizes the pattern. The AI summaries on this tab are stored snapshots, generated on a schedule and never on page load.',
    tryIt: [
      'Capture an idea, then run the librarian from Control Room, How it works',
      "Pick a mood and save today's entry",
      'Click an idea to read the full note',
    ],
  },
  '/settings': {
    title: 'Settings',
    body: 'The rules the morning plan is built around: when the day starts, how long meals, workouts and study blocks run, and which course gets attention first. Changes apply to the next plan.',
    tryIt: ['Edit a rule', 'Add a course weight'],
  },
}

/** The guide for a pathname: the longest tab path that prefixes it. */
export function guideFor(pathname: string): { key: string; guide: TabGuideEntry; section: { label: string; body: string } | null } | null {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname
  const key = Object.keys(GUIDES)
    .filter(k => (k === '/' ? path === '/' : path === k || path.startsWith(`${k}/`)))
    .sort((a, b) => b.length - a.length)[0]
  if (!key) return null
  const guide = GUIDES[key]
  const sectionKey = Object.keys(guide.sections ?? {}).find(s => path === s || path.startsWith(`${s}/`))
  return { key, guide, section: sectionKey ? guide.sections![sectionKey] : null }
}
