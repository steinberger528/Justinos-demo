import type { Metadata } from 'next'
import { DEMO_PASSWORD } from '@/lib/demo/auth'
import { REPO_URL } from '@/lib/demo/config'
import { LoginForm } from './LoginForm'

export const metadata: Metadata = { title: 'Sign in · JustinOS demo' }

export default function LoginPage() {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center px-4 py-10">
      <div className="mb-7 text-center">
        <h1
          className="text-3xl font-semibold tracking-[0.07em] text-ink-0"
          style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)' }}
        >
          JUSTIN<span style={{ color: 'var(--acy)' }}>OS</span>
        </h1>
        <p className="mt-2 text-sm text-ink-1">A personal AI operating system</p>
      </div>

      <div className="login-hint" role="note">
        This is a live demo. The password is <code>{DEMO_PASSWORD}</code>.
        <br />
        Everything inside is sample data, and anything you change stays in your browser.
      </div>

      <LoginForm />

      <p className="mt-8 max-w-sm text-center text-xs leading-relaxed text-ink-2">
        The real dashboard sits behind this same screen, with a signed cookie checked on every request.{' '}
        <a href={REPO_URL} target="_blank" rel="noreferrer" className="underline hover:text-ink-1">
          Read how it works on GitHub
        </a>
        .
      </p>
    </main>
  )
}
