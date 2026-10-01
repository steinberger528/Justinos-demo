'use client'

import { useState } from 'react'
import { usePathname } from 'next/navigation'
import { suggestQuickMove } from '@/lib/demo/capture'
import { guideFor } from '@/lib/demo/guides'

/** Fills in "{quickMove}", and drops the suggestion if no clean move exists today. */
function resolveTryIt(items: string[]): string[] {
  if (!items.some(item => item.includes('{quickMove}'))) return items
  const move = typeof window === 'undefined' ? null : suggestQuickMove()
  return items
    .filter(item => move !== null || !item.includes('{quickMove}'))
    .map(item => item.replace('{quickMove}', move ?? ''))
}

/**
 * The note at the top of every tab: what the tab is for, the purpose of the current
 * sub-tab, and a few things to try. It can be hidden when it is in the way.
 */
export function TabGuide() {
  const pathname = usePathname()
  const [hidden, setHidden] = useState(false)
  const match = guideFor(pathname)
  if (!match) return null
  const { guide, section } = match
  const tryIt = resolveTryIt(guide.tryIt ?? [])

  if (hidden) {
    return (
      <button type="button" className="tab-guide-collapsed" onClick={() => setHidden(false)}>
        <span className="tab-guide-kicker">How this tab is used</span>
        <span>Show</span>
      </button>
    )
  }

  return (
    <section className="tab-guide" aria-label={`How the ${guide.title} tab is used`}>
      <div className="tab-guide-head">
        <span className="tab-guide-kicker">How this tab is used</span>
        <span className="tab-guide-title">{guide.title}</span>
        <button type="button" className="tab-guide-hide" onClick={() => setHidden(true)}>Hide</button>
      </div>
      <p className="tab-guide-body">{guide.body}</p>
      {section && (
        <p className="tab-guide-body">
          <span className="tab-guide-section">{section.label}.</span> {section.body}
        </p>
      )}
      {tryIt.length > 0 && (
        <div className="tab-guide-try">
          <span className="tab-guide-try-label">Try</span>
          {tryIt.map(item => <span key={item} className="tab-guide-chip">{item}</span>)}
        </div>
      )}
    </section>
  )
}
