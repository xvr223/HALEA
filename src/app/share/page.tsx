'use client'
import { useState, useRef, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { ArrowLeft, Download, Share2, RefreshCw } from 'lucide-react'

// ── Types & constants ─────────────────────────────────────────────────────────
type Fmt = 'square' | 'portrait' | 'story' | 'wide'

const FORMATS: Record<Fmt, { w: number; h: number; label: string; sub: string }> = {
  square:   { w: 1080, h: 1080, label: '1:1',  sub: 'Instagram Post'   },
  portrait: { w: 1080, h: 1350, label: '4:5',  sub: 'IG Feed Portrait' },
  story:    { w: 1080, h: 1920, label: '9:16', sub: 'Reels · TikTok'   },
  wide:     { w: 1920, h: 1080, label: '16:9', sub: 'YouTube · Twitter' },
}

// ── Canvas helpers ────────────────────────────────────────────────────────────
function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x+r,y); ctx.lineTo(x+w-r,y); ctx.arcTo(x+w,y,x+w,y+r,r)
  ctx.lineTo(x+w,y+h-r); ctx.arcTo(x+w,y+h,x+w-r,y+h,r)
  ctx.lineTo(x+r,y+h); ctx.arcTo(x,y+h,x,y+h-r,r)
  ctx.lineTo(x,y+r); ctx.arcTo(x,y,x+r,y,r)
  ctx.closePath()
}

function loadImg(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

function fileToDataUrl(f: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(f)
    const img = new Image()
    img.onload = () => {
      const c = document.createElement('canvas')
      const scale = Math.min(1, 1080 / Math.max(img.width, img.height))
      c.width  = Math.round(img.width  * scale)
      c.height = Math.round(img.height * scale)
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height)
      URL.revokeObjectURL(url)
      resolve(c.toDataURL('image/jpeg', 0.92))
    }
    img.onerror = reject
    img.src = url
  })
}

