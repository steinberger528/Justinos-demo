'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { localDateKey } from '@/lib/date'
import { useResizable } from '@/lib/use-resizable'
import { useCrmData } from './CrmDataProvider'
import { ResizeHandles } from './ResizeHandles'
import type { FlaggedMessage } from './crm-types'

const SEARCH_DEBOUNCE_MS = 280

interface ArchiveResponse {
  messages: FlaggedMessage[]
  next_cursor: string | null
}

async function fetchArchivePage(q: string, cursor: string | null): Promise<ArchiveResponse> {
  const params = new URLSearchParams()
  if (q) params.set('q', q)
  if (cursor) params.set('cursor', cursor)
  const qs = params.toString()
  const res = await fetch(`/api/crm/messages/archive${qs ? `?${qs}` : ''}`, { credentials: 'include' })
  if (!res.ok) throw new Error(`GET /api/crm/messages/archive failed (${res.status})`)
  return (await res.json()) as ArchiveResponse
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

/** Groups an already reverse-chronologically-sorted flat list into contiguous date buckets. */
function groupByLocalDate(items: FlaggedMessage[]): { label: string; messages: FlaggedMessage[] }[] {
  const todayKey = localDateKey()
  const yesterdayKey = localDateKey(new Date(Date.now() - 24 * 60 * 60 * 1000))

  const labelFor = (iso: string): string => {
    const d = new Date(iso)
    const key = localDateKey(d)
    if (key === todayKey) return 'Today'
    if (key === yesterdayKey) return 'Yesterday'
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
  }

  const groups: { label: string; messages: FlaggedMessage[] }[] = []
  for (const msg of items) {
    const label = labelFor(msg.occurred_at)
    const last = groups[groups.length - 1]
    if (last && last.label === label) {
      last.messages.push(msg)
    } else {
      groups.push({ label, messages: [msg] })
    }
  }
  return groups
}

interface FlaggedMessagesModalProps {
  open: boolean
  onClose: () => void
  /** When set, the modal scrolls to and highlights this message on open. When null, opens at the top. */
  initialMessageId: string | null
}

/**
 * Combined expand + archive + search modal for Flagged Messages
 * (specs/flagged-messages-expansion.md). Manages its own independent
 * fetch/pagination/search state, entirely separate from CrmDataProvider's
 * 60s background poll — that poll must never reset this modal's list,
 * scroll position, or active search while it's open, so this component never
 * reads `messages` from useCrmData() for its own list; it only calls
 * `reloadMessages()` as a side effect after a dismiss, to reconcile the
 * compact card + Executive sub-nav badge.
 */
export function FlaggedMessagesModal({ open, onClose, initialMessageId }: FlaggedMessagesModalProps) {
  const { reloadMessages } = useCrmData()

  const { size, startResize } = useResizable(
    'dashboard.modalSize.flaggedMessages',
    { width: 680, height: 620 },
    { width: 420, height: 320 },
  )

  const [items, setItems] = useState<FlaggedMessage[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [initialLoading, setInitialLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [archiveError, setArchiveError] = useState<string | null>(null)

  const [searchInput, setSearchInput] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [searchPending, setSearchPending] = useState(false)

  const [dismissingIds, setDismissingIds] = useState<Set<string>>(new Set())
  const [highlightId, setHighlightId] = useState<string | null>(null)

  // "Latest request wins" stale-response guard — shared across the initial
  // fetch, search-triggered refetches, and load-more, so a slower earlier
  // response (from a since-superseded search or an old page request) can
  // never clobber a newer one's results.
  const requestIdRef = useRef(0)
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const itemRefs = useRef<Map<string, HTMLDivElement>>(new Map())

  const containerRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const previouslyFocusedRef = useRef<HTMLElement | null>(null)

  const runSearch = useCallback((query: string) => {
    const requestId = ++requestIdRef.current
    setInitialLoading(true)
    setArchiveError(null)
    fetchArchivePage(query, null)
      .then(res => {
        if (requestIdRef.current !== requestId) return // superseded by a newer query/open
        setItems(res.messages)
        setCursor(res.next_cursor)
        setHasMore(res.next_cursor !== null)
      })
      .catch(e => {
        if (requestIdRef.current !== requestId) return
        console.error('[messages] archive load error', e)
        setArchiveError('Failed to load messages')
      })
      .finally(() => {
        if (requestIdRef.current !== requestId) return
        setInitialLoading(false)
      })
  }, [])

  const loadMore = useCallback((query: string, afterCursor: string | null) => {
    if (loadingMore || initialLoading || !afterCursor) return
    const requestId = ++requestIdRef.current
    setLoadingMore(true)
    fetchArchivePage(query, afterCursor)
      .then(res => {
        if (requestIdRef.current !== requestId) return
        setItems(prev => [...prev, ...res.messages])
        setCursor(res.next_cursor)
        setHasMore(res.next_cursor !== null)
      })
      .catch(e => {
        if (requestIdRef.current !== requestId) return
        console.error('[messages] archive load-more error', e)
        setArchiveError('Failed to load more messages')
      })
      .finally(() => {
        if (requestIdRef.current !== requestId) return
        setLoadingMore(false)
      })
  }, [loadingMore, initialLoading])

  // Open/close: reset to a fresh, unfiltered first page every time the modal
  // opens; invalidate any in-flight request when it closes so a late response
  // can't land after teardown. The state-setting is deferred to a microtask
  // rather than called directly in the effect body — react-hooks/set-state-
  // in-effect (flags synchronous setState calls reachable directly from an
  // effect, since those can trigger cascading renders straight out of the
  // commit phase) does not consider work scheduled via queueMicrotask to be
  // "direct", and deferring by one microtask (well before the next paint) has
  // no perceptible effect on when the reset/fetch actually happens.
  useEffect(() => {
    queueMicrotask(() => {
      if (open) {
        setSearchInput('')
        setDebouncedSearch('')
        setSearchPending(false)
        setHighlightId(initialMessageId)
        runSearch('')
      } else {
        if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current)
        requestIdRef.current++
        setItems([])
        setCursor(null)
        setHasMore(false)
        setArchiveError(null)
        setHighlightId(null)
      }
    })
  }, [open, initialMessageId, runSearch])

  const handleSearchChange = (v: string) => {
    setSearchInput(v)
    setSearchPending(true)
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current)
    debounceTimerRef.current = setTimeout(() => {
      const trimmed = v.trim()
      setDebouncedSearch(trimmed)
      setSearchPending(false)
      // A new search invalidates any pending highlight target from a row-
      // click open: stop the auto-paginate hunt below from continuing to
      // page through results the current filter has excluded.
      setHighlightId(null)
      runSearch(trimmed)
    }, SEARCH_DEBOUNCE_MS)
  }

  useEffect(() => () => {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current)
  }, [])

  // If a specific message was requested (row click, not "View All") and it
  // isn't in the loaded pages yet, keep paging until it's found or the
  // archive is exhausted, then scroll to and highlight it. highlightId is
  // cleared as soon as the target is found (so a later unrelated `items`
  // change — e.g. dismissing a *different* message — doesn't re-trigger
  // scrollIntoView and yank the user's scroll position back), and separately
  // by handleSearchChange whenever the search term changes while a highlight
  // is still pending (so the hunt doesn't keep paginating looking for a
  // message the current filter has already excluded). Both state-setting
  // paths (the clear-on-found and the loadMore kick) are deferred to a
  // microtask for the same react-hooks/set-state-in-effect reason as the
  // open/close effect above — el.scrollIntoView itself is an imperative DOM
  // effect, not state, so it stays direct.
  useEffect(() => {
    if (!open || !highlightId) return
    const el = itemRefs.current.get(highlightId)
    if (el) {
      el.scrollIntoView({ block: 'center' })
      queueMicrotask(() => setHighlightId(null))
      return
    }
    if (!initialLoading && !loadingMore && hasMore) {
      queueMicrotask(() => loadMore(debouncedSearch, cursor))
    }
  }, [open, highlightId, items, hasMore, initialLoading, loadingMore, debouncedSearch, cursor, loadMore])

  // Focus management: move focus in on open, trap Tab within the dialog,
  // Escape closes, and focus returns to the triggering element on close.
  useEffect(() => {
    if (!open) return
    previouslyFocusedRef.current = document.activeElement as HTMLElement | null
    const t = setTimeout(() => searchInputRef.current?.focus(), 0)

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
        return
      }
      if (e.key === 'Tab') {
        const container = containerRef.current
        if (!container) return
        const focusables = Array.from(
          container.querySelectorAll<HTMLElement>(
            'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'
          )
        ).filter(el => el.offsetParent !== null)
        if (focusables.length === 0) return
        const first = focusables[0]
        const last = focusables[focusables.length - 1]
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }
    window.addEventListener('keydown', onKeyDown, true)

    return () => {
      clearTimeout(t)
      window.removeEventListener('keydown', onKeyDown, true)
      previouslyFocusedRef.current?.focus?.()
    }
  }, [open, onClose])

  const dismiss = useCallback(async (msg: FlaggedMessage) => {
    setDismissingIds(prev => new Set(prev).add(msg.id))
    const snapshot = items
    setItems(prev => prev.map(m => (m.id === msg.id ? { ...m, acknowledged: true, acknowledged_at: new Date().toISOString() } : m)))
    try {
      const res = await fetch(`/api/crm/messages/${msg.id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      if (!res.ok) {
        console.error('[messages] modal dismiss failed', await res.text())
        setItems(snapshot) // revert — server didn't confirm the change
      }
    } catch (e) {
      console.error('[messages] modal dismiss error', e)
      setItems(snapshot)
    } finally {
      setDismissingIds(prev => { const s = new Set(prev); s.delete(msg.id); return s })
      // Reconcile the compact card + Executive sub-nav badge either way —
      // if the write actually failed, this pulls the true (unacknowledged)
      // state back in rather than trusting the optimistic update.
      reloadMessages()
    }
  }, [items, reloadMessages])

  const groups = useMemo(() => groupByLocalDate(items), [items])

  if (!open) return null

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'oklch(0 0 0 / 0.55)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-label="Flagged Messages Archive"
        onClick={e => e.stopPropagation()}
        className="glass"
        style={{
          width: size.width, height: size.height,
          display: 'flex', flexDirection: 'column', borderRadius: 12, overflow: 'hidden',
          position: 'relative',
        }}
      >
        <ResizeHandles onStart={startResize} />
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '13px 18px', borderBottom: '1px solid oklch(1 0 0 / 0.08)', flexShrink: 0,
        }}>
          <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--t1)' }}>Flagged Messages · Archive</span>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              border: '1px solid oklch(1 0 0 / 0.1)', background: 'oklch(1 0 0 / 0.05)',
              color: 'var(--t3)', borderRadius: 6, width: 26, height: 26, cursor: 'pointer', fontSize: 14,
            }}
          >
            ×
          </button>
        </div>

        <div style={{ padding: '10px 18px', flexShrink: 0 }}>
          <input
            ref={searchInputRef}
            value={searchInput}
            onChange={e => handleSearchChange(e.target.value)}
            placeholder="Search subject, body, or agent…"
            style={{
              width: '100%', padding: '7px 10px', borderRadius: 7,
              border: '1px solid oklch(1 0 0 / 0.1)', background: 'oklch(1 0 0 / 0.04)',
              color: 'var(--t1)', fontSize: 12,
            }}
          />
          {searchPending && (
            <div style={{ fontSize: 10.5, color: 'var(--t3)', marginTop: 4 }}>Searching…</div>
          )}
        </div>

        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '0 18px 16px' }}>
          {initialLoading ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 0', color: 'var(--t3)', fontSize: 12 }}>
              Loading…
            </div>
          ) : archiveError ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 0', color: 'oklch(0.65 0.22 25)', fontSize: 12 }}>
              {archiveError}
            </div>
          ) : items.length === 0 ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 0', color: 'var(--t3)', fontSize: 12 }}>
              {debouncedSearch ? `No messages match "${debouncedSearch}".` : 'No flagged messages yet.'}
            </div>
          ) : (
            <>
              {groups.map(group => (
                <div key={group.label} style={{ marginBottom: 14 }}>
                  <div style={{
                    fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em',
                    color: 'var(--t3)', padding: '10px 0 6px', position: 'sticky', top: 0,
                  }}>
                    {group.label}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                    {group.messages.map(msg => {
                      const highlighted = highlightId === msg.id
                      const dismissing = dismissingIds.has(msg.id)
                      return (
                        <div
                          key={msg.id}
                          ref={el => { if (el) itemRefs.current.set(msg.id, el); else itemRefs.current.delete(msg.id) }}
                          style={{
                            display: 'flex', alignItems: 'flex-start', gap: 10,
                            padding: '9px 12px', borderRadius: 8,
                            border: highlighted
                              ? '1px solid oklch(0.78 0.16 75 / 0.7)'
                              : '1px solid oklch(1 0 0 / 0.07)',
                            background: highlighted
                              ? 'oklch(0.78 0.16 75 / 0.1)'
                              : msg.acknowledged ? 'oklch(1 0 0 / 0.02)' : 'oklch(0.78 0.16 75 / 0.04)',
                            opacity: dismissing ? 0.5 : 1,
                            transition: 'opacity 0.15s',
                          }}
                        >
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                              <span style={{
                                fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em',
                                color: 'oklch(0.78 0.16 75)', background: 'oklch(0.78 0.16 75 / 0.12)',
                                border: '1px solid oklch(0.78 0.16 75 / 0.3)', borderRadius: 4, padding: '1px 5px', flexShrink: 0,
                              }}>
                                {msg.from_agent}
                              </span>
                              <span style={{ fontSize: 10.5, color: 'var(--t3)', flexShrink: 0 }}>{relativeTime(msg.occurred_at)}</span>
                            </div>
                            <div style={{ fontSize: 12, color: 'var(--t1)', fontWeight: 500, marginBottom: 3 }}>{msg.subject}</div>
                            <div style={{ fontSize: 11.5, color: 'var(--t2)', lineHeight: 1.5, wordBreak: 'break-word', whiteSpace: 'pre-wrap' }}>
                              {msg.body}
                            </div>
                          </div>
                          {msg.acknowledged ? (
                            <span style={{ flexShrink: 0, marginTop: 2, fontSize: 10.5, color: 'var(--t3)', whiteSpace: 'nowrap' }}>
                              Dismissed
                            </span>
                          ) : (
                            <button
                              onClick={() => dismiss(msg)}
                              disabled={dismissing}
                              title="Dismiss / acknowledge"
                              style={{
                                flexShrink: 0, marginTop: 2, padding: '3px 9px', borderRadius: 5,
                                border: '1px solid oklch(1 0 0 / 0.1)', background: 'oklch(1 0 0 / 0.05)',
                                color: 'var(--t3)', fontSize: 10.5, cursor: dismissing ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap',
                              }}
                            >
                              {dismissing ? '…' : 'Dismiss'}
                            </button>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}

              {hasMore && (
                <div style={{ display: 'flex', justifyContent: 'center', padding: '8px 0 4px' }}>
                  <button
                    onClick={() => loadMore(debouncedSearch, cursor)}
                    disabled={loadingMore}
                    style={{
                      padding: '6px 16px', borderRadius: 7, border: '1px solid oklch(1 0 0 / 0.1)',
                      background: 'oklch(1 0 0 / 0.05)', color: 'var(--t2)', fontSize: 11,
                      cursor: loadingMore ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {loadingMore ? 'Loading…' : 'Load more'}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
