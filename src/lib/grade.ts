// Shared grade-application core — used by Studio (preview/bake/export) and the
// Look Library (renders every community look live onto a test scene).
// Extracted from studio so both surfaces run the EXACT same pixel pipeline.
import { transformFromParams, applyTransform } from './colorMatch'

export interface GradeNodeLike {
  type: string
  enabled: boolean
  params: Record<string, number | string>
}

export const clamp = (v: number, lo = 0, hi = 1) => v < lo ? lo : v > hi ? hi : v
export const luma  = (r: number, g: number, b: number) => 0.2126*r + 0.7152*g + 0.0722*b

export function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
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

export function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  if (s===0) return [l,l,l]
  const q = l<0.5 ? l*(1+s) : l+s-l*s, p = 2*l-q
  const hue = (t: number) => { t=(t+1)%1; if(t<1/6)return p+(q-p)*6*t; if(t<1/2)return q; if(t<2/3)return p+(q-p)*(2/3-t)*6; return p }
  return [hue(h+1/3), hue(h), hue(h-1/3)]
}

// zero-luma chroma direction for a hue (deg) — tints toward that hue w/o shifting brightness
export function hueDir(hueDeg: number): [number, number, number] {
  const [r,g,b] = hslToRgb(((hueDeg%360)+360)%360/360, 1, 0.5)
  const lm = luma(r,g,b)
  return [r-lm, g-lm, b-lm]
}

export function applyNodes(r:number,g:number,b:number,nodes:GradeNodeLike[]):[number,number,number]{
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
      const shoulder=p.shoulder as number
      if(shoulder){const t=0.72,f=(v:number)=>v>t?t+(v-t)/(1+(v-t)*shoulder*5):v;r=f(r);g=f(g);b=f(b)}  // filmic highlight rolloff
      if(sat){const lm=luma(r,g,b),sf=1+sat;r=clamp(lm+(r-lm)*sf);g=clamp(lm+(g-lm)*sf);b=clamp(lm+(b-lm)*sf)}
    }
    if(node.type==='hsl'){
      // per-hue surgical control (8 bands) — the "smart" depth of a real grade
      let [h,s,l]=rgbToHsl(r,g,b)
      if(s>0.035){
        const deg=h*360, centers=[0,30,60,120,180,240,280,320]
        let hSh=0,sAdj=0,lSh=0,w=1e-6
        for(let i=0;i<8;i++){
          let dd=Math.abs(deg-centers[i]); if(dd>180)dd=360-dd
          const ww=Math.max(0,1-dd/55); if(ww<=0)continue
          hSh+=(p['h'+i]as number||0)*ww; sAdj+=(p['s'+i]as number||0)*ww; lSh+=(p['l'+i]as number||0)*ww; w+=ww
        }
        hSh/=w; sAdj/=w; lSh/=w
        h=((h+hSh/360)%1+1)%1; s=clamp(s*(1+sAdj)); l=clamp(l+lSh)
        ;[r,g,b]=hslToRgb(h,s,l)
      }
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
    if(node.type==='split'){
      // 3-way split tone: tint shadows & highlights toward target hues by luma.
      // The soul of film looks (Godfather amber, teal-orange, Matrix green).
      const lh=luma(r,g,b)
      const bal=(p.balance as number)||0
      const sw=clamp(1-lh*2+bal), hw=clamp(lh*2-1-bal)               // shadow / highlight weights
      const sd=hueDir(p.shHue as number), hd=hueDir(p.hiHue as number)
      const ss=(p.shSat as number)*sw, hs=(p.hiSat as number)*hw
      r=clamp(r+sd[0]*ss+hd[0]*hs); g=clamp(g+sd[1]*ss+hd[1]*hs); b=clamp(b+sd[2]*ss+hd[2]*hs)
    }
    if(node.type==='halation'){
      const thr=1-(p.threshold as number),lh=luma(r,g,b)
      if(lh>thr){const fac=Math.pow((lh-thr)/(1-thr),1.5)*(p.intensity as number);r=clamp(r+fac*0.5);g=clamp(g+fac*0.03);b=clamp(b-fac*0.05)}
    }
  }
  return[r,g,b]
}