// ── Main component ────────────────────────────────────────────────────────────
export default function SharePage() {
  const [beforeSrc, setBeforeSrc] = useState<string | null>(null)
  const [afterSrc,  setAfterSrc]  = useState<string | null>(null)
  const [format,    setFormat]    = useState<Fmt>('square')
  const [handle,    setHandle]    = useState('@robbiesatriaa')
  const [lookName,  setLookName]  = useState('')
  const [cardUrl,   setCardUrl]   = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)
  const [cardSize,  setCardSize]  = useState(0)
  const [dragBefore, setDragBefore] = useState(false)
  const [dragAfter,  setDragAfter]  = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  // Load images from sessionStorage (populated by studio page)
  useEffect(() => {
    try {
      const b = sessionStorage.getItem('halea_share_before')
      const a = sessionStorage.getItem('halea_share_after')
      const g = sessionStorage.getItem('halea_share_grade')
      if (b) setBeforeSrc(b)
      if (a) setAfterSrc(a)
      if (g && g !== 'natural' && g !== '') setLookName(g)
    } catch {}
  }, [])

  // ── Canvas render ─────────────────────────────────────────────────────────
  const generateCard = useCallback(async () => {
    if (!beforeSrc || !afterSrc || !canvasRef.current) return
    setGenerating(true)
    try {
      const [bImg, aImg] = await Promise.all([loadImg(beforeSrc), loadImg(afterSrc)])
      const fmt = FORMATS[format]
      const canvas = canvasRef.current
      canvas.width  = fmt.w
      canvas.height = fmt.h
      const ctx = canvas.getContext('2d')!

      const barH   = Math.round(fmt.h * 0.10)
      const imgH   = fmt.h - barH
      const halfW  = Math.round(fmt.w / 2)

      // ── Background ──
      ctx.fillStyle = '#0a0a0a'
      ctx.fillRect(0, 0, fmt.w, fmt.h)

      // ── Draw image cropped into rect ──
      const drawImg = (img: HTMLImageElement, rx: number, ry: number, rw: number, rh: number) => {
        const s  = Math.max(rw / img.width, rh / img.height)
        const sw = img.width  * s
        const sh = img.height * s
        ctx.save()
        ctx.beginPath(); ctx.rect(rx, ry, rw, rh); ctx.clip()
        ctx.drawImage(img, rx + (rw - sw) / 2, ry + (rh - sh) / 2, sw, sh)
        ctx.restore()
      }
      drawImg(bImg, 0,     0, halfW, imgH)
      drawImg(aImg, halfW, 0, halfW, imgH)

      // ── Side vignettes ──
      ;[0, halfW].forEach(ox => {
        const g = ctx.createLinearGradient(ox, 0, ox + halfW, 0)
        g.addColorStop(0,    'rgba(0,0,0,0.28)')
        g.addColorStop(0.22, 'rgba(0,0,0,0)')
        g.addColorStop(0.78, 'rgba(0,0,0,0)')
        g.addColorStop(1,    'rgba(0,0,0,0.28)')
        ctx.fillStyle = g
        ctx.fillRect(ox, 0, halfW, imgH)
      })

      // ── Bottom gradient fade ──
      const fH = barH * 2.2
      const fg = ctx.createLinearGradient(0, imgH - fH, 0, imgH)
      fg.addColorStop(0, 'rgba(0,0,0,0)')
      fg.addColorStop(1, 'rgba(0,0,0,0.72)')
      ctx.fillStyle = fg
      ctx.fillRect(0, imgH - fH, fmt.w, fH)

      // ── Divider line ──
      ctx.shadowColor = 'rgba(255,255,255,0.55)'
      ctx.shadowBlur  = 18
      ctx.strokeStyle = 'rgba(255,255,255,0.90)'
      ctx.lineWidth   = Math.max(2, Math.round(fmt.w * 0.0022))
      ctx.beginPath(); ctx.moveTo(halfW, 0); ctx.lineTo(halfW, imgH); ctx.stroke()
      ctx.shadowBlur  = 0

      // ── Handle knob ──
      const hR  = Math.round(fmt.w * 0.030)
      const hCY = Math.round(imgH / 2)
      // outer glow ring
      ctx.strokeStyle = 'rgba(255,255,255,0.25)'
      ctx.lineWidth   = Math.round(hR * 0.25)
      ctx.beginPath(); ctx.arc(halfW, hCY, hR + hR * 0.35, 0, Math.PI * 2); ctx.stroke()
      // white circle
      ctx.fillStyle = 'white'
      ctx.beginPath(); ctx.arc(halfW, hCY, hR, 0, Math.PI * 2); ctx.fill()
      // arrow icon
      ctx.fillStyle   = '#111'
      ctx.textAlign   = 'center'
      ctx.textBaseline = 'middle'
      ctx.font = `bold ${Math.round(hR * 1.05)}px sans-serif`
      ctx.fillText('⇔', halfW, hCY + 1)

      // ── BEFORE / AFTER labels ──
      const lPad  = Math.round(fmt.w * 0.020)
      const lFS   = Math.round(fmt.w * 0.0135)
      const lH    = lFS + 12
      const lBR   = lH / 2
      const lY    = imgH - lPad - lH

      const drawLbl = (text: string, ax: number, rightAlign?: boolean) => {
        ctx.font = `900 ${lFS}px -apple-system, Arial, sans-serif`
        const tw = ctx.measureText(text).width
        const lx = rightAlign ? ax - tw - lPad * 1.3 : ax
        ctx.fillStyle = 'rgba(0,0,0,0.62)'
        roundRect(ctx, lx - lPad * 0.65, lY, tw + lPad * 1.3, lH, lBR)
        ctx.fill()
        ctx.fillStyle    = 'rgba(255,255,255,0.92)'
        ctx.textAlign    = 'left'
        ctx.textBaseline = 'middle'
        ctx.fillText(text, lx, lY + lH / 2)
      }
      drawLbl('BEFORE', lPad)
      drawLbl('AFTER',  fmt.w - lPad, true)

      // ── Branding bar ──────────────────────────────────────────────────────
      ctx.fillStyle = '#0d0d0d'
      ctx.fillRect(0, imgH, fmt.w, barH)

      // accent top border
      ctx.fillStyle = '#f97316'
      ctx.fillRect(0, imgH, fmt.w, Math.max(2, Math.round(fmt.h * 0.0022)))

      const bCY = imgH + Math.round(barH / 2)
      const lx0 = Math.round(fmt.w * 0.038)

      // Logo circles (HALEA mark)
      const lR  = Math.round(barH * 0.29)
      const lcX = lx0 + lR

      ctx.strokeStyle = 'rgba(249,115,22,0.28)'; ctx.lineWidth = Math.max(1, lR * 0.14)
      ctx.beginPath(); ctx.arc(lcX, bCY, lR, 0, Math.PI * 2); ctx.stroke()
      ctx.strokeStyle = 'rgba(249,115,22,0.62)'; ctx.lineWidth = Math.max(1.5, lR * 0.19)
      ctx.beginPath(); ctx.arc(lcX, bCY, lR * 0.61, 0, Math.PI * 2); ctx.stroke()
      ctx.fillStyle = '#f97316'
      ctx.beginPath(); ctx.arc(lcX, bCY, lR * 0.30, 0, Math.PI * 2); ctx.fill()

      // HALEA wordmark
      const tX   = lcX + lR + Math.round(fmt.w * 0.014)
      const tFS  = Math.round(barH * 0.40)
      const sFS  = Math.round(barH * 0.185)
      ctx.fillStyle    = 'white'
      ctx.textAlign    = 'left'
      ctx.textBaseline = 'middle'
      ctx.font = `600 ${tFS}px Georgia, 'Times New Roman', serif`
      ctx.fillText('HALEA', tX, bCY - Math.round(tFS * 0.24))
      ctx.fillStyle = 'rgba(255,255,255,0.36)'
      ctx.font      = `${sFS}px monospace`
      ctx.fillText('halea.vercel.app', tX, bCY + Math.round(tFS * 0.38))

      // Right side: handle + look name
      const rPad = Math.round(fmt.w * 0.038)
      ctx.textAlign = 'right'

      if (handle) {
        const hFS = Math.round(barH * 0.26)
        ctx.fillStyle = 'rgba(255,255,255,0.80)'
        ctx.font      = `bold ${hFS}px -apple-system, Arial, sans-serif`
        ctx.fillText(handle, fmt.w - rPad, bCY - (lookName ? Math.round(barH * 0.13) : 0))
      }
      if (lookName) {
        const gFS = Math.round(barH * 0.19)
        ctx.fillStyle = '#f97316'
        ctx.font      = `${gFS}px monospace`
        ctx.fillText(lookName.toUpperCase() + ' LOOK', fmt.w - rPad, bCY + Math.round(barH * 0.22))
      }

      const dataUrl = canvas.toDataURL('image/jpeg', 0.95)
      setCardUrl(dataUrl)
      // approx size in KB (base64 overhead ~4/3)
      setCardSize(Math.round(dataUrl.length * 0.75 / 1024))
    } catch (err) {
      console.error('Share card generation failed', err)
    }
    setGenerating(false)
  }, [beforeSrc, afterSrc, format, handle, lookName])

  // Re-render whenever inputs change
  useEffect(() => {
    if (beforeSrc && afterSrc) generateCard()
  }, [beforeSrc, afterSrc, format, handle, lookName, generateCard])

  // ── File handling ─────────────────────────────────────────────────────────
  const handleFile = async (f: File, which: 'before' | 'after') => {
    const url = await fileToDataUrl(f)
    if (which === 'before') setBeforeSrc(url)
    else setAfterSrc(url)
  }

  const download = () => {
    if (!cardUrl) return
    const a = document.createElement('a')
    a.href     = cardUrl
    a.download = `HALEA_ShareCard_${format}.jpg`
    a.click()
  }

  // ── Upload zone ───────────────────────────────────────────────────────────
  const UploadZone = ({ which }: { which: 'before' | 'after' }) => {
    const isDrag = which === 'before' ? dragBefore : dragAfter
    const setDrag = which === 'before' ? setDragBefore : setDragAfter
    const src    = which === 'before' ? beforeSrc : afterSrc
    const lbl    = which === 'before' ? 'BEFORE'  : 'AFTER'
    const accent = which === 'before' ? 'hover:border-b3' : 'hover:border-accent/50'
    const lblCls = which === 'after'  ? 'text-accent bg-accent/20' : 'text-white/80 bg-black/60'

    return (
      <label
        className={`relative flex flex-col items-center justify-center rounded-2xl border-2 border-dashed cursor-pointer transition-all overflow-hidden ${isDrag ? 'border-accent bg-accent/5 scale-[0.98]' : `border-b2 bg-s2 ${accent}`}`}
        style={{ aspectRatio: '16/10' }}
        onDragOver  ={e => { e.preventDefault(); setDrag(true) }}
        onDragLeave ={() => setDrag(false)}
        onDrop      ={e => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f, which) }}>
        <input type="file" accept="image/*" className="sr-only"
          onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f, which) }}/>
        {src ? (
          <>
            <img src={src} alt={lbl} className="absolute inset-0 w-full h-full object-cover"/>
            <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent"/>
            <span className={`absolute bottom-3 left-3 text-[10px] font-black tracking-widest px-2.5 py-1.5 rounded-full backdrop-blur-sm ${lblCls}`}>
              {lbl}
            </span>
            <span className="absolute top-2 right-2 text-[9px] text-white/50 bg-black/50 px-2 py-0.5 rounded-full font-mono">
              Ganti ↑
            </span>
          </>
        ) : (
          <div className="flex flex-col items-center gap-3 p-6 text-center select-none">
            <span className="text-4xl opacity-20 leading-none">{which === 'before' ? '🖼' : '✦'}</span>
            <div>
              <p className="text-sm font-bold text-t2">{lbl}</p>
              <p className="text-[10px] text-t3 mt-0.5">Drop atau klik untuk upload</p>
            </div>
          </div>
        )}
      </label>
    )
  }

  const fmt = FORMATS[format]

  return (
    <div className="min-h-screen pb-16">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">

        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <Link href="/studio"
            className="flex items-center gap-1.5 text-t3 hover:text-accent transition-colors text-sm font-medium">
            <ArrowLeft size={15}/>Studio
          </Link>
          <div className="w-px h-4 bg-b1"/>
          <div>
            <h1 className="font-fraunces text-xl sm:text-2xl font-semibold leading-tight">
              Share <span className="italic text-accent">Card</span> Generator
            </h1>
            <p className="text-t3 text-[11px] mt-0.5 font-mono">Buat kartu before/after siap share ke IG · TikTok · Twitter</p>
          </div>
          {cardUrl && (
            <button onClick={generateCard} disabled={generating}
              className="ml-auto flex items-center gap-1.5 text-t3 hover:text-accent transition-colors text-xs font-bold">
              <RefreshCw size={13} className={generating ? 'animate-spin' : ''}/>
              Refresh
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-6 items-start">

          {/* ── LEFT: Preview ───────────────────────────────────────────────── */}
          <div className="flex flex-col gap-4">

            {/* Canvas preview */}
            <div
              className="bg-s1 border border-b1 rounded-2xl overflow-hidden flex items-center justify-center p-4 relative"
              style={{ minHeight: '300px' }}>
              {generating && (
                <div className="absolute inset-0 flex items-center justify-center bg-s1/80 backdrop-blur-sm z-10 rounded-2xl">
                  <div className="flex flex-col items-center gap-3">
                    <span className="w-8 h-8 border-[3px] border-accent/30 border-t-accent rounded-full animate-spin block"/>
                    <p className="text-xs text-t2">Rendering card...</p>
                  </div>
                </div>
              )}
              {cardUrl ? (
                <img src={cardUrl} alt="Share Card Preview"
                  className="max-w-full object-contain rounded-xl shadow-2xl shadow-black/50"
                  style={{ maxHeight: '520px' }}/>
              ) : (
                <div className="flex flex-col items-center gap-4 py-12 text-t3">
                  <Share2 size={36} className="opacity-15"/>
                  <div className="text-center">
                    <p className="text-sm font-bold">Upload Before & After</p>
                    <p className="text-xs mt-1 opacity-70">untuk preview share card</p>
                  </div>
                </div>
              )}
              <canvas ref={canvasRef} className="sr-only" aria-hidden/>
            </div>

            {/* Upload zones */}
            <div className="grid grid-cols-2 gap-3">
              <UploadZone which="before"/>
              <UploadZone which="after"/>
            </div>

            {/* Tips */}
            <div className="bg-s2 border border-b1 rounded-2xl p-4">
              <p className="text-[9px] font-black tracking-widest uppercase text-t3 mb-3">Tips share</p>
              <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-[11px] text-t2">
                {[
                  ['📸 Instagram Post', '1:1 — crop-safe, engagement tinggi'],
                  ['🖼 IG Feed Portrait', '4:5 — lebih besar di feed, reach ↑'],
                  ['🎬 Reels & TikTok', '9:16 — tambah musik & caption di app'],
                  ['🐦 Twitter/X', '16:9 — thumbnail preview penuh'],
                  ['💡 Hashtag saran', '#HALEA #colorgrading #preset #LUT'],
                  ['✨ Caption ide', '"Before vs After dengan LUT HALEA 🎞"'],
                ].map(([t, d]) => (
                  <div key={t}>
                    <p className="font-bold text-txt text-[11px]">{t}</p>
                    <p className="text-t3 text-[10px] leading-relaxed">{d}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ── RIGHT: Controls ──────────────────────────────────────────────── */}
          <div className="flex flex-col gap-4">

            {/* Format selector */}
            <div className="bg-s2 border border-b1 rounded-2xl p-4">
              <p className="text-[9px] font-black tracking-widest uppercase text-t3 mb-3">Format</p>
              <div className="grid grid-cols-2 gap-2">
                {(Object.entries(FORMATS) as [Fmt, (typeof FORMATS)[Fmt]][]).map(([key, f]) => (
                  <button key={key} onClick={() => setFormat(key)}
                    className={`p-3.5 rounded-xl border text-left transition-all ${format === key ? 'border-accent bg-accent/10' : 'border-b1 bg-s3 hover:border-b3'}`}>
                    <p className={`font-black text-xl leading-none mb-1 ${format === key ? 'text-accent' : 'text-txt'}`}>
                      {f.label}
                    </p>
                    <p className="text-[10px] text-t3 leading-snug">{f.sub}</p>
                    <p className="text-[9px] font-mono text-t3 mt-1 opacity-60">{f.w}×{f.h}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Branding inputs */}
            <div className="bg-s2 border border-b1 rounded-2xl p-4 flex flex-col gap-3">
              <p className="text-[9px] font-black tracking-widest uppercase text-t3">Branding</p>
              <div>
                <label className="text-[10px] text-t2 block mb-1.5 font-semibold">Instagram / TikTok Handle</label>
                <input value={handle} onChange={e => setHandle(e.target.value)}
                  placeholder="@username"
                  className="w-full bg-s3 border border-b1 text-txt px-3 py-2.5 rounded-xl text-sm outline-none focus:border-accent transition-colors font-mono"/>
              </div>
              <div>
                <label className="text-[10px] text-t2 block mb-1.5 font-semibold">Nama Grade / Look</label>
                <input value={lookName} onChange={e => setLookName(e.target.value)}
                  placeholder="Teal Orange, Vintage, Moody..."
                  className="w-full bg-s3 border border-b1 text-txt px-3 py-2.5 rounded-xl text-sm outline-none focus:border-accent transition-colors"/>
                <p className="text-[9px] text-t3 mt-1.5">Muncul di pojok kanan bawah card (orange)</p>
              </div>
            </div>

            {/* Card info */}
            {cardUrl && (
              <div className="bg-s2 border border-b1 rounded-2xl overflow-hidden">
                {[
                  ['Ukuran output', `${fmt.w} × ${fmt.h} px`],
                  ['Format',        'JPEG 95%'],
                  ['Estimasi file', `~${cardSize} KB`],
                  ['Rasio',         fmt.label],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between items-center px-4 py-2.5 border-b border-b1 last:border-0">
                    <span className="text-[10px] text-t2">{k}</span>
                    <span className="text-[10px] font-mono font-bold text-accent">{v}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Download button */}
            <button onClick={download} disabled={!cardUrl || generating}
              className="w-full py-4 bg-accent text-white rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-orange-400 transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2.5 shadow-xl shadow-accent/20">
              {generating ? (
                <><span className="w-5 h-5 border-[3px] border-white/30 border-t-white rounded-full animate-spin"/>Rendering...</>
              ) : (
                <><Download size={17}/>Download JPEG</>
              )}
            </button>

            <p className="text-[10px] text-t3 text-center -mt-2 leading-relaxed">
              File disimpan ke perangkat — upload langsung ke IG / TikTok / Twitter
            </p>

            {/* Back to studio */}
            <div className="border-t border-b1 pt-4 text-center">
              <Link href="/studio"
                className="text-[11px] text-t3 hover:text-accent transition-colors font-medium">
                ← Kembali ke Studio untuk buat LUT baru
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
