'use client'
import { useState, useRef, useCallback, useEffect } from 'react'
import { useAuthStore } from '@/store/auth'
import { Btn, Slider, Select, Badge, SectionHeader, DropZone, Toggle, toast } from '@/components/ui'
import { Zap, Sparkles, ChevronDown, ChevronRight } from 'lucide-react'

// ── Types ─────────────────────────────────────────────────────────────────────
type StudioMode = 'manual' | 'ai'
type TabView    = 'lut' | 'halation'
type NodeType   = 'primary' | 'curves' | 'hsl' | 'look' | 'halation' | 'smartsel'
type SmartPreset = 'sky' | 'skin' | 'grass' | 'shadows' | 'highlights' | 'custom'

interface GradeNode {
  id: string; type: NodeType; enabled: boolean; expanded: boolean
  params: Record<string, number | string | boolean | null>
}

// ── Color Helpers ─────────────────────────────────────────────────────────────
const clamp = (v: number, lo = 0, hi = 1) => v < lo ? lo : v > hi ? hi : v
const luma  = (r: number, g: number, b: number) => 0.2126*r + 0.7152*g + 0.0722*b

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min
  const l = (max + min) / 2
  if (d === 0) return [0, 0, l]
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h = 0
  if      (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6
  else if (max === g) h = ((b - r) / d + 2) / 6
  else                h = ((r - g) / d + 4) / 6
  return [h, s, l]
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  if (s === 0) return [l, l, l]
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  const f = (t: number) => {
    t = ((t % 1) + 1) % 1
    if (t < 1/6) return p + (q - p) * 6 * t
    if (t < 0.5) return q
    if (t < 2/3) return p + (q - p) * (2/3 - t) * 6
    return p
  }
  return [f(h + 1/3), f(h), f(h - 1/3)]
}

function selWeight(h: number, _s: number, l: number, p: GradeNode['params']): number {
  const hueRange = p.hueRange as number
  let hw = 1
  if (hueRange < 0.49) {
    let hd = Math.abs(h - (p.hueCenter as number))
    if (hd > 0.5) hd = 1 - hd
    hw = Math.pow(clamp(1 - hd / Math.max(hueRange, 0.001)), 0.5)
  }
  const lMin = p.lumMin as number, lMax = p.lumMax as number
  const lRange = lMax - lMin
  if (lRange > 0.98) return hw
  const edge = Math.min(lRange * 0.3, 0.08)
  let lw = 0
  if      (l >= lMin && l <= lMax)          lw = 1
  else if (l >= lMin - edge && l < lMin)    lw = (l - (lMin - edge)) / edge
  else if (l > lMax && l <= lMax + edge)    lw = (lMax + edge - l) / edge
  return hw * lw
}

