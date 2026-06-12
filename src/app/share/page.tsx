'use client'
import { useState, useRef, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { ArrowLeft, Download, Share2, RefreshCw, ImageIcon } from 'lucide-react'

type Fmt = 'square' | 'portrait' | 'story' | 'wide'

const FORMATS: Record<Fmt, { w: number; h: number; label: string; sub: string }> = {
  square:   { w: 1080, h: 1080, label: '1:1',  sub: 'Instagram Post'   },
  portrait: { w: 1080, h: 1350, label: '4:5',  sub: 'IG Feed Portrait' },
  story:    { w: 1080, h: 1920, label: '9:16', sub: 'Reels · TikTok'   },
  wide:     { w: 1920, h: 1080, label: '16:9', sub: 'YouTube · Twitter' },
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x+r,y); ctx.lineTo(x+w-r,y); ctx.arcTo(x+w,y,x+w,y+r,r)
  ctx.lineTo(x+w,y+h-r); ctx.arcTo(x+w,y+h,x+w-r,y+h,r)
  ctx.lineTo(x+r,y+h); ctx.arcTo(x,y+h,x,y+h-r,r)
  ctx.lineTo(x,y+r); ctx.arcTo(x,y,x+r,y,r)
  ctx.closePath()
}

function loadImg(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image()
    img.onload = () => res(img)
    img.onerror = rej
    img.src = src
  })
}

async function fileToDataUrl(f: File): Promise<string> {
  const url = URL.createObjectURL(f)
  return new Promise((res, rej) => {
    const img = new Image()
    img.onload = () => {
      const c = document.createElement('canvas')
      const s = Math.min(1, 1080 / Math.max(img.width, img.height))
      c.width = Math.round(img.width * s); c.height = Math.round(img.height * s)
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height)
      URL.revokeObjectURL(url)
      res(c.toDataURL('image/jpeg', 0.92))
    }
    img.onerror = () => { URL.revokeObjectURL(url); rej() }
    img.src = url
  })
}

