'use client'
import { useState, useRef, useEffect, useCallback } from 'react'
import { useAuthStore } from '@/store/auth'
import { Btn, Badge, SectionHeader, DropZone, toast } from '@/components/ui'
import { Zap, Sparkles } from 'lucide-react'

// ── Types ─────────────────────────────────────────────────────────────────────
type NodeType = 'primary' | 'look' | 'halation'
interface GradeNode {
  id: string; type: NodeType; enabled: boolean
  params: Record<string, number | string>
}

// ── Color Engine ──────────────────────────────────────────────────────────────
const clamp = (v: number, lo = 0, hi = 1) => v < lo ? lo : v > hi ? hi : v
const luma  = (r: number, g: number, b: number) => 0.2126*r + 0.7152*g + 0.0722*b

function applyNodes(r: number, g: number, b: number, nodes: GradeNode[]): [number,number,number] {
  for (const node of nodes) {
    if (!node.enabled) continue
    const p = node.params

    if (node.type === 'primary') {
      const lift=p.lift as number, gamma=p.gamma as number, temp=p.temp as number
      const tint=p.tint as number, con=p.con as number, sat=p.sat as number
      r = clamp(r + temp*0.15 + lift*(1-r)*0.8 + lift*0.2)
      g = clamp(g - tint*0.12 + lift*(1-g)*0.8 + lift*0.2)
      b = clamp(b - temp*0.15 + tint*0.04 + lift*(1-b)*0.8 + lift*0.2)
      if (gamma) { r=clamp(Math.pow(Math.max(r,0),1/(1+gamma))); g=clamp(Math.pow(Math.max(g,0),1/(1+gamma))); b=clamp(Math.pow(Math.max(b,0),1/(1+gamma))) }
      if (con)   { r=clamp(0.5+(r-0.5)*(1+con)); g=clamp(0.5+(g-0.5)*(1+con)); b=clamp(0.5+(b-0.5)*(1+con)) }
      if (sat)   { const lm=luma(r,g,b),sf=1+sat; r=clamp(lm+(r-lm)*sf); g=clamp(lm+(g-lm)*sf); b=clamp(lm+(b-lm)*sf) }
    }

    if (node.type === 'look') {
      const amount = p.amount as number
      const looks: Record<string,[number,number,number,number]> = {
        cinematic:[-0.05,0.15,0.04,0.02], warm:[0.05,0.05,0.02,0.08], cool:[0.02,0.06,0.02,-0.06],
        bleach:[-0.3,0.25,-0.02,0], vintage:[-0.1,0.05,0.06,0.05], teal_orange:[0.08,0.14,0.04,0.03],
        moody:[-0.18,0.1,0.07,-0.03], faithful:[0,0,0,0], natural:[0.02,0.02,0.01,0.01],
      }
      const [ls,lc,ll,lw] = looks[String(p.look)] ?? [0,0,0,0]
      const lm=luma(r,g,b), sf=1+ls
      let nr=clamp(lm+(r-lm)*sf), ng=clamp(lm+(g-lm)*sf), nb=clamp(lm+(b-lm)*sf)
      nr=clamp(0.5+(nr-0.5)*(1+lc)); ng=clamp(0.5+(ng-0.5)*(1+lc)); nb=clamp(0.5+(nb-0.5)*(1+lc))
      nr=clamp(nr+ll*(1-nr)+lw*0.25); ng=clamp(ng+ll*(1-ng)); nb=clamp(nb+ll*(1-nb)-lw*0.18)
      r=r+(nr-r)*amount; g=g+(ng-g)*amount; b=b+(nb-b)*amount
    }

    if (node.type === 'halation') {
      const thr=1-(p.threshold as number), lh=luma(r,g,b)
      if (lh > thr) {
        const fac=Math.pow((lh-thr)/(1-thr),1.5)*(p.intensity as number)
        r=clamp(r+fac*0.5); g=clamp(g+fac*0.03); b=clamp(b-fac*0.05)
      }
    }
  }
  return [r,g,b]
}

