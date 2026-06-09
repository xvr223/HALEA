'use client'
import { useState, useRef, useCallback } from 'react'
import { useAuthStore } from '@/store/auth'
import { Btn, Slider, Select, Badge, SectionHeader, DropZone, Toggle, toast } from '@/components/ui'
import { Download, Zap, Sparkles, ChevronDown, ChevronRight } from 'lucide-react'

// ── Types ────────────────────────────────────────────────────────────────
type StudioMode = 'manual' | 'ai'
type TabView = 'lut' | 'halation'
type NodeType = 'primary' | 'curves' | 'hsl' | 'look' | 'halation'

interface GradeNode {
  id: string; type: NodeType; enabled: boolean; expanded: boolean
  params: Record<string, number | string | null>
}

// ── Color Engine (inline) ─────────────────────────────────────────────────
const clamp = (v: number, lo = 0, hi = 1) => v < lo ? lo : v > hi ? hi : v
const luma = (r: number, g: number, b: number) => 0.2126*r + 0.7152*g + 0.0722*b

function applyNodes(r: number, g: number, b: number, nodes: GradeNode[]): [number,number,number] {
  for (const node of nodes) {
    if (!node.enabled) continue
    const p = node.params
    if (node.type === 'primary') {
      const lift = (p.lift as number) || 0
      const gamma = (p.gamma as number) || 0
      const temp = (p.temp as number) || 0
      const tint = (p.tint as number) || 0
      const con = (p.con as number) || 0
      const sat = (p.sat as number) || 0
      r = clamp(r + temp*0.15 + lift*(1-r)*0.8 + lift*0.2)
      g = clamp(g - tint*0.12 + lift*(1-g)*0.8 + lift*0.2)
      b = clamp(b - temp*0.15 + tint*0.04 + lift*(1-b)*0.8 + lift*0.2)
      if (gamma) { r=clamp(Math.pow(r,1/(1+gamma))); g=clamp(Math.pow(g,1/(1+gamma))); b=clamp(Math.pow(b,1/(1+gamma))) }
      if (con) { r=clamp(0.5+(r-0.5)*(1+con)); g=clamp(0.5+(g-0.5)*(1+con)); b=clamp(0.5+(b-0.5)*(1+con)) }
      if (sat) { const lm=luma(r,g,b),s=1+sat; r=clamp(lm+(r-lm)*s); g=clamp(lm+(g-lm)*s); b=clamp(lm+(b-lm)*s) }
    }
    if (node.type === 'look') {
      const amount = (p.amount as number) || 0.5
      const looks: Record<string, number[]> = {
        cinematic: [-0.05,0.15,0.04,0.02],warm:[0.05,0.05,0.02,0.08],cool:[0.02,0.06,0.02,-0.06],
        bleach:[-0.3,0.25,-0.02,0],vintage:[-0.1,0.05,0.06,0.05],teal_orange:[0.08,0.14,0.04,0.03],
        moody:[-0.18,0.1,0.07,-0.03],faithful:[0,0,0,0],natural:[0.02,0.02,0.01,0.01]
      }
      const [ls,lc,ll,lw] = looks[String(p.look)||'faithful'] || [0,0,0,0]
      const lm = luma(r,g,b), sf = 1+ls
      let nr=clamp(lm+(r-lm)*sf), ng=clamp(lm+(g-lm)*sf), nb=clamp(lm+(b-lm)*sf)
      nr=clamp(0.5+(nr-0.5)*(1+lc)); ng=clamp(0.5+(ng-0.5)*(1+lc)); nb=clamp(0.5+(nb-0.5)*(1+lc))
      nr=clamp(nr+ll*(1-nr)+lw*0.25); ng=clamp(ng+ll*(1-ng)); nb=clamp(nb+ll*(1-nb)-lw*0.18)
      r=r+(nr-r)*amount; g=g+(ng-g)*amount; b=b+(nb-b)*amount
    }
    if (node.type === 'halation') {
      const thr = 1-(p.threshold as number || 0.6)
      const lh = luma(r,g,b)
      if (lh > thr) {
        const fac = Math.pow((lh-thr)/(1-thr),1.5)*(p.intensity as number||0.25)
        r=clamp(r+fac*0.5); g=clamp(g+fac*0.03); b=clamp(b-fac*0.05)
      }
    }
  }
  return [r,g,b]
}