// ── Color Engine ──────────────────────────────────────────────────────────────
function applyNodes(r: number, g: number, b: number, nodes: GradeNode[]): [number, number, number] {
  for (const node of nodes) {
    if (!node.enabled) continue
    const p = node.params

    if (node.type === 'primary') {
      const lift  = (p.lift  as number) || 0
      const gamma = (p.gamma as number) || 0
      const temp  = (p.temp  as number) || 0
      const tint  = (p.tint  as number) || 0
      const con   = (p.con   as number) || 0
      const sat   = (p.sat   as number) || 0
      r = clamp(r + temp*0.15 + lift*(1-r)*0.8 + lift*0.2)
      g = clamp(g - tint*0.12 + lift*(1-g)*0.8 + lift*0.2)
      b = clamp(b - temp*0.15 + tint*0.04 + lift*(1-b)*0.8 + lift*0.2)
      if (gamma) { r=clamp(Math.pow(r,1/(1+gamma))); g=clamp(Math.pow(g,1/(1+gamma))); b=clamp(Math.pow(b,1/(1+gamma))) }
      if (con)   { r=clamp(0.5+(r-0.5)*(1+con)); g=clamp(0.5+(g-0.5)*(1+con)); b=clamp(0.5+(b-0.5)*(1+con)) }
      if (sat)   { const lm=luma(r,g,b),sf=1+sat; r=clamp(lm+(r-lm)*sf); g=clamp(lm+(g-lm)*sf); b=clamp(lm+(b-lm)*sf) }
    }

    if (node.type === 'hsl') {
      const [h, s, l] = rgbToHsl(r, g, b)
      let hd = Math.abs(h - (p.centerHue as number)); if (hd > 0.5) hd = 1 - hd
      const w = Math.pow(clamp(1 - hd / Math.max(p.range as number, 0.001)), 0.5)
      if (w > 0.001) {
        let nh = h + (p.hueShift as number) * w; nh = ((nh % 1) + 1) % 1
        const ns = clamp(s + (p.satShift as number) * w)
        const nl = clamp(l + (p.lumShift as number) * w)
        const [nr, ng, nb] = hslToRgb(nh, ns, nl)
        r = r + (nr - r) * w; g = g + (ng - g) * w; b = b + (nb - b) * w
      }
    }

    if (node.type === 'look') {
      const amount = (p.amount as number) || 0.5
      const looks: Record<string, number[]> = {
        cinematic:[-0.05,0.15,0.04,0.02], warm:[0.05,0.05,0.02,0.08], cool:[0.02,0.06,0.02,-0.06],
        bleach:[-0.3,0.25,-0.02,0], vintage:[-0.1,0.05,0.06,0.05], teal_orange:[0.08,0.14,0.04,0.03],
        moody:[-0.18,0.1,0.07,-0.03], faithful:[0,0,0,0], natural:[0.02,0.02,0.01,0.01]
      }
      const [ls,lc,ll,lw] = looks[String(p.look)||'faithful'] || [0,0,0,0]
      const lm=luma(r,g,b), sf=1+ls
      let nr=clamp(lm+(r-lm)*sf), ng=clamp(lm+(g-lm)*sf), nb=clamp(lm+(b-lm)*sf)
      nr=clamp(0.5+(nr-0.5)*(1+lc)); ng=clamp(0.5+(ng-0.5)*(1+lc)); nb=clamp(0.5+(nb-0.5)*(1+lc))
      nr=clamp(nr+ll*(1-nr)+lw*0.25); ng=clamp(ng+ll*(1-ng)); nb=clamp(nb+ll*(1-nb)-lw*0.18)
      r=r+(nr-r)*amount; g=g+(ng-g)*amount; b=b+(nb-b)*amount
    }

    if (node.type === 'halation') {
      const thr = 1 - (p.threshold as number || 0.6)
      const lh  = luma(r, g, b)
      if (lh > thr) {
        const fac = Math.pow((lh-thr)/(1-thr), 1.5) * (p.intensity as number || 0.25)
        r=clamp(r+fac*0.5); g=clamp(g+fac*0.03); b=clamp(b-fac*0.05)
      }
    }

    if (node.type === 'smartsel') {
      const [h, s, l] = rgbToHsl(r, g, b)
      const w = selWeight(h, s, l, p)
      if (p.showMask as boolean) {
        // Desaturate all pixels, tint selected red so user can see the mask
        const gray = luma(r, g, b)
        r = clamp(gray + w * 0.6)
        g = clamp(gray - w * 0.12)
        b = clamp(gray - w * 0.12)
      } else if (w > 0.001) {
        let nh = h + (p.hueShift as number) * w; nh = ((nh % 1) + 1) % 1
        const ns = clamp(s + (p.satShift as number) * w)
        const nl = clamp(l + (p.lumShift as number) * w)
        const [ar, ag, ab] = hslToRgb(nh, ns, nl)
        const tw = (p.temp as number) * w
        r = clamp(r + (ar - r) * w + tw * 0.12)
        g = clamp(g + (ag - g) * w)
        b = clamp(b + (ab - b) * w - tw * 0.12)
      }
    }
  }
  return [r, g, b]
}

function bakeLUT(nodes: GradeNode[], size: number): Float32Array {
  const lut = new Float32Array(size**3 * 3)
  let idx = 0
  for (let bi=0; bi<size; bi++) for (let gi=0; gi<size; gi++) for (let ri=0; ri<size; ri++) {
    const [r,g,b] = applyNodes(ri/(size-1), gi/(size-1), bi/(size-1), nodes)
    lut[idx++]=clamp(r); lut[idx++]=clamp(g); lut[idx++]=clamp(b)
  }
  return lut
}

function trilinear(ri: number, gi: number, bi: number, lut: Float32Array, size: number): [number,number,number] {
  const R=ri/255*(size-1), G=gi/255*(size-1), B=bi/255*(size-1)
  const r0=Math.floor(R), g0=Math.floor(G), b0=Math.floor(B)
  const r1=Math.min(r0+1,size-1), g1=Math.min(g0+1,size-1), b1=Math.min(b0+1,size-1)
  const dr=R-r0, dg=G-g0, db=B-b0
  const gv=(rr:number,gg:number,bb:number,c:number) => lut[(bb*size*size+gg*size+rr)*3+c]
  return [0,1,2].map(c => {
    const c0=(1-dg)*((1-dr)*gv(r0,g0,b0,c)+dr*gv(r1,g0,b0,c))+dg*((1-dr)*gv(r0,g1,b0,c)+dr*gv(r1,g1,b0,c))
    const c1=(1-dg)*((1-dr)*gv(r0,g0,b1,c)+dr*gv(r1,g0,b1,c))+dg*((1-dr)*gv(r0,g1,b1,c)+dr*gv(r1,g1,b1,c))
    return clamp(Math.round(((1-db)*c0+db*c1)*255),0,255)
  }) as [number,number,number]
}

