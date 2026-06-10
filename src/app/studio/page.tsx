'use client'
import { useState, useRef, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { Badge, DropZone, toast } from '@/components/ui'
import { Zap, Settings2, Film, Download } from 'lucide-react'
import { computeSmartMatch, srgbToOklab, oklabToSrgb, parseCurve, sampleCurve } from '@/lib/colorMatch'

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
      // Smart Match: Oklab MKL transfer + CDF tone curve, blended by amount
      const amount=p.amount as number
      if(amount>0.001){
        const [oL,oA,oB]=srgbToOklab(r,g,b)
        const dL=oL-(p.fL as number), dA=oA-(p.fa as number), dB=oB-(p.fb as number)
        let nL=(p.m0 as number)*dL+(p.m1 as number)*dA+(p.m2 as number)*dB+(p.rL as number)
        const nA=(p.m3 as number)*dL+(p.m4 as number)*dA+(p.m5 as number)*dB+(p.ra as number)
        const nB=(p.m6 as number)*dL+(p.m7 as number)*dA+(p.m8 as number)*dB+(p.rb as number)
        nL=sampleCurve(parseCurve(p.curve as string),nL)
        const [mr,mg,mb]=oklabToSrgb(nL,nA,nB)
        r=clamp(r+(mr-r)*amount);g=clamp(g+(mg-g)*amount);b=clamp(b+(mb-b)*amount)
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

function bakeLUT(nodes:GradeNode[],size:number,skinGuard=false):Float32Array{
  const lut=new Float32Array(size**3*3);let i=0
  for(let bi=0;bi<size;bi++)for(let gi=0;gi<size;gi++)for(let ri=0;ri<size;ri++){
    const r0=ri/(size-1),g0=gi/(size-1),b0=bi/(size-1)
    let[r,g,b]=applyNodes(r0,g0,b0,nodes)
    if(skinGuard&&isSkinTone(r0,g0,b0)){
      // same 0.25 blend as the live preview, so exported LUT matches what user sees
      r=r0+(r-r0)*0.25;g=g0+(g-g0)*0.25;b=b0+(b-b0)*0.25
    }
    lut[i++]=clamp(r);lut[i++]=clamp(g);lut[i++]=clamp(b)
  }
  return lut
}

const mkId=()=>'n'+Date.now()+Math.random().toString(36).slice(2,5)
const mkUUID=()=>'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,c=>{const r=Math.random()*16|0;return(c==='x'?r:(r&0x3|0x8)).toString(16)})
const makeCubeContent = (lut:Float32Array, size:number) => {
  let c=`# HALEA — by @robbiesatriaa\nLUT_3D_SIZE ${size}\nDOMAIN_MIN 0.0 0.0 0.0\nDOMAIN_MAX 1.0 1.0 1.0\n\n`
  for(let i=0;i<lut.length;i+=3) c+=`${lut[i].toFixed(6)} ${lut[i+1].toFixed(6)} ${lut[i+2].toFixed(6)}\n`
  return c
}

type MobileTab = 'setup' | 'preview' | 'export'

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

  const splitRef = useRef<HTMLDivElement>(null)
  const rafRef   = useRef<number|null>(null)

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
        const [nr,ng,nb]=applyNodes(ro, go, bo, nodes)
        const blend = skinGuard && isSkinTone(ro, go, bo) ? 0.25 : 1.0
        out[i]=Math.round(clamp(ro+(nr-ro)*blend)*255)
        out[i+1]=Math.round(clamp(go+(ng-go)*blend)*255)
        out[i+2]=Math.round(clamp(bo+(nb-bo)*blend)*255)
        out[i+3]=data[i+3]
      }
      const c=document.createElement('canvas')
      c.width=width; c.height=height
      c.getContext('2d')!.putImageData(new ImageData(out,width,height), 0, 0)
      setAfterSrc(c.toDataURL('image/jpeg', 0.97))
    })
  }, [nodes, footImg, skinGuard])

  const handleAnalyze = useCallback(() => {
    if (!refData) { toast('Upload reference photo dulu', 'err'); return }
    setAnalyzing(true); setLut(null)
    setTimeout(() => {
      if (footImg) {
        // ── SMART MATCH: true color transfer footage → reference ──
        const m = computeSmartMatch(footImg, refData)
        setGrade({
          temp:m.derived.temp, tint:m.derived.tint, con:m.derived.con,
          gamma:m.derived.gamma, sat:m.derived.sat, lift:Math.max(0,m.curve[0]),
          halation:m.halation, look:'smart', lookAmount:0,
          desc:m.toneDesc, matched:true, toneDesc:m.toneDesc,
          shadowCast:m.shadowCast, highCast:m.highCast, satRatio:m.satRatio,
        })
        setNodes([
          { id:mkId(), type:'match', enabled:true, params:{
              m0:m.matrix[0], m1:m.matrix[1], m2:m.matrix[2],
              m3:m.matrix[3], m4:m.matrix[4], m5:m.matrix[5],
              m6:m.matrix[6], m7:m.matrix[7], m8:m.matrix[8],
              fL:m.muF[0], fa:m.muF[1], fb:m.muF[2],
              rL:m.muR[0], ra:m.muR[1], rb:m.muR[2],
              curve:Array.from(m.curve).map(v=>v.toFixed(5)).join(','),
              amount:matchAmount } },
          { id:mkId(), type:'halation', enabled:m.halation>0.05, params:{ threshold:0.65, intensity:m.halation } },
        ])
        toast('✦ Smart Match — footage dipetakan ke referensi')
      } else {
        // ── BASIC fallback: reference-only heuristic ──
        const g = analyzeColorProfile(refData)
        setGrade({ ...g, matched:false })
        setNodes([
          { id:mkId(), type:'primary',  enabled:true, params:{ lift:g.lift, gamma:g.gamma, temp:g.temp, tint:g.tint, con:g.con, sat:g.sat } },
          { id:mkId(), type:'look',     enabled:g.look!=='natural'&&g.lookAmount>0.1, params:{ look:g.look, amount:g.lookAmount } },
          { id:mkId(), type:'halation', enabled:g.halation>0.05, params:{ threshold:0.65, intensity:g.halation } },
        ])
        toast('✓ ' + g.desc + ' — upload footage untuk Smart Match ✦')
      }
      setAnalyzing(false)
    }, 20)
  }, [refData, footImg, matchAmount])

  // Auto re-match when footage changes: upgrades basic → smart, and re-fits
  // the transform when the user swaps footage (matrix is footage-specific)
  useEffect(() => {
    if (footImg && refData && grade && !analyzing) handleAnalyze()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [footImg])

  const handleStrength = (v:number) => {
    setMatchAmount(v)
    setNodes(prev=>prev.map(n=>n.type==='match'?{...n,params:{...n.params,amount:v}}:n))
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
      setFootImg(c.getContext('2d')!.getImageData(0, 0, c.width, c.height))
    }; img.src=url
  }

  const handleBake = useCallback(async () => {
    if (nodes.length===0) { toast('Match Colors dulu', 'warn'); return }
    setBaking(true)
    await new Promise(r=>setTimeout(r,20))
    setLut(bakeLUT(nodes, lutSize, skinGuard))
    setBaking(false)
    toast('✓ LUT baked — siap di-export')
  }, [nodes, lutSize, skinGuard])

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
    const temp    = Math.round(6500 + grade.temp*3500)   // Kelvin 3000–10000
    const tint    = Math.round(-grade.tint*150)           // LR tint –150…+150
    const expo    = (grade.gamma*1.5).toFixed(2)           // Exposure –5…+5
    const con     = Math.round(grade.con*100)              // Contrast –100…+100
    const shadows = Math.round(grade.lift*60)              // Shadows (lift = open shadows)
    const blacks  = Math.round(grade.lift*400)             // Blacks (lift = raise black floor)
    const sat     = Math.round(grade.sat*100)              // Saturation –100…+100
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
    { label:'Mode',    val:'Smart ✦' },
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
              <div className="px-3 py-2"><button onClick={handleAnalyze} disabled={analyzing} className="text-[9px] font-bold text-t3 hover:text-accent transition-colors disabled:opacity-40">↻ Re-analyze</button></div>
            </div>
          )}
          {grade?.matched&&<StrengthSlider value={matchAmount} onChange={handleStrength}/>}
          <div>
            <div className="flex items-center gap-2 mb-3"><span className="text-[9px] font-black tracking-widest uppercase text-accent">② Footage Still</span><div className="flex-1 h-px bg-b1"/></div>
            <p className="text-[10px] text-t3 mb-2 leading-relaxed">Frame dari footage kamu untuk preview before/after.</p>
            {footSrc ? (
              <div className="relative group">
                <img src={footSrc} alt="Footage" className="w-full h-28 object-cover rounded-xl border border-b1"/>
                <button onClick={()=>{setFootImg(null);setFootSrc(null);setAfterSrc(null)}}
                  className="absolute top-2 right-2 w-6 h-6 bg-black/70 rounded-full text-white text-[10px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500">✕</button>
              </div>
            ) : <DropZone label="Drop footage still" sub="JPG · PNG · WEBP" icon="🎬" accept="image/*" onFile={handleFootage}/>}
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
            {baking?<><span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin"/>Baking...</>:<><Zap size={14}/>Bake LUT</>}
          </button>
          <p className="text-[9px] text-t3 text-center">{nodes.length===0?'Match Colors dulu ↑':'Preview live · Bake untuk export'}</p>
        </div>
      </div>

      {/* CENTER */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <div className="h-10 flex-shrink-0 border-b border-b1 flex items-center px-4 gap-3">
          <span className="text-[9px] font-black tracking-widest uppercase text-t3">Preview</span>
          {afterSrc&&<span className="flex items-center gap-1.5 text-[9px] font-black uppercase text-ok"><span className="w-1.5 h-1.5 rounded-full bg-ok animate-pulse inline-block"/>LIVE</span>}
          {skinGuard&&afterSrc&&<span className="text-[9px] text-ok font-bold">🎭 Skin Guard ON</span>}
          {lut&&<Badge color="accent">LUT Ready</Badge>}
          <span className="ml-auto text-[9px] text-t3 font-mono hidden sm:block">{afterSrc?'Geser ⇔ untuk compare':footImg?'Match Colors untuk preview':'Drop footage still di kiri'}</span>
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

          {!lut&&!nodes.length ? (
            <div className="bg-s2 border border-dashed border-b2 rounded-xl p-3 text-center">
              <p className="text-[10px] text-t3 leading-relaxed">Match Colors → Bake LUT untuk export</p>
            </div>
          ) : lut ? (
            <div className="bg-s2 border border-b1 rounded-xl overflow-hidden">
              {[['Size',lutSize+'³'],['Nodes',nodes.filter(n=>n.enabled).length+' active'],['Look',grade?.look||'—']].map(([k,v])=>(
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
              <p className="text-[11px] text-t3 mt-2">Analisis warna referensi. Instant. Gratis.</p>
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
                    <button onClick={()=>{setFootImg(null);setFootSrc(null);setAfterSrc(null)}}
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
              </div>
            </div>

            {/* Bake LUT */}
            {nodes.length>0&&(
              <button onClick={handleBake} disabled={baking}
                className={`w-full py-4 rounded-2xl text-sm font-black uppercase tracking-widest transition-all active:scale-[0.97] flex items-center justify-center gap-2.5 ${baking?'bg-accent/40 text-white':'bg-accent text-white shadow-2xl shadow-accent/30'}`}>
                {baking?<><span className="w-5 h-5 border-[3px] border-white/30 border-t-white rounded-full animate-spin"/>Baking...</>:<><Zap size={16}/>Bake LUT</>}
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
                {[['LUT Size',lutSize+'³ points'],['Active Nodes',nodes.filter(n=>n.enabled).length+' nodes'],['Look Preset',grade?.look||'natural']].map(([k,v])=>(
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
    </>
  )
}
