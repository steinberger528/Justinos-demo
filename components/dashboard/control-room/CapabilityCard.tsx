'use client'

import type { Capability } from '../control-room-types'
import { AgentChip } from './AgentChip'
import { AutonomyChip } from './AutonomyChip'
import { StatusChip } from './StatusChip'
import { WorkflowStrip } from './WorkflowStrip'

interface CapabilityCardProps {
  capability: Capability
  /** Real last-run/status suffix sourced from `task_health` telemetry, keyed by name — never fabricated (R10/R12: no feed yet stays a dash, not an invented "ran HH:MM"). */
  lastRunLabel?: string | null
  /** True when `task_health`/`failures` telemetry reports this capability's most recent run failed (component sheet's "Failed" card state). */
  failed?: boolean
  errorMessage?: string | null
}

/** The Automations tier groups' capability card, per the component sheet: name, agent chip, autonomy/status chip, trigger + last-run line, workflow-map strip. Planned and Failed are visual states of the same card, not separate components. */
export function CapabilityCard({ capability, lastRunLabel, failed, errorMessage }: CapabilityCardProps) {
  const planned = capability.status === 'planned'

  const borderStyle: React.CSSProperties = failed
    ? { borderColor: 'oklch(0.60 0.22 25 / 0.35)', background: 'oklch(0.60 0.22 25 / 0.05)' }
    : planned
    ? { borderStyle: 'dashed', opacity: 0.6 }
    : {}

  const triggerLine = planned
    ? `${capability.trigger ?? 'no trigger yet'} · never run`
    : errorMessage
    ? errorMessage
    : lastRunLabel
    ? `${capability.trigger ?? '—'} · ${lastRunLabel}`
    : capability.trigger ?? '—'

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        padding: '10px 11px',
        borderRadius: 10,
        border: '1px solid var(--ui-border)',
        background: 'oklch(1 0 0 / 0.015)',
        ...borderStyle,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ fontSize: 12.5, fontWeight: 500 }}>{capability.name}</span>
        <span style={{ display: 'inline-flex', gap: 4 }}>
          {capability.agent && capability.agent !== 'none' && <AgentChip agent={capability.agent} />}
          {failed ? (
            <StatusChip status="failed" />
          ) : planned ? (
            <StatusChip status="planned" />
          ) : (
            <AutonomyChip autonomy={capability.autonomy} />
          )}
        </span>
      </div>
      <span
        className="mono"
        style={{
          fontFamily: 'var(--font-jetbrains-mono, monospace)',
          fontSize: 10.5,
          color: failed ? 'var(--danger)' : 'var(--t3)',
        }}
      >
        {triggerLine}
      </span>
      <WorkflowStrip steps={capability.steps} />
    </div>
  )
}
