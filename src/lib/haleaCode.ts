// HALEA Code — share a grade as a short text code. No server, no database:
// the code IS the look.
//
// v3 layout: [ver=3][flags][name? len+ascii≤12]
//   [match? 9×i16 matrix + 3×i16 offset + 16×u8 curve
//          + 24×i8 hue-band residuals + 5×i8 skin layer + u8 amount = 70B]
//   [primary? 6×i8, omitted when all-zero][look? 2B][halation? 1B][checksum]
// Typical sizes: basic look ~22 chars, full Smart Match ~105 chars.
//
// Compression tricks (lossless where it matters):
// - means folded into one offset vector: T(x−μf)+μr ≡ Tx+o with o = μr − T·μf
// - tone curve 64→16 knots on encode, Catmull-Rom upsampled back on decode
// v1 & v2 codes (older) still decode — version byte is checked.

export interface CodeNode {
  type: 'match' | 'primary' | 'look' | 'halation' | 'split'
  enabled: boolean
  params: Record<string, number | string>
}

const LOOKS = ['cinematic', 'warm', 'cool', 'bleach', 'vintage', 'teal_orange', 'moody', 'faithful', 'natural']
const PREFIX = 'HALEA:'
const MEAN_KEYS = ['fL', 'fa', 'fb', 'rL', 'ra', 'rb'] as const
const PRIM_KEYS = ['lift', 'gamma', 'temp', 'tint', 'con', 'sat'] as const

const cl = (v: number, lo: number, hi: number) => v < lo ? lo : v > hi ? hi : v

