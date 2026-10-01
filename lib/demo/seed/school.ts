// Sample courses and school items. Every name here is invented: the university,
// the course codes, the instructors, and the rooms do not refer to anything real.
// Due dates are offsets from "today" so the tab always has something overdue,
// something due this week, and exams on the horizon.

import type { CourseEntity, SchoolComponent, SchoolItemType, Topic } from '@/lib/school-types'
import type { FixedEventRow, TaskRow } from '../types'
import { addDays, isoAt } from '../dates'
import { DEMO_USER_ID } from '../ids'

export function semesterLabel(today: string): string {
  const d = new Date(`${today}T00:00:00`)
  const m = d.getMonth() + 1
  const season = m >= 8 ? 'Fall' : m <= 5 ? 'Spring' : 'Summer'
  return `${season} ${d.getFullYear()}`
}

/** Fills every column a task row has, so callers only state what is interesting. */
export function makeTask(today: string, partial: Partial<TaskRow> & { id: string; title: string }): TaskRow {
  const created = partial.created_at ?? isoAt(addDays(today, -14), '09:00')
  return {
    description: null,
    urgency: 'someday',
    key: false,
    blocked: false,
    blocked_since: null,
    priority_score: 25,
    tags: [],
    block_type: null,
    due_date: null,
    planned_date: null,
    date_is_placeholder: false,
    time_estimate_min: null,
    in_progress: false,
    is_working: false,
    completed_at: null,
    created_at: created,
    updated_at: created,
    entity_id: null,
    parent_task_id: null,
    item_type: null,
    component: null,
    topics: [],
    study_plan: null,
    ...partial,
  }
}

const topics = (labels: string[], doneCount = 0): Topic[] =>
  labels.map((label, i) => ({ label, done: i < doneCount }))

export function seedCourses(today: string): CourseEntity[] {
  const semester = semesterLabel(today)
  const created = isoAt(addDays(today, -40), '10:00')
  const course = (id: string, name: string, metadata: CourseEntity['metadata']): CourseEntity => ({
    id, user_id: DEMO_USER_ID, name, kind: 'course', metadata, created_at: created,
  })

  return [
    course('ops-410', 'OPS 410', {
      code: 'OPS 410',
      title: 'Supply Chain Analytics',
      professor: ['Dr. Mara Ellison'],
      schedule: [{ day: ['Mon', 'Wed'], start: '09:30', end: '10:45', room: 'Hale Hall 214' }],
      office_hours: 'Wed 11:00 to 12:30 in Hale Hall 231, or by appointment',
      required_text: 'Course reader, posted weekly on the LMS',
      grading_breakdown: [
        { component: 'Homework', weight: 20, note: '6 sets, lowest dropped' },
        { component: 'Quizzes', weight: 15 },
        { component: 'Midterm', weight: 25 },
        { component: 'Case project', weight: 15, note: 'group' },
        { component: 'Final exam', weight: 25 },
      ],
      policies: [
        'Late homework loses 10% per day, up to three days.',
        'One quiz can be made up with notice before it opens.',
      ],
      policy_severity: 'standard',
      topics: [
        'Wk 1-2 · Demand forecasting',
        'Wk 3-4 · Inventory models',
        'Wk 5-6 · Network design',
        'Wk 7 · Midterm',
        'Wk 8-10 · Transportation and routing',
        'Wk 11-12 · Simulating a supply chain',
        'Wk 13-14 · Risk and resilience',
      ],
      semester,
    }),
    course('stat-355', 'STAT 355', {
      code: 'STAT 355',
      title: 'Applied Regression',
      professor: ['Prof. Daniel Okoro'],
      schedule: [{ day: ['Tue', 'Thu'], start: '11:00', end: '12:15', room: 'Whitlock 108' }],
      office_hours: 'Tue 13:00 to 14:00 in Whitlock 320',
      required_text: 'Lecture notes and R labs, posted on the LMS',
      grading_breakdown: [
        { component: 'Problem sets', weight: 25 },
        { component: 'Labs', weight: 15 },
        { component: 'Quizzes', weight: 10 },
        { component: 'Exam 1', weight: 15 },
        { component: 'Exam 2', weight: 15 },
        { component: 'Final exam', weight: 20 },
      ],
      policies: [
        'Problem sets are due at the start of class on the due date.',
        'Labs may be done in pairs. Write-ups are individual.',
      ],
      policy_severity: 'standard',
      topics: [
        'Simple linear regression',
        'Inference for slopes',
        'Multiple regression',
        'Interaction terms',
        'Multicollinearity',
        'Residual diagnostics',
        'Model selection',
        'Logistic regression',
      ],
      semester,
    }),
    course('cs-331', 'CS 331', {
      code: 'CS 331',
      title: 'Databases and Data Engineering',
      professor: ['Dr. Priya Raman'],
      schedule: [{ day: ['Mon', 'Wed'], start: '14:00', end: '15:15', room: 'Engineering Annex 2' }],
      office_hours: 'Mon 15:30 to 16:30, online',
      required_text: 'No textbook. Readings are linked from each lab.',
      grading_breakdown: [
        { component: 'Labs', weight: 30 },
        { component: 'Homework', weight: 15 },
        { component: 'Quizzes', weight: 10 },
        { component: 'Project', weight: 20, note: '3 milestones' },
        { component: 'Midterm', weight: 25 },
      ],
      policies: [
        'No late submissions. The autograder closes at 11:59 PM on the due date.',
        'Labs must pass the posted tests to receive credit.',
        'Collaboration is limited to discussing approach. Code is individual.',
      ],
      policy_severity: 'strict',
      topics: [
        'Relational model and SQL',
        'Joins and aggregation',
        'Normalization',
        'Indexing and query plans',
        'Transactions',
        'Data pipelines',
        'Warehousing basics',
      ],
      semester,
    }),
    course('mgt-480', 'MGT 480', {
      code: 'MGT 480',
      title: 'Capstone Studio',
      professor: ['Prof. Helena Voss', 'Sponsor liaison: R. Tamsin'],
      schedule: [{ day: ['Thu'], start: '14:00', end: '16:30', room: 'Studio B' }],
      office_hours: 'By appointment, booked through the studio calendar',
      required_text: 'None',
      grading_breakdown: [
        { component: 'Design reviews', weight: 40, note: 'group' },
        { component: 'Progress memos', weight: 15, note: 'individual' },
        { component: 'Peer evaluations', weight: 10 },
        { component: 'Final presentation and report', weight: 35, note: 'group' },
      ],
      policies: [
        'Studio attendance is required. Two absences lower the final grade by a letter.',
        'Sponsor deliverables go through the liaison, never directly.',
      ],
      policy_severity: 'standard',
      topics: [
        'Problem framing with the sponsor',
        'Current-state mapping',
        'Concept generation',
        'Design review 1',
        'Prototype and test',
        'Design review 2',
        'Final presentation',
      ],
      semester,
    }),
  ]
}

