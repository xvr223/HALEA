// Minimal Upstash Redis REST client (zero dependency, works on Vercel/any host).
// Accepts either Upstash's native env names OR Vercel KV names — set whichever:
//   UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN   (Upstash default)
//   KV_REST_API_URL        / KV_REST_API_TOKEN          (Vercel KV)
// When unset, the app gracefully falls back to localStorage/env (dev mode).
const URL   = process.env.UPSTASH_REDIS_REST_URL  || process.env.KV_REST_API_URL
const TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN

export const kvEnabled = !!(URL && TOKEN)

// Admin write auth — defaults to the app's admin password, override with env
export const ADMIN_KEY = process.env.ADMIN_KEY || 'halea2025'

export async function kv<T = unknown>(cmd: (string | number)[]): Promise<T> {
  if (!kvEnabled) throw new Error('KV_NOT_CONFIGURED')
  const res = await fetch(URL!, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(cmd),
    cache: 'no-store',
  })
  const j = await res.json()
  if (!res.ok || j.error) throw new Error(j.error || `KV ${res.status}`)
  return j.result as T
}
