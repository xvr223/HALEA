'use client'
import { useState, useRef, useEffect, useCallback } from 'react'
import { Btn, Badge, SectionHeader, DropZone, toast } from '@/components/ui'
import { Zap } from 'lucide-react'

// ── Types ─────────────────────────────────────────────────────────────────────
type NodeType = 'primary' | 'look' | 'halation'
interface GradeNode {
  id: string; type: NodeType; enabled: boolean
  params: Record<string, number | string>
}

// ── Color Helpers ─────────────────────────────────────────────────────────────
const clamp = (v: number, lo = 0, hi = 1) => v < lo ? lo : v > hi ? hi : v
const luma  = (r: number, g: number, b: number) => 0.2126*r + 0.7152*g + 0.0722*b

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const max=Math.max(r,g,b), min=Math.min(r,g,b), d=max-min
  const l=(max+min)/2
  if (d===0) return [0,0,l]
  const s = l>0.5 ? d/(2-max-min) : d/(max+min)
  let h=0
  if      (max===r) h=((g-b)/d+(g<b?6:0))/6
  else if (max===g) h=((b-r)/d+2)/6
  else              h=((r-g)/d+4)/6
  return [h,s,l]
}

// ── Color Science Engine ──────────────────────────────────────────────────────
interface GradeResult {
  temp: number; tint: number; con: number; gamma: number
  sat: number; lift: number; halation: number
  look: string; lookAmount: number; desc: string
}

function analyzeColorProfile(imageData: ImageData): GradeResult {
  const { data } = imageData
  let sumR=0, sumG=0, sumB=0, sumS=0, sumL=0
  let cosH=0, sinH=0
  let shadowL=0, shadowN=0, highL=0, highN=0, count=0

  // Sample every 4th pixel — fast enough for real-time
  for (let i=0; i<data.length; i+=16) {
    const r=data[i]/255, g=data[i+1]/255, b=data[i+2]/255
    const [h,s,l] = rgbToHsl(r,g,b)
    sumR+=r; sumG+=g; sumB+=b; sumS+=s; sumL+=l
    cosH+=Math.cos(h*Math.PI*2); sinH+=Math.sin(h*Math.PI*2)
    if (l<0.25) { shadowL+=l; shadowN++ }
    if (l>0.72) { highL+=l;   highN++   }
    count++
  }

  const n=count
  const avgR=sumR/n, avgG=sumG/n, avgB=sumB/n
  const avgS=sumS/n, avgL=sumL/n
  const avgShadowL = shadowN ? shadowL/shadowN : 0.08
  const avgHighL   = highN   ? highL/highN     : 0.88
  const domH = ((Math.atan2(sinH/n, cosH/n)/(Math.PI*2))+1)%1

  // Color temperature: warm = R>B, cool = B>R
  const temp  = clamp((avgR-avgB)*2.2, -0.4, 0.4)
  // Tint: magenta vs green cast
  const tint  = clamp(((avgR+avgB)/2-avgG)*1.8, -0.3, 0.3)
  // Contrast from shadow-highlight spread
  const con   = clamp((avgHighL-avgShadowL-0.55)*0.8, -0.3, 0.3)
  // Gamma from average brightness (0.47 = neutral perceived mid)
  const gamma = clamp((0.47-avgL)*0.7, -0.3, 0.3)
  // Saturation deviation from typical natural image (~0.33)
  const sat   = clamp((avgS-0.33)*1.5, -0.4, 0.4)
  // Lift from crushed shadows
  const lift  = clamp(Math.max(0,avgShadowL-0.04)*0.9, 0, 0.08)
  // Halation from highlight density
  const halation = clamp(highN/n*1.5, 0, 0.32)

  // Look detection based on color profile
  let look='natural', lookAmount=0.3
  if      (temp>0.10 && avgS<0.30)                              { look='vintage';     lookAmount=0.45 }
  else if (temp>0.07)                                            { look='warm';        lookAmount=0.42 }
  else if (temp<-0.07)                                           { look='cool';        lookAmount=0.40 }
  else if (avgS<0.18  && con>0.05)                              { look='bleach';      lookAmount=0.38 }
  else if (con>0.10)                                             { look='moody';       lookAmount=0.42 }
  else if (domH>0.48  && domH<0.68 && temp>0.02)               { look='teal_orange'; lookAmount=0.40 }
  else if (avgS>0.42)                                            { look='cinematic';   lookAmount=0.38 }

  const warmth = temp>0.06 ? 'Warm' : temp<-0.06 ? 'Cool' : 'Neutral'
  const vibe   = avgS>0.40 ? 'Vivid' : avgS<0.22 ? 'Muted' : 'Natural'
  const mood   = con>0.08 ? 'High Contrast' : avgL<0.40 ? 'Dark' : avgL>0.60 ? 'Bright' : 'Balanced'

  return { temp, tint, con, gamma, sat, lift, halation, look, lookAmount, desc:`${warmth} · ${vibe} · ${mood}` }
}

