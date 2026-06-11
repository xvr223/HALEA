// HALEA Log Support — exact camera log transfer functions, client-side.
// Pipeline: encoded log → scene linear (official math) → auto exposure →
// filmic highlight rolloff → sRGB display. Composed into a memoized 1D LUT
// so the per-pixel hot path is just 3 table lookups.
//
// Gamut note: we convert tone exactly; remaining gamut/saturation differences
// are absorbed adaptively by the Smart Match MKL stage that follows.

export type LogProfile =
  | 'rec709' | 'slog3' | 'vlog' | 'dlog' | 'applelog'
  | 'flog' | 'flog2' | 'clog3' | 'hlg'

export const LOG_PROFILES: { id: LogProfile; label: string; cams: string; pedestal: number }[] = [
  { id: 'rec709',   label: 'Rec.709 / Normal', cams: 'Footage standar (non-log)', pedestal: 0 },
  { id: 'slog3',    label: 'S-Log3',           cams: 'Sony Alpha · FX · ZV',      pedestal: 0.0929 },
  { id: 'dlog',     label: 'D-Log / D-Log M',  cams: 'DJI Drone · Osmo Pocket',   pedestal: 0.0929 },
  { id: 'vlog',     label: 'V-Log',            cams: 'Panasonic Lumix',           pedestal: 0.125 },
  { id: 'applelog', label: 'Apple Log',        cams: 'iPhone 15 Pro ke atas',     pedestal: 0.1505 },
  { id: 'flog',     label: 'F-Log',            cams: 'Fujifilm X / GFX',          pedestal: 0.0929 },
  { id: 'flog2',    label: 'F-Log2',           cams: 'Fujifilm X-H2 · X-T5',      pedestal: 0.0929 },
  { id: 'clog3',    label: 'C-Log3',           cams: 'Canon R series',            pedestal: 0.0731 },
  { id: 'hlg',      label: 'HLG (approx)',     cams: 'HDR phone · Sony HLG',      pedestal: 0 },
]

const clamp01 = (v: number) => v < 0 ? 0 : v > 1 ? 1 : v

// ── Official decode formulas: encoded V (0–1) → scene linear (0.18 = mid grey) ──
export function decodeLog(profile: LogProfile, x: number): number {
  switch (profile) {
    case 'slog3':
      return x >= 171.2102946929 / 1023
        ? Math.pow(10, (x * 1023 - 420) / 261.5) * 0.19 - 0.01
        : (x * 1023 - 95) * 0.01125 / (171.2102946929 - 95)
    case 'vlog':
      return x < 0.181
        ? (x - 0.125) / 5.6
        : Math.pow(10, (x - 0.598206) / 0.241514) - 0.00873
    case 'dlog':
      return x <= 0.14
        ? (x - 0.0929) / 6.025
        : (Math.pow(10, 3.89616 * x - 2.27752) - 0.0108) / 0.9892
    case 'applelog': {
      const R0 = -0.05641088, Rt = 0.01, c = 47.28711236
      const beta = 0.00964052, gamma = 0.08550479, delta = 0.69336945
      const Pt = c * (Rt - R0) * (Rt - R0)
      if (x < 0) return R0
      return x < Pt ? Math.sqrt(x / c) + R0 : Math.pow(2, (x - delta) / gamma) - beta
    }
    case 'flog':
      return x < 0.100537775223865
        ? (x - 0.092864) / 8.735631
        : Math.pow(10, (x - 0.790453) / 0.344676) / 0.555556 - 0.009468 / 0.555556
    case 'flog2':
      return x < 0.100686685370811
        ? (x - 0.092864) / 8.799461
        : Math.pow(10, (x - 0.384316) / 0.245281) / 5.555556 - 0.064829 / 5.555556
    case 'clog3':
      if (x < 0.04076162) return -(Math.pow(10, (0.069886632 - x) / 0.42889912) - 1) / 14.98325
      if (x <= 0.105357102) return (x - 0.073059361) / 2.3069815
      return (Math.pow(10, (x - 0.069886632) / 0.42889912) - 1) / 14.98325
    case 'hlg': {
      // BT.2100 inverse OETF, scaled so mid grey (38% signal) lands at 0.18
      const lin = x <= 0.5
        ? (x * x) / 3
        : (Math.exp((x - 0.55991073) / 0.17883277) + 0.28466892) / 12
      return lin * 3.74
    }
    default:
      return x
  }
}

// ── Display rendering: filmic shoulder + sRGB encode ──────────────────────────
const SHOULDER = 0.55
function linearToDisplay(L: number): number {
  L = Math.max(0, L)
  if (L > SHOULDER) L = SHOULDER + (1 - SHOULDER) * Math.tanh((L - SHOULDER) / (1 - SHOULDER))
  return clamp01(L <= 0.0031308 ? L * 12.92 : 1.055 * Math.pow(L, 1 / 2.4) - 0.055)
}

// ── Composed 1D LUT cache (decode → gain → rolloff → sRGB) ────────────────────
const lutCache = new Map<string, Float32Array>()
function getDisplayLUT(profile: LogProfile, gain: number): Float32Array {
  const key = profile + ':' + gain.toFixed(3)
  let lut = lutCache.get(key)
  if (!lut) {
    lut = new Float32Array(4096)
    for (let i = 0; i < 4096; i++) {
      lut[i] = linearToDisplay(decodeLog(profile, i / 4095) * gain)
    }
    if (lutCache.size > 12) lutCache.clear()
    lutCache.set(key, lut)
  }
  return lut
}

