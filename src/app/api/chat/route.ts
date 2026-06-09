import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const key = process.env.GEMINI_API_KEY
  if (!key) {
    return NextResponse.json(
      { error: 'GEMINI_API_KEY belum di-set. Tambah di .env.local atau Vercel env vars.' },
      { status: 500 }
    )
  }

  try {
    const { model = 'gemini-2.0-flash', ...body } = await req.json()
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
    )
    const data = await res.json()
    if (!res.ok) {
      const msg = data?.error?.message || `Gemini API error (${res.status})`
      return NextResponse.json({ error: msg }, { status: res.status })
    }
    return NextResponse.json(data)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