// ── Encode (always v2) ────────────────────────────────────────────────────────
export function encodeGrade(nodes: CodeNode[], name = ''): string {
  const bytes: number[] = []
  const u8  = (v: number) => bytes.push(v & 0xFF)
  const i16 = (v: number) => { const x = Math.round(cl(v, -32767, 32767)); bytes.push(x & 0xFF, (x >> 8) & 0xFF) }

  const match = nodes.find(n => n.type === 'match'    && n.enabled)
  const prim  = nodes.find(n => n.type === 'primary'  && n.enabled)
  const look  = nodes.find(n => n.type === 'look'     && n.enabled)
  const hal   = nodes.find(n => n.type === 'halation' && n.enabled)
  const cleanName = name.replace(/[^\x20-\x7E]/g, '').trim().slice(0, 12)

  // skip the trim block entirely when it's all zeros (common case)
  const primDirty = !!prim && PRIM_KEYS.some(k => Math.abs((prim.params[k] as number) || 0) > 0.004)

  let flags = 0
  if (match)     flags |= 1
  if (primDirty) flags |= 2
  if (look)      flags |= 4
  if (hal)       flags |= 8
  if (cleanName) flags |= 16
  u8(3); u8(flags)

  if (cleanName) {
    u8(cleanName.length)
    for (const ch of cleanName) u8(ch.charCodeAt(0))
  }
  if (match) {
    const p = match.params as Record<string, number | string>
    const num = (k: string, d: number) => typeof p[k] === 'number' ? p[k] as number : d
    const m = (i: number) => num('m' + i, i % 4 === 0 ? 1 : 0)
    for (let i = 0; i < 9; i++) i16(m(i) * 8192)
    // fold means into offset: o = μr − T·μf  (exact algebra, 3 values instead of 6)
    const fL = num('fL', 0), fa = num('fa', 0), fb = num('fb', 0)
    i16((num('rL', 0) - (m(0) * fL + m(1) * fa + m(2) * fb)) * 8192)
    i16((num('ra', 0) - (m(3) * fL + m(4) * fa + m(5) * fb)) * 8192)
    i16((num('rb', 0) - (m(6) * fL + m(7) * fa + m(8) * fb)) * 8192)
    // resample tone curve 64 → 16 knots
    const curve = String(p.curve).split(',').map(Number)
    for (let j = 0; j < 16; j++) {
      const t = j / 15 * (curve.length - 1)
      const i = Math.min(curve.length - 2, Math.floor(t))
      const v = curve[i] + (curve[i + 1] - curve[i]) * (t - i)
      u8(Math.round(cl(v, 0, 1) * 255))
    }
    // v3: hue-band residuals (8 × hue/sat/luma) + skin layer
    for (let i = 0; i < 8; i++) u8(Math.round(cl(num('bh' + i, 0), -0.508, 0.508) * 250))
    for (let i = 0; i < 8; i++) u8(Math.round(cl(num('bs' + i, 1) - 1, -0.84, 0.84) * 150))
    for (let i = 0; i < 8; i++) u8(Math.round(cl(num('bl' + i, 0), -0.317, 0.317) * 400))
    u8(Math.round(cl(num('skh', 0), -0.508, 0.508) * 250))
    u8(Math.round(cl(num('sks', 1) - 1, -0.84, 0.84) * 150))
    u8(Math.round(cl(num('skl', 0), -0.317, 0.317) * 400))
    u8(Math.round(cl(num('skw', 0), 0, 1) * 100))
    u8(Math.round(cl(num('skp', 0), 0, 1) * 100))
    u8(Math.round(cl(p.amount as number, 0, 1) * 100))
  }
  if (primDirty && prim) {
    for (const k of PRIM_KEYS) u8(Math.round(cl(prim.params[k] as number, -0.635, 0.635) * 200))
  }
  if (look) {
    u8(Math.max(0, LOOKS.indexOf(String(look.params.look))))
    u8(Math.round(cl(look.params.amount as number, 0, 1) * 100))
  }
  if (hal) {
    u8(Math.round(cl(hal.params.intensity as number, 0, 1.27) * 200))   // threshold fixed at 0.65
  }

  let sum = 0
  for (const b of bytes) sum = (sum + b) & 0xFF
  bytes.push(sum)

  const bin = String.fromCharCode(...bytes)
  return PREFIX + btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

// ── Decode (v1 + v2) ──────────────────────────────────────────────────────────
// Accepts a raw code OR any text containing one (whole captions can be pasted)
export function decodeGrade(text: string): { nodes: CodeNode[]; name: string } | null {
  try {
    const mt = text.match(/HALEA:([A-Za-z0-9_-]{8,})/)
    if (!mt) return null
    let s = mt[1].replace(/-/g, '+').replace(/_/g, '/')
    while (s.length % 4) s += '='
    const bin = atob(s)
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    if (bytes.length < 4) return null

    let sum = 0
    for (let i = 0; i < bytes.length - 1; i++) sum = (sum + bytes[i]) & 0xFF
    if (sum !== bytes[bytes.length - 1]) return null

    let pos = 0
    const u8  = () => bytes[pos++]
    const i16 = () => { const lo = bytes[pos++], hi = bytes[pos++]; let v = (hi << 8) | lo; if (v > 32767) v -= 65536; return v }
    const i8  = () => { let v = u8(); if (v > 127) v -= 256; return v }

    const ver = u8()
    if (ver < 1 || ver > 3) return null
    const flags = u8()

    let name = ''
    if (flags & 16) {
      const len = u8()
      for (let i = 0; i < len; i++) name += String.fromCharCode(u8())
    }

    const nodes: CodeNode[] = []
    if (flags & 1) {
      const params: Record<string, number | string> = {}
      for (let i = 0; i < 9; i++) params['m' + i] = i16() / 8192
      if (ver === 1) {
        for (const k of MEAN_KEYS) params[k] = i16() / 16384
        const curve: string[] = []
        for (let k = 0; k < 64; k++) curve.push((u8() / 255).toFixed(5))
        params.curve = curve.join(',')
      } else {
        // v2: offset form — equivalent transform with zero footage-mean
        params.fL = 0; params.fa = 0; params.fb = 0
        params.rL = i16() / 8192; params.ra = i16() / 8192; params.rb = i16() / 8192
        // upsample 16 → 64 knots with Catmull-Rom (passes through every knot,
        // C¹ smooth, clamped per-segment to stay monotonic)
        const c16: number[] = []
        for (let j = 0; j < 16; j++) c16.push(u8() / 255)
        const curve: string[] = []
        for (let k = 0; k < 64; k++) {
          const t = k / 63 * 15
          const i = Math.min(14, Math.floor(t))
          const f = t - i
          const p0 = c16[Math.max(0, i - 1)], p1 = c16[i], p2 = c16[i + 1], p3 = c16[Math.min(15, i + 2)]
          let v = 0.5 * ((2 * p1) + (-p0 + p2) * f
            + (2 * p0 - 5 * p1 + 4 * p2 - p3) * f * f
            + (-p0 + 3 * p1 - 3 * p2 + p3) * f * f * f)
          v = Math.max(Math.min(p1, p2), Math.min(Math.max(p1, p2), v))
          curve.push(v.toFixed(5))
        }
        params.curve = curve.join(',')
      }
      if (ver >= 3) {
        // hue-band residuals + skin layer
        for (let i = 0; i < 8; i++) params['bh' + i] = i8() / 250
        for (let i = 0; i < 8; i++) params['bs' + i] = 1 + i8() / 150
        for (let i = 0; i < 8; i++) params['bl' + i] = i8() / 400
        params.skh = i8() / 250
        params.sks = 1 + i8() / 150
        params.skl = i8() / 400
        params.skw = u8() / 100
        params.skp = u8() / 100
      }
      params.amount = u8() / 100
      nodes.push({ type: 'match', enabled: true, params })
    }
    if (flags & 2) {
      const params: Record<string, number | string> = {}
      for (const k of PRIM_KEYS) params[k] = i8() / 200
      nodes.push({ type: 'primary', enabled: true, params })
    }
    if (flags & 4) {
      const idx = u8(), amount = u8() / 100
      nodes.push({ type: 'look', enabled: true, params: { look: LOOKS[Math.min(idx, LOOKS.length - 1)], amount } })
    }
    if (flags & 8) {
      const threshold = ver === 1 ? u8() / 100 : 0.65
      nodes.push({ type: 'halation', enabled: true, params: { threshold, intensity: u8() / 200 } })
    }
    if (!nodes.length) return null
    return { nodes, name }
  } catch {
    return null
  }
}

// Clipboard helper with fallback for older mobile browsers
export async function copyText(t: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(t)
    return true
  } catch {
    try {
      const ta = document.createElement('textarea')
      ta.value = t
      ta.style.position = 'fixed'; ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      const ok = document.execCommand('copy')
      document.body.removeChild(ta)
      return ok
    } catch { return false }
  }
}
