'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Panel } from './Panel'
import { VOICE_CAPTURE_ENABLED, VOICE_OFF_MESSAGE } from '@/lib/demo/config'

// ── Types ──────────────────────────────────────────────────────────────────────

interface Idea {
  id: string
  title: string
  summary: string | null
  body: string | null
  tags: string[]
  theme: string | null
  source: string | null
  vault_path: string | null
  related: string[]
  created_at: string
  updated_at: string
}

interface InsightSnapshot {
  insight: string | null
  generated_at: string | null
}

interface IdeasResponse {
  ideas: Idea[]
  insight: InsightSnapshot | null
  pendingCount: number
}

// ── Idea row ───────────────────────────────────────────────────────────────────

function IdeaRow({ idea }: { idea: Idea }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div
      style={{
        border: '1px solid oklch(1 0 0 / 0.07)',
        borderRadius: 8,
        overflow: 'hidden',
      }}
    >
      <div
        style={{ padding: '8px 10px', cursor: 'pointer' }}
        onClick={() => setExpanded(e => !e)}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
          <span style={{ color: 'var(--t1)', fontSize: 12, fontWeight: 500, flex: 1, minWidth: 0 }}>
            {idea.title}
          </span>
          <span style={{ color: 'var(--t3)', fontSize: 10.5, flexShrink: 0 }}>{expanded ? '▲' : '▼'}</span>
        </div>
        {idea.summary && (
          <div style={{ color: 'var(--t2)', fontSize: 11, marginTop: 3 }}>{idea.summary}</div>
        )}
        {idea.tags.length > 0 && (
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 5 }}>
            {idea.tags.map(tag => (
              <span
                key={tag}
                style={{
                  background: 'oklch(1 0 0 / 0.05)',
                  border: '1px solid oklch(1 0 0 / 0.09)',
                  borderRadius: 10,
                  color: 'var(--t3)',
                  fontSize: 10.5,
                  padding: '1px 6px',
                }}
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>

      {expanded && (
        <div style={{ borderTop: '1px solid oklch(1 0 0 / 0.07)', padding: '8px 10px' }}>
          {idea.body ? (
            <p style={{ color: 'var(--t2)', fontSize: 11.5, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
              {idea.body}
            </p>
          ) : (
            <p style={{ color: 'var(--t3)', fontSize: 11 }}>No further detail yet.</p>
          )}
          {idea.related.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <span style={{ color: 'var(--t3)', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Related
              </span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 3 }}>
                {idea.related.map(r => (
                  <span key={r} style={{ color: 'var(--acy)', fontSize: 11 }}>{r}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Main card ──────────────────────────────────────────────────────────────────

const sectionLabelStyle: React.CSSProperties = {
  color: 'var(--t3)',
  fontSize: 10.5,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  marginBottom: 4,
  display: 'block',
}

export function BrainstormCard() {
  const [ideas, setIdeas] = useState<Idea[]>([])
  const [insight, setInsight] = useState<InsightSnapshot | null>(null)
  const [pendingCount, setPendingCount] = useState(0)
  const [loading, setLoading] = useState(true)

  const [input, setInput] = useState('')
  const [captureState, setCaptureState] = useState<'idle' | 'saving' | 'ok' | 'err'>('idle')
  const [captureErr, setCaptureErr] = useState('')
  const [recording, setRecording] = useState(false)
  // Demo only: explains why the mic button does nothing here.
  const [demoNotice, setDemoNotice] = useState('')

  const dirtyRef = useRef(false)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)
  // Guards against re-entrancy: covers the gap between clicking Record and
  // getUserMedia's permission prompt resolving. Mic-permission prompts are
  // typically non-modal, so without this a rapid double-click (or Enter-key
  // repeat) before `recording` flips true could invoke startRecording() a
  // second time and open two overlapping streams. A plain ref (not state) is
  // enough here — unlike JournalCard, this card has no other editable fields
  // (mood/tags/text) that need to visually lock while a recording is
  // in-flight; the mic button's own `recording` state is the only UI signal
  // needed. Set synchronously as the first line of startRecording() so the
  // check is live even before the await ever yields.
  const startingRef = useRef(false)
  // Stopping the MediaStream's tracks (below) makes the browser auto-fire the
  // MediaRecorder's native 'stop' event, which re-invokes recorder.onstop —
  // but the component is already unmounted at that point. This ref lets
  // onstop tell "real user click" apart from "unmount-triggered auto-stop"
  // so it never POSTs a spurious/partial capture after unmount. 'user' is
  // set synchronously by stopRecording() before recorder.stop() is called,
  // so a legitimate in-flight stop (click just before unmount) still submits
  // — only a stop caused by the unmount cleanup itself is skipped.
  const stopReasonRef = useRef<'pending' | 'user' | 'unmount'>('pending')
  // Tracks whether the component is still mounted so onstop's async submit
  // chain (which can resolve after unmount in the click-stop-then-unmount
  // race) never calls a React state setter on an unmounted component. The
  // POST itself still always fires — only the local UI state updates are
  // skipped once this is false.
  const mountedRef = useRef(true)

  // If the card unmounts (e.g. the operator navigates to a different tab) while a
  // recording is in progress, the getUserMedia stream would otherwise stay
  // hot with no way to stop it. Release it on unmount. React Strict Mode
  // double-invokes this effect in dev (mount → phantom cleanup → mount), so
  // the ref must be reset on every mount or the phantom cleanup would
  // permanently mark the component as "unmounting" for its whole lifetime.
  // The cleanup only overwrites stopReasonRef to 'unmount' when it isn't
  // already 'user' — otherwise a click-to-stop that lands moments before
  // unmount would have its already-completed recording silently discarded
  // when the async onstop event finally fires.
  useEffect(() => {
    stopReasonRef.current = 'pending'
    mountedRef.current = true
    return () => {
      if (stopReasonRef.current !== 'user') stopReasonRef.current = 'unmount'
      mountedRef.current = false
      streamRef.current?.getTracks().forEach(t => t.stop())
    }
  }, [])

  const loadIdeas = useCallback(() => {
    fetch('/api/ideas')
      .then(res => {
        if (!res.ok) { console.error('[brainstorm] GET failed', res.status); return null }
        return res.json() as Promise<IdeasResponse>
      })
      .then(data => {
        if (!data) return
        if (dirtyRef.current) return
        setIdeas(data.ideas ?? [])
        setInsight(data.insight ?? null)
        setPendingCount(data.pendingCount ?? 0)
        setLoading(false)
      })
      .catch(e => {
        console.error('[brainstorm] load error', e)
        setLoading(false)
      })
  }, [])

  useEffect(() => {
    loadIdeas()
  }, [loadIdeas])

  // ── Typed capture ────────────────────────────────────────────────────────────

  const submitCapture = useCallback(async (text: string) => {
    setCaptureState('saving')
    setCaptureErr('')
    try {
      const fd = new FormData()
      fd.set('text', text)
      const res = await fetch('/api/ideas/capture', { method: 'POST', body: fd })
      if (!res.ok) {
        const j = await res.json().catch((e) => { console.error('brainstorm response parse failed', e); return {} })
        throw new Error(j.error ?? 'Capture failed')
      }
      setCaptureState('ok')
      setInput('')
      dirtyRef.current = false
      setPendingCount(c => c + 1)
    } catch (e) {
      setCaptureErr((e as Error).message)
      setCaptureState('err')
    } finally {
      setTimeout(() => setCaptureState('idle'), 2000)
    }
  }, [])

  const handleTypedSubmit = useCallback(() => {
    const text = input.trim()
    if (!text) return
    submitCapture(text)
  }, [input, submitCapture])

  // ── Voice capture ────────────────────────────────────────────────────────────

  const startRecording = useCallback(async () => {
    // Re-entrancy guard: a rapid double-click (or Enter-key repeat) before
    // the button's own `disabled` attribute reflects the new render could
    // otherwise invoke this twice and open two overlapping streams. Checked
    // and set synchronously, before the getUserMedia await, so nothing can
    // slip through during the pending-permission window.
    if (startingRef.current || recording) return
    startingRef.current = true
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      // Component may have unmounted while the permission prompt was pending
      // (mic-permission prompts are typically non-modal and can sit open for
      // a long time). If so, the unmount cleanup already ran and found
      // nothing to stop — release this freshly-acquired stream ourselves and
      // bail out before touching any state or constructing a MediaRecorder.
      if (!mountedRef.current) {
        stream.getTracks().forEach(t => t.stop())
        startingRef.current = false
        return
      }
      streamRef.current = stream
      // Explicit low bitrate: speech-only audio for Whisper doesn't need high
      // fidelity, and the browser's unset default (~128kbps) hits Vercel's hard
      // 4.5MB request-body limit at only ~4-5 minutes of recording. 32kbps buys
      // ~18 minutes of headroom instead, at no real transcription quality cost.
      const recorder = new MediaRecorder(stream, { audioBitsPerSecond: 32000 })
      chunksRef.current = []
      recorder.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      recorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop())
        streamRef.current = null
        // Unmount-triggered auto-stop (see stopReasonRef comment above) — release
        // the mic (already done above) but never submit a spurious capture.
        if (stopReasonRef.current === 'unmount') return
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' })
        setCaptureState('saving')
        setCaptureErr('')
        try {
          const fd = new FormData()
          fd.set('audio', blob, 'idea.webm')
          const res = await fetch('/api/ideas/capture', { method: 'POST', body: fd })
          if (!res.ok) {
            const j = await res.json().catch((e) => { console.error('brainstorm response parse failed', e); return {} })
            throw new Error(j.error ?? 'Capture failed')
          }
          // Component may have unmounted while this POST was in flight (the
          // click-stop-then-immediate-unmount race). The capture already
          // saved server-side — only skip the now-pointless local UI update.
          if (!mountedRef.current) return
          setCaptureState('ok')
          setPendingCount(c => c + 1)
        } catch (e) {
          if (!mountedRef.current) return
          setCaptureErr((e as Error).message)
          setCaptureState('err')
        } finally {
          // Recording only truly ends once this capture's async submit fully
          // resolves (success or failure) — not at the Stop click. Clearing
          // `recording` here, rather than synchronously in stopRecording(),
          // is what keeps the mic button's re-entrancy guard closed for the
          // whole in-flight window, so a second Record click can never start
          // a new stream while this recording's onstop cleanup (which nulls
          // streamRef.current unconditionally) is still pending.
          if (mountedRef.current) {
            setRecording(false)
            setTimeout(() => setCaptureState('idle'), 2000)
          }
        }
      }
      mediaRecorderRef.current = recorder
      recorder.start()
      setRecording(true)
      // `recording` now covers the lock (through Stop → onstop → submit), so
      // release the starting-window lock.
      startingRef.current = false
    } catch (e) {
      console.error('[brainstorm] mic error', e)
      // If getUserMedia already resolved and assigned streamRef.current before
      // MediaRecorder construction/start threw, the mic is still live with no
      // other cleanup path — stop it here so it isn't leaked (and so a retry
      // doesn't overwrite streamRef.current with a new stream, orphaning this one).
      streamRef.current?.getTracks().forEach(t => t.stop())
      streamRef.current = null
      // Permission denied / no mic / construction failure — don't leave the
      // re-entrancy guard locked forever.
      startingRef.current = false
      setCaptureErr('Microphone unavailable')
      setCaptureState('err')
      setTimeout(() => setCaptureState('idle'), 2000)
    }
  }, [recording])

  const stopRecording = useCallback(() => {
    // The native MediaRecorder's `.state` is the authoritative, synchronously
    // updated source of truth (unlike React's `recording` state, which lags
    // behind a render). A second/redundant call — e.g. a rapid double-click
    // on Stop — must be a safe no-op instead of throwing InvalidStateError.
    if (mediaRecorderRef.current?.state !== 'recording') return
    stopReasonRef.current = 'user'
    mediaRecorderRef.current.stop()
    // `recording` deliberately stays true here — see the onstop `finally`
    // block above for why it's cleared only once the capture's async submit
    // (success or failure) fully resolves, not synchronously on click.
  }, [])

  // ── Grouping by theme ────────────────────────────────────────────────────────

  const groups = new Map<string, Idea[]>()
  for (const idea of ideas) {
    const key = idea.theme?.trim() || 'Ungrouped'
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(idea)
  }
  // Ungrouped last
  const groupNames = [...groups.keys()].sort((a, b) => {
    if (a === 'Ungrouped') return 1
    if (b === 'Ungrouped') return -1
    return a.localeCompare(b)
  })

  let insightSummary: string | null = null
  if (insight?.insight) {
    try {
      const parsed = JSON.parse(insight.insight)
      insightSummary = typeof parsed.summary === 'string' ? parsed.summary : insight.insight
    } catch {
      insightSummary = insight.insight
    }
  }

  const captureLabel = captureState === 'ok' ? '✓ Captured' : captureState === 'err' ? '✕ Failed' : 'Capture'
  const captureColor = captureState === 'ok' ? 'var(--acy)' : captureState === 'err' ? 'var(--danger)' : 'var(--t2)'
  const isBusy = captureState === 'saving'

  return (
    <Panel
      label="Brainstorm"
      badge={pendingCount > 0 ? `${pendingCount} queued` : undefined}
    >
      {/* AI Insights — cached snapshot only, never generated on load */}
      <div
        style={{
          background: 'oklch(1 0 0 / 0.03)',
          border: '1px solid oklch(1 0 0 / 0.08)',
          borderRadius: 8,
          padding: '8px 10px',
          marginBottom: 12,
        }}
      >
        <span style={sectionLabelStyle}>AI Insights</span>
        {insightSummary ? (
          <p style={{ color: 'var(--t2)', fontSize: 11.5, lineHeight: 1.6, marginTop: 2 }}>{insightSummary}</p>
        ) : (
          <p style={{ color: 'var(--t3)', fontSize: 11 }}>
            No insights generated yet. Refresh to analyze your current ideas.
          </p>
        )}
      </div>

      {/* Ideas list */}
      {loading ? (
        <div style={{ color: 'var(--t3)', fontSize: 12 }}>Loading…</div>
      ) : ideas.length === 0 ? (
        <div style={{ color: 'var(--t3)', fontSize: 12, marginBottom: 4 }}>
          No ideas yet. Dump one below.
          {pendingCount > 0 && (
            <div style={{ marginTop: 4, fontSize: 11 }}>
              {pendingCount} capture{pendingCount === 1 ? '' : 's'} waiting to be organized by the vault librarian.
              This list fills in once that sync runs.
            </div>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 4 }}>
          {groupNames.map(name => (
            <div key={name}>
              <span style={sectionLabelStyle}>{name}</span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {groups.get(name)!.map(idea => <IdeaRow key={idea.id} idea={idea} />)}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Capture */}
      <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ display: 'flex', gap: 6 }}>
          <input
            value={input}
            onChange={e => { setInput(e.target.value); dirtyRef.current = true }}
            onKeyDown={e => { if (e.key === 'Enter') handleTypedSubmit() }}
            placeholder="Dump an idea…"
            disabled={isBusy}
            style={{
              background: 'oklch(0 0 0 / 0.2)',
              border: '1px solid oklch(1 0 0 / 0.09)',
              borderRadius: 7,
              color: 'var(--t1)',
              flex: 1,
              fontSize: 12,
              outline: 'none',
              padding: '6px 9px',
            }}
          />
          <button
            onClick={recording ? stopRecording : VOICE_CAPTURE_ENABLED ? startRecording : () => setDemoNotice(VOICE_OFF_MESSAGE)}
            disabled={isBusy}
            title={recording ? 'Stop recording' : 'Record a voice idea'}
            style={{
              background: recording ? 'oklch(0.60 0.22 25 / 0.15)' : 'oklch(1 0 0 / 0.06)',
              border: recording ? '1px solid oklch(0.60 0.22 25 / 0.35)' : '1px solid oklch(1 0 0 / 0.10)',
              borderRadius: 7,
              color: recording ? 'var(--danger)' : 'var(--t2)',
              cursor: isBusy ? 'not-allowed' : 'pointer',
              flexShrink: 0,
              fontSize: 14,
              width: 32,
              height: 30,
            }}
          >
            {recording ? '■' : '🎙'}
          </button>
          <button
            onClick={handleTypedSubmit}
            disabled={isBusy || !input.trim()}
            style={{
              background: captureState === 'ok' ? 'oklch(0.67 0.19 165 / 0.12)' : captureState === 'err' ? 'oklch(0.60 0.22 25 / 0.12)' : 'oklch(1 0 0 / 0.06)',
              border: '1px solid oklch(1 0 0 / 0.10)',
              borderRadius: 7,
              color: captureColor,
              cursor: isBusy ? 'not-allowed' : 'pointer',
              flexShrink: 0,
              fontSize: 11,
              fontWeight: 500,
              opacity: isBusy ? 0.6 : 1,
              padding: '0 10px',
            }}
          >
            {captureLabel}
          </button>
        </div>
        {demoNotice && (
          <div style={{ color: 'var(--t2)', fontSize: 11, lineHeight: 1.5 }}>{demoNotice}</div>
        )}
        {captureState === 'err' && captureErr && (
          <div style={{ color: 'var(--danger)', fontSize: 10.5 }}>{captureErr}</div>
        )}
      </div>
    </Panel>
  )
}
