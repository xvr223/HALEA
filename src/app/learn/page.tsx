'use client'
import { useState, useEffect } from 'react'

const TOOLS = [
  { id: 'grainGen',  icon: '🎞', title: 'Film Grain Generator', badge: 'NEW', color: 'text-accent' },
  { id: 'frameCalc', icon: '⏱', title: 'Frame Rate Calc', badge: 'CALC', color: 'text-a2' },
  { id: 'colorTemp', icon: '🌡', title: 'Color Temp Chart', badge: 'REF', color: 'text-warn' },
  { id: 'logGuide',  icon: '📊', title: 'Log Exposure Guide', badge: 'GUIDE', color: 'text-accent' },
  { id: 'storage',   icon: '💾', title: 'Storage Calculator', badge: 'CALC', color: 'text-a2' },
  { id: 'aspect',    icon: '📐', title: 'Aspect Ratio Guide', badge: 'REF', color: 'text-a3' },
  { id: 'shortcuts', icon: '⌨️', title: 'Premiere Shortcuts', badge: 'CHEAT', color: 'text-a4' },
  { id: 'shotMatch', icon: '🎨', title: 'Shot Match Tips', badge: 'TIPS', color: 'text-ok' },
  { id: 'export',    icon: '🚀', title: 'Export Settings', badge: 'GUIDE', color: 'text-accent' },
]

const LESSONS = [
  { id: 1, title: 'Apa itu LUT?', sub: 'Konsep dasar color grading', tag: 'DASAR', color: 'text-ok border-ok/30 bg-ok/10', body: `<h3>LUT = Look Up Table</h3><p>File berisi tabel warna — tiap input RGB dipetakan ke output. Mirip filter Instagram tapi jauh lebih presisi.</p><h3>Tipe LUT</h3><ul><li><strong>Technical</strong> — konversi log ke Rec.709</li><li><strong>Creative</strong> — gaya visual (cinematic, warm, dll)</li></ul><div class="tip">💡 LUT dari HALEA menggabungkan technical + creative dalam satu file.</div>` },
  { id: 2, title: 'Apa itu Log?', sub: 'Kenapa footage terlihat flat', tag: 'DASAR', color: 'text-ok border-ok/30 bg-ok/10', body: `<h3>Log = Profile Simpan Detail Maksimal</h3><p>Kamera sengaja ga proses warna biar detail shadow & highlight kesimpen. Hasilnya flat — itu tugas editor untuk grade.</p><h3>Pipeline yang Benar</h3><p>Log → LUT (technical) → Color Grade → Export</p>` },
  { id: 3, title: 'Halation Effect', sub: 'Glow khas film analog', tag: 'FILM LOOK', color: 'text-accent border-accent/30 bg-accent/10', body: `<h3>Halation — Cahaya Bocor</h3><p>Di film analog, cahaya terang nembus emulsi dan mantul balik, bikin glow kemerahan di highlight. Efek ini yang bikin film look terasa organik.</p><h3>Parameter Penting</h3><ul><li><strong>Threshold</strong> — highlight pemicu halation</li><li><strong>Intensity</strong> — kekuatan blend</li><li><strong>Light Bleed</strong> — red channel fringe (khas CineStill)</li></ul>` },
  { id: 4, title: 'Apply LUT di Premiere 2025', sub: 'Step by step', tag: 'TUTORIAL', color: 'text-a3 border-a3/30 bg-a3/10', body: `<h3>Via Lumetri Color</h3><ul><li>Klik klip di timeline</li><li>Buka Lumetri Color panel</li><li>Creative → Look → Browse → pilih .cube</li><li>Adjust Intensity (80-100%)</li></ul><div class="tip">💡 Pakai Adjustment Layer di track atas — apply LUT sekali, kena semua klip.</div>` },
  { id: 5, title: 'Grade Nodes di HALEA', sub: 'PowerGrade-style workflow', tag: 'HALEA', color: 'text-accent border-accent/30 bg-accent/10', body: `<h3>Node Pipeline</h3><p>Tiap node diproses berurutan, semua di-bake jadi .cube universal:</p><ol><li>Log Input — decode log format</li><li>Primary — exposure, temp, contrast</li><li>Curves — tone curve interaktif</li><li>HSL Secondary — target warna spesifik</li><li>Look — style cinematic</li><li>Halation — film glow</li></ol>` },
  { id: 6, title: 'Teal & Orange Recipe', sub: 'Look blockbuster Hollywood', tag: 'RECIPE', color: 'text-a2 border-a2/30 bg-a2/10', body: `<h3>Recipe di Grade Nodes</h3><ul><li>Primary: temp +0.1, contrast +0.12</li><li>Curves R: angkat highlight merah dikit</li><li>Curves B: turunin mid biru</li><li>HSL Sky: geser hue ke teal</li><li>Look: Teal Orange, amount 50%</li></ul><div class="tip">💡 Jangan overdo. Amount 40-60% lebih kelas dari yang lebay.</div>` },
  { id: 7, title: 'Cara Jual Preset & LUT', sub: 'Monetisasi creator', tag: 'BISNIS', color: 'text-a2 border-a2/30 bg-a2/10', body: `<h3>Pricing Strategy</h3><ul><li>Single LUT: $5-15</li><li>Pack (5-10 LUT): $25-50</li><li>Bundle besar: $50-99</li></ul><h3>Platform</h3><ul><li>Gumroad — paling gampang</li><li>Website sendiri + Stripe</li></ul><div class="tip">💡 Free tier penting! 1-2 LUT gratis untuk narik orang, upsell ke pack berbayar.</div>` },
]

