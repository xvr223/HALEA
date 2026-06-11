// HALEA Smart Match Engine v3 — content-aware color transfer, full client-side.
// Layer 1: MKL (Monge-Kantorovich Linear) statistical transfer in Oklab (global)
// Layer 2: tone curve via CDF/QQ matching on L (residual after the linear map)
// Layer 3: per-hue-band residual matching (auto HSL-secondary) — green matches
//          green, orange matches orange; a blue sky in the reference can no
//          longer drag skin tones around (the classic global-transfer failure)
// Layer 4: skin-to-skin matching — if the reference contains skin, footage skin
//          is corrected toward it; if not, skin is protected from band/global swings
// Guards : per-pixel hue rotation cap (~30°) + chroma soft-knee limiter
// Refs: Reinhard 2001, Pitié & Kokaram 2007.

export interface SmartMatchResult {
  matrix: number[]                      // 3×3 row-major, Oklab → Oklab
  muF: [number, number, number]
  muR: [number, number, number]
  curve: Float32Array                   // 64 knots, post-matrix L → target L
  bandH: Float32Array                   // 8 hue bands: hue shift (rad)
  bandS: Float32Array                   // 8 hue bands: chroma ratio
  bandL: Float32Array                   // 8 hue bands: luma shift
  skinH: number; skinS: number; skinL: number
  skinW: number                         // skin layer weight (0 = no skin in footage)
  skinP: number                         // protect mode (1 = ref has no skin → damp global on skin)
  halation: number
  satRatio: number
  derived: { temp: number; tint: number; gamma: number; con: number; sat: number }
  shadowCast: string
  highCast: string
  toneDesc: string
}

const clamp01 = (v: number) => v < 0 ? 0 : v > 1 ? 1 : v
const clampN  = (v: number, lo: number, hi: number) => v < lo ? lo : v > hi ? hi : v
const TAU = Math.PI * 2
const NB  = 8                  // hue bands
const SEG = TAU / NB

const angDiff = (a: number, b: number) => {
  let d = a - b
  while (d >  Math.PI) d -= TAU
  while (d < -Math.PI) d += TAU
  return d
}

// ── sRGB ↔ Oklab (table-accelerated gamma for the per-pixel hot path) ─────────
const S2L = new Float32Array(4096)
const L2S = new Float32Array(4096)
for (let i = 0; i < 4096; i++) {
  const c = i / 4095
  S2L[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  L2S[i] = c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055
}
const lut1d = (T: Float32Array, c: number) => {
  const t = clamp01(c) * 4095, i = t | 0
  return i >= 4095 ? T[4095] : T[i] + (T[i + 1] - T[i]) * (t - i)
}

export function srgbToOklab(r: number, g: number, b: number): [number, number, number] {
  const lr = lut1d(S2L, r), lg = lut1d(S2L, g), lb = lut1d(S2L, b)
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb)
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb)
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb)
  return [
    0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s,
  ]
}

export function oklabToSrgb(L: number, a: number, b: number): [number, number, number] {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (L - 0.0894841775 * a - 1.2914855480 * b) ** 3
  const lr = +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s
  const lg = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s
  const lb = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s
  return [lut1d(L2S, lr), lut1d(L2S, lg), lut1d(L2S, lb)]
}

// ── Soft skin detector in Oklab (0..1, smooth edges) ──────────────────────────
const smoothRange = (v: number, a: number, b: number, c: number, d: number) => {
  if (v <= a || v >= d) return 0
  if (v < b) { const t = (v - a) / (b - a); return t * t * (3 - 2 * t) }
  if (v > c) { const t = (d - v) / (d - c); return t * t * (3 - 2 * t) }
  return 1
}
export function softSkin(L: number, A: number, B: number): number {
  const C = Math.hypot(A, B)
  if (C < 0.02) return 0
  let h = Math.atan2(B, A) * 180 / Math.PI
  if (h < 0) h += 360
  return smoothRange(h, 10, 25, 65, 82)
       * smoothRange(C, 0.025, 0.05, 0.15, 0.21)
       * smoothRange(L, 0.18, 0.30, 0.85, 0.95)
}

