'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'

/** Where to go after signing in: the page the visitor was sent here from, or Home. */
function destination(): string {
  const next = new URLSearchParams(window.location.search).get('next')
  return next && next.startsWith('/') && !next.startsWith('//') ? next : '/'
}

export function LoginForm() {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })

      if (res.ok) {
        router.push(destination())
      } else {
        const data = (await res.json()) as { error?: string }
        setError(data.error ?? 'Invalid password')
        setPassword('')
        inputRef.current?.focus()
      }
    } catch {
      setError('Network error. Try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex w-full max-w-sm flex-col gap-5"
    >
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="password"
          className="text-sm font-medium text-ink-1"
        >
          Password
        </label>
        <input
          ref={inputRef}
          id="password"
          type="password"
          autoComplete="off"
          autoFocus
          required
          value={password}
          onChange={e => setPassword(e.target.value)}
          placeholder="Enter dashboard password"
          className="
            w-full rounded-lg border border-ink-3 bg-ink-3/20
            px-3.5 py-2.5 text-ink-0 placeholder:text-ink-2
            outline-none transition
            focus:border-accent focus:ring-2 focus:ring-accent-dim
            disabled:opacity-50
          "
          disabled={loading}
        />
        {error && (
          <p className="text-sm text-danger" role="alert">
            {error}
          </p>
        )}
      </div>

      <button
        type="submit"
        disabled={loading || password.length === 0}
        className="
          rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-ink-0
          transition hover:opacity-90 active:scale-[0.98]
          disabled:cursor-not-allowed disabled:opacity-40
        "
      >
        {loading ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  )
}