// ── Upload zone — must be outside parent to prevent remount ──────────────────
function UploadZone({ which, src, onFile }: {
  which: 'before' | 'after'
  src: string | null
  onFile: (f: File) => void
}) {
  const [drag, setDrag] = useState(false)
  const lbl    = which === 'before' ? 'BEFORE' : 'AFTER'
  const lblCls = which === 'after'  ? 'text-accent bg-accent/20' : 'text-white/80 bg-black/60'

  return (
    <label
      className={`relative flex flex-col items-center justify-center rounded-2xl border-2 border-dashed cursor-pointer transition-all overflow-hidden ${drag ? 'border-accent bg-accent/5 scale-[0.98]' : 'border-b2 bg-s2 hover:border-b3'}`}
      style={{ aspectRatio: '4/3' }}
      onDragOver={e => { e.preventDefault(); setDrag(true) }}
      onDragLeave={() => setDrag(false)}
      onDrop={e => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files[0]; if (f) onFile(f) }}>
      <input type="file" accept="image/*" capture="environment" className="sr-only"
        onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f) }}/>
      {src ? (
        <>
          <img src={src} alt={lbl} className="absolute inset-0 w-full h-full object-cover"/>
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent"/>
          <span className={`absolute bottom-2 left-2 text-[10px] font-black tracking-widest px-2 py-1 rounded-full backdrop-blur-sm ${lblCls}`}>{lbl}</span>
          <span className="absolute top-2 right-2 text-[9px] text-white/60 bg-black/50 px-1.5 py-0.5 rounded font-mono">Ganti</span>
        </>
      ) : (
        <div className="flex flex-col items-center gap-2 p-4 text-center select-none">
          <span className="text-3xl opacity-20">{which === 'before' ? '🖼' : '✦'}</span>
          <div>
            <p className="text-xs font-bold text-t2">{lbl}</p>
            <p className="text-[10px] text-t3 mt-0.5 leading-tight">Tap untuk pilih{'\n'}atau kamera</p>
          </div>
        </div>
      )}
    </label>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function SharePage() {
  const [beforeSrc,  setBeforeSrc]  = useState<string | null>(null)
  const [afterSrc,   setAfterSrc]   = useState<string | null>(null)
  const [format,     setFormat]     = useState<Fmt>('square')
  const [handle,     setHandle]     = useState('@haleastudio')
  const [lookName,   setLookName]   = useState('')
  const [cardUrl,    setCardUrl]    = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)
  const [canNativeShare, setCanNativeShare] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    // Check if browser supports native file sharing (iOS Safari 14+, Android Chrome)
    setCanNativeShare(!!navigator.canShare)
    // Pre-fill from studio sessionStorage
    try {
      const b = sessionStorage.getItem('halea_share_before')
      const a = sessionStorage.getItem('halea_share_after')
      const g = sessionStorage.getItem('halea_share_grade')
      if (b) setBeforeSrc(b)
      if (a) setAfterSrc(a)
      if (g && g !== 'natural' && g !== '') setLookName(g)
    } catch {}
  }, [])

  const generateCard = useCallback(async () => {
    if (!beforeSrc || !afterSrc || !canvasRef.current) return
    setGenerating(true)
    try {
      const [bImg, aImg] = await Promise.all([loadImg(beforeSrc), loadImg(afterSrc)])
      const fmt    = FORMATS[format]
      const canvas = canvasRef.current
      canvas.width  = fmt.w
      canvas.height = fmt.h
      const ctx = canvas.getContext('2d')!

      const barH  = Math.round(fmt.h * 0.10)
      const imgH  = fmt.h - barH
      const halfW = Math.round(fmt.w / 2)

      ctx.fillStyle = '#0a0a0a'
      ctx.fillRect(0, 0, fmt.w, fmt.h)

      const drawCover = (img: HTMLImageElement, rx: number, ry: number, rw: number, rh: number) => {
        const s  = Math.max(rw / img.width, rh / img.height)
        const sw = img.width * s, sh = img.height * s
        ctx.save()
        ctx.beginPath(); ctx.rect(rx, ry, rw, rh); ctx.clip()
        ctx.drawImage(img, rx + (rw - sw) / 2, ry + (rh - sh) / 2, sw, sh)
        ctx.restore()
      }
      drawCover(bImg, 0,     0, halfW, imgH)
      drawCover(aImg, halfW, 0, halfW, imgH)

      // Vignettes
      ;[0, halfW].forEach(ox => {
        const g = ctx.createLinearGradient(ox, 0, ox + halfW, 0)
        g.addColorStop(0, 'rgba(0,0,0,0.28)'); g.addColorStop(0.22, 'rgba(0,0,0,0)')
        g.addColorStop(0.78, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.28)')
        ctx.fillStyle = g; ctx.fillRect(ox, 0, halfW, imgH)
      })

      // Bottom fade
      const fH = barH * 2.2
      const fg = ctx.createLinearGradient(0, imgH - fH, 0, imgH)
      fg.addColorStop(0, 'rgba(0,0,0,0)'); fg.addColorStop(1, 'rgba(0,0,0,0.72)')
      ctx.fillStyle = fg; ctx.fillRect(0, imgH - fH, fmt.w, fH)

      // Divider
      ctx.shadowColor = 'rgba(255,255,255,0.5)'; ctx.shadowBlur = 18
      ctx.strokeStyle = 'rgba(255,255,255,0.9)'
      ctx.lineWidth   = Math.max(2, Math.round(fmt.w * 0.0022))
      ctx.beginPath(); ctx.moveTo(halfW, 0); ctx.lineTo(halfW, imgH); ctx.stroke()
      ctx.shadowBlur = 0

      // Handle knob
      const hR = Math.round(fmt.w * 0.030), hCY = Math.round(imgH / 2)
      ctx.strokeStyle = 'rgba(255,255,255,0.22)'; ctx.lineWidth = Math.round(hR * 0.25)
      ctx.beginPath(); ctx.arc(halfW, hCY, hR + hR * 0.35, 0, Math.PI * 2); ctx.stroke()
      ctx.fillStyle = 'white'; ctx.beginPath(); ctx.arc(halfW, hCY, hR, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = '#111'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.font = `bold ${Math.round(hR * 1.05)}px sans-serif`
      ctx.fillText('⇔', halfW, hCY + 1)

      // Labels
      const lPad = Math.round(fmt.w * 0.020), lFS = Math.round(fmt.w * 0.0135)
      const lH = lFS + 12, lY = imgH - lPad - lH
      const drawLbl = (text: string, ax: number, right?: boolean) => {
        ctx.font = `900 ${lFS}px -apple-system,Arial,sans-serif`
        const tw = ctx.measureText(text).width
        const lx = right ? ax - tw - lPad * 1.3 : ax
        ctx.fillStyle = 'rgba(0,0,0,0.62)'
        roundRect(ctx, lx - lPad * 0.65, lY, tw + lPad * 1.3, lH, lH / 2); ctx.fill()
        ctx.fillStyle = 'rgba(255,255,255,0.92)'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'
        ctx.fillText(text, lx, lY + lH / 2)
      }
      drawLbl('BEFORE', lPad); drawLbl('AFTER', fmt.w - lPad, true)

      // Branding bar
      ctx.fillStyle = '#0d0d0d'; ctx.fillRect(0, imgH, fmt.w, barH)
      ctx.fillStyle = '#f97316'; ctx.fillRect(0, imgH, fmt.w, Math.max(2, Math.round(fmt.h * 0.0022)))

      const bCY = imgH + Math.round(barH / 2), lx0 = Math.round(fmt.w * 0.038)
      const lR = Math.round(barH * 0.29), lcX = lx0 + lR

      ctx.strokeStyle = 'rgba(249,115,22,0.28)'; ctx.lineWidth = Math.max(1, lR * 0.14)
      ctx.beginPath(); ctx.arc(lcX, bCY, lR, 0, Math.PI * 2); ctx.stroke()
      ctx.strokeStyle = 'rgba(249,115,22,0.62)'; ctx.lineWidth = Math.max(1.5, lR * 0.19)
      ctx.beginPath(); ctx.arc(lcX, bCY, lR * 0.61, 0, Math.PI * 2); ctx.stroke()
      ctx.fillStyle = '#f97316'; ctx.beginPath(); ctx.arc(lcX, bCY, lR * 0.30, 0, Math.PI * 2); ctx.fill()

      const tX = lcX + lR + Math.round(fmt.w * 0.014)
      const tFS = Math.round(barH * 0.40), sFS = Math.round(barH * 0.185)
      ctx.fillStyle = 'white'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'
      ctx.font = `600 ${tFS}px Georgia,'Times New Roman',serif`
      ctx.fillText('HALEA', tX, bCY - Math.round(tFS * 0.24))
      ctx.fillStyle = 'rgba(255,255,255,0.36)'; ctx.font = `${sFS}px monospace`
      ctx.fillText('halea.vercel.app', tX, bCY + Math.round(tFS * 0.38))

      const rPad = Math.round(fmt.w * 0.038)
      ctx.textAlign = 'right'
      if (handle) {
        ctx.fillStyle = 'rgba(255,255,255,0.80)'
        ctx.font = `bold ${Math.round(barH * 0.26)}px -apple-system,Arial,sans-serif`
        ctx.fillText(handle, fmt.w - rPad, bCY - (lookName ? Math.round(barH * 0.13) : 0))
      }
      if (lookName) {
        ctx.fillStyle = '#f97316'; ctx.font = `${Math.round(barH * 0.19)}px monospace`
        ctx.fillText(lookName.toUpperCase() + ' LOOK', fmt.w - rPad, bCY + Math.round(barH * 0.22))
      }

      setCardUrl(canvas.toDataURL('image/jpeg', 0.95))
    } catch (err) {
      console.error('Share card failed', err)
    }
    setGenerating(false)
  }, [beforeSrc, afterSrc, format, handle, lookName])

  useEffect(() => {
    if (beforeSrc && afterSrc) generateCard()
  }, [beforeSrc, afterSrc, format, handle, lookName, generateCard])

  const handleFile = async (f: File, which: 'before' | 'after') => {
    const url = await fileToDataUrl(f)
    if (which === 'before') setBeforeSrc(url)
    else setAfterSrc(url)
  }

  const download = async () => {
    if (!cardUrl) return
    const filename = `HALEA_ShareCard_${format}.jpg`

    // Try Web Share API first — works natively on iOS & Android
    // Shows the system share sheet with "Save Image", AirDrop, etc.
    if (canNativeShare) {
      try {
        const res  = await fetch(cardUrl)
        const blob = await res.blob()
        const file = new File([blob], filename, { type: 'image/jpeg' })
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], title: 'HALEA Share Card' })
          return
        }
      } catch (e) {
        // User cancelled share or API failed — fall through to download
        if ((e as Error).name === 'AbortError') return
      }
    }

    // Desktop fallback
    const a = document.createElement('a')
    a.href = cardUrl
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  const fmt = FORMATS[format]
  const ready = !!cardUrl && !generating

  return (
    <div className="min-h-screen pb-28 md:pb-16">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">

        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <Link href="/studio"
            className="flex items-center gap-1.5 text-t3 hover:text-accent transition-colors text-sm font-medium">
            <ArrowLeft size={15}/>Studio
          </Link>
          <div className="w-px h-4 bg-b1"/>
          <div className="flex-1 min-w-0">
            <h1 className="font-fraunces text-lg sm:text-2xl font-semibold leading-tight truncate">
              Share <span className="italic text-accent">Card</span>
            </h1>
          </div>
          {cardUrl && (
            <button onClick={generateCard} disabled={generating}
              className="flex items-center gap-1 text-t3 hover:text-accent transition-colors text-xs font-bold flex-shrink-0">
              <RefreshCw size={12} className={generating ? 'animate-spin' : ''}/>
              <span className="hidden sm:inline">Refresh</span>
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-5 items-start">

          {/* ── LEFT ─────────────────────────────────────────────────────────── */}
          <div className="flex flex-col gap-4">

            {/* Preview */}
            <div className="bg-s1 border border-b1 rounded-2xl overflow-hidden flex items-center justify-center relative"
              style={{ minHeight: '220px' }}>
              {generating && (
                <div className="absolute inset-0 flex items-center justify-center bg-s1/80 backdrop-blur-sm z-10 rounded-2xl">
                  <div className="flex flex-col items-center gap-3">
                    <span className="w-7 h-7 border-[3px] border-accent/30 border-t-accent rounded-full animate-spin block"/>
                    <p className="text-xs text-t2">Rendering...</p>
                  </div>
                </div>
              )}
              {cardUrl ? (
                <img src={cardUrl} alt="Share Card Preview"
                  className="max-w-full object-contain p-3"
                  style={{ maxHeight: '480px' }}/>
              ) : (
                <div className="flex flex-col items-center gap-3 py-10 text-t3 px-6 text-center">
                  <Share2 size={32} className="opacity-15"/>
                  <div>
                    <p className="text-sm font-bold">Upload Before &amp; After</p>
                    <p className="text-xs mt-1 opacity-60">Card akan muncul di sini</p>
                  </div>
                </div>
              )}
              <canvas ref={canvasRef} className="sr-only" aria-hidden/>
            </div>

            {/* Share tip for native share */}
            {cardUrl && canNativeShare && (
              <div className="bg-ok/10 border border-ok/20 rounded-xl px-4 py-2.5 flex items-center gap-2">
                <ImageIcon size={14} className="text-ok flex-shrink-0"/>
                <p className="text-[11px] text-ok leading-snug">
                  Tap <strong>Download</strong> → share sheet terbuka → pilih <strong>Save Image</strong> untuk simpan ke Photos
                </p>
              </div>
            )}

            {/* Upload zones */}
            <div className="grid grid-cols-2 gap-3">
              <UploadZone which="before" src={beforeSrc} onFile={f => handleFile(f, 'before')}/>
              <UploadZone which="after"  src={afterSrc}  onFile={f => handleFile(f, 'after')}/>
            </div>

            {/* Format picker — horizontal scroll on mobile */}
            <div>
              <p className="text-[9px] font-black tracking-widest uppercase text-t3 mb-2">Format</p>
              <div className="grid grid-cols-4 gap-2">
                {(Object.entries(FORMATS) as [Fmt, typeof FORMATS[Fmt]][]).map(([key, f]) => (
                  <button key={key} onClick={() => setFormat(key)}
                    className={`p-2.5 rounded-xl border text-left transition-all ${format === key ? 'border-accent bg-accent/10' : 'border-b1 bg-s2 hover:border-b3'}`}>
                    <p className={`font-black text-base leading-none mb-0.5 ${format === key ? 'text-accent' : 'text-txt'}`}>{f.label}</p>
                    <p className="text-[9px] text-t3 leading-tight">{f.sub}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Tips — hidden on mobile to save space */}
            <div className="hidden sm:block bg-s2 border border-b1 rounded-2xl p-4">
              <p className="text-[9px] font-black tracking-widest uppercase text-t3 mb-3">Tips share</p>
              <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                {[
                  ['📸 IG Post',    '1:1 — crop-safe'],
                  ['🖼 IG Portrait', '4:5 — reach lebih tinggi'],
                  ['🎬 Reels/TikTok','9:16 — full screen'],
                  ['🐦 Twitter/X',   '16:9 — thumbnail penuh'],
                ].map(([t, d]) => (
                  <div key={t}><p className="font-bold text-txt text-[11px]">{t}</p><p className="text-t3 text-[10px]">{d}</p></div>
                ))}
              </div>
            </div>
          </div>

          {/* ── RIGHT: Controls (desktop sidebar / stacked on mobile) ─────────── */}
          <div className="flex flex-col gap-4">

            {/* Branding */}
            <div className="bg-s2 border border-b1 rounded-2xl p-4 flex flex-col gap-3">
              <p className="text-[9px] font-black tracking-widest uppercase text-t3">Branding</p>
              <div>
                <label className="text-[10px] text-t2 block mb-1.5 font-semibold">IG / TikTok Handle</label>
                <input value={handle} onChange={e => setHandle(e.target.value)}
                  placeholder="@username"
                  className="w-full bg-s3 border border-b1 text-txt px-3 py-2.5 rounded-xl text-sm outline-none focus:border-accent transition-colors font-mono"/>
              </div>
              <div>
                <label className="text-[10px] text-t2 block mb-1.5 font-semibold">Nama Look / Grade</label>
                <input value={lookName} onChange={e => setLookName(e.target.value)}
                  placeholder="Teal Orange, Vintage..."
                  className="w-full bg-s3 border border-b1 text-txt px-3 py-2.5 rounded-xl text-sm outline-none focus:border-accent transition-colors"/>
              </div>
            </div>

            {/* Stats */}
            {cardUrl && (
              <div className="bg-s2 border border-b1 rounded-2xl overflow-hidden">
                {[
                  ['Output',  `${fmt.w}×${fmt.h}px`],
                  ['Format',  'JPEG 95%'],
                  ['Rasio',   fmt.label],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between items-center px-4 py-2.5 border-b border-b1 last:border-0">
                    <span className="text-[10px] text-t2">{k}</span>
                    <span className="text-[10px] font-mono font-bold text-accent">{v}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Download — desktop only; mobile uses sticky bar */}
            <div className="hidden md:block">
              <button onClick={download} disabled={!ready}
                className="w-full py-4 bg-accent text-white rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-orange-400 transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2.5 shadow-xl shadow-accent/20">
                {generating
                  ? <><span className="w-5 h-5 border-[3px] border-white/30 border-t-white rounded-full animate-spin"/>Rendering...</>
                  : <><Download size={17}/>Download JPEG</>}
              </button>
              {ready && canNativeShare && (
                <p className="text-[10px] text-t3 text-center mt-2 leading-relaxed">
                  Share sheet terbuka → pilih &quot;Save Image&quot; untuk simpan ke Photos
                </p>
              )}
            </div>

            <div className="hidden md:block border-t border-b1 pt-3 text-center">
              <Link href="/studio" className="text-[11px] text-t3 hover:text-accent transition-colors">
                ← Kembali ke Studio
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* ── MOBILE sticky bottom bar ────────────────────────────────────────── */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-30 border-t border-b1 glass px-4 py-3"
        style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom,0px))' }}>
        {!beforeSrc || !afterSrc ? (
          <p className="text-center text-xs text-t3 py-1">
            Upload foto <strong className="text-txt">BEFORE</strong> dan <strong className="text-txt">AFTER</strong> di atas ↑
          </p>
        ) : generating ? (
          <div className="flex items-center justify-center gap-2 py-1">
            <span className="w-4 h-4 border-2 border-accent/30 border-t-accent rounded-full animate-spin"/>
            <span className="text-sm text-t2">Rendering share card...</span>
          </div>
        ) : cardUrl ? (
          <div className="flex gap-3">
            <button onClick={download}
              className="flex-1 py-3.5 bg-accent text-white rounded-2xl font-black text-sm uppercase tracking-widest flex items-center justify-center gap-2 shadow-xl shadow-accent/30 active:scale-[0.97] transition-all">
              <Download size={16}/>
              {canNativeShare ? 'Simpan / Share' : 'Download JPEG'}
            </button>
            <button onClick={generateCard}
              className="w-12 h-12 rounded-2xl bg-s3 border border-b2 flex items-center justify-center text-t2 hover:border-b3 active:scale-[0.97] transition-all flex-shrink-0">
              <RefreshCw size={16}/>
            </button>
          </div>
        ) : (
          <button onClick={generateCard}
            className="w-full py-3.5 bg-accent text-white rounded-2xl font-black text-sm uppercase tracking-widest flex items-center justify-center gap-2 shadow-xl shadow-accent/30 active:scale-[0.97] transition-all">
            Generate Card →
          </button>
        )}
      </div>
    </div>
  )
}