// ── Smart Select ──────────────────────────────────────────────────────────────
const SMART_PRESETS: Record<SmartPreset, Partial<GradeNode['params']>> = {
  sky:        { hueCenter:0.59, hueRange:0.18, lumMin:0.0,  lumMax:1.0  },
  skin:       { hueCenter:0.07, hueRange:0.09, lumMin:0.15, lumMax:0.85 },
  grass:      { hueCenter:0.31, hueRange:0.11, lumMin:0.0,  lumMax:1.0  },
  shadows:    { hueCenter:0.0,  hueRange:0.5,  lumMin:0.0,  lumMax:0.35 },
  highlights: { hueCenter:0.0,  hueRange:0.5,  lumMin:0.65, lumMax:1.0  },
  custom:     {},
}
const PRESET_ICONS: Record<SmartPreset, string> = {
  sky:'🌤', skin:'🧑', grass:'🌿', shadows:'🌑', highlights:'☀️', custom:'✏️'
}

// ── Defaults ──────────────────────────────────────────────────────────────────
const mkId = () => 'n' + Date.now() + Math.random().toString(36).slice(2,4)
const DEFAULT_NODES: GradeNode[] = [
  { id:mkId(), type:'primary',  enabled:true, expanded:false, params:{ lift:0, gamma:0, temp:0, tint:0, con:0, sat:0 } },
  { id:mkId(), type:'look',     enabled:true, expanded:false, params:{ look:'cinematic', amount:0.5 } },
  { id:mkId(), type:'halation', enabled:true, expanded:false, params:{ threshold:0.62, intensity:0.2 } },
]

