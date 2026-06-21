import { NextRequest, NextResponse } from 'next/server'
import { kv, kvEnabled, ADMIN_KEY } from '@/lib/kv'

const KEY = 'halea:waitlist'

// POST — public: join the waitlist (cross-device, stored in DB)
export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json()
    const e = String(email || '').trim().toLowerCase()
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) {
      return NextResponse.json({ error: 'Email tidak valid' }, { status: 400 })
    }
    if (!kvEnabled) return NextResponse.json({ ok: true, stored: false })   // fallback handled client-side
    await kv(['ZADD', KEY, Date.now(), e])   // sorted set dedupes by email, scored by time
    return NextResponse.json({ ok: true, stored: true })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'error' }, { status: 500 })
  }
}

// GET — admin: list all waitlist emails (newest first) + count
export async function GET(req: NextRequest) {
  if (req.headers.get('x-admin-key') !== ADMIN_KEY) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  if (!kvEnabled) return NextResponse.json({ entries: [], count: 0, configured: false })
  try {
    const flat = await kv<string[]>(['ZRANGE', KEY, '0', '-1', 'REV', 'WITHSCORES'])
    const entries: { email: string; ts: number }[] = []
    for (let i = 0; i < flat.length; i += 2) entries.push({ email: flat[i], ts: +flat[i + 1] })
    return NextResponse.json({ entries, count: entries.length, configured: true })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'error', entries: [], count: 0 }, { status: 500 })
  }
}
