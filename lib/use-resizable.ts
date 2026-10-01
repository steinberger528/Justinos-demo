'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

export interface ResizableSize {
  width: number
  height: number
}

export type ResizeHandle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'

const VIEWPORT_MARGIN = 48

const CURSOR_FOR_HANDLE: Record<ResizeHandle, string> = {
  n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize',
  ne: 'nesw-resize', sw: 'nesw-resize', nw: 'nwse-resize', se: 'nwse-resize',
}

function clampToViewport(size: ResizableSize, minWidth: number, minHeight: number): ResizableSize {
  if (typeof window === 'undefined') return size
  return {
    width: Math.max(minWidth, Math.min(size.width, window.innerWidth - VIEWPORT_MARGIN)),
    height: Math.max(minHeight, Math.min(size.height, window.innerHeight - VIEWPORT_MARGIN)),
  }
}

function loadSize(key: string): ResizableSize | null {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<ResizableSize>
    if (typeof parsed.width === 'number' && typeof parsed.height === 'number') {
      return { width: parsed.width, height: parsed.height }
    }
  } catch {
    // corrupt or unavailable storage — fall through to default size
  }
  return null
}

function saveSize(key: string, size: ResizableSize) {
  try {
    localStorage.setItem(key, JSON.stringify(size))
  } catch {
    // storage unavailable (private mode, quota) — resizing still works for this session
  }
}

/**
 * Drag-to-resize from any edge or corner. The resulting size is persisted to
 * localStorage under `storageKey` so a window reopens at whatever size it was
 * last left — same as resizing a normal OS window.
 */
export function useResizable(
  storageKey: string,
  defaultSize: ResizableSize,
  minSize: ResizableSize = { width: 360, height: 280 },
) {
  const [size, setSize] = useState<ResizableSize>(defaultSize)

  // Mirrors of the latest state into refs so the pointer-event handlers below
  // (added/removed on `document`, outside React's render cycle) always read
  // fresh values without needing to be re-subscribed on every change.
  const sizeRef = useRef(size)
  useEffect(() => { sizeRef.current = size }, [size])
  const minSizeRef = useRef(minSize)
  useEffect(() => { minSizeRef.current = minSize })
  const storageKeyRef = useRef(storageKey)
  useEffect(() => { storageKeyRef.current = storageKey })

  // Restore a saved size once per storage key, clamping it (or the untouched
  // default, if this window has never been resized before) to the current
  // viewport — a `defaultSize` taller/wider than the screen must not be left
  // to render off-screen just because there's nothing saved yet to clamp.
  // Deferred to a microtask — same react-hooks/set-state-in-effect workaround
  // used elsewhere in this codebase (e.g. FlaggedMessagesModal) — since a
  // direct setState call reachable from an effect body is flagged even though
  // this one only runs once per mount/key change.
  useEffect(() => {
    queueMicrotask(() => {
      const saved = loadSize(storageKey)
      setSize(clampToViewport(saved ?? defaultSize, minSize.width, minSize.height))
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey])

  const dragRef = useRef<{ handle: ResizeHandle; startX: number; startY: number; startW: number; startH: number } | null>(null)

  const onPointerMove = useCallback((e: PointerEvent) => {
    const d = dragRef.current
    if (!d) return
    const dx = e.clientX - d.startX
    const dy = e.clientY - d.startY
    let width = d.startW
    let height = d.startH
    if (d.handle.includes('e')) width = d.startW + dx
    if (d.handle.includes('w')) width = d.startW - dx
    if (d.handle.includes('s')) height = d.startH + dy
    if (d.handle.includes('n')) height = d.startH - dy
    setSize(clampToViewport({ width, height }, minSizeRef.current.width, minSizeRef.current.height))
  }, [])

  // Held in refs (not passed by identity to add/removeEventListener directly)
  // so stopResize never needs to reference its own useCallback binding —
  // referencing a const inside its own initializer trips
  // react-hooks/immutability even though the closure is only invoked later.
  const onPointerMoveRef = useRef(onPointerMove)
  useEffect(() => { onPointerMoveRef.current = onPointerMove }, [onPointerMove])
  const onPointerUpRef = useRef<() => void>(() => {})

  const stopResize = useCallback(() => {
    if (!dragRef.current) return
    dragRef.current = null
    document.removeEventListener('pointermove', onPointerMoveRef.current)
    document.removeEventListener('pointerup', onPointerUpRef.current)
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
    saveSize(storageKeyRef.current, sizeRef.current)

    // A resize drag ends with the browser synthesizing a trailing `click`
    // from the same mousedown/mouseup pair, targeted at whatever's hit-tested
    // under the cursor at release — often the backdrop once the drag has
    // pulled the cursor past the dialog's (one-frame-stale) edge. Every modal
    // using this hook closes on a backdrop click, so left alone that trailing
    // click immediately closes the window that was just resized. Swallow
    // exactly one click at the capture phase — before it reaches any React
    // onClick — then detach; the timeout is a safety net for the case where
    // no click follows at all (e.g. the mouseup landed outside the window).
    const swallowClick = (e: MouseEvent) => {
      e.stopPropagation()
      e.preventDefault()
      document.removeEventListener('click', swallowClick, true)
    }
    document.addEventListener('click', swallowClick, true)
    setTimeout(() => document.removeEventListener('click', swallowClick, true), 300)
  }, [])
  useEffect(() => { onPointerUpRef.current = stopResize }, [stopResize])

  const startResize = useCallback((handle: ResizeHandle) => (e: React.PointerEvent) => {
    if (e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()
    dragRef.current = { handle, startX: e.clientX, startY: e.clientY, startW: sizeRef.current.width, startH: sizeRef.current.height }
    document.addEventListener('pointermove', onPointerMoveRef.current)
    document.addEventListener('pointerup', onPointerUpRef.current)
    document.body.style.cursor = CURSOR_FOR_HANDLE[handle]
    document.body.style.userSelect = 'none'
  }, [])

  useEffect(() => () => {
    document.removeEventListener('pointermove', onPointerMoveRef.current)
    document.removeEventListener('pointerup', onPointerUpRef.current)
  }, [])

  return { size, startResize }
}
