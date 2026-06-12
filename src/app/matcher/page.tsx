'use client'
import { useState, useRef, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/auth'
import { useSettingsStore } from '@/store/settings'
import { ArrowLeft, Download, Plus, Zap, Camera } from 'lucide-react'
import { toast } from '@/components/ui'
import { computeSmartMatch, applyMatch, bakeMatchLUT, SmartMatchResult } from '@/lib/colorMatch'
import { encodeGrade, copyText } from '@/lib/haleaCode'

// ── Types ─────────────────────────────────────────────────────────────────────
interface Shot {
  id: string
  name: string
  src: string                      // downscaled preview dataURL (before)
  imgData: ImageData               // downscaled pixels for match + preview
  match: SmartMatchResult | null
  afterSrc: string | null
  matching: boolean
}

const MAX_SHOTS = 8
const mkId = () => 's' + Date.now() + Math.random().toString(36).slice(2, 5)
const sanitize = (s: string) => s.replace(/[^\w\-]+/g, '_').replace(/^_+|_+$/g, '') || 'Shot'

// ── Helpers ───────────────────────────────────────────────────────────────────
function loadToImageData(file: File, maxDim: number): Promise<{ src: string; imgData: ImageData }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height))
      const c = document.createElement('canvas')
      c.width = Math.round(img.width * scale)
      c.height = Math.round(img.height * scale)
      const ctx = c.getContext('2d')!
      ctx.drawImage(img, 0, 0, c.width, c.height)
      URL.revokeObjectURL(url)
      resolve({ src: c.toDataURL('image/jpeg', 0.9), imgData: ctx.getImageData(0, 0, c.width, c.height) })
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject() }
    img.src = url
  })
}

function renderAfter(imgData: ImageData, m: SmartMatchResult, amount: number): string {
  const { data, width, height } = imgData
  const out = new Uint8ClampedArray(data.length)
  for (let i = 0; i < data.length; i += 4) {
    const [r, g, b] = applyMatch(data[i] / 255, data[i + 1] / 255, data[i + 2] / 255, m, amount)
    out[i] = Math.round(r * 255); out[i + 1] = Math.round(g * 255); out[i + 2] = Math.round(b * 255)
    out[i + 3] = data[i + 3]
  }
  const c = document.createElement('canvas')
  c.width = width; c.height = height
  c.getContext('2d')!.putImageData(new ImageData(out, width, height), 0, 0)
  return c.toDataURL('image/jpeg', 0.92)
}

const makeCube = (lut: Float32Array, size: number) => {
  let s = `# HALEA Shot Matcher — by @haleastudio\nLUT_3D_SIZE ${size}\nDOMAIN_MIN 0.0 0.0 0.0\nDOMAIN_MAX 1.0 1.0 1.0\n\n`
  for (let i = 0; i < lut.length; i += 3) s += `${lut[i].toFixed(6)} ${lut[i + 1].toFixed(6)} ${lut[i + 2].toFixed(6)}\n`
  return s
}

// ── Hoisted components (stable identity — no remount across renders) ──────────
function RefZone({ src, onFile, onClear }: { src: string | null; onFile: (f: File) => void; onClear: () => void }) {
  const [drag, setDrag] = useState(false)
  return src ? (
    <div className="relative group rounded-2xl overflow-hidden border border-accent/30">
      <img src={src} alt="Reference" className="w-full h-44 sm:h-52 object-cover" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent pointer-events-none" />
      <span className="absolute bottom-3 left-3 text-[10px] font-black tracking-widest text-accent bg-black/60 px-2.5 py-1 rounded-full backdrop-blur-sm">★ MASTER LOOK</span>
      <button onClick={onClear}
        className="absolute top-2.5 right-2.5 w-8 h-8 bg-black/70 rounded-full text-white text-xs flex items-center justify-center hover:bg-red-500 transition-colors">✕</button>
    </div>
  ) : (
    <label
      className={`flex flex-col items-center justify-center gap-3 h-44 sm:h-52 rounded-2xl border-2 border-dashed cursor-pointer transition-all ${drag ? 'border-accent bg-accent/5' : 'border-accent/40 bg-accent/5 hover:border-accent'}`}
      onDragOver={e => { e.preventDefault(); setDrag(true) }}
      onDragLeave={() => setDrag(false)}
      onDrop={e => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files[0]; if (f) onFile(f) }}>
      <input type="file" accept="image/*" className="sr-only" onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f) }} />
      <span className="text-4xl">★</span>
      <div className="text-center">
        <p className="text-sm font-bold text-accent">Upload Master Look</p>
        <p className="text-[10px] text-t3 mt-1">Referensi — semua klip akan disamakan ke look ini</p>
      </div>
    </label>
  )
}

