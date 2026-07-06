'use client'
import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Heart, Copy, Trash2, Sparkles } from 'lucide-react'
import { decodeGrade, copyText, CodeNode } from '@/lib/haleaCode'
import { applyNodes } from '@/lib/grade'
import { transformFromParams, applyTransform } from '@/lib/colorMatch'
import { getAdminKey } from '@/lib/launch'
import { useAuthStore } from '@/store/auth'
import { toast } from '@/components/ui'
import { useT } from '@/lib/i18n'

interface LookEntry { id: string; name: string; code: string; author: string; ts: number; likes: number }

const PW = 220, PH = 124   // preview canvas size (CSS upscales)
const LIKED_LS = 'halea_ll_liked'

// ── Test scene the looks are previewed on (drawn once, graded per card) ──────
function drawBaseScene(): ImageData {
  const c = document.createElement('canvas'); c.width = PW; c.height = PH
  const x = c.getContext('2d')!
  const w = PW, h = PH
  // sky
  let g = x.createLinearGradient(0, 0, 0, h * 0.62)
  g.addColorStop(0, '#6ea8d8'); g.addColorStop(1, '#cfe0ea')
  x.fillStyle = g; x.fillRect(0, 0, w, h * 0.62)
  // sun glow
  const rg = x.createRadialGradient(w * 0.78, h * 0.18, 4, w * 0.78, h * 0.18, h * 0.55)
  rg.addColorStop(0, 'rgba(255,214,150,0.95)'); rg.addColorStop(1, 'rgba(255,214,150,0)')
  x.fillStyle = rg; x.fillRect(0, 0, w, h * 0.62)
  // clouds
  x.fillStyle = 'rgba(246,248,250,0.94)'
  x.beginPath(); x.ellipse(w * 0.30, h * 0.22, w * 0.14, h * 0.05, 0, 0, 7); x.fill()
  x.beginPath(); x.ellipse(w * 0.38, h * 0.18, w * 0.10, h * 0.045, 0, 0, 7); x.fill()
  x.beginPath(); x.ellipse(w * 0.60, h * 0.34, w * 0.09, h * 0.038, 0, 0, 7); x.fill()
  // hills
  g = x.createLinearGradient(0, h * 0.5, 0, h)
  g.addColorStop(0, '#7da35c'); g.addColorStop(1, '#3f6b34')
  x.fillStyle = g
  x.beginPath(); x.moveTo(0, h * 0.66); x.quadraticCurveTo(w * 0.3, h * 0.52, w * 0.55, h * 0.62)
  x.quadraticCurveTo(w * 0.8, h * 0.7, w, h * 0.6); x.lineTo(w, h); x.lineTo(0, h); x.fill()
  // road (neutral grey — shows the look's cast on neutrals)
  x.fillStyle = '#8d8f92'
  x.beginPath(); x.moveTo(w * 0.46, h); x.lineTo(w * 0.53, h * 0.66); x.lineTo(w * 0.57, h * 0.66); x.lineTo(w * 0.70, h); x.fill()
  // subject: skin + dark jacket (shows skin handling & shadow tint)
  x.fillStyle = '#c99877'; x.beginPath(); x.arc(w * 0.18, h * 0.70, h * 0.085, 0, 7); x.fill()
  x.fillStyle = '#2e3138'; x.fillRect(w * 0.115, h * 0.79, w * 0.13, h * 0.21)
  return x.getImageData(0, 0, w, h)
}

// Build per-node apply fns with the match transform resolved ONCE (not per pixel)
function compileLook(nodes: CodeNode[]): ((r: number, g: number, b: number) => [number, number, number])[] {
  return nodes.filter(n => n.enabled).map(n => {
    if (n.type === 'match' && (n.params.amount as number) > 0.001) {
      const tr = transformFromParams(n.params)
      const amt = n.params.amount as number
      return (r: number, g: number, b: number) => applyTransform(r, g, b, tr, amt)
    }
    const single = [n]
    return (r: number, g: number, b: number) => applyNodes(r, g, b, single)
  })
}

