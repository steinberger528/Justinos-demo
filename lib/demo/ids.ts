// Stable ids for seeded rows that appear in URLs or are referenced across domains.
// The course ids double as the static params for /school/[courseId].

export const DEMO_USER_ID = 'demo-user'

export const COURSE_IDS = ['ops-410', 'stat-355', 'cs-331', 'mgt-480'] as const
export type CourseId = (typeof COURSE_IDS)[number]

export const AGENTIC_OS_GOAL_ID = 'goal-agentic-os'

let counter = 0

/** A fresh id for rows created while the demo is running. */
export function newId(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID().slice(0, 13)}`
  }
  counter += 1
  return `${prefix}-${Date.now().toString(36)}-${counter}`
}