// ── Tone curve helpers (memoized parse — hot path calls this per pixel) ───────
const curveCache = new Map<string, Float32Array>()
export function parseCurve(s: string): Float32Array {
  let c = curveCache.get(s)
  if (!c) {
    c = new Float32Array(s.split(',').map(Number))
    if (curveCache.size > 24) curveCache.clear()
    curveCache.set(s, c)
  }
  return c
}
export function sampleCurve(c: Float32Array, x: number): number {
  const t = clamp01(x) * (c.length - 1)
  const i = t | 0
  return i >= c.length - 1 ? c[c.length - 1] : c[i] + (c[i + 1] - c[i]) * (t - i)
}
let IDC: Float32Array | null = null
const identCurve = () => {
  if (!IDC) { IDC = new Float32Array(64); for (let k = 0; k < 64; k++) IDC[k] = k / 63 }
  return IDC
}

// ── 3×3 symmetric matrix toolbox ──────────────────────────────────────────────
function matMul3(A: number[], B: number[]): number[] {
  const M = new Array(9).fill(0)
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
    let s = 0
    for (let k = 0; k < 3; k++) s += A[i * 3 + k] * B[k * 3 + j]
    M[i * 3 + j] = s
  }
  return M
}

function jacobiEigen3(M: number[]): { vals: number[]; V: number[] } {
  const a = M.slice()
  const V = [1, 0, 0, 0, 1, 0, 0, 0, 1]
  for (let iter = 0; iter < 48; iter++) {
    let p = 0, q = 1, mx = Math.abs(a[1])
    if (Math.abs(a[2]) > mx) { mx = Math.abs(a[2]); p = 0; q = 2 }
    if (Math.abs(a[5]) > mx) { mx = Math.abs(a[5]); p = 1; q = 2 }
    if (mx < 1e-13) break
    const apq = a[p * 3 + q]
    const theta = (a[q * 3 + q] - a[p * 3 + p]) / (2 * apq)
    const t = theta === 0 ? 1 : Math.sign(theta) / (Math.abs(theta) + Math.sqrt(theta * theta + 1))
    const c = 1 / Math.sqrt(t * t + 1), s = t * c
    for (let k = 0; k < 3; k++) {
      const akp = a[k * 3 + p], akq = a[k * 3 + q]
      a[k * 3 + p] = c * akp - s * akq
      a[k * 3 + q] = s * akp + c * akq
    }
    for (let k = 0; k < 3; k++) {
      const apk = a[p * 3 + k], aqk = a[q * 3 + k]
      a[p * 3 + k] = c * apk - s * aqk
      a[q * 3 + k] = s * apk + c * aqk
    }
    for (let k = 0; k < 3; k++) {
      const vkp = V[k * 3 + p], vkq = V[k * 3 + q]
      V[k * 3 + p] = c * vkp - s * vkq
      V[k * 3 + q] = s * vkp + c * vkq
    }
  }
  return { vals: [a[0], a[4], a[8]], V }
}

function eigenRebuild(vals: number[], V: number[]): number[] {
  const M = new Array(9).fill(0)
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
    let s = 0
    for (let k = 0; k < 3; k++) s += V[i * 3 + k] * vals[k] * V[j * 3 + k]
    M[i * 3 + j] = s
  }
  return M
}

const matFn3 = (M: number[], f: (l: number) => number) => {
  const { vals, V } = jacobiEigen3(M)
  return eigenRebuild(vals.map(v => f(Math.max(v, 1e-9))), V)
}

// Σ' = 0.75·Σ + 0.25·diag(Σ) + εI — tighter shrinkage (v3) keeps T conservative;
// the hue-band layer handles the color-specific work the matrix used to overdo
function shrinkCov(C: number[]): number[] {
  const out = C.slice()
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) if (i !== j) out[i * 3 + j] *= 0.75
  out[0] += 1e-6; out[4] += 1e-6; out[8] += 1e-6
  return out
}

// ── Image statistics ──────────────────────────────────────────────────────────
interface ImgStats {
  samples: Float32Array
  count: number
  mu: [number, number, number]
  cov: number[]
  sdL: number
  chroma: number
  highFrac: number
  shadowAB: [number, number]
  highAB: [number, number]
  histL: Float32Array
  bandN: Float32Array; bandLm: Float32Array; bandCm: Float32Array; bandHm: Float32Array
  skinN: number; skinMu: [number, number, number]
}