// ── Grade Engine ──────────────────────────────────────────────────────────────
function applyNodes(r: number, g: number, b: number, nodes: GradeNode[]): [number,number,number] {
  for (const node of nodes) {
    if (!node.enabled) continue
    const p = node.params

    if (node.type==='primary') {
      const lift=p.lift as number, gamma=p.gamma as number, temp=p.temp as number
      const tint=p.tint as number, con=p.con as number, sat=p.sat as number
      r=clamp(r+temp*0.15+lift*(1-r)*0.8+lift*0.2)
      g=clamp(g-tint*0.12+lift*(1-g)*0.8+lift*0.2)
      b=clamp(b-temp*0.15+tint*0.04+lift*(1-b)*0.8+lift*0.2)
      if (gamma) { r=clamp(Math.pow(Math.max(r,0),1/(1+gamma))); g=clamp(Math.pow(Math.max(g,0),1/(1+gamma))); b=clamp(Math.pow(Math.max(b,0),1/(1+gamma))) }
      if (con)   { r=clamp(0.5+(r-0.5)*(1+con)); g=clamp(0.5+(g-0.5)*(1+con)); b=clamp(0.5+(b-0.5)*(1+con)) }
      if (sat)   { const lm=luma(r,g,b),sf=1+sat; r=clamp(lm+(r-lm)*sf); g=clamp(lm+(g-lm)*sf); b=clamp(lm+(b-lm)*sf) }
    }

    if (node.type==='look') {
      const amount=p.amount as number
      const looks: Record<string,[number,number,number,number]> = {
        cinematic:[-0.05,0.15,0.04,0.02], warm:[0.05,0.05,0.02,0.08], cool:[0.02,0.06,0.02,-0.06],
        bleach:[-0.3,0.25,-0.02,0], vintage:[-0.1,0.05,0.06,0.05], teal_orange:[0.08,0.14,0.04,0.03],
        moody:[-0.18,0.1,0.07,-0.03], faithful:[0,0,0,0], natural:[0.02,0.02,0.01,0.01],
      }
      const [ls,lc,ll,lw]=looks[String(p.look)]??[0,0,0,0]
      const lm=luma(r,g,b), sf=1+ls
      let nr=clamp(lm+(r-lm)*sf), ng=clamp(lm+(g-lm)*sf), nb=clamp(lm+(b-lm)*sf)
      nr=clamp(0.5+(nr-0.5)*(1+lc)); ng=clamp(0.5+(ng-0.5)*(1+lc)); nb=clamp(0.5+(nb-0.5)*(1+lc))
      nr=clamp(nr+ll*(1-nr)+lw*0.25); ng=clamp(ng+ll*(1-ng)); nb=clamp(nb+ll*(1-nb)-lw*0.18)
      r=r+(nr-r)*amount; g=g+(ng-g)*amount; b=b+(nb-b)*amount
    }

    if (node.type==='halation') {
      const thr=1-(p.threshold as number), lh=luma(r,g,b)
      if (lh>thr) {
        const fac=Math.pow((lh-thr)/(1-thr),1.5)*(p.intensity as number)
        r=clamp(r+fac*0.5); g=clamp(g+fac*0.03); b=clamp(b-fac*0.05)
      }
    }
  }
  return [r,g,b]
}

function bakeLUT(nodes: GradeNode[], size: number): Float32Array {
  const lut=new Float32Array(size**3*3)
  let i=0
  for (let bi=0;bi<size;bi++) for (let gi=0;gi<size;gi++) for (let ri=0;ri<size;ri++) {
    const [r,g,b]=applyNodes(ri/(size-1),gi/(size-1),bi/(size-1),nodes)
    lut[i++]=clamp(r); lut[i++]=clamp(g); lut[i++]=clamp(b)
  }
  return lut
}