// Lazy factories so each click mounts a fresh component instance
const TOOL_CONTENT: Record<string, () => JSX.Element> = {
  grainGen:  () => <GrainGen />,
  frameCalc: () => <FrameCalc />,
  colorTemp: () => <ColorTempChart />,
  logGuide:  () => <LogGuide />,
  storage:   () => <StorageCalc />,
  shortcuts: () => <ShortcutsSheet />,
  aspect:    () => <AspectGuide />,
  shotMatch: () => <ShotMatchTips />,
  export:    () => <ExportGuide />,
}

export default function LearnPage() {
  const [activeTool, setActiveTool] = useState<string | null>(null)
  const [activeLesson, setActiveLesson] = useState<typeof LESSONS[0] | null>(null)
  const [done, setDone] = useState<Set<number>>(new Set())

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10">

      {/* Header */}
      <div className="mb-12">
        <p className="text-[10px] font-bold tracking-[.2em] uppercase text-accent mb-3">Tools & Learn</p>
        <h1 className="font-fraunces text-5xl font-semibold mb-3">Editor <span className="italic text-accent">Toolkit</span></h1>
        <p className="text-t2 text-sm">Calculators, references, dan modul belajar color grading.</p>
      </div>

      {/* Tools */}
      <section id="tools" className="mb-16">
        <h2 className="font-bold text-xl mb-5">🛠 Alat Cepat</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {TOOLS.map(t => (
            <button key={t.id} onClick={() => setActiveTool(activeTool === t.id ? null : t.id)}
              className={`bg-s2 border rounded-xl p-4 text-left hover:-translate-y-0.5 transition-all ${activeTool === t.id ? 'border-accent bg-s3' : 'border-b1 hover:border-b3'}`}>
              <span className="text-2xl block mb-2">{t.icon}</span>
              <p className="font-bold text-xs mb-1">{t.title}</p>
              <span className={`text-[9px] font-black tracking-widest ${t.color}`}>{t.badge}</span>
            </button>
          ))}
        </div>
        {activeTool && TOOL_CONTENT[activeTool] && (
          <div className="mt-4 bg-s2 border border-b1 rounded-2xl p-6 animate-fade-in">
            {TOOL_CONTENT[activeTool]()}
          </div>
        )}
      </section>

      {/* Lessons */}
      <section id="learn">
        <h2 className="font-bold text-xl mb-5">📚 Panduan Pemula</h2>
        <div className="flex flex-col gap-3">
          {LESSONS.map(l => (
            <button key={l.id} onClick={() => setActiveLesson(l)}
              className={`flex items-center gap-4 bg-s2 border rounded-xl p-4 text-left hover:border-b3 transition-all ${done.has(l.id) ? 'border-ok/30 bg-ok/5' : 'border-b1'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-black flex-shrink-0 ${done.has(l.id) ? 'bg-ok/20 text-ok' : 'bg-s4 text-t2'}`}>
                {done.has(l.id) ? '✓' : l.id}
              </div>
              <div className="flex-1">
                <p className="font-bold text-sm">{l.title}</p>
                <p className="text-t2 text-xs">{l.sub}</p>
              </div>
              <span className={`text-[9px] font-black tracking-widest uppercase px-2 py-1 rounded border ${l.color}`}>{l.tag}</span>
            </button>
          ))}
        </div>
      </section>

      {/* Lesson Modal */}
      {activeLesson && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in"
          onClick={e => e.target === e.currentTarget && setActiveLesson(null)}>
          <div className="bg-s2 border border-b2 rounded-2xl max-w-lg w-full max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-b1">
              <h2 className="font-bold text-lg">{activeLesson.title}</h2>
              <button onClick={() => setActiveLesson(null)} className="text-t2 hover:text-txt text-xl">✕</button>
            </div>
            <div className="p-5 text-sm text-t2 leading-relaxed prose prose-invert prose-sm max-w-none"
              dangerouslySetInnerHTML={{ __html: activeLesson.body
                .replace(/<h3>/g, '<h3 class="text-txt font-bold text-sm mt-4 mb-2 first:mt-0">')
                .replace(/<ul>/g, '<ul class="list-disc pl-4 mb-3 space-y-1">')
                .replace(/<ol>/g, '<ol class="list-decimal pl-4 mb-3 space-y-1">')
                .replace(/<div class="tip">/g, '<div class="bg-accent/10 border border-accent/20 rounded-xl p-3 my-3 text-accent text-xs">')
                .replace(/<strong>/g, '<strong class="text-txt">')
              }} />
            <div className="flex gap-2 p-5 border-t border-b1">
              <button onClick={() => setActiveLesson(null)} className="px-4 py-2 bg-s4 border border-b2 rounded-xl text-xs font-bold text-t2 hover:text-txt transition-colors">Tutup</button>
              {!done.has(activeLesson.id) && (
                <button onClick={() => { setDone(d => new Set([...d, activeLesson.id])); setActiveLesson(null) }}
                  className="px-4 py-2 bg-accent text-white rounded-xl text-xs font-bold hover:bg-orange-400 transition-colors">
                  ✓ Tandai Selesai
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Tool Components ────────────────────────────────────────────────────────
function FrameCalc() {
  const [fps, setFps] = useState('30')
  const [dur, setDur] = useState(60)
  const frames = Math.round(parseFloat(fps) * dur)
  const tc = [Math.floor(dur/3600), Math.floor(dur/60)%60, dur%60, Math.round(frames%(parseFloat(fps)||30))].map(v=>String(Math.floor(v)).padStart(2,'0')).join(':')
  return (
    <div><h3 className="font-bold text-base mb-4">⏱ Frame Rate Calculator</h3>
    <div className="grid grid-cols-2 gap-3 mb-4">
      <div><label className="text-[9px] font-black tracking-widest uppercase text-t3 block mb-1.5">FPS</label>
        <select value={fps} onChange={e=>setFps(e.target.value)} className="w-full bg-s3 border border-b1 text-txt px-3 py-2 rounded-lg text-sm outline-none">
          {['23.976','24','25','30','50','60','120'].map(f=><option key={f}>{f}</option>)}
        </select></div>
      <div><label className="text-[9px] font-black tracking-widest uppercase text-t3 block mb-1.5">Duration (sec)</label>
        <input type="number" value={dur} onChange={e=>setDur(+e.target.value)} className="w-full bg-s3 border border-b1 text-txt px-3 py-2 rounded-lg text-sm outline-none" /></div>
    </div>
    <div className="bg-s3 rounded-xl p-4 font-mono text-sm space-y-1">
      <p>FPS: <span className="text-accent">{fps}</span></p>
      <p>Duration: <span className="text-accent">{dur}s</span></p>
      <p>Total Frames: <span className="text-accent font-bold">{frames.toLocaleString()}</span></p>
      <p>Timecode: <span className="text-accent">{tc}</span></p>
    </div></div>
  )
}

function ColorTempChart() {
  const temps = [['1800K','Candlelight','#ff6000'],['2700K','Warm Bulb','#ff8c40'],['3200K','Tungsten','#ffaa60'],['4000K','Cool White','#ffd090'],['5000K','Daylight','#fff5e0'],['5600K','Noon Sun','#fffef5'],['6500K','Overcast','#f0f8ff'],['7500K','Cloudy','#d8ecff'],['9000K','Blue Sky','#a8ccff']]
  return (<div><h3 className="font-bold text-base mb-4">🌡 Color Temperature</h3>
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      {temps.map(([k,l,c])=>(
        <div key={k} className="flex items-center gap-3 bg-s3 rounded-xl p-3">
          <div className="w-8 h-8 rounded-lg flex-shrink-0 border border-white/10" style={{background:c}}/>
          <div><p className="font-mono text-sm font-bold text-accent">{k}</p><p className="text-xs text-t2">{l}</p></div>
        </div>))}
    </div></div>)
}

function LogGuide() {
  const logs = [['S-Log2','Sony','Expose +1 to +2 stops. Middle grey ≈ 32%.'],['S-Log3','Sony','Expose +1.5 to +2. Middle grey ≈ 41%.'],['F-Log2','Fujifilm','Expose +1.5. 14+ stops DR.'],['D-Log M','DJI','Expose +0.5 to +1. Osmo Pocket 3.'],['Apple Log','iPhone','Expose +0.5. Auto metering accurate.'],['V-Log','Panasonic','Expose 0 to +1. Wide latitude.']]
  return (<div><h3 className="font-bold text-base mb-4">📊 Log Exposure Guide</h3>
    {logs.map(([n,c,t])=>(<div key={n} className="flex gap-3 bg-s3 rounded-xl p-3 mb-2"><div className="flex-shrink-0"><p className="font-bold text-sm text-accent">{n}</p><p className="text-[10px] text-t3">{c}</p></div><p className="text-xs text-t2 leading-relaxed">{t}</p></div>))}</div>)
}

function StorageCalc() {
  const [mbps, setMbps] = useState(100)
  const [dur, setDur] = useState(60)
  const gb = (mbps*1e6/8*dur*60/1e9).toFixed(1)
  return (<div><h3 className="font-bold text-base mb-4">💾 Storage Calculator</h3>
    <div className="grid grid-cols-2 gap-3 mb-4">
      <div><label className="text-[9px] font-black tracking-widest uppercase text-t3 block mb-1.5">Bitrate (Mbps)</label>
        <select value={mbps} onChange={e=>setMbps(+e.target.value)} className="w-full bg-s3 border border-b1 text-txt px-3 py-2 rounded-lg text-sm outline-none">
          {[[25,'H.264 4K 25'],[50,'H.264 4K 50'],[100,'H.265 100'],[200,'ProRes Proxy'],[400,'ProRes HQ'],[800,'RAW']].map(([v,l])=><option key={v} value={v}>{l} Mbps</option>)}
        </select></div>
      <div><label className="text-[9px] font-black tracking-widest uppercase text-t3 block mb-1.5">Duration (min)</label>
        <input type="number" value={dur} onChange={e=>setDur(+e.target.value)} className="w-full bg-s3 border border-b1 text-txt px-3 py-2 rounded-lg text-sm outline-none" /></div>
    </div>
    <div className="bg-s3 rounded-xl p-4 font-mono text-sm space-y-1">
      <p>File Size: <span className="text-accent font-bold">{gb} GB</span></p>
      <p>256GB card: <span className="text-accent">~{Math.floor(256/+gb)} clips</span></p>
      <p>1TB SSD: <span className="text-accent">~{Math.floor(1000/+gb)} clips</span></p>
    </div></div>)
}

function ShortcutsSheet() {
  const groups = [['NAVIGATION',[['J/K/L','Rewind/Pause/Forward'],['Space','Play/Pause'],['Shift+←→','5 frames jump']]],['EDITING',[['C','Razor'],['V','Selection'],['Ctrl+K','Cut at playhead'],['Q/W','Ripple trim']]],['COLOR',[['Shift+5','Lumetri panel'],['~','Maximize panel']]],['EXPORT',[['Ctrl+M','Export Media'],['Ctrl+Shift+E','Export Frame']]]]
  return (<div><h3 className="font-bold text-base mb-4">⌨️ Premiere Pro Shortcuts</h3>
    {groups.map(([g, items])=>(<div key={String(g)} className="mb-3"><p className="text-[9px] font-black tracking-widest uppercase text-t3 mb-2">{String(g)}</p>
      {(items as string[][]).map(([k,v])=>(<div key={k} className="flex justify-between bg-s3 rounded-lg px-3 py-2 mb-1"><span className="font-mono text-xs text-accent">{k}</span><span className="text-xs text-t2">{v}</span></div>))}
    </div>))}</div>)
}

function AspectGuide() {
  const ratios = [['16:9','1920×1080','YouTube, broadcast'],['2.39:1','Anamorphic','Cinema widescreen'],['9:16','1080×1920','TikTok, Reels'],['1:1','1080×1080','Instagram square'],['4:5','1080×1350','Instagram portrait']]
  return (<div><h3 className="font-bold text-base mb-4">📐 Aspect Ratio Guide</h3>
    {ratios.map(([r,res,use])=>(<div key={r} className="flex justify-between bg-s3 rounded-xl px-4 py-3 mb-2"><span className="font-mono text-sm font-bold text-accent">{r}</span><span className="text-xs text-t3">{res}</span><span className="text-xs text-t2">{use}</span></div>))}</div>)
}

function ShotMatchTips() {
  const tips = [['Match Exposure First','Cek waveform. Samain exposure semua klip sebelum grading.'],['Neutralize WB','Set white balance konsisten dulu pakai grey card / referensi.'],['Skin Tone is King','Skin tone = anchor utama. Konsistenin warna kulit dulu.'],['Use Color Wheels','Lift/Gamma/Gain lebih powerful dari slider untuk match.']]
  return (<div><h3 className="font-bold text-base mb-4">🎨 Shot Match Tips</h3>
    {tips.map(([t,d])=>(<div key={t} className="bg-s3 rounded-xl p-3 mb-2"><p className="font-bold text-xs text-accent mb-1">{t}</p><p className="text-xs text-t2 leading-relaxed">{d}</p></div>))}</div>)
}

function ExportGuide() {
  const settings = [['YouTube 4K','H.264/265 · 3840×2160 · 35-45 Mbps'],['YouTube 1080p','H.264 · 1920×1080 · 15-20 Mbps'],['Instagram Reels','H.264 · 1080×1920 · 8-12 Mbps'],['TikTok','H.264 · 1080×1920 · 8-10 Mbps'],['Master/Archive','ProRes 422 HQ · match source res']]
  return (<div><h3 className="font-bold text-base mb-4">🚀 Export Settings</h3>
    {settings.map(([p,s])=>(<div key={p} className="bg-s3 rounded-xl px-4 py-3 mb-2"><p className="font-bold text-xs text-txt mb-0.5">{p}</p><p className="text-xs text-t2 font-mono">{s}</p></div>))}</div>)
}

function GrainGen() {
  const [intensity, setIntensity] = useState(35)
  const [res,       setRes]       = useState('1920x1080')
  const [type,      setType]      = useState<'mono'|'warm'|'cool'|'film'>('warm')
  const [generating,setGenerating]= useState(false)
  const [previewUrl,setPreviewUrl]= useState<string|null>(null)

  // Generate a small 320×180 preview on param change
  const updatePreview = (t: typeof type, intens: number) => {
    const c = document.createElement('canvas')
    c.width = 320; c.height = 180
    const ctx = c.getContext('2d')!
    const img = ctx.createImageData(320, 180)
    const d = img.data
    for (let i = 0; i < d.length; i += 4) {
      const n  = (Math.random() * 2 - 1) * intens
      const n2 = (Math.random() * 2 - 1) * intens * 0.3
      let r = 128 + n + n2
      let g = 128 + n + n2 * 0.8
      let b = 128 + n + n2 * 0.6
      if (t === 'warm') { r += 10; b -= 12 }
      else if (t === 'cool') { r -= 8; b += 14 }
      else if (t === 'film') { r += 6; g += 1; b -= 8 }
      d[i]=Math.max(0,Math.min(255,r)); d[i+1]=Math.max(0,Math.min(255,g))
      d[i+2]=Math.max(0,Math.min(255,b)); d[i+3]=255
    }
    ctx.putImageData(img, 0, 0)
    setPreviewUrl(c.toDataURL('image/jpeg', 0.92))
  }

  // Generate preview on first render
  useEffect(() => { updatePreview('warm', 35) }, [])

  const generate = () => {
    setGenerating(true)
    setTimeout(() => {
      try {
        const [w, h] = res.split('x').map(Number)
        const c = document.createElement('canvas')
        c.width = w; c.height = h
        const ctx = c.getContext('2d')!
        const img = ctx.createImageData(w, h)
        const d = img.data
        for (let i = 0; i < d.length; i += 4) {
          const n  = (Math.random() * 2 - 1) * intensity
          const n2 = (Math.random() * 2 - 1) * intensity * 0.3
          let r = 128 + n + n2
          let g = 128 + n + n2 * 0.8
          let b = 128 + n + n2 * 0.6
          if (type === 'warm') { r += 10; b -= 12 }
          else if (type === 'cool') { r -= 8; b += 14 }
          else if (type === 'film') { r += 6; g += 1; b -= 8 }
          d[i]=Math.max(0,Math.min(255,r)); d[i+1]=Math.max(0,Math.min(255,g))
          d[i+2]=Math.max(0,Math.min(255,b)); d[i+3]=255
        }
        ctx.putImageData(img, 0, 0)
        const a = document.createElement('a')
        a.href = c.toDataURL('image/png')
        a.download = `HALEA_Grain_${type}_${intensity}.png`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
      } catch {}
      setGenerating(false)
    }, 80)
  }

  return (
    <div>
      <h3 className="font-bold text-base mb-1">🎞 Film Grain Generator</h3>
      <p className="text-xs text-t3 mb-4 leading-relaxed">
        Generate PNG overlay 50% gray dengan film grain. Di timeline: Import PNG → set blend mode <strong className="text-txt">Overlay</strong> atau <strong className="text-txt">Soft Light</strong> → turunin opacity 20–50%.
      </p>
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div>
          <label className="text-[9px] font-black tracking-widest uppercase text-t3 block mb-1.5">Resolusi</label>
          <select value={res} onChange={e=>setRes(e.target.value)} className="w-full bg-s3 border border-b1 text-txt px-3 py-2 rounded-lg text-sm outline-none">
            {[['1920x1080','1080p Full HD'],['3840x2160','4K UHD'],['1080x1920','1080p Vertical']].map(([v,l])=><option key={v} value={v}>{l}</option>)}
          </select>
        </div>
        <div>
          <label className="text-[9px] font-black tracking-widest uppercase text-t3 block mb-1.5">Karakter Grain</label>
          <select value={type} onChange={e=>{const v=e.target.value as typeof type;setType(v);updatePreview(v,intensity)}} className="w-full bg-s3 border border-b1 text-txt px-3 py-2 rounded-lg text-sm outline-none">
            <option value="mono">Mono (netral)</option>
            <option value="warm">Warm (analog Kodak)</option>
            <option value="cool">Cool (Fuji Superia)</option>
            <option value="film">Film (CineStill-like)</option>
          </select>
        </div>
      </div>
      <div className="mb-4">
        <label className="text-[9px] font-black tracking-widest uppercase text-t3 block mb-2">Intensitas — {intensity}</label>
        <input type="range" min={10} max={80} value={intensity}
          onChange={e=>{const v=+e.target.value;setIntensity(v);updatePreview(type,v)}}
          className="w-full"/>
        <div className="flex justify-between text-[9px] text-t3 mt-1"><span>Halus</span><span>Kasar</span></div>
      </div>
      {/* Live preview */}
      {previewUrl && (
        <div className="mb-4 rounded-xl overflow-hidden border border-b1 relative">
          <img src={previewUrl} alt="Grain preview" className="w-full h-28 object-cover"/>
          <span className="absolute bottom-2 right-2 text-[9px] bg-black/60 text-white/60 px-2 py-0.5 rounded font-mono">preview</span>
        </div>
      )}
      <div className="bg-s3 rounded-xl p-3 mb-4 text-xs text-t2 space-y-1 font-mono">
        <p>Resolusi: <span className="text-accent">{res}</span></p>
        <p>Tipe: <span className="text-accent capitalize">{type}</span></p>
        <p>Intensitas: <span className="text-accent">{intensity}/80</span></p>
        <p>File: <span className="text-accent">HALEA_Grain_{type}_{intensity}.png</span></p>
      </div>
      <button onClick={generate} disabled={generating}
        className="w-full py-3 bg-accent text-white rounded-xl text-sm font-black hover:bg-orange-400 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
        {generating?<><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/>Generating...</>:'⬇ Generate & Download PNG'}
      </button>
      <p className="text-[9px] text-t3 text-center mt-2">4K membutuhkan beberapa detik — file PNG ~15–30MB</p>
    </div>
  )
}