function collectStats(img: ImageData): ImgStats {
  const { data } = img
  const px = data.length / 4
  const step = Math.max(1, Math.floor(px / 120000)) * 4
  const out: number[] = []
  let n = 0, sL = 0, sA = 0, sB = 0, chroma = 0, high = 0, total = 0
  let shN = 0, shA = 0, shB = 0, hiN = 0, hiA = 0, hiB = 0
  const hist = new Float32Array(256)
  const bN = new Float32Array(NB), bL = new Float32Array(NB), bC = new Float32Array(NB)
  const bCos = new Float32Array(NB), bSin = new Float32Array(NB)
  let skN = 0, skL = 0, skA = 0, skB = 0

  for (let i = 0; i < data.length; i += step) {
    const [L, A, B] = srgbToOklab(data[i] / 255, data[i + 1] / 255, data[i + 2] / 255)
    out.push(L, A, B)
    total++
    hist[Math.min(255, Math.max(0, Math.round(L * 255)))]++
    if (L > 0.75) high++
    if (L > 0.02 && L < 0.98) {            // skip clipped pixels in stats
      n++; sL += L; sA += A; sB += B
      const C = Math.hypot(A, B)
      chroma += C
      if (L < 0.35) { shN++; shA += A; shB += B }
      else if (L > 0.65) { hiN++; hiA += A; hiB += B }
      // hue-band stats (chromatic pixels only — neutrals don't define a hue)
      if (C > 0.025) {
        let h = Math.atan2(B, A); if (h < 0) h += TAU
        const bi = Math.min(NB - 1, Math.floor(h / SEG))
        bN[bi]++; bL[bi] += L; bC[bi] += C; bCos[bi] += Math.cos(h); bSin[bi] += Math.sin(h)
      }
      // skin cluster
      if (softSkin(L, A, B) > 0.5) { skN++; skL += L; skA += A; skB += B }
    }
  }
  if (!n) n = 1
  const mu: [number, number, number] = [sL / n, sA / n, sB / n]

  let c00 = 0, c01 = 0, c02 = 0, c11 = 0, c12 = 0, c22 = 0
  for (let i = 0; i < out.length; i += 3) {
    const L = out[i]
    if (L <= 0.02 || L >= 0.98) continue
    const dL = L - mu[0], dA = out[i + 1] - mu[1], dB = out[i + 2] - mu[2]
    c00 += dL * dL; c01 += dL * dA; c02 += dL * dB
    c11 += dA * dA; c12 += dA * dB; c22 += dB * dB
  }
  const cov = [c00 / n, c01 / n, c02 / n, c01 / n, c11 / n, c12 / n, c02 / n, c12 / n, c22 / n]

  const bandHm = new Float32Array(NB)
  const bandLm = new Float32Array(NB)
  const bandCm = new Float32Array(NB)
  for (let i = 0; i < NB; i++) {
    if (bN[i] > 0) {
      bandLm[i] = bL[i] / bN[i]
      bandCm[i] = bC[i] / bN[i]
      bandHm[i] = Math.atan2(bSin[i] / bN[i], bCos[i] / bN[i])
    }
  }

  return {
    samples: new Float32Array(out), count: n, mu, cov,
    sdL: Math.sqrt(cov[0]),
    chroma: chroma / n,
    highFrac: total ? high / total : 0,
    shadowAB: [shN ? shA / shN : 0, shN ? shB / shN : 0],
    highAB:   [hiN ? hiA / hiN : 0, hiN ? hiB / hiN : 0],
    histL: hist,
    bandN: bN, bandLm, bandCm, bandHm,
    skinN: skN,
    skinMu: [skN ? skL / skN : 0, skN ? skA / skN : 0, skN ? skB / skN : 0],
  }
}

// ── CDF matching ──────────────────────────────────────────────────────────────
function buildCdf(hist: Float32Array): Float32Array {
  const cdf = new Float32Array(256)
  let total = 0
  for (let i = 0; i < 256; i++) total += hist[i]
  if (!total) total = 1
  let acc = 0
  for (let i = 0; i < 256; i++) { acc += hist[i]; cdf[i] = acc / total }
  return cdf
}

