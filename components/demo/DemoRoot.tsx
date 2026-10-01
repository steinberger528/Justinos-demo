'use client'

import { useEffect, useSyncExternalStore } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { isAuthed, subscribeAuth } from '@/lib/demo/auth'
import { installDemoBackend } from '@/lib/demo/install'
import { DemoBanner } from './DemoBanner'
import { TelegramToasts } from './TelegramToasts'

// Runs once when this module loads in the browser, which is before any card's first
// effect. Every fetch('/api/...') after this point is answered by lib/demo.
installDemoBackend()

/**
 * Wraps every page. It does the two jobs the production middleware does on the server:
 * send signed-out visitors to /login, and let everything else through. It also mounts
 * the demo banner and the simulated Telegram messages.
 */
export function DemoRoot({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  // False on the server and during hydration, so signed-in content never renders
  // into the static HTML.
  const authed = useSyncExternalStore(subscribeAuth, isAuthed, () => false)
  const onLogin = pathname.startsWith('/login')

  useEffect(() => {
    // Read storage directly: during hydration `authed` still holds the server value.
    if (!onLogin && !isAuthed()) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`)
    }
  }, [authed, onLogin, pathname, router])

  if (onLogin) return <>{children}</>
  if (!authed) return <div style={{ minHeight: '100dvh' }} aria-busy="true" />

  return (
    <>
      <DemoBanner />
      {children}
      <TelegramToasts />
    </>
  )
}
