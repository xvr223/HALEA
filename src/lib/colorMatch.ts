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
export function softSkin(L: number, A: number, B: number): number {
  const C = Math.hypot(A, B)
  if (C < 0.02) return 0
  let h = Math.atan2(B, A) * 180 / Math.PI
  if (h < 0) h += 360
  return smoothRange(h, 10, 25, 65, 82)
       * smoothRange(C, 0.025, 0.05, 0.15, 0.21)
       * smoothRange(L, 0.18, 0.30, 0.85, 0.95)
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
// IDT — Iterative Distribution Transfer (Sliced-Wasserstein optimal transport).
// MKL only matches the first two moments (mean + covariance). IDT matches the
// ENTIRE color distribution: repeatedly project both clouds onto random 3D axes,
// solve the exact 1D optimal transport per axis (quantile remap), and move the
// footage cloud. Converges to the true N-D transport map (Pitié-Kokaram-Dahyot
// 2007). The whole iteration sequence is a deterministic, replayable function —
// so we replay it over an RGB lattice to bake a dense 3D LUT.
// ══════════════════════════════════════════════════════════════════════════════

const IDT_ITERS = 24
const IDT_KNOTS = 28
const IDT_MAXN  = 7000          // subsample cap per cloud
const IDT_SEED  = 0x9e3779b1    // fixed → deterministic results

interface IDT1DMap { dom: Float32Array; out: Float32Array }       // foot-quantile → ref-quantile knots
interface IDTStep  { rot: number[]; maps: IDT1DMap[] }            // rot = 3 rows (axes), 3 maps

// seeded gaussian via Box-Muller on mulberry32
function makeRng(seed: number) {
  let s = seed >>> 0
  return () => {
    s += 0x6D2B79F5
    let t = Math.imul(s ^ (s >>> 15), s | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
function randomRotation(rng: () => number): number[] {
  // 3 gaussian columns → Gram-Schmidt → orthonormal basis (uniform on SO(3))
  const g = () => { const u = Math.max(1e-9, rng()), v = rng(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * v) }
  const col = [[g(), g(), g()], [g(), g(), g()], [g(), g(), g()]]
  const dot = (a: number[], b: number[]) => a[0]*b[0]+a[1]*b[1]+a[2]*b[2]
  const norm = (a: number[]) => { const n = Math.hypot(a[0],a[1],a[2]) || 1; return [a[0]/n,a[1]/n,a[2]/n] }
  let c0 = norm(col[0])
  let c1 = [col[1][0]-dot(col[1],c0)*c0[0], col[1][1]-dot(col[1],c0)*c0[1], col[1][2]-dot(col[1],c0)*c0[2]]
  c1 = norm(c1)
  // c2 = c0 × c1
  const c2 = [c0[1]*c1[2]-c0[2]*c1[1], c0[2]*c1[0]-c0[0]*c1[2], c0[0]*c1[1]-c0[1]*c1[0]]
  return [c0[0],c0[1],c0[2], c1[0],c1[1],c1[2], c2[0],c2[1],c2[2]]   // row-major, rows = axes
}

// Exact 1D optimal transport: map foot's p-th percentile → ref's p-th
// percentile. Domain knots = foot quantiles, range knots = ref quantiles, so an
// identical pair gives the identity map. Monotone by construction.
function build1DMap(fv: Float32Array, rv: Float32Array): IDT1DMap {
  const fs = Float32Array.from(fv).sort()
  const rs = Float32Array.from(rv).sort()
  const q = (arr: Float32Array, t: number) => {
    const x = t * (arr.length - 1), i = x | 0
    return i >= arr.length - 1 ? arr[arr.length - 1] : arr[i] + (arr[i + 1] - arr[i]) * (x - i)
  }
  const dom = new Float32Array(IDT_KNOTS + 1)
  const out = new Float32Array(IDT_KNOTS + 1)
  for (let k = 0; k <= IDT_KNOTS; k++) { const p = k / IDT_KNOTS; dom[k] = q(fs, p); out[k] = q(rs, p) }
  // ensure strictly increasing domain for safe interpolation
  for (let k = 1; k <= IDT_KNOTS; k++) if (dom[k] <= dom[k - 1]) dom[k] = dom[k - 1] + 1e-6
  // light smoothing of the displacement keeps the map kink-free (regularization)
  const disp = new Float32Array(IDT_KNOTS + 1)
  for (let k = 0; k <= IDT_KNOTS; k++) disp[k] = out[k] - dom[k]
  for (let k = 1; k < IDT_KNOTS; k++) disp[k] = disp[k - 1] * 0.18 + disp[k] * 0.64 + disp[k + 1] * 0.18
  for (let k = 0; k <= IDT_KNOTS; k++) out[k] = dom[k] + disp[k]
  return { dom, out }
}
function apply1DMap(m: IDT1DMap, x: number): number {
  const dom = m.dom, out = m.out, n = IDT_KNOTS
  if (x <= dom[0])  return out[0] + (x - dom[0])                       // linear extrapolation
  if (x >= dom[n])  return out[n] + (x - dom[n])
  let lo = 0, hi = n
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (dom[mid] <= x) lo = mid; else hi = mid }
  const t = (x - dom[lo]) / (dom[hi] - dom[lo])
  return out[lo] + (out[hi] - out[lo]) * t
}

// solve the IDT chain that morphs the foot cloud into the ref distribution
function solveIDT(footCloud: number[], refCloud: number[]): IDTStep[] {
  const sub = (cloud: number[]): Float32Array => {
    const n = cloud.length / 3
    if (n <= IDT_MAXN) return Float32Array.from(cloud)
    const out = new Float32Array(IDT_MAXN * 3)
    const stride = n / IDT_MAXN
    for (let i = 0; i < IDT_MAXN; i++) {
      const si = (Math.floor(i * stride)) * 3
      out[i*3] = cloud[si]; out[i*3+1] = cloud[si+1]; out[i*3+2] = cloud[si+2]
    }
    return out
  }
  const F = sub(footCloud), R = sub(refCloud)
  const nf = F.length / 3, nr = R.length / 3
  if (nf < 40 || nr < 40) return []
  const rng = makeRng(IDT_SEED)
  const steps: IDTStep[] = []
  const fp0 = new Float32Array(nf), fp1 = new Float32Array(nf), fp2 = new Float32Array(nf)
  const rp0 = new Float32Array(nr), rp1 = new Float32Array(nr), rp2 = new Float32Array(nr)

  for (let it = 0; it < IDT_ITERS; it++) {
    const rot = it === 0
      ? [1,0,0, 0,1,0, 0,0,1]              // first pass along native L,a,b axes
      : randomRotation(rng)
    for (let i = 0; i < nf; i++) {
      const x = F[i*3], y = F[i*3+1], z = F[i*3+2]
      fp0[i] = rot[0]*x+rot[1]*y+rot[2]*z
      fp1[i] = rot[3]*x+rot[4]*y+rot[5]*z
      fp2[i] = rot[6]*x+rot[7]*y+rot[8]*z
    }
    for (let i = 0; i < nr; i++) {
      const x = R[i*3], y = R[i*3+1], z = R[i*3+2]
      rp0[i] = rot[0]*x+rot[1]*y+rot[2]*z
      rp1[i] = rot[3]*x+rot[4]*y+rot[5]*z
      rp2[i] = rot[6]*x+rot[7]*y+rot[8]*z
    }
    const m0 = build1DMap(fp0, rp0), m1 = build1DMap(fp1, rp1), m2 = build1DMap(fp2, rp2)
    steps.push({ rot, maps: [m0, m1, m2] })
    // move foot cloud: p += Σ_k (map_k(proj_k) − proj_k) · axis_k  (rows of rot)
    for (let i = 0; i < nf; i++) {
      const d0 = apply1DMap(m0, fp0[i]) - fp0[i]
      const d1 = apply1DMap(m1, fp1[i]) - fp1[i]
      const d2 = apply1DMap(m2, fp2[i]) - fp2[i]
      F[i*3]   += d0*rot[0] + d1*rot[3] + d2*rot[6]
      F[i*3+1] += d0*rot[1] + d1*rot[4] + d2*rot[7]
      F[i*3+2] += d0*rot[2] + d1*rot[5] + d2*rot[8]
    }
  }
  return steps
}

// replay the chain on one Oklab point
function replayIDT(steps: IDTStep[], L: number, A: number, B: number): [number, number, number] {
  let x = L, y = A, z = B
  for (let it = 0; it < steps.length; it++) {
    const { rot, maps } = steps[it]
    const p0 = rot[0]*x+rot[1]*y+rot[2]*z
    const p1 = rot[3]*x+rot[4]*y+rot[5]*z
    const p2 = rot[6]*x+rot[7]*y+rot[8]*z
    const d0 = apply1DMap(maps[0], p0) - p0
    const d1 = apply1DMap(maps[1], p1) - p1
    const d2 = apply1DMap(maps[2], p2) - p2
    x += d0*rot[0] + d1*rot[3] + d2*rot[6]
    y += d0*rot[1] + d1*rot[4] + d2*rot[7]
    z += d0*rot[2] + d1*rot[5] + d2*rot[8]
  }
  return [x, y, z]
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

const HUE_CAP = 0.5236      // ±30° max hue swing per pixel (soft beyond)

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
    const steps = solveIDT(footCloud, refCloud)
    if (steps.length) {
      const N = 33
      const lut = new Float32Array(N * N * N * 3)
      let li = 0
      for (let bi = 0; bi < N; bi++) for (let gi = 0; gi < N; gi++) for (let ri = 0; ri < N; ri++) {
        const r0 = ri / (N - 1), g0 = gi / (N - 1), b0 = bi / (N - 1)
        const [oL, oA, oB] = srgbToOklab(r0, g0, b0)
        let [nL, nA, nB] = replayIDT(steps, oL, oA, oB)
        const C0 = Math.hypot(oA, oB), Cn = Math.hypot(nA, nB)
        if (C0 > 0.015 && Cn > 1e-5) {
          let h0 = Math.atan2(oB, oA); if (h0 < 0) h0 += TAU
          let hn = Math.atan2(nB, nA)
          let Cf = Cn
          // skin layer — anchor skin pixels to original hue/chroma (+ offsets);
          // in protect mode skinH=0/skinS=1 so it pulls straight back to original
          const sw = softSkin(oL, oA, oB) * skinW
          if (sw > 0.001) {
            const targetH = h0 + skinH, targetC = C0 * skinS
            hn += angDiff(targetH, hn) * sw
            Cf += (targetC - Cf) * sw
            nL += (oL + skinL - nL) * sw * 0.6
          }
          // guard 1: hue swing cap weighted by chroma (near-neutrals may flip)
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
          nA = Cf * Math.cos(hn); nB = Cf * Math.sin(hn)
        } else {
          const Cmax = C0 * 1.5 + 0.05
          if (Cn > Cmax) { const k = (Cmax + (Cn - Cmax) * 0.25) / Cn; nA *= k; nB *= k }
        }
        const [mr, mg, mb] = oklabToSrgb(nL, nA, nB)
        lut[li++] = clamp01(mr); lut[li++] = clamp01(mg); lut[li++] = clamp01(mb)
      }
      denseLut = { lut, size: N }
      lutSize = N
      lutId = registerDenseLut(lut, N)
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

    confidence = Math.round(100 * (1 - 1.6 * emd - 0.45 * colorErr - 0.4 * uncovered))
    confidence = Math.max(40, Math.min(99, confidence))

    if (uncovered >= 0.18 && worstUncov >= 0) {
      notes.push(`Referensi punya warna ${BAND_NAMES[worstUncov]} dominan yang tidak ada di footage — bagian look itu dilewati`)
    }
    if (denseLut) notes.push('PowerGrade aktif — seluruh distribusi warna dicocokkan (bukan cuma rata-rata)')
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
  }
}
