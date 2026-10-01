// day_rules (0024_neptune_day_plans.sql): the anchors and windows build-day places every
// day around, plus the per-course study weights that rank School work. Shared shape and
// validation for GET/POST /api/day-rules and PATCH/DELETE /api/day-rules/[id] (B2.14).

export const RULE_KINDS = ['anchor', 'window'] as const
export const RULE_DAYS = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'] as const
export const RULE_BLOCK_TYPES = ['Computer', 'Home', 'Errands', 'Calls', 'School', 'Career'] as const

export type RuleKind = (typeof RULE_KINDS)[number]
export type RuleDay = (typeof RULE_DAYS)[number]

export interface DayRuleBody {
  label: string
  kind: RuleKind
  days: RuleDay[]
  duration_min: number | null
  window_start: string | null   // "HH:MM"
  window_end: string | null
  block_type: string | null
  min_chunk_min: number | null
  splittable: boolean
  active: boolean
  course_code: string | null    // set only on study-weight rows
  weight: number | null
  is_intention: boolean         // B2.10: offered in the brief with candidate windows, never placed outright
}

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/

function isPositiveIntOrNull(v: unknown): boolean {
  return v === null || v === undefined || (typeof v === 'number' && Number.isInteger(v) && v > 0)
}

/**
 * Returns an error message, or null when the body is a usable rule.
 * `partial` allows a PATCH that only sends some fields; the caller merges first,
 * so validation always runs against the complete row either way.
 */
export function validateDayRule(body: Partial<DayRuleBody>): string | null {
  if (!body.label || typeof body.label !== 'string' || !body.label.trim()) return 'label is required'
  if (!body.kind || !RULE_KINDS.includes(body.kind)) return `kind must be one of ${RULE_KINDS.join(', ')}`
  if (!Array.isArray(body.days) || body.days.length === 0) return 'pick at least one day'
  if (!body.days.every(d => RULE_DAYS.includes(d))) return `days must be from ${RULE_DAYS.join(', ')}`
  for (const [field, value] of [['duration_min', body.duration_min], ['min_chunk_min', body.min_chunk_min]] as const) {
    if (!isPositiveIntOrNull(value)) return `${field} must be a whole number of minutes`
  }
  for (const [field, value] of [['window_start', body.window_start], ['window_end', body.window_end]] as const) {
    if (value !== null && value !== undefined && !TIME_RE.test(value)) return `${field} must be 24h "HH:MM"`
  }
  if (body.window_start && body.window_end && body.window_end <= body.window_start) {
    return 'window end must be after window start'
  }
  if (body.block_type && !RULE_BLOCK_TYPES.includes(body.block_type as (typeof RULE_BLOCK_TYPES)[number])) {
    return `block_type must be one of ${RULE_BLOCK_TYPES.join(', ')}, or empty`
  }
  if (body.weight !== null && body.weight !== undefined && (typeof body.weight !== 'number' || body.weight < 0)) {
    return 'weight must be a number of 0 or more'
  }

  const isStudyWeight = !!body.course_code
  if (isStudyWeight) {
    // A study-weight row ranks School work by course; it places no block of its own.
    if (body.weight === null || body.weight === undefined) return 'a course weight row needs a weight'
    if (body.duration_min) return 'a course weight row has no duration'
    return null
  }
  // An anchor is a pinned clock time (window_start doubles as that time).
  if (body.kind === 'anchor' && !body.window_start) return 'an anchor needs a time'
  if (body.kind === 'window' && !body.duration_min) return 'a window needs a duration in minutes'
  return null
}

/** Only the columns a client may write; everything else is server-owned. */
export function dayRulePayload(body: Partial<DayRuleBody>): Record<string, unknown> {
  const payload: Record<string, unknown> = {}
  const copy = ['label', 'kind', 'days', 'duration_min', 'window_start', 'window_end', 'block_type', 'min_chunk_min', 'splittable', 'active', 'course_code', 'weight', 'is_intention'] as const
  for (const key of copy) if (body[key] !== undefined) payload[key] = body[key]
  if (typeof payload.label === 'string') payload.label = payload.label.trim()
  if (typeof payload.course_code === 'string') payload.course_code = payload.course_code.trim() || null
  return payload
}