function ShotCard({
  shot, hasRef, onName, onRemove, onDownload, onCopyCode,
}: {
  shot: Shot
  hasRef: boolean
  onName: (id: string, name: string) => void
  onRemove: (id: string) => void
  onDownload: (shot: Shot) => void
  onCopyCode: (shot: Shot) => void
}) {
  const [hold, setHold] = useState(false)
  const showAfter = shot.afterSrc && !hold
  return (
    <div className="bg-s2 border border-b1 rounded-2xl overflow-hidden flex flex-col">
      <div className="relative select-none" style={{ aspectRatio: '16/10' }}>
        <img src={showAfter ? shot.afterSrc! : shot.src} alt={shot.name}
          className="absolute inset-0 w-full h-full object-cover" draggable={false} />
        {shot.matching && (
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center">
            <div className="flex items-center gap-2 text-white text-xs font-bold">
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Matching...
            </div>
          </div>
        )}
        {shot.afterSrc && (
          <>
            <span className={`absolute top-2 left-2 text-[9px] font-black tracking-widest px-2 py-0.5 rounded-full backdrop-blur-sm ${hold ? 'bg-black/60 text-white/80' : 'bg-ok/20 text-ok'}`}>
              {hold ? 'BEFORE' : shot.match ? `✓ ${shot.match.confidence}%` : '✓ MATCHED'}
            </span>
            <button
              className="absolute bottom-2 right-2 text-[9px] font-bold text-white/90 bg-black/60 px-2.5 py-1.5 rounded-full backdrop-blur-sm active:bg-black/80 touch-none"
              onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); setHold(true) }}
              onPointerUp={() => setHold(false)}
              onPointerCancel={() => setHold(false)}>
              👁 Tahan = Before
            </button>
          </>
        )}
        {!shot.afterSrc && !shot.matching && (
          <span className="absolute top-2 left-2 text-[9px] font-black tracking-widest px-2 py-0.5 rounded-full bg-black/60 text-white/60 backdrop-blur-sm">
            {hasRef ? 'WAITING' : 'UPLOAD MASTER DULU ↑'}
          </span>
        )}
        <button onClick={() => onRemove(shot.id)}
          className="absolute top-2 right-2 w-7 h-7 bg-black/60 rounded-full text-white text-[10px] flex items-center justify-center hover:bg-red-500 transition-colors">✕</button>
      </div>
      <div className="p-3 flex flex-col gap-2">
        <input value={shot.name} onChange={e => onName(shot.id, e.target.value)}
          className="w-full bg-s3 border border-b1 text-txt px-2.5 py-1.5 rounded-lg text-xs outline-none focus:border-accent transition-colors font-medium" />
        <div className="grid grid-cols-2 gap-1.5">
          <button onClick={() => onDownload(shot)} disabled={!shot.match}
            className="py-2 rounded-lg text-[11px] font-bold bg-accent/10 border border-accent/30 text-accent hover:bg-accent/20 disabled:opacity-30 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-1.5">
            <Download size={12} /> .cube
          </button>
          <button onClick={() => onCopyCode(shot)} disabled={!shot.match}
            className="py-2 rounded-lg text-[11px] font-bold bg-a4/10 border border-a4/30 text-a4 hover:bg-a4/20 disabled:opacity-30 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-1">
            🧬 Code
          </button>
        </div>
      </div>
    </div>
  )
}

