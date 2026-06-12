'use client'
import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/auth'
import { useSettingsStore } from '@/store/settings'
import { toast } from '@/components/ui'
import { Send, Trash2, Sparkles } from 'lucide-react'

const SYSTEM = `Kamu adalah HALEA AI — asisten khusus color grading & video editing, dibuat untuk HALEA by @haleastudio.

Keahlian:
- Color grading: LUT, log formats, tone curves, color theory, shot matching
- Software: Premiere Pro, DaVinci Resolve, After Effects, CapCut Pro
- Film look: halation, grain, film emulation, teal & orange, bleach bypass
- HALEA app: LUT Studio, Grade Nodes, Halation Lab, AI Match
- Bisnis: jualan preset/LUT, pricing, marketing global market

Style: casual Indonesia, jawaban langsung & actionable, kasih angka/setting konkret. Ga perlu salam panjang.`

const QUICK = [
  'Apa itu halation?',
  'S-Log2 vs S-Log3?',
  'Recipe Teal & Orange',
  'Apply LUT di Premiere',
  'Harga preset LUT',
  'F-Log2 color grade',
]

interface Msg { role: 'user' | 'assistant' | 'system'; text: string }
interface HistoryMsg { role: 'user' | 'assistant'; content: string }

export default function AIPage() {
  const [msgs, setMsgs] = useState<Msg[]>([
    { role: 'system', text: '✦ HALEA AI — Color Grading Expert' },
    { role: 'assistant', text: 'Halo! Gw HALEA AI, second brain lo untuk color grading. Tanya soal LUT, film look, cara pakai HALEA, atau strategi jualan preset. 🎬' },
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [history, setHistory] = useState<HistoryMsg[]>([])
  const endRef   = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const router = useRouter()
  const { user: authUser, credits, useCredit, addCredits } = useAuthStore()
  const aiChatCost = useSettingsStore(s => s.aiChatCost)
  const isAdmin = authUser?.role === 'admin'

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [msgs])

  const send = async (msg: string) => {
    if (!msg.trim() || loading) return
    if (!authUser) {
      toast('Daftar gratis dulu untuk chat dengan HALEA AI ✦', 'warn')
      router.push('/login?next=/ai')
      return
    }
    if (!useCredit(aiChatCost)) {
      toast(`Kredit AI habis — chat butuh ${aiChatCost} kredit. Beli di Shop 🛍`, 'err')
      return
    }
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
      if (!isAdmin) addCredits(aiChatCost)   // refund — pesan gagal terkirim
      const errMsg = e instanceof Error ? e.message : 'Unknown error'
      setMsgs(m => [...m.slice(0, -1), {
        role: 'assistant',
        text: errMsg.includes('GROQ_API_KEY') || errMsg.includes('belum di-set') || errMsg.includes('API key')
          ? '⚠️ **Layanan AI sedang tidak tersedia.**\n\nKredit kamu dikembalikan. Coba lagi dalam beberapa saat.'
          : `❌ ${errMsg} — kredit dikembalikan.`
      }])
    }
    setLoading(false)
  }

  return (
    <div className="flex flex-col" style={{ height: 'calc(100dvh - 56px)' }}>
      <div className="flex-1 overflow-hidden flex flex-col max-w-3xl w-full mx-auto px-4">

        {/* Header */}
        <div className="flex items-center justify-between py-4 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-a4/20 border border-a4/30 flex items-center justify-center">
              <Sparkles size={16} className="text-a4"/>
            </div>
            <div>
              <h1 className="font-fraunces text-lg font-semibold leading-none">HALEA <span className="italic text-a4">AI</span></h1>
              <p className="text-t3 text-[10px] font-mono mt-0.5">Powered by HALEA</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {authUser ? (!isAdmin && (
              <Link href="/shop" className="text-[10px] font-bold text-ok bg-ok/10 border border-ok/20 px-2.5 py-1.5 rounded-full hover:bg-ok/20 transition-colors">
                🤖 {credits} kredit
              </Link>
            )) : (
              <Link href="/login?next=/ai" className="text-[10px] font-bold text-white bg-accent px-3 py-1.5 rounded-full hover:bg-orange-400 transition-colors">
                Masuk →
              </Link>
            )}
            <button
              onClick={() => { setMsgs(m => m.slice(0, 2)); setHistory([]) }}
              className="p-2.5 rounded-xl text-t3 hover:text-err hover:bg-err/10 transition-colors border border-transparent hover:border-err/20">
              <Trash2 size={15}/>
            </button>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto flex flex-col gap-3 pb-3">
          {msgs.map((m, i) => (
            <div key={i} className={`flex ${m.role==='user'?'justify-end':m.role==='system'?'justify-center':'justify-start'}`}>
              {m.role==='system' ? (
                <span className="text-[10px] text-t3 font-mono bg-s2 border border-b1 px-3 py-1.5 rounded-full">{m.text}</span>
              ) : (
                <div className={`max-w-[88%] px-4 py-3 rounded-2xl text-sm leading-relaxed ${
                  m.role==='user'
                    ? 'bg-s4 border border-b2 text-txt rounded-br-sm'
                    : 'bg-a4/10 border border-a4/20 text-txt rounded-bl-sm'
                }`}>
                  {m.text==='...' ? (
                    <span className="flex gap-1 py-0.5">
                      {[0,1,2].map(j=><span key={j} className="w-2 h-2 bg-a4/50 rounded-full animate-bounce" style={{animationDelay:`${j*0.15}s`}}/>)}
                    </span>
                  ) : (
                    <span dangerouslySetInnerHTML={{ __html: m.text
                      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
                      .replace(/\*\*(.*?)\*\*/g,'<strong class="text-a4">$1</strong>')
                      .replace(/`(.*?)`/g,'<code class="bg-s3 px-1.5 py-0.5 rounded text-a2 text-[11px] font-mono">$1</code>')
                      .replace(/\n/g,'<br>')
                    }}/>
                  )}
                </div>
              )}
            </div>
          ))}
          <div ref={endRef}/>
        </div>

        {/* Quick pills */}
        <div className="flex-shrink-0 flex gap-2 overflow-x-auto pb-3 no-scrollbar" style={{scrollbarWidth:'none'}}>
          {QUICK.map(q=>(
            <button key={q} onClick={()=>send(q)} disabled={loading}
              className="flex-shrink-0 text-[11px] px-3 py-1.5 rounded-full border border-b2 bg-s2 text-t2 hover:border-a4/50 hover:text-a4 active:scale-95 transition-all font-medium disabled:opacity-40 whitespace-nowrap">
              {q}
            </button>
          ))}
        </div>

        {/* Input row */}
        <div className="flex-shrink-0 flex gap-2 pb-4" style={{paddingBottom:'max(16px, env(safe-area-inset-bottom))'}}>
          <textarea
            ref={inputRef}
            value={input}
            onChange={e=>setInput(e.target.value)}
            onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send(input)}}}
            placeholder="Tanya soal color grading, film look..."
            rows={1}
            disabled={loading}
            className="flex-1 bg-s2 border border-b1 text-txt px-4 py-3 rounded-2xl text-sm outline-none focus:border-a4 transition-colors resize-none disabled:opacity-50 leading-snug"
            style={{minHeight:'48px',maxHeight:'120px'}}
          />
          <button
            onClick={()=>send(input)}
            disabled={loading||!input.trim()}
            className="w-12 h-12 rounded-2xl bg-a4 text-black flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed active:scale-95 transition-all shadow-lg shadow-a4/25 flex-shrink-0 self-end">
            {loading
              ?<span className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin"/>
              :<Send size={16}/>}
          </button>
        </div>
      </div>
    </div>
  )
}
