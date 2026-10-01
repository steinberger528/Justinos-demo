'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { Panel } from './Panel'
import { localDateKey } from '@/lib/date'
import { PHOTO_CAPTURE_ENABLED, PHOTO_OFF_MESSAGE, VOICE_CAPTURE_ENABLED, VOICE_OFF_MESSAGE } from '@/lib/demo/config'

// ── Constants ──────────────────────────────────────────────────────────────────

const EMOJI_FACES = ['😞', '😕', '😐', '🙂', '😄'] as const // index+1 = emoji_mood 1-5

const NAMED_MOODS = ['energized', 'calm', 'focused', 'anxious', 'drained', 'low'] as const

const GUIDED_PROMPTS = [
  'What made today feel worth it?',
  "What's weighing on you right now?",
  'What did you avoid today, and why?',
  'What are you looking forward to?',
  'What would make tomorrow easier?',
  'What did you learn about yourself today?',
  'What do you need more of right now?',
] as const


function dayOfYear(): number {
  const now = new Date()
  const start = new Date(now.getFullYear(), 0, 0)
  const diff = now.getTime() - start.getTime()
  return Math.floor(diff / 86_400_000)
}

// ── Types ──────────────────────────────────────────────────────────────────────

interface JournalEntry {
  id: string
  entry_date: string
  emoji_mood: number
  named_moods: string[]
  tags: string[]
  prompt: string | null
  body: string
  source: 'voice' | 'text' | 'photo'
  image_ref: string | null
  created_at: string
  updated_at: string
}

interface Reflection {
  week_start: string
  summary: string | null
  mood_trend: string | null
  themes: string[]
  observation: string | null
  generated_at: string
}

interface JournalResponse {
  entries: JournalEntry[]
  todayEntry: JournalEntry | null
  reflection: Reflection | null
}

// ── Mood trend strip ───────────────────────────────────────────────────────────

function MoodTrend({ entries }: { entries: JournalEntry[] }) {
  const recent = [...entries]
    .sort((a, b) => a.entry_date.localeCompare(b.entry_date))
    .slice(-14)

  if (recent.length === 0) {
    return <div style={{ color: 'var(--t3)', fontSize: 11 }}>No entries yet. Your mood trend will build up here.</div>
  }

  return (
    <div style={{ display: 'flex', gap: 4, alignItems: 'flex-end', overflowX: 'auto', paddingBottom: 2 }}>
      {recent.map(e => (
        <div
          key={e.entry_date}
          title={`${e.entry_date} · ${EMOJI_FACES[e.emoji_mood - 1] ?? ''}`}
          style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, flexShrink: 0, width: 20 }}
        >
          <div
            style={{
              width: 10,
              height: Math.max(4, e.emoji_mood * 6),
              borderRadius: 3,
              background: 'var(--ag)',
              opacity: 0.3 + e.emoji_mood * 0.14,
            }}
          />
          <span style={{ fontSize: 11 }}>{EMOJI_FACES[e.emoji_mood - 1] ?? ''}</span>
        </div>
      ))}
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

