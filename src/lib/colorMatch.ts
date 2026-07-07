// HALEA Smart Match Engine v4 — content-aware, self-correcting color transfer.
// Layer 1: MKL (Monge-Kantorovich Linear) statistical transfer in Oklab (global)
// Layer 2: tone curve via CDF/QQ matching on L (residual after the linear map)
// Layer 3: ZONE MATRIX — 8 hue bands × 3 luma zones (shadow/mid/high) = 24 cells
//          of residual corrections, "shadows teal + highlights warm" per hue.
//          Sparse cells fall back to hue-band aggregates, then to identity.
// Layer 4: skin-to-skin matching anchored to the ORIGINAL pixel (protect mode
//          when the reference has no skin)
// Pass 2 : ITERATIVE REFINEMENT — the full transform is applied to the footage
//          samples, the result is measured against the reference, and the
//          remaining error is folded back into the zone matrix (damped).
// Report : CONFIDENCE — the engine scores its own match (histogram distance,
//          per-band color error, content coverage) and explains the gaps.
// Guards : per-pixel hue rotation cap (~30°) + chroma soft-knee limiter.
// Refs: Reinhard 2001, Pitié & Kokaram 2007.

export interface SmartMatchResult {
  matrix: number[]
  muF: [number, number, number]
  muR: [number, number, number]
  curve: Float32Array                   // 64 knots
  zoneH: Float32Array                   // 24 cells (zone*8 + hueBand): hue shift rad
  zoneS: Float32Array                   // 24 cells: chroma ratio
  zoneL: Float32Array                   // 24 cells: luma shift
  bandH: Float32Array                   // 8 aggregates (HALEA Code transport)
  bandS: Float32Array
  bandL: Float32Array
  skinH: number; skinS: number; skinL: number
  skinW: number; skinP: number
  confidence: number                    // 40–99 self-assessed match accuracy
  notes: string[]                       // honest notes about gaps & suggestions
  halation: number
  satRatio: number
  derived: { temp: number; tint: number; gamma: number; con: number; sat: number }
  shadowCast: string
  highCast: string
  toneDesc: string
  // v5 PowerGrade — dense 3D LUT (full-distribution transport). Lives in a
  // module registry keyed by lutId; preview/bake trilinear-interpolate it.
  // Falls back to the parametric model when absent (e.g. decoded HALEA Codes).
  lutId?: string
  lutSize?: number
  // v10 finishing layer (spatial — can't live in a LUT): extra film grain the
  // look carries beyond the footage, and its local-contrast (clarity) ratio.
  // Applied by photo export / preview, not the LUT.
  grain: number
  clarity: number
}

const clamp01 = (v: number) => v < 0 ? 0 : v > 1 ? 1 : v
const clampN  = (v: number, lo: number, hi: number) => v < lo ? lo : v > hi ? hi : v
const TAU = Math.PI * 2
const NB  = 8                  // hue bands
const NZ  = 3                  // luma zones
const NC  = NB * NZ            // 24 cells
const SEG = TAU / NB

const BAND_NAMES = ['Merah-Oranye', 'Kuning', 'Hijau', 'Hijau-Teal', 'Teal', 'Biru', 'Ungu', 'Magenta']

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
// v6: wider, more forgiving skin locus — catches shadowed & slightly
// desaturated skin (the cases that used to slip through and go grey-green)
export function softSkin(L: number, A: number, B: number): number {
  const C = Math.hypot(A, B)
  if (C < 0.015) return 0
  let h = Math.atan2(B, A) * 180 / Math.PI
  if (h < 0) h += 360
  return smoothRange(h, 8, 22, 70, 92)
       * smoothRange(C, 0.018, 0.04, 0.17, 0.24)
       * smoothRange(L, 0.15, 0.28, 0.90, 0.97)
}

// ── Tone curve helpers ────────────────────────────────────────────────────────
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

function shrinkCov(C: number[]): number[] {
  const out = C.slice()
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) if (i !== j) out[i * 3 + j] *= 0.75
  out[0] += 1e-6; out[4] += 1e-6; out[8] += 1e-6
  return out
}

// ── Cell helpers ──────────────────────────────────────────────────────────────
const zoneOf = (L: number) => L < 0.35 ? 0 : L > 0.65 ? 2 : 1
// smooth zone weights for apply-time interpolation
function zoneWeights(L: number): [number, number, number] {
  if (L <= 0.2) return [1, 0, 0]
  if (L < 0.5)  { const t = (L - 0.2) / 0.3; return [1 - t, t, 0] }
  if (L < 0.8)  { const t = (L - 0.5) / 0.3; return [0, 1 - t, t] }
  return [0, 0, 1]
}

// Accumulator for per-cell chromatic statistics
class CellStats {
  n    = new Float32Array(NC)
  sumL = new Float32Array(NC)
  sumC = new Float32Array(NC)
  cos  = new Float32Array(NC)
  sin  = new Float32Array(NC)
  add(L: number, C: number, h: number) {
    const ci = zoneOf(L) * NB + Math.min(NB - 1, Math.floor(h / SEG))
    this.n[ci]++; this.sumL[ci] += L; this.sumC[ci] += C
    this.cos[ci] += Math.cos(h); this.sin[ci] += Math.sin(h)
  }
  // band-level aggregate (sum of its 3 zone cells)
  band(i: number) {
    let n = 0, sL = 0, sC = 0, sc = 0, ss = 0
    for (let z = 0; z < NZ; z++) {
      const c = z * NB + i
      n += this.n[c]; sL += this.sumL[c]; sC += this.sumC[c]; sc += this.cos[c]; ss += this.sin[c]
    }
    return { n, L: n ? sL / n : 0, C: n ? sC / n : 0, h: n ? Math.atan2(ss / n, sc / n) : 0 }
  }
  cell(c: number) {
    const n = this.n[c]
    return { n, L: n ? this.sumL[c] / n : 0, C: n ? this.sumC[c] / n : 0, h: n ? Math.atan2(this.sin[c] / n, this.cos[c] / n) : 0 }
  }
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
  cells: CellStats
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
  const cells = new CellStats()
  let skN = 0, skL = 0, skA = 0, skB = 0

