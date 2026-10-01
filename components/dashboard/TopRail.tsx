'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import { OPERATOR } from '@/lib/demo/config'

const TABS = [
  { label: 'Control Room', href: '/control-room' },
  { label: 'Home',    href: '/' },
  { label: 'CRM',     href: '/crm' },
  { label: 'School',  href: '/school' },
  { label: 'Journal', href: '/journal' },
  { label: 'Health',  href: '/health' },
] as const

// WMO weather codes (Open-Meteo `current_weather.weathercode`) collapsed to a short label.
function describeWeatherCode(code: number): string {
  if (code === 0) return 'Clear'
  if (code === 1 || code === 2) return 'Partly Cloudy'
  if (code === 3) return 'Cloudy'
  if (code === 45 || code === 48) return 'Fog'
  if (code >= 51 && code <= 57) return 'Drizzle'
  if (code >= 61 && code <= 67) return 'Rain'
  if (code >= 71 && code <= 77) return 'Snow'
  if (code >= 80 && code <= 82) return 'Showers'
  if (code >= 85 && code <= 86) return 'Snow Showers'
  if (code >= 95) return 'Storms'
  return 'Sunny'
}

function useLiveDate(): string {
  const [label, setLabel] = useState('')

  useEffect(() => {
    const update = () => {
      setLabel(
        new Date()
          .toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
          .toUpperCase(),
      )
    }
    update()
    const id = setInterval(update, 60_000)
    return () => clearInterval(id)
  }, [])

  return label
}

/**
 * Live weather for the top rail and the Briefing modal. Production asks the browser
 * for the operator's position and reverse-geocodes it. The demo never asks a visitor
 * for their location: it reads the weather for one fixed city instead.
 */
