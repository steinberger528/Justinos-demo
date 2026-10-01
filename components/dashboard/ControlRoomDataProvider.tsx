'use client'

import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import type { ControlRoomOverview } from './control-room-types'

const POLL_INTERVAL_MS = 30_000

const DEFAULT_OVERVIEW: ControlRoomOverview = {
  capabilities: [],
  goal: null,
  telemetry: {
    live_sessions: null,
    recent_sessions: null,
    git_status: null,
    task_health: null,
    failures: null,
    waiting_on_you: null,
    token_usage: null,
  },
}

interface ControlRoomDataContextValue {
  /** Always a valid ControlRoomOverview — defaulted to empty collections before first load. */
  data: ControlRoomOverview
  loading: boolean
  error: string | null
  hasLoaded: boolean
  reload: () => void
  /** R4 — one search input in the summary strip, filters capability/agent cards client-side. */
  search: string
  setSearch: (value: string) => void
}

const ControlRoomDataContext = createContext<ControlRoomDataContextValue | null>(null)

export function useControlRoomData(): ControlRoomDataContextValue {
  const ctx = useContext(ControlRoomDataContext)
  if (!ctx) throw new Error('useControlRoomData() must be called within a ControlRoomDataProvider')
  return ctx
}

/**
 * Mounted once in app/control-room/layout.tsx (R1) so the summary strip, sub-nav, and
 * right rail persist across the three section swaps without refetching — same
 * mechanism as CrmDataProvider: Next.js layouts survive sibling-route navigation.
 * Fetch on mount, poll while the tab is visible (paused on hidden), no dirtyRef needed
 * — this page has no inline-editable fields, only a client-side search filter.
 */
export function ControlRoomDataProvider({ children }: { children: React.ReactNode }) {
  const [overview, setOverview] = useState<ControlRoomOverview | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  const load = useCallback(() => {
    fetch('/api/control-room/overview', { credentials: 'include' })
      .then(async res => {
        if (!res.ok) {
          console.error('[control-room] overview GET failed', res.status)
          setError(`Failed to load Control Room data (${res.status})`)
          return null
        }
        return (await res.json()) as ControlRoomOverview
      })
      .then(data => {
        if (!data) return
        setError(null)
        setOverview(data)
      })
      .catch(e => {
        console.error('[control-room] overview load error', e)
        setError('Failed to load Control Room data')
      })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null

    const start = () => {
      if (timer) return
      timer = setInterval(load, POLL_INTERVAL_MS)
    }
    const stop = () => {
      if (timer) { clearInterval(timer); timer = null }
    }

    const onVisibility = () => {
      if (document.hidden) stop()
      else { load(); start() }
    }

    if (!document.hidden) start()
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      stop()
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [load])

  const value: ControlRoomDataContextValue = {
    data: overview ?? DEFAULT_OVERVIEW,
    loading,
    error,
    hasLoaded: overview !== null,
    reload: load,
    search,
    setSearch,
  }

  return <ControlRoomDataContext.Provider value={value}>{children}</ControlRoomDataContext.Provider>
}
