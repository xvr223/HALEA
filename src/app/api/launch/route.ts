import { NextRequest, NextResponse } from 'next/server'
import { kv, kvEnabled, ADMIN_KEY } from '@/lib/kv'

const KEY = 'halea:launched'

// GET — public: is HALEA live? (read by every visitor's Shell gate)
export async function GET() {
  if (!kvEnabled) {
    return NextResponse.json({ launched: process.env.NEXT_PUBLIC_LAUNCHED === 'true', configured: false })
  }
  try {
    const v = await kv<string | null>(['GET', KEY])
    return NextResponse.json({ launched: v === '1', configured: true })
  } catch {
    return NextResponse.json({ launched: process.env.NEXT_PUBLIC_LAUNCHED === 'true', configured: false })
  }
}

// POST — admin: flip the global launch switch (one click from dashboard)
export async function POST(req: NextRequest) {
  if (req.headers.get('x-admin-key') !== ADMIN_KEY) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  if (!kvEnabled) {
    return NextResponse.json({ error: 'Database belum terhubung. Set KV_REST_API_URL & KV_REST_API_TOKEN di Vercel.' }, { status: 503 })
  }
  try {
    const { launched } = await req.json()
    await kv(['SET', KEY, launched ? '1' : '0'])
    return NextResponse.json({ launched: !!launched })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'error' }, { status: 500 })
  }
}