  for (let i = 0; i < data.length; i += step) {
    const [L, A, B] = srgbToOklab(data[i] / 255, data[i + 1] / 255, data[i + 2] / 255)
    out.push(L, A, B)
    total++
    hist[Math.min(255, Math.max(0, Math.round(L * 255)))]++
    if (L > 0.75) high++
    if (L > 0.02 && L < 0.98) {
      n++; sL += L; sA += A; sB += B
      const C = Math.hypot(A, B)
      chroma += C
      if (L < 0.35) { shN++; shA += A; shB += B }
      else if (L > 0.65) { hiN++; hiA += A; hiB += B }
      const isSkin = softSkin(L, A, B) > 0.5
      // chromatic cells are skin-blind on BOTH sides — skin pixels are owned
      // end-to-end by the dedicated skin layer
      if (C > 0.025 && !isSkin) {
        let h = Math.atan2(B, A); if (h < 0) h += TAU
        cells.add(L, C, h)
      }
      if (isSkin) { skN++; skL += L; skA += A; skB += B }
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

  return {
    samples: new Float32Array(out), count: n, mu, cov,
    sdL: Math.sqrt(cov[0]),
    chroma: chroma / n,
    highFrac: total ? high / total : 0,
    shadowAB: [shN ? shA / shN : 0, shN ? shB / shN : 0],
    highAB:   [hiN ? hiA / hiN : 0, hiN ? hiB / hiN : 0],
    histL: hist,
    cells,
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

// ══════════════════════════════════════════════════════════════════════════════
// SMART TONE ENGINE (v7) — a colorist thinks in tonal LANDMARKS, not raw stats.
// Instead of letting the distribution transfer mangle luminance, we anchor the
// footage's black point, shadow, midtone (exposure), highlight & white point to
// the reference's, then connect them with a FILMIC curve: a gentle toe in the
// shadows + monotone body + a smooth shoulder that rolls highlights off instead
// of clipping. This gives controlled blacks, matched exposure & clean highlights.
// ══════════════════════════════════════════════════════════════════════════════

interface ToneLM { bp: number; sh: number; mid: number; hi: number; wp: number }
function toneLandmarks(hist: Float32Array): ToneLM {
  const cdf = buildCdf(hist)
  return {
    bp:  invCdf(cdf, 0.004),   // black point (noise floor)
    sh:  invCdf(cdf, 0.12),    // shadows
    mid: invCdf(cdf, 0.5),     // midtone = exposure anchor (18% grey)
    hi:  invCdf(cdf, 0.88),    // highlights
    wp:  invCdf(cdf, 0.996),   // white point
  }
}

// monotone cubic Hermite (Fritsch-Carlson) — smooth, no overshoot
function pchip(xs: number[], ys: number[], x: number): number {
  const n = xs.length
  if (x <= xs[0]) return ys[0]
  if (x >= xs[n - 1]) return ys[n - 1]
  let i = 0; while (i < n - 2 && x > xs[i + 1]) i++
  const h = xs[i + 1] - xs[i], t = (x - xs[i]) / h
  const sec = (a: number, b: number) => (ys[b] - ys[a]) / (xs[b] - xs[a])
  const delta = sec(i, i + 1)
  let m0 = i === 0 ? delta : (sec(i - 1, i) + delta) / 2
  let m1 = i === n - 2 ? delta : (delta + sec(i + 1, i + 2)) / 2
  // clamp tangents to preserve monotonicity
  if (delta === 0) { m0 = 0; m1 = 0 } else { m0 = Math.max(0, Math.min(m0, 3 * delta)); m1 = Math.max(0, Math.min(m1, 3 * delta)) }
  const t2 = t * t, t3 = t2 * t
  return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h * m0 + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h * m1
}

// Build a 64-knot filmic tone curve mapping footage L → reference L via landmarks
function buildSmartTone(footHist: Float32Array, refHist: Float32Array): Float32Array {
  const F = toneLandmarks(footHist), R = toneLandmarks(refHist)
  // contrast safety: limit how far the body slope can expand/compress vs footage
  const fSpread = Math.max(0.04, F.wp - F.bp), rSpread = Math.max(0.04, R.wp - R.bp)
  const ratio = clampN(rSpread / fSpread, 0.6, 1.55)   // cap contrast expansion → no harsh stretch
  const target = (rv: number, fv: number) => {
    const lim = R.mid + (fv - F.mid) * ratio
    return clampN(rv * 0.7 + lim * 0.3, 0, 1)
  }
  const blackFloor = clampN(R.bp, 0, 0.18)        // anchor to ref black (no forced lift → identity-safe)
  const wpTop = Math.min(R.wp, 0.98)              // small highlight headroom
  // monotone control points through the landmarks
  const xs: number[] = [F.bp, F.sh, F.mid, F.hi, F.wp]
  const ys: number[] = [
    Math.max(blackFloor, R.bp), target(R.sh, F.sh), target(R.mid, F.mid), Math.min(target(R.hi, F.hi), wpTop - 0.01), wpTop,
  ]
  // enforce strictly increasing (monotone) on both axes
  for (let i = 1; i < xs.length; i++) { if (xs[i] <= xs[i - 1]) xs[i] = xs[i - 1] + 1e-3; if (ys[i] <= ys[i - 1]) ys[i] = ys[i - 1] + 1e-3 }

  const K = 64, curve = new Float32Array(K)
  const SH = Math.tanh(1.3)
  for (let k = 0; k < K; k++) {
    const x = k / (K - 1)
    let y: number
    if (x <= F.bp) {
      // toe — gentle smoothstep from 0→black point
      const t = F.bp > 1e-4 ? x / F.bp : 0
      y = blackFloor + (Math.max(blackFloor, R.bp) - blackFloor) * (t * t * (3 - 2 * t))
    } else if (x >= F.wp) {
      // shoulder — gentle filmic rolloff wpTop → 0.995 (keeps highlight gradient, no hard clip)
      const t = (x - F.wp) / Math.max(1e-4, 1 - F.wp)
      y = wpTop + (0.995 - wpTop) * (Math.tanh(t * 1.3) / SH)
    } else {
      y = pchip(xs, ys, x)
    }
    curve[k] = clamp01(y)
  }
  // light smooth + monotonic guard
  for (let pass = 0; pass < 2; pass++) {
    const sm = new Float32Array(K)
    for (let k = 0; k < K; k++) sm[k] = curve[Math.max(0, k - 1)] * 0.25 + curve[k] * 0.5 + curve[Math.min(K - 1, k + 1)] * 0.25
    sm[0] = curve[0]; sm[K - 1] = curve[K - 1]
    for (let k = 0; k < K; k++) curve[k] = sm[k]
  }
  for (let k = 1; k < K; k++) if (curve[k] < curve[k - 1]) curve[k] = curve[k - 1]
  return curve
}

// ══════════════════════════════════════════════════════════════════════════════
// CONTENT-AWARE COLOR TRANSPORT (v8) — palette / cluster correspondence.
// Plain distribution transfer is content-BLIND: it sends "bright pixels" to
// "bright reference pixels" no matter WHAT they are — so overcast clouds get
// dragged toward blue sky. A colorist instead matches LIKE regions: clouds→
// clouds, sky→sky, foliage→foliage. We approximate that: cluster each image's
// colors (k-means in Oklab ≈ a semantic palette), match each footage cluster to
// the most-similar reference cluster (cost = luma + chroma + hue, so a NEUTRAL
// cluster can't be pulled onto a SATURATED one), then warp color space with a
// smooth RBF blend of the per-cluster corrections. Refs: Chang et al.
// "Palette-based Photo Recoloring" 2015; cluster color transfer literature.
// ══════════════════════════════════════════════════════════════════════════════

const KM_K    = 10       // palette size (clusters per image)
const KM_MAXN = 6000     // sample cap

// k-means in Oklab with deterministic k-means++ init → color palette + weights
function kmeansOklab(pts: number[], k: number): { c: number[][]; pop: number[] } {
  const total = Math.floor(pts.length / 3)
  const step = total > KM_MAXN ? Math.floor(total / KM_MAXN) : 1
  const S: number[] = []
  for (let i = 0; i < total; i += step) S.push(pts[i*3], pts[i*3+1], pts[i*3+2])
  const n = Math.floor(S.length / 3)
  const rng = (() => { let s = 0x51ed17 >>> 0; return () => { s += 0x6D2B79F5; let t = Math.imul(s ^ (s >>> 15), s | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 } })()
  const c: number[][] = [[S[0], S[1], S[2]]]
  const d2 = new Float64Array(n)
  for (let ci = 1; ci < k; ci++) {
    let sum = 0
    for (let i = 0; i < n; i++) {
      let m = Infinity
      for (const ce of c) { const dl = S[i*3]-ce[0], da = S[i*3+1]-ce[1], db = S[i*3+2]-ce[2]; const d = dl*dl+da*da+db*db; if (d < m) m = d }
      d2[i] = m; sum += m
    }
    let r = rng() * sum, pick = n - 1
    for (let i = 0; i < n; i++) { r -= d2[i]; if (r <= 0) { pick = i; break } }
    c.push([S[pick*3], S[pick*3+1], S[pick*3+2]])
  }
  const pop = new Array(k).fill(0)
  for (let it = 0; it < 14; it++) {
    const sum = Array.from({ length: k }, () => [0, 0, 0]); pop.fill(0)
    for (let i = 0; i < n; i++) {
      let m = Infinity, bi = 0
      for (let ci = 0; ci < k; ci++) { const ce = c[ci]; const dl = S[i*3]-ce[0], da = S[i*3+1]-ce[1], db = S[i*3+2]-ce[2]; const d = dl*dl+da*da+db*db; if (d < m) { m = d; bi = ci } }
      sum[bi][0] += S[i*3]; sum[bi][1] += S[i*3+1]; sum[bi][2] += S[i*3+2]; pop[bi]++
    }
    for (let ci = 0; ci < k; ci++) if (pop[ci] > 0) c[ci] = [sum[ci][0]/pop[ci], sum[ci][1]/pop[ci], sum[ci][2]/pop[ci]]
  }
  return { c, pop }
}

// ── Split-tone / tonal colour cast ──────────────────────────────────────────
// The single biggest contributor to a "look" feeling like the reference is its
// tone-dependent colour cast: the film-stock tint that pushes shadows one way
// (often teal/green) and highlights another (often warm), INCLUDING on neutrals
// and greys. Cluster correspondence only recolours saturated regions, so a mostly
// grey/overcast scene barely moves without this. We estimate the cast per luma
// zone, weighting DOWN saturated pixels (those are memory colours handled by the
// clusters) so the cast reflects the reference's neutral/mid tint — its true grade.
interface ToneCast { binA: number[]; binB: number[]; nb: number }
function buildToneCast(foot: number[], ref: number[]): ToneCast | null {
  if (foot.length < 900 || ref.length < 900) return null
  const NB = 5
  const acc = (pts: number[]) => {
    const a = new Float64Array(NB), b = new Float64Array(NB), w = new Float64Array(NB)
    for (let i = 0; i < pts.length; i += 3) {
      const L = pts[i], C = Math.hypot(pts[i + 1], pts[i + 2])
      let k = Math.floor(L * NB); if (k < 0) k = 0; if (k >= NB) k = NB - 1
      const wt = Math.exp(-C * 15)         // neutral/mid pixels define the cast
      a[k] += pts[i + 1] * wt; b[k] += pts[i + 2] * wt; w[k] += wt
    }
    const oa: number[] = [], ob: number[] = []
    for (let k = 0; k < NB; k++) { oa.push(w[k] > 1e-6 ? a[k] / w[k] : 0); ob.push(w[k] > 1e-6 ? b[k] / w[k] : 0) }
    return { oa, ob }
  }
  const F = acc(foot), R = acc(ref)
  const binA: number[] = [], binB: number[] = []
  for (let k = 0; k < NB; k++) { binA.push(R.oa[k] - F.oa[k]); binB.push(R.ob[k] - F.ob[k]) }
  // light smoothing across bins so the cast varies gently with luma
  const sm = (arr: number[]) => arr.map((v, k) => (arr[Math.max(0, k - 1)] + 2 * v + arr[Math.min(arr.length - 1, k + 1)]) / 4)
  return { binA: sm(binA), binB: sm(binB), nb: NB }
}
function sampleCast(c: ToneCast, L: number): [number, number] {
  const NB = c.nb
  const x = L * NB - 0.5
  let k = Math.floor(x), t = x - k
  if (k < 0) { k = 0; t = 0 }
  if (k >= NB - 1) { k = NB - 2; t = 1 }
  return [c.binA[k] * (1 - t) + c.binA[k + 1] * t, c.binB[k] * (1 - t) + c.binB[k + 1] * t]
}

// ── v9: Auto White-Balance pre-pass ─────────────────────────────────────────
// Colorist workflow: BALANCE first, then look. We estimate each side's
// illuminant cast (robust gray-world: only near-neutral mid-luma pixels vote,
// with a zero-prior so a scene with no true neutrals — all grass, all sky —
// isn't force-balanced), match on balanced content, then in the LUT:
//   pixel − footageCast → look → + referenceCast
// The footage's accidental tint is removed; the reference's intentional tint
// (golden hour, tungsten) is preserved as part of the look.
function estimateNeutralCast(cloud: number[]): [number, number] {
  const n = cloud.length / 3
  if (n < 300) return [0, 0]
  let wa = 0, wb = 0, ws = n * 0.02          // pseudo-mass pulls toward zero
  for (let i = 0; i < cloud.length; i += 3) {
    const L = cloud[i], a = cloud[i + 1], b = cloud[i + 2]
    if (L < 0.12 || L > 0.93) continue
    const C = Math.hypot(a, b)
    const w = Math.exp(-C * 16) * (1 - Math.abs(L - 0.55) * 0.9)
    wa += a * w; wb += b * w; ws += w
  }
  // partial trust + magnitude cap — extreme "casts" are usually content
  let ca = (wa / ws) * 0.85, cb = (wb / ws) * 0.85
  const m = Math.hypot(ca, cb), MAX = 0.05
  if (m > MAX) { ca *= MAX / m; cb *= MAX / m }
  return [ca, cb]
}

interface WBPair { fa: number; fb: number; ra: number; rb: number }

// ── v10: Residual refinement — the engine's "second look" ───────────────────
// After the first bake, run the footage through the LUT, measure what STILL
// differs from the reference, and express the correction as the classic
// colorist secondary curves: hue-vs-hue rotation, per-band saturation response,
// per-band luma trim, plus a chroma quantile map (sat-vs-sat). Damped & clamped
// so it converges instead of oscillating; identical foot/ref measures ≈0 and
// skips the second pass entirely.
const RES_NB = 8
interface ResidLayer { dH: Float32Array; dS: Float32Array; dL: Float32Array; cq?: Float32Array }

function measureResidual(footRaw: number[], refRaw: number[], lut: Float32Array, N: number): ResidLayer | null {
  const d: DenseLut = { lut, size: N }
  const CQ_N = 64, CQ_MAX = 0.4
  const acc = () => ({ cos: new Float64Array(RES_NB), sin: new Float64Array(RES_NB), C: new Float64Array(RES_NB), L: new Float64Array(RES_NB), n: new Float64Array(RES_NB), hist: new Float64Array(CQ_N), hn: 0 })
  const A = acc(), B = acc()
  const feed = (S: ReturnType<typeof acc>, L: number, a: number, b: number) => {
    if (L < 0.03 || L > 0.97) return
    const C = Math.hypot(a, b)
    let k = Math.floor(C / CQ_MAX * CQ_N); if (k >= CQ_N) k = CQ_N - 1
    S.hist[k]++; S.hn++
    if (C < 0.03) return
    let h = Math.atan2(b, a); if (h < 0) h += TAU
    const bi = Math.min(RES_NB - 1, Math.floor(h / TAU * RES_NB))
    S.cos[bi] += Math.cos(h); S.sin[bi] += Math.sin(h); S.C[bi] += C; S.L[bi] += L; S.n[bi]++
  }
  const step = (raw: number[]) => Math.max(3, Math.floor(raw.length / 3 / 20000) * 3)
  const fs = step(footRaw)
  for (let i = 0; i + 2 < footRaw.length; i += fs) {
    const [sr, sg, sb] = oklabToSrgb(footRaw[i], footRaw[i + 1], footRaw[i + 2])
    const [mr, mg, mb] = trilinear(d, clamp01(sr), clamp01(sg), clamp01(sb))
    const [L, a, b] = srgbToOklab(mr, mg, mb)
    feed(A, L, a, b)
  }
  const rs = step(refRaw)
  for (let i = 0; i + 2 < refRaw.length; i += rs) feed(B, refRaw[i], refRaw[i + 1], refRaw[i + 2])

  const totA = A.n.reduce((s, x) => s + x, 0), totB = B.n.reduce((s, x) => s + x, 0)
  if (totA < 400 || totB < 400) return null
  const dH = new Float32Array(RES_NB), dS = new Float32Array(RES_NB).fill(1), dL = new Float32Array(RES_NB)
  let active = false
  for (let b = 0; b < RES_NB; b++) {
    if (A.n[b] < totA * 0.015 || B.n[b] < totB * 0.015) continue
    const hA = Math.atan2(A.sin[b], A.cos[b]), hB = Math.atan2(B.sin[b], B.cos[b])
    dH[b] = clampN(angDiff(hB, hA), -0.30, 0.30) * 0.65
    dS[b] = 1 + (clampN((B.C[b] / B.n[b]) / Math.max(A.C[b] / A.n[b], 1e-4), 0.72, 1.35) - 1) * 0.65
    dL[b] = clampN(B.L[b] / B.n[b] - A.L[b] / A.n[b], -0.07, 0.07) * 0.6
    if (Math.abs(dH[b]) > 0.01 || Math.abs(dS[b] - 1) > 0.02 || Math.abs(dL[b]) > 0.006) active = true
  }
  // chroma quantile map (sat-vs-sat): result CDF → ref quantiles, damped 0.5
  let cq: Float32Array | undefined
  if (A.hn > 400 && B.hn > 400) {
    const cdf = (h: Float64Array, tot: number) => { const c = new Float64Array(CQ_N); let s = 0; for (let k = 0; k < CQ_N; k++) { s += h[k]; c[k] = s / tot } return c }
    const cA = cdf(A.hist, A.hn), cB = cdf(B.hist, B.hn)
    cq = new Float32Array(CQ_N)
    let j = 0
    for (let k = 0; k < CQ_N; k++) {
      const q = cA[k]
      while (j < CQ_N - 1 && cB[j] < q) j++
      const Cin = (k + 0.5) / CQ_N * CQ_MAX
      let Cout = (j + 0.5) / CQ_N * CQ_MAX
      Cout = clampN(Cout, Cin * 0.7, Cin * 1.4 + 0.008)      // bounded response
      cq[k] = Cin + (Cout - Cin) * 0.5                        // damped
      if (k > 0 && cq[k] < cq[k - 1]) cq[k] = cq[k - 1]       // monotone
      if (Math.abs(cq[k] - Cin) > 0.006) active = true
    }
  }
  return active ? { dH, dS, dL, cq } : null
}

// circularly-interpolated band residual at hue h (band centers at (b+0.5)/NB)
function sampleResid(r: ResidLayer, h: number): [number, number, number] {
  let x = (h / TAU) * RES_NB - 0.5
  if (x < 0) x += RES_NB
  const b0 = Math.floor(x) % RES_NB, b1 = (b0 + 1) % RES_NB, t = x - Math.floor(x)
  return [
    r.dH[b0] * (1 - t) + r.dH[b1] * t,
    r.dS[b0] * (1 - t) + r.dS[b1] * t,
    r.dL[b0] * (1 - t) + r.dL[b1] * t,
  ]
}
function sampleCq(cq: Float32Array, C: number): number {
  const CQ_MAX = 0.4
  if (C >= CQ_MAX) return C * (cq[cq.length - 1] / ((cq.length - 0.5) / cq.length * CQ_MAX))
  const x = C / CQ_MAX * cq.length - 0.5
  if (x <= 0) return cq[0] * (C / (0.5 / cq.length * CQ_MAX))
  const k = Math.min(cq.length - 2, Math.floor(x)), t = x - k
  return cq[k] * (1 - t) + cq[k + 1] * t
}

interface ClusterMap { fc: number[][]; tgt: number[][]; sig2: number }

// match footage palette → reference palette, build per-cluster targets.
// v10: assignment is solved as OPTIMAL TRANSPORT (Sinkhorn) instead of a
// per-row softmax. Mass conservation means the WHOLE reference palette gets
// used proportionally — no more several footage clusters piling onto one ref
// colour while the rest of the look goes untransferred. Cost stays role-based
// (luma primary, chroma-presence secondary, NO hue term — a hue penalty would
// map every colour to its nearest twin = near-identity = "look tak berubah").
function buildClusterMap(foot: number[], ref: number[]): ClusterMap | null {
  if (foot.length < 900 || ref.length < 900) return null
  const F = kmeansOklab(foot, KM_K), R = kmeansOklab(ref, KM_K)
  const Fc = F.c, Rc = R.c
  const ch = (c: number[]) => Math.hypot(c[1], c[2])
  // masses = normalized cluster populations (tiny floor keeps Sinkhorn stable)
  const fTot = F.pop.reduce((s, x) => s + x, 0) || 1
  const rTot = R.pop.reduce((s, x) => s + x, 0) || 1
  const am = F.pop.map(p => p / fTot + 1e-4)
  const bm = R.pop.map(p => p / rTot + 1e-4)
  // role cost matrix + Gibbs kernel. ε tuned so identical palettes resolve to a
  // clean diagonal (identity) while distinct palettes still share mass smoothly.
  const EPS = 0.045
  const Kmat: number[][] = []
  for (let i = 0; i < KM_K; i++) {
    const fc = Fc[i], fch = ch(fc)
    const row: number[] = []
    for (let j = 0; j < KM_K; j++) {
      const rc = Rc[j], rch = ch(rc)
      const cost = Math.abs(fc[0] - rc[0]) * 3.0 + Math.abs(fch - rch) * 2.4
      row.push(Math.exp(-cost / EPS))
    }
    Kmat.push(row)
  }
  // Sinkhorn iterations (10×10 — converges in a blink)
  const u = new Array(KM_K).fill(1), v = new Array(KM_K).fill(1)
  for (let it = 0; it < 60; it++) {
    for (let i = 0; i < KM_K; i++) { let s = 0; for (let j = 0; j < KM_K; j++) s += Kmat[i][j] * v[j]; u[i] = am[i] / Math.max(s, 1e-12) }
    for (let j = 0; j < KM_K; j++) { let s = 0; for (let i = 0; i < KM_K; i++) s += Kmat[i][j] * u[i]; v[j] = bm[j] / Math.max(s, 1e-12) }
  }
  const tgt: number[][] = []
  for (let i = 0; i < KM_K; i++) {
    const fc = Fc[i], fch = ch(fc)
    // transport plan row P_ij = u_i·K_ij·v_j — where cluster i's colours GO
    let wa = 0, wb = 0, wl = 0, wsum = 1e-12
    for (let j = 0; j < KM_K; j++) {
      const p = u[i] * Kmat[i][j] * v[j]
      const rc = Rc[j]
      wa += p * rc[1]; wb += p * rc[2]; wl += p * rc[0]; wsum += p
    }
    let ta = wa / wsum, tb = wb / wsum
    // NEUTRAL PRESERVATION — a near-neutral footage cluster (clouds, grey walls,
    // overcast sky) keeps its OWN near-neutral identity, even if its tonal slot in
    // the reference is saturated. Tight threshold so ONLY genuinely grey regions
    // (clouds, fog ~chroma<0.045) are protected — a hazy blue sky (chroma~0.05+)
    // is still free to take on the reference's teal.
    const retain = fch >= 0.045 ? 0 : fch <= 0.015 ? 0.92 : 0.92 * (1 - (fch - 0.015) / 0.03)
    ta = ta * (1 - retain) + fc[1] * retain
    tb = tb * (1 - retain) + fc[2] * retain
    // chroma ceiling on the target — generous enough to let strong looks (vivid
    // teal/orange) come through, but bounded so neutrals can't explode
    const tch = Math.hypot(ta, tb), maxch = fch * 2.2 + 0.05
    if (tch > maxch && tch > 1e-5) { const s = maxch / tch; ta *= s; tb *= s }
    tgt.push([wl / wsum, ta, tb])
  }
  // RBF radius = mean nearest-neighbour spacing of footage clusters
  let dsum = 0
  for (let i = 0; i < KM_K; i++) {
    let m = Infinity
    for (let j = 0; j < KM_K; j++) { if (i === j) continue; const dl = Fc[i][0]-Fc[j][0], da = Fc[i][1]-Fc[j][1], db = Fc[i][2]-Fc[j][2]; const d = dl*dl+da*da+db*db; if (d < m) m = d }
    dsum += Math.sqrt(m)
  }
  const sig = Math.max(0.05, dsum / KM_K) * 1.2
  return { fc: Fc, tgt, sig2: 2 * sig * sig }
}

// smooth RBF blend of per-cluster (a,b) corrections — the content-aware warp
function applyClusterColor(L: number, a: number, b: number, m: ClusterMap): [number, number] {
  const fc = m.fc, tgt = m.tgt, K = fc.length
  let da = 0, db = 0, wsum = 1e-9
  for (let i = 0; i < K; i++) {
    const dl = L - fc[i][0], xa = a - fc[i][1], xb = b - fc[i][2]
    const w = Math.exp(-(dl*dl + xa*xa + xb*xb) / m.sig2)
    da += w * (tgt[i][1] - fc[i][1]); db += w * (tgt[i][2] - fc[i][2]); wsum += w
  }
  return [a + da / wsum, b + db / wsum]
}

// v6: gamut-aware conversion. Out-of-gamut Oklab → reduce CHROMA toward the
// achromatic axis (preserving hue & lightness) until in [0,1], instead of
// per-channel hard clamp (which shifts hue and causes "warna pecah" on vivid
// colors). A soft inset margin keeps highlights from hard-edging.
// v7: vivid-preserving gamut handling. Mildly out-of-gamut colors are just
// clamped per-channel (keeps saturation/punch like v5 — no graying). Only
// SEVERELY out-of-gamut colors get a partial chroma pull-back, and even then
// not all the way to gray — just enough to avoid ugly hue breaks.
function oklabToSrgbGamut(L: number, a: number, b: number): [number, number, number] {
  const [r0, g0, b0] = oklabToSrgb(L, a, b)
  const over = Math.max(0, -r0, -g0, -b0, r0 - 1, g0 - 1, b0 - 1)
  if (over < 0.085) return [clamp01(r0), clamp01(g0), clamp01(b0)]   // mild → clamp, stay vivid
  // severe → reduce chroma toward (but not below) 70% so it never grays out
  let lo = 0.7, hi = 1
  for (let it = 0; it < 12; it++) {
    const mid = (lo + hi) / 2
    const [r, g, c] = oklabToSrgb(L, a * mid, b * mid)
    const o = Math.max(0, -r, -g, -c, r - 1, g - 1, c - 1)
    if (o < 0.04) hi = mid; else lo = mid
  }
  const [r, g, c] = oklabToSrgb(L, a * hi, b * hi)
  return [clamp01(r), clamp01(g), clamp01(c)]
}

// Bake the content-aware color transport + filmic tone over an RGB lattice →
// dense LUT, folding in the skin layer + perceptual guards + gamut compression.
interface SkinLayer { skinW: number; skinH: number; skinS: number; skinL: number; skinP: number }
function bakeDenseFromClusters(cmap: ClusterMap, sk: SkinLayer, size: number, tone?: Float32Array, cast?: ToneCast, wb?: WBPair, resid?: ResidLayer): Float32Array {
  const N = size
  const lut = new Float32Array(N * N * N * 3)
  let li = 0
  for (let bi = 0; bi < N; bi++) for (let gi = 0; gi < N; gi++) for (let ri = 0; ri < N; ri++) {
    const r0 = ri / (N - 1), g0 = gi / (N - 1), b0 = bi / (N - 1)
    const [oL, oAr, oBr] = srgbToOklab(r0, g0, b0)
    // v9 WB pre-pass: neutralize the footage cast FIRST, so the cluster warp,
    // guards & skin detection all operate on balanced content — where the
    // footage's clouds are truly neutral and its skin sits in the skin locus.
    const oA = oAr - (wb ? wb.fa : 0), oB = oBr - (wb ? wb.fb : 0)
    // COLOR (a,b): content-aware cluster-correspondence warp (clouds→clouds, etc.)
    let [nA, nB] = applyClusterColor(oL, oA, oB, cmap)
    // SPLIT-TONE (a,b): impose the reference's tone-dependent colour cast so the
    // LOOK lands even on neutrals/greys (shadows & highlights get the film tint).
    // Derived from the reference's neutral/mid pixels, so it's the grade's cast —
    // not a re-tint of memory colours, and gentle enough to keep whites clean.
    if (cast) {
      const [ca, cb] = sampleCast(cast, oL)
      let cs = 0.75
      if (oL > 0.85) cs *= Math.max(0, 1 - (oL - 0.85) / 0.13)   // protect near-whites/clouds
      nA += ca * cs; nB += cb * cs
    }
    // v9: reintroduce the REFERENCE's own illuminant — the look's intentional
    // tint (golden hour, tungsten) — on top of the balanced, warped content
    if (wb) { nA += wb.ra; nB += wb.rb }
    // v10: RESIDUAL secondary curves — the second-pass correction measured from
    // the first bake (hue-vs-hue, sat response, per-band luma, sat-vs-sat)
    let dLr = 0
    if (resid) {
      let hh = Math.atan2(nB, nA); if (hh < 0) hh += TAU
      let Cc = Math.hypot(nA, nB)
      const [rdH, rdS, rdL] = sampleResid(resid, hh)
      if (Cc > 0.012) {
        hh += rdH
        Cc *= rdS
        if (resid.cq) Cc = sampleCq(resid.cq, Cc)
        nA = Cc * Math.cos(hh); nB = Cc * Math.sin(hh)
      }
      dLr = rdL
    }
    // TONE (L): Smart Tone Engine filmic curve (controlled blacks/exposure/highlights)
    let nL = (tone ? sampleCurve(tone, oL) : oL) + dLr
    // guard ANCHOR = the content under the TARGET illuminant (balanced + refWB).
    // Guards bound deviation from where content legitimately sits in the look —
    // for identity (foot==ref) the anchor equals the raw pixel, so no false pulls.
    const aA = oA + (wb ? wb.ra : 0), aB = oB + (wb ? wb.rb : 0)
    const C0 = Math.hypot(aA, aB), Cn = Math.hypot(nA, nB)
    if (C0 > 0.015 && Cn > 1e-5) {
      let h0 = Math.atan2(aB, aA); if (h0 < 0) h0 += TAU
      let hn = Math.atan2(nB, nA)
      let Cf = Cn
      const sw = softSkin(oL, oA, oB) * sk.skinW
      if (sw > 0.001) {
        // Skin JOINS the look (warms, cools & tones WITH the reference) instead of
        // being frozen to the raw original — but it stays believable: the hue swing
        // away from the natural skin hue is soft-capped (can't go green/teal/magenta)
        // and chroma is held inside a skin band (no graying, no clown-orange).
        // (a) exposure: skin rides the look's tone + a measured skin-L nudge
        const lSkin = nL + sk.skinL
        // (b) hue: start from the LOOK's hue; if the reference has real skin, bias
        //     toward that measured skin-to-skin shift; then soft-cap the swing.
        let hWanted = hn
        if (sk.skinP === 0 && sk.skinH !== 0) hWanted = hn + angDiff(h0 + sk.skinH, hn) * 0.55
        let dH = angDiff(hWanted, h0)
        const SW_CAP = 0.32                       // ~18° believable skin swing
        if (dH >  SW_CAP) dH = SW_CAP + (dH - SW_CAP) * 0.2
        if (dH < -SW_CAP) dH = -SW_CAP + (dH + SW_CAP) * 0.2
        const hSkin = h0 + dH
        // (c) chroma: follow the look, biased toward the reference skin's chroma
        //     ratio when known, clamped to a believable band
        const cBand = sk.skinP === 0 ? C0 * sk.skinS : Cf
        let cSkin = Cf + (cBand - Cf) * 0.5
        // keep skin SOFT — chroma may dip for filmic softness but barely rises,
        // so the grade can warm skin without it ever reading as harsh/clown-orange
        const cLo = C0 * 0.70, cHi = C0 * 1.08
        if (cSkin < cLo) cSkin = cLo
        if (cSkin > cHi) cSkin = cHi
        // blend look ↔ skin-treated by skin confidence (partial-skin edges stay smooth)
        hn = hn + angDiff(hSkin, hn) * sw
        Cf = Cf + (cSkin - Cf) * sw
        nL = nL + (lSkin - nL) * sw
      }
      const capW = C0 >= 0.06 ? 1 : C0 <= 0.025 ? 0 : (() => { const t = (C0 - 0.025) / 0.035; return t * t * (3 - 2 * t) })()
      if (capW > 0.05) {
        const lim = HUE_CAP / capW
        const dH = angDiff(hn, h0)
        if (dH >  lim) hn = h0 + lim + (dH - lim) * 0.25
        if (dH < -lim) hn = h0 - lim + (dH + lim) * 0.25
      }
      // saturated regions keep their punch (don't desaturate grass/sky to grey);
      // neutral pixels have tiny C0 so this is a no-op for them
      if (sw < 0.5) { const cFloor = C0 * 0.72; if (Cf < cFloor) Cf = cFloor }
      // chroma ceiling — generous enough for strong looks, bounded for neutrals
      const Cmax = C0 * 1.85 + 0.045
      if (Cf > Cmax) Cf = Cmax + (Cf - Cmax) * 0.25
      if (Cf > 0.34) Cf = 0.34
      nA = Cf * Math.cos(hn); nB = Cf * Math.sin(hn)
    } else {
      const Cmax = C0 * 1.85 + 0.045
      if (Cn > Cmax) { const k = (Cmax + (Cn - Cmax) * 0.25) / Cn; nA *= k; nB *= k }
    }
    const [mr, mg, mb] = oklabToSrgbGamut(nL, nA, nB)
    lut[li++] = mr; lut[li++] = mg; lut[li++] = mb
  }
  smoothLut3D(lut, N, 0.12)   // gentle regularization vs banding
  return lut
}

// separable [w, 1−2w, w] blur along each LUT axis, edge-clamped (corners stay put)
function smoothLut3D(lut: Float32Array, N: number, w: number) {
  const c = 1 - 2 * w
  const at = (ri: number, gi: number, bi: number, ch: number) => (bi * N * N + gi * N + ri) * 3 + ch
  const tmp = new Float32Array(lut.length)
  // R axis
  for (let bi = 0; bi < N; bi++) for (let gi = 0; gi < N; gi++) for (let ri = 0; ri < N; ri++) {
    const lo = Math.max(0, ri - 1), hi = Math.min(N - 1, ri + 1)
    for (let ch = 0; ch < 3; ch++) tmp[at(ri,gi,bi,ch)] = w*lut[at(lo,gi,bi,ch)] + c*lut[at(ri,gi,bi,ch)] + w*lut[at(hi,gi,bi,ch)]
  }
  // G axis
  for (let bi = 0; bi < N; bi++) for (let gi = 0; gi < N; gi++) for (let ri = 0; ri < N; ri++) {
    const lo = Math.max(0, gi - 1), hi = Math.min(N - 1, gi + 1)
    for (let ch = 0; ch < 3; ch++) lut[at(ri,gi,bi,ch)] = w*tmp[at(ri,lo,bi,ch)] + c*tmp[at(ri,gi,bi,ch)] + w*tmp[at(ri,hi,bi,ch)]
  }
  // B axis
  for (let bi = 0; bi < N; bi++) for (let gi = 0; gi < N; gi++) for (let ri = 0; ri < N; ri++) {
    const lo = Math.max(0, bi - 1), hi = Math.min(N - 1, bi + 1)
    for (let ch = 0; ch < 3; ch++) tmp[at(ri,gi,bi,ch)] = w*lut[at(ri,gi,lo,ch)] + c*lut[at(ri,gi,bi,ch)] + w*lut[at(ri,gi,hi,ch)]
  }
  lut.set(tmp)
}

// ── Dense LUT registry (heavy data kept out of node params / HALEA Codes) ─────
interface DenseLut { lut: Float32Array; size: number }
const lutRegistry = new Map<string, DenseLut>()
let lutCounter = 0
export function registerDenseLut(lut: Float32Array, size: number): string {
  const id = 'pg' + (++lutCounter).toString(36) + Date.now().toString(36)
  lutRegistry.set(id, { lut, size })
  if (lutRegistry.size > 20) lutRegistry.delete(lutRegistry.keys().next().value as string)
  return id
}
export function getDenseLut(id: string | undefined): DenseLut | undefined {
  return id ? lutRegistry.get(id) : undefined
}

// ── PowerGrade Node Kit ──────────────────────────────────────────────────────
// The v9 pipeline is staged internally (balance → look → tone). For DaVinci
// users we expose those stages as SEPARATE LUTs so they can build a real node
// tree (one LUT per serial node), tweak each stage independently, and save it
// as an actual PowerGrade in their Gallery. Stage data is registered alongside
// the dense LUT under the same id.
interface StagePack { cmap: ClusterMap; cast?: ToneCast; tone?: Float32Array; wb: WBPair; skin: SkinLayer; resid?: ResidLayer }
const stageRegistry = new Map<string, StagePack>()
function registerStages(id: string, s: StagePack) {
  stageRegistry.set(id, s)
  if (stageRegistry.size > 20) stageRegistry.delete(stageRegistry.keys().next().value as string)
}
export function hasStages(id: string | undefined): boolean { return !!(id && stageRegistry.has(id)) }

export interface NodeKit { balance?: Float32Array; look: Float32Array; tone: Float32Array; size: number }

// Bake the per-node LUTs. Serial composition (balance → look → tone) closely
// matches the integrated dense LUT — not bit-identical (stage quantization,
// per-stage gamut handling) but that's the point: each node stays adjustable.
export function bakeNodeKit(id: string | undefined, size = 33): NodeKit | null {
  const st = id ? stageRegistry.get(id) : undefined
  if (!st) return null
  const { cmap, cast, tone, wb, skin: sk, resid } = st
  const N = size
  const hasBal = Math.hypot(wb.fa, wb.fb) > 0.003
  const bal = hasBal ? new Float32Array(N * N * N * 3) : undefined
  const look = new Float32Array(N * N * N * 3)
  const toneL = new Float32Array(N * N * N * 3)
  let li = 0
  for (let bi = 0; bi < N; bi++) for (let gi = 0; gi < N; gi++) for (let ri = 0; ri < N; ri++) {
    const r0 = ri / (N - 1), g0 = gi / (N - 1), b0 = bi / (N - 1)
    const [oL, oA, oB] = srgbToOklab(r0, g0, b0)

    // ── 01 BALANCE — remove the footage's illuminant cast only ──
    // (small ab shift: per-channel clamp, chroma pull-back would wash punch)
    if (bal) {
      const [br, bg, bb] = oklabToSrgb(oL, oA - wb.fa, oB - wb.fb)
      bal[li] = clamp01(br); bal[li + 1] = clamp01(bg); bal[li + 2] = clamp01(bb)
    }

    // ── 02 LOOK — input assumed balanced; colour + skin + guards (no tone) ──
    // (kept in sync with bakeDenseFromClusters — same maths, staged)
    {
      let [nA, nB] = applyClusterColor(oL, oA, oB, cmap)
      if (cast) {
        const [ca, cb] = sampleCast(cast, oL)
        let cs = 0.75
        if (oL > 0.85) cs *= Math.max(0, 1 - (oL - 0.85) / 0.13)
        nA += ca * cs; nB += cb * cs
      }
      nA += wb.ra; nB += wb.rb
      let nL = oL
      // v10 residual secondary curves (kept in sync with bakeDenseFromClusters)
      if (resid) {
        let hh = Math.atan2(nB, nA); if (hh < 0) hh += TAU
        let Cc = Math.hypot(nA, nB)
        const [rdH, rdS, rdL] = sampleResid(resid, hh)
        if (Cc > 0.012) {
          hh += rdH; Cc *= rdS
          if (resid.cq) Cc = sampleCq(resid.cq, Cc)
          nA = Cc * Math.cos(hh); nB = Cc * Math.sin(hh)
        }
        nL += rdL
      }
      const aA = oA + wb.ra, aB = oB + wb.rb
      const C0 = Math.hypot(aA, aB), Cn = Math.hypot(nA, nB)
      if (C0 > 0.015 && Cn > 1e-5) {
        let h0 = Math.atan2(aB, aA); if (h0 < 0) h0 += TAU
        let hn = Math.atan2(nB, nA)
        let Cf = Cn
        const sw = softSkin(oL, oA, oB) * sk.skinW
        if (sw > 0.001) {
          const lSkin = nL + sk.skinL
          let hWanted = hn
          if (sk.skinP === 0 && sk.skinH !== 0) hWanted = hn + angDiff(h0 + sk.skinH, hn) * 0.55
          let dH = angDiff(hWanted, h0)
          const SW_CAP = 0.32
          if (dH >  SW_CAP) dH = SW_CAP + (dH - SW_CAP) * 0.2
          if (dH < -SW_CAP) dH = -SW_CAP + (dH + SW_CAP) * 0.2
          const hSkin = h0 + dH
          const cBand = sk.skinP === 0 ? C0 * sk.skinS : Cf
          let cSkin = Cf + (cBand - Cf) * 0.5
          const cLo = C0 * 0.70, cHi = C0 * 1.08
          if (cSkin < cLo) cSkin = cLo
          if (cSkin > cHi) cSkin = cHi
          hn = hn + angDiff(hSkin, hn) * sw
          Cf = Cf + (cSkin - Cf) * sw
          nL = nL + (lSkin - nL) * sw
        }
        const capW = C0 >= 0.06 ? 1 : C0 <= 0.025 ? 0 : (() => { const t = (C0 - 0.025) / 0.035; return t * t * (3 - 2 * t) })()
        if (capW > 0.05) {
          const lim = HUE_CAP / capW
          const dH = angDiff(hn, h0)
          if (dH >  lim) hn = h0 + lim + (dH - lim) * 0.25
          if (dH < -lim) hn = h0 - lim + (dH + lim) * 0.25
        }
        if (sw < 0.5) { const cFloor = C0 * 0.72; if (Cf < cFloor) Cf = cFloor }
        const Cmax = C0 * 1.85 + 0.045
        if (Cf > Cmax) Cf = Cmax + (Cf - Cmax) * 0.25
        if (Cf > 0.34) Cf = 0.34
        nA = Cf * Math.cos(hn); nB = Cf * Math.sin(hn)
      } else {
        const Cmax = C0 * 1.85 + 0.045
        if (Cn > Cmax) { const k = (Cmax + (Cn - Cmax) * 0.25) / Cn; nA *= k; nB *= k }
      }
      const [lr, lg, lb] = oklabToSrgbGamut(nL, nA, nB)
      look[li] = lr; look[li + 1] = lg; look[li + 2] = lb
    }

    // ── 03 TONE — Smart Tone luminance curve only (colour untouched) ──
    // per-channel clip like film: lifting L of an at-gamut-edge colour must
    // CLIP (stay punchy, matching the integrated LUT), not desaturate
    {
      const nL = tone ? sampleCurve(tone, oL) : oL
      const [tr, tg, tb] = oklabToSrgb(nL, oA, oB)
      toneL[li] = clamp01(tr); toneL[li + 1] = clamp01(tg); toneL[li + 2] = clamp01(tb)
    }
    li += 3
  }
  smoothLut3D(look, N, 0.12)   // cluster warp needs the same anti-banding pass
  return { balance: bal, look, tone: toneL, size: N }
}

// ── v10: finishing measurements — film grain & local contrast (clarity) ─────
// Spatial properties can't be encoded in a LUT, so they're measured here and
// applied as a finishing layer by the photo export / live preview.
// Grain: robust noise σ via median |horizontal 2nd difference| of luma.
function measureGrain(img: ImageData): number {
  const W = img.width, H = img.height, d = img.data
  if (H < 8 || W < 24) return 0
  const vals: number[] = []
  const rows = Math.min(40, H)
  for (let ry = 0; ry < rows; ry++) {
    const y = Math.floor((ry + 0.5) * H / rows)
    const base = y * W * 4
    for (let x = 2; x < W - 2; x += 4) {
      const i = base + x * 4
      const L0 = d[i] * 0.2126 + d[i + 1] * 0.7152 + d[i + 2] * 0.0722
      const Lm = d[i - 4] * 0.2126 + d[i - 3] * 0.7152 + d[i - 2] * 0.0722
      const Lp = d[i + 4] * 0.2126 + d[i + 5] * 0.7152 + d[i + 6] * 0.0722
      vals.push(Math.abs(Lm - 2 * L0 + Lp))
    }
  }
  if (vals.length < 100) return 0
  vals.sort((a, b) => a - b)
  return vals[vals.length >> 1] / 255 / 2.45
}
// Clarity: mean |luma − 3×3 mean| on a ~96px thumbnail = mid-scale local contrast
function measureClarity(img: ImageData): number {
  const W0 = img.width, H0 = img.height, d = img.data
  if (H0 < 12 || W0 < 24) return 0
  const W = 96, H = Math.max(10, Math.round(H0 * W / W0))
  const lum = new Float32Array(W * H)
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const sx = Math.min(W0 - 1, Math.floor((x + 0.5) * W0 / W))
    const sy = Math.min(H0 - 1, Math.floor((y + 0.5) * H0 / H))
    const i = (sy * W0 + sx) * 4
    lum[y * W + x] = (d[i] * 0.2126 + d[i + 1] * 0.7152 + d[i + 2] * 0.0722) / 255
  }
  let sum = 0, n = 0
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    let m = 0
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) m += lum[(y + dy) * W + x + dx]
    sum += Math.abs(lum[y * W + x] - m / 9); n++
  }
  return n ? sum / n : 0
}

// trilinear sample of an RGB-domain dense LUT
function trilinear(d: DenseLut, r: number, g: number, b: number): [number, number, number] {
  const N = d.size, L = d.lut, s = N - 1
  const fr = clamp01(r) * s, fg = clamp01(g) * s, fb = clamp01(b) * s
  const r0 = Math.min(s - 1, fr | 0), g0 = Math.min(s - 1, fg | 0), b0 = Math.min(s - 1, fb | 0)
  const dr = fr - r0, dg = fg - g0, db = fb - b0
  const idx = (ri: number, gi: number, bi: number) => (bi * N * N + gi * N + ri) * 3
  const out: [number, number, number] = [0, 0, 0]
  for (let ch = 0; ch < 3; ch++) {
    const c000 = L[idx(r0,g0,b0)+ch],     c100 = L[idx(r0+1,g0,b0)+ch]
    const c010 = L[idx(r0,g0+1,b0)+ch],   c110 = L[idx(r0+1,g0+1,b0)+ch]
    const c001 = L[idx(r0,g0,b0+1)+ch],   c101 = L[idx(r0+1,g0,b0+1)+ch]
    const c011 = L[idx(r0,g0+1,b0+1)+ch], c111 = L[idx(r0+1,g0+1,b0+1)+ch]
    const c00 = c000+(c100-c000)*dr, c01 = c001+(c101-c001)*dr
    const c10 = c010+(c110-c010)*dr, c11 = c011+(c111-c011)*dr
    const c0 = c00+(c10-c00)*dg,     c1 = c01+(c11-c01)*dg
    out[ch] = c0+(c1-c0)*db
  }
  return out
}

// ── Unified per-pixel transform ───────────────────────────────────────────────
export interface MatchTransform {
  T: ArrayLike<number>
  muF: ArrayLike<number>
  muR: ArrayLike<number>
  curve: Float32Array
  zoneH: ArrayLike<number>     // 24
  zoneS: ArrayLike<number>
  zoneL: ArrayLike<number>
  skinH: number; skinS: number; skinL: number; skinW: number; skinP: number
  dense?: DenseLut             // v5: when present, this IS the transform
}

const HUE_CAP = 1.0472      // ±60° max hue swing per pixel (soft beyond) — real
                            // looks recolor hard (blue sky → teal is ~40-60°), so
                            // the cap only guards against absurd 180° flips

// Core pipeline in Oklab space (shared by per-pixel apply & the refinement pass)
function applyOklab(oL: number, oA: number, oB: number, m: MatchTransform): [number, number, number] {
  const T = m.T
  const dL = oL - (m.muF[0] as number), dA = oA - (m.muF[1] as number), dB = oB - (m.muF[2] as number)
  let nL = (T[0] as number) * dL + (T[1] as number) * dA + (T[2] as number) * dB + (m.muR[0] as number)
  let nA = (T[3] as number) * dL + (T[4] as number) * dA + (T[5] as number) * dB + (m.muR[1] as number)
  let nB = (T[6] as number) * dL + (T[7] as number) * dA + (T[8] as number) * dB + (m.muR[2] as number)
  nL = sampleCurve(m.curve, nL)

  const C0 = Math.hypot(oA, oB)
  const Cn = Math.hypot(nA, nB)

  if (C0 > 0.015 && Cn > 1e-5) {
    let h0 = Math.atan2(oB, oA); if (h0 < 0) h0 += TAU
    // zone-matrix residual, indexed by the POST-GLOBAL state — the residuals
    // were measured there (sample-accurate), so lookup must match
    let hP = Math.atan2(nB, nA); if (hP < 0) hP += TAU
    const f = hP / SEG
    const i0 = Math.min(NB - 1, Math.floor(f)), i1 = (i0 + 1) % NB
    const w1 = f - Math.floor(f), w0 = 1 - w1
    const [z0, z1, z2] = zoneWeights(clamp01(nL))
    let hSh = 0, sRt = 0, lSh = 0
    const zw = [z0, z1, z2]
    for (let z = 0; z < NZ; z++) {
      if (zw[z] < 1e-4) continue
      const a0 = z * NB + i0, a1 = z * NB + i1
      hSh += zw[z] * ((m.zoneH[a0] as number) * w0 + (m.zoneH[a1] as number) * w1)
      sRt += zw[z] * ((m.zoneS[a0] as number) * w0 + (m.zoneS[a1] as number) * w1)
      lSh += zw[z] * ((m.zoneL[a0] as number) * w0 + (m.zoneL[a1] as number) * w1)
    }

    let hn = Math.atan2(nB, nA) + hSh
    let Cf = Cn * sRt

    // skin layer — anchored to the ORIGINAL pixel hue/chroma
    const sw = softSkin(oL, oA, oB) * m.skinW
    if (sw > 0.001) {
      const targetH = h0 + m.skinH
      const targetC = C0 * m.skinS
      hn += angDiff(targetH, hn) * sw
      Cf += (targetC - Cf) * sw
      lSh += (m.skinL - lSh) * sw
    }

    // guard 1: hue swing cap, weighted by original chroma — near-neutral pixels
    // legitimately flip hue under a cast (blue-grey → warm-grey), so the cap
    // only bites where hue is perceptually meaningful (saturated colors)
    const capW = C0 >= 0.06 ? 1 : C0 <= 0.025 ? 0 : (() => { const t = (C0 - 0.025) / 0.035; return t * t * (3 - 2 * t) })()
    if (capW > 0.05) {
      const lim = HUE_CAP / capW
      const dH = angDiff(hn, h0)
      if (dH >  lim) hn = h0 + lim + (dH - lim) * 0.25
      if (dH < -lim) hn = h0 - lim + (dH + lim) * 0.25
    }
    // guard 2: chroma soft-knee limiter (anti-neon)
    const Cmax = C0 * 1.5 + 0.05
    if (Cf > Cmax) Cf = Cmax + (Cf - Cmax) * 0.25
    if (Cf > 0.34) Cf = 0.34

    nA = Cf * Math.cos(hn)
    nB = Cf * Math.sin(hn)
    nL += lSh
  } else {
    const Cmax = C0 * 1.5 + 0.05
    if (Cn > Cmax) { const k = (Cmax + (Cn - Cmax) * 0.25) / Cn; nA *= k; nB *= k }
  }
  return [nL, nA, nB]
}

export function applyTransform(r: number, g: number, b: number, m: MatchTransform, amount: number): [number, number, number] {
  // v5 fast path: trilinear-interpolate the dense PowerGrade LUT (full transport
  // already baked, incl. skin layer + guards). Falls back to the parametric model.
  if (m.dense) {
    const [mr, mg, mb] = trilinear(m.dense, r, g, b)
    return [
      clamp01(r + (mr - r) * amount),
      clamp01(g + (mg - g) * amount),
      clamp01(b + (mb - b) * amount),
    ]
  }
  const [oL, oA, oB] = srgbToOklab(r, g, b)
  const [nL, nA, nB] = applyOklab(oL, oA, oB, m)
  const [mr, mg, mb] = oklabToSrgb(nL, nA, nB)
  return [
    clamp01(r + (mr - r) * amount),
    clamp01(g + (mg - g) * amount),
    clamp01(b + (mb - b) * amount),
  ]
}

// Studio stores the transform as flat node params — rebuild + memoize per object.
// Zone keys (zh*/zs*/zl*) preferred; band keys (bh*/bs*/bl*, e.g. decoded HALEA
// Codes) are broadcast across the 3 zones; missing everything = identity.
const tfCache = new WeakMap<object, MatchTransform>()
export function transformFromParams(p: Record<string, number | string>): MatchTransform {
  let t = tfCache.get(p)
  if (!t) {
    const num = (k: string, d: number) => typeof p[k] === 'number' ? p[k] as number : d
    const zoneH = new Float32Array(NC), zoneS = new Float32Array(NC), zoneL = new Float32Array(NC)
    const hasZones = typeof p.zh0 === 'number'
    for (let c = 0; c < NC; c++) {
      const bi = c % NB
      zoneH[c] = hasZones ? num('zh' + c, 0) : num('bh' + bi, 0)
      zoneS[c] = hasZones ? num('zs' + c, 1) : num('bs' + bi, 1)
      zoneL[c] = hasZones ? num('zl' + c, 0) : num('bl' + bi, 0)
    }
    t = {
      T: [num('m0', 1), num('m1', 0), num('m2', 0), num('m3', 0), num('m4', 1), num('m5', 0), num('m6', 0), num('m7', 0), num('m8', 1)],
      muF: [num('fL', 0), num('fa', 0), num('fb', 0)],
      muR: [num('rL', 0), num('ra', 0), num('rb', 0)],
      curve: typeof p.curve === 'string' ? parseCurve(p.curve) : identCurve(),
      zoneH, zoneS, zoneL,
      skinH: num('skh', 0), skinS: num('sks', 1), skinL: num('skl', 0),
      skinW: num('skw', 0), skinP: num('skp', 0),
      // v5: use the dense LUT when its id resolves in this session (Studio
      // preview/bake); decoded HALEA Codes have no id → parametric fallback
      dense: typeof p.lutId === 'string' ? getDenseLut(p.lutId) : undefined,
    }
    tfCache.set(p, t)
  }
  return t
}

const smCache = new WeakMap<SmartMatchResult, MatchTransform>()
export function applyMatch(r: number, g: number, b: number, m: SmartMatchResult, amount: number): [number, number, number] {
  let t = smCache.get(m)
  if (!t) {
    t = {
      T: m.matrix, muF: m.muF, muR: m.muR, curve: m.curve,
      zoneH: m.zoneH, zoneS: m.zoneS, zoneL: m.zoneL,
      skinH: m.skinH, skinS: m.skinS, skinL: m.skinL, skinW: m.skinW, skinP: m.skinP,
      dense: getDenseLut(m.lutId),
    }
    smCache.set(m, t)
  }
  return applyTransform(r, g, b, t, amount)
}

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

  // Layer 1: MKL global matrix (conservative — zones do the color-specific work)
  const Af = shrinkCov(F.cov)
  const Ar = shrinkCov(R.cov)
  const Af12  = matFn3(Af, Math.sqrt)
  const AfM12 = matFn3(Af, v => 1 / Math.sqrt(v))
  const mid   = matFn3(matMul3(matMul3(Af12, Ar), Af12), Math.sqrt)
  let T = matMul3(matMul3(AfM12, mid), AfM12)
  {
    const { vals, V } = jacobiEigen3(T)
    T = eigenRebuild(vals.map(v => clampN(v, 0.4, 2.2)), V)
  }

  // Layer 2: tone curve (QQ matching on post-matrix L)
  const histPost = new Float32Array(256)
  const s = F.samples
  for (let i = 0; i < s.length; i += 3) {
    const dL = s[i] - muF[0], dA = s[i + 1] - muF[1], dB = s[i + 2] - muF[2]
    const Lp = T[0] * dL + T[1] * dA + T[2] * dB + muR[0]
    histPost[Math.min(255, Math.max(0, Math.round(clamp01(Lp) * 255)))]++
  }
  const cdfF = buildCdf(histPost)
  const cdfRef = buildCdf(R.histL)

  const P = 64
  const qx: number[] = [], qy: number[] = []
  for (let j = 0; j <= P; j++) {
    const p = 0.005 + 0.99 * j / P
    qx.push(invCdf(cdfF, p))
    qy.push(invCdf(cdfRef, p))
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
  const dxk = 1 / (K - 1), minD = 0.25 * dxk, maxD = 4 * dxk
  curve[0] = clampN(curve[0], 0, 0.15)
  for (let k = 1; k < K; k++) curve[k] = clampN(curve[k], curve[k - 1] + minD, curve[k - 1] + maxD)
  for (let k = 0; k < K; k++) curve[k] = clamp01(curve[k])

  const transformPoint = (L: number, A: number, B: number): [number, number, number] => {
    const dL = L - muF[0], dA = A - muF[1], dB = B - muF[2]
    const nL = T[0] * dL + T[1] * dA + T[2] * dB + muR[0]
    const nA = T[3] * dL + T[4] * dA + T[5] * dB + muR[1]
    const nB = T[6] * dL + T[7] * dA + T[8] * dB + muR[2]
    return [sampleCurve(curve, nL), nA, nB]
  }

  // ── Layer 3: zone matrix residuals (24 cells, hue-band fallback) ──
  const minBF = Math.max(60, F.count * 0.004)
  const minBR = Math.max(60, R.count * 0.004)
  const minCF = Math.max(40, F.count * 0.0025)
  const minCR = Math.max(40, R.count * 0.0025)

  // Adjacency matching: a look may shift a hue across a band boundary
  // (green → yellow-green). If the same-index reference cell is sparse,
  // search the ±1 neighbouring hue bands and take the angularly closest.
  type CellMean = { n: number; L: number; C: number; h: number }
  const findRef = (get: (idx: number) => CellMean, bi: number, minN: number, hpGuess: number): CellMean | null => {
    let best: CellMean | null = null, bestD = Infinity
    for (const off of [0, -1, 1]) {
      const cand = get((bi + off + NB) % NB)
      if (cand.n < minN) continue
      const d = Math.abs(angDiff(cand.h, hpGuess)) + (off === 0 ? 0 : 0.08)  // prefer same band
      if (d < bestD) { bestD = d; best = cand }
    }
    return best
  }

  // Sample-accurate post-global statistics: push every footage sample through
  // matrix+curve and bin the RESULT. Mean-point transforms suffer a Jensen gap
  // (transform of the mean ≠ mean of the transform) that seeded phantom
  // corrections — measuring the actual distribution removes it.
  const post1 = new CellStats()
  for (let i = 0; i < s.length; i += 3) {
    const oL = s[i], oA = s[i + 1], oB = s[i + 2]
    if (softSkin(oL, oA, oB) > 0.5) continue            // skin is handled by its own layer
    const [pL, pA, pB] = transformPoint(oL, oA, oB)
    const C = Math.hypot(pA, pB)
    if (C <= 0.025 || pL <= 0.02 || pL >= 0.98) continue
    let h = Math.atan2(pB, pA); if (h < 0) h += TAU
    post1.add(clamp01(pL), C, h)
  }

  // band-level residuals (fallback + HALEA Code transport)
  const bandH = new Float32Array(NB)
  const bandS = new Float32Array(NB); bandS.fill(1)
  const bandL = new Float32Array(NB)
  for (let i = 0; i < NB; i++) {
    const fb = post1.band(i)
    if (fb.n < minBF) continue
    const rb = findRef(idx => R.cells.band(idx), i, minBR, fb.h)
    if (!rb) continue
    const conf = Math.min(1, fb.n / (minBF * 3), rb.n / (minBR * 3))
    bandH[i] = clampN(angDiff(rb.h, fb.h), -0.436, 0.436) * conf
    bandS[i] = 1 + (clampN(rb.C / Math.max(fb.C, 1e-3), 0.7, 1.45) - 1) * conf
    bandL[i] = clampN(rb.L - fb.L, -0.08, 0.08) * conf
  }

  // cell-level: where data supports it, refine beyond the band aggregate
  const zoneH = new Float32Array(NC)
  const zoneS = new Float32Array(NC)
  const zoneL = new Float32Array(NC)
  for (let c = 0; c < NC; c++) {
    const bi = c % NB, zi = Math.floor(c / NB)
    zoneH[c] = bandH[bi]; zoneS[c] = bandS[bi]; zoneL[c] = bandL[bi]
    const fc = post1.cell(c)
    if (fc.n < minCF) continue
    const rc = findRef(idx => R.cells.cell(zi * NB + idx), bi, minCR, fc.h)
    if (!rc) continue
    const conf = Math.min(1, fc.n / (minCF * 3), rc.n / (minCR * 3))
    const cH = clampN(angDiff(rc.h, fc.h), -0.436, 0.436)
    const cS = clampN(rc.C / Math.max(fc.C, 1e-3), 0.7, 1.45)
    const cL = clampN(rc.L - fc.L, -0.08, 0.08)
    zoneH[c] = bandH[bi] + (cH - bandH[bi]) * conf
    zoneS[c] = bandS[bi] + (cS - bandS[bi]) * conf
    zoneL[c] = bandL[bi] + (cL - bandL[bi]) * conf
  }

  // ── Layer 4: skin-to-skin (anchored to original; protect when ref lacks skin)
  let skinH = 0, skinS = 1, skinL = 0, skinW = 0, skinP = 0
  const skinFracF = F.skinN / Math.max(1, F.count)
  const skinFracR = R.skinN / Math.max(1, R.count)
  if (skinFracF >= 0.005) {
    skinW = 1
    if (skinFracR >= 0.01) {
      const CF = Math.hypot(F.skinMu[1], F.skinMu[2]), hF = Math.atan2(F.skinMu[2], F.skinMu[1])
      const CR = Math.hypot(R.skinMu[1], R.skinMu[2]), hR = Math.atan2(R.skinMu[2], R.skinMu[1])
      skinH = clampN(angDiff(hR, hF), -0.26, 0.26)
      skinS = clampN(CR / Math.max(CF, 1e-3), 0.8, 1.3)
      const [Lsp] = transformPoint(F.skinMu[0], F.skinMu[1], F.skinMu[2])
      skinL = clampN(R.skinMu[0] - Lsp, -0.06, 0.06)
    } else {
      skinP = 1
    }
  }

  function mkTransform(): MatchTransform {
    return { T, muF, muR, curve, zoneH, zoneS, zoneL, skinH, skinS, skinL, skinW, skinP }
  }

  // ── Pass 2: iterative refinement — measure the result, fold the remaining
  //   error back into the zone matrix (damped, skin pixels excluded)
  {
    const t1 = mkTransform()
    const resCells = new CellStats()
    for (let i = 0; i < s.length; i += 3) {
      const oL = s[i], oA = s[i + 1], oB = s[i + 2]
      if (softSkin(oL, oA, oB) > 0.5) continue           // skin is pinned — don't bias bands
      const [nL, nA, nB] = applyOklab(oL, oA, oB, t1)
      const C = Math.hypot(nA, nB)
      if (C <= 0.025 || nL <= 0.02 || nL >= 0.98) continue
      let h = Math.atan2(nB, nA); if (h < 0) h += TAU
      resCells.add(clamp01(nL), C, h)
    }
    const DAMP = 0.7
    for (let c = 0; c < NC; c++) {
      const bi = c % NB, zi = Math.floor(c / NB)
      const rc2 = resCells.cell(c)
      if (rc2.n < minCF) continue
      const rr = findRef(idx => R.cells.cell(zi * NB + idx), bi, minCR, rc2.h)
      if (!rr) continue
      const conf = Math.min(1, rc2.n / (minCF * 3), rr.n / (minCR * 3)) * DAMP
      zoneH[c] = clampN(zoneH[c] + angDiff(rr.h, rc2.h) * conf, -0.55, 0.55)
      zoneS[c] = clampN(zoneS[c] * (1 + (clampN(rr.C / Math.max(rc2.C, 1e-3), 0.75, 1.35) - 1) * conf), 0.6, 1.7)
      zoneL[c] = clampN(zoneL[c] + (rr.L - rc2.L) * conf, -0.11, 0.11)
    }
    // refine band aggregates the same way (keeps HALEA Code transport in sync)
    for (let i = 0; i < NB; i++) {
      const rb2 = resCells.band(i)
      if (rb2.n < minBF) continue
      const rr = findRef(idx => R.cells.band(idx), i, minBR, rb2.h)
      if (!rr) continue
      const conf = Math.min(1, rb2.n / (minBF * 3), rr.n / (minBR * 3)) * DAMP
      bandH[i] = clampN(bandH[i] + angDiff(rr.h, rb2.h) * conf, -0.55, 0.55)
      bandS[i] = clampN(bandS[i] * (1 + (clampN(rr.C / Math.max(rb2.C, 1e-3), 0.75, 1.35) - 1) * conf), 0.6, 1.7)
      bandL[i] = clampN(bandL[i] + (rr.L - rb2.L) * conf, -0.11, 0.11)
    }
  }

  // ══ v5 PowerGrade: full-distribution transport → dense 3D LUT ══
  // Solve IDT on the non-skin clouds, then replay the chain over an RGB lattice,
  // folding in the skin layer + perceptual guards, to bake a high-fidelity LUT.
  let lutId: string | undefined
  let lutSize: number | undefined
  let denseLut: DenseLut | undefined
  {
    const footCloud: number[] = [], refCloud: number[] = []
    for (let i = 0; i < s.length; i += 3) {
      if (softSkin(s[i], s[i + 1], s[i + 2]) > 0.5) continue
      footCloud.push(s[i], s[i + 1], s[i + 2])
    }
    const rs = R.samples
    for (let i = 0; i < rs.length; i += 3) {
      if (softSkin(rs[i], rs[i + 1], rs[i + 2]) > 0.5) continue
      refCloud.push(rs[i], rs[i + 1], rs[i + 2])
    }
    // v8: content-aware color via cluster correspondence (palette matching) +
    // Smart Tone Engine for luminance. Like regions map to like regions, so
    // clouds stay neutral instead of being recolored into blue sky.
    // v9: estimate & strip each side's illuminant cast, match on BALANCED
    // content (balance first, look second — the colorist workflow)
    const [fwa, fwb] = estimateNeutralCast(footCloud)
    let [rwa, rwb] = estimateNeutralCast(refCloud)
    {
      // deadband: two estimates of the SAME illuminant differ by sampling noise —
      // snap them together so identical foot/ref stays a true no-op (net tint 0)
      const da = rwa - fwa, db = rwb - fwb, dm = Math.hypot(da, db)
      const t = dm <= 0.006 ? 0 : dm >= 0.012 ? 1 : (dm - 0.006) / 0.006
      rwa = fwa + da * t; rwb = fwb + db * t
    }
    const balFoot = footCloud.slice(), balRef = refCloud.slice()
    for (let i = 0; i < balFoot.length; i += 3) { balFoot[i + 1] -= fwa; balFoot[i + 2] -= fwb }
    for (let i = 0; i < balRef.length; i += 3) { balRef[i + 1] -= rwa; balRef[i + 2] -= rwb }
    const cmap = buildClusterMap(balFoot, balRef)
    if (cmap) {
      const N = 33                          // transport grid; Precision export upsamples to 65³
      const skin: SkinLayer = { skinW, skinH, skinS, skinL, skinP }
      const tone = buildSmartTone(F.histL, R.histL)   // filmic landmark tone
      const cast = buildToneCast(balFoot, balRef) || undefined  // split-tone cast (balanced)
      const wbPair: WBPair = { fa: fwa, fb: fwb, ra: rwa, rb: rwb }
      // v10 two-pass: bake, then MEASURE what's still off vs the reference and
      // dial in secondary curves — the second look a colorist gives their grade
      const lut1 = bakeDenseFromClusters(cmap, skin, N, tone, cast, wbPair)
      const resid = measureResidual(footCloud, refCloud, lut1, N) || undefined
      const lut = resid ? bakeDenseFromClusters(cmap, skin, N, tone, cast, wbPair, resid) : lut1
      denseLut = { lut, size: N }
      lutSize = N
      lutId = registerDenseLut(lut, N)
      // stage data for the PowerGrade Node Kit (per-node LUT export)
      registerStages(lutId, { cmap, cast, tone, wb: wbPair, skin, resid })
    }
  }

  // dense-LUT-aware apply for honest measurement (RGB-domain LUT, oklab in/out)
  const applyMeasure = (oL: number, oA: number, oB: number): [number, number, number] => {
    if (denseLut) {
      const [sr, sg, sb] = oklabToSrgb(oL, oA, oB)
      const [mr, mg, mb] = trilinear(denseLut, sr, sg, sb)
      return srgbToOklab(mr, mg, mb)
    }
    return applyOklab(oL, oA, oB, mkTransform())
  }

  // ── Confidence report: score the final result against the reference ──
  let confidence = 99
  const notes: string[] = []
  {
    const histRes = new Float32Array(256)
    const resCells = new CellStats()
    for (let i = 0; i < s.length; i += 3) {
      const isSkin = softSkin(s[i], s[i + 1], s[i + 2]) > 0.5
      const [nL, nA, nB] = applyMeasure(s[i], s[i + 1], s[i + 2])
      const Lc = clamp01(nL)
      histRes[Math.min(255, Math.round(Lc * 255))]++
      const C = Math.hypot(nA, nB)
      if (C > 0.025 && Lc > 0.02 && Lc < 0.98 && !isSkin) {
        let h = Math.atan2(nB, nA); if (h < 0) h += TAU
        resCells.add(Lc, C, h)
      }
    }
    // tone agreement: mean |CDF_result − CDF_ref|
    const cdfRes = buildCdf(histRes)
    let emd = 0
    for (let i = 0; i < 256; i++) emd += Math.abs(cdfRes[i] - cdfRef[i])
    emd /= 256

    // color agreement + coverage, weighted by reference band mass
    let massBoth = 0, errSum = 0, massRef = 0, massUncov = 0
    let worstUncov = -1, worstUncovMass = 0
    for (let i = 0; i < NB; i++) {
      const rb = R.cells.band(i)
      if (rb.n < minBR) continue
      massRef += rb.n
      const res = resCells.band(i)
      if (res.n < minBF * 0.5) {
        massUncov += rb.n
        if (rb.n > worstUncovMass) { worstUncovMass = rb.n; worstUncov = i }
        continue
      }
      massBoth += rb.n
      const hueErr = Math.min(1, Math.abs(angDiff(res.h, rb.h)) / 0.35)
      const chrErr = Math.min(1, Math.abs(res.C - rb.C) / 0.08)
      errSum += rb.n * (hueErr * 0.6 + chrErr * 0.4)
    }
    const colorErr = massBoth ? errSum / massBoth : 0
    const uncovered = massRef ? massUncov / massRef : 0

    // v8: the content-aware engine intentionally PRESERVES footage content
    // (clouds stay clouds) rather than forcing the full reference distribution,
    // so the old coverage penalties are softened — they were calibrated for raw
    // distribution transfer and unfairly floored an otherwise-good match.
    confidence = Math.round(100 * (1 - 1.35 * emd - 0.28 * colorErr - 0.22 * uncovered))
    confidence = Math.max(45, Math.min(99, confidence))

    if (uncovered >= 0.25 && worstUncov >= 0) {
      notes.push(`Referensi punya warna ${BAND_NAMES[worstUncov]} dominan yang tidak ada di footage — bagian look itu dilewati`)
    }
    if (denseLut) notes.push('Content-aware aktif — region dicocokkan per konten (langit↔langit, kulit dijaga)')
    if (skinP === 1) notes.push('Referensi tanpa skin tone — warna kulit footage diproteksi otomatis')
    else if (skinW === 1 && skinFracR >= 0.01) notes.push('Skin tone di-match langsung ke skin referensi')
    if (confidence < 72) notes.push('Konten cukup berbeda — coba Match Strength 60–70% untuk hasil lebih natural')
    else if (confidence >= 90 && uncovered < 0.1) notes.push('Footage & referensi sangat cocok — full strength aman')
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
    zoneH, zoneS, zoneL,
    bandH, bandS, bandL,
    skinH, skinS, skinL, skinW, skinP,
    confidence, notes,
    halation: clampN(R.highFrac * 1.5, 0, 0.32),
    satRatio,
    derived,
    shadowCast, highCast,
    toneDesc: parts.join(' · ') || 'Balanced tone',
    lutId, lutSize,
    grain: clampN(measureGrain(ref) - measureGrain(foot), 0, 0.06),
    clarity: (() => { const cF = measureClarity(foot), cR = measureClarity(ref); return cF > 0.004 && cR > 0.004 ? clampN(cR / cF, 0.85, 1.3) : 1 })(),
  }
}