const lookup = (T: Float32Array, c: number) => {
  const t = clamp01(c) * 4095, i = t | 0
  return i >= 4095 ? T[4095] : T[i] + (T[i + 1] - T[i]) * (t - i)
}

// Per-pixel hot path — identity for rec709
export function logToDisplay(profile: LogProfile, gain: number, r: number, g: number, b: number): [number, number, number] {
  if (profile === 'rec709') return [r, g, b]
  const lut = getDisplayLUT(profile, gain)
  return [lookup(lut, r), lookup(lut, g), lookup(lut, b)]
}

// Convert a whole ImageData (for feeding Smart Match with normalized footage)
export function convertImageData(img: ImageData, profile: LogProfile, gain: number): ImageData {
  if (profile === 'rec709') return img
  const lut = getDisplayLUT(profile, gain)
  const { data, width, height } = img
  const out = new Uint8ClampedArray(data.length)
  for (let i = 0; i < data.length; i += 4) {
    out[i]     = Math.round(lookup(lut, data[i] / 255) * 255)
    out[i + 1] = Math.round(lookup(lut, data[i + 1] / 255) * 255)
    out[i + 2] = Math.round(lookup(lut, data[i + 2] / 255) * 255)
    out[i + 3] = data[i + 3]
  }
  return new ImageData(out, width, height)
}

// ── Smart auto exposure: nudge median scene luma toward mid grey ──────────────
// Only corrects when clearly off (ETTR / underexposed log), max ±1.5 stop.
export function computeAutoGain(img: ImageData, profile: LogProfile): number {
  if (profile === 'rec709') return 1
  const { data } = img
  const px = data.length / 4
  const step = Math.max(1, Math.floor(px / 30000)) * 4
  const lumas: number[] = []
  for (let i = 0; i < data.length; i += step) {
    const v = (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / 255
    const lin = decodeLog(profile, v)
    if (lin > 0.001) lumas.push(lin)
  }
  if (lumas.length < 100) return 1
  lumas.sort((a, b) => a - b)
  const median = lumas[Math.floor(lumas.length / 2)]
  if (median >= 0.09 && median <= 0.33) return 1            // exposure already fine
  const target = median < 0.09 ? 0.09 : 0.33
  const gain = target / median
  return Math.min(2.83, Math.max(0.354, gain))               // clamp ±1.5 EV
}

// ── Auto-detect: is this footage log, and which one? ──────────────────────────
// Signals: lifted black pedestal, low chroma, compressed dynamic range.
// The 0.093 family (S-Log3 / D-Log / F-Log) shares a pedestal — we pick by
// market priority and let the user switch in the dropdown.
export interface LogDetection {
  isLog: boolean
  profile: LogProfile
  confidence: 'high' | 'medium'
}

const DETECT_ORDER: LogProfile[] = ['slog3', 'dlog', 'vlog', 'applelog', 'clog3', 'flog', 'flog2']

export function detectLogProfile(img: ImageData): LogDetection {
  const { data } = img
  const px = data.length / 4
  const step = Math.max(1, Math.floor(px / 25000)) * 4
  const lumas: number[] = []
  let chromaSum = 0, n = 0
  for (let i = 0; i < data.length; i += step) {
    const r = data[i] / 255, g = data[i + 1] / 255, b = data[i + 2] / 255
    lumas.push(0.2126 * r + 0.7152 * g + 0.0722 * b)
    chromaSum += Math.max(r, g, b) - Math.min(r, g, b)
    n++
  }
  if (n < 100) return { isLog: false, profile: 'rec709', confidence: 'medium' }
  lumas.sort((a, b) => a - b)
  // p0.2%: close to the true noise floor (= pedestal on log footage) while
  // still robust against a few dead/hot pixels
  const p005 = lumas[Math.floor(lumas.length * 0.002)]
  const p995 = lumas[Math.floor(lumas.length * 0.995)]
  const mean = lumas.reduce((s, v) => s + v, 0) / lumas.length
  const std = Math.sqrt(lumas.reduce((s, v) => s + (v - mean) ** 2, 0) / lumas.length)
  const chroma = chromaSum / n

  const looksLog = p005 >= 0.05 && p005 <= 0.19 && chroma < 0.16 && std < 0.22 && p995 < 0.97
  if (!looksLog) return { isLog: false, profile: 'rec709', confidence: 'medium' }

  // match black pedestal against known profiles
  let best: LogProfile = 'slog3', bestDiff = Infinity
  for (const id of DETECT_ORDER) {
    const ped = LOG_PROFILES.find(p => p.id === id)!.pedestal
    const diff = Math.abs(p005 - ped)
    if (diff < bestDiff) { bestDiff = diff; best = id }
  }
  if (bestDiff > 0.04) return { isLog: false, profile: 'rec709', confidence: 'medium' }
  return { isLog: true, profile: best, confidence: bestDiff < 0.012 && chroma < 0.12 ? 'high' : 'medium' }
}
