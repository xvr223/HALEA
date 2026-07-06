import { NextRequest, NextResponse } from 'next/server'
import { kv, kvEnabled, ADMIN_KEY } from '@/lib/kv'

// Shop products — stored in Redis so admin changes reach EVERY visitor:
//   halea:products      HASH  field = product id → JSON metadata (no file blob)
//   halea:pfile:{id}    STRING dataURL of the downloadable file (fetched on demand)
// Falls back to the old localStorage flow client-side when KV is not configured.

const KEY = 'halea:products'
const FILE = (id: string) => `halea:pfile:${id}`
const MAX_FILE = 950_000     // ~700KB file → base64; Upstash free tier caps request ~1MB
const MAX_THUMB = 250_000

function admin(req: NextRequest) { return req.headers.get('x-admin-key') === ADMIN_KEY }

interface ProductMeta {
  id: string; name: string; type: string; desc: string; price: number
  thumb?: string; fileExt?: string; credits?: number; created: number; hasFile?: boolean
}

function sanitize(body: Record<string, unknown>) {
  return {
    name: String(body.name || '').replace(/[<>]/g, '').trim().slice(0, 60),
    type: ['lut', 'preset', 'pack', 'credits'].includes(String(body.type)) ? String(body.type) : 'lut',
    desc: String(body.desc || '').replace(/[<>]/g, '').trim().slice(0, 300),
    price: Math.max(0, Math.min(9999, +(body.price as number) || 0)),
    credits: body.credits !== undefined ? Math.max(0, Math.min(100000, +(body.credits as number) || 0)) : undefined,
    thumb: typeof body.thumb === 'string' ? body.thumb : undefined,
    fileData: typeof body.fileData === 'string' ? body.fileData : undefined,
    fileExt: typeof body.fileExt === 'string' ? String(body.fileExt).slice(0, 10) : undefined,
  }
}

// GET — public: ?file=<id> → one product's downloadable file; else metadata list
export async function GET(req: NextRequest) {
  if (!kvEnabled) return NextResponse.json({ products: [], configured: false })
  try {
    const fileId = req.nextUrl.searchParams.get('file')
    if (fileId) {
      const data = await kv<string | null>(['GET', FILE(fileId)])
      if (!data) return NextResponse.json({ error: 'File tidak ditemukan' }, { status: 404 })
      return NextResponse.json({ fileData: data })
    }
    const flat = await kv<string[] | null>(['HGETALL', KEY]) || []
    const products: ProductMeta[] = []
    for (let i = 1; i < flat.length; i += 2) { try { products.push(JSON.parse(flat[i])) } catch {} }
    products.sort((a, b) => (b.created || 0) - (a.created || 0))
    return NextResponse.json({ products, configured: true })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'error', products: [] }, { status: 500 })
  }
}

// POST — admin: add a product
export async function POST(req: NextRequest) {
  if (!admin(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!kvEnabled) return NextResponse.json({ error: 'DB belum dikonfigurasi' }, { status: 503 })
  try {
    const s = sanitize(await req.json())
    if (!s.name) return NextResponse.json({ error: 'Nama produk wajib' }, { status: 400 })
    if (s.fileData && s.fileData.length > MAX_FILE) {
      return NextResponse.json({ error: 'File terlalu besar untuk DB (maks ~700KB)' }, { status: 413 })
    }
    if (s.thumb && s.thumb.length > MAX_THUMB) {
      return NextResponse.json({ error: 'Thumbnail terlalu besar' }, { status: 413 })
    }
    const id = 'p_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
    const meta: ProductMeta = {
      id, name: s.name, type: s.type, desc: s.desc, price: s.price,
      credits: s.credits, thumb: s.thumb, fileExt: s.fileExt,
      created: Date.now(), hasFile: !!s.fileData,
    }
    await kv(['HSET', KEY, id, JSON.stringify(meta)])
    if (s.fileData) await kv(['SET', FILE(id), s.fileData])
    return NextResponse.json({ ok: true, product: meta })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'error' }, { status: 500 })
  }
}

// PUT — admin: update a product (partial; new file/thumb only when provided)
export async function PUT(req: NextRequest) {
  if (!admin(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!kvEnabled) return NextResponse.json({ error: 'DB belum dikonfigurasi' }, { status: 503 })
  try {
    const body = await req.json()
    const id = String(body.id || '')
    const existing = await kv<string | null>(['HGET', KEY, id])
    if (!existing) return NextResponse.json({ error: 'Produk tidak ditemukan' }, { status: 404 })
    const s = sanitize(body)
    if (!s.name) return NextResponse.json({ error: 'Nama produk wajib' }, { status: 400 })
    if (s.fileData && s.fileData.length > MAX_FILE) {
      return NextResponse.json({ error: 'File terlalu besar untuk DB (maks ~700KB)' }, { status: 413 })
    }
    if (s.thumb && s.thumb.length > MAX_THUMB) {
      return NextResponse.json({ error: 'Thumbnail terlalu besar' }, { status: 413 })
    }
    const old: ProductMeta = JSON.parse(existing)
    const meta: ProductMeta = {
      ...old, name: s.name, type: s.type, desc: s.desc, price: s.price,
      credits: s.credits ?? old.credits,
      thumb: s.thumb ?? old.thumb,
      fileExt: s.fileExt ?? old.fileExt,
      hasFile: old.hasFile || !!s.fileData,
    }
    await kv(['HSET', KEY, id, JSON.stringify(meta)])
    if (s.fileData) await kv(['SET', FILE(id), s.fileData])
    return NextResponse.json({ ok: true, product: meta })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'error' }, { status: 500 })
  }
}

// DELETE — admin: remove product + its file
export async function DELETE(req: NextRequest) {
  if (!admin(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!kvEnabled) return NextResponse.json({ error: 'DB belum dikonfigurasi' }, { status: 503 })
  try {
    const { id } = await req.json()
    await kv(['HDEL', KEY, String(id)])
    await kv(['DEL', FILE(String(id))])
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'error' }, { status: 500 })
  }
}
