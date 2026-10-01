'use client'

import { useEffect, useState, useSyncExternalStore } from 'react'
import { useRouter } from 'next/navigation'
import { signOut } from '@/lib/demo/auth'
import { REPO_URL } from '@/lib/demo/config'
import { canPersist, resetDb } from '@/lib/demo/db'

/** Whether storage works is fixed for the life of the page, so there is nothing to subscribe to. */
const neverChanges = () => () => {}

/**
 * The strip above the dashboard that says this is a demo. Reset puts the sample data
 * back the way it started. Lock signs out, so the login screen can be seen again.
 */
export function DemoBanner() {
  const router = useRouter()
  const [confirming, setConfirming] = useState(false)
  // Assumed true on the server and during hydration, then checked in the browser.
  const persists = useSyncExternalStore(neverChanges, canPersist, () => true)

  useEffect(() => {
    if (!confirming) return
    const t = setTimeout(() => setConfirming(false), 4000)
    return () => clearTimeout(t)
  }, [confirming])

  function reset() {
    if (!confirming) { setConfirming(true); return }
    resetDb()
    // A full reload is the simplest way to make every mounted card read the fresh data.
    window.location.reload()
  }

  function lock() {
    signOut()
    router.replace('/login')
  }

  return (
    <div className="demo-banner" role="note">
      <span className="demo-pill">Demo</span>
      <span className="demo-banner-text">
        {persists
          ? 'Sample data only. Nothing here is real, and anything you change stays in this browser.'
          : 'Sample data only. Nothing here is real. This browser blocks storage, so your changes last until you reload.'}
      </span>
      <span style={{ flex: 1 }} />
      <button type="button" onClick={reset} className="demo-banner-btn" title="Put the sample data back the way it started">
        {confirming ? 'Click again to reset' : 'Reset sample data'}
      </button>
      <a href={REPO_URL} target="_blank" rel="noreferrer" className="demo-banner-btn">Source</a>
      <button type="button" onClick={lock} className="demo-banner-btn" title="Sign out and return to the login screen">
        Lock
      </button>
    </div>
  )
}
