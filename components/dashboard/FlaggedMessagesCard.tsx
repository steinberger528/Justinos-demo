'use client'

import { useCallback, useState } from 'react'
import { Panel } from './Panel'
import { useCrmData } from './CrmDataProvider'
import { FlaggedMessagesModal } from './FlaggedMessagesModal'
import type { FlaggedMessage } from './crm-types'

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

/**
 * Flagged Messages panel — shows unacknowledged agent to:human messages.
 * Each message can be dismissed (acknowledged), which removes it from the
 * active list. Data comes from CrmDataProvider's shared GET /api/crm/messages
 * poll (Task 4 Step 2 of the crm-tab-reorg plan) — no independent fetch here
 * anymore, so this card and the Executive sub-nav badge never disagree.
 *
 * specs/flagged-messages-expansion.md: sizes to content (`capHeight`, not
 * `fill`) so ExceptionsRollup — its row-sibling — absorbs the freed space;
 * adds Dismiss All (confirmed, single bulk endpoint) and a combined
 * expand/archive/search modal opened by clicking a row or "View All".
 */
export function FlaggedMessagesCard() {
  const { messages: data, messagesError: error, reloadMessages: load } = useCrmData()
  const [dismissingId, setDismissingId] = useState<string | null>(null)
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())

  const [confirmingDismissAll, setConfirmingDismissAll] = useState(false)
  const [dismissAllInFlight, setDismissAllInFlight] = useState(false)

  const [modalOpen, setModalOpen] = useState(false)
  const [modalInitialMessageId, setModalInitialMessageId] = useState<string | null>(null)

  const dismiss = useCallback(async (msg: FlaggedMessage) => {
    setDismissingId(msg.id)
    // Optimistic remove from active list
    setDismissed(prev => new Set(prev).add(msg.id))
    try {
      const res = await fetch(`/api/crm/messages/${msg.id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      if (!res.ok) {
        console.error('[messages] dismiss failed', await res.text())
        // Revert optimistic — re-fetch
        setDismissed(prev => { const s = new Set(prev); s.delete(msg.id); return s })
        load()
      } else {
        load()
      }
    } catch (e) {
      console.error('[messages] dismiss error', e)
      setDismissed(prev => { const s = new Set(prev); s.delete(msg.id); return s })
      load()
    } finally {
      setDismissingId(null)
    }
  }, [load])

  const dismissAll = useCallback(async () => {
    setDismissAllInFlight(true)
    try {
      const res = await fetch('/api/crm/messages/dismiss-all', {
        method: 'POST',
        credentials: 'include',
      })
      if (!res.ok) {
        console.error('[messages] dismiss-all failed', await res.text())
      }
    } catch (e) {
      console.error('[messages] dismiss-all error', e)
    } finally {
      // Reconcile from the server either way — never trust the optimistic
      // state if the request failed partway (edge case in the spec).
      load()
      setDismissAllInFlight(false)
      setConfirmingDismissAll(false)
    }
  }, [load])

  const active = (data?.active ?? []).filter(m => !dismissed.has(m.id))

  const openModal = (messageId: string | null) => {
    setModalInitialMessageId(messageId)
    setModalOpen(true)
  }

  // Stable identity so FlaggedMessagesModal's focus-trap effect (deps
  // [open, onClose]) doesn't tear down and rebuild on every re-render of this
  // card — the 60s CrmDataProvider poll and every reloadMessages() call
  // (including ones triggered by dismissing from inside the open modal) would
  // otherwise re-run the trap's cleanup (which yanks focus back to the
  // trigger) and immediately re-capture it, visibly redirecting focus away
  // from wherever the user was (e.g. mid-type in the search box).
  const closeModal = useCallback(() => setModalOpen(false), [])

  return (
    <>
      <Panel
        label="Flagged Messages"
        badge={active.length > 0 ? String(active.length) : undefined}
        capHeight
        action={
          <div className="flex items-center gap-2">
            <button
              onClick={() => openModal(null)}
              style={{
                padding: '2px 8px', borderRadius: 5, border: '1px solid oklch(1 0 0 / 0.1)',
                background: 'oklch(1 0 0 / 0.05)', color: 'var(--t3)', fontSize: 10.5, cursor: 'pointer',
              }}
            >
              View All
            </button>
            {active.length > 0 && !confirmingDismissAll && (
              <button
                onClick={() => setConfirmingDismissAll(true)}
                style={{
                  padding: '2px 8px', borderRadius: 5, border: '1px solid oklch(1 0 0 / 0.1)',
                  background: 'oklch(1 0 0 / 0.05)', color: 'var(--t3)', fontSize: 10.5, cursor: 'pointer',
                }}
              >
                Dismiss All
              </button>
            )}
          </div>
        }
      >
        {confirmingDismissAll && active.length > 0 && (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
            padding: '7px 10px', marginBottom: 7, borderRadius: 8,
            border: '1px solid oklch(0.65 0.22 25 / 0.35)', background: 'oklch(0.65 0.22 25 / 0.08)',
          }}>
            <span style={{ fontSize: 11, color: 'var(--t1)' }}>
              Dismiss all {active.length} flagged message{active.length === 1 ? '' : 's'}?
            </span>
            <div className="flex items-center gap-2" style={{ flexShrink: 0 }}>
              <button
                onClick={dismissAll}
                disabled={dismissAllInFlight}
                style={{
                  padding: '3px 9px', borderRadius: 5, border: '1px solid oklch(0.65 0.22 25 / 0.4)',
                  background: 'oklch(0.65 0.22 25 / 0.15)', color: 'var(--t1)', fontSize: 10.5,
                  cursor: dismissAllInFlight ? 'not-allowed' : 'pointer',
                }}
              >
                {dismissAllInFlight ? '…' : 'Confirm'}
              </button>
              <button
                onClick={() => setConfirmingDismissAll(false)}
                disabled={dismissAllInFlight}
                style={{
                  padding: '3px 9px', borderRadius: 5, border: '1px solid oklch(1 0 0 / 0.1)',
                  background: 'oklch(1 0 0 / 0.05)', color: 'var(--t3)', fontSize: 10.5,
                  cursor: dismissAllInFlight ? 'not-allowed' : 'pointer',
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {data === null && !error ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--t3)', fontSize: 12 }}>
            Loading…
          </div>
        ) : error ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'oklch(0.65 0.22 25)', fontSize: 12 }}>
            {error}
          </div>
        ) : active.length === 0 ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--t3)', fontSize: 12 }}>
            No flagged messages.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            {active.map(msg => (
              <div
                key={msg.id}
                onClick={() => openModal(msg.id)}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 8,
                  padding: '7px 10px',
                  borderRadius: 8,
                  border: '1px solid oklch(0.78 0.16 75 / 0.22)',
                  background: 'oklch(0.78 0.16 75 / 0.04)',
                  opacity: dismissingId === msg.id ? 0.5 : 1,
                  transition: 'opacity 0.15s',
                  cursor: 'pointer',
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                    <span style={{
                      fontSize: 10.5,
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em',
                      color: 'oklch(0.78 0.16 75)',
                      background: 'oklch(0.78 0.16 75 / 0.12)',
                      border: '1px solid oklch(0.78 0.16 75 / 0.3)',
                      borderRadius: 4,
                      padding: '1px 5px',
                      flexShrink: 0,
                    }}>
                      {msg.from_agent}
                    </span>
                    <span style={{ fontSize: 10.5, color: 'var(--t3)', flexShrink: 0 }}>
                      {relativeTime(msg.occurred_at)}
                    </span>
                  </div>
                  <div style={{ fontSize: 11.5, color: 'var(--t1)', fontWeight: 500, marginBottom: 2 }}>
                    {msg.subject}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--t2)', lineHeight: 1.4, wordBreak: 'break-word', whiteSpace: 'pre-wrap' }}>
                    {msg.body}
                  </div>
                </div>
                <button
                  onClick={e => { e.stopPropagation(); dismiss(msg) }}
                  disabled={dismissingId === msg.id}
                  title="Dismiss / acknowledge"
                  style={{
                    flexShrink: 0,
                    marginTop: 2,
                    padding: '3px 9px',
                    borderRadius: 5,
                    border: '1px solid oklch(1 0 0 / 0.1)',
                    background: 'oklch(1 0 0 / 0.05)',
                    color: 'var(--t3)',
                    fontSize: 10.5,
                    cursor: dismissingId === msg.id ? 'not-allowed' : 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {dismissingId === msg.id ? '…' : 'Dismiss'}
                </button>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <FlaggedMessagesModal
        open={modalOpen}
        onClose={closeModal}
        initialMessageId={modalInitialMessageId}
      />
    </>
  )
}
