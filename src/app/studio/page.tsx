'use client'
import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/auth'
import { useSettingsStore } from '@/store/settings'
import { Badge, DropZone, toast } from '@/components/ui'
import { Zap, Settings2, Film, Download } from 'lucide-react'
import { computeSmartMatch, transformFromParams, applyTransform } from '@/lib/colorMatch'
import { encodeGrade, decodeGrade, copyText } from '@/lib/haleaCode'
import { LogProfile, LOG_PROFILES, logToDisplay, convertImageData, computeAutoGain, detectLogProfile } from '@/lib/logProfiles'

// ── Types ─────────────────────────────────────────────────────────────────────
type NodeType = 'primary' | 'look' | 'halation' | 'match'
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

// Detects skin-tone pixels (red-orange hue, moderate sat/lightness)
function isSkinTone(r: number, g: number, b: number): boolean {
  const [h,s,l] = rgbToHsl(r,g,b)
  return h>0.01 && h<0.14 && s>0.08 && s<0.72 && l>0.18 && l<0.88
}

// ── Color Science Engine ──────────────────────────────────────────────────────
interface GradeResult {
  temp:number; tint:number; con:number; gamma:number
  sat:number; lift:number; halation:number
  look:string; lookAmount:number; desc:string
  matched?:boolean; toneDesc?:string; shadowCast?:string; highCast?:string; satRatio?:number
  confidence?:number; notes?:string[]
}

function analyzeColorProfile(imageData: ImageData): GradeResult {
  const { data } = imageData
  let sumR=0,sumG=0,sumB=0,sumS=0,sumL=0,cosH=0,sinH=0
  let shadowL=0,shadowN=0,highL=0,highN=0,count=0
  for (let i=0;i<data.length;i+=16) {
    const r=data[i]/255,g=data[i+1]/255,b=data[i+2]/255
    const [h,s,l]=rgbToHsl(r,g,b)
    sumR+=r;sumG+=g;sumB+=b;sumS+=s;sumL+=l
    cosH+=Math.cos(h*Math.PI*2);sinH+=Math.sin(h*Math.PI*2)
    if(l<0.25){shadowL+=l;shadowN++}
    if(l>0.72){highL+=l;highN++}
    count++
  }
  const n=count
  const avgR=sumR/n,avgG=sumG/n,avgB=sumB/n,avgS=sumS/n,avgL=sumL/n
  const avgShadowL=shadowN?shadowL/shadowN:0.08
  const avgHighL=highN?highL/highN:0.88
  const domH=((Math.atan2(sinH/n,cosH/n)/(Math.PI*2))+1)%1
  const temp=clamp((avgR-avgB)*2.2,-0.4,0.4)
  const tint=clamp(((avgR+avgB)/2-avgG)*1.8,-0.3,0.3)
  const con=clamp((avgHighL-avgShadowL-0.55)*0.8,-0.3,0.3)
  const gamma=clamp((0.47-avgL)*0.7,-0.3,0.3)
  const sat=clamp((avgS-0.33)*1.5,-0.4,0.4)
  const lift=clamp(Math.max(0,avgShadowL-0.04)*0.9,0,0.08)
  const halation=clamp(highN/n*1.5,0,0.32)
  let look='natural',lookAmount=0.3
  if(temp>0.10&&avgS<0.30){look='vintage';lookAmount=0.45}
  else if(temp>0.07){look='warm';lookAmount=0.42}
  else if(temp<-0.07){look='cool';lookAmount=0.40}
  else if(avgS<0.18&&con>0.05){look='bleach';lookAmount=0.38}
  else if(con>0.10){look='moody';lookAmount=0.42}
  else if(domH>0.48&&domH<0.68&&temp>0.02){look='teal_orange';lookAmount=0.40}
  else if(avgS>0.42){look='cinematic';lookAmount=0.38}
  const warmth=temp>0.06?'Warm':temp<-0.06?'Cool':'Neutral'
  const vibe=avgS>0.40?'Vivid':avgS<0.22?'Muted':'Natural'
  const mood=con>0.08?'High Contrast':avgL<0.40?'Dark':avgL>0.60?'Bright':'Balanced'
  return{temp,tint,con,gamma,sat,lift,halation,look,lookAmount,desc:`${warmth} · ${vibe} · ${mood}`}
}

function applyNodes(r:number,g:number,b:number,nodes:GradeNode[]):[number,number,number]{
  for(const node of nodes){
    if(!node.enabled)continue
    const p=node.params
    if(node.type==='match'){
      // Smart Match v3: global MKL + tone curve + hue-band layer + skin layer
      // + perceptual guards — all inside applyTransform (shared with Matcher)
      const amount=p.amount as number
      if(amount>0.001){
        ;[r,g,b]=applyTransform(r,g,b,transformFromParams(p),amount)
      }
    }
    if(node.type==='primary'){
      const lift=p.lift as number,gamma=p.gamma as number,temp=p.temp as number
      const tint=p.tint as number,con=p.con as number,sat=p.sat as number
      r=clamp(r+temp*0.15+lift*(1-r)*0.8+lift*0.2)
      g=clamp(g-tint*0.12+lift*(1-g)*0.8+lift*0.2)
      b=clamp(b-temp*0.15+tint*0.04+lift*(1-b)*0.8+lift*0.2)
      if(gamma){r=clamp(Math.pow(Math.max(r,0),1/(1+gamma)));g=clamp(Math.pow(Math.max(g,0),1/(1+gamma)));b=clamp(Math.pow(Math.max(b,0),1/(1+gamma)))}
      if(con){r=clamp(0.5+(r-0.5)*(1+con));g=clamp(0.5+(g-0.5)*(1+con));b=clamp(0.5+(b-0.5)*(1+con))}
      if(sat){const lm=luma(r,g,b),sf=1+sat;r=clamp(lm+(r-lm)*sf);g=clamp(lm+(g-lm)*sf);b=clamp(lm+(b-lm)*sf)}
    }
    if(node.type==='look'){
      const amount=p.amount as number
      const looks:Record<string,[number,number,number,number]>={cinematic:[-0.05,0.15,0.04,0.02],warm:[0.05,0.05,0.02,0.08],cool:[0.02,0.06,0.02,-0.06],bleach:[-0.3,0.25,-0.02,0],vintage:[-0.1,0.05,0.06,0.05],teal_orange:[0.08,0.14,0.04,0.03],moody:[-0.18,0.1,0.07,-0.03],faithful:[0,0,0,0],natural:[0.02,0.02,0.01,0.01]}
      const[ls,lc,ll,lw]=looks[String(p.look)]??[0,0,0,0]
      const lm=luma(r,g,b),sf=1+ls
      let nr=clamp(lm+(r-lm)*sf),ng=clamp(lm+(g-lm)*sf),nb=clamp(lm+(b-lm)*sf)
      nr=clamp(0.5+(nr-0.5)*(1+lc));ng=clamp(0.5+(ng-0.5)*(1+lc));nb=clamp(0.5+(nb-0.5)*(1+lc))
      nr=clamp(nr+ll*(1-nr)+lw*0.25);ng=clamp(ng+ll*(1-ng));nb=clamp(nb+ll*(1-nb)-lw*0.18)
      r=r+(nr-r)*amount;g=g+(ng-g)*amount;b=b+(nb-b)*amount
    }
    if(node.type==='halation'){
      const thr=1-(p.threshold as number),lh=luma(r,g,b)
      if(lh>thr){const fac=Math.pow((lh-thr)/(1-thr),1.5)*(p.intensity as number);r=clamp(r+fac*0.5);g=clamp(g+fac*0.03);b=clamp(b-fac*0.05)}
    }
  }
  return[r,g,b]
}

function bakeLUT(nodes:GradeNode[],size:number,skinGuard=false,logProfile:LogProfile='rec709',logGain=1):Float32Array{
  const lut=new Float32Array(size**3*3);let i=0
  for(let bi=0;bi<size;bi++)for(let gi=0;gi<size;gi++)for(let ri=0;ri<size;ri++){
    const r0=ri/(size-1),g0=gi/(size-1),b0=bi/(size-1)
    // log decode is baked in — one LUT does conversion + creative grade
    const[br,bg,bb]=logToDisplay(logProfile,logGain,r0,g0,b0)
    let[r,g,b]=applyNodes(br,bg,bb,nodes)
    if(skinGuard&&isSkinTone(br,bg,bb)){
      // same 0.25 blend as the live preview, so exported LUT matches what user sees
      r=br+(r-br)*0.25;g=bg+(g-bg)*0.25;b=bb+(b-bb)*0.25
    }
    lut[i++]=clamp(r);lut[i++]=clamp(g);lut[i++]=clamp(b)
  }
  return lut
}

const mkId=()=>'n'+Date.now()+Math.random().toString(36).slice(2,5)
const mkUUID=()=>'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,c=>{const r=Math.random()*16|0;return(c==='x'?r:(r&0x3|0x8)).toString(16)})
const makeCubeContent = (lut:Float32Array, size:number) => {
  let c=`# HALEA — by @haleastudio\nLUT_3D_SIZE ${size}\nDOMAIN_MIN 0.0 0.0 0.0\nDOMAIN_MAX 1.0 1.0 1.0\n\n`
  for(let i=0;i<lut.length;i+=3) c+=`${lut[i].toFixed(6)} ${lut[i+1].toFixed(6)} ${lut[i+2].toFixed(6)}\n`
  return c
}

type MobileTab = 'setup' | 'preview' | 'export'

// ── Fine-Tune trim sliders ────────────────────────────────────────────────────
const TRIM_DEFS: { key:string; label:string; range:number; lo:string; hi:string }[] = [
  { key:'temp',  label:'Temperature', range:0.4,  lo:'Cool',  hi:'Warm' },
  { key:'tint',  label:'Tint',        range:0.3,  lo:'Green', hi:'Magenta' },
  { key:'gamma', label:'Exposure',    range:0.4,  lo:'Gelap', hi:'Terang' },
  { key:'con',   label:'Contrast',    range:0.5,  lo:'Flat',  hi:'Punchy' },
  { key:'sat',   label:'Saturation',  range:0.6,  lo:'Muted', hi:'Vivid' },
  { key:'lift',  label:'Shadows',     range:0.25, lo:'Crush', hi:'Lift' },
]
const ZERO_TRIM = { lift:0, gamma:0, temp:0, tint:0, con:0, sat:0 }

