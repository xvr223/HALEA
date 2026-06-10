// HALEA Smart Match Engine — true color transfer, full client-side.
// Layer 1: MKL (Monge-Kantorovich Linear) statistical transfer in Oklab
// Layer 2: tone curve via CDF matching on L (residual after the linear map)
// Refs: Reinhard et al. 2001, Pitié & Kokaram 2007.

export interface SmartMatchResult {
  matrix: number[]                      // 3×3 row-major, Oklab → Oklab
  muF: [number, number, number]         // footage mean (L,a,b)
  muR: [number, number, number]         // reference mean (L,a,b)
  curve: Float32Array                   // 64 knots, post-matrix L → target L
  halation: number
  satRatio: number
  derived: { temp: number; tint: number; gamma: number; con: number; sat: number }
  shadowCast: string
  highCast: string
  toneDesc: string
}

const clamp01 = (v: number) => v < 0 ? 0 : v > 1 ? 1 : v
const clampN  = (v: number, lo: number, hi: number) => v < lo ? lo : v > hi ? hi : v

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

// ── Tone curve helpers (memoized parse — applyNodes calls this per pixel) ─────
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

// Cyclic Jacobi eigendecomposition for symmetric 3×3
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

// M = V·diag(vals)·Vᵀ
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

// Σ' = 0.85·Σ + 0.15·diag(Σ) + εI  — shrinkage keeps T tame & invertible
function shrinkCov(C: number[]): number[] {
  const out = C.slice()
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) if (i !== j) out[i * 3 + j] *= 0.85
  out[0] += 1e-6; out[4] += 1e-6; out[8] += 1e-6
  return out
}

// ── Image statistics ──────────────────────────────────────────────────────────
interface ImgStats {
  samples: Float32Array
  mu: [number, number, number]
  cov: number[]
  sdL: number
  chroma: number
  highFrac: number
  shadowAB: [number, number]
  highAB: [number, number]
  histL: Float32Array
}

function collectStats(img: ImageData): ImgStats {
  const { data } = img
  const px = data.length / 4
  const step = Math.max(1, Math.floor(px / 120000)) * 4
  const out: number[] = []
  let n = 0, sL = 0, sA = 0, sB = 0, chroma = 0, high = 0, total = 0
  let shN = 0, shA = 0, shB = 0, hiN = 0, hiA = 0, hiB = 0
  const hist = new Float32Array(256)

  for (let i = 0; i < data.length; i += step) {
    const [L, A, B] = srgbToOklab(data[i] / 255, data[i + 1] / 255, data[i + 2] / 255)
    out.push(L, A, B)
    total++
    hist[Math.min(255, Math.max(0, Math.round(L * 255)))]++
    if (L > 0.75) high++
    if (L > 0.02 && L < 0.98) {            // skip clipped pixels in stats
      n++; sL += L; sA += A; sB += B
      chroma += Math.hypot(A, B)
      if (L < 0.35) { shN++; shA += A; shB += B }
      else if (L > 0.65) { hiN++; hiA += A; hiB += B }
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
    samples: new Float32Array(out), mu, cov,
    sdL: Math.sqrt(cov[0]),
    chroma: chroma / n,
    highFrac: total ? high / total : 0,
    shadowAB: [shN ? shA / shN : 0, shN ? shB / shN : 0],
    highAB:   [hiN ? hiA / hiN : 0, hiN ? hiB / hiN : 0],
    histL: hist,
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
    // clamp eigenvalues — prevents extreme channel swings, still allows B&W refs
    const { vals, V } = jacobiEigen3(T)
    T = eigenRebuild(vals.map(v => clampN(v, 0.2, 3.0)), V)
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

  // QQ construction: pair same-percentile L values of both distributions.
  // CDF lookup alone breaks outside the data range (saturates to 0/1) —
  // other video frames can hit those L values, so extrapolate linearly instead.
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
  // smooth ×2 ([0.25, 0.5, 0.25] kernel)
  for (let pass = 0; pass < 2; pass++) {
    const sm = new Float32Array(K)
    for (let k = 0; k < K; k++) {
      sm[k] = curve[Math.max(0, k - 1)] * 0.25 + curve[k] * 0.5 + curve[Math.min(K - 1, k + 1)] * 0.25
    }
    curve = sm
  }
  // monotonic + slope clamp [0.25, 4]; black lift capped at 0.15 (faded look allowed)
  const dx = 1 / (K - 1), minD = 0.25 * dx, maxD = 4 * dx
  curve[0] = clampN(curve[0], 0, 0.15)
  for (let k = 1; k < K; k++) curve[k] = clampN(curve[k], curve[k - 1] + minD, curve[k - 1] + maxD)
  for (let k = 0; k < K; k++) curve[k] = clamp01(curve[k])

  // Derived classic params (for .xmp export + stats display)
  const satRatio = F.chroma > 1e-4 ? R.chroma / F.chroma : 1
  const derived = {
    temp:  clampN((muR[2] - muF[2]) * 3.5, -0.4, 0.4),
    tint:  clampN((muR[1] - muF[1]) * 3.5, -0.3, 0.3),
    gamma: clampN((muR[0] - muF[0]) * 1.2, -0.3, 0.3),
    con:   clampN((F.sdL > 1e-4 ? R.sdL / F.sdL - 1 : 0) * 0.8, -0.3, 0.3),
    sat:   clampN((satRatio - 1) * 0.6, -0.4, 0.4),
  }

  // Description bits
  const shadowCast = castName(R.shadowAB[0] - F.shadowAB[0], R.shadowAB[1] - F.shadowAB[1])
  const highCast   = castName(R.highAB[0]   - F.highAB[0],   R.highAB[1]   - F.highAB[1])
  const parts: string[] = []
  if (curve[0] > 0.035) parts.push('Lifted blacks')
  if (curve[K - 1] < 0.965) parts.push('Soft highlights')
  const midSlope = (sampleCurve(curve, 0.55) - sampleCurve(curve, 0.45)) / 0.1
  if (midSlope > 1.18) parts.push('Punchy mids')
  else if (midSlope < 0.85) parts.push('Flat mids')

  return {
    matrix: T,
    muF, muR, curve,
    halation: clampN(R.highFrac * 1.5, 0, 0.32),
    satRatio,
    derived,
    shadowCast, highCast,
    toneDesc: parts.join(' · ') || 'Balanced tone',
  }
}