function invCdf(cdf: Float32Array, p: number): number {
  let lo = 0
  while (lo < 255 && cdf[lo] < p) lo++
  if (lo === 0) return 0
  const c0 = cdf[lo - 1], c1 = cdf[lo]
  const f = c1 > c0 ? (p - c0) / (c1 - c0) : 0
  return (lo - 1 + f) / 255
}

// ── Color cast naming (Oklab a = red↔green, b = yellow↔blue) ──────────────────
function castName(da: number, db: number): string {
  if (Math.hypot(da, db) < 0.006) return 'Neutral'
  const deg = Math.atan2(db, da) * 180 / Math.PI
  if (deg >= -20 && deg < 45)   return 'Warm'
  if (deg >= 45  && deg < 100)  return 'Golden'
  if (deg >= 100 && deg < 160)  return 'Green'
  if (deg >= 160 || deg < -140) return 'Teal'
  if (deg >= -140 && deg < -75) return 'Blue'
  return 'Magenta'
}

// ── Unified per-pixel transform (used by studio nodes, matcher & LUT bake) ────
export interface MatchTransform {
  T: ArrayLike<number>
  muF: ArrayLike<number>
  muR: ArrayLike<number>
  curve: Float32Array
  bandH: ArrayLike<number>
  bandS: ArrayLike<number>
  bandL: ArrayLike<number>
  skinH: number; skinS: number; skinL: number; skinW: number; skinP: number
}

const HUE_CAP = 0.5236      // ±30° max hue swing per pixel (soft beyond)

export function applyTransform(r: number, g: number, b: number, m: MatchTransform, amount: number): [number, number, number] {
  const [oL, oA, oB] = srgbToOklab(r, g, b)
  const T = m.T
  const dL = oL - (m.muF[0] as number), dA = oA - (m.muF[1] as number), dB = oB - (m.muF[2] as number)
  let nL = (T[0] as number) * dL + (T[1] as number) * dA + (T[2] as number) * dB + (m.muR[0] as number)
  let nA = (T[3] as number) * dL + (T[4] as number) * dA + (T[5] as number) * dB + (m.muR[1] as number)
  let nB = (T[6] as number) * dL + (T[7] as number) * dA + (T[8] as number) * dB + (m.muR[2] as number)
  nL = sampleCurve(m.curve, nL)

  const C0 = Math.hypot(oA, oB)
  let Cn = Math.hypot(nA, nB)

  if (C0 > 0.015 && Cn > 1e-5) {
    let h0 = Math.atan2(oB, oA); if (h0 < 0) h0 += TAU
    // band residual (interp between two adjacent band centers)
    const f = h0 / SEG
    const i0 = Math.min(NB - 1, Math.floor(f)), i1 = (i0 + 1) % NB
    const w1 = f - Math.floor(f), w0 = 1 - w1
    const hSh = (m.bandH[i0] as number) * w0 + (m.bandH[i1] as number) * w1
    const sRt = (m.bandS[i0] as number) * w0 + (m.bandS[i1] as number) * w1
    let   lSh = (m.bandL[i0] as number) * w0 + (m.bandL[i1] as number) * w1

    let hn = Math.atan2(nB, nA) + hSh
    let Cf = Cn * sRt

    // skin layer — anchored to the ORIGINAL pixel, not the post-global result.
    // The global matrix can legally rotate hues a lot when reference content
    // differs (sky vs portrait); faces must never ride that swing. Target =
    // original hue/chroma + direct skin-to-skin offset (zero in protect mode);
    // luminance still follows the global tone pipeline.
    const sw = softSkin(oL, oA, oB) * m.skinW
    if (sw > 0.001) {
      const targetH = h0 + m.skinH
      const targetC = C0 * m.skinS
      hn += angDiff(targetH, hn) * sw
      Cf += (targetC - Cf) * sw
      lSh += (m.skinL - lSh) * sw
    }

    // guard 1: total hue swing vs original ≤ ~30° (soft knee beyond)
    const dH = angDiff(hn, h0)
    if (dH >  HUE_CAP) hn = h0 + HUE_CAP + (dH - HUE_CAP) * 0.25
    if (dH < -HUE_CAP) hn = h0 - HUE_CAP + (dH + HUE_CAP) * 0.25
    // guard 2: chroma soft-knee limiter (anti-neon)
    const Cmax = C0 * 1.5 + 0.045
    if (Cf > Cmax) Cf = Cmax + (Cf - Cmax) * 0.25
    if (Cf > 0.34) Cf = 0.34

    nA = Cf * Math.cos(hn)
    nB = Cf * Math.sin(hn)
    nL += lSh
  } else {
    // near-neutral pixel: only cap how much chroma the global cast may add
    const Cmax = C0 * 1.5 + 0.045
    if (Cn > Cmax) { const k = (Cmax + (Cn - Cmax) * 0.25) / Cn; nA *= k; nB *= k }
  }

  const [mr, mg, mb] = oklabToSrgb(nL, nA, nB)
  return [
    clamp01(r + (mr - r) * amount),
    clamp01(g + (mg - g) * amount),
    clamp01(b + (mb - b) * amount),
  ]
}