export function useLiveLocationAndWeather(): { location: string; weather: string | null } {
  const [weather, setWeather] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${OPERATOR.latitude}&longitude=${OPERATOR.longitude}&current_weather=true&temperature_unit=fahrenheit`,
    )
      .then(res => {
        if (!res.ok) throw new Error(`weather fetch failed: ${res.status}`)
        return res.json()
      })
      .then(data => {
        if (cancelled) return
        const temp = Math.round(data.current_weather.temperature)
        setWeather(`${temp}°F · ${describeWeatherCode(data.current_weather.weathercode)}`)
      })
      .catch(() => {
        if (!cancelled) setWeather(null)
      })
    return () => {
      cancelled = true
    }
  }, [])

  return { location: OPERATOR.location, weather }
}

export function TopRail() {
  const pathname = usePathname()
  const dateLabel = useLiveDate()
  const { location, weather: weatherLabel } = useLiveLocationAndWeather()

  return (
    <nav
      className="sticky top-0 z-50 flex items-center justify-between gap-3 md:gap-5 h-14 md:h-16"
      style={{
        marginInline: 'calc(var(--gutter) * -1)',
        paddingInline: 'calc(var(--gutter) + 2px)',
        background: 'oklch(0.10 0.022 255 / 0.82)',
        borderBottom: '1px solid var(--ui-border)',
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
      }}
    >
      {/* Logo + avatar. The avatar is the way into Settings — no gear icon. */}
      <div className="flex items-center gap-[10px] flex-shrink-0">
        <Link
          href="/settings"
          title="Settings"
          aria-label="Settings"
          aria-current={pathname.startsWith('/settings') ? 'page' : undefined}
          className="flex items-center justify-center rounded-[8px] text-[12px] font-semibold tracking-[0.02em] flex-shrink-0 transition-[box-shadow,border-color]"
          style={{
            width: '34px',
            height: '34px',
            fontFamily: 'var(--font-jetbrains-mono, monospace)',
            background: 'oklch(0.18 0.03 165 / 0.7)',
            border: `1px solid oklch(0.67 0.19 165 / ${pathname.startsWith('/settings') ? '0.85' : '0.35'})`,
            color: 'var(--acy)',
            boxShadow: `0 0 16px oklch(0.67 0.19 165 / ${pathname.startsWith('/settings') ? '0.3' : '0.12'})`,
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = 'oklch(0.67 0.19 165 / 0.85)'; e.currentTarget.style.boxShadow = '0 0 16px oklch(0.67 0.19 165 / 0.3)' }}
          onMouseLeave={e => {
            const on = pathname.startsWith('/settings')
            e.currentTarget.style.borderColor = `oklch(0.67 0.19 165 / ${on ? '0.85' : '0.35'})`
            e.currentTarget.style.boxShadow = `0 0 16px oklch(0.67 0.19 165 / ${on ? '0.3' : '0.12'})`
          }}
        >
          {OPERATOR.initials}
        </Link>
        <div
          className="hidden sm:block font-mono text-[17px] font-semibold tracking-[0.07em] whitespace-nowrap"
          style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)' }}
        >
          JUSTIN
          <em className="not-italic" style={{ color: 'var(--acy)' }}>OS</em>
        </div>
      </div>

      {/* Tabs — scroll sideways instead of overflowing the page on narrow screens */}
      <div className="flex gap-0.5 items-center min-w-0 overflow-x-auto [scrollbar-width:none]">
        {TABS.map(tab => {
          const active = tab.href === '/' ? pathname === '/' : pathname.startsWith(tab.href)
          return (
            <Link
              key={tab.label}
              href={tab.href}
              className={cn(
                'px-[10px] md:px-[14px] py-[6px] rounded-[7px] text-[14px] flex-shrink-0 font-medium whitespace-nowrap transition-colors duration-150 border',
                active
                  ? 'border-[var(--ui-border)] text-[var(--t1)]'
                  : 'border-transparent text-[var(--t2)] hover:text-[var(--t1)]',
              )}
              style={
                active
                  ? { background: 'oklch(1 0 0 / 0.09)' }
                  : undefined
              }
            >
              {tab.label}
            </Link>
          )
        })}
      </div>

      {/* Right info strip */}
      <div
        className="hidden lg:flex items-center gap-[18px] flex-shrink-0 text-[12.5px]"
        style={{
          fontFamily: 'var(--font-jetbrains-mono, monospace)',
          color: 'var(--t2)',
        }}
      >
        {/* Date */}
        <span className="flex items-center gap-[5px]">
          <svg width="13" height="13" viewBox="0 0 12 12" fill="none" className="opacity-50">
            <rect x="1" y="2" width="10" height="9" rx="1.5" stroke="currentColor" strokeWidth="1"/>
            <path d="M1 5h10M4 1v2M8 1v2" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/>
          </svg>
          {dateLabel || '—'}
        </span>

        {/* Location */}
        <span className="flex items-center gap-[5px]">
          <svg width="10" height="13" viewBox="0 0 9 12" fill="none" className="opacity-50">
            <path d="M4.5 1C2.57 1 1 2.57 1 4.5 1 7.25 4.5 11 4.5 11S8 7.25 8 4.5C8 2.57 6.43 1 4.5 1z" stroke="currentColor" strokeWidth="1"/>
            <circle cx="4.5" cy="4.5" r="1.2" stroke="currentColor" strokeWidth="1"/>
          </svg>
          {location}
        </span>

        {/* Weather */}
        <span className="flex items-center gap-[5px]">
          <svg width="14" height="14" viewBox="0 0 13 13" fill="none" className="opacity-50">
            <circle cx="6.5" cy="6.5" r="2.5" stroke="currentColor" strokeWidth="1"/>
            <path d="M6.5 1v1.5M6.5 10.5V12M1 6.5h1.5M10.5 6.5H12M2.64 2.64l1.06 1.06M9.3 9.3l1.06 1.06M9.3 3.7 8.24 4.76M3.7 9.3 2.64 10.36" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/>
          </svg>
          {weatherLabel || '—'}
        </span>
      </div>
    </nav>
  )
}