function AddShotsZone({ onFiles, count }: { onFiles: (files: FileList) => void; count: number }) {
  const [drag, setDrag] = useState(false)
  return (
    <label
      className={`flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed cursor-pointer transition-all min-h-[180px] ${drag ? 'border-accent bg-accent/5' : 'border-b2 bg-s2 hover:border-b3'}`}
      onDragOver={e => { e.preventDefault(); setDrag(true) }}
      onDragLeave={() => setDrag(false)}
      onDrop={e => { e.preventDefault(); setDrag(false); if (e.dataTransfer.files.length) onFiles(e.dataTransfer.files) }}>
      <input type="file" accept="image/*" multiple className="sr-only"
        onChange={e => { if (e.target.files?.length) onFiles(e.target.files); e.target.value = '' }} />
      <Plus size={22} className="text-t3" />
      <div className="text-center">
        <p className="text-xs font-bold text-t2">Tambah Shot</p>
        <p className="text-[10px] text-t3 mt-0.5">Bisa pilih banyak sekaligus · {count}/{MAX_SHOTS}</p>
      </div>
    </label>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function MatcherPage() {
  const [refSrc, setRefSrc] = useState<string | null>(null)
  const [shots, setShots] = useState<Shot[]>([])
  const [strength, setStrength] = useState(0.8)

  const router = useRouter()
  const { user: authUser, credits, useCredit } = useAuthStore()
  const matchCost = useSettingsStore(s => s.matchCost)
  const isAdmin = authUser?.role === 'admin'

  const requireLogin = () => {
    if (authUser) return true
    toast('Daftar gratis dulu untuk pakai Shot Matcher ✦', 'warn')
    router.push('/login?next=/matcher')
    return false
  }

  const refDataRef  = useRef<ImageData | null>(null)
  const shotsRef    = useRef<Shot[]>([])
  const strengthRef = useRef(0.8)
  const rafRef      = useRef<number | null>(null)

  useEffect(() => { shotsRef.current = shots }, [shots])
  useEffect(() => { strengthRef.current = strength }, [strength])

  // Compute match for one shot (deferred so the spinner paints first)
  const matchOne = useCallback((id: string, imgData: ImageData, ref: ImageData) => {
    setShots(prev => prev.map(s => s.id === id ? { ...s, matching: true } : s))
    setTimeout(() => {
      try {
        const m = computeSmartMatch(imgData, ref)
        const after = renderAfter(imgData, m, strengthRef.current)
        setShots(prev => prev.map(s => s.id === id ? { ...s, match: m, afterSrc: after, matching: false } : s))
      } catch {
        setShots(prev => prev.map(s => s.id === id ? { ...s, matching: false } : s))
        toast('Gagal match shot ini', 'err')
      }
    }, 30)
  }, [])

  const handleRef = async (f: File) => {
    if (!requireLogin()) return
    try {
      const { src, imgData } = await loadToImageData(f, 500)
      refDataRef.current = imgData
      setRefSrc(src)
      // re-match every existing shot against the new master
      setShots(prev => prev.map(s => ({ ...s, match: null, afterSrc: null })))
      shotsRef.current.forEach(s => matchOne(s.id, s.imgData, imgData))
      if (shotsRef.current.length) toast(`✦ Matching ${shotsRef.current.length} shot ke master look...`)
    } catch { toast('Gagal load gambar', 'err') }
  }

  const clearRef = () => {
    refDataRef.current = null
    setRefSrc(null)
    setShots(prev => prev.map(s => ({ ...s, match: null, afterSrc: null })))
  }

  const handleShotFiles = async (files: FileList) => {
    if (!requireLogin()) return
    const room = MAX_SHOTS - shotsRef.current.length
    const list = Array.from(files).slice(0, room)
    if (files.length > room) toast(`Maksimal ${MAX_SHOTS} shot — ${files.length - room} file dilewati`, 'warn')
    for (const f of list) {
      try {
        const { src, imgData } = await loadToImageData(f, 640)
        const shot: Shot = {
          id: mkId(),
          name: sanitize(f.name.replace(/\.[^.]+$/, '').slice(0, 24)) || `Shot_${shotsRef.current.length + 1}`,
          src, imgData, match: null, afterSrc: null, matching: false,
        }
        setShots(prev => [...prev, shot])
        if (refDataRef.current) matchOne(shot.id, shot.imgData, refDataRef.current)
      } catch { toast('Gagal load: ' + f.name, 'err') }
    }
  }

  // Re-render previews when strength changes (rAF-coalesced)
  useEffect(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    rafRef.current = requestAnimationFrame(() => {
      setShots(prev => prev.map(s => s.match ? { ...s, afterSrc: renderAfter(s.imgData, s.match, strength) } : s))
    })
  }, [strength])

  const downloadShot = (shot: Shot) => {
    if (!shot.match) return
    if (!useCredit(matchCost)) {
      toast(`Kredit habis — LUT butuh ${matchCost} kredit. Beli di Shop 🛍`, 'err')
      return
    }
    const lut = bakeMatchLUT(shot.match, strengthRef.current, 33)
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([makeCube(lut, 33)]))
    a.download = `${sanitize(shot.name)}_HALEA_Match.cube`
    a.click()
    try { localStorage.setItem('halea_m_matcher', '1') } catch {}   // HALEA Academy mission
    toast('✓ ' + shot.name + ' — LUT downloaded')
  }

  const downloadAll = () => {
    const ready = shotsRef.current.filter(s => s.match)
    if (!ready.length) { toast('Belum ada shot yang matched', 'warn'); return }
    const totalCost = matchCost * ready.length
    if (!isAdmin && credits < totalCost) {
      toast(`Butuh ${totalCost} kredit untuk ${ready.length} LUT — saldo ${credits}. Beli di Shop 🛍`, 'err')
      return
    }
    ready.forEach((s, i) => setTimeout(() => downloadShot(s), i * 600))
    toast(`⬇ Download ${ready.length} LUT dimulai...`)
  }

  const copyShotCode = async (shot: Shot) => {
    if (!shot.match) return
    const m = shot.match
    const code = encodeGrade([{
      type: 'match', enabled: true,
      params: {
        m0: m.matrix[0], m1: m.matrix[1], m2: m.matrix[2],
        m3: m.matrix[3], m4: m.matrix[4], m5: m.matrix[5],
        m6: m.matrix[6], m7: m.matrix[7], m8: m.matrix[8],
        fL: m.muF[0], fa: m.muF[1], fb: m.muF[2],
        rL: m.muR[0], ra: m.muR[1], rb: m.muR[2],
        curve: Array.from(m.curve).map(v => v.toFixed(5)).join(','),
        bh0: m.bandH[0], bh1: m.bandH[1], bh2: m.bandH[2], bh3: m.bandH[3],
        bh4: m.bandH[4], bh5: m.bandH[5], bh6: m.bandH[6], bh7: m.bandH[7],
        bs0: m.bandS[0], bs1: m.bandS[1], bs2: m.bandS[2], bs3: m.bandS[3],
        bs4: m.bandS[4], bs5: m.bandS[5], bs6: m.bandS[6], bs7: m.bandS[7],
        bl0: m.bandL[0], bl1: m.bandL[1], bl2: m.bandL[2], bl3: m.bandL[3],
        bl4: m.bandL[4], bl5: m.bandL[5], bl6: m.bandL[6], bl7: m.bandL[7],
        skh: m.skinH, sks: m.skinS, skl: m.skinL, skw: m.skinW, skp: m.skinP,
        amount: strengthRef.current,
      },
    }], shot.name)
    if (await copyText(code)) toast('🧬 Code "' + shot.name + '" disalin — paste di Studio / share!')
    else window.prompt('Salin kode ini:', code)
  }

  const setName = (id: string, name: string) => setShots(prev => prev.map(s => s.id === id ? { ...s, name } : s))
  const removeShot = (id: string) => setShots(prev => prev.filter(s => s.id !== id))

  const matchedCount = shots.filter(s => s.match).length

  return (
    <div className="min-h-screen pb-28 md:pb-16">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">

        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <Link href="/studio" className="flex items-center gap-1.5 text-t3 hover:text-accent transition-colors text-sm font-medium">
            <ArrowLeft size={15} />Studio
          </Link>
          <div className="w-px h-4 bg-b1" />
          <div className="flex-1 min-w-0">
            <h1 className="font-fraunces text-lg sm:text-2xl font-semibold leading-tight">
              Shot <span className="italic text-accent">Matcher</span>
            </h1>
            <p className="text-t3 text-[11px] mt-0.5 font-mono hidden sm:block">Samakan warna semua klip ke satu master look — LUT per klip</p>
          </div>
          {authUser && !isAdmin && (
            <Link href="/shop" className="text-[10px] font-bold text-ok bg-ok/10 border border-ok/20 px-2.5 py-1.5 rounded-full flex-shrink-0 hover:bg-ok/20 transition-colors">
              🤖 {credits}
            </Link>
          )}
          {matchedCount > 0 && (
            <button onClick={downloadAll}
              className="hidden md:flex items-center gap-2 px-4 py-2.5 bg-accent text-white rounded-xl text-xs font-black uppercase tracking-wider hover:bg-orange-400 transition-colors shadow-lg shadow-accent/20">
              <Download size={14} /> Semua ({matchedCount})
            </button>
          )}
        </div>

        {/* Steps hint */}
        {!refSrc && shots.length === 0 && (
          <div className="flex items-center justify-center gap-1.5 mb-6 flex-wrap">
            {['① Upload master look', '② Upload still tiap klip', '③ Download LUT per klip'].map((s, i) => (
              <span key={s} className="flex items-center gap-1.5">
                <span className="px-3 py-1.5 rounded-full text-[10px] font-bold bg-s3 border border-b1 text-t2">{s}</span>
                {i < 2 && <span className="text-b2 text-xs">›</span>}
              </span>
            ))}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-5 items-start">

          {/* ── LEFT: Master + controls ── */}
          <div className="flex flex-col gap-4 lg:sticky lg:top-20">
            <RefZone src={refSrc} onFile={handleRef} onClear={clearRef} />

            {/* Strength */}
            {matchedCount > 0 && (
              <div className="bg-s3 border border-a4/25 rounded-xl p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[9px] font-black tracking-widest uppercase text-a4">✦ Match Strength</span>
                  <span className="text-[10px] font-mono font-bold text-a4">{Math.round(strength * 100)}%</span>
                </div>
                <input type="range" min={0} max={100} value={Math.round(strength * 100)}
                  onChange={e => setStrength(+e.target.value / 100)} className="w-full" />
                <div className="flex justify-between text-[9px] text-t3 mt-1"><span>Subtle</span><span>Full match</span></div>
                <p className="text-[9px] text-t3 mt-2 leading-relaxed">Berlaku ke semua shot — preview & LUT</p>
              </div>
            )}

            {/* How to */}
            <div className="bg-s2 border border-b1 rounded-2xl p-4 hidden lg:block">
              <p className="text-[9px] font-black tracking-widest uppercase text-t3 mb-3">Cara pakai</p>
              {[
                ['1. Master look', 'Foto/frame dengan grade yang jadi acuan — bisa dari klip terbaik kamu'],
                ['2. Shot tiap klip', 'Screenshot satu frame dari tiap klip/kamera yang beda warna'],
                ['3. Apply di editor', 'Tiap klip dapat LUT sendiri — apply masing-masing, semua jadi konsisten'],
              ].map(([t, d]) => (
                <div key={t} className="mb-2.5 last:mb-0">
                  <p className="text-[11px] font-bold text-txt">{t}</p>
                  <p className="text-[10px] text-t3 leading-relaxed">{d}</p>
                </div>
              ))}
            </div>
          </div>

          {/* ── RIGHT: Shots grid ── */}
          <div>
            {shots.length === 0 ? (
              <label className="flex flex-col items-center justify-center gap-4 py-16 rounded-2xl border-2 border-dashed border-b2 bg-s2 cursor-pointer hover:border-b3 transition-all">
                <input type="file" accept="image/*" multiple className="sr-only"
                  onChange={e => { if (e.target.files?.length) handleShotFiles(e.target.files); e.target.value = '' }} />
                <Camera size={32} className="text-t3 opacity-40" />
                <div className="text-center">
                  <p className="text-sm font-bold text-t2">Upload still dari klip-klip kamu</p>
                  <p className="text-[11px] text-t3 mt-1">Bisa pilih banyak file sekaligus · beda kamera, beda lighting, beda warna</p>
                </div>
                <span className="px-5 py-2.5 bg-s4 border border-b2 rounded-full text-xs font-bold text-txt">Pilih Files</span>
              </label>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                {shots.map(s => (
                  <ShotCard key={s.id} shot={s} hasRef={!!refSrc}
                    onName={setName} onRemove={removeShot} onDownload={downloadShot} onCopyCode={copyShotCode} />
                ))}
                {shots.length < MAX_SHOTS && <AddShotsZone onFiles={handleShotFiles} count={shots.length} />}
              </div>
            )}

            {/* Workflow tip */}
            {matchedCount > 1 && (
              <div className="mt-4 bg-ok/5 border border-ok/20 rounded-xl px-4 py-3 flex items-start gap-2.5">
                <Zap size={14} className="text-ok flex-shrink-0 mt-0.5" />
                <p className="text-[11px] text-t2 leading-relaxed">
                  <strong className="text-ok">Workflow:</strong> apply LUT masing-masing ke klipnya di Premiere/Resolve/CapCut
                  (Lumetri → Creative → Browse). Semua klip bakal konsisten ke master look — multicam & multi-hari jadi seragam.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Mobile sticky bottom bar ── */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-30 border-t border-b1 glass px-4 py-3"
        style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom,0px))' }}>
        {!refSrc ? (
          <p className="text-center text-xs text-t3 py-1">Upload <strong className="text-accent">Master Look</strong> dulu ↑</p>
        ) : shots.length === 0 ? (
          <p className="text-center text-xs text-t3 py-1">Tambahkan still dari klip-klip kamu ↑</p>
        ) : shots.some(s => s.matching) ? (
          <div className="flex items-center justify-center gap-2 py-1">
            <span className="w-4 h-4 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
            <span className="text-sm text-t2">Matching shots...</span>
          </div>
        ) : (
          <button onClick={downloadAll} disabled={!matchedCount}
            className="w-full py-3.5 bg-accent text-white rounded-2xl font-black text-sm uppercase tracking-widest flex items-center justify-center gap-2 shadow-xl shadow-accent/30 active:scale-[0.97] transition-all disabled:opacity-40">
            <Download size={16} /> Download Semua ({matchedCount} LUT)
          </button>
        )}
      </div>
    </div>
  )
}