// ── Card ──────────────────────────────────────────────────────────────────────
function LookCard({ look, base, liked, onLike, onUse, isAdmin, onDelete, t }: {
  look: LookEntry; base: ImageData | null; liked: boolean
  onLike: () => void; onUse: () => void; isAdmin: boolean; onDelete: () => void
  t: (s: string) => string
}) {
  const ref = useRef<HTMLCanvasElement>(null)
  const [bad, setBad] = useState(false)

  useEffect(() => {
    if (!base || !ref.current) return
    const cv = ref.current
    // render off the main paint path — cards appear progressively
    const id = window.setTimeout(() => {
      const res = decodeGrade(look.code)
      if (!res) { setBad(true); return }
      const fns = compileLook(res.nodes)
      const out = new Uint8ClampedArray(base.data.length)
      const d = base.data
      for (let i = 0; i < d.length; i += 4) {
        let r = d[i] / 255, g = d[i + 1] / 255, b = d[i + 2] / 255
        for (const f of fns) [r, g, b] = f(r, g, b)
        out[i] = Math.round(r * 255); out[i + 1] = Math.round(g * 255); out[i + 2] = Math.round(b * 255); out[i + 3] = 255
      }
      cv.width = PW; cv.height = PH
      cv.getContext('2d')!.putImageData(new ImageData(out, PW, PH), 0, 0)
    }, 10)
    return () => window.clearTimeout(id)
  }, [base, look.code])

  if (bad) return null
  const age = Date.now() - look.ts
  const ago = age < 36e5 ? t('baru saja') : age < 864e5 ? Math.round(age / 36e5) + t('jam') : Math.round(age / 864e5) + t('hari')

  return (
    <div className="bg-s2 border border-b1 rounded-2xl overflow-hidden hover:border-accent/30 transition-colors group">
      <div className="relative">
        <canvas ref={ref} className="w-full aspect-[16/9] block bg-s3" />
        <button onClick={onUse}
          className="absolute inset-0 flex items-end justify-center pb-3 opacity-0 group-hover:opacity-100 bg-gradient-to-t from-black/60 via-transparent transition-opacity">
          <span className="px-4 py-2 rounded-full bg-accent text-white text-[11px] font-black uppercase tracking-wider shadow-lg">
            ✦ {t('Pakai Look ini')}
          </span>
        </button>
      </div>
      <div className="p-3.5">
        <div className="flex items-start justify-between gap-2 mb-0.5">
          <h3 className="font-bold text-sm truncate">{look.name}</h3>
          <span className="text-[9px] text-t3 font-mono flex-shrink-0 mt-0.5">{ago}</span>
        </div>
        <p className="text-[10px] text-t3 mb-3 truncate">{t('oleh')} <span className="text-t2 font-bold">{look.author}</span></p>
        <div className="flex items-center gap-1.5">
          <button onClick={onLike} disabled={liked}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-full border text-[10px] font-bold transition-colors ${liked ? 'border-accent/40 bg-accent/10 text-accent' : 'border-b2 text-t2 hover:border-accent/40 hover:text-accent'}`}>
            <Heart size={11} fill={liked ? 'currentColor' : 'none'} /> {look.likes}
          </button>
          <button onClick={onUse}
            className="flex-1 py-1.5 rounded-full bg-s3 border border-b2 text-[10px] font-bold text-t2 hover:border-accent hover:text-accent transition-colors sm:hidden">
            ✦ {t('Pakai')}
          </button>
          <button onClick={async () => { if (await copyText(look.code)) toast(t('Code disalin!')) }}
            className="p-1.5 rounded-full border border-b2 text-t3 hover:text-accent hover:border-accent/40 transition-colors" title={t('Salin Code')}>
            <Copy size={11} />
          </button>
          {isAdmin && (
            <button onClick={onDelete}
              className="p-1.5 rounded-full border border-err/30 text-err/70 hover:text-err transition-colors" title="Delete">
              <Trash2 size={11} />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function LooksPage() {
  const [looks, setLooks] = useState<LookEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [configured, setConfigured] = useState(true)
  const [tab, setTab] = useState<'new' | 'top'>('new')
  const [base, setBase] = useState<ImageData | null>(null)
  const [likedIds, setLikedIds] = useState<string[]>([])
  const router = useRouter()
  const user = useAuthStore(s => s.user)
  const isAdmin = user?.role === 'admin'
  const t = useT()

  useEffect(() => {
    setBase(drawBaseScene())
    try { setLikedIds(JSON.parse(localStorage.getItem(LIKED_LS) || '[]')) } catch {}
    fetch('/api/looks', { cache: 'no-store' })
      .then(r => r.json())
      .then(j => { setLooks(j.looks || []); setConfigured(j.configured !== false) })
      .catch(() => setConfigured(false))
      .finally(() => setLoading(false))
  }, [])

  const sorted = useMemo(() =>
    tab === 'top' ? [...looks].sort((a, b) => b.likes - a.likes || b.ts - a.ts) : looks,
  [looks, tab])

  const like = useCallback(async (id: string) => {
    if (likedIds.includes(id)) return
    const next = [...likedIds, id]
    setLikedIds(next)
    try { localStorage.setItem(LIKED_LS, JSON.stringify(next)) } catch {}
    setLooks(ls => ls.map(l => l.id === id ? { ...l, likes: l.likes + 1 } : l))
    try { await fetch('/api/looks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ like: id }) }) } catch {}
  }, [likedIds])

  const use = useCallback((look: LookEntry) => {
    try { sessionStorage.setItem('halea_use_code', look.code) } catch {}
    router.push('/studio')
  }, [router])

  const del = useCallback(async (id: string) => {
    if (!confirm('Hapus look ini dari library?')) return
    const r = await fetch('/api/looks', { method: 'DELETE', headers: { 'Content-Type': 'application/json', 'x-admin-key': getAdminKey() }, body: JSON.stringify({ id }) })
    if (r.ok) { setLooks(ls => ls.filter(l => l.id !== id)); toast('✓ Look dihapus') }
    else toast('Gagal hapus', 'err')
  }, [])

  return (
    <main className="max-w-6xl mx-auto px-4 sm:px-6 py-10 md:py-14">
      {/* header */}
      <div className="text-center mb-8">
        <p className="text-[9px] font-black tracking-[0.3em] uppercase text-accent mb-3">✦ {t('Komunitas')}</p>
        <h1 className="font-fraunces text-4xl md:text-5xl font-semibold mb-3">
          Look <span className="italic text-accent">Library</span>
        </h1>
        <p className="text-t2 text-sm max-w-lg mx-auto leading-relaxed">
          {t('Look komunitas — browse gratis, pakai di footage-mu dengan satu klik. Punya look keren? Publish dari Studio.')}
        </p>
        <p className="text-[10px] text-t3 mt-2">{t('Preview di-render live di browser-mu — tiap look diterapkan ke scene test yang sama.')}</p>
      </div>

      {/* tabs */}
      <div className="flex items-center justify-center gap-2 mb-8">
        {([['new', 'Terbaru'], ['top', 'Populer']] as const).map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)}
            className={`px-5 py-2 rounded-full text-[11px] font-black uppercase tracking-wider border transition-colors ${tab === id ? 'bg-accent text-white border-accent' : 'bg-s2 border-b1 text-t2 hover:border-accent/40'}`}>
            {t(label)}
          </button>
        ))}
      </div>

      {/* grid */}
      {loading ? (
        <div className="text-center py-24 text-t3 text-sm">
          <span className="inline-block w-5 h-5 border-2 border-accent/30 border-t-accent rounded-full animate-spin mb-3" />
          <p>{t('Memuat looks...')}</p>
        </div>
      ) : !configured ? (
        <div className="text-center py-24 text-t3 text-sm">{t('Library butuh koneksi database — coba lagi nanti.')}</div>
      ) : sorted.length === 0 ? (
        <div className="bg-s2 border border-dashed border-b2 rounded-3xl p-14 text-center">
          <Sparkles size={28} className="mx-auto text-accent/50 mb-4" />
          <p className="font-bold text-t2 mb-2">{t('Belum ada look di library.')}</p>
          <p className="text-xs text-t3 mb-6 max-w-sm mx-auto leading-relaxed">{t('Jadilah yang pertama — bikin look di Studio (referensi atau prompt AI) lalu tekan Publish.')}</p>
          <button onClick={() => router.push('/studio')}
            className="px-6 py-3 bg-accent text-white rounded-full text-xs font-bold hover:bg-orange-400 transition-colors">
            {t('Buka Studio')} →
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {sorted.map(look => (
            <LookCard key={look.id} look={look} base={base} liked={likedIds.includes(look.id)}
              onLike={() => like(look.id)} onUse={() => use(look)}
              isAdmin={!!isAdmin} onDelete={() => del(look.id)} t={t} />
          ))}
        </div>
      )}

      {/* how it works strip */}
      <div className="mt-12 bg-s2 border border-b1 rounded-2xl p-5 text-center">
        <p className="text-[12px] text-t2 leading-relaxed">
          {t('Browse & pakai look = gratis. Export hasilnya (Bake LUT / Download Foto / Precision) pakai kredit seperti biasa.')}
        </p>
      </div>
    </main>
  )
}
