// Launch gating + waitlist — backed by the DB (Upstash KV) via API routes,
// with localStorage/env fallback so dev & un-configured deploys still work.
export const GLOBAL_LAUNCHED = process.env.NEXT_PUBLIC_LAUNCHED === 'true'

export const PREVIEW_KEY  = 'halea_launch_preview'   // admin-only local override ('live')
export const WAITLIST_KEY = 'halea_waitlist'         // local fallback cache of emails
export const LIVE_CACHE   = 'halea_live_cache'       // last-known global launch state (anti-flash)
export const ADMIN_KEY_LS = 'halea_admin_key'        // admin key for protected API calls

export interface WaitEntry { email: string; ts: number }

// ── Global launch state (DB) ──────────────────────────────────────────────────
export async function fetchLaunched(): Promise<boolean> {
  try {
    const r = await fetch('/api/launch', { cache: 'no-store' })
    const j = await r.json()
    return !!j.launched
  } catch { return GLOBAL_LAUNCHED }
}
export function cachedLive(): boolean {
  try { const v = localStorage.getItem(LIVE_CACHE); if (v !== null) return v === '1' } catch {}
  return GLOBAL_LAUNCHED
}
export function setCachedLive(v: boolean) {
  try { localStorage.setItem(LIVE_CACHE, v ? '1' : '0') } catch {}
}

export function getAdminKey(): string {
  try { return localStorage.getItem(ADMIN_KEY_LS) || 'halea2025' } catch { return 'halea2025' }
}
export async function setLaunched(launched: boolean): Promise<{ ok: boolean; error?: string }> {
  try {
    const r = await fetch('/api/launch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-key': getAdminKey() },
      body: JSON.stringify({ launched }),
    })
    const j = await r.json()
    if (!r.ok) return { ok: false, error: j.error || 'Gagal' }
    setCachedLive(launched)
    return { ok: true }
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : 'error' } }
}

// ── Waitlist ──────────────────────────────────────────────────────────────────
export async function joinWaitlist(email: string): Promise<boolean> {
  const e = email.trim().toLowerCase()
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) return false
  // local cache (instant UX + fallback)
  try {
    const list: WaitEntry[] = JSON.parse(localStorage.getItem(WAITLIST_KEY) || '[]')
    if (!list.some(x => x.email === e)) { list.push({ email: e, ts: Date.now() }); localStorage.setItem(WAITLIST_KEY, JSON.stringify(list)) }
  } catch {}
  try { await fetch('/api/waitlist', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: e }) }) } catch {}
  return true
}
export async function fetchWaitlist(): Promise<{ entries: WaitEntry[]; configured: boolean }> {
  try {
    const r = await fetch('/api/waitlist', { headers: { 'x-admin-key': getAdminKey() }, cache: 'no-store' })
    const j = await r.json()
    return { entries: j.entries || [], configured: !!j.configured }
  } catch { return { entries: [], configured: false } }
}
// local fallback list (when DB off)
export function getLocalWaitlist(): WaitEntry[] {
  try { return JSON.parse(localStorage.getItem(WAITLIST_KEY) || '[]') } catch { return [] }
}
