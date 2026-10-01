'use client'

import { Panel } from './Panel'
import type { CostSummary } from './crm-types'

function fmtUsd(n: number): string {
  return `$${n.toFixed(2)}`
}

/**
 * Surface 6 — Cost meter. Compact retro-treated readout of today's agent
 * spend and rolling 30-day spend, computed server-side from agent_runs.cost_usd
 * (USER_TIMEZONE "today", not server UTC). Per-tool/per-model breakdown is out
 * of scope for v1.
 */
export function CostMeterCard({ cost }: { cost: CostSummary }) {
  return (
    <Panel label="Cost Meter">
      <div className="retro-scanlines" style={{ display: 'flex', gap: 14 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 10.5, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Today
          </div>
          <div className="retro-mono retro-glow" style={{ fontSize: 20, fontWeight: 600, marginTop: 2 }}>
            {fmtUsd(cost.today_usd)}
          </div>
          <div className="retro-mono" style={{ fontSize: 10.5, color: 'var(--t3)', marginTop: 1 }}>
            {cost.today_tokens.toLocaleString()} tok
          </div>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 10.5, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Rolling 30d
          </div>
          <div className="retro-mono retro-glow" style={{ fontSize: 20, fontWeight: 600, marginTop: 2 }}>
            {fmtUsd(cost.rolling_30d_usd)}
          </div>
          <div className="retro-mono" style={{ fontSize: 10.5, color: 'var(--t3)', marginTop: 1 }}>
            {cost.rolling_30d_tokens.toLocaleString()} tok
          </div>
        </div>
      </div>
    </Panel>
  )
}