export function JournalCard() {
  const [entries, setEntries] = useState<JournalEntry[]>([])
  const [todayEntry, setTodayEntry] = useState<JournalEntry | null>(null)
  const [reflection, setReflection] = useState<Reflection | null>(null)
  const [loading, setLoading] = useState(true)

  const [emojiMood, setEmojiMood] = useState<number | null>(null)
  const [namedMoods, setNamedMoods] = useState<string[]>([])
  const [tagsInput, setTagsInput] = useState('')
  const [usePrompt, setUsePrompt] = useState(false)
  const [bodyText, setBodyText] = useState('')
  const [state, setState] = useState<'idle' | 'saving' | 'ok' | 'err'>('idle')
  const [errMsg, setErrMsg] = useState('')
  const [warnMsg, setWarnMsg] = useState('')
  const [recording, setRecording] = useState(false)
  // Covers the gap between clicking Record and getUserMedia's permission
  // prompt resolving. Mic-permission prompts are typically non-modal, so
  // without this the fields stay editable (and Record can be re-entered)
  // during that whole pending window even though the eventual recording is
  // already bound to this click's submit()/field closure. Set synchronously
  // as the first line of startRecording() so React re-renders with the lock
  // engaged before the await ever yields. Cleared once `recording` itself
  // takes over (getUserMedia resolved) or on any getUserMedia error.
  const [starting, setStarting] = useState(false)
  // Demo only: explains why the mic and photo buttons do nothing here.
  const [demoNotice, setDemoNotice] = useState('')

  const dirtyRef = useRef(false)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)
  const photoInputRef = useRef<HTMLInputElement>(null)
  const todayKey = useMemo(() => localDateKey(), [])
  const guidedPrompt = useMemo(() => GUIDED_PROMPTS[dayOfYear() % GUIDED_PROMPTS.length], [])
  // Stopping the MediaStream's tracks (below) makes the browser auto-fire the
  // MediaRecorder's native 'stop' event, which re-invokes recorder.onstop —
  // but the component is already unmounted at that point. This ref lets
  // onstop tell "real user click" apart from "unmount-triggered auto-stop"
  // so it never overwrites today's saved entry with a partial recording.
  // 'user' is set synchronously by stopRecording() before recorder.stop() is
  // called, so a legitimate in-flight stop (click just before unmount) still
  // submits — only a stop caused by the unmount cleanup itself is skipped.
  const stopReasonRef = useRef<'pending' | 'user' | 'unmount'>('pending')
  // Tracks whether the component is still mounted so submit()'s post-fetch
  // UI updates (called from onstop's async chain, which can resolve after
  // unmount in the click-stop-then-unmount race) never call a React state
  // setter on an unmounted component. The POST itself still always fires —
  // only the local UI state updates are skipped once this is false.
  const mountedRef = useRef(true)
  // submit() is a useCallback keyed on `state`, so every render produces a
  // NEW submit closure with that render's `state` frozen inside it.
  // recorder.onstop captures whichever submit closure existed at the moment
  // startRecording() ran — i.e. before `state` could ever be 'saving' — so a
  // plain `state` read inside submit()'s re-entrancy guard would check a
  // stale, permanently-frozen snapshot instead of the live value. A ref is a
  // single mutable object shared across every closure and render, so reading
  // stateRef.current always reflects the true current state at the moment
  // submit() actually executes, no matter how stale the closure calling it is.
  const stateRef = useRef(state)

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

  // Keep stateRef in sync with the live `state` on every render so submit()'s
  // re-entrancy guard (below) always reads the current value, not whatever
  // was frozen into the closure that's calling it.
  useEffect(() => {
    stateRef.current = state
  }, [state])

  const loadJournal = useCallback(() => {
    fetch(`/api/journal?today=${todayKey}`)
      .then(res => {
        if (!res.ok) { console.error('[journal] GET failed', res.status); return null }
        return res.json() as Promise<JournalResponse>
      })
      .then(data => {
        if (!data) return
        setEntries(data.entries ?? [])
        setReflection(data.reflection ?? null)
        if (dirtyRef.current) return
        setTodayEntry(data.todayEntry ?? null)
        if (data.todayEntry) {
          setEmojiMood(data.todayEntry.emoji_mood)
          setNamedMoods(data.todayEntry.named_moods ?? [])
          setTagsInput((data.todayEntry.tags ?? []).join(', '))
          setBodyText(data.todayEntry.body ?? '')
        }
        setLoading(false)
      })
      .catch(e => {
        console.error('[journal] load error', e)
        setLoading(false)
      })
  }, [todayKey])

  useEffect(() => {
    loadJournal()
  }, [loadJournal])

  const toggleNamedMood = useCallback((m: string) => {
    dirtyRef.current = true
    setNamedMoods(prev => prev.includes(m) ? prev.filter(x => x !== m) : [...prev, m])
  }, [])

  const buildFormData = useCallback((extra?: { audio?: Blob; photo?: File }) => {
    const fd = new FormData()
    fd.set('entry_date', todayKey)
    fd.set('emoji_mood', String(emojiMood))
    fd.set('named_moods', JSON.stringify(namedMoods))
    fd.set('tags', JSON.stringify(tagsInput.split(',').map(t => t.trim()).filter(Boolean)))
    if (usePrompt) fd.set('prompt', guidedPrompt)
    if (extra?.audio) {
      fd.set('audio', extra.audio, 'entry.webm')
    } else if (extra?.photo) {
      fd.set('photo', extra.photo)
    } else {
      fd.set('text', bodyText.trim())
    }
    return fd
  }, [todayKey, emojiMood, namedMoods, tagsInput, usePrompt, guidedPrompt, bodyText])

  const submit = useCallback(async (extra?: { audio?: Blob; photo?: File }) => {
    // Re-entrancy guard: defense-in-depth against a future call site or a
    // fast double-action triggering two concurrent submits even if the UI's
    // `disabled` attribute is somehow bypassed. Reads stateRef (always live)
    // rather than `state` (frozen at closure-creation time — see stateRef's
    // declaration comment) so this actually catches a genuinely in-flight
    // save no matter which stale closure is calling.
    if (stateRef.current === 'saving') return
    if (emojiMood == null) {
      setErrMsg('Pick a mood first')
      setState('err')
      setTimeout(() => { if (mountedRef.current) setState('idle') }, 2000)
      return
    }
    if (mountedRef.current) {
      setState('saving')
      setErrMsg('')
      setWarnMsg('')
    }
    try {
      const fd = buildFormData(extra)
      const res = await fetch('/api/journal', { method: 'POST', body: fd })
      const j = await res.json().catch((e) => { console.error('journal response parse failed', e); return {} })
      if (!res.ok) {
        throw new Error(j.error ?? 'Save failed')
      }
      // Component may have unmounted while this POST was in flight (the
      // click-stop-then-immediate-unmount voice race). The entry already
      // saved server-side — only skip the now-pointless local UI update.
      if (!mountedRef.current) return
      setState('ok')
      if (typeof j.warning === 'string' && j.warning) setWarnMsg(j.warning)
      dirtyRef.current = false
      loadJournal()
    } catch (e) {
      if (!mountedRef.current) return
      setErrMsg((e as Error).message)
      setState('err')
    } finally {
      if (mountedRef.current) {
        setRecording(false)
        setTimeout(() => { if (mountedRef.current) setState('idle') }, 2000)
      }
    }
  }, [emojiMood, buildFormData, loadJournal])

  // ── Voice ────────────────────────────────────────────────────────────────────

  const startRecording = useCallback(async () => {
    // Guard against re-entry: a rapid double-click (or Enter-key repeat)
    // before the button's own `disabled` attribute reflects the new render
    // could otherwise invoke this twice and open two overlapping streams.
    if (starting || recording) return
    setStarting(true)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      // Component may have unmounted while the permission prompt was pending
      // (mic-permission prompts are typically non-modal and can sit open for
      // a long time). If so, the unmount cleanup already ran and found
      // nothing to stop — release this freshly-acquired stream ourselves and
      // bail out before touching any state or constructing a MediaRecorder.
      if (!mountedRef.current) {
        stream.getTracks().forEach(t => t.stop())
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
      recorder.onstop = () => {
        stream.getTracks().forEach(t => t.stop())
        streamRef.current = null
        // Unmount-triggered auto-stop (see stopReasonRef comment above) — release
        // the mic (already done above) but never overwrite today's saved entry
        // with a partial recording.
        if (stopReasonRef.current === 'unmount') return
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' })
        submit({ audio: blob })
      }
      mediaRecorderRef.current = recorder
      recorder.start()
      // `recording` now covers the lock (through Stop → onstop → submit), so
      // release the starting-window lock.
      setRecording(true)
      setStarting(false)
    } catch (e) {
      console.error('[journal] mic error', e)
      // If getUserMedia already resolved and assigned streamRef.current before
      // MediaRecorder construction/start threw, the mic is still live with no
      // other cleanup path — stop it here so it isn't leaked (and so a retry
      // doesn't overwrite streamRef.current with a new stream, orphaning this one).
      streamRef.current?.getTracks().forEach(t => t.stop())
      streamRef.current = null
      // Permission denied / no mic / etc — don't leave fields locked forever.
      setStarting(false)
      setErrMsg('Microphone unavailable')
      setState('err')
      setTimeout(() => setState('idle'), 2000)
    }
  }, [submit, starting, recording])

  const stopRecording = useCallback(() => {
    // The native MediaRecorder's `.state` is the authoritative, synchronously
    // updated source of truth (unlike React's `recording` state, which lags
    // behind a render). A second/redundant call — e.g. a rapid double-click
    // on Stop before `isBusy` engages — must be a safe no-op instead of
    // throwing InvalidStateError.
    if (mediaRecorderRef.current?.state !== 'recording') return
    stopReasonRef.current = 'user'
    mediaRecorderRef.current.stop()
  }, [])

  const handlePhotoChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    submit({ photo: f })
  }, [submit])

  const isBusy = state === 'saving'
  const saveLabel = state === 'ok' ? (warnMsg ? '✓ Saved (see note)' : '✓ Saved') : state === 'err' ? '✕ Failed' : 'Save Entry'
  const saveColor = state === 'ok' ? (warnMsg ? 'var(--t2)' : 'var(--acy)') : state === 'err' ? 'var(--danger)' : 'var(--t2)'

  return (
    <Panel label="Journal">
      {/* Mood trend */}
      <div style={{ marginBottom: 12 }}>
        <span style={sectionLabelStyle}>Mood Trend</span>
        {loading ? (
          <div style={{ color: 'var(--t3)', fontSize: 12 }}>Loading…</div>
        ) : (
          <MoodTrend entries={entries} />
        )}
      </div>

      {/* Weekly reflection — cached snapshot only, never generated on load */}
      <div
        style={{
          background: 'oklch(1 0 0 / 0.03)',
          border: '1px solid oklch(1 0 0 / 0.08)',
          borderRadius: 8,
          padding: '8px 10px',
          marginBottom: 12,
        }}
      >
        <span style={sectionLabelStyle}>Weekly Reflection</span>
        {reflection?.summary || reflection?.observation ? (
          <div style={{ marginTop: 2 }}>
            {reflection.summary && (
              <p style={{ color: 'var(--t2)', fontSize: 11.5, lineHeight: 1.6 }}>{reflection.summary}</p>
            )}
            {reflection.observation && (
              <p style={{ color: 'var(--t3)', fontSize: 11, lineHeight: 1.5, marginTop: 4, fontStyle: 'italic' }}>
                {reflection.observation}
              </p>
            )}
            {reflection.themes.length > 0 && (
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 5 }}>
                {reflection.themes.map(t => (
                  <span
                    key={t}
                    style={{
                      background: 'oklch(1 0 0 / 0.05)', border: '1px solid oklch(1 0 0 / 0.09)',
                      borderRadius: 10, color: 'var(--t3)', fontSize: 10.5, padding: '1px 6px',
                    }}
                  >
                    {t}
                  </span>
                ))}
              </div>
            )}
          </div>
        ) : (
          <p style={{ color: 'var(--t3)', fontSize: 11 }}>
            No reflection generated yet. The weekly cron (or a refresh) will summarize your week here.
          </p>
        )}
      </div>

      {/* Entry form */}
      <div>
        <span style={sectionLabelStyle}>
          {todayEntry ? "Today's Entry (editable)" : "Today's Entry"}
        </span>

        {/* Emoji mood — required, one tap */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
          {EMOJI_FACES.map((face, i) => {
            const value = i + 1
            const active = emojiMood === value
            return (
              <button
                key={value}
                onClick={() => { dirtyRef.current = true; setEmojiMood(value) }}
                disabled={isBusy || recording || starting}
                style={{
                  background: active ? 'oklch(0.67 0.19 165 / 0.15)' : 'oklch(1 0 0 / 0.04)',
                  border: active ? '1px solid oklch(0.67 0.19 165 / 0.4)' : '1px solid oklch(1 0 0 / 0.09)',
                  borderRadius: 7,
                  cursor: (isBusy || recording || starting) ? 'not-allowed' : 'pointer',
                  fontSize: 16,
                  opacity: (isBusy || recording || starting) ? 0.6 : 1,
                  padding: '3px 8px',
                }}
                title={`Mood ${value}/5`}
              >
                {face}
              </button>
            )
          })}
        </div>

        {/* Named moods — optional multi-select */}
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 8 }}>
          {NAMED_MOODS.map(m => {
            const active = namedMoods.includes(m)
            return (
              <button
                key={m}
                onClick={() => toggleNamedMood(m)}
                disabled={isBusy || recording || starting}
                style={{
                  background: active ? 'oklch(1 0 0 / 0.09)' : 'transparent',
                  border: '1px solid oklch(1 0 0 / 0.09)',
                  borderRadius: 10,
                  color: active ? 'var(--t1)' : 'var(--t3)',
                  cursor: (isBusy || recording || starting) ? 'not-allowed' : 'pointer',
                  fontSize: 10.5,
                  opacity: (isBusy || recording || starting) ? 0.6 : 1,
                  padding: '2px 8px',
                }}
              >
                {m}
              </button>
            )
          })}
        </div>

        {/* Guided prompt — optional aid */}
        <div
          style={{
            display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8,
            cursor: (isBusy || recording || starting) ? 'not-allowed' : 'pointer', color: usePrompt ? 'var(--t2)' : 'var(--t3)', fontSize: 11,
            opacity: (isBusy || recording || starting) ? 0.6 : 1,
          }}
          onClick={() => { if (isBusy || recording || starting) return; setUsePrompt(u => !u) }}
        >
          <span>{usePrompt ? '☑' : '☐'}</span>
          <span style={{ fontStyle: 'italic' }}>{guidedPrompt}</span>
        </div>

        {/* Body + tags */}
        <textarea
          value={bodyText}
          onChange={e => { dirtyRef.current = true; setBodyText(e.target.value) }}
          placeholder="Write your entry, or use the mic below…"
          rows={3}
          disabled={isBusy || recording || starting}
          style={{
            background: 'oklch(0 0 0 / 0.2)',
            border: '1px solid oklch(1 0 0 / 0.09)',
            borderRadius: 7,
            color: 'var(--t1)',
            cursor: (isBusy || recording || starting) ? 'not-allowed' : 'text',
            fontSize: 12,
            opacity: (isBusy || recording || starting) ? 0.6 : 1,
            outline: 'none',
            padding: '7px 9px',
            resize: 'vertical',
            width: '100%',
          }}
        />
        <input
          value={tagsInput}
          onChange={e => { dirtyRef.current = true; setTagsInput(e.target.value) }}
          placeholder="Tags (comma separated, optional)"
          disabled={isBusy || recording || starting}
          style={{
            background: 'oklch(0 0 0 / 0.2)',
            border: '1px solid oklch(1 0 0 / 0.09)',
            borderRadius: 7,
            color: 'var(--t1)',
            cursor: (isBusy || recording || starting) ? 'not-allowed' : 'text',
            fontSize: 11.5,
            marginTop: 6,
            opacity: (isBusy || recording || starting) ? 0.6 : 1,
            outline: 'none',
            padding: '6px 9px',
            width: '100%',
          }}
        />

        {/* Actions */}
        <div style={{ display: 'flex', gap: 6, marginTop: 8, alignItems: 'center' }}>
          <button
            onClick={recording ? stopRecording : VOICE_CAPTURE_ENABLED ? startRecording : () => setDemoNotice(VOICE_OFF_MESSAGE)}
            disabled={isBusy || emojiMood == null || starting}
            title={recording ? 'Stop recording' : starting ? 'Waiting for microphone permission…' : 'Record entry'}
            style={{
              background: recording ? 'oklch(0.60 0.22 25 / 0.15)' : 'oklch(1 0 0 / 0.06)',
              border: recording ? '1px solid oklch(0.60 0.22 25 / 0.35)' : '1px solid oklch(1 0 0 / 0.10)',
              borderRadius: 7,
              color: recording ? 'var(--danger)' : 'var(--t2)',
              cursor: (isBusy || emojiMood == null || starting) ? 'not-allowed' : 'pointer',
              flexShrink: 0,
              fontSize: 14,
              opacity: starting ? 0.6 : 1,
              width: 32,
              height: 30,
            }}
          >
            {recording ? '■' : starting ? '…' : '🎙'}
          </button>

          <input ref={photoInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoChange} />
          <button
            onClick={() => (PHOTO_CAPTURE_ENABLED ? photoInputRef.current?.click() : setDemoNotice(PHOTO_OFF_MESSAGE))}
            disabled={isBusy || emojiMood == null || recording || starting}
            title="Upload photo/scan"
            style={{
              background: 'oklch(1 0 0 / 0.06)',
              border: '1px solid oklch(1 0 0 / 0.10)',
              borderRadius: 7,
              color: 'var(--t2)',
              cursor: (isBusy || emojiMood == null || recording || starting) ? 'not-allowed' : 'pointer',
              flexShrink: 0,
              fontSize: 14,
              opacity: (isBusy || emojiMood == null || recording || starting) ? 0.6 : 1,
              width: 32,
              height: 30,
            }}
          >
            📷
          </button>

          <button
            onClick={() => submit()}
            disabled={isBusy || emojiMood == null || !bodyText.trim() || recording || starting}
            style={{
              background: state === 'ok' ? 'oklch(0.67 0.19 165 / 0.12)' : state === 'err' ? 'oklch(0.60 0.22 25 / 0.12)' : 'oklch(1 0 0 / 0.06)',
              border: '1px solid oklch(1 0 0 / 0.10)',
              borderRadius: 7,
              color: saveColor,
              cursor: (isBusy || emojiMood == null || !bodyText.trim() || recording || starting) ? 'not-allowed' : 'pointer',
              flex: 1,
              fontSize: 11.5,
              fontWeight: 500,
              opacity: (isBusy || emojiMood == null || !bodyText.trim() || recording || starting) ? 0.6 : 1,
              padding: '0 10px',
              height: 30,
            }}
          >
            {saveLabel}
          </button>
        </div>

        {state === 'err' && errMsg && (
          <div style={{ color: 'var(--danger)', fontSize: 10.5, marginTop: 5 }}>{errMsg}</div>
        )}
        {demoNotice && (
          <div style={{ color: 'var(--t2)', fontSize: 11, lineHeight: 1.5, marginTop: 6 }}>{demoNotice}</div>
        )}
        {state === 'ok' && warnMsg && (
          <div style={{ color: 'var(--t3)', fontSize: 10.5, marginTop: 5 }}>{warnMsg}</div>
        )}
      </div>
    </Panel>
  )
}
