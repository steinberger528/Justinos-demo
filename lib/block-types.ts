// Task block types (B2.12 + migration 0027's Career). Dependency-free so client
// components and API routes can share it; lib/build-day.ts keeps its own
// TASK_BLOCK_TYPES for the planner prompt — keep the two lists in sync.
export const BLOCK_TYPES = ['Computer', 'Home', 'Errands', 'Calls', 'School', 'Career'] as const

export type BlockType = (typeof BLOCK_TYPES)[number]

export function isBlockType(value: unknown): value is BlockType {
  return typeof value === 'string' && (BLOCK_TYPES as readonly string[]).includes(value)
}
