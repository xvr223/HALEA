'use client'
import { useState, useRef, useEffect } from 'react'
import { Btn } from '@/components/ui'
import { Send, Trash2 } from 'lucide-react'

const SYSTEM = `Kamu adalah HALEA AI — asisten khusus color grading & video editing, dibuat untuk HALEA by @robbiesatriaa.

Keahlian:
- Color grading: LUT, log formats, tone curves, color theory, shot matching
- Software: Premiere Pro, DaVinci Resolve, After Effects, CapCut Pro  
- Film look: halation, grain, film emulation, teal & orange, bleach bypass
- HALEA app: LUT Studio, Grade Nodes, Halation Lab, AI Match
- Bisnis: jualan preset/LUT, pricing, marketing global market

Style: casual Indonesia, jawaban langsung & actionable, kasih angka/setting konkret. Ga perlu salam panjang.`

const QUICK = [
  'Apa itu halation dan kenapa bikin film look bagus?',
  'Bedain S-Log2 vs S-Log3, kapan pake masing-masing?',
  'Recipe color grading Teal & Orange di Grade Nodes?',
  'Cara apply LUT di Premiere Pro 2025?',
  'Gimana strategi harga preset LUT ke market global?',
  'Tips color grading footage F-Log2 dari Fujifilm?',
]

interface Msg { role: 'user' | 'assistant' | 'system'; text: string }
interface HistoryMsg { role: 'user' | 'assistant'; content: string }

export default function AIPage() {
  const [msgs, setMsgs] = useState<Msg[]>([
    { role: 'system', text: '🤖 HALEA AI — powered by Groq (Free)' },
    { role: 'assistant', text: 'Halo! Gw HALEA AI, second brain lo untuk color grading. Tanya soal LUT, film look, cara pakai HALEA, atau strategi jualan preset. 🎬' },
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [history, setHistory] = useState<HistoryMsg[]>([])
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [msgs])

  const send = async (msg: string) => {
    if (!msg.trim() || loading) return
    setInput('')
    setLoading(true)
    setMsgs(m => [...m, { role: 'user', text: msg }, { role: 'assistant', text: '...' }])

    const newHistory: HistoryMsg[] = [...history, { role: 'user', content: msg }]

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ system: SYSTEM, messages: newHistory }),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      const text = data.choices?.[0]?.message?.content
      if (!text) throw new Error('Response kosong')
      setMsgs(m => [...m.slice(0, -1), { role: 'assistant', text }])
      setHistory(([...newHistory, { role: 'assistant' as const, content: text }]).slice(-20))
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Unknown error'
      setMsgs(m => [...m.slice(0, -1), {
        role: 'assistant',
        text: msg.includes('GROQ_API_KEY') || msg.includes('belum di-set')
          ? '⚠️ **GROQ_API_KEY belum di-set.**\n\nDaftar gratis di `console.groq.com` → buat API key → tambah ke Vercel env vars:\n`GROQ_API_KEY=gsk_...`'
          : `❌ ${msg}`
      }])
    }
    setLoading(false)
  }

  return (
    <div className="max-w-3xl mx-auto px-4 h-[calc(100vh-56px)] flex flex-col py-4">

      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="font-fraunces text-2xl font-semibold">HALEA <span className="italic text-a4">AI</span></h1>
          <p className="text-t3 text-xs font-mono">Powered by Gemini 2.0 Flash · Free</p>
        </div>
        <button onClick={() => { setMsgs(m => m.slice(0, 2)); setHistory([]) }}
          className="p-2 rounded-lg text-t3 hover:text-err hover:bg-err/10 transition-colors">
          <Trash2 size={16} />
        </button>
      </div>

      {/* Chat */}
      <div className="flex-1 overflow-y-auto flex flex-col gap-3 py-2">
        {msgs.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : m.role === 'system' ? 'justify-center' : 'justify-start'}`}>
            {m.role === 'system' ? (
              <span className="text-[10px] text-t3 font-mono bg-s2 border border-b1 px-3 py-1 rounded-full">{m.text}</span>
            ) : (
              <div className={`max-w-[85%] px-4 py-3 rounded-2xl text-sm leading-relaxed ${
                m.role === 'user' ? 'bg-s4 border border-b2 text-txt' : 'bg-a4/10 border border-a4/20 text-txt'
              }`}>
                {m.text === '...' ? (
                  <span className="flex gap-1 py-1">
                    {[0,1,2].map(i => <span key={i} className="w-1.5 h-1.5 bg-a4/50 rounded-full animate-bounce" style={{ animationDelay: `${i*0.15}s` }} />)}
                  </span>
                ) : (
                  <span dangerouslySetInnerHTML={{ __html: m.text
                    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
                    .replace(/\*\*(.*?)\*\*/g,'<strong class="text-a4">$1</strong>')
                    .replace(/`(.*?)`/g,'<code class="bg-s3 px-1.5 py-0.5 rounded text-a2 text-[11px] font-mono">$1</code>')
                    .replace(/\n/g,'<br>')
                  }} />
                )}
              </div>
            )}
          </div>
        ))}
        <div ref={endRef} />
      </div>

      {/* Quick buttons */}
      <div className="flex flex-wrap gap-1.5 py-3">
        {QUICK.map(q => (
          <button key={q} onClick={() => send(q)} disabled={loading}
            className="text-[10px] px-3 py-1.5 rounded-full border border-b2 bg-s2 text-t2 hover:border-a4/50 hover:text-a4 transition-colors font-medium disabled:opacity-40">
            {q.length > 35 ? q.slice(0, 35) + '…' : q}
          </button>
        ))}
      </div>

      {/* Input */}
      <div className="flex gap-2">
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input) } }}
          placeholder="Tanya soal color grading, film look, bisnis preset..."
          rows={2}
          disabled={loading}
          className="flex-1 bg-s2 border border-b1 text-txt px-4 py-3 rounded-xl text-sm outline-none focus:border-a4 transition-colors resize-none disabled:opacity-50"
        />
        <Btn variant="ai" onClick={() => send(input)} loading={loading} className="px-4 self-end">
          {!loading && <Send size={15} />}
        </Btn>
      </div>
    </div>
  )
}
