// HALEA Academy Certificates — issued client-side, verifiable by code.
// Format: HALEA-CERT:<base64url(name|tierId|dayNum|sig)> where sig is a salted
// hash of the payload. No server needed — the code carries its own integrity.

import { CHAPTERS } from '../app/learn/curriculum'

export interface CertTier {
  id: string
  icon: string
  label: string
  title: string          // printed on the certificate
  req: string            // human requirement text
}

export const CERT_TIERS: CertTier[] = [
  { id: 'fund',     icon: '🥉', label: 'Color Fundamentals', title: 'Color Fundamentals', req: 'Selesaikan Bab 1–2 (9 pelajaran)' },
  { id: 'grader',   icon: '🥈', label: 'Certified Grader',   title: 'Certified Grader',   req: 'Selesaikan Bab 1–4 (18 pelajaran)' },
  { id: 'colorist', icon: '🥇', label: 'Certified Colorist', title: 'Certified Colorist', req: 'Selesaikan semua bab + 3 misi praktek' },
]

const CERT_EPOCH = Date.UTC(2026, 0, 1)
const SALT = 'halea-halation-v1'

const hashStr = (s: string) => {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57
  for (let i = 0; i < s.length; i++) {
    const ch = s.charCodeAt(i)
    h1 = Math.imul(h1 ^ ch, 2654435761)
    h2 = Math.imul(h2 ^ ch, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return ((h2 >>> 0).toString(36) + (h1 >>> 0).toString(36)).slice(0, 10)
}

const b64e = (s: string) => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const b64d = (s: string) => {
  let t = s.replace(/-/g, '+').replace(/_/g, '/')
  while (t.length % 4) t += '='
  return decodeURIComponent(escape(atob(t)))
}

export function todayCertDay(): number {
  return Math.max(0, Math.floor((Date.now() - CERT_EPOCH) / 86400000))
}
export function certDateString(day: number): string {
  return new Date(CERT_EPOCH + day * 86400000).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })
}

export function encodeCert(name: string, tierId: string, day: number): string {
  const clean = name.replace(/[|]/g, ' ').trim().slice(0, 40)
  const payload = `${clean}|${tierId}|${day}`
  return 'HALEA-CERT:' + b64e(`${payload}|${hashStr(SALT + payload)}`)
}

export interface CertInfo { name: string; tier: CertTier; day: number; dateStr: string }

export function verifyCert(text: string): CertInfo | null {
  try {
    const mt = text.match(/HALEA-CERT:([A-Za-z0-9_-]{12,})/)
    if (!mt) return null
    const parts = b64d(mt[1]).split('|')
    if (parts.length !== 4) return null
    const [name, tierId, dayStr, sig] = parts
    if (hashStr(SALT + `${name}|${tierId}|${dayStr}`) !== sig) return null
    const tier = CERT_TIERS.find(t => t.id === tierId)
    const day = parseInt(dayStr)
    if (!tier || isNaN(day) || day < 0) return null
    return { name, tier, day, dateStr: certDateString(day) }
  } catch { return null }
}

// ── Eligibility from Academy progress ─────────────────────────────────────────
export function tierEligible(tierId: string, done: Set<string>, missionsDone: number): { ok: boolean; have: number; need: number } {
  const lessonsOf = (chapters: number) =>
    CHAPTERS.slice(0, chapters).flatMap(c => c.lessons.map(l => l.id))
  if (tierId === 'fund') {
    const ids = lessonsOf(2)
    const have = ids.filter(id => done.has(id)).length
    return { ok: have === ids.length, have, need: ids.length }
  }
  if (tierId === 'grader') {
    const ids = lessonsOf(4)
    const have = ids.filter(id => done.has(id)).length
    return { ok: have === ids.length, have, need: ids.length }
  }
  const ids = lessonsOf(CHAPTERS.length)
  const have = ids.filter(id => done.has(id)).length + Math.min(3, missionsDone)
  const need = ids.length + 3
  return { ok: have === need, have, need }
}