function bakeLUT(nodes: GradeNode[], size: number): Float32Array {
  const lut = new Float32Array(size**3*3)
  let idx = 0
  for (let bi=0;bi<size;bi++) for (let gi=0;gi<size;gi++) for (let ri=0;ri<size;ri++) {
    const [r,g,b] = applyNodes(ri/(size-1), gi/(size-1), bi/(size-1), nodes)
    lut[idx++]=clamp(r); lut[idx++]=clamp(g); lut[idx++]=clamp(b)
  }
  return lut
}

function trilinear(ri: number, gi: number, bi: number, lut: Float32Array, size: number): [number,number,number] {
  const R=ri/255*(size-1), G=gi/255*(size-1), B=bi/255*(size-1)
  const r0=Math.floor(R),g0=Math.floor(G),b0=Math.floor(B)
  const r1=Math.min(r0+1,size-1),g1=Math.min(g0+1,size-1),b1=Math.min(b0+1,size-1)
  const dr=R-r0,dg=G-g0,db=B-b0
  const gv=(rr:number,gg:number,bb:number,c:number) => lut[(bb*size*size+gg*size+rr)*3+c]
  return [0,1,2].map(c => {
    const c0 = (1-dg)*((1-dr)*gv(r0,g0,b0,c)+dr*gv(r1,g0,b0,c)) + dg*((1-dr)*gv(r0,g1,b0,c)+dr*gv(r1,g1,b0,c))
    const c1 = (1-dg)*((1-dr)*gv(r0,g0,b1,c)+dr*gv(r1,g0,b1,c)) + dg*((1-dr)*gv(r0,g1,b1,c)+dr*gv(r1,g1,b1,c))
    return clamp(Math.round(((1-db)*c0+db*c1)*255),0,255)
  }) as [number,number,number]
}

// ── Default node stack ──────────────────────────────────────────────────
const mkId = () => 'n' + Date.now() + Math.random().toString(36).slice(2,4)
const DEFAULT_NODES: GradeNode[] = [
  { id: mkId(), type: 'primary', enabled: true, expanded: false, params: { lift:0, gamma:0, temp:0, tint:0, con:0, sat:0 } },
  { id: mkId(), type: 'look', enabled: true, expanded: false, params: { look:'cinematic', amount:0.5 } },
  { id: mkId(), type: 'halation', enabled: true, expanded: false, params: { threshold:0.62, intensity:0.2 } },
]