function trilinear(ri: number, gi: number, bi: number, lut: Float32Array, size: number): [number,number,number] {
  const R=ri/255*(size-1),G=gi/255*(size-1),B=bi/255*(size-1)
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

const mkId = () => 'n'+Date.now()+Math.random().toString(36).slice(2,5)

// ── Component ─────────────────────────────────────────────────────────────────
export default function StudioPage() {
  const [nodes,     setNodes]     = useState<GradeNode[]>([])
  const [lut,       setLut]       = useState<Float32Array|null>(null)
  const [lutSize]                 = useState(33)
  const [baking,    setBaking]    = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [refImg,    setRefImg]    = useState<string|null>(null)
  const [refData,   setRefData]   = useState<ImageData|null>(null)
  const [footImg,   setFootImg]   = useState<ImageData|null>(null)
  const [footSrc,   setFootSrc]   = useState<string|null>(null)
  const [afterSrc,  setAfterSrc]  = useState<string|null>(null)
  const [lutName,   setLutName]   = useState('HALEA_LUT_001')
  const [splitPos,  setSplitPos]  = useState(50)
  const [grade,     setGrade]     = useState<GradeResult|null>(null)

  const splitRef = useRef<HTMLDivElement>(null)
  const rafRef   = useRef<number|null>(null)

  // ── Real-time preview ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!footImg || nodes.length===0) { setAfterSrc(null); return }
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    rafRef.current = requestAnimationFrame(() => {
      const { data, width, height } = footImg
      const out = new Uint8ClampedArray(data.length)
      for (let i=0; i<data.length; i+=4) {
        const [nr,ng,nb]=applyNodes(data[i]/255, data[i+1]/255, data[i+2]/255, nodes)
        out[i]=Math.round(clamp(nr)*255); out[i+1]=Math.round(clamp(ng)*255)
        out[i+2]=Math.round(clamp(nb)*255); out[i+3]=data[i+3]
      }
      const c=document.createElement('canvas')
      c.width=width; c.height=height
      c.getContext('2d')!.putImageData(new ImageData(out,width,height), 0, 0)
      setAfterSrc(c.toDataURL('image/jpeg', 0.92))
    })
  }, [nodes, footImg])

  // ── Analyze reference photo (pure color science, no API) ──────────────────
  const handleAnalyze = useCallback(() => {
    if (!refData) { toast('Upload reference photo dulu', 'err'); return }
    setAnalyzing(true)
    setLut(null)

    // Run in next tick so UI can update the loading state first
    setTimeout(() => {
      const g = analyzeColorProfile(refData)
      setGrade(g)
      setNodes([
        { id:mkId(), type:'primary',  enabled:true, params:{ lift:g.lift, gamma:g.gamma, temp:g.temp, tint:g.tint, con:g.con, sat:g.sat } },
        { id:mkId(), type:'look',     enabled:g.look!=='natural'&&g.lookAmount>0.1, params:{ look:g.look, amount:g.lookAmount } },
        { id:mkId(), type:'halation', enabled:g.halation>0.05, params:{ threshold:0.65, intensity:g.halation } },
      ])
      setAnalyzing(false)
      toast('✓ Color matched — ' + g.desc)
    }, 20)
  }, [refData])

  // ── Load reference photo ───────────────────────────────────────────────────
  const handleRefPhoto = (f: File) => {
    const img=new Image(), url=URL.createObjectURL(f)
    img.onload = () => {
      const c=document.createElement('canvas')
      // Max 400px for analysis — more than enough for color stats
      const scale=Math.min(1, 400/img.width)
      c.width=Math.round(img.width*scale); c.height=Math.round(img.height*scale)
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height)
      setRefData(c.getContext('2d')!.getImageData(0, 0, c.width, c.height))
      setRefImg(c.toDataURL())
      URL.revokeObjectURL(url)
      // Reset previous grade
      setGrade(null); setNodes([]); setAfterSrc(null); setLut(null)
    }
    img.src=url
  }

  // ── Load footage still ─────────────────────────────────────────────────────
  const handleFootage = (f: File) => {
    const img=new Image(), url=URL.createObjectURL(f)
    img.onload = () => {
      const c=document.createElement('canvas')
      const scale=Math.min(1, 480/img.width)
      c.width=Math.round(img.width*scale); c.height=Math.round(img.height*scale)
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height)
      setFootImg(c.getContext('2d')!.getImageData(0, 0, c.width, c.height))
      setFootSrc(c.toDataURL())
      URL.revokeObjectURL(url)
    }
    img.src=url
  }

  // ── Bake LUT ──────────────────────────────────────────────────────────────
  const handleBake = useCallback(async () => {
    if (nodes.length===0) { toast('Analyze color dulu', 'warn'); return }
    setBaking(true)
    await new Promise(r=>setTimeout(r,20))
    setLut(bakeLUT(nodes, lutSize))
    setBaking(false)
    toast('✓ LUT baked — siap di-export')
  }, [nodes, lutSize])

  // ── Export ────────────────────────────────────────────────────────────────
  const downloadLUT = (fmt: 'cube'|'3dl') => {
    if (!lut) { toast('Klik "Bake LUT" dulu', 'warn'); return }
    const name=lutName||'HALEA_LUT'
    let content='', filename=''
    if (fmt==='cube') {
      filename=name+'.cube'
      content=`# HALEA — by @robbiesatriaa\nLUT_3D_SIZE ${lutSize}\nDOMAIN_MIN 0.0 0.0 0.0\nDOMAIN_MAX 1.0 1.0 1.0\n\n`
      for (let i=0;i<lut.length;i+=3) content+=`${lut[i].toFixed(6)} ${lut[i+1].toFixed(6)} ${lut[i+2].toFixed(6)}\n`
    } else {
      filename=name+'.3dl'
      content=`3DMESH\nMesh 1 12\n0 ${(lutSize-1)*4} ${(lutSize-1)*4} ${(lutSize-1)*4}\n\n`
      for (let i=0;i<lut.length;i+=3) content+=`${Math.round(lut[i]*4095)} ${Math.round(lut[i+1]*4095)} ${Math.round(lut[i+2]*4095)}\n`
    }
    const a=document.createElement('a')
    a.href=URL.createObjectURL(new Blob([content])); a.download=filename; a.click()
    toast('✓ Downloaded: '+filename)
  }

  // ── Grade info display ────────────────────────────────────────────────────
  const gradeStats = grade ? [
    { label:'Temp',     val: grade.temp>0.03?`+${grade.temp.toFixed(2)} Warm`:grade.temp<-0.03?`${grade.temp.toFixed(2)} Cool`:'Neutral' },
    { label:'Contrast', val: grade.con>0.03?`+${grade.con.toFixed(2)}`:grade.con<-0.03?grade.con.toFixed(2):'Balanced' },
    { label:'Sat',      val: grade.sat>0.03?`+${grade.sat.toFixed(2)}`:grade.sat<-0.03?grade.sat.toFixed(2):'Neutral' },
    { label:'Look',     val: grade.look },
  ] : []

  return (
    <div className="flex h-[calc(100vh-56px)] overflow-hidden">

      {/* ── LEFT ──────────────────────────────────────────────────────────── */}
      <div className="w-72 flex-shrink-0 border-r border-b1 flex flex-col">

        <div className="px-4 py-3 border-b border-b1">
          <p className="text-[9px] font-black tracking-widest uppercase text-accent">Color Match Studio</p>
          <h2 className="font-fraunces text-lg font-semibold leading-tight mt-0.5">
            Match Any <span className="italic text-accent">Look</span>
          </h2>
        </div>

        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-5">

          {/* Step 1 — Reference */}
          <div>
            <SectionHeader accent>① Reference Photo</SectionHeader>
            <p className="text-[10px] text-t3 mb-2 leading-relaxed">
              Photo dengan look yang mau kamu tiru.
            </p>
            {refImg ? (
              <div className="relative group mb-3">
                <img src={refImg} alt="Reference" className="w-full h-36 object-cover rounded-xl border border-b1" />
                <button
                  onClick={() => { setRefImg(null); setRefData(null); setGrade(null); setNodes([]); setAfterSrc(null); setLut(null) }}
                  className="absolute top-2 right-2 w-6 h-6 bg-black/70 rounded-full text-white text-[10px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-err">
                  ✕
                </button>
              </div>
            ) : (
              <div className="mb-3">
                <DropZone label="Drop reference photo" sub="JPG · PNG · WEBP" icon="🖼" accept="image/*" onFile={handleRefPhoto} />
              </div>
            )}
            <Btn variant="ai" size="lg" className="w-full" loading={analyzing} onClick={handleAnalyze} disabled={!refData}>
              {analyzing ? 'Analyzing...' : '✦ Match Colors'}
            </Btn>
          </div>

          {/* Grade result */}
          {grade && (
            <div className="bg-s3 border border-b2 rounded-xl overflow-hidden">
              <div className="px-3 py-2 border-b border-b1 flex items-center gap-2">
                <span className="text-[9px] font-black tracking-widest uppercase text-accent">Analysis</span>
                <span className="ml-auto text-[9px] text-t3 font-mono">{grade.desc}</span>
              </div>
              {gradeStats.map(({ label, val }) => (
                <div key={label} className="flex justify-between items-center px-3 py-1.5 border-b border-b1 last:border-0">
                  <span className="text-[10px] text-t2">{label}</span>
                  <span className="text-[10px] font-mono font-bold text-accent capitalize">{val}</span>
                </div>
              ))}
              <div className="px-3 py-2">
                <button onClick={handleAnalyze} disabled={analyzing}
                  className="text-[9px] font-bold text-t3 hover:text-accent transition-colors disabled:opacity-40">
                  ↻ Re-analyze
                </button>
              </div>
            </div>
          )}

          {/* Step 2 — Footage */}
          <div>
            <SectionHeader accent>② Footage Still</SectionHeader>
            <p className="text-[10px] text-t3 mb-2 leading-relaxed">
              Frame dari footage kamu untuk preview before/after.
            </p>
            {footSrc ? (
              <div className="relative group">
                <img src={footSrc} alt="Footage" className="w-full h-28 object-cover rounded-xl border border-b1" />
                <button
                  onClick={() => { setFootImg(null); setFootSrc(null); setAfterSrc(null) }}
                  className="absolute top-2 right-2 w-6 h-6 bg-black/70 rounded-full text-white text-[10px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-err">
                  ✕
                </button>
              </div>
            ) : (
              <DropZone label="Drop footage still" sub="JPG · PNG · WEBP" icon="🎬" accept="image/*" onFile={handleFootage} />
            )}
          </div>

        </div>

        {/* Bake */}
        <div className="p-3 border-t border-b1 flex flex-col gap-1.5">
          <Btn variant="accent" size="lg" className="w-full" loading={baking} onClick={handleBake} disabled={nodes.length===0}>
            <Zap size={14} /> Bake LUT
          </Btn>
          <p className="text-[9px] text-t3 text-center">
            {nodes.length===0 ? 'Match Colors dulu ↑' : 'Preview live · Bake untuk export'}
          </p>
        </div>
      </div>

      {/* ── CENTER — Preview ───────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <div className="h-10 flex-shrink-0 border-b border-b1 flex items-center px-4 gap-3">
          <span className="text-[9px] font-black tracking-widest uppercase text-t3">Preview</span>
          {afterSrc && (
            <span className="flex items-center gap-1.5 text-[9px] font-black uppercase text-ok">
              <span className="w-1.5 h-1.5 rounded-full bg-ok animate-pulse inline-block" />LIVE
            </span>
          )}
          {lut && <Badge color="accent">LUT Ready</Badge>}
          <span className="ml-auto text-[9px] text-t3 font-mono hidden sm:block">
            {afterSrc ? 'Geser ⇔ untuk compare' : footImg ? 'Match Colors untuk preview' : 'Drop footage still di kiri'}
          </span>
        </div>

        <div className="flex-1 overflow-hidden relative bg-[#0a0a0a] flex items-center justify-center">
          {!footImg ? (
            <label className="flex flex-col items-center gap-4 text-t3 cursor-pointer group select-none">
              <input type="file" accept="image/*" className="sr-only" onChange={e=>{const f=e.target.files?.[0];if(f)handleFootage(f)}} />
              <div className="w-20 h-20 rounded-2xl bg-s2 border border-b1 flex items-center justify-center text-4xl opacity-30 group-hover:opacity-60 group-hover:border-b3 transition-all">🎬</div>
              <div className="text-center">
                <p className="text-sm font-bold group-hover:text-accent transition-colors">Drop footage still di sini</p>
                <p className="text-xs opacity-50 mt-1">atau klik untuk pilih file</p>
              </div>
            </label>
          ) : !afterSrc ? (
            <div className="relative w-full h-full flex items-center justify-center">
              <img src={footSrc!} alt="" draggable={false}
                className="max-w-full max-h-full object-contain opacity-60 pointer-events-none" />
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="bg-black/70 backdrop-blur-sm rounded-2xl px-6 py-4 text-center border border-white/10">
                  <span className="text-2xl block mb-2">✦</span>
                  <p className="text-sm font-bold text-white mb-1">Upload reference → Match Colors</p>
                  <p className="text-[11px] text-white/50">Grade akan muncul secara live</p>
                </div>
              </div>
            </div>
          ) : (
            <div ref={splitRef} className="relative w-full h-full overflow-hidden" style={{ userSelect:'none' }}>

              {/* BEFORE */}
              <img src={footSrc!} alt="Before" draggable={false}
                className="absolute inset-0 w-full h-full object-contain pointer-events-none" />

              {/* AFTER — clipped to right side of handle */}
              <img src={afterSrc} alt="After" draggable={false}
                className="absolute inset-0 w-full h-full object-contain pointer-events-none"
                style={{ clipPath:`inset(0 0 0 ${splitPos}%)` }} />

              {/* Handle */}
              <div
                className="absolute top-0 bottom-0 z-20 touch-none"
                style={{ left:`${splitPos}%`, transform:'translateX(-50%)', width:'48px', cursor:'col-resize' }}
                onPointerDown={e=>e.currentTarget.setPointerCapture(e.pointerId)}
                onPointerMove={e=>{
                  if (e.buttons!==1) return
                  const r=splitRef.current!.getBoundingClientRect()
                  setSplitPos(Math.max(2, Math.min(98, (e.clientX-r.left)/r.width*100)))
                }}
              >
                <div className="absolute top-0 bottom-0 left-1/2 -translate-x-1/2 w-0.5 bg-white/90 shadow-[0_0_8px_rgba(255,255,255,0.4)]" />
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white shadow-2xl flex items-center justify-center select-none"
                  style={{ fontSize:14, fontWeight:900, color:'#000' }}>⇔</div>
              </div>

              <span className="absolute bottom-4 left-4 text-[9px] font-black text-white/80 tracking-widest uppercase bg-black/60 px-2.5 py-1 rounded-full pointer-events-none backdrop-blur-sm">BEFORE</span>
              <span className="absolute bottom-4 right-4 text-[9px] font-black text-white/80 tracking-widest uppercase bg-black/60 px-2.5 py-1 rounded-full pointer-events-none backdrop-blur-sm">AFTER</span>
            </div>
          )}
        </div>
      </div>

      {/* ── RIGHT — Export ─────────────────────────────────────────────────── */}
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
            <button onClick={()=>downloadLUT('cube')} disabled={!lut}
              className="flex flex-col items-center gap-1.5 bg-s2 border border-b1 rounded-xl p-3 hover:border-accent hover:bg-s3 transition-all disabled:opacity-30 disabled:cursor-not-allowed">
              <span className="font-black text-lg text-txt leading-none">.cube</span>
              <span className="text-[9px] text-t3">Resolve · PP</span>
            </button>
            <button onClick={()=>downloadLUT('3dl')} disabled={!lut}
              className="flex flex-col items-center gap-1.5 bg-s2 border border-b1 rounded-xl p-3 hover:border-accent hover:bg-s3 transition-all disabled:opacity-30 disabled:cursor-not-allowed">
              <span className="font-black text-lg text-txt leading-none">.3dl</span>
              <span className="text-[9px] text-t3">Flame · Lustre</span>
            </button>
          </div>

          {!lut ? (
            <div className="bg-s2 border border-dashed border-b2 rounded-xl p-3 text-center">
              <p className="text-[10px] text-t3 leading-relaxed">Klik <strong className="text-txt">Bake LUT</strong> untuk generate file export</p>
            </div>
          ) : (
            <div className="bg-s2 border border-b1 rounded-xl overflow-hidden">
              {[['Size',lutSize+'³'],['Nodes',nodes.filter(n=>n.enabled).length+' active']].map(([k,v])=>(
                <div key={k} className="flex justify-between px-3 py-2 border-b border-b1 last:border-0 text-xs">
                  <span className="text-t2">{k}</span><span className="text-accent font-mono font-bold">{v}</span>
                </div>
              ))}
            </div>
          )}

          <div className="space-y-2 pt-1">
            <p className="text-[9px] font-black tracking-widest uppercase text-t3">How to use</p>
            <div className="text-[10px] text-t2 leading-relaxed space-y-2">
              <p><strong className="text-txt block">Premiere Pro</strong>Lumetri → Creative → Look → Browse .cube</p>
              <p><strong className="text-txt block">DaVinci Resolve</strong>Color → LUTs → Refresh → paste .cube</p>
              <p><strong className="text-txt block">After Effects</strong>Effect → Apply Color LUT</p>
              <p><strong className="text-txt block">CapCut Pro</strong>Filter → Add → Import LUT</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
