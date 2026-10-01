import { Panel } from './Panel'

const STATS = [
  { value: '87',   label: 'Prod. Score' },
  { value: '+12%', label: 'vs Last Wk' },
  { value: '4.2h', label: 'Deep Work' },
]

export function InsightCard() {
  return (
    <Panel label="Daily Insight" badge="AI">
      {/* Quote */}
      <p
        className="text-[13.5px] leading-[1.7] italic pl-3 mb-3"
        style={{
          borderLeft: '2px solid var(--ag)',
          color: 'var(--t1)',
        }}
      >
        &ldquo;Well done is better than well said.&rdquo;
      </p>

      {/* Body */}
      <p className="text-[12px] leading-[1.65] mb-3" style={{ color: 'var(--t2)' }}>
        You cleared three high-priority tasks before noon, 40% more than last Thursday. The morning block is working. Protect it.
      </p>

      {/* Stats row */}
      <div className="flex gap-3">
        {STATS.map(s => (
          <div key={s.label} className="flex-1 text-center">
            <span
              className="block text-[20px] font-semibold"
              style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)', color: 'var(--ag)' }}
            >
              {s.value}
            </span>
            <span
              className="text-[10.5px] uppercase tracking-[0.07em]"
              style={{ color: 'var(--t3)' }}
            >
              {s.label}
            </span>
          </div>
        ))}
      </div>
    </Panel>
  )
}
