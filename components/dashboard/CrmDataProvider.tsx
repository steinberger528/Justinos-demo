'use client'

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import type { BusinessMetrics, CrmOverview, FlaggedMessage } from './crm-types'

const POLL_INTERVAL_MS = 15_000
const MESSAGES_POLL_INTERVAL_MS = 60_000

const DEFAULT_BUSINESS_METRICS: BusinessMetrics = {
  user_id: '',
  revenue_total: 0,
  clients_active: 0,
  ai_addon_clients: 0,
  prospects_in_pipeline: 0,
  outreach_drafted: 0,
  outreach_sent: 0,
  replies_received: 0,
  products_ready: 0,
  products_live: 0,
  content_ready: 0,
  content_published: 0,
  geo_reports_ready: 0,
  newsletter_subs: 0,
  phase: 'P0 Setup',
  updated_at: new Date().toISOString(),
}

const DEFAULT_OVERVIEW: CrmOverview = {
  clients: [],
  agents: [],
  jobs_by_state: { queued: [], running: [], blocked: [], done: [] },
  feed: [],
  inbox: [],
  metrics_snapshots: [],
  cost: { today_usd: 0, today_tokens: 0, rolling_30d_usd: 0, rolling_30d_tokens: 0 },
  business_metrics: DEFAULT_BUSINESS_METRICS,
}

interface MessagesData {
  active: FlaggedMessage[]
  recent_acknowledged: FlaggedMessage[]
}

interface CrmDataContextValue {
  /** Always a valid CrmOverview — defaulted to empty collections before the first successful load. */
  data: CrmOverview
  loading: boolean
  error: string | null
  /** True once GET /api/crm/overview has succeeded at least once (mirrors the old CrmCockpit's `!!overview` gate). */
  hasLoaded: boolean
  reload: () => void
  markDirty: (dirty: boolean) => void
  /** Shared GET /api/crm/messages poll — one source for the Executive sub-nav badge, FlaggedMessagesCard, and BusinessMetricsStrip's callout (Task 4 Step 2 of the plan). */
  messages: MessagesData | null
  messagesError: string | null
  activeMessageCount: number
  reloadMessages: () => void
}

const CrmDataContext = createContext<CrmDataContextValue | null>(null)

/** Throws if called outside CrmDataProvider — fail loud, not a silent `undefined`. */
export function useCrmData(): CrmDataContextValue {
  const ctx = useContext(CrmDataContext)
  if (!ctx) throw new Error('useCrmData() must be called within a CrmDataProvider')
  return ctx
}

/**
 * Lifted verbatim from the old CrmCockpit.tsx (fetch on mount, poll every
 * 15s, pause while the tab is hidden, dirtyRef guard against a poll response
 * clobbering an in-progress local edit). Mounted once in app/crm/layout.tsx,
 * so switching sub-tabs (leaf page swap under the shared layout) does not
 * remount this provider or refetch — the spec's "single fetch, shared across
 * sub-tabs" requirement, satisfied by React Router persistence alone.
 */
export function CrmDataProvider({ children }: { children: React.ReactNode }) {
  const [overview, setOverview] = useState<CrmOverview | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const dirtyRef = useRef(false)

  const load = useCallback(() => {
    fetch('/api/crm/overview', { credentials: 'include' })
      .then(async res => {
        if (!res.ok) {
          console.error('[crm] overview GET failed', res.status)
          setError(`Failed to load cockpit data (${res.status})`)
          return null
        }
        return (await res.json()) as CrmOverview
      })
      .then(data => {
        if (!data) return
        setError(null)
        if (dirtyRef.current) return
        setOverview(data)
        setLoading(false)
      })
      .catch(e => {
        console.error('[crm] overview load error', e)
        setError('Failed to load cockpit data')
      })
      .finally(() => setLoading(false))
  }, [])

  // Initial load
  useEffect(() => {
    load()
  }, [load])

  // Poll, paused while tab is hidden
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

  const markDirty = useCallback((dirty: boolean) => { dirtyRef.current = dirty }, [])

  // ── Shared flagged-messages poll (Task 4 Step 2) ────────────────────────────
  // Consolidates what used to be two independent /api/crm/messages pollers
  // (BusinessMetricsStrip + FlaggedMessagesCard) into one, so the Executive
  // sub-nav badge and both cards read the same fetch.
  const [messages, setMessages] = useState<MessagesData | null>(null)
  const [messagesError, setMessagesError] = useState<string | null>(null)

  const loadMessages = useCallback(() => {
    fetch('/api/crm/messages', { credentials: 'include' })
      .then(async res => {
        if (!res.ok) throw new Error(`GET /api/crm/messages failed (${res.status})`)
        return (await res.json()) as MessagesData
      })
      .then(d => {
        setMessages(d)
        setMessagesError(null)
      })
      .catch(e => {
        console.error('[crm] messages load error', e)
        setMessagesError('Failed to load flagged messages')
      })
  }, [])

  useEffect(() => {
    loadMessages()
  }, [loadMessages])

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null

    const start = () => {
      if (timer) return
      timer = setInterval(loadMessages, MESSAGES_POLL_INTERVAL_MS)
    }
    const stop = () => {
      if (timer) { clearInterval(timer); timer = null }
    }

    const onVisibility = () => {
      if (document.hidden) stop()
      else { loadMessages(); start() }
    }

    if (!document.hidden) start()
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      stop()
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [loadMessages])

  const value: CrmDataContextValue = {
    data: overview ?? DEFAULT_OVERVIEW,
    loading,
    error,
    hasLoaded: overview !== null,
    reload: load,
    markDirty,
    messages,
    messagesError,
    activeMessageCount: messages?.active.length ?? 0,
    reloadMessages: loadMessages,
  }

  return <CrmDataContext.Provider value={value}>{children}</CrmDataContext.Provider>
}