// ── Certificate rendering (canvas → PNG) ──────────────────────────────────────
export function drawCertificate(canvas: HTMLCanvasElement, info: { name: string; title: string; dateStr: string; code: string }) {
  const W = 1800, H = 1273
  canvas.width = W; canvas.height = H
  const ctx = canvas.getContext('2d')!

  // background + double border
  ctx.fillStyle = '#0d0d0d'
  ctx.fillRect(0, 0, W, H)
  ctx.strokeStyle = 'rgba(249,115,22,0.55)'; ctx.lineWidth = 3
  ctx.strokeRect(48, 48, W - 96, H - 96)
  ctx.strokeStyle = 'rgba(249,115,22,0.18)'; ctx.lineWidth = 1
  ctx.strokeRect(64, 64, W - 128, H - 128)

  // halation rings mark
  const cx = W / 2, my = 188
  ctx.strokeStyle = 'rgba(249,115,22,0.18)'; ctx.lineWidth = 2
  ctx.beginPath(); ctx.arc(cx, my, 56, 0, Math.PI * 2); ctx.stroke()
  ctx.strokeStyle = 'rgba(249,115,22,0.4)'; ctx.lineWidth = 3
  ctx.beginPath(); ctx.arc(cx, my, 38, 0, Math.PI * 2); ctx.stroke()
  ctx.strokeStyle = 'rgba(249,115,22,0.7)'; ctx.lineWidth = 4
  ctx.beginPath(); ctx.arc(cx, my, 22, 0, Math.PI * 2); ctx.stroke()
  ctx.fillStyle = '#f97316'
  ctx.beginPath(); ctx.arc(cx, my, 10, 0, Math.PI * 2); ctx.fill()

  ctx.textAlign = 'center'

  // wordmark + header
  ctx.fillStyle = '#ffffff'
  ctx.font = '600 64px Georgia, "Times New Roman", serif'
  ctx.fillText('HALEA', cx, my + 132)
  ctx.fillStyle = 'rgba(255,255,255,0.45)'
  ctx.font = '700 26px Arial, sans-serif'
  const sp = (s: string) => s.split('').join('  ')
  ctx.fillText(sp('SERTIFIKAT  KOMPETENSI'), cx, my + 184)
  ctx.fillStyle = 'rgba(255,255,255,0.35)'
  ctx.font = '24px Arial, sans-serif'
  ctx.fillText('HALEA Academy — Color Grading Curriculum', cx, my + 222)

  // recipient
  ctx.fillStyle = 'rgba(255,255,255,0.55)'
  ctx.font = 'italic 30px Georgia, serif'
  ctx.fillText('Diberikan kepada', cx, my + 320)
  ctx.fillStyle = '#ffffff'
  ctx.font = 'italic 600 96px Georgia, "Times New Roman", serif'
  ctx.fillText(info.name, cx, my + 432)
  // underline
  const nw = Math.min(ctx.measureText(info.name).width + 80, W - 400)
  ctx.strokeStyle = 'rgba(249,115,22,0.5)'; ctx.lineWidth = 2
  ctx.beginPath(); ctx.moveTo(cx - nw / 2, my + 462); ctx.lineTo(cx + nw / 2, my + 462); ctx.stroke()

  // achievement
  ctx.fillStyle = 'rgba(255,255,255,0.6)'
  ctx.font = '28px Arial, sans-serif'
  ctx.fillText('telah menyelesaikan kurikulum dan dinyatakan sebagai', cx, my + 532)
  ctx.fillStyle = '#f97316'
  ctx.font = '700 58px Georgia, serif'
  ctx.fillText(info.title, cx, my + 608)

  // date + signature
  ctx.fillStyle = 'rgba(255,255,255,0.5)'
  ctx.font = '26px Arial, sans-serif'
  ctx.fillText(`Diterbitkan ${info.dateStr}`, cx, my + 672)

  ctx.fillStyle = 'rgba(255,255,255,0.85)'
  ctx.font = 'italic 600 44px Georgia, serif'
  ctx.fillText('Robbie Satria', cx, H - 218)
  ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 1
  ctx.beginPath(); ctx.moveTo(cx - 180, H - 196); ctx.lineTo(cx + 180, H - 196); ctx.stroke()
  ctx.fillStyle = 'rgba(255,255,255,0.45)'
  ctx.font = '22px Arial, sans-serif'
  ctx.fillText('Founder — HALEA · @haleastudio', cx, H - 164)

  // verification code
  ctx.fillStyle = 'rgba(249,115,22,0.85)'
  ctx.font = '700 20px monospace'
  ctx.fillText(info.code, cx, H - 110)
  ctx.fillStyle = 'rgba(255,255,255,0.35)'
  ctx.font = '20px Arial, sans-serif'
  ctx.fillText('Cek keaslian sertifikat di halea.vercel.app/verify', cx, H - 78)
}
