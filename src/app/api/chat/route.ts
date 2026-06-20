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
    const { system, messages, max_tokens = 1024, model, temperature = 0.7, json } = await req.json()
    // allowlist — default chat uses fast 8B; AI Look uses the smarter 70B
    const MODELS = ['llama-3.1-8b-instant', 'llama-3.3-70b-versatile']
    const chosen = MODELS.includes(model) ? model : 'llama-3.1-8b-instant'
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: chosen,
        messages: [{ role: 'system', content: system }, ...messages],
        max_tokens,
        temperature,
        ...(json ? { response_format: { type: 'json_object' } } : {}),
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