function TrimSlider({ def, value, onChange }:{ def:typeof TRIM_DEFS[number]; value:number; onChange:(v:number)=>void }) {
  const pct = Math.round((value/def.range)*100)
  return (
    <div>
      <div className="flex justify-between items-center mb-0.5">
        <span className="text-[10px] font-bold text-t2">{def.label}</span>
        <span className={`text-[10px] font-mono font-bold ${pct!==0?'text-accent':'text-t3'}`}>{pct>0?'+':''}{pct}</span>
      </div>
      <input type="range" min={-100} max={100} value={pct}
        onChange={e=>onChange(+e.target.value/100*def.range)} className="w-full"/>
      <div className="flex justify-between text-[8px] text-t3"><span>{def.lo}</span><span>{def.hi}</span></div>
    </div>
  )
}

function TrimPanel({ values, onChange, onReset, dirty }:{
  values: Record<string,number>
  onChange: (key:string, v:number)=>void
  onReset: ()=>void
  dirty: boolean
}) {
  return (
    <div className="flex flex-col gap-2.5">
      {TRIM_DEFS.map(d=>(
        <TrimSlider key={d.key} def={d} value={values[d.key]??0} onChange={v=>onChange(d.key, v)}/>
      ))}
      {dirty&&(
        <button onClick={onReset}
          className="self-end text-[10px] font-bold text-t3 hover:text-err transition-colors">↺ Reset trim</button>
      )}
    </div>
  )
}