// Studio stores the transform as flat node params — rebuild + memoize per object
const tfCache = new WeakMap<object, MatchTransform>()
export function transformFromParams(p: Record<string, number | string>): MatchTransform {
  let t = tfCache.get(p)
  if (!t) {
    const num = (k: string, d: number) => typeof p[k] === 'number' ? p[k] as number : d
    const bandH = new Float32Array(NB), bandS = new Float32Array(NB), bandL = new Float32Array(NB)
    for (let i = 0; i < NB; i++) {
      bandH[i] = num('bh' + i, 0)
      bandS[i] = num('bs' + i, 1)
      bandL[i] = num('bl' + i, 0)
    }
    t = {
      T: [num('m0', 1), num('m1', 0), num('m2', 0), num('m3', 0), num('m4', 1), num('m5', 0), num('m6', 0), num('m7', 0), num('m8', 1)],
      muF: [num('fL', 0), num('fa', 0), num('fb', 0)],
      muR: [num('rL', 0), num('ra', 0), num('rb', 0)],
      curve: typeof p.curve === 'string' ? parseCurve(p.curve) : identCurve(),
      bandH, bandS, bandL,
      skinH: num('skh', 0), skinS: num('sks', 1), skinL: num('skl', 0),
      skinW: num('skw', 0), skinP: num('skp', 0),
    }
    tfCache.set(p, t)
  }
  return t
}

// Matcher keeps the SmartMatchResult object — wrap it (memoized)
const smCache = new WeakMap<SmartMatchResult, MatchTransform>()
export function applyMatch(r: number, g: number, b: number, m: SmartMatchResult, amount: number): [number, number, number] {
  let t = smCache.get(m)
  if (!t) {
    t = {
      T: m.matrix, muF: m.muF, muR: m.muR, curve: m.curve,
      bandH: m.bandH, bandS: m.bandS, bandL: m.bandL,
      skinH: m.skinH, skinS: m.skinS, skinL: m.skinL, skinW: m.skinW, skinP: m.skinP,
    }
    smCache.set(m, t)
  }
  return applyTransform(r, g, b, t, amount)
}

// ── Bake a match straight into a 3D LUT grid ──────────────────────────────────
export function bakeMatchLUT(m: SmartMatchResult, amount: number, size = 33): Float32Array {
  const lut = new Float32Array(size ** 3 * 3)
  let i = 0
  for (let bi = 0; bi < size; bi++) for (let gi = 0; gi < size; gi++) for (let ri = 0; ri < size; ri++) {
    const [r, g, b] = applyMatch(ri / (size - 1), gi / (size - 1), bi / (size - 1), m, amount)
    lut[i++] = r; lut[i++] = g; lut[i++] = b
  }
  return lut
}