// ── Main Component ────────────────────────────────────────────────────────
export default function StudioPage() {
  const [tab, setTab] = useState<TabView>('lut')
  const [mode, setMode] = useState<StudioMode>('manual')
  const [nodes, setNodes] = useState<GradeNode[]>(DEFAULT_NODES)
  const [lut, setLut] = useState<Float32Array | null>(null)
  const [lutSize] = useState(33)
  const [baking, setBaking] = useState(false)
  const [aiLoading, setAiLoading] = useState(false)
  const [refImg, setRefImg] = useState<string | null>(null)
  const [footImg, setFootImg] = useState<ImageData | null>(null)
  const [footSrc, setFootSrc] = useState<string | null>(null)
  const [logFmt, setLogFmt] = useState('none')
  const [targetGamut, setTargetGamut] = useState('rec709')
  const [lutName, setLutName] = useState('HALEA_LUT_001')
  const [splitPos, setSplitPos] = useState(50)
  const { user, useCredit, credits } = useAuthStore()

  const splitRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  // Bake LUT from node stack
  const handleBake = useCallback(async () => {
    setBaking(true)
    await new Promise(r => setTimeout(r, 20))
    const result = bakeLUT(nodes, lutSize)
    setLut(result)
    setBaking(false)
    toast('✓ LUT baked from ' + nodes.filter(n=>n.enabled).length + ' nodes')
    if (footImg) applyToCanvas(result, footImg)
  }, [nodes, lutSize, footImg])

  // AI Match
  const handleAiMatch = async () => {
    if (!refImg) { toast('Upload a reference photo first', 'err'); return }
    if (user?.role !== 'admin' && !useCredit()) {
      toast('No AI credits — buy from Shop', 'err'); return
    }
    setAiLoading(true)
    try {
      const b64 = refImg.split(',')[1]
      const res = await fetch('/api/ai-match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514', max_tokens: 600,
          system: `You are a professional colorist. Analyze the visual look of the reference image. Return ONLY valid JSON with these keys: temp (float -0.4 to 0.4), tint (float -0.3 to 0.3), con (float -0.3 to 0.3), sat (float -0.4 to 0.4), gamma (float -0.3 to 0.3), blackLift (float 0 to 0.08), look (one of: faithful,cinematic,warm,cool,bleach,vintage,moody,natural,teal_orange), lookAmount (float 0 to 0.6), halationIntensity (float 0 to 0.35), description (string 3 words). No markdown, no explanation.`,
          messages: [{ role: 'user', content: [
            { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: b64 } },
            { type: 'text', text: 'Analyze color grade and return JSON.' }
          ]}]
        })
      })
      const data = await res.json()
      const raw = data.content?.map((c: any) => c.text || '').join('').replace(/```json|```/g,'').trim()
      const p = JSON.parse(raw)
      const newNodes: GradeNode[] = [
        { id: mkId(), type: 'primary', enabled: true, expanded: false, params: { lift: p.blackLift||0, gamma: p.gamma||0, temp: p.temp||0, tint: p.tint||0, con: p.con||0, sat: p.sat||0 } },
        { id: mkId(), type: 'look', enabled: p.look !== 'faithful', expanded: false, params: { look: p.look||'cinematic', amount: p.lookAmount||0.45 } },
        { id: mkId(), type: 'halation', enabled: (p.halationIntensity||0) > 0.05, expanded: false, params: { threshold: 0.65, intensity: p.halationIntensity||0.2 } },
      ]
      setNodes(newNodes)
      toast('🤖 AI Match: ' + (p.description || 'Grade applied'))
    } catch (e: any) {
      toast('AI Match failed: ' + e.message, 'err')
    }
    setAiLoading(false)
  }

  const applyToCanvas = (lutData: Float32Array, imgData: ImageData) => {
    const src = imgData.data
    const out = new Uint8ClampedArray(src.length)
    for (let i = 0; i < src.length; i += 4) {
      const [nr, ng, nb] = trilinear(src[i], src[i+1], src[i+2], lutData, lutSize)
      out[i]=nr; out[i+1]=ng; out[i+2]=nb; out[i+3]=255
    }
    return new ImageData(out, imgData.width, imgData.height)
  }

  const handleFootage = (f: File) => {
    const img = new Image(), url = URL.createObjectURL(f)
    img.onload = () => {
      const c = document.createElement('canvas')
      const scale = Math.min(1, 900/img.width)
      c.width = Math.round(img.width*scale); c.height = Math.round(img.height*scale)
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height)
      const data = c.getContext('2d')!.getImageData(0, 0, c.width, c.height)
      setFootImg(data); setFootSrc(c.toDataURL())
      if (lut) { const after = applyToCanvas(lut, data); /* draw to canvases */ }
      URL.revokeObjectURL(url)
    }
    img.src = url
  }

  const downloadLUT = (fmt: 'cube' | '3dl') => {
    if (!lut) { handleBake().then(() => {}); return }
    const name = lutName || 'HALEA_LUT'
    let content = '', filename = ''
    if (fmt === 'cube') {
      filename = name + '.cube'
      content = `# HALEA — by @robbiesatriaa\nLUT_3D_SIZE ${lutSize}\nDOMAIN_MIN 0.0 0.0 0.0\nDOMAIN_MAX 1.0 1.0 1.0\n\n`
      for (let i = 0; i < lut.length; i += 3) content += `${lut[i].toFixed(6)} ${lut[i+1].toFixed(6)} ${lut[i+2].toFixed(6)}\n`
    } else {
      filename = name + '.3dl'
      content = `3DMESH\nMesh 1 12\n0 ${(lutSize-1)*4} ${(lutSize-1)*4} ${(lutSize-1)*4}\n\n`
      for (let i = 0; i < lut.length; i += 3) content += `${Math.round(lut[i]*4095)} ${Math.round(lut[i+1]*4095)} ${Math.round(lut[i+2]*4095)}\n`
    }
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([content])); a.download = filename; a.click()
    toast('✓ Downloaded: ' + filename)
  }

  const updateNode = (id: string, params: Partial<GradeNode['params']>) => {
    setNodes(ns => ns.map(n => n.id === id ? { ...n, params: { ...n.params, ...params } } : n))
  }
  const toggleNode = (id: string) => setNodes(ns => ns.map(n => n.id === id ? { ...n, enabled: !n.enabled } : n))
  const expandNode = (id: string) => setNodes(ns => ns.map(n => n.id === id ? { ...n, expanded: !n.expanded } : n))
  const addNode = (type: NodeType) => {
    const defaults: Record<NodeType, GradeNode['params']> = {
      primary: { lift:0, gamma:0, temp:0, tint:0, con:0, sat:0 },
      curves:  { master: null, r: null, g: null, b: null },
      hsl:     { centerHue:0.05, range:0.1, hueShift:0, satShift:0, lumShift:0 },
      look:    { look:'cinematic', amount:0.5 },
      halation:{ threshold:0.62, intensity:0.2 },
    }
    setNodes(ns => [...ns, { id: mkId(), type, enabled: true, expanded: true, params: defaults[type] }])
  }

  const NODE_META: Record<NodeType, { icon: string; label: string }> = {
    primary:  { icon: '🎚', label: 'Primary' },
    curves:   { icon: '📈', label: 'Curves' },
    hsl:      { icon: '🎯', label: 'HSL Secondary' },
    look:     { icon: '🎬', label: 'Look' },
    halation: { icon: '✦', label: 'Halation' },
  }

  return (
    <div className="flex h-[calc(100vh-56px)] overflow-hidden">

      {/* LEFT — Controls */}
      <div className="w-72 flex-shrink-0 border-r border-b1 flex flex-col">

        {/* Tab switcher */}
        <div className="flex border-b border-b1">
          {(['lut', 'halation'] as TabView[]).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`flex-1 py-3 text-xs font-black tracking-widest uppercase transition-colors ${tab === t ? 'text-accent border-b-2 border-accent' : 'text-t3 hover:text-t2'}`}>
              {t === 'lut' ? '🎞 LUT Studio' : '✦ Halation'}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">

          {/* Mode (LUT tab only) */}
          {tab === 'lut' && (
            <div className="flex gap-1.5 mb-1">
              <button onClick={() => setMode('manual')} className={`flex-1 py-2 rounded-lg text-xs font-bold tracking-wide uppercase transition-colors ${mode==='manual' ? 'bg-accent text-white' : 'bg-s3 text-t2 hover:text-txt'}`}>
                <Zap size={12} className="inline mr-1" />Manual
              </button>
              <button onClick={() => setMode('ai')} className={`flex-1 py-2 rounded-lg text-xs font-bold tracking-wide uppercase transition-colors ${mode==='ai' ? 'bg-a4 text-black' : 'bg-s3 text-t2 hover:text-txt'}`}>
                <Sparkles size={12} className="inline mr-1" />AI Match
              </button>
            </div>
          )}

          {/* Reference (AI mode) */}
          {tab === 'lut' && mode === 'ai' && (
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

          {/* Source settings */}
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
          {tab === 'lut' && (
            <div>
              <SectionHeader accent>⬢ Grade Nodes</SectionHeader>

              {/* Add node */}
              <div className="flex flex-wrap gap-1 mb-3">
                {(['primary','look','halation','hsl'] as NodeType[]).map(t => (
                  <button key={t} onClick={() => addNode(t)}
                    className="text-[9px] font-bold px-2.5 py-1 rounded-full border border-dashed border-b2 text-t2 hover:border-accent hover:text-accent transition-colors">
                    +{t}
                  </button>
                ))}
              </div>

              {/* Node stack */}
              <div className="flex flex-col gap-2">
                {nodes.map(n => {
                  const meta = NODE_META[n.type]
                  return (
                    <div key={n.id} className={`bg-s3 border rounded-xl overflow-hidden ${n.enabled ? 'border-b2' : 'border-b1 opacity-50'}`}>
                      <div className="flex items-center gap-2 px-3 py-2.5 cursor-pointer" onClick={() => expandNode(n.id)}>
                        <span className="text-sm">{meta.icon}</span>
                        <span className="text-xs font-bold flex-1">{meta.label}</span>
                        <button onClick={e => { e.stopPropagation(); toggleNode(n.id) }}
                          className={`w-6 h-3.5 rounded-full transition-colors flex-shrink-0 ${n.enabled ? 'bg-accent' : 'bg-b2'}`}>
                          <div className={`w-2.5 h-2.5 bg-white rounded-full mt-0.5 transition-all ${n.enabled ? 'ml-3' : 'ml-0.5'}`} />
                        </button>
                        {n.expanded ? <ChevronDown size={12} className="text-t3" /> : <ChevronRight size={12} className="text-t3" />}
                      </div>

                      {n.expanded && (
                        <div className="px-3 pb-3 flex flex-col gap-2 border-t border-b1">
                          <div className="h-2" />
                          {n.type === 'primary' && (<>
                            <Slider label="Lift" min={-0.4} max={0.4} step={0.01} value={n.params.lift as number} format={v=>v.toFixed(2)} onChange={v=>updateNode(n.id,{lift:v})} />
                            <Slider label="Gamma" min={-0.5} max={0.5} step={0.01} value={n.params.gamma as number} format={v=>v.toFixed(2)} onChange={v=>updateNode(n.id,{gamma:v})} />
                            <Slider label="Temp" min={-0.5} max={0.5} step={0.01} value={n.params.temp as number} format={v=>v.toFixed(2)} onChange={v=>updateNode(n.id,{temp:v})} />
                            <Slider label="Tint" min={-0.4} max={0.4} step={0.01} value={n.params.tint as number} format={v=>v.toFixed(2)} onChange={v=>updateNode(n.id,{tint:v})} />
                            <Slider label="Contrast" min={-0.6} max={0.6} step={0.01} value={n.params.con as number} format={v=>v.toFixed(2)} onChange={v=>updateNode(n.id,{con:v})} />
                            <Slider label="Saturation" min={-0.8} max={0.8} step={0.01} value={n.params.sat as number} format={v=>v.toFixed(2)} onChange={v=>updateNode(n.id,{sat:v})} />
                          </>)}
                          {n.type === 'look' && (<>
                            <Select value={String(n.params.look)} onChange={e=>updateNode(n.id,{look:e.target.value})}>
                              {['faithful','cinematic','warm','cool','bleach','vintage','moody','natural','teal_orange'].map(l=><option key={l}>{l}</option>)}
                            </Select>
                            <Slider label="Amount" min={0} max={1} step={0.01} value={n.params.amount as number} format={v=>v.toFixed(2)} onChange={v=>updateNode(n.id,{amount:v})} />
                          </>)}
                          {n.type === 'halation' && (<>
                            <Slider label="Threshold" min={0.3} max={0.95} step={0.01} value={n.params.threshold as number} format={v=>v.toFixed(2)} onChange={v=>updateNode(n.id,{threshold:v})} />
                            <Slider label="Intensity" min={0} max={0.8} step={0.01} value={n.params.intensity as number} format={v=>v.toFixed(2)} onChange={v=>updateNode(n.id,{intensity:v})} />
                          </>)}
                          {n.type === 'hsl' && (<>
                            <Slider label="Center Hue" min={0} max={1} step={0.01} value={n.params.centerHue as number} format={v=>v.toFixed(2)} onChange={v=>updateNode(n.id,{centerHue:v})} />
                            <Slider label="Range" min={0.02} max={0.4} step={0.01} value={n.params.range as number} format={v=>v.toFixed(2)} onChange={v=>updateNode(n.id,{range:v})} />
                            <Slider label="Hue Shift" min={-0.2} max={0.2} step={0.005} value={n.params.hueShift as number} format={v=>v.toFixed(3)} onChange={v=>updateNode(n.id,{hueShift:v})} />
                            <Slider label="Sat Shift" min={-1} max={1} step={0.01} value={n.params.satShift as number} format={v=>v.toFixed(2)} onChange={v=>updateNode(n.id,{satShift:v})} />
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

        {/* Bake Button */}
        <div className="p-3 border-t border-b1 flex flex-col gap-2">
          <Btn variant="accent" size="lg" className="w-full" loading={baking} onClick={handleBake}>
            <Zap size={14} /> Bake LUT
          </Btn>
        </div>
      </div>

      {/* CENTER — Preview */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="h-10 border-b border-b1 flex items-center px-4 gap-3">
          <span className="text-[9px] font-black tracking-widest uppercase text-t3">Preview</span>
          {lut && <Badge color="ok">LUT Ready</Badge>}
          {footImg ? (
            <span className="text-[10px] text-t3 font-mono ml-2">Drag split to compare</span>
          ) : (
            <label className="flex items-center gap-1.5 text-[10px] text-t3 cursor-pointer hover:text-accent transition-colors ml-2">
              <input type="file" accept="image/*" className="sr-only" onChange={e => { const f = e.target.files?.[0]; if(f) handleFootage(f) }} />
              + Drop footage still
            </label>
          )}
        </div>

        <div className="flex-1 bg-bg flex items-center justify-center overflow-hidden relative">
          {!footImg ? (
            <label className="flex flex-col items-center gap-3 text-t3 cursor-pointer group">
              <input type="file" accept="image/*" className="sr-only" onChange={e => { const f = e.target.files?.[0]; if(f) handleFootage(f) }} />
              <span className="text-6xl opacity-20">🎬</span>
              <span className="text-sm font-bold group-hover:text-accent transition-colors">Drop footage still frame to preview</span>
              <span className="text-xs">Bake a LUT first, then preview before/after</span>
            </label>
          ) : (
            <div ref={splitRef}
              className="relative max-w-full max-h-full cursor-col-resize select-none overflow-hidden rounded-xl"
              style={{ width: '100%', height: '100%' }}
              onMouseMove={e => {
                if (e.buttons !== 1) return
                const r = splitRef.current!.getBoundingClientRect()
                setSplitPos(Math.max(5, Math.min(95, (e.clientX - r.left) / r.width * 100)))
              }}>
              {/* Before */}
              {footSrc && <img src={footSrc} alt="Before" className="absolute inset-0 w-full h-full object-contain" />}
              {/* After */}
              {lut && footImg && (() => {
                const after = applyToCanvas(lut, footImg)
                const c = document.createElement('canvas')
                c.width = footImg.width; c.height = footImg.height
                c.getContext('2d')!.putImageData(after, 0, 0)
                return <img src={c.toDataURL()} alt="After" className="absolute inset-0 w-full h-full object-contain"
                  style={{ clipPath: `inset(0 ${100-splitPos}% 0 0)` }} />
              })()}
              {/* Divider */}
              <div className="absolute top-0 bottom-0 w-0.5 bg-white opacity-80 pointer-events-none" style={{ left: `${splitPos}%` }}>
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-white shadow-lg flex items-center justify-center text-[11px] font-black text-black">⇔</div>
              </div>
              <div className="absolute bottom-3 left-3 text-[9px] font-bold text-white/60 tracking-widest uppercase">BEFORE</div>
              <div className="absolute bottom-3 right-3 text-[9px] font-bold text-white/60 tracking-widest uppercase">AFTER</div>
            </div>
          )}
        </div>
      </div>

      {/* RIGHT — Export */}
      <div className="w-60 flex-shrink-0 border-l border-b1 flex flex-col">
        <div className="h-10 border-b border-b1 flex items-center px-4">
          <span className="text-[9px] font-black tracking-widest uppercase text-t3">Export</span>
          {lut && <Badge color="ok" className="ml-auto">Ready</Badge>}
        </div>
        <div className="flex-1 p-4 flex flex-col gap-4">
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

          {/* LUT info */}
          {lut && (
            <div className="bg-s2 border border-b1 rounded-xl overflow-hidden">
              {[['Size', lutSize+'³'], ['Input', logFmt === 'none' ? 'Rec.709' : logFmt], ['Nodes', nodes.filter(n=>n.enabled).length + ' active']].map(([k,v]) => (
                <div key={k} className="flex justify-between px-3 py-2 border-b border-b1 last:border-0 text-xs">
                  <span className="text-t2">{k}</span>
                  <span className="text-accent font-mono">{v}</span>
                </div>
              ))}
            </div>
          )}

          {/* How to use */}
          <div className="text-[10px] text-t2 leading-relaxed space-y-2">
            <p><strong className="text-txt block text-[10px]">Premiere Pro</strong>Lumetri → Creative → Look → Browse</p>
            <p><strong className="text-txt block text-[10px]">DaVinci Resolve</strong>Color → LUTs → Open Folder → paste</p>
            <p><strong className="text-txt block text-[10px]">After Effects</strong>Effect → Apply Color LUT</p>
          </div>
        </div>
      </div>
    </div>
  )
}