function bakeLUT(nodes: GradeNode[], size: number): Float32Array {
  const lut = new Float32Array(size**3*3)
  let i = 0
  for (let bi=0;bi<size;bi++) for (let gi=0;gi<size;gi++) for (let ri=0;ri<size;ri++) {
    const [r,g,b] = applyNodes(ri/(size-1), gi/(size-1), bi/(size-1), nodes)
    lut[i++]=clamp(r); lut[i++]=clamp(g); lut[i++]=clamp(b)
  }
  return lut
}

function trilinear(ri: number, gi: number, bi: number, lut: Float32Array, size: number): [number,number,number] {
  const R=ri/255*(size-1), G=gi/255*(size-1), B=bi/255*(size-1)
  const r0=Math.floor(R),g0=Math.floor(G),b0=Math.floor(B)
  const r1=Math.min(r0+1,size-1),g1=Math.min(g0+1,size-1),b1=Math.min(b0+1,size-1)
  const dr=R-r0,dg=G-g0,db=B-b0
  const gv=(a:number,c:number,d:number,ch:number)=>lut[(d*size*size+c*size+a)*3+ch]
  return [0,1,2].map(ch=>{
    const c0=(1-dg)*((1-dr)*gv(r0,g0,b0,ch)+dr*gv(r1,g0,b0,ch))+dg*((1-dr)*gv(r0,g1,b0,ch)+dr*gv(r1,g1,b0,ch))
    const c1=(1-dg)*((1-dr)*gv(r0,g0,b1,ch)+dr*gv(r1,g0,b1,ch))+dg*((1-dr)*gv(r0,g1,b1,ch)+dr*gv(r1,g1,b1,ch))
    return clamp(Math.round(((1-db)*c0+db*c1)*255),0,255)
  }) as [number,number,number]
}

const mkId = () => 'n' + Date.now() + Math.random().toString(36).slice(2,5)

