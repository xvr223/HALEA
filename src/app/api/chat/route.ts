import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const key = process.env.GROQ_API_KEY
  if (!key) {
    return NextResponse.json(
      { error: 'GROQ_API_KEY belum di-set. Daftar gratis di console.groq.com' },
      { status: 500 }
    )
  }

  try {
    const { system, messages, max_tokens = 1024 } = await req.json()
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        messages: [{ role: 'system', content: system }, ...messages],
        max_tokens,
        temperature: 0.7,
      }),
    })
    const data = await res.json()
    if (!res.ok) {
      return NextResponse.json({ error: data?.error?.message || `Error ${res.status}` }, { status: res.status })
    }
    return NextResponse.json(data)
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Unknown error' }, { status: 500 })
  }
}
