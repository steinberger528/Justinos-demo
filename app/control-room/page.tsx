'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

// Bare /control-room opens the walkthrough. Done on the client because a static
// export has no server to redirect from.
export default function ControlRoomPage() {
  const router = useRouter()
  useEffect(() => { router.replace('/control-room/overview') }, [router])
  return null
}