// ── Component ─────────────────────────────────────────────────────────────────
export default function StudioPage() {
  const [nodes,    setNodes]    = useState<GradeNode[]>([])
  const [lut,      setLut]      = useState<Float32Array | null>(null)
  const [lutSize]               = useState(33)
  const [baking,   setBaking]   = useState(false)
  const [aiLoading,setAiLoading]= useState(false)
  const [refImg,   setRefImg]   = useState<string | null>(null)
  const [footImg,  setFootImg]  = useState<ImageData | null>(null)
  const [footSrc,  setFootSrc]  = useState<string | null>(null)
  const [afterSrc, setAfterSrc] = useState<string | null>(null)
  const [lutName,  setLutName]  = useState('HALEA_LUT_001')
  const [splitPos, setSplitPos] = useState(50)
  const [gradeInfo,setGradeInfo]= useState<{ desc: string; look: string; nodes: number } | null>(null)
  const { user, useCredit, credits } = useAuthStore()

  const splitRef = useRef<HTMLDivElement>(null)
  const rafRef   = useRef<number | null>(null)

  // ── Real-time preview (direct pixel, no LUT bake needed) ──────────────────
  useEffect(() => {
    if (!footImg || nodes.length === 0) { setAfterSrc(null); return }
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    rafRef.current = requestAnimationFrame(() => {
      const { data, width, height } = footImg
      const out = new Uint8ClampedArray(data.length)
      for (let i = 0; i < data.length; i += 4) {
        const [nr,ng,nb] = applyNodes(data[i]/255, data[i+1]/255, data[i+2]/255, nodes)
        out[i]=Math.round(clamp(nr)*255); out[i+1]=Math.round(clamp(ng)*255)
        out[i+2]=Math.round(clamp(nb)*255); out[i+3]=data[i+3]
      }
      const c = document.createElement('canvas')
      c.width=width; c.height=height
      c.getContext('2d')!.putImageData(new ImageData(out,width,height), 0, 0)
      setAfterSrc(c.toDataURL('image/jpeg', 0.92))
    })
  }, [nodes, footImg])

  // ── Bake LUT ──────────────────────────────────────────────────────────────
  const handleBake = useCallback(async () => {
    if (nodes.length === 0) { toast('Run AI Match dulu', 'warn'); return }
    setBaking(true)
    await new Promise(r => setTimeout(r, 20))
    setLut(bakeLUT(nodes, lutSize))
    setBaking(false)
    toast('✓ LUT baked — siap di-export')
  }, [nodes, lutSize])

  // ── AI Match ─────────────────────────────────────────────────────────────
  const handleAiMatch = async () => {
    if (!refImg) { toast('Upload reference photo dulu', 'err'); return }
    if (user?.role !== 'admin' && !useCredit()) { toast('Credits habis — beli di Shop', 'err'); return }
    setAiLoading(true)
    setLut(null)
    try {
      const b64 = refImg.split(',')[1]
      const res = await fetch('/api/ai-match', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514', max_tokens: 600,
          system: `You are a professional colorist. Analyze the visual look of the reference image. Return ONLY valid JSON with these exact keys: temp (float -0.4 to 0.4), tint (float -0.3 to 0.3), con (float -0.3 to 0.3), sat (float -0.4 to 0.4), gamma (float -0.3 to 0.3), blackLift (float 0 to 0.08), look (one of: faithful cinematic warm cool bleach vintage moody natural teal_orange), lookAmount (float 0 to 0.6), halationIntensity (float 0 to 0.35), description (string max 3 words). No markdown, no explanation, no code block.`,
          messages: [{ role: 'user', content: [
            { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: b64 } },
            { type: 'text', text: 'Analyze this image color grade and return JSON.' }
          ]}]
        })
      })
      if (!res.ok) throw new Error('API error ' + res.status)
      const data = await res.json()
      const raw = data.content?.map((c: { text?: string }) => c.text||'').join('').replace(/```[\w]*|```/g,'').trim()
      if (!raw) throw new Error('Empty response from AI')
      const p = JSON.parse(raw)
      const newNodes: GradeNode[] = [
        { id:mkId(), type:'primary',  enabled:true, params:{ lift:p.blackLift||0, gamma:p.gamma||0, temp:p.temp||0, tint:p.tint||0, con:p.con||0, sat:p.sat||0 } },
        { id:mkId(), type:'look',     enabled:p.look!=='faithful'&&(p.lookAmount||0)>0.05, params:{ look:p.look||'cinematic', amount:p.lookAmount||0.45 } },
        { id:mkId(), type:'halation', enabled:(p.halationIntensity||0)>0.05, params:{ threshold:0.65, intensity:p.halationIntensity||0.2 } },
      ]
      setNodes(newNodes)
      setGradeInfo({ desc:p.description||'Custom Grade', look:p.look||'cinematic', nodes:newNodes.filter(n=>n.enabled).length })
      toast('✓ ' + (p.description || 'Grade applied'))
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Unknown error'
      toast('AI Match gagal: ' + msg, 'err')
    }
    setAiLoading(false)
  }

  // ── Footage loader ─────────────────────────────────────────────────────────
  const handleFootage = (f: File) => {
    const img = new Image(), url = URL.createObjectURL(f)
    img.onload = () => {
      const c = document.createElement('canvas')
      // Max 480px for smooth real-time preview
      const scale = Math.min(1, 480/img.width)
      c.width=Math.round(img.width*scale); c.height=Math.round(img.height*scale)
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height)
      setFootImg(c.getContext('2d')!.getImageData(0, 0, c.width, c.height))
      setFootSrc(c.toDataURL())
      URL.revokeObjectURL(url)
    }
    img.src = url
  }

  // ── Export ────────────────────────────────────────────────────────────────
  const downloadLUT = (fmt: 'cube' | '3dl') => {
    if (!lut) { toast('Klik "Bake LUT" dulu sebelum download', 'warn'); return }
    const name = lutName || 'HALEA_LUT'
    let content = '', filename = ''
    if (fmt === 'cube') {
      filename = name + '.cube'
      content = `# HALEA — by @robbiesatriaa\nLUT_3D_SIZE ${lutSize}\nDOMAIN_MIN 0.0 0.0 0.0\nDOMAIN_MAX 1.0 1.0 1.0\n\n`
      for (let i=0;i<lut.length;i+=3) content+=`${lut[i].toFixed(6)} ${lut[i+1].toFixed(6)} ${lut[i+2].toFixed(6)}\n`
    } else {
      filename = name + '.3dl'
      content = `3DMESH\nMesh 1 12\n0 ${(lutSize-1)*4} ${(lutSize-1)*4} ${(lutSize-1)*4}\n\n`
      for (let i=0;i<lut.length;i+=3) content+=`${Math.round(lut[i]*4095)} ${Math.round(lut[i+1]*4095)} ${Math.round(lut[i+2]*4095)}\n`
    }
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([content])); a.download = filename; a.click()
    toast('✓ Downloaded: ' + filename)
  }

  const clearAll = () => {
    setRefImg(null); setNodes([]); setLut(null); setGradeInfo(null)
    setFootImg(null); setFootSrc(null); setAfterSrc(null)
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-[calc(100vh-56px)] overflow-hidden">

      {/* ── LEFT — AI Controls ──────────────────────────────────────────── */}
      <div className="w-72 flex-shrink-0 border-r border-b1 flex flex-col">

        <div className="px-4 py-3 border-b border-b1">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[9px] font-black tracking-widest uppercase text-accent">AI Match Studio</p>
              <h2 className="font-fraunces text-lg font-semibold leading-tight mt-0.5">
                Cinematic <span className="italic text-accent">Grade</span>
              </h2>
            </div>
            {(refImg || footImg) && (
              <button onClick={clearAll} className="text-[9px] text-t3 hover:text-err transition-colors font-bold">Reset</button>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-5">

          {/* Reference Photo */}
          <div>
            <SectionHeader accent>① Reference Photo</SectionHeader>
            <p className="text-[10px] text-t3 mb-2 leading-relaxed">
              Photo dengan <em>look</em> yang mau kamu tiru — film still, referensi, dll.
            </p>
            {refImg ? (
              <div className="relative group">
                <img src={refImg} alt="Reference" className="w-full h-36 object-cover rounded-xl border border-b1" />
                <button onClick={() => { setRefImg(null); setNodes([]); setLut(null); setGradeInfo(null); setAfterSrc(null) }}
                  className="absolute top-2 right-2 w-6 h-6 bg-black/70 rounded-full text-white text-[10px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-err">✕</button>
              </div>
            ) : (
              <DropZone label="Drop reference photo" sub="JPG · PNG · WEBP" icon="🖼" accept="image/*"
                onFile={f => { const r=new FileReader(); r.onload=e=>setRefImg(e.target?.result as string); r.readAsDataURL(f) }} />
            )}
          </div>

          {/* AI Match Button */}
          <div>
            {user?.role !== 'admin' && (
              <p className="text-[10px] text-t3 mb-2">AI Credits: <span className="text-accent font-bold">{credits}</span></p>
            )}
            <Btn variant="ai" size="lg" className="w-full" loading={aiLoading} onClick={handleAiMatch} disabled={!refImg}>
              <Sparkles size={15} /> Analyze &amp; Match Grade
            </Btn>
            {!refImg && <p className="text-[10px] text-t3 text-center mt-1.5">Upload reference photo dulu ↑</p>}
          </div>

          {/* Grade Result */}
          {gradeInfo && (
            <div className="bg-a4/10 border border-a4/25 rounded-xl p-3.5 space-y-2">
              <div className="flex items-center gap-1.5">
                <span className="text-[9px] font-black tracking-widest uppercase text-a4">Grade Applied ✦</span>
              </div>
              <p className="text-sm font-bold text-txt capitalize">{gradeInfo.desc}</p>
              <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                <span className="text-[10px] text-t2">Look: <span className="text-a4 font-medium">{gradeInfo.look}</span></span>
                <span className="text-[10px] text-t2">Nodes: <span className="text-a4 font-medium">{gradeInfo.nodes} active</span></span>
              </div>
              <button onClick={handleAiMatch} disabled={aiLoading}
                className="text-[9px] font-bold text-a4/70 hover:text-a4 transition-colors disabled:opacity-40">
                ↻ Re-run with same photo
              </button>
            </div>
          )}

          {/* Footage Still */}
          <div>
            <SectionHeader accent>② Footage Still</SectionHeader>
            <p className="text-[10px] text-t3 mb-2 leading-relaxed">
              Frame dari footage kamu — untuk preview before/after.
            </p>
            {footSrc ? (
              <div className="relative group">
                <img src={footSrc} alt="Footage" className="w-full h-28 object-cover rounded-xl border border-b1" />
                <button onClick={() => { setFootImg(null); setFootSrc(null); setAfterSrc(null) }}
                  className="absolute top-2 right-2 w-6 h-6 bg-black/70 rounded-full text-white text-[10px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-err">✕</button>
              </div>
            ) : (
              <DropZone label="Drop footage still" sub="JPG · PNG · WEBP" icon="🎬" accept="image/*"
                onFile={handleFootage} />
            )}
          </div>

        </div>

        {/* Bake button */}
        <div className="p-3 border-t border-b1 flex flex-col gap-1.5">
          <Btn variant="accent" size="lg" className="w-full" loading={baking} onClick={handleBake}
            disabled={nodes.length === 0}>
            <Zap size={14} /> Bake LUT
          </Btn>
          <p className="text-[9px] text-t3 text-center">
            {nodes.length === 0 ? 'Run AI Match dulu' : 'Preview live · Bake untuk export'}
          </p>
        </div>
      </div>

      {/* ── CENTER — Preview ────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <div className="h-10 flex-shrink-0 border-b border-b1 flex items-center px-4 gap-3">
          <span className="text-[9px] font-black tracking-widest uppercase text-t3">Preview</span>
          {afterSrc && (
            <span className="flex items-center gap-1.5 text-[9px] font-black uppercase text-ok">
              <span className="w-1.5 h-1.5 rounded-full bg-ok animate-pulse inline-block" />LIVE
            </span>
          )}
          {lut && <Badge color="accent">LUT Ready</Badge>}
          <span className="ml-auto text-[9px] text-t3 font-mono">
            {afterSrc ? 'Geser handle ⇔ untuk compare' : footImg ? 'Run AI Match untuk lihat preview' : 'Drop footage still di kiri'}
          </span>
        </div>

        <div className="flex-1 overflow-hidden relative bg-[#0a0a0a] flex items-center justify-center">
          {!footImg ? (
            /* Empty state */
            <label className="flex flex-col items-center gap-4 text-t3 cursor-pointer group select-none">
              <input type="file" accept="image/*" className="sr-only" onChange={e=>{const f=e.target.files?.[0];if(f)handleFootage(f)}} />
              <div className="w-20 h-20 rounded-2xl bg-s2 border border-b1 flex items-center justify-center text-4xl opacity-30 group-hover:opacity-60 group-hover:border-b3 transition-all">🎬</div>
              <div className="text-center">
                <p className="text-sm font-bold group-hover:text-accent transition-colors">Drop footage still di sini</p>
                <p className="text-xs opacity-50 mt-1">atau klik untuk pilih file</p>
              </div>
            </label>
          ) : !afterSrc ? (
            /* Footage loaded but no grade yet */
            <div className="relative w-full h-full flex items-center justify-center">
              <img src={footSrc!} alt="Footage" draggable={false}
                className="max-w-full max-h-full object-contain opacity-60 pointer-events-none" />
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="bg-black/70 backdrop-blur-sm rounded-2xl px-6 py-4 text-center border border-white/10">
                  <Sparkles size={24} className="text-a4 mx-auto mb-2 opacity-80" />
                  <p className="text-sm font-bold text-white mb-1">Upload reference → AI Match</p>
                  <p className="text-[11px] text-white/50">Grade akan muncul di sini secara live</p>
                </div>
              </div>
            </div>
          ) : (
            /* Before / After split viewer */
            <div
              ref={splitRef}
              className="relative w-full h-full overflow-hidden"
              style={{ userSelect: 'none' }}
            >
              {/* BEFORE — base layer, full width */}
              <img
                src={footSrc!} alt="Before" draggable={false}
                className="absolute inset-0 w-full h-full object-contain pointer-events-none"
              />

              {/* AFTER — right side only (clipPath inset from left) */}
              <img
                src={afterSrc} alt="After" draggable={false}
                className="absolute inset-0 w-full h-full object-contain pointer-events-none"
                style={{ clipPath: `inset(0 0 0 ${splitPos}%)` }}
              />

              {/* Drag handle — only this element is interactive */}
              <div
                className="absolute top-0 bottom-0 z-20 touch-none"
                style={{
                  left: `${splitPos}%`,
                  transform: 'translateX(-50%)',
                  width: '48px',
                  cursor: 'col-resize',
                }}
                onPointerDown={e => e.currentTarget.setPointerCapture(e.pointerId)}
                onPointerMove={e => {
                  if (e.buttons !== 1) return
                  const rect = splitRef.current!.getBoundingClientRect()
                  setSplitPos(Math.max(2, Math.min(98, (e.clientX - rect.left) / rect.width * 100)))
                }}
              >
                {/* Line */}
                <div className="absolute top-0 bottom-0 left-1/2 -translate-x-1/2 w-0.5 bg-white/90 shadow-[0_0_8px_rgba(255,255,255,0.5)]" />
                {/* Knob */}
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white shadow-2xl flex items-center justify-center select-none"
                  style={{ fontSize: 14, fontWeight: 900, color: '#000' }}>
                  ⇔
                </div>
              </div>

              {/* Labels */}
              <span className="absolute bottom-4 left-4 text-[9px] font-black text-white/80 tracking-widest uppercase bg-black/60 px-2.5 py-1 rounded-full pointer-events-none backdrop-blur-sm">
                BEFORE
              </span>
              <span className="absolute bottom-4 right-4 text-[9px] font-black text-white/80 tracking-widest uppercase bg-black/60 px-2.5 py-1 rounded-full pointer-events-none backdrop-blur-sm">
                AFTER
              </span>
            </div>
          )}
        </div>
      </div>

      {/* ── RIGHT — Export ──────────────────────────────────────────────── */}
      <div className="w-60 flex-shrink-0 border-l border-b1 flex flex-col">
        <div className="h-10 border-b border-b1 flex items-center px-4">
          <span className="text-[9px] font-black tracking-widest uppercase text-t3">Export</span>
          {lut && <span className="ml-auto"><Badge color="ok">Ready</Badge></span>}
        </div>

        <div className="flex-1 p-4 flex flex-col gap-4 overflow-y-auto">
          <div>
            <label className="text-[9px] font-black tracking-widest uppercase text-t3 block mb-1.5">LUT Name</label>
            <input value={lutName} onChange={e=>setLutName(e.target.value)}
              className="w-full bg-s2 border border-b1 text-txt px-3 py-2 rounded-lg text-sm outline-none focus:border-accent transition-colors" />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => downloadLUT('cube')} disabled={!lut}
              className="flex flex-col items-center gap-1.5 bg-s2 border border-b1 rounded-xl p-3 hover:border-accent hover:bg-s3 transition-all disabled:opacity-30 disabled:cursor-not-allowed">
              <span className="font-black text-lg text-txt leading-none">.cube</span>
              <span className="text-[9px] text-t3">Resolve · PP</span>
            </button>
            <button onClick={() => downloadLUT('3dl')} disabled={!lut}
              className="flex flex-col items-center gap-1.5 bg-s2 border border-b1 rounded-xl p-3 hover:border-accent hover:bg-s3 transition-all disabled:opacity-30 disabled:cursor-not-allowed">
              <span className="font-black text-lg text-txt leading-none">.3dl</span>
              <span className="text-[9px] text-t3">Flame · Lustre</span>
            </button>
          </div>

          {!lut ? (
            <div className="bg-s2 border border-b1 border-dashed rounded-xl p-3 text-center">
              <p className="text-[10px] text-t3 leading-relaxed">
                Klik <strong className="text-txt">Bake LUT</strong> untuk generate file export
              </p>
            </div>
          ) : (
            <div className="bg-s2 border border-b1 rounded-xl overflow-hidden">
              {[['Size', lutSize+'³'], ['Active nodes', nodes.filter(n=>n.enabled).length+'']].map(([k,v])=>(
                <div key={k} className="flex justify-between px-3 py-2 border-b border-b1 last:border-0 text-xs">
                  <span className="text-t2">{k}</span>
                  <span className="text-accent font-mono font-bold">{v}</span>
                </div>
              ))}
            </div>
          )}

          <div className="space-y-3 pt-1">
            <p className="text-[9px] font-black tracking-widest uppercase text-t3">How to use</p>
            <div className="text-[10px] text-t2 leading-relaxed space-y-2">
              <p><strong className="text-txt block">Premiere Pro</strong>Lumetri → Creative → Look → Browse .cube</p>
              <p><strong className="text-txt block">DaVinci Resolve</strong>Color → LUTs → Right click → Refresh, paste .cube</p>
              <p><strong className="text-txt block">After Effects</strong>Effect → Apply Color LUT → .cube</p>
              <p><strong className="text-txt block">CapCut Pro</strong>Filter → Add → Import LUT</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