interface ItemSpec {
  id: string
  course: string
  code: string
  title: string
  type: SchoolItemType
  due: number | null
  component?: SchoolComponent
  /** Days ago it was completed (0 = earlier today). */
  doneDaysAgo?: number
  placeholder?: boolean
  inProgress?: boolean
  working?: boolean
  plannedToday?: boolean
  description?: string
  topics?: Topic[]
  parent?: string
}

export function seedSchoolTasks(today: string): TaskRow[] {
  const specs: ItemSpec[] = [
    // ── OPS 410 ──────────────────────────────────────────────────────────────
    { id: 'sch-ops-hw1', course: 'ops-410', code: 'OPS 410', title: 'Homework 1: Forecasting basics', type: 'assignment', due: -23, doneDaysAgo: 24 },
    { id: 'sch-ops-q1', course: 'ops-410', code: 'OPS 410', title: 'Quiz 1: Forecasting', type: 'quiz', due: -16, doneDaysAgo: 16, topics: topics(['Moving averages', 'Exponential smoothing', 'Forecast error'], 3) },
    { id: 'sch-ops-hw2', course: 'ops-410', code: 'OPS 410', title: 'Homework 2: Exponential smoothing', type: 'assignment', due: -9, doneDaysAgo: 10 },
    {
      id: 'sch-ops-hw3', course: 'ops-410', code: 'OPS 410', title: 'Homework 3: Inventory models', type: 'assignment', due: -1, inProgress: true,
      description: 'Problems 3.1 to 3.8 from the course reader. Show the EOQ derivation for 3.4.\n\n--- Canvas ---\nCanvas: Homework 3\nSubmit one PDF. Scans are fine if they are legible.',
    },
    { id: 'sch-ops-q2', course: 'ops-410', code: 'OPS 410', title: 'Quiz 2: Inventory models', type: 'quiz', due: 2, topics: topics(['Economic order quantity', 'Reorder point', 'Safety stock', 'Newsvendor model'], 2) },
    { id: 'sch-ops-hw4', course: 'ops-410', code: 'OPS 410', title: 'Homework 4: Network design', type: 'assignment', due: 6 },
    { id: 'sch-ops-mid', course: 'ops-410', code: 'OPS 410', title: 'Midterm', type: 'exam', due: 12, topics: topics(['Forecasting methods', 'Forecast error', 'EOQ and reorder point', 'Safety stock', 'Facility location', 'Network flow formulation'], 2) },
    { id: 'sch-ops-proj', course: 'ops-410', code: 'OPS 410', title: 'Case project: Distribution network redesign', type: 'project', due: 24, component: 'group' },
    { id: 'sch-ops-proj-m1', course: 'ops-410', code: 'OPS 410', title: 'Pick the case company', type: 'milestone', due: -9, doneDaysAgo: 9, parent: 'sch-ops-proj' },
    { id: 'sch-ops-proj-m2', course: 'ops-410', code: 'OPS 410', title: 'Request shipment data', type: 'milestone', due: -3, doneDaysAgo: 4, parent: 'sch-ops-proj' },
    { id: 'sch-ops-proj-m3', course: 'ops-410', code: 'OPS 410', title: 'Baseline cost model', type: 'milestone', due: 9, inProgress: true, parent: 'sch-ops-proj' },
    { id: 'sch-ops-proj-m4', course: 'ops-410', code: 'OPS 410', title: 'Draft report', type: 'milestone', due: 19, parent: 'sch-ops-proj' },
    { id: 'sch-ops-final', course: 'ops-410', code: 'OPS 410', title: 'Final exam', type: 'exam', due: 58, placeholder: true, topics: topics(['Everything since the midterm', 'Routing', 'Simulation', 'Risk pooling']) },

    // ── STAT 355 ─────────────────────────────────────────────────────────────
    { id: 'sch-stat-ps2', course: 'stat-355', code: 'STAT 355', title: 'Problem set 2: Inference for slopes', type: 'assignment', due: -18, doneDaysAgo: 18 },
    { id: 'sch-stat-ps3', course: 'stat-355', code: 'STAT 355', title: 'Problem set 3: Interaction terms', type: 'assignment', due: -11, doneDaysAgo: 12 },
    { id: 'sch-stat-read6', course: 'stat-355', code: 'STAT 355', title: 'Reading: Ch. 6, interaction terms', type: 'reading', due: 0, doneDaysAgo: 0 },
    {
      id: 'sch-stat-ps4', course: 'stat-355', code: 'STAT 355', title: 'Problem set 4: Multiple regression', type: 'assignment', due: 0,
      description: 'Four problems. Problem 3 needs the housing data set from Lab 4.\n\n--- Canvas ---\nCanvas: Problem Set 4\nDue at the start of class.',
    },
    { id: 'sch-stat-read7', course: 'stat-355', code: 'STAT 355', title: 'Reading: Ch. 7, multicollinearity', type: 'reading', due: 1 },
    { id: 'sch-stat-lab5', course: 'stat-355', code: 'STAT 355', title: 'Lab 5: Residual diagnostics', type: 'lab', due: 3 },
    { id: 'sch-stat-q3', course: 'stat-355', code: 'STAT 355', title: 'Quiz 3: Model selection', type: 'quiz', due: 8, topics: topics(['Adjusted R-squared', 'AIC and BIC', 'Stepwise selection', 'Cross-validation']) },
    { id: 'sch-stat-ex2', course: 'stat-355', code: 'STAT 355', title: 'Exam 2', type: 'exam', due: 17, topics: topics(['Multiple regression', 'Interaction terms', 'Multicollinearity', 'Residual diagnostics', 'Model selection'], 1) },
    { id: 'sch-stat-final', course: 'stat-355', code: 'STAT 355', title: 'Final exam', type: 'exam', due: null, topics: topics(['Cumulative', 'Logistic regression']) },

    // ── CS 331 ───────────────────────────────────────────────────────────────
    { id: 'sch-cs-hw3', course: 'cs-331', code: 'CS 331', title: 'Homework 3: SQL joins', type: 'assignment', due: -1, doneDaysAgo: 1 },
    {
      id: 'sch-cs-lab4', course: 'cs-331', code: 'CS 331', title: 'Lab 4: Indexing and query plans', type: 'lab', due: 1, working: true, plannedToday: true,
      description: 'Add indexes until every query in the test file beats its target time. Explain two of the plans in the write-up.',
    },
    { id: 'sch-cs-q2', course: 'cs-331', code: 'CS 331', title: 'Quiz 2: Normalization', type: 'quiz', due: 5, topics: topics(['Functional dependencies', 'Second and third normal form', 'BCNF', 'When to denormalize'], 1) },
    { id: 'sch-cs-p2', course: 'cs-331', code: 'CS 331', title: 'Project milestone 2: Schema and seed data', type: 'project', due: 9, component: 'individual' },
    { id: 'sch-cs-hw4', course: 'cs-331', code: 'CS 331', title: 'Homework 4: Transactions', type: 'assignment', due: 13 },
    { id: 'sch-cs-mid', course: 'cs-331', code: 'CS 331', title: 'Midterm', type: 'exam', due: 20, topics: topics(['SQL joins and aggregation', 'Normalization', 'Indexes', 'Query plans', 'Transactions and isolation']) },

    // ── MGT 480 ──────────────────────────────────────────────────────────────
    { id: 'sch-mgt-charter', course: 'mgt-480', code: 'MGT 480', title: 'Team charter', type: 'assignment', due: -20, doneDaysAgo: 21, component: 'group' },
    { id: 'sch-mgt-deck', course: 'mgt-480', code: 'MGT 480', title: 'Sponsor check-in deck', type: 'assignment', due: 2, component: 'group', inProgress: true },
    { id: 'sch-mgt-memo3', course: 'mgt-480', code: 'MGT 480', title: 'Progress memo 3', type: 'assignment', due: 4, component: 'individual' },
    { id: 'sch-mgt-dr1', course: 'mgt-480', code: 'MGT 480', title: 'Design review 1', type: 'project', due: 15, component: 'group' },
    { id: 'sch-mgt-dr1-m1', course: 'mgt-480', code: 'MGT 480', title: 'Problem statement signed off', type: 'milestone', due: -12, doneDaysAgo: 13, parent: 'sch-mgt-dr1' },
    { id: 'sch-mgt-dr1-m2', course: 'mgt-480', code: 'MGT 480', title: 'Current-state process map', type: 'milestone', due: -2, doneDaysAgo: 2, parent: 'sch-mgt-dr1' },
    { id: 'sch-mgt-dr1-m3', course: 'mgt-480', code: 'MGT 480', title: 'Three concept sketches', type: 'milestone', due: 7, parent: 'sch-mgt-dr1' },
    { id: 'sch-mgt-dr1-m4', course: 'mgt-480', code: 'MGT 480', title: 'Review slides', type: 'milestone', due: 13, parent: 'sch-mgt-dr1' },
    { id: 'sch-mgt-peer1', course: 'mgt-480', code: 'MGT 480', title: 'Peer evaluation 1', type: 'assignment', due: 16, component: 'individual' },
    { id: 'sch-mgt-final', course: 'mgt-480', code: 'MGT 480', title: 'Final presentation and report', type: 'project', due: 62, component: 'group', placeholder: true },
  ]

  return specs.map((s, i) => {
    const completedAt =
      s.doneDaysAgo === undefined ? null
      : s.doneDaysAgo === 0 ? isoAt(today, '08:10')
      : isoAt(addDays(today, -s.doneDaysAgo), '20:40')
    return makeTask(today, {
      id: s.id,
      title: s.title,
      description: s.description ?? null,
      urgency: 'month',
      tags: ['school', s.code],
      block_type: 'School',
      due_date: s.due === null ? null : addDays(today, s.due),
      planned_date: s.plannedToday ? today : null,
      date_is_placeholder: !!s.placeholder,
      in_progress: !!s.inProgress,
      is_working: !!s.working,
      completed_at: completedAt,
      created_at: isoAt(addDays(today, -40), `09:${String(i % 60).padStart(2, '0')}`),
      entity_id: s.course,
      parent_task_id: s.parent ?? null,
      item_type: s.type,
      component: s.component ?? null,
      topics: s.topics ?? [],
    })
  })
}

const DAY_CODE: Record<string, string> = { Mon: 'MO', Tue: 'TU', Wed: 'WE', Thu: 'TH', Fri: 'FR', Sat: 'SA', Sun: 'SU' }

/** Class meetings as fixed events, the way the vault pushes them in production. */
export function seedClassFixedEvents(courses: CourseEntity[]): FixedEventRow[] {
  const rows: FixedEventRow[] = []
  for (const c of courses) {
    c.metadata.schedule.forEach((block, i) => {
      rows.push({
        id: `fx-${c.id}-${i}`,
        label: `${c.metadata.code} ${c.id === 'mgt-480' ? 'studio' : 'lecture'}`,
        kind: 'class',
        days: block.day.map(d => DAY_CODE[d]),
        start: `${block.start}:00`,
        end: `${block.end}:00`,
        location: block.room,
        buffer_before: 15,
        buffer_after: 10,
        hard: true,
        effective_from: null,
        effective_to: null,
        source: 'vault',
        vault_path: `02-Areas/School/${c.metadata.code.replace(' ', '-')}/course.md`,
        gcal_event_id: null,
      })
    })
  }
  return rows
}