// Hoisted so the range input keeps identity across renders (drag stays alive)
function StrengthSlider({ value, onChange }:{ value:number; onChange:(v:number)=>void }) {
  return (
    <div className="bg-s3 border border-a4/25 rounded-xl p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[9px] font-black tracking-widest uppercase text-a4">✦ Match Strength</span>
        <span className="text-[10px] font-mono font-bold text-a4">{Math.round(value*100)}%</span>
      </div>
      <input type="range" min={0} max={100} value={Math.round(value*100)}
        onChange={e=>onChange(+e.target.value/100)} className="w-full accent-current text-a4"/>
      <div className="flex justify-between text-[9px] text-t3 mt-1"><span>Subtle</span><span>Full match</span></div>
    </div>
  )
}

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
  const [mobileTab, setMobileTab] = useState<MobileTab>('setup')
  const [skinGuard, setSkinGuard] = useState(false)
  const [matchAmount, setMatchAmount] = useState(0.8)
  const [codeInput,  setCodeInput]  = useState('')
  const [logProfile, setLogProfile] = useState<LogProfile>('rec709')
  const [autoExp,    setAutoExp]    = useState(true)

  // Smart exposure compensation — derived, no effect loops
  const logGain = useMemo(
    () => (footImg && logProfile !== 'rec709' && autoExp) ? computeAutoGain(footImg, logProfile) : 1,
    [footImg, logProfile, autoExp]
  )
  const logLabel = LOG_PROFILES.find(p => p.id === logProfile)?.label || logProfile

  const [trimOpen,       setTrimOpen]       = useState(true)
  const [mobileTrimOpen, setMobileTrimOpen] = useState(false)

  const router = useRouter()
  const { user: authUser, credits, useCredit } = useAuthStore()
  const matchCost      = useSettingsStore(s => s.matchCost)
  const powerGradeCost = useSettingsStore(s => s.powerGradeCost)
  const isAdmin = authUser?.role === 'admin'

  const splitRef = useRef<HTMLDivElement>(null)
  const rafRef   = useRef<number|null>(null)
  const nodesRef = useRef<GradeNode[]>([])
  const trimBase = useRef<Record<string, number>>({ ...ZERO_TRIM })

  useEffect(() => { nodesRef.current = nodes }, [nodes])

  // Fine-tune: sliders edit the primary node (smart = trim layer, basic = analyzed values)
  const trimNode  = nodes.find(n=>n.type==='primary')
  const trimVals  = (trimNode?.params || {}) as Record<string, number>
  const trimDirty = !!trimNode && TRIM_DEFS.some(d=>Math.abs((trimVals[d.key]??0)-(trimBase.current[d.key]??0))>0.004)

  const setTrim = (key:string, v:number) =>
    setNodes(prev=>prev.map(n=>n.type==='primary'?{...n,params:{...n.params,[key]:v}}:n))
  const resetTrim = () =>
    setNodes(prev=>prev.map(n=>n.type==='primary'?{...n,params:{...trimBase.current}}:n))

  useEffect(() => {
    if (afterSrc && typeof window !== 'undefined' && window.innerWidth < 768) setMobileTab('preview')
  }, [afterSrc])

  // Real-time preview (with skin tone guard)
  useEffect(() => {
    if (!footImg || nodes.length===0) { setAfterSrc(null); return }
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    rafRef.current = requestAnimationFrame(() => {
      const { data, width, height } = footImg
      const out = new Uint8ClampedArray(data.length)
      for (let i=0; i<data.length; i+=4) {
        const ro=data[i]/255, go=data[i+1]/255, bo=data[i+2]/255
        // log footage: decode to display first; skin guard & blends anchor to
        // the decoded (natural) pixel, not the flat log values
        const [br,bg,bb]=logToDisplay(logProfile, logGain, ro, go, bo)
        const [nr,ng,nb]=applyNodes(br, bg, bb, nodes)
        const blend = skinGuard && isSkinTone(br, bg, bb) ? 0.25 : 1.0
        out[i]=Math.round(clamp(br+(nr-br)*blend)*255)
        out[i+1]=Math.round(clamp(bg+(ng-bg)*blend)*255)
        out[i+2]=Math.round(clamp(bb+(nb-bb)*blend)*255)
        out[i+3]=data[i+3]
      }
      const c=document.createElement('canvas')
      c.width=width; c.height=height
      c.getContext('2d')!.putImageData(new ImageData(out,width,height), 0, 0)
      setAfterSrc(c.toDataURL('image/jpeg', 0.97))
    })
  }, [nodes, footImg, skinGuard, logProfile, logGain])

  const handleAnalyze = useCallback(() => {
    if (!authUser) {
      toast('Daftar gratis dulu untuk pakai Color Match ✦', 'warn')
      router.push('/login?next=/studio')
      return
    }
    if (!refData) { toast('Upload reference photo dulu', 'err'); return }
    setAnalyzing(true); setLut(null)
    setTimeout(() => {
      if (footImg) {
        // ── SMART MATCH: true color transfer footage → reference ──
        // log footage is normalized to display space first, so the match
        // operates after the decode step (same order as preview & bake)
        const normFoot = convertImageData(footImg, logProfile, logGain)
        const m = computeSmartMatch(normFoot, refData)
        setGrade({
          temp:m.derived.temp, tint:m.derived.tint, con:m.derived.con,
          gamma:m.derived.gamma, sat:m.derived.sat, lift:Math.max(0,m.curve[0]),
          halation:m.halation, look:'smart', lookAmount:0,
          desc:m.toneDesc, matched:true, toneDesc:m.toneDesc,
          shadowCast:m.shadowCast, highCast:m.highCast, satRatio:m.satRatio,
          confidence:m.confidence, notes:m.notes,
        })
        // zone matrix (24 cells × hue/sat/luma) untuk preview & bake full-quality
        const zp: Record<string, number> = {}
        for (let i=0;i<24;i++){ zp['zh'+i]=m.zoneH[i]; zp['zs'+i]=m.zoneS[i]; zp['zl'+i]=m.zoneL[i] }
        // keep user's manual trim when re-matching smart → smart (footage swap, log change)
        const prevWasSmart = nodesRef.current.some(n=>n.type==='match')
        const prevTrim = prevWasSmart ? nodesRef.current.find(n=>n.type==='primary')?.params : undefined
        trimBase.current = { ...ZERO_TRIM }
        setNodes([
          { id:mkId(), type:'match', enabled:true, params:{
              m0:m.matrix[0], m1:m.matrix[1], m2:m.matrix[2],
              m3:m.matrix[3], m4:m.matrix[4], m5:m.matrix[5],
              m6:m.matrix[6], m7:m.matrix[7], m8:m.matrix[8],
              fL:m.muF[0], fa:m.muF[1], fb:m.muF[2],
              rL:m.muR[0], ra:m.muR[1], rb:m.muR[2],
              curve:Array.from(m.curve).map(v=>v.toFixed(5)).join(','),
              // v3: hue-band residuals + skin layer
              bh0:m.bandH[0], bh1:m.bandH[1], bh2:m.bandH[2], bh3:m.bandH[3],
              bh4:m.bandH[4], bh5:m.bandH[5], bh6:m.bandH[6], bh7:m.bandH[7],
              bs0:m.bandS[0], bs1:m.bandS[1], bs2:m.bandS[2], bs3:m.bandS[3],
              bs4:m.bandS[4], bs5:m.bandS[5], bs6:m.bandS[6], bs7:m.bandS[7],
              bl0:m.bandL[0], bl1:m.bandL[1], bl2:m.bandL[2], bl3:m.bandL[3],
              bl4:m.bandL[4], bl5:m.bandL[5], bl6:m.bandL[6], bl7:m.bandL[7],
              skh:m.skinH, sks:m.skinS, skl:m.skinL, skw:m.skinW, skp:m.skinP,
              ...zp,
              ...(m.lutId ? { lutId: m.lutId } : {}),   // v5 dense PowerGrade LUT
              amount:matchAmount } },
          { id:mkId(), type:'primary', enabled:true, params:{ ...ZERO_TRIM, ...(prevTrim||{}) } },
          { id:mkId(), type:'halation', enabled:m.halation>0.05, params:{ threshold:0.65, intensity:m.halation } },
        ])
        toast(`✦ Smart Match ${m.confidence}% — footage dipetakan ke referensi`)
      } else {
        // ── BASIC fallback: reference-only heuristic ──
        const g = analyzeColorProfile(refData)
        setGrade({ ...g, matched:false })
        // sliders start at the analyzed values — reset returns here
        trimBase.current = { lift:g.lift, gamma:g.gamma, temp:g.temp, tint:g.tint, con:g.con, sat:g.sat }
        setNodes([
          { id:mkId(), type:'primary',  enabled:true, params:{ lift:g.lift, gamma:g.gamma, temp:g.temp, tint:g.tint, con:g.con, sat:g.sat } },
          { id:mkId(), type:'look',     enabled:g.look!=='natural'&&g.lookAmount>0.1, params:{ look:g.look, amount:g.lookAmount } },
          { id:mkId(), type:'halation', enabled:g.halation>0.05, params:{ threshold:0.65, intensity:g.halation } },
        ])
        toast('✓ ' + g.desc + ' — upload footage untuk Smart Match ✦')
      }
      setAnalyzing(false)
    }, 20)
  }, [refData, footImg, matchAmount, logProfile, logGain, authUser, router])

  // Auto re-match when footage or log settings change: upgrades basic → smart,
  // and re-fits the transform (matrix is footage- and normalization-specific)
  useEffect(() => {
    if (footImg && refData && grade && !analyzing) handleAnalyze()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [footImg, logProfile, logGain])

  const handleStrength = (v:number) => {
    setMatchAmount(v)
    setNodes(prev=>prev.map(n=>n.type==='match'?{...n,params:{...n.params,amount:v}}:n))
  }

  // ── HALEA Code: share look as text ─────────────────────────────────────────
  const copyHaleaCode = async () => {
    if (!nodes.length) { toast('Match Colors dulu', 'warn'); return }
    const code = encodeGrade(nodes, lutName)
    try { localStorage.setItem('halea_m_code', '1') } catch {}   // HALEA Academy mission
    if (await copyText(code)) toast('🧬 HALEA Code disalin — share di caption / bio!')
    else window.prompt('Salin kode ini:', code)
  }

  const importHaleaCode = () => {
    const res = decodeGrade(codeInput)
    if (!res) { toast('Kode tidak valid — cek lagi', 'err'); return }
    const newNodes: GradeNode[] = res.nodes.map(n => ({ ...n, id: mkId() }))
    // older codes (pre fine-tune) have no primary — add one so sliders work
    if (newNodes.some(n=>n.type==='match') && !newNodes.some(n=>n.type==='primary')) {
      newNodes.splice(1, 0, { id:mkId(), type:'primary', enabled:true, params:{ ...ZERO_TRIM } })
    }
    setNodes(newNodes)
    // reset returns to the look as shipped (incl. creator's trim)
    trimBase.current = { ...ZERO_TRIM, ...((newNodes.find(n=>n.type==='primary')?.params || {}) as Record<string,number>) }
    const matchN = res.nodes.find(n=>n.type==='match')
    const primN  = res.nodes.find(n=>n.type==='primary')
    const lookN  = res.nodes.find(n=>n.type==='look')
    const halN   = res.nodes.find(n=>n.type==='halation')
    const halVal = halN ? (halN.params.intensity as number) : 0
    if (matchN) {
      const p = matchN.params
      setMatchAmount(p.amount as number)
      // approximate classic params from the matrix/means (for stats + .xmp export)
      setGrade({
        temp:  clamp(((p.rb as number)-(p.fb as number))*3.5, -0.4, 0.4),
        tint:  clamp(((p.ra as number)-(p.fa as number))*3.5, -0.3, 0.3),
        gamma: clamp(((p.rL as number)-(p.fL as number))*1.2, -0.3, 0.3),
        con:   clamp(((p.m0 as number)-1)*0.8, -0.3, 0.3),
        sat:   clamp((((p.m4 as number)+(p.m8 as number))/2-1)*0.6, -0.4, 0.4),
        lift: 0, halation: halVal, look:'smart', lookAmount:0,
        desc: res.name || 'HALEA Code', matched:true,
        toneDesc: res.name ? `"${res.name}"` : 'Imported look',
        shadowCast:'—', highCast:'—',
        satRatio: ((p.m4 as number)+(p.m8 as number))/2,
      })
    } else if (primN) {
      const p = primN.params
      setGrade({
        temp:p.temp as number, tint:p.tint as number, con:p.con as number,
        gamma:p.gamma as number, sat:p.sat as number, lift:p.lift as number,
        halation: halVal,
        look: lookN ? String(lookN.params.look) : 'natural',
        lookAmount: lookN ? (lookN.params.amount as number) : 0,
        desc: res.name || 'HALEA Code', matched:false,
      })
    }
    if (res.name) setLutName(res.name.replace(/\s+/g,'_'))
    // imported code replaces the reference flow — clear ref so auto re-match
    // doesn't overwrite the imported look when footage changes
    setRefImg(null); setRefData(null)
    setLut(null); setCodeInput('')
    toast('✦ Look dimuat dari HALEA Code!')
  }

  const handleRefPhoto = (f: File) => {
    const img=new Image(), url=URL.createObjectURL(f)
    img.onload = () => {
      const c=document.createElement('canvas')
      const scale=Math.min(1, 400/img.width)
      c.width=Math.round(img.width*scale); c.height=Math.round(img.height*scale)
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height)
      setRefData(c.getContext('2d')!.getImageData(0, 0, c.width, c.height))
      setRefImg(c.toDataURL()); URL.revokeObjectURL(url)
      setGrade(null); setNodes([]); setAfterSrc(null); setLut(null)
    }; img.src=url
  }

  const handleFootage = (f: File) => {
    const img=new Image(), url=URL.createObjectURL(f)
    img.onload = () => {
      setFootSrc(url)
      const c=document.createElement('canvas')
      const scale=Math.min(1, 900/Math.max(img.width, img.height))
      c.width=Math.round(img.width*scale); c.height=Math.round(img.height*scale)
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height)
      const imageData = c.getContext('2d')!.getImageData(0, 0, c.width, c.height)
      setFootImg(imageData)
      // smart log detection: pedestal + chroma + dynamic range analysis
      const det = detectLogProfile(imageData)
      setLogProfile(det.isLog ? det.profile : 'rec709')
      if (det.isLog) {
        const lbl = LOG_PROFILES.find(p=>p.id===det.profile)?.label
        toast(`🪵 Log terdeteksi: ${lbl}${det.confidence==='medium'?' (perkiraan)':''} — ubah di Input Footage kalau salah`)
      }
    }; img.src=url
  }

  const handleBake = useCallback(async () => {
    if (nodes.length===0) { toast('Match Colors dulu', 'warn'); return }
    if (!useCredit(matchCost)) {
      toast(`Kredit habis — Bake butuh ${matchCost} kredit. Beli di Shop 🛍`, 'err')
      return
    }
    setBaking(true)
    await new Promise(r=>setTimeout(r,20))
    setLut(bakeLUT(nodes, lutSize, skinGuard, logProfile, logGain))
    setBaking(false)
    try { localStorage.setItem('halea_m_bake', '1') } catch {}   // HALEA Academy mission
    toast(logProfile!=='rec709' ? `✓ LUT baked — termasuk konversi ${logLabel}` : '✓ LUT baked — siap di-export')
  }, [nodes, lutSize, skinGuard, logProfile, logGain, logLabel, useCredit, matchCost])

  const downloadLUT = (fmt: 'cube'|'3dl') => {
    if (!lut) { toast('Klik Bake LUT dulu', 'warn'); return }
    const name=lutName||'HALEA_LUT'
    let content='', filename=''
    if (fmt==='cube') {
      filename=name+'.cube'
      content=makeCubeContent(lut, lutSize)
    } else {
      filename=name+'.3dl'
      content=`3DMESH\nMesh 1 12\n0 ${(lutSize-1)*4} ${(lutSize-1)*4} ${(lutSize-1)*4}\n\n`
      for (let i=0;i<lut.length;i+=3) content+=`${Math.round(lut[i]*4095)} ${Math.round(lut[i+1]*4095)} ${Math.round(lut[i+2]*4095)}\n`
    }
    const a=document.createElement('a')
    a.href=URL.createObjectURL(new Blob([content])); a.download=filename; a.click()
    toast('✓ Downloaded: '+filename)
  }

  // DaVinci Resolve PowerGrade — ultra-fidelity 65³ grid, baked fresh so it
  // includes log decode + fine-tune + the full v5 transport
  const [dvBaking, setDvBaking] = useState(false)
  const downloadDaVinci = async () => {
    if (nodes.length===0) { toast('Match Colors dulu', 'warn'); return }
    if (!authUser) {
      toast('Daftar gratis dulu untuk export PowerGrade ✦', 'warn')
      router.push('/login?next=/studio'); return
    }
    if (!useCredit(powerGradeCost)) {
      toast(`Kredit kurang — PowerGrade butuh ${powerGradeCost} kredit. Top up di Shop 🛍`, 'err')
      return
    }
    setDvBaking(true)
    await new Promise(r=>setTimeout(r,30))
    const size = 65
    const baked = bakeLUT(nodes, size, skinGuard, logProfile, logGain)
    let c=`# HALEA PowerGrade — by @haleastudio\n# DaVinci Resolve — 65-point ultra-fidelity\nLUT_3D_SIZE ${size}\nDOMAIN_MIN 0.0 0.0 0.0\nDOMAIN_MAX 1.0 1.0 1.0\n\n`
    for(let i=0;i<baked.length;i+=3) c+=`${baked[i].toFixed(6)} ${baked[i+1].toFixed(6)} ${baked[i+2].toFixed(6)}\n`
    const a=document.createElement('a')
    a.href=URL.createObjectURL(new Blob([c])); a.download=(lutName||'HALEA_PowerGrade')+'_DaVinci.cube'; a.click()
    setDvBaking(false)
    setShowDvHelp(true)
  }
  const [showDvHelp, setShowDvHelp] = useState(false)

  // CapCut: standard .cube format with CapCut suffix
  const downloadCapCut = () => {
    if (!lut) { toast('Bake LUT dulu', 'warn'); return }
    const a=document.createElement('a')
    a.href=URL.createObjectURL(new Blob([makeCubeContent(lut,lutSize)]))
    a.download=(lutName||'HALEA_LUT')+'_CapCut.cube'; a.click()
    toast('✓ CapCut LUT ready! Import di: Filter → + → Import LUT')
  }

  // Lightroom Mobile .xmp preset
  const downloadXMP = () => {
    // reads from grade (not the primary node) so it works in Smart Match mode too,
    // where nodes carry a matrix instead of classic slider params
    if (!grade) { toast('Match Colors dulu', 'warn'); return }
    // smart mode: derived match params + manual trim on top; basic mode: the
    // primary node already holds analyzed values + user edits
    const trim = nodes.find(n=>n.type==='primary')?.params as Record<string,number>|undefined
    const tv = (k:string, gv:number) => grade.matched ? gv + (trim?.[k]||0) : (trim?.[k] ?? gv)
    const temp    = Math.round(6500 + tv('temp',grade.temp)*3500)   // Kelvin 3000–10000
    const tint    = Math.round(-tv('tint',grade.tint)*150)           // LR tint –150…+150
    const expo    = (tv('gamma',grade.gamma)*1.5).toFixed(2)          // Exposure –5…+5
    const con     = Math.round(tv('con',grade.con)*100)               // Contrast –100…+100
    const shadows = Math.round(tv('lift',grade.lift)*60)              // Shadows (lift = open shadows)
    const blacks  = Math.round(tv('lift',grade.lift)*400)             // Blacks (lift = raise black floor)
    const sat     = Math.round(tv('sat',grade.sat)*100)               // Saturation –100…+100
    const name    = lutName||'HALEA_Preset'
    const xmp = `<?xpacket begin="" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
  <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
    <rdf:Description rdf:about=""
      xmlns:crs="http://ns.adobe.com/camera-raw-settings/1.0/"
      crs:PresetType="Normal"
      crs:Cluster=""
      crs:UUID="${mkUUID()}"
      crs:SupportsAmount="False"
      crs:SupportsColor="True"
      crs:SupportsMonochrome="False"
      crs:SupportsHighDynamicRange="True"
      crs:SupportsNormalDynamicRange="True"
      crs:SupportsSceneReferred="True"
      crs:SupportsOutputReferred="False"
      crs:CameraModelRestriction=""
      crs:Copyright=""
      crs:ContactInfo=""
      crs:ProcessVersion="11.0"
      crs:WhiteBalance="Custom"
      crs:Temperature="${temp}"
      crs:Tint="${tint}"
      crs:Exposure2012="${expo}"
      crs:Contrast2012="${con}"
      crs:Highlights2012="0"
      crs:Shadows2012="${shadows}"
      crs:Whites2012="0"
      crs:Blacks2012="${blacks}"
      crs:Clarity2012="0"
      crs:Vibrance="0"
      crs:Saturation="${sat}"
    />
  </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>`
    const a=document.createElement('a')
    // octet-stream forces download on iOS instead of opening as text viewer
    a.href=URL.createObjectURL(new Blob([xmp],{type:'application/octet-stream'}))
    a.download=name+'.xmp'; a.click()
    toast('✓ Preset .xmp siap — import di Lightroom Mobile')
  }

  // Share Card — convert footSrc blob→dataURL, store in sessionStorage, open /share
  const openShareCard = async () => {
    if (!afterSrc) { toast('Bake LUT dulu untuk lihat After', 'err'); return }
    if (!footSrc)  { toast('Upload footage still dulu', 'err'); return }
    try {
      let beforeData = footSrc
      if (footSrc.startsWith('blob:')) {
        const img = new Image(); img.src = footSrc
        await new Promise<void>(r => { img.onload = () => r() })
        const c = document.createElement('canvas')
        const scale = Math.min(1, 1080/Math.max(img.width, img.height))
        c.width = Math.round(img.width*scale); c.height = Math.round(img.height*scale)
        c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height)
        beforeData = c.toDataURL('image/jpeg', 0.90)
      }
      sessionStorage.setItem('halea_share_before', beforeData)
      sessionStorage.setItem('halea_share_after',  afterSrc)
      sessionStorage.setItem('halea_share_grade',  grade && !grade.matched ? grade.look : '')
      window.location.href = '/share'
    } catch {
      toast('Gagal membuka Share Card', 'err')
    }
  }

  const gradeStats = grade ? (grade.matched ? [
    { label:'Match',   val:grade.confidence ? `${grade.confidence}% ✦` : 'Smart ✦' },
    { label:'Shadows', val:grade.shadowCast||'—' },
    { label:'Highs',   val:grade.highCast||'—' },
    { label:'Sat',     val:'×'+(grade.satRatio??1).toFixed(2) },
  ] : [
    { label:'Temp',  val:grade.temp>0.03?`Warm +${grade.temp.toFixed(2)}`:grade.temp<-0.03?`Cool ${grade.temp.toFixed(2)}`:'Neutral' },
    { label:'Con',   val:grade.con>0.03?`+${grade.con.toFixed(2)}`:grade.con<-0.03?grade.con.toFixed(2):'Balanced' },
    { label:'Sat',   val:grade.sat>0.03?`+${grade.sat.toFixed(2)}`:grade.sat<-0.03?grade.sat.toFixed(2):'Neutral' },
    { label:'Look',  val:grade.look },
  ]) : []

  // ── Shared before/after viewer ────────────────────────────────────────────
  const SplitViewer = ({ mobile=false }:{mobile?:boolean}) => (
    <div ref={splitRef} className="relative w-full h-full" style={{userSelect:'none',touchAction:'none'}}>
      <img src={footSrc!} alt="Before" draggable={false}
        className="absolute inset-0 w-full h-full object-contain pointer-events-none"/>
      <img src={afterSrc!} alt="After" draggable={false}
        className="absolute inset-0 w-full h-full object-contain pointer-events-none"
        style={{clipPath:`inset(0 0 0 ${splitPos}%)`}}/>
      <div className="absolute top-0 bottom-0 z-20 touch-none"
        style={{left:`${splitPos}%`,transform:'translateX(-50%)',width:mobile?'72px':'52px',cursor:'col-resize'}}
        onPointerDown={e=>e.currentTarget.setPointerCapture(e.pointerId)}
        onPointerMove={e=>{
          if(e.buttons!==1&&e.pressure===0)return
          const r=e.currentTarget.parentElement!.getBoundingClientRect()
          setSplitPos(Math.max(2,Math.min(98,(e.clientX-r.left)/r.width*100)))
        }}>
        <div className="absolute top-0 bottom-0 left-1/2 -translate-x-1/2 w-0.5 bg-white/90 shadow-[0_0_12px_rgba(255,255,255,0.5)]"/>
        <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 ${mobile?'w-12 h-12':'w-9 h-9'} rounded-full bg-white shadow-2xl flex items-center justify-center select-none font-black text-black`}
          style={{fontSize:mobile?18:14}}>⇔</div>
      </div>
      <span className="absolute bottom-4 left-4 text-[9px] font-black text-white/80 tracking-widest uppercase bg-black/60 px-2.5 py-1 rounded-full pointer-events-none backdrop-blur-sm">BEFORE</span>
      <span className="absolute bottom-4 right-4 text-[9px] font-black text-white/80 tracking-widest uppercase bg-black/60 px-2.5 py-1 rounded-full pointer-events-none backdrop-blur-sm">AFTER</span>
      {mobile&&<span className="absolute top-4 left-1/2 -translate-x-1/2 text-[10px] text-white/40 font-medium pointer-events-none whitespace-nowrap">geser untuk compare</span>}
    </div>
  )

  // ── Skin Guard toggle ──────────────────────────────────────────────────────
  const SkinGuardToggle = ({label}:{label?:boolean}) => (
    <button onClick={()=>setSkinGuard(v=>!v)}
      className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-[10px] font-bold transition-all ${skinGuard?'bg-ok/10 border-ok/30 text-ok':'bg-s3 border-b2 text-t3 hover:border-b3'}`}>
      <div className={`w-5 h-3 rounded-full relative transition-colors ${skinGuard?'bg-ok':'bg-b2'}`}>
        <div className={`absolute top-0.5 w-2 h-2 rounded-full bg-white transition-all ${skinGuard?'left-2.5':'left-0.5'}`}/>
      </div>
      {label!==false&&<span>🎭 Skin Guard{skinGuard?' ON':''}</span>}
    </button>
  )

  return (
    <>
    {/* ═══════════════════════ DESKTOP md+ ═══════════════════════ */}
    <div className="hidden md:flex h-[calc(100vh-56px)] overflow-hidden">

      {/* LEFT */}
      <div className="w-72 flex-shrink-0 border-r border-b1 flex flex-col">
        <div className="px-4 py-3 border-b border-b1">
          <p className="text-[9px] font-black tracking-widest uppercase text-accent">Color Match Studio</p>
          <h2 className="font-fraunces text-lg font-semibold leading-tight mt-0.5">Match Any <span className="italic text-accent">Look</span></h2>
        </div>
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-5">
          {/* HALEA Code import */}
          <div>
            <div className="flex items-center gap-2 mb-2"><span className="text-[9px] font-black tracking-widest uppercase text-a3">🧬 Punya HALEA Code?</span><div className="flex-1 h-px bg-b1"/></div>
            <div className="flex gap-1.5">
              <input value={codeInput} onChange={e=>setCodeInput(e.target.value)}
                onKeyDown={e=>e.key==='Enter'&&codeInput.trim()&&importHaleaCode()}
                placeholder="Paste kode look di sini..."
                className="flex-1 bg-s2 border border-b1 text-txt px-2.5 py-2 rounded-lg text-[11px] outline-none focus:border-a3 transition-colors placeholder:text-t3 min-w-0 font-mono"/>
              <button onClick={importHaleaCode} disabled={!codeInput.trim()}
                className="px-3 py-2 bg-a3/15 border border-a3/30 text-a3 rounded-lg text-[11px] font-bold hover:bg-a3/25 disabled:opacity-40 transition-colors flex-shrink-0">
                Load
              </button>
            </div>
          </div>
          <div>
            <div className="flex items-center gap-2 mb-2"><span className="text-[9px] font-black tracking-widest uppercase text-accent">① Reference Photo</span><div className="flex-1 h-px bg-b1"/></div>
            <p className="text-[10px] text-t3 mb-2 leading-relaxed">Photo dengan look yang mau kamu tiru.</p>
            {refImg ? (
              <div className="relative group mb-3">
                <img src={refImg} alt="Reference" className="w-full h-36 object-cover rounded-xl border border-b1"/>
                <button onClick={()=>{setRefImg(null);setRefData(null);setGrade(null);setNodes([]);setAfterSrc(null);setLut(null)}}
                  className="absolute top-2 right-2 w-6 h-6 bg-black/70 rounded-full text-white text-[10px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500">✕</button>
              </div>
            ) : <div className="mb-3"><DropZone label="Drop reference photo" sub="JPG · PNG · WEBP" icon="🖼" accept="image/*" onFile={handleRefPhoto}/></div>}
            <button onClick={handleAnalyze} disabled={!refData||analyzing}
              className={`w-full py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${!refData?'bg-s3 text-t3 cursor-not-allowed':analyzing?'bg-a4/50 text-white':'bg-a4 text-black hover:bg-purple-300 shadow-lg shadow-a4/20'}`}>
              {analyzing?<><span className="w-3.5 h-3.5 border-2 border-current/30 border-t-current rounded-full animate-spin"/>Analyzing...</>:'✦ Match Colors'}
            </button>
          </div>
          {grade&&(
            <div className="bg-s3 border border-b2 rounded-xl overflow-hidden">
              <div className="px-3 py-2 border-b border-b1 flex items-center gap-2">
                <span className="text-[9px] font-black tracking-widest uppercase text-accent">Analysis</span>
                <span className="ml-auto text-[9px] text-t3 font-mono">{grade.desc}</span>
              </div>
              {gradeStats.map(({label,val})=>(
                <div key={label} className="flex justify-between items-center px-3 py-1.5 border-b border-b1 last:border-0">
                  <span className="text-[10px] text-t2">{label}</span>
                  <span className="text-[10px] font-mono font-bold text-accent capitalize">{val}</span>
                </div>
              ))}
              {grade.notes&&grade.notes.length>0&&(
                <div className="px-3 py-2 border-t border-b1 flex flex-col gap-1">
                  {grade.notes.map((n,i)=>(
                    <p key={i} className="text-[9px] text-t3 leading-relaxed">💡 {n}</p>
                  ))}
                </div>
              )}
              <div className="px-3 py-2 border-t border-b1"><button onClick={handleAnalyze} disabled={analyzing} className="text-[9px] font-bold text-t3 hover:text-accent transition-colors disabled:opacity-40">↻ Re-analyze</button></div>
            </div>
          )}
          {grade?.matched&&<StrengthSlider value={matchAmount} onChange={handleStrength}/>}
          {/* Fine-Tune */}
          {trimNode&&(
            <div>
              <button onClick={()=>setTrimOpen(v=>!v)} className="w-full flex items-center gap-2 mb-2">
                <span className="text-[9px] font-black tracking-widest uppercase text-warn">🎛 Fine-Tune</span>
                {trimDirty&&<span className="w-1.5 h-1.5 rounded-full bg-warn"/>}
                <div className="flex-1 h-px bg-b1"/>
                <span className="text-t3 text-xs leading-none">{trimOpen?'−':'+'}</span>
              </button>
              {trimOpen&&(
                <div className="bg-s2 border border-b1 rounded-xl p-3">
                  <TrimPanel values={trimVals} onChange={setTrim} onReset={resetTrim} dirty={trimDirty}/>
                </div>
              )}
            </div>
          )}
          <div>
            <div className="flex items-center gap-2 mb-3"><span className="text-[9px] font-black tracking-widest uppercase text-accent">② Footage Still</span><div className="flex-1 h-px bg-b1"/></div>
            <p className="text-[10px] text-t3 mb-2 leading-relaxed">Frame dari footage kamu untuk preview before/after.</p>
            {footSrc ? (
              <div className="relative group">
                <img src={footSrc} alt="Footage" className="w-full h-28 object-cover rounded-xl border border-b1"/>
                <button onClick={()=>{setFootImg(null);setFootSrc(null);setAfterSrc(null);setLogProfile('rec709')}}
                  className="absolute top-2 right-2 w-6 h-6 bg-black/70 rounded-full text-white text-[10px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500">✕</button>
              </div>
            ) : <DropZone label="Drop footage still" sub="JPG · PNG · WEBP" icon="🎬" accept="image/*" onFile={handleFootage}/>}
            {/* Log input profile */}
            {footSrc&&(
              <div className="mt-3">
                <label className="text-[9px] font-black tracking-widest uppercase text-t3 block mb-1.5">Input Footage</label>
                <select value={logProfile} onChange={e=>setLogProfile(e.target.value as LogProfile)}
                  className="w-full bg-s2 border border-b1 text-txt px-2.5 py-2 rounded-lg text-[11px] outline-none focus:border-accent transition-colors">
                  {LOG_PROFILES.map(p=>(
                    <option key={p.id} value={p.id}>{p.label}{p.id!=='rec709'?` — ${p.cams}`:''}</option>
                  ))}
                </select>
                {logProfile!=='rec709'&&(
                  <div className="flex items-center justify-between mt-2">
                    <button onClick={()=>setAutoExp(v=>!v)}
                      className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-[10px] font-bold transition-all ${autoExp?'bg-warn/10 border-warn/30 text-warn':'bg-s3 border-b2 text-t3 hover:border-b3'}`}>
                      <div className={`w-5 h-3 rounded-full relative transition-colors ${autoExp?'bg-warn':'bg-b2'}`}>
                        <div className={`absolute top-0.5 w-2 h-2 rounded-full bg-white transition-all ${autoExp?'left-2.5':'left-0.5'}`}/>
                      </div>
                      ⚡ Auto Exposure{autoExp?` ${Math.log2(logGain)>=0?'+':''}${Math.log2(logGain).toFixed(1)} EV`:''}
                    </button>
                    <span className="text-[9px] text-warn font-bold">🪵 Log</span>
                  </div>
                )}
              </div>
            )}
          </div>
          {/* Skin Tone Guard */}
          {nodes.length>0&&(
            <div className="flex items-center justify-between">
              <SkinGuardToggle/>
              {skinGuard&&<span className="text-[9px] text-ok">Kulit dilindungi</span>}
            </div>
          )}
        </div>
        <div className="p-3 border-t border-b1 flex flex-col gap-1.5">
          <button onClick={handleBake} disabled={nodes.length===0||baking}
            className={`w-full py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${nodes.length===0?'bg-s3 text-t3 cursor-not-allowed':baking?'bg-accent/50 text-white':'bg-accent text-white hover:bg-orange-400 shadow-lg shadow-accent/20'}`}>
            {baking?<><span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin"/>Baking...</>:<><Zap size={14}/>Bake LUT{!isAdmin&&<span className="text-[8px] bg-white/20 px-1.5 py-0.5 rounded-full normal-case tracking-normal">{matchCost} kredit</span>}</>}
          </button>
          <p className="text-[9px] text-t3 text-center">{nodes.length===0?'Match Colors dulu ↑':`Standard 33³ · ${matchCost} kredit · preview gratis`}</p>
        </div>
      </div>

      {/* CENTER */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <div className="h-10 flex-shrink-0 border-b border-b1 flex items-center px-4 gap-3">
          <span className="text-[9px] font-black tracking-widest uppercase text-t3">Preview</span>
          {afterSrc&&<span className="flex items-center gap-1.5 text-[9px] font-black uppercase text-ok"><span className="w-1.5 h-1.5 rounded-full bg-ok animate-pulse inline-block"/>LIVE</span>}
          {skinGuard&&afterSrc&&<span className="text-[9px] text-ok font-bold">🎭 Skin Guard ON</span>}
          {logProfile!=='rec709'&&footImg&&<span className="text-[9px] text-warn font-bold">🪵 {logLabel}</span>}
          {lut&&<Badge color="accent">LUT Ready</Badge>}
          <span className="ml-auto text-[9px] text-t3 font-mono hidden sm:block">{afterSrc?'Geser ⇔ untuk compare':footImg?'Match Colors untuk preview':'Drop footage still di kiri'}</span>
          {authUser ? (!isAdmin && (
            <Link href="/shop" className="text-[9px] font-bold text-ok bg-ok/10 border border-ok/20 px-2.5 py-1 rounded-full flex-shrink-0 hover:bg-ok/20 transition-colors">
              🤖 {credits} kredit
            </Link>
          )) : (
            <Link href="/login?next=/studio" className="text-[9px] font-bold text-accent bg-accent/10 border border-accent/20 px-2.5 py-1 rounded-full flex-shrink-0 hover:bg-accent/20 transition-colors">
              Masuk →
            </Link>
          )}
        </div>
        <div className="flex-1 overflow-hidden relative bg-[#0a0a0a] flex items-center justify-center">
          {!footImg ? (
            <label className="flex flex-col items-center gap-4 text-t3 cursor-pointer group select-none">
              <input type="file" accept="image/*" className="sr-only" onChange={e=>{const f=e.target.files?.[0];if(f)handleFootage(f)}}/>
              <div className="w-20 h-20 rounded-2xl bg-s2 border border-b1 flex items-center justify-center text-4xl opacity-30 group-hover:opacity-60 group-hover:border-b3 transition-all">🎬</div>
              <div className="text-center"><p className="text-sm font-bold group-hover:text-accent transition-colors">Drop footage still di sini</p><p className="text-xs opacity-50 mt-1">atau klik untuk pilih file</p></div>
            </label>
          ) : !afterSrc ? (
            <div className="relative w-full h-full flex items-center justify-center">
              <img src={footSrc!} alt="" draggable={false} className="max-w-full max-h-full object-contain opacity-60 pointer-events-none"/>
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="bg-black/70 backdrop-blur-sm rounded-2xl px-6 py-4 text-center border border-white/10">
                  <span className="text-2xl block mb-2">✦</span>
                  <p className="text-sm font-bold text-white mb-1">Upload reference → Match Colors</p>
                  <p className="text-[11px] text-white/50">Grade akan muncul secara live</p>
                </div>
              </div>
            </div>
          ) : <SplitViewer/>}
        </div>
      </div>

      {/* RIGHT */}
      <div className="w-64 flex-shrink-0 border-l border-b1 flex flex-col">
        <div className="h-10 border-b border-b1 flex items-center px-4">
          <span className="text-[9px] font-black tracking-widest uppercase text-t3">Export</span>
          {lut&&<span className="ml-auto"><Badge color="ok">Ready</Badge></span>}
        </div>
        <div className="flex-1 p-4 flex flex-col gap-4 overflow-y-auto">
          <div>
            <label className="text-[9px] font-black tracking-widest uppercase text-t3 block mb-1.5">LUT Name</label>
            <input value={lutName} onChange={e=>setLutName(e.target.value)}
              className="w-full bg-s2 border border-b1 text-txt px-3 py-2 rounded-lg text-sm outline-none focus:border-accent transition-colors"/>
          </div>

          {/* Export grid 2x2 */}
          <div className="grid grid-cols-2 gap-2">
            {(['cube','3dl'] as const).map(fmt=>(
              <button key={fmt} onClick={()=>downloadLUT(fmt)} disabled={!lut}
                className="flex flex-col items-center gap-1 bg-s2 border border-b1 rounded-xl p-3 hover:border-accent hover:bg-s3 transition-all disabled:opacity-30 disabled:cursor-not-allowed">
                <span className="font-black text-base text-txt leading-none">.{fmt}</span>
                <span className="text-[8px] text-t3 text-center leading-tight">{fmt==='cube'?'Resolve · PP':'Flame · Lustre'}</span>
              </button>
            ))}
            <button onClick={downloadXMP} disabled={!nodes.length}
              className="flex flex-col items-center gap-1 bg-s2 border border-b1 rounded-xl p-3 hover:border-a4 hover:bg-s3 transition-all disabled:opacity-30 disabled:cursor-not-allowed">
              <span className="font-black text-base text-a4 leading-none">.xmp</span>
              <span className="text-[8px] text-t3 text-center leading-tight">Lightroom Mobile</span>
            </button>
            <button onClick={downloadCapCut} disabled={!lut}
              className="flex flex-col items-center gap-1 bg-s2 border border-b1 rounded-xl p-3 hover:border-ok hover:bg-s3 transition-all disabled:opacity-30 disabled:cursor-not-allowed">
              <span className="font-black text-base text-ok leading-none">CC</span>
              <span className="text-[8px] text-t3 text-center leading-tight">CapCut Pro</span>
            </button>
          </div>

          {/* DaVinci PowerGrade — premium 65³ */}
          <button onClick={downloadDaVinci} disabled={!nodes.length||dvBaking}
            className="w-full py-2.5 rounded-xl text-[11px] font-bold border border-a2/40 bg-gradient-to-r from-a2/15 to-accent/10 text-a2 hover:from-a2/25 transition-all disabled:opacity-30 flex items-center justify-center gap-1.5">
            {dvBaking
              ? <><span className="w-3 h-3 border-2 border-a2/30 border-t-a2 rounded-full animate-spin"/>Baking 65³...</>
              : <>🎬 DaVinci PowerGrade <span className="text-[8px] opacity-70">65³</span>{!isAdmin&&<span className="text-[8px] bg-a2/20 px-1.5 py-0.5 rounded-full">{powerGradeCost} kredit</span>}</>}
          </button>

          {!lut&&!nodes.length ? (
            <div className="bg-s2 border border-dashed border-b2 rounded-xl p-3 text-center">
              <p className="text-[10px] text-t3 leading-relaxed">Match Colors → Bake LUT untuk export</p>
            </div>
          ) : lut ? (
            <div className="bg-s2 border border-b1 rounded-xl overflow-hidden">
              {[['Size',lutSize+'³'],['Nodes',nodes.filter(n=>n.enabled).length+' active'],['Look',grade?.look||'—'],...(logProfile!=='rec709'?[['Input',logLabel]]:[])].map(([k,v])=>(
                <div key={k} className="flex justify-between px-3 py-1.5 border-b border-b1 last:border-0 text-xs">
                  <span className="text-t2">{k}</span><span className="text-accent font-mono font-bold capitalize">{v}</span>
                </div>
              ))}
            </div>
          ) : null}

          {/* Share Card */}
          {afterSrc&&(
            <button onClick={openShareCard}
              className="w-full py-2.5 rounded-xl text-[11px] font-bold border border-a3/30 bg-a3/10 text-a3 hover:bg-a3/20 transition-colors flex items-center justify-center gap-1.5">
              🃏 Buat Share Card
            </button>
          )}

          {/* HALEA Code copy */}
          {nodes.length>0&&(
            <button onClick={copyHaleaCode}
              className="w-full py-2.5 rounded-xl text-[11px] font-bold border border-a4/30 bg-a4/10 text-a4 hover:bg-a4/20 transition-colors flex items-center justify-center gap-1.5">
              🧬 Salin HALEA Code
            </button>
          )}

          {/* Shot Matcher promo */}
          <Link href="/matcher"
            className="block w-full py-2.5 rounded-xl text-[11px] font-bold border border-b2 bg-s2 text-t2 hover:border-accent/40 hover:text-accent transition-colors text-center">
            🎬 Banyak klip beda warna? Shot Matcher →
          </Link>

          {/* How to use */}
          <div className="space-y-2">
            <p className="text-[9px] font-black tracking-widest uppercase text-t3">Cara pakai</p>
            {[
              ['Premiere Pro','Lumetri → Creative → Look → Browse .cube'],
              ['DaVinci Resolve','Color → LUTs → Refresh → paste .cube'],
              ['Lightroom Mobile','Preset → + → Import .xmp'],
              ['CapCut Pro','Filter → + → Import LUT → .cube'],
            ].map(([a,s])=>(
              <div key={a}><p className="text-[10px] font-bold text-txt">{a}</p><p className="text-[10px] text-t3 leading-relaxed">{s}</p></div>
            ))}
          </div>
        </div>
      </div>
    </div>

    {/* ═══════════════════════ MOBILE ═══════════════════════ */}
    <div className="md:hidden flex flex-col" style={{height:'calc(100dvh - 56px)'}}>

      <div className="flex-1 overflow-hidden relative">

        {/* ── SETUP TAB ── */}
        <div className={`absolute inset-0 overflow-y-auto transition-opacity duration-200 ${mobileTab==='setup'?'opacity-100 pointer-events-auto':'opacity-0 pointer-events-none'}`}>
          <div className="p-5 flex flex-col gap-5" style={{paddingBottom:'120px'}}>

            <div className="text-center pt-2">
              <p className="text-[9px] font-black tracking-widest uppercase text-accent mb-2">Color Match Studio</p>
              <h1 className="font-fraunces text-3xl font-semibold">Match Any <span className="italic text-accent">Look</span></h1>
              <p className="text-[11px] text-t3 mt-2">Preview gratis · Bake LUT {matchCost} kredit</p>
              <div className="flex justify-center mt-2.5">
                {authUser ? (!isAdmin && (
                  <Link href="/shop" className="text-[10px] font-bold text-ok bg-ok/10 border border-ok/20 px-3 py-1.5 rounded-full">
                    🤖 {credits} kredit · Top up →
                  </Link>
                )) : (
                  <Link href="/login?next=/studio" className="text-[10px] font-bold text-white bg-accent px-4 py-1.5 rounded-full shadow-lg shadow-accent/30">
                    Daftar gratis → dapat bonus kredit
                  </Link>
                )}
              </div>
            </div>

            <div className="flex items-center justify-center gap-1">
              {[{label:'Ref',done:!!refData},{label:'Analyze',done:!!grade},{label:'Footage',done:!!footImg},{label:'LUT',done:!!lut}].map((s,i)=>(
                <div key={s.label} className="flex items-center gap-1">
                  <span className={`px-2.5 py-1 rounded-full text-[9px] font-bold transition-colors ${s.done?'bg-ok/15 text-ok border border-ok/30':'bg-s3 text-t3 border border-b1'}`}>
                    {s.done?'✓ ':''}{s.label}
                  </span>
                  {i<3&&<span className="text-b2 text-[10px]">›</span>}
                </div>
              ))}
            </div>

            {/* HALEA Code import */}
            <div className="bg-s2 border border-a3/20 rounded-2xl p-4">
              <p className="text-[9px] font-black tracking-widest uppercase text-a3 mb-2">🧬 Punya HALEA Code?</p>
              <div className="flex gap-1.5">
                <input value={codeInput} onChange={e=>setCodeInput(e.target.value)}
                  placeholder="Paste kode look..."
                  className="flex-1 bg-s3 border border-b1 text-txt px-3 py-2.5 rounded-xl text-xs outline-none focus:border-a3 transition-colors placeholder:text-t3 min-w-0 font-mono"/>
                <button onClick={importHaleaCode} disabled={!codeInput.trim()}
                  className="px-4 py-2.5 bg-a3/15 border border-a3/30 text-a3 rounded-xl text-xs font-bold disabled:opacity-40 transition-colors flex-shrink-0 active:scale-[0.97]">
                  Load
                </button>
              </div>
              <p className="text-[9px] text-t3 mt-2">Dapat kode dari creator? Paste → look langsung ke-load</p>
            </div>

            {/* Reference photo card */}
            <div className="bg-s2 border border-b1 rounded-2xl overflow-hidden shadow-lg">
              <div className="px-4 py-3.5 border-b border-b1 flex items-center gap-3">
                <span className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-black flex-shrink-0 ${refData?'bg-ok text-white':'bg-accent/20 text-accent'}`}>{refData?'✓':'1'}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold uppercase tracking-wider">Reference Photo</p>
                  <p className="text-[10px] text-t3 mt-0.5">Foto dengan look yang mau ditiru</p>
                </div>
                {refData&&<span className="text-[9px] text-ok font-bold flex-shrink-0">Ready ✓</span>}
              </div>
              <div className="p-4">
                {refImg ? (
                  <div className="relative">
                    <img src={refImg} alt="Reference" className="w-full h-48 object-cover rounded-xl border border-b1"/>
                    <button onClick={()=>{setRefImg(null);setRefData(null);setGrade(null);setNodes([]);setAfterSrc(null);setLut(null)}}
                      className="absolute top-2.5 right-2.5 w-9 h-9 bg-black/70 rounded-full text-white flex items-center justify-center text-sm hover:bg-red-500 transition-colors">✕</button>
                  </div>
                ) : (
                  <label className="flex flex-col items-center gap-3 py-8 px-4 border-2 border-dashed border-b2 rounded-xl cursor-pointer active:scale-[0.98] transition-transform">
                    <input type="file" accept="image/*" className="sr-only" onChange={e=>{const f=e.target.files?.[0];if(f)handleRefPhoto(f)}}/>
                    <span className="text-4xl opacity-30">🖼</span>
                    <div className="text-center"><p className="text-sm font-bold">Tap untuk upload</p><p className="text-[10px] text-t3 mt-1">JPG · PNG · WEBP</p></div>
                  </label>
                )}
              </div>
            </div>

            {/* Match Colors */}
            <button onClick={handleAnalyze} disabled={!refData||analyzing}
              className={`w-full py-4 rounded-2xl text-sm font-black uppercase tracking-widest transition-all active:scale-[0.97] flex items-center justify-center gap-2.5 ${
                !refData?'bg-s3 border border-b1 text-t3 cursor-not-allowed':
                analyzing?'bg-a4/40 text-black/60 border border-a4/20':
                'bg-a4 text-black shadow-2xl shadow-a4/30'}`}>
              {analyzing?<><span className="w-5 h-5 border-[3px] border-black/20 border-t-black rounded-full animate-spin"/>Analyzing...</>:'✦ Match Colors'}
            </button>

            {/* Skin Guard toggle */}
            {nodes.length>0&&(
              <SkinGuardToggle/>
            )}

            {/* Match Strength (Smart Match only) */}
            {grade?.matched&&<StrengthSlider value={matchAmount} onChange={handleStrength}/>}

            {/* Fine-Tune */}
            {trimNode&&(
              <div className="bg-s2 border border-warn/20 rounded-2xl p-4">
                <div className="flex items-center gap-2 mb-3">
                  <p className="text-[9px] font-black tracking-widest uppercase text-warn">🎛 Fine-Tune</p>
                  {trimDirty&&<span className="w-1.5 h-1.5 rounded-full bg-warn"/>}
                  <span className="ml-auto text-[9px] text-t3">live di Preview</span>
                </div>
                <TrimPanel values={trimVals} onChange={setTrim} onReset={resetTrim} dirty={trimDirty}/>
              </div>
            )}

            {/* Grade result */}
            {grade&&(
              <div className="bg-s2 border border-b1 rounded-2xl overflow-hidden shadow-lg">
                <div className="px-4 py-3 border-b border-b1 flex items-center gap-2.5">
                  <span className="w-2 h-2 rounded-full bg-ok animate-pulse flex-shrink-0"/>
                  <span className="text-[9px] font-black tracking-widest uppercase text-accent">Analysis Result</span>
                  <span className="ml-auto text-[9px] text-t3 font-mono truncate">{grade.desc}</span>
                </div>
                <div className="grid grid-cols-2">
                  {gradeStats.map(({label,val},i)=>(
                    <div key={label} className={`flex flex-col px-4 py-3 ${i%2===0?'border-r border-b1':''} ${i<2?'border-b border-b1':''}`}>
                      <span className="text-[9px] text-t3 uppercase tracking-wider">{label}</span>
                      <span className="text-sm font-bold text-accent capitalize mt-0.5 truncate">{val}</span>
                    </div>
                  ))}
                </div>
                {grade.notes&&grade.notes.length>0&&(
                  <div className="px-4 py-2.5 border-t border-b1 flex flex-col gap-1.5">
                    {grade.notes.map((n,i)=>(
                      <p key={i} className="text-[10px] text-t3 leading-relaxed">💡 {n}</p>
                    ))}
                  </div>
                )}
                <div className="px-4 py-2.5 border-t border-b1 flex justify-between items-center">
                  <button onClick={handleAnalyze} disabled={analyzing} className="text-[10px] font-bold text-t3 hover:text-accent transition-colors">↻ Re-analyze</button>
                  {footImg&&<button onClick={()=>setMobileTab('preview')} className="text-[10px] font-bold text-accent">Lihat Preview →</button>}
                </div>
              </div>
            )}

            {/* Footage card */}
            <div className="bg-s2 border border-b1 rounded-2xl overflow-hidden shadow-lg">
              <div className="px-4 py-3.5 border-b border-b1 flex items-center gap-3">
                <span className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-black flex-shrink-0 ${footImg?'bg-ok text-white':'bg-s4 text-t3'}`}>{footImg?'✓':'2'}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold uppercase tracking-wider">Footage Still</p>
                  <p className="text-[10px] text-t3 mt-0.5">Frame dari footage untuk preview</p>
                </div>
                {footImg&&<span className="text-[9px] text-ok font-bold flex-shrink-0">Ready ✓</span>}
              </div>
              <div className="p-4">
                {footSrc ? (
                  <div className="relative">
                    <img src={footSrc} alt="Footage" className="w-full h-44 object-cover rounded-xl border border-b1"/>
                    <button onClick={()=>{setFootImg(null);setFootSrc(null);setAfterSrc(null);setLogProfile('rec709')}}
                      className="absolute top-2.5 right-2.5 w-9 h-9 bg-black/70 rounded-full text-white flex items-center justify-center text-sm hover:bg-red-500 transition-colors">✕</button>
                    {afterSrc&&(
                      <button onClick={()=>setMobileTab('preview')}
                        className="absolute bottom-3 left-3 right-3 py-2 bg-black/70 backdrop-blur-sm rounded-xl text-white text-xs font-bold border border-white/20">
                        ▶ Lihat Before/After
                      </button>
                    )}
                  </div>
                ) : (
                  <label className="flex flex-col items-center gap-3 py-8 px-4 border-2 border-dashed border-b2 rounded-xl cursor-pointer active:scale-[0.98] transition-transform">
                    <input type="file" accept="image/*" className="sr-only" onChange={e=>{const f=e.target.files?.[0];if(f)handleFootage(f)}}/>
                    <span className="text-4xl opacity-30">🎬</span>
                    <div className="text-center"><p className="text-sm font-bold">Tap untuk upload</p><p className="text-[10px] text-t3 mt-1">Frame dari footage kamu</p></div>
                  </label>
                )}
                {/* Log input profile */}
                {footSrc&&(
                  <div className="mt-3">
                    <label className="text-[9px] font-black tracking-widest uppercase text-t3 block mb-1.5">Input Footage</label>
                    <select value={logProfile} onChange={e=>setLogProfile(e.target.value as LogProfile)}
                      className="w-full bg-s3 border border-b2 text-txt px-3 py-2.5 rounded-xl text-xs outline-none focus:border-accent transition-colors">
                      {LOG_PROFILES.map(p=>(
                        <option key={p.id} value={p.id}>{p.label}{p.id!=='rec709'?` — ${p.cams}`:''}</option>
                      ))}
                    </select>
                    {logProfile!=='rec709'&&(
                      <button onClick={()=>setAutoExp(v=>!v)}
                        className={`mt-2 flex items-center gap-2 px-3 py-2 rounded-xl border text-[10px] font-bold transition-all ${autoExp?'bg-warn/10 border-warn/30 text-warn':'bg-s3 border-b2 text-t3'}`}>
                        <div className={`w-5 h-3 rounded-full relative transition-colors ${autoExp?'bg-warn':'bg-b2'}`}>
                          <div className={`absolute top-0.5 w-2 h-2 rounded-full bg-white transition-all ${autoExp?'left-2.5':'left-0.5'}`}/>
                        </div>
                        ⚡ Auto Exposure{autoExp?` ${Math.log2(logGain)>=0?'+':''}${Math.log2(logGain).toFixed(1)} EV`:' OFF'}
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Bake LUT */}
            {nodes.length>0&&(
              <button onClick={handleBake} disabled={baking}
                className={`w-full py-4 rounded-2xl text-sm font-black uppercase tracking-widest transition-all active:scale-[0.97] flex items-center justify-center gap-2.5 ${baking?'bg-accent/40 text-white':'bg-accent text-white shadow-2xl shadow-accent/30'}`}>
                {baking?<><span className="w-5 h-5 border-[3px] border-white/30 border-t-white rounded-full animate-spin"/>Baking...</>:<><Zap size={16}/>Bake LUT — Standard 33³{!isAdmin&&<span className="text-[10px] bg-white/20 px-2 py-0.5 rounded-full normal-case tracking-normal">{matchCost} kredit</span>}</>}
              </button>
            )}

            {lut&&(
              <button onClick={()=>setMobileTab('export')}
                className="w-full py-3.5 rounded-2xl text-sm font-bold border border-ok/30 bg-ok/10 text-ok flex items-center justify-center gap-2 active:scale-[0.97] transition-all">
                <Download size={15}/> LUT siap — Download sekarang →
              </button>
            )}
          </div>
        </div>

        {/* ── PREVIEW TAB ── */}
        <div className={`absolute inset-0 bg-black transition-opacity duration-200 ${mobileTab==='preview'?'opacity-100 pointer-events-auto':'opacity-0 pointer-events-none'}`}>
          {!footImg ? (
            <div className="h-full flex flex-col items-center justify-center gap-5 p-8 text-center">
              <span className="text-6xl opacity-20">🎬</span>
              <div><p className="font-bold text-white/60 mb-1.5">Belum ada footage</p><p className="text-xs text-white/30">Upload footage still di tab Setup dulu</p></div>
              <button onClick={()=>setMobileTab('setup')} className="px-6 py-3 bg-accent text-white rounded-full text-sm font-bold shadow-lg shadow-accent/30">Ke Setup ↑</button>
            </div>
          ) : !afterSrc ? (
            <div className="relative h-full flex items-center justify-center">
              <img src={footSrc!} className="w-full h-full object-contain opacity-40 pointer-events-none" draggable={false}/>
              <div className="absolute inset-0 flex items-center justify-center px-6">
                <div className="w-full bg-black/85 backdrop-blur-xl rounded-3xl p-7 text-center border border-white/10">
                  <span className="text-4xl block mb-3">✦</span>
                  <p className="font-fraunces text-xl text-white mb-1.5">Match Colors dulu</p>
                  <p className="text-xs text-white/50 mb-5 leading-relaxed">Upload reference photo di Setup<br/>lalu klik Match Colors</p>
                  <button onClick={()=>setMobileTab('setup')} className="px-6 py-3 bg-a4 text-black rounded-full text-sm font-bold shadow-lg shadow-a4/30">✦ Match Colors</button>
                </div>
              </div>
            </div>
          ) : (
            <>
              <SplitViewer mobile/>
              <div className="absolute top-4 right-4 z-30 flex gap-2">
                {logProfile!=='rec709'&&<div className="bg-warn/20 backdrop-blur-sm rounded-xl px-2.5 py-1.5 border border-warn/30"><span className="text-[9px] font-black uppercase text-warn">🪵 {logLabel}</span></div>}
                {skinGuard&&<div className="bg-ok/20 backdrop-blur-sm rounded-xl px-2.5 py-1.5 border border-ok/30"><span className="text-[9px] font-black uppercase text-ok">🎭 Skin Guard</span></div>}
                <div className="bg-black/60 backdrop-blur-sm rounded-xl px-3 py-1.5 border border-white/10">
                  <span className="text-[9px] font-black uppercase text-ok flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-ok animate-pulse"/>LIVE</span>
                </div>
              </div>
              {!lut&&(
                <div className="absolute bottom-6 left-0 right-0 flex justify-center z-30">
                  <button onClick={handleBake} disabled={baking}
                    className="px-5 py-2.5 bg-accent text-white rounded-full text-xs font-bold shadow-xl shadow-accent/30 flex items-center gap-2">
                    {baking?<span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin"/>:<Zap size={13}/>}
                    Bake LUT
                  </button>
                </div>
              )}
              {/* Fine-tune: floating button + bottom sheet */}
              {trimNode&&!mobileTrimOpen&&(
                <button onClick={()=>setMobileTrimOpen(true)}
                  className="absolute bottom-6 left-4 z-30 px-4 py-2.5 bg-black/70 backdrop-blur-sm border border-white/15 rounded-full text-white text-xs font-bold flex items-center gap-1.5 active:scale-[0.95] transition-transform">
                  🎛 Tune{trimDirty&&<span className="w-1.5 h-1.5 rounded-full bg-warn"/>}
                </button>
              )}
              {mobileTrimOpen&&(
                <div className="absolute inset-x-0 bottom-0 z-40 glass border-t border-b1 rounded-t-3xl p-5 overflow-y-auto"
                  style={{maxHeight:'60%'}}>
                  <div className="flex items-center justify-between mb-4">
                    <p className="text-[10px] font-black tracking-widest uppercase text-warn">🎛 Fine-Tune</p>
                    <button onClick={()=>setMobileTrimOpen(false)}
                      className="px-3.5 py-1.5 bg-s3 border border-b2 rounded-full text-xs font-bold text-t2 active:scale-[0.95] transition-transform">
                      Tutup ✓
                    </button>
                  </div>
                  <TrimPanel values={trimVals} onChange={setTrim} onReset={resetTrim} dirty={trimDirty}/>
                </div>
              )}
            </>
          )}
        </div>

        {/* ── EXPORT TAB ── */}
        <div className={`absolute inset-0 overflow-y-auto transition-opacity duration-200 ${mobileTab==='export'?'opacity-100 pointer-events-auto':'opacity-0 pointer-events-none'}`}>
          <div className="p-5 flex flex-col gap-5" style={{paddingBottom:'120px'}}>
            <div className="text-center pt-2">
              <p className="text-[9px] font-black tracking-widest uppercase text-accent mb-2">Export</p>
              <h1 className="font-fraunces text-3xl font-semibold">Download <span className="italic text-accent">LUT</span></h1>
            </div>

            <div className="bg-s2 border border-b1 rounded-2xl p-4">
              <label className="text-[9px] font-black tracking-widest uppercase text-t3 block mb-2">LUT Name</label>
              <input value={lutName} onChange={e=>setLutName(e.target.value)}
                className="w-full bg-s3 border border-b2 text-txt px-4 py-3 rounded-xl text-sm outline-none focus:border-accent transition-colors"/>
            </div>

            {!lut ? (
              <div className="bg-s2 border border-dashed border-b2 rounded-2xl p-10 text-center">
                <span className="text-5xl opacity-20 block mb-4">📦</span>
                <p className="font-bold text-t2 mb-1.5">Belum ada LUT</p>
                <p className="text-xs text-t3 mb-5 leading-relaxed">Match Colors & Bake LUT dulu di Setup</p>
                <button onClick={()=>setMobileTab('setup')} className="px-6 py-3 bg-s3 border border-b2 text-txt rounded-full text-xs font-bold">Ke Setup ↑</button>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <button onClick={()=>downloadLUT('cube')}
                  className="py-5 bg-accent text-white rounded-2xl shadow-2xl shadow-accent/30 active:scale-[0.97] transition-all">
                  <span className="text-lg font-black block">⬇ .cube</span>
                  <span className="text-[10px] opacity-70 font-normal mt-0.5 block">Resolve · PP · AE</span>
                </button>
                <button onClick={()=>downloadLUT('3dl')}
                  className="py-5 bg-s3 border border-b2 text-txt rounded-2xl active:scale-[0.97] transition-all">
                  <span className="text-lg font-black block">⬇ .3dl</span>
                  <span className="text-[10px] text-t3 font-normal mt-0.5 block">Flame · Lustre</span>
                </button>
                <button onClick={downloadXMP}
                  className="py-5 bg-s3 border border-a4/30 rounded-2xl active:scale-[0.97] transition-all">
                  <span className="text-lg font-black text-a4 block">⬇ .xmp</span>
                  <span className="text-[10px] text-t3 font-normal mt-0.5 block">Lightroom Mobile</span>
                </button>
                <button onClick={downloadCapCut}
                  className="py-5 bg-s3 border border-ok/30 rounded-2xl active:scale-[0.97] transition-all">
                  <span className="text-lg font-black text-ok block">⬇ CC</span>
                  <span className="text-[10px] text-t3 font-normal mt-0.5 block">CapCut Pro</span>
                </button>
              </div>
            )}

            {/* DaVinci PowerGrade — premium 65³ */}
            {nodes.length>0&&(
              <button onClick={downloadDaVinci} disabled={dvBaking}
                className="w-full py-4 rounded-2xl text-sm font-bold border border-a2/40 bg-gradient-to-r from-a2/15 to-accent/10 text-a2 active:scale-[0.97] transition-all flex items-center justify-center gap-2 disabled:opacity-40">
                {dvBaking ? <><span className="w-4 h-4 border-2 border-a2/30 border-t-a2 rounded-full animate-spin"/>Baking PowerGrade 65³...</> : <>🎬 DaVinci PowerGrade — 65³ Ultra{!isAdmin&&<span className="text-[10px] bg-a2/20 px-2 py-0.5 rounded-full">{powerGradeCost} kredit</span>}</>}
              </button>
            )}

            {/* HALEA Code copy */}
            {nodes.length>0&&(
              <button onClick={copyHaleaCode}
                className="w-full py-4 rounded-2xl text-sm font-bold border border-a4/30 bg-a4/10 text-a4 active:scale-[0.97] transition-all flex items-center justify-center gap-2">
                🧬 Salin HALEA Code — share look via teks
              </button>
            )}

            {/* Share Card */}
            {afterSrc&&(
              <button onClick={openShareCard}
                className="w-full py-4 rounded-2xl text-sm font-bold border border-a3/30 bg-a3/10 text-a3 active:scale-[0.97] transition-all flex items-center justify-center gap-2">
                🃏 Buat Share Card untuk Sosmed
              </button>
            )}

            {/* Shot Matcher promo */}
            <Link href="/matcher"
              className="block w-full py-3.5 rounded-2xl text-xs font-bold border border-b2 bg-s2 text-t2 active:scale-[0.97] transition-all text-center">
              🎬 Banyak klip beda warna? Coba Shot Matcher →
            </Link>

            {lut&&(
              <div className="bg-s2 border border-b1 rounded-2xl overflow-hidden">
                {[['LUT Size',lutSize+'³ points'],['Active Nodes',nodes.filter(n=>n.enabled).length+' nodes'],['Look Preset',grade?.look||'natural'],...(logProfile!=='rec709'?[['Input',logLabel]]:[])].map(([k,v])=>(
                  <div key={k} className="flex justify-between px-4 py-3 border-b border-b1 last:border-0">
                    <span className="text-xs text-t2">{k}</span>
                    <span className="text-xs text-accent font-mono font-bold capitalize">{v}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="bg-s2 border border-b1 rounded-2xl overflow-hidden">
              <div className="px-4 py-3 border-b border-b1"><p className="text-[9px] font-black tracking-widest uppercase text-t3">Cara pakai di app editing</p></div>
              {[
                {app:'Premiere Pro',    s:'Lumetri Color → Creative → Look → Browse → pilih .cube'},
                {app:'DaVinci Resolve', s:'Color page → LUTs → Refresh → drag ke node'},
                {app:'Lightroom Mobile',s:'Preset → + (import) → pilih .xmp'},
                {app:'CapCut Pro',      s:'Filter → + → Import LUT → pilih .cube'},
              ].map(({app,s})=>(
                <div key={app} className="px-4 py-3.5 border-b border-b1 last:border-0">
                  <p className="text-sm font-bold text-txt mb-1">{app}</p>
                  <p className="text-[11px] text-t3 leading-relaxed">{s}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

      </div>

      {/* Bottom tab bar */}
      <div className="flex-shrink-0 border-t border-b1 glass grid grid-cols-3"
        style={{paddingBottom:'env(safe-area-inset-bottom,0px)'}}>
        {([
          {id:'setup'   as MobileTab, label:'Setup',   Icon:Settings2, badge:!refData||!footImg},
          {id:'preview' as MobileTab, label:'Preview', Icon:Film,      badge:!!afterSrc},
          {id:'export'  as MobileTab, label:'Export',  Icon:Download,  badge:!!lut},
        ]).map(({id,label,Icon,badge})=>(
          <button key={id} onClick={()=>setMobileTab(id)}
            className={`relative flex flex-col items-center gap-1 py-3.5 transition-all ${mobileTab===id?'text-accent':'text-t3'}`}>
            {mobileTab===id&&<span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-accent rounded-full"/>}
            <Icon size={20} strokeWidth={mobileTab===id?2.5:1.5}/>
            <span className="text-[10px] font-bold">{label}</span>
            {badge&&id!==mobileTab&&<span className="absolute top-2.5 right-[calc(50%-20px)] w-2 h-2 rounded-full bg-ok border-2 border-s1"/>}
          </button>
        ))}
      </div>
    </div>

    {/* DaVinci PowerGrade — install guide */}
    {showDvHelp&&(
      <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[60] flex items-center justify-center p-4 animate-fade-in"
        onClick={e=>e.target===e.currentTarget&&setShowDvHelp(false)}>
        <div className="bg-s2 border border-b2 rounded-2xl max-w-md w-full overflow-hidden">
          <div className="px-5 py-4 border-b border-b1 flex items-center gap-3">
            <span className="text-2xl">🎬</span>
            <div className="flex-1">
              <h2 className="font-bold text-base leading-tight">PowerGrade siap untuk DaVinci</h2>
              <p className="text-[10px] text-t3 mt-0.5">LUT 65³ ultra-fidelity terdownload ✓</p>
            </div>
            <button onClick={()=>setShowDvHelp(false)} className="text-t2 hover:text-txt text-xl">✕</button>
          </div>
          <div className="p-5 flex flex-col gap-4">
            <div>
              <p className="text-[9px] font-black tracking-widest uppercase text-a2 mb-2">Cara 1 — sebagai LUT (cepat)</p>
              <ol className="text-[12px] text-t2 leading-relaxed list-decimal pl-4 space-y-1">
                <li>Color page → klik kanan panel <strong className="text-txt">LUTs</strong> → <strong className="text-txt">Open LUT Folder</strong></li>
                <li>Copy file <code className="text-accent text-[11px]">.cube</code> ke folder itu → klik kanan → <strong className="text-txt">Refresh</strong></li>
                <li>Klik kanan node → <strong className="text-txt">LUTs</strong> → pilih HALEA PowerGrade-mu</li>
              </ol>
            </div>
            <div className="border-t border-b1 pt-4">
              <p className="text-[9px] font-black tracking-widest uppercase text-accent mb-2">Cara 2 — jadi PowerGrade Still (pro)</p>
              <ol className="text-[12px] text-t2 leading-relaxed list-decimal pl-4 space-y-1">
                <li>Apply LUT-nya ke sebuah node (Cara 1)</li>
                <li>Klik kanan thumbnail klip di Gallery → <strong className="text-txt">Grab Still</strong></li>
                <li>Di Gallery, klik kanan still → <strong className="text-txt">Add to PowerGrade Album</strong></li>
              </ol>
              <p className="text-[10px] text-t3 mt-2.5 leading-relaxed">Sekarang grade-mu tersimpan di album PowerGrade — tinggal drag ke klip mana pun. ✦</p>
            </div>
            <div className="bg-s3 rounded-xl px-3.5 py-3 text-[11px] text-t2 leading-relaxed">
              💡 <strong className="text-txt">65³</strong> = grid 274.625 titik warna (vs 33³ standar). Gradien lebih halus, banding minimal — kualitas yang colorist Resolve cari.
            </div>
            <button onClick={()=>setShowDvHelp(false)}
              className="w-full py-3 bg-accent text-white rounded-xl text-sm font-bold hover:bg-orange-400 transition-colors">
              Mengerti 👍
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  )
}
