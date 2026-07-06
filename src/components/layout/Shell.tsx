'use client'
import { usePathname } from 'next/navigation'
import { useState, useEffect } from 'react'
import { Navbar } from './Navbar'
import { Waitlist } from '../Waitlist'
import { useAuthStore } from '@/store/auth'
import { GLOBAL_LAUNCHED, PREVIEW_KEY, fetchLaunched, cachedLive, setCachedLive } from '@/lib/launch'
import { detectLocale } from '@/lib/i18n'

// Pre-launch gate: until launched, every visitor sees only the waitlist landing.
// Global launch state comes from the DB (/api/launch); admin (logged in) and the
// /login route stay reachable so the site can be managed & previewed.
export function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname()
  const user = useAuthStore(s => s.user)
  const [mounted, setMounted] = useState(false)
  const [preview, setPreview] = useState(false)
  const [dbLive, setDbLive] = useState<boolean | null>(null)

  useEffect(() => {
    setMounted(true)
    detectLocale()   // EN for foreign browsers, ID for Indonesian — manual toggle wins
    try { setPreview(localStorage.getItem(PREVIEW_KEY) === 'live') } catch {}
    setDbLive(cachedLive())                                   // instant from cache (no flash)
    fetchLaunched().then(v => { setDbLive(v); setCachedLive(v) })   // authoritative from DB
  }, [])

  const isAdmin = user?.role === 'admin'
  const globalLive = dbLive === null ? GLOBAL_LAUNCHED : dbLive
  const isLive = globalLive || (mounted && (preview || isAdmin))

  // gated routes that stay open pre-launch (admin entry + dashboard)
  const adminArea = path === '/login' || path.startsWith('/admin')

  if (!isLive && !adminArea) {
    return <main className="flex-1"><Waitlist /></main>
  }

  // navbar everywhere except the standalone waitlist landing
  const showNav = path !== '/waitlist'
  return (
    <>
      {showNav && <Navbar />}
      <main className="flex-1">{children}</main>
    </>
  )
}
