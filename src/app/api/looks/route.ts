import { NextRequest, NextResponse } from 'next/server'
import { kv, kvEnabled, ADMIN_KEY } from '@/lib/kv'

// Look Library — community looks, stored in Redis:
//   halea:looks       ZSET  member = JSON {id,name,code,author,ts}, score = ts
//   halea:looks:likes HASH  field  = look id → like count
// Looks are free to browse & use — exports still cost credits (the economy).

const KEY = 'halea:looks'
const LIKES = 'halea:looks:likes'
const MAX_LOOKS = 500

export interface LookEntry {
  id: string; name: string; code: string; author: string; ts: number; likes: number
}

// GET — public: newest looks (client sorts by likes for "Populer")
export async function GET() {
  if (!kvEnabled) return NextResponse.json({ looks: [], configured: false })
  try {
    const members = await kv<string[]>(['ZRANGE', KEY, '0', '-1', 'REV'])
    const likesFlat = await kv<string[] | null>(['HGETALL', LIKES]) || []
    const likes: Record<string, number> = {}
    for (let i = 0; i < likesFlat.length; i += 2) likes[likesFlat[i]] = +likesFlat[i + 1] || 0
    const looks: LookEntry[] = []
    for (const m of members) {
      try {
        const j = JSON.parse(m)
        looks.push({ id: j.id, name: j.name, code: j.code, author: j.author, ts: j.ts, likes: likes[j.id] || 0 })
      } catch {}
    }
    return NextResponse.json({ looks, configured: true })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'error', looks: [] }, { status: 500 })
  }
}

// POST — public: publish a look, or like one ({ like: id })
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    // ── like ──
    if (body.like) {
      const id = String(body.like).slice(0, 40)
      if (!/^lk[a-z0-9]+$/.test(id)) return NextResponse.json({ error: 'bad id' }, { status: 400 })
      if (!kvEnabled) return NextResponse.json({ ok: true, stored: false })
      const n = await kv<number>(['HINCRBY', LIKES, id, 1])
      return NextResponse.json({ ok: true, likes: n })
    }

    // ── publish ──
    const name = String(body.name || '').replace(/[<>]/g, '').trim().slice(0, 40)
    const author = String(body.author || '').replace(/[<>]/g, '').trim().slice(0, 24)
    const code = String(body.code || '').trim()
    if (!name || !author) return NextResponse.json({ error: 'Nama look & author wajib' }, { status: 400 })
    if (!/^HALEA:[A-Za-z0-9_-]{8,600}$/.test(code)) {
      return NextResponse.json({ error: 'HALEA Code tidak valid' }, { status: 400 })
    }
    if (!kvEnabled) return NextResponse.json({ ok: true, stored: false })
    const ts = Date.now()
    const id = 'lk' + ts.toString(36) + Math.random().toString(36).slice(2, 6)
    await kv(['ZADD', KEY, ts, JSON.stringify({ id, name, code, author, ts })])
    await kv(['ZREMRANGEBYRANK', KEY, 0, -(MAX_LOOKS + 1)])   // keep newest N
    return NextResponse.json({ ok: true, id, stored: true })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'error' }, { status: 500 })
  }
}

// DELETE — admin: remove a look (moderation)
export async function DELETE(req: NextRequest) {
  if (req.headers.get('x-admin-key') !== ADMIN_KEY) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  if (!kvEnabled) return NextResponse.json({ ok: false, configured: false })
  try {
    const { id } = await req.json()
    const members = await kv<string[]>(['ZRANGE', KEY, '0', '-1'])
    for (const m of members) {
      try {
        if (JSON.parse(m).id === id) {
          await kv(['ZREM', KEY, m])
          await kv(['HDEL', LIKES, id])
          return NextResponse.json({ ok: true })
        }
      } catch {}
    }
    return NextResponse.json({ error: 'not found' }, { status: 404 })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'error' }, { status: 500 })
  }
}