// ── Component ─────────────────────────────────────────────────────────────────
export default function StudioPage() {
  const [tab, setTab]           = useState<TabView>('lut')
  const [mode, setMode]         = useState<StudioMode>('manual')
  const [nodes, setNodes]       = useState<GradeNode[]>(DEFAULT_NODES)
  const [lut, setLut]           = useState<Float32Array | null>(null)
  const [lutSize]               = useState(33)
  const [baking, setBaking]     = useState(false)
  const [aiLoading, setAiLoading] = useState(false)
  const [refImg, setRefImg]     = useState<string | null>(null)
  const [footImg, setFootImg]   = useState<ImageData | null>(null)
  const [footSrc, setFootSrc]   = useState<string | null>(null)
  const [afterSrc, setAfterSrc] = useState<string | null>(null)
  const [logFmt, setLogFmt]     = useState('none')
  const [lutName, setLutName]   = useState('HALEA_LUT_001')
  const [splitPos, setSplitPos] = useState(50)
  const { user, useCredit, credits } = useAuthStore()

  const splitRef = useRef<HTMLDivElement>(null)
  const rafRef   = useRef<number | null>(null)

  // ── Real-time preview ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!footImg) { setAfterSrc(null); return }
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    rafRef.current = requestAnimationFrame(() => {
      const src = footImg.data
      const out = new Uint8ClampedArray(src.length)
      for (let i = 0; i < src.length; i += 4) {
        const [nr, ng, nb] = applyNodes(src[i]/255, src[i+1]/255, src[i+2]/255, nodes)
        out[i]=Math.round(clamp(nr)*255); out[i+1]=Math.round(clamp(ng)*255)
        out[i+2]=Math.round(clamp(nb)*255); out[i+3]=src[i+3]
      }
      const c = document.createElement('canvas')
      c.width=footImg.width; c.height=footImg.height
      c.getContext('2d')!.putImageData(new ImageData(out, footImg.width, footImg.height), 0, 0)
      setAfterSrc(c.toDataURL())
    })
  }, [nodes, footImg])

  // ── Bake LUT ──────────────────────────────────────────────────────────────
  const handleBake = useCallback(async () => {
    setBaking(true)
    await new Promise(r => setTimeout(r, 20))
    const result = bakeLUT(nodes, lutSize)
    setLut(result)
    setBaking(false)
    toast('✓ LUT baked — ' + nodes.filter(n=>n.enabled).length + ' nodes active')
  }, [nodes, lutSize])

  // ── AI Match ─────────────────────────────────────────────────────────────
  const handleAiMatch = async () => {
    if (!refImg) { toast('Upload a reference photo first', 'err'); return }
    if (user?.role !== 'admin' && !useCredit()) { toast('No AI credits — buy from Shop', 'err'); return }
    setAiLoading(true)
    try {
      const b64 = refImg.split(',')[1]
      const res = await fetch('/api/ai-match', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514', max_tokens: 600,
          system: `You are a professional colorist. Analyze the visual look of the reference image. Return ONLY valid JSON with these keys: temp (float -0.4 to 0.4), tint (float -0.3 to 0.3), con (float -0.3 to 0.3), sat (float -0.4 to 0.4), gamma (float -0.3 to 0.3), blackLift (float 0 to 0.08), look (one of: faithful,cinematic,warm,cool,bleach,vintage,moody,natural,teal_orange), lookAmount (float 0 to 0.6), halationIntensity (float 0 to 0.35), description (string 3 words). No markdown, no explanation.`,
          messages: [{ role:'user', content:[
            { type:'image', source:{ type:'base64', media_type:'image/jpeg', data:b64 } },
            { type:'text', text:'Analyze color grade and return JSON.' }
          ]}]
        })
      })
      const data = await res.json()
      const raw = data.content?.map((c: { text?: string }) => c.text||'').join('').replace(/```json|```/g,'').trim()
      const p = JSON.parse(raw)
      setNodes([
        { id:mkId(), type:'primary',  enabled:true, expanded:false, params:{ lift:p.blackLift||0, gamma:p.gamma||0, temp:p.temp||0, tint:p.tint||0, con:p.con||0, sat:p.sat||0 } },
        { id:mkId(), type:'look',     enabled:p.look!=='faithful', expanded:false, params:{ look:p.look||'cinematic', amount:p.lookAmount||0.45 } },
        { id:mkId(), type:'halation', enabled:(p.halationIntensity||0)>0.05, expanded:false, params:{ threshold:0.65, intensity:p.halationIntensity||0.2 } },
      ])
      toast('🤖 AI Match: ' + (p.description || 'Grade applied'))
    } catch (e: unknown) { toast('AI Match failed: ' + (e instanceof Error ? e.message : 'Unknown error'), 'err') }
    setAiLoading(false)
  }

  const handleFootage = (f: File) => {
    const img = new Image(), url = URL.createObjectURL(f)
    img.onload = () => {
      const c = document.createElement('canvas')
      const scale = Math.min(1, 900/img.width)
      c.width=Math.round(img.width*scale); c.height=Math.round(img.height*scale)
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height)
      const data = c.getContext('2d')!.getImageData(0, 0, c.width, c.height)
      setFootImg(data); setFootSrc(c.toDataURL())
      URL.revokeObjectURL(url)
    }
    img.src = url
  }

  const downloadLUT = (fmt: 'cube' | '3dl') => {
    if (!lut) { toast('Click "Bake LUT" first to generate the export file', 'warn'); return }
    const name = lutName || 'HALEA_LUT'
    let content = '', filename = ''
    if (fmt === 'cube') {
      filename = name + '.cube'
      content = `# HALEA — by @robbiesatriaa\nLUT_3D_SIZE ${lutSize}\nDOMAIN_MIN 0.0 0.0 0.0\nDOMAIN_MAX 1.0 1.0 1.0\n\n`
      for (let i=0; i<lut.length; i+=3) content += `${lut[i].toFixed(6)} ${lut[i+1].toFixed(6)} ${lut[i+2].toFixed(6)}\n`
    } else {
      filename = name + '.3dl'
      content = `3DMESH\nMesh 1 12\n0 ${(lutSize-1)*4} ${(lutSize-1)*4} ${(lutSize-1)*4}\n\n`
      for (let i=0; i<lut.length; i+=3) content += `${Math.round(lut[i]*4095)} ${Math.round(lut[i+1]*4095)} ${Math.round(lut[i+2]*4095)}\n`
    }
    const a = document.createElement('a'); a.href=URL.createObjectURL(new Blob([content])); a.download=filename; a.click()
    toast('✓ Downloaded: ' + filename)
  }

  const updateNode = (id: string, params: Partial<GradeNode['params']>) =>
    setNodes(ns => ns.map(n => n.id===id ? { ...n, params:{ ...n.params, ...params } } : n))
  const toggleNode = (id: string) =>
    setNodes(ns => ns.map(n => n.id===id ? { ...n, enabled:!n.enabled } : n))
  const expandNode = (id: string) =>
    setNodes(ns => ns.map(n => n.id===id ? { ...n, expanded:!n.expanded } : n))
  const removeNode = (id: string) =>
    setNodes(ns => ns.filter(n => n.id!==id))

  const addNode = (type: NodeType) => {
    const defaults: Record<NodeType, GradeNode['params']> = {
      primary:  { lift:0, gamma:0, temp:0, tint:0, con:0, sat:0 },
      curves:   { master:null, r:null, g:null, b:null },
      hsl:      { centerHue:0.05, range:0.1, hueShift:0, satShift:0, lumShift:0 },
      look:     { look:'cinematic', amount:0.5 },
      halation: { threshold:0.62, intensity:0.2 },
      smartsel: { preset:'sky', hueCenter:0.59, hueRange:0.18, lumMin:0, lumMax:1, hueShift:0, satShift:0, lumShift:0, temp:0, showMask:false },
    }
    setNodes(ns => [...ns, { id:mkId(), type, enabled:true, expanded:true, params:defaults[type] }])
  }

  const NODE_META: Record<NodeType, { icon: string; label: string }> = {
    primary:  { icon:'🎚', label:'Primary' },
    curves:   { icon:'📈', label:'Curves' },
    hsl:      { icon:'🎯', label:'HSL Secondary' },
    look:     { icon:'🎬', label:'Look' },
    halation: { icon:'✦', label:'Halation' },
    smartsel: { icon:'🪄', label:'Smart Select' },
  }

  return (
    <div className="flex h-[calc(100vh-56px)] overflow-hidden">

      {/* LEFT — Controls */}
      <div className="w-72 flex-shrink-0 border-r border-b1 flex flex-col">
        <div className="flex border-b border-b1">
          {(['lut','halation'] as TabView[]).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`flex-1 py-3 text-xs font-black tracking-widest uppercase transition-colors ${tab===t ? 'text-accent border-b-2 border-accent' : 'text-t3 hover:text-t2'}`}>
              {t==='lut' ? '🎞 LUT Studio' : '✦ Halation'}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">

          {/* Manual / AI toggle */}
          {tab==='lut' && (
            <div className="flex gap-1.5 mb-1">
              <button onClick={() => setMode('manual')} className={`flex-1 py-2 rounded-lg text-xs font-bold tracking-wide uppercase transition-colors ${mode==='manual' ? 'bg-accent text-white' : 'bg-s3 text-t2 hover:text-txt'}`}>
                <Zap size={12} className="inline mr-1" />Manual
              </button>
              <button onClick={() => setMode('ai')} className={`flex-1 py-2 rounded-lg text-xs font-bold tracking-wide uppercase transition-colors ${mode==='ai' ? 'bg-a4 text-black' : 'bg-s3 text-t2 hover:text-txt'}`}>
                <Sparkles size={12} className="inline mr-1" />AI Match
              </button>
            </div>
          )}

          {/* Reference photo (AI mode) */}
          {tab==='lut' && mode==='ai' && (
            <div>
              <SectionHeader accent>Reference Photo</SectionHeader>
              {refImg ? (
                <div className="relative mb-2">
                  <img src={refImg} alt="Reference" className="w-full h-32 object-cover rounded-xl border border-b1" />
                  <button onClick={() => setRefImg(null)} className="absolute top-1 right-1 w-5 h-5 bg-black/70 rounded-full text-white text-[10px] flex items-center justify-center">✕</button>
                </div>
              ) : (
                <DropZone label="Drop reference photo" sub="JPG · PNG · WEBP" icon="🖼" accept="image/*"
                  onFile={f => { const r = new FileReader(); r.onload = e => setRefImg(e.target?.result as string); r.readAsDataURL(f) }} />
              )}
              {user?.role !== 'admin' && <p className="text-t3 text-[10px] mb-2">Credits: {credits}</p>}
              <Btn variant="ai" size="sm" className="w-full" loading={aiLoading} onClick={handleAiMatch} disabled={!refImg}>
                <Sparkles size={13} /> AI Match
              </Btn>
            </div>
          )}

          {/* Log format */}
          <Select label="Log Format" value={logFmt} onChange={e => setLogFmt(e.target.value)}>
            <option value="none">Rec.709 / SDR</option>
            <optgroup label="Sony"><option value="slog2">S-Log2</option><option value="slog3">S-Log3</option></optgroup>
            <optgroup label="Fujifilm"><option value="flog">F-Log</option><option value="flog2">F-Log2</option></optgroup>
            <optgroup label="DJI"><option value="dlog">D-Log</option><option value="dlogm">D-Log M</option></optgroup>
            <optgroup label="Apple"><option value="iphone">Apple Log</option></optgroup>
            <optgroup label="Canon"><option value="clog2">C-Log2</option><option value="clog3">C-Log3</option></optgroup>
            <optgroup label="Panasonic"><option value="vlog">V-Log</option></optgroup>
          </Select>

          {/* Grade Nodes */}
          {tab==='lut' && (
            <div>
              <SectionHeader accent>⬢ Grade Nodes</SectionHeader>

              <div className="flex flex-wrap gap-1 mb-3">
                {(['primary','look','halation','hsl','smartsel'] as NodeType[]).map(t => (
                  <button key={t} onClick={() => addNode(t)}
                    className="text-[9px] font-bold px-2.5 py-1 rounded-full border border-dashed border-b2 text-t2 hover:border-accent hover:text-accent transition-colors">
                    + {t==='smartsel' ? 'smart' : t}
                  </button>
                ))}
              </div>

              <div className="flex flex-col gap-2">
                {nodes.map(n => {
                  const meta = NODE_META[n.type]
                  return (
                    <div key={n.id} className={`bg-s3 border rounded-xl overflow-hidden transition-opacity ${n.enabled ? 'border-b2' : 'border-b1 opacity-50'}`}>
                      <div className="flex items-center gap-2 px-3 py-2.5 cursor-pointer" onClick={() => expandNode(n.id)}>
                        <span className="text-sm">{meta.icon}</span>
                        <span className="text-xs font-bold flex-1">{meta.label}</span>
                        <button onClick={e => { e.stopPropagation(); toggleNode(n.id) }}
                          className={`w-6 h-3.5 rounded-full transition-colors flex-shrink-0 ${n.enabled ? 'bg-accent' : 'bg-b2'}`}>
                          <div className={`w-2.5 h-2.5 bg-white rounded-full mt-0.5 transition-all ${n.enabled ? 'ml-3' : 'ml-0.5'}`} />
                        </button>
                        <button onClick={e => { e.stopPropagation(); removeNode(n.id) }}
                          className="w-4 h-4 flex items-center justify-center text-t3 hover:text-err transition-colors text-[10px]">✕</button>
                        {n.expanded ? <ChevronDown size={12} className="text-t3" /> : <ChevronRight size={12} className="text-t3" />}
                      </div>

                      {n.expanded && (
                        <div className="px-3 pb-3 flex flex-col gap-2 border-t border-b1">
                          <div className="h-1" />

                          {n.type==='primary' && (<>
                            <Slider label="Lift"       min={-0.4} max={0.4} step={0.01} value={n.params.lift  as number} format={v=>v.toFixed(2)} onChange={v=>updateNode(n.id,{lift:v})} />
                            <Slider label="Gamma"      min={-0.5} max={0.5} step={0.01} value={n.params.gamma as number} format={v=>v.toFixed(2)} onChange={v=>updateNode(n.id,{gamma:v})} />
                            <Slider label="Temp"       min={-0.5} max={0.5} step={0.01} value={n.params.temp  as number} format={v=>v.toFixed(2)} onChange={v=>updateNode(n.id,{temp:v})} />
                            <Slider label="Tint"       min={-0.4} max={0.4} step={0.01} value={n.params.tint  as number} format={v=>v.toFixed(2)} onChange={v=>updateNode(n.id,{tint:v})} />
                            <Slider label="Contrast"   min={-0.6} max={0.6} step={0.01} value={n.params.con   as number} format={v=>v.toFixed(2)} onChange={v=>updateNode(n.id,{con:v})} />
                            <Slider label="Saturation" min={-0.8} max={0.8} step={0.01} value={n.params.sat   as number} format={v=>v.toFixed(2)} onChange={v=>updateNode(n.id,{sat:v})} />
                          </>)}

                          {n.type==='look' && (<>
                            <Select value={String(n.params.look)} onChange={e=>updateNode(n.id,{look:e.target.value})}>
                              {['faithful','cinematic','warm','cool','bleach','vintage','moody','natural','teal_orange'].map(l=><option key={l}>{l}</option>)}
                            </Select>
                            <Slider label="Amount" min={0} max={1} step={0.01} value={n.params.amount as number} format={v=>v.toFixed(2)} onChange={v=>updateNode(n.id,{amount:v})} />
                          </>)}

                          {n.type==='halation' && (<>
                            <Slider label="Threshold" min={0.3} max={0.95} step={0.01} value={n.params.threshold as number} format={v=>v.toFixed(2)} onChange={v=>updateNode(n.id,{threshold:v})} />
                            <Slider label="Intensity"  min={0}   max={0.8}  step={0.01} value={n.params.intensity  as number} format={v=>v.toFixed(2)} onChange={v=>updateNode(n.id,{intensity:v})} />
                          </>)}

                          {n.type==='hsl' && (<>
                            <Slider label="Center Hue" min={0}    max={1}   step={0.005} value={n.params.centerHue as number} format={v=>Math.round(v*360)+'°'} onChange={v=>updateNode(n.id,{centerHue:v})} />
                            <Slider label="Range"      min={0.02} max={0.4} step={0.01}  value={n.params.range     as number} format={v=>v.toFixed(2)} onChange={v=>updateNode(n.id,{range:v})} />
                            <Slider label="Hue Shift"  min={-0.2} max={0.2} step={0.005} value={n.params.hueShift  as number} format={v=>Math.round(v*360)+'°'} onChange={v=>updateNode(n.id,{hueShift:v})} />
                            <Slider label="Sat Shift"  min={-1}   max={1}   step={0.01}  value={n.params.satShift  as number} format={v=>v.toFixed(2)} onChange={v=>updateNode(n.id,{satShift:v})} />
                            <Slider label="Lum Shift"  min={-0.5} max={0.5} step={0.01}  value={n.params.lumShift  as number} format={v=>v.toFixed(2)} onChange={v=>updateNode(n.id,{lumShift:v})} />
                          </>)}

                          {n.type==='smartsel' && (<>
                            {/* Preset chips */}
                            <div>
                              <span className="text-[9px] text-t3 font-black uppercase tracking-widest block mb-1.5">Preset</span>
                              <div className="flex flex-wrap gap-1">
                                {(['sky','skin','grass','shadows','highlights'] as SmartPreset[]).map(preset => (
                                  <button key={preset}
                                    onClick={() => updateNode(n.id, { preset, ...SMART_PRESETS[preset] })}
                                    className={`text-[9px] px-2.5 py-1 rounded-full font-bold capitalize transition-all ${
                                      n.params.preset===preset
                                        ? 'bg-accent text-white shadow-sm shadow-accent/30'
                                        : 'bg-s2 border border-b2 text-t2 hover:border-accent hover:text-accent'
                                    }`}>
                                    {PRESET_ICONS[preset]} {preset}
                                  </button>
                                ))}
                              </div>
                            </div>

                            {/* Selection range */}
                            <div>
                              <span className="text-[9px] text-t3 font-black uppercase tracking-widest block mb-1.5">Selection</span>
                              {(n.params.hueRange as number) < 0.49 && (<>
                                <Slider label="Hue"       min={0}    max={1}    step={0.005} value={n.params.hueCenter as number} format={v=>Math.round(v*360)+'°'} onChange={v=>updateNode(n.id,{hueCenter:v,preset:'custom'})} />
                                <Slider label="Hue Range" min={0.01} max={0.48} step={0.01}  value={n.params.hueRange  as number} format={v=>v.toFixed(2)} onChange={v=>updateNode(n.id,{hueRange:v,preset:'custom'})} />
                              </>)}
                              <Slider label="Lum Min" min={0} max={1} step={0.01} value={n.params.lumMin as number} format={v=>v.toFixed(2)} onChange={v=>updateNode(n.id,{lumMin:v,preset:'custom'})} />
                              <Slider label="Lum Max" min={0} max={1} step={0.01} value={n.params.lumMax as number} format={v=>v.toFixed(2)} onChange={v=>updateNode(n.id,{lumMax:v,preset:'custom'})} />
                            </div>

                            {/* Corrections */}
                            <div>
                              <span className="text-[9px] text-t3 font-black uppercase tracking-widest block mb-1.5">Corrections</span>
                              <Slider label="Hue Shift" min={-0.3} max={0.3} step={0.005} value={n.params.hueShift as number} format={v=>Math.round(v*360)+'°'} onChange={v=>updateNode(n.id,{hueShift:v})} />
                              <Slider label="Sat Shift" min={-1}   max={1}   step={0.01}  value={n.params.satShift as number} format={v=>v.toFixed(2)} onChange={v=>updateNode(n.id,{satShift:v})} />
                              <Slider label="Exposure"  min={-0.5} max={0.5} step={0.01}  value={n.params.lumShift as number} format={v=>v.toFixed(2)} onChange={v=>updateNode(n.id,{lumShift:v})} />
                              <Slider label="Temp"      min={-0.5} max={0.5} step={0.01}  value={n.params.temp     as number} format={v=>v.toFixed(2)} onChange={v=>updateNode(n.id,{temp:v})} />
                            </div>

                            {/* Show Mask toggle */}
                            <div className={`flex items-center gap-2 px-2 py-1.5 rounded-lg transition-colors ${n.params.showMask ? 'bg-warn/10 border border-warn/20' : ''}`}>
                              <Toggle on={n.params.showMask as boolean} onChange={v=>updateNode(n.id,{showMask:v})} label="Show Mask" />
                              {n.params.showMask && <span className="text-[9px] text-warn font-bold ml-auto">MASK VIEW</span>}
                            </div>
                          </>)}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {/* Bake button */}
        <div className="p-3 border-t border-b1">
          <Btn variant="accent" size="lg" className="w-full" loading={baking} onClick={handleBake}>
            <Zap size={14} /> Bake LUT
          </Btn>
          <p className="text-[9px] text-t3 text-center mt-1.5">Preview is live · Bake to export</p>
        </div>
      </div>

      {/* CENTER — Preview */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="h-10 border-b border-b1 flex items-center px-4 gap-3">
          <span className="text-[9px] font-black tracking-widest uppercase text-t3">Preview</span>
          {afterSrc && (
            <span className="flex items-center gap-1 text-[9px] font-black tracking-widest uppercase text-ok">
              <span className="w-1.5 h-1.5 rounded-full bg-ok animate-pulse" />LIVE
            </span>
          )}
          {lut && <Badge color="accent">LUT Baked</Badge>}
          {nodes.some(n => n.type==='smartsel' && n.enabled && (n.params.showMask as boolean)) && (
            <Badge color="warn">Mask View</Badge>
          )}
          {footImg ? (
            <span className="text-[10px] text-t3 font-mono ml-auto">← drag to compare →</span>
          ) : (
            <label className="flex items-center gap-1.5 text-[10px] text-t3 cursor-pointer hover:text-accent transition-colors ml-auto">
              <input type="file" accept="image/*" className="sr-only" onChange={e => { const f=e.target.files?.[0]; if(f) handleFootage(f) }} />
              + Drop footage still
            </label>
          )}
        </div>

        <div className="flex-1 bg-bg flex items-center justify-center overflow-hidden relative">
          {!footImg ? (
            <label className="flex flex-col items-center gap-3 text-t3 cursor-pointer group">
              <input type="file" accept="image/*" className="sr-only" onChange={e => { const f=e.target.files?.[0]; if(f) handleFootage(f) }} />
              <span className="text-6xl opacity-20">🎬</span>
              <span className="text-sm font-bold group-hover:text-accent transition-colors">Drop a footage still to preview</span>
              <span className="text-xs opacity-60">Preview updates live as you adjust sliders</span>
            </label>
          ) : (
            <div ref={splitRef}
              className="relative w-full h-full cursor-col-resize select-none"
              onMouseMove={e => {
                if (e.buttons !== 1) return
                const r = splitRef.current!.getBoundingClientRect()
                setSplitPos(Math.max(5, Math.min(95, (e.clientX - r.left) / r.width * 100)))
              }}>
              {/* Before */}
              {footSrc && <img src={footSrc} alt="Before" className="absolute inset-0 w-full h-full object-contain" />}
              {/* After — real-time */}
              {afterSrc && (
                <img src={afterSrc} alt="After" className="absolute inset-0 w-full h-full object-contain"
                  style={{ clipPath:`inset(0 ${100-splitPos}% 0 0)` }} />
              )}
              {/* Divider handle */}
              <div className="absolute top-0 bottom-0 w-0.5 bg-white/80 pointer-events-none" style={{ left:`${splitPos}%` }}>
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-white shadow-lg flex items-center justify-center text-[11px] font-black text-black">⇔</div>
              </div>
              <div className="absolute bottom-3 left-3 text-[9px] font-bold text-white/70 tracking-widest uppercase bg-black/40 px-2 py-0.5 rounded-full">BEFORE</div>
              <div className="absolute bottom-3 right-3 text-[9px] font-bold text-white/70 tracking-widest uppercase bg-black/40 px-2 py-0.5 rounded-full">AFTER</div>

              {/* Replace footage */}
              <label className="absolute top-3 right-3 text-[9px] font-bold text-white/50 tracking-widest uppercase bg-black/30 px-2 py-0.5 rounded-full cursor-pointer hover:text-white/80 hover:bg-black/50 transition-colors">
                <input type="file" accept="image/*" className="sr-only" onChange={e => { const f=e.target.files?.[0]; if(f) handleFootage(f) }} />
                ↺ replace
              </label>
            </div>
          )}
        </div>
      </div>

      {/* RIGHT — Export */}
      <div className="w-60 flex-shrink-0 border-l border-b1 flex flex-col">
        <div className="h-10 border-b border-b1 flex items-center px-4">
          <span className="text-[9px] font-black tracking-widest uppercase text-t3">Export</span>
          {lut && <span className="ml-auto"><Badge color="ok">Ready</Badge></span>}
        </div>
        <div className="flex-1 p-4 flex flex-col gap-4 overflow-y-auto">
          <div>
            <label className="text-[9px] font-black tracking-widest uppercase text-t3 block mb-1.5">LUT Name</label>
            <input value={lutName} onChange={e => setLutName(e.target.value)}
              className="w-full bg-s2 border border-b1 text-txt px-3 py-2 rounded-lg text-sm outline-none focus:border-accent" />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => downloadLUT('cube')} disabled={!lut}
              className="flex flex-col items-center gap-1 bg-s2 border border-b1 rounded-xl p-3 hover:border-accent transition-colors disabled:opacity-30">
              <span className="font-black text-base text-txt">.cube</span>
              <span className="text-[9px] text-t3">Resolve · PP</span>
            </button>
            <button onClick={() => downloadLUT('3dl')} disabled={!lut}
              className="flex flex-col items-center gap-1 bg-s2 border border-b1 rounded-xl p-3 hover:border-accent transition-colors disabled:opacity-30">
              <span className="font-black text-base text-txt">.3dl</span>
              <span className="text-[9px] text-t3">Flame · Lustre</span>
            </button>
          </div>

          {!lut && (
            <p className="text-[10px] text-t3 text-center leading-relaxed">
              Click <strong className="text-txt">Bake LUT</strong> to generate<br />the export file
            </p>
          )}

          {lut && (
            <div className="bg-s2 border border-b1 rounded-xl overflow-hidden">
              {[['Size',lutSize+'³'],['Input',logFmt==='none'?'Rec.709':logFmt],['Nodes',nodes.filter(n=>n.enabled).length+' active']].map(([k,v]) => (
                <div key={k} className="flex justify-between px-3 py-2 border-b border-b1 last:border-0 text-xs">
                  <span className="text-t2">{k}</span>
                  <span className="text-accent font-mono">{v}</span>
                </div>
              ))}
            </div>
          )}

          <div className="text-[10px] text-t2 leading-relaxed space-y-2 pt-1">
            <p><strong className="text-txt block">Premiere Pro</strong>Lumetri → Creative → Look → Browse</p>
            <p><strong className="text-txt block">DaVinci Resolve</strong>Color → LUTs → Open Folder → paste</p>
            <p><strong className="text-txt block">After Effects</strong>Effect → Apply Color LUT</p>
          </div>
        </div>
      </div>
    </div>
  )
}
