// HALEA Code — share a grade as a short text code. No server, no database:
// the code IS the look. Binary-packed params → base64url, ~40 chars for a
// basic grade, ~160 chars for a full Smart Match (fits in an IG caption/comment).
//
// Layout: [ver u8][flags u8][name? len+ascii][match? 95B][primary? 6B][look? 2B][halation? 2B][checksum u8]

export interface CodeNode {
  type: 'match' | 'primary' | 'look' | 'halation'
  enabled: boolean
  params: Record<string, number | string>
}

const LOOKS = ['cinematic', 'warm', 'cool', 'bleach', 'vintage', 'teal_orange', 'moody', 'faithful', 'natural']
const PREFIX = 'HALEA:'
const MEAN_KEYS = ['fL', 'fa', 'fb', 'rL', 'ra', 'rb'] as const
const PRIM_KEYS = ['lift', 'gamma', 'temp', 'tint', 'con', 'sat'] as const

const cl = (v: number, lo: number, hi: number) => v < lo ? lo : v > hi ? hi : v

export function encodeGrade(nodes: CodeNode[], name = ''): string {
  const bytes: number[] = []
  const u8  = (v: number) => bytes.push(v & 0xFF)
  const i16 = (v: number) => { const x = Math.round(cl(v, -32767, 32767)); bytes.push(x & 0xFF, (x >> 8) & 0xFF) }

  const match = nodes.find(n => n.type === 'match'    && n.enabled)
  const prim  = nodes.find(n => n.type === 'primary'  && n.enabled)
  const look  = nodes.find(n => n.type === 'look'     && n.enabled)
  const hal   = nodes.find(n => n.type === 'halation' && n.enabled)
  const cleanName = name.replace(/[^\x20-\x7E]/g, '').trim().slice(0, 16)

  let flags = 0
  if (match) flags |= 1
  if (prim)  flags |= 2
  if (look)  flags |= 4
  if (hal)   flags |= 8
  if (cleanName) flags |= 16
  u8(1); u8(flags)

  if (cleanName) {
    u8(cleanName.length)
    for (const ch of cleanName) u8(ch.charCodeAt(0))
  }
  if (match) {
    const p = match.params
    for (let i = 0; i < 9; i++) i16((p['m' + i] as number) * 8192)
    for (const k of MEAN_KEYS)  i16((p[k] as number) * 16384)
    const curve = String(p.curve).split(',').map(Number)
    for (let k = 0; k < 64; k++) {
      const v = curve.length === 64 ? curve[k] : curve[Math.min(curve.length - 1, k)] ?? k / 63
      u8(Math.round(cl(v, 0, 1) * 255))
    }
    u8(Math.round(cl(p.amount as number, 0, 1) * 100))
  }
  if (prim) {
    for (const k of PRIM_KEYS) u8(Math.round(cl(prim.params[k] as number, -0.635, 0.635) * 200))
  }
  if (look) {
    u8(Math.max(0, LOOKS.indexOf(String(look.params.look))))
    u8(Math.round(cl(look.params.amount as number, 0, 1) * 100))
  }
  if (hal) {
    u8(Math.round(cl(hal.params.threshold as number, 0, 1.27) * 100))
    u8(Math.round(cl(hal.params.intensity as number, 0, 1.27) * 200))
  }

  let sum = 0
  for (const b of bytes) sum = (sum + b) & 0xFF
  bytes.push(sum)

  const bin = String.fromCharCode(...bytes)
  return PREFIX + btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

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

    if (u8() !== 1) return null
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
      for (const k of MEAN_KEYS) params[k] = i16() / 16384
      const curve: string[] = []
      for (let k = 0; k < 64; k++) curve.push((u8() / 255).toFixed(5))
      params.curve  = curve.join(',')
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
      nodes.push({ type: 'halation', enabled: true, params: { threshold: u8() / 100, intensity: u8() / 200 } })
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