// ── Main entry ────────────────────────────────────────────────────────────────
export function computeSmartMatch(foot: ImageData, ref: ImageData): SmartMatchResult {
  const F = collectStats(foot)
  const R = collectStats(ref)
  const muF = F.mu, muR = R.mu

  // MKL: T = Σf^-½ · (Σf^½ · Σr · Σf^½)^½ · Σf^-½  (symmetric PSD)
  const Af = shrinkCov(F.cov)
  const Ar = shrinkCov(R.cov)
  const Af12  = matFn3(Af, Math.sqrt)
  const AfM12 = matFn3(Af, v => 1 / Math.sqrt(v))
  const mid   = matFn3(matMul3(matMul3(Af12, Ar), Af12), Math.sqrt)
  let T = matMul3(matMul3(AfM12, mid), AfM12)
  {
    // v3: tighter eigen clamp — the band layer now does the color-specific
    // heavy lifting, so the global matrix stays conservative
    const { vals, V } = jacobiEigen3(T)
    T = eigenRebuild(vals.map(v => clampN(v, 0.4, 2.2)), V)
  }

  // Tone curve: histogram of POST-matrix footage L vs reference L
  const histPost = new Float32Array(256)
  const s = F.samples
  for (let i = 0; i < s.length; i += 3) {
    const dL = s[i] - muF[0], dA = s[i + 1] - muF[1], dB = s[i + 2] - muF[2]
    const Lp = T[0] * dL + T[1] * dA + T[2] * dB + muR[0]
    histPost[Math.min(255, Math.max(0, Math.round(clamp01(Lp) * 255)))]++
  }
  const cdfF = buildCdf(histPost)
  const cdfR = buildCdf(R.histL)

  // QQ construction with linear extrapolation outside the data range
  const P = 64
  const qx: number[] = [], qy: number[] = []
  for (let j = 0; j <= P; j++) {
    const p = 0.005 + 0.99 * j / P
    qx.push(invCdf(cdfF, p))
    qy.push(invCdf(cdfR, p))
  }
  const nq = qx.length
  const iLo = Math.max(1, Math.floor(nq * 0.1))
  const iHi = Math.min(nq - 2, Math.ceil(nq * 0.9))
  let sLo = (qy[iLo] - qy[0]) / Math.max(1e-4, qx[iLo] - qx[0])
  let sHi = (qy[nq - 1] - qy[iHi]) / Math.max(1e-4, qx[nq - 1] - qx[iHi])
  sLo = clampN(isFinite(sLo) ? sLo : 1, 0.25, 4)
  sHi = clampN(isFinite(sHi) ? sHi : 1, 0.25, 4)

  const K = 64
  let curve = new Float32Array(K)
  let j = 0
  for (let k = 0; k < K; k++) {
    const x = k / (K - 1)
    if (x <= qx[0])            curve[k] = qy[0] - (qx[0] - x) * sLo
    else if (x >= qx[nq - 1])  curve[k] = qy[nq - 1] + (x - qx[nq - 1]) * sHi
    else {
      while (j < nq - 2 && qx[j + 1] < x) j++
      const x0 = qx[j], x1 = qx[j + 1]
      curve[k] = x1 > x0 ? qy[j] + (qy[j + 1] - qy[j]) * (x - x0) / (x1 - x0) : qy[j]
    }
  }
  for (let pass = 0; pass < 2; pass++) {
    const sm = new Float32Array(K)
    for (let k = 0; k < K; k++) {
      sm[k] = curve[Math.max(0, k - 1)] * 0.25 + curve[k] * 0.5 + curve[Math.min(K - 1, k + 1)] * 0.25
    }
    curve = sm
  }
  const dx = 1 / (K - 1), minD = 0.25 * dx, maxD = 4 * dx
  curve[0] = clampN(curve[0], 0, 0.15)
  for (let k = 1; k < K; k++) curve[k] = clampN(curve[k], curve[k - 1] + minD, curve[k - 1] + maxD)
  for (let k = 0; k < K; k++) curve[k] = clamp01(curve[k])

  // helper: push a point through global matrix + curve
  const transformPoint = (L: number, A: number, B: number): [number, number, number] => {
    const dL = L - muF[0], dA = A - muF[1], dB = B - muF[2]
    const nL = T[0] * dL + T[1] * dA + T[2] * dB + muR[0]
    const nA = T[3] * dL + T[4] * dA + T[5] * dB + muR[1]
    const nB = T[6] * dL + T[7] * dA + T[8] * dB + muR[2]
    return [sampleCurve(curve, nL), nA, nB]
  }

  // ── Layer 3: per-hue-band residuals (footage band ↔ same-hue reference band)
  const bandH = new Float32Array(NB)
  const bandS = new Float32Array(NB); bandS.fill(1)
  const bandL = new Float32Array(NB)
  const minBF = Math.max(60, F.count * 0.004)
  const minBR = Math.max(60, R.count * 0.004)
  for (let i = 0; i < NB; i++) {
    if (F.bandN[i] < minBF || R.bandN[i] < minBR) continue
    const hf = F.bandHm[i], Cf = F.bandCm[i], Lf = F.bandLm[i]
    const [Lp, Ap, Bp] = transformPoint(Lf, Cf * Math.cos(hf), Cf * Math.sin(hf))
    const Cp = Math.hypot(Ap, Bp), hp = Math.atan2(Bp, Ap)
    const conf = Math.min(1, F.bandN[i] / (minBF * 3), R.bandN[i] / (minBR * 3))
    bandH[i] = clampN(angDiff(R.bandHm[i], hp), -0.436, 0.436) * conf
    bandS[i] = 1 + (clampN(R.bandCm[i] / Math.max(Cp, 1e-3), 0.7, 1.45) - 1) * conf
    bandL[i] = clampN(R.bandLm[i] - Lp, -0.08, 0.08) * conf
  }

  // ── Layer 4: skin-to-skin (or protect when the reference has no skin) ──
  // Offsets are computed in ORIGINAL footage space (apply anchors skin pixels
  // to their original hue/chroma), so the global matrix can't fry faces.
  let skinH = 0, skinS = 1, skinL = 0, skinW = 0, skinP = 0
  const skinFracF = F.skinN / Math.max(1, F.count)
  const skinFracR = R.skinN / Math.max(1, R.count)
  if (skinFracF >= 0.005) {
    skinW = 1
    if (skinFracR >= 0.01) {
      const CF = Math.hypot(F.skinMu[1], F.skinMu[2]), hF = Math.atan2(F.skinMu[2], F.skinMu[1])
      const CR = Math.hypot(R.skinMu[1], R.skinMu[2]), hR = Math.atan2(R.skinMu[2], R.skinMu[1])
      skinH = clampN(angDiff(hR, hF), -0.26, 0.26)              // ±15° max
      skinS = clampN(CR / Math.max(CF, 1e-3), 0.8, 1.3)
      const [Lsp] = transformPoint(F.skinMu[0], F.skinMu[1], F.skinMu[2])
      skinL = clampN(R.skinMu[0] - Lsp, -0.06, 0.06)            // luma residual vs global tone
    } else {
      skinP = 1          // no skin in reference → zero offsets = full protection
    }
  }

  // Derived classic params (for .xmp export + stats display)
  const satRatio = F.chroma > 1e-4 ? R.chroma / F.chroma : 1
  const derived = {
    temp:  clampN((muR[2] - muF[2]) * 3.5, -0.4, 0.4),
    tint:  clampN((muR[1] - muF[1]) * 3.5, -0.3, 0.3),
    gamma: clampN((muR[0] - muF[0]) * 1.2, -0.3, 0.3),
    con:   clampN((F.sdL > 1e-4 ? R.sdL / F.sdL - 1 : 0) * 0.8, -0.3, 0.3),
    sat:   clampN((satRatio - 1) * 0.6, -0.4, 0.4),
  }

  const shadowCast = castName(R.shadowAB[0] - F.shadowAB[0], R.shadowAB[1] - F.shadowAB[1])
  const highCast   = castName(R.highAB[0]   - F.highAB[0],   R.highAB[1]   - F.highAB[1])
  const parts: string[] = []
  if (curve[0] > 0.035) parts.push('Lifted blacks')
  if (curve[K - 1] < 0.965) parts.push('Soft highlights')
  const midSlope = (sampleCurve(curve, 0.55) - sampleCurve(curve, 0.45)) / 0.1
  if (midSlope > 1.18) parts.push('Punchy mids')
  else if (midSlope < 0.85) parts.push('Flat mids')
  if (skinW && skinFracR >= 0.01) parts.push('Skin matched')

  return {
    matrix: T,
    muF, muR, curve,
    bandH, bandS, bandL,
    skinH, skinS, skinL, skinW, skinP,
    halation: clampN(R.highFrac * 1.5, 0, 0.32),
    satRatio,
    derived,
    shadowCast, highCast,
    toneDesc: parts.join(' · ') || 'Balanced tone',
  }
}
