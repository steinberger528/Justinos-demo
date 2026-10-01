'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

// Bare /crm resolves to Executive, so the URL a KPI tile deep-links back to stays
// stable. Done on the client because a static export has no server to redirect from.
export default function CrmPage() {
  const router = useRouter()
  useEffect(() => { router.replace('/crm/executive') }, [router])
  return null
}
