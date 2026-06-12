// HALEA Grading Gym — daily color-matching game.
// A target grade is generated (seeded by date — everyone gets the same daily
// challenge), the player recreates it with sliders, and the engine scores the
// result by mean Oklab ΔE between the player's render and the target render.

import { srgbToOklab } from './colorMatch'

export interface GymParams {
  lift: number; gamma: number; temp: number; tint: number; con: number; sat: number
}
export const ZERO_PARAMS: GymParams = { lift: 0, gamma: 0, temp: 0, tint: 0, con: 0, sat: 0 }

export const GYM_SLIDERS: { key: keyof GymParams; label: string; range: number; lo: string; hi: string }[] = [
  { key: 'temp',  label: 'Temperature', range: 0.3,  lo: 'Cool',  hi: 'Warm' },
  { key: 'tint',  label: 'Tint',        range: 0.18, lo: 'Green', hi: 'Magenta' },
  { key: 'gamma', label: 'Exposure',    range: 0.25, lo: 'Gelap', hi: 'Terang' },
  { key: 'con',   label: 'Contrast',    range: 0.35, lo: 'Flat',  hi: 'Punchy' },
  { key: 'sat',   label: 'Saturation',  range: 0.4,  lo: 'Muted', hi: 'Vivid' },
  { key: 'lift',  label: 'Shadows',     range: 0.15, lo: '0',     hi: 'Lift' },
]

const clamp = (v: number, lo = 0, hi = 1) => v < lo ? lo : v > hi ? hi : v
const luma = (r: number, g: number, b: number) => 0.2126 * r + 0.7152 * g + 0.0722 * b

// Identical math to the studio's primary node — the game trains the real tool
export function applyPrimary(r: number, g: number, b: number, p: GymParams): [number, number, number] {
  r = clamp(r + p.temp * 0.15 + p.lift * (1 - r) * 0.8 + p.lift * 0.2)
  g = clamp(g - p.tint * 0.12 + p.lift * (1 - g) * 0.8 + p.lift * 0.2)
  b = clamp(b - p.temp * 0.15 + p.tint * 0.04 + p.lift * (1 - b) * 0.8 + p.lift * 0.2)
  if (p.gamma) {
    r = clamp(Math.pow(Math.max(r, 0), 1 / (1 + p.gamma)))
    g = clamp(Math.pow(Math.max(g, 0), 1 / (1 + p.gamma)))
    b = clamp(Math.pow(Math.max(b, 0), 1 / (1 + p.gamma)))
  }
  if (p.con) {
    r = clamp(0.5 + (r - 0.5) * (1 + p.con))
    g = clamp(0.5 + (g - 0.5) * (1 + p.con))
    b = clamp(0.5 + (b - 0.5) * (1 + p.con))
  }
  if (p.sat) {
    const lm = luma(r, g, b), sf = 1 + p.sat
    r = clamp(lm + (r - lm) * sf); g = clamp(lm + (g - lm) * sf); b = clamp(lm + (b - lm) * sf)
  }
  return [r, g, b]
}

// ── Seeded RNG (mulberry32) ───────────────────────────────────────────────────
export function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6D2B79F5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const GYM_EPOCH = Date.UTC(2026, 0, 1)
export const todayKey = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
export const challengeNumber = () => Math.max(1, Math.floor((Date.now() - GYM_EPOCH) / 86400000) + 1)
export const seedFromKey = (key: string) => {
  let h = 2166136261
  for (let i = 0; i < key.length; i++) { h ^= key.charCodeAt(i); h = Math.imul(h, 16777619) }
  return h >>> 0
}

// ── Target grade generation ───────────────────────────────────────────────────
export function genTargetParams(rng: () => number): GymParams {
  for (let attempt = 0; attempt < 8; attempt++) {
    const p: GymParams = {
      temp:  (rng() * 2 - 1) * 0.24,
      tint:  (rng() * 2 - 1) * 0.13,
      gamma: (rng() * 2 - 1) * 0.18,
      con:   (rng() * 2 - 1) * 0.28,
      sat:   (rng() * 2 - 1) * 0.32,
      lift:  rng() * 0.11,
    }
    // re-roll grades that are too subtle to be a fun challenge
    const magnitude = Math.abs(p.temp) / 0.24 + Math.abs(p.con) / 0.28 + Math.abs(p.sat) / 0.32 + p.lift / 0.11
    if (magnitude > 1.1) return p
  }
  return { temp: 0.15, tint: -0.05, gamma: -0.08, con: 0.18, sat: -0.15, lift: 0.06 }
}

// ── Procedural daily scene (no asset downloads — painted from the seed) ───────
export function paintScene(ctx: CanvasRenderingContext2D, w: number, h: number, rng: () => number) {
  const horizon = h * 0.58
  const patchTop = h * 0.86
  const skyHue = Math.floor(rng() * 360)

  // sky
  const sky = ctx.createLinearGradient(0, 0, 0, horizon)
  sky.addColorStop(0, `hsl(${skyHue}, 42%, ${24 + rng() * 10}%)`)
  sky.addColorStop(1, `hsl(${(skyHue + 35) % 360}, 55%, ${52 + rng() * 12}%)`)
  ctx.fillStyle = sky
  ctx.fillRect(0, 0, w, horizon)

  // sun + glow
  const sx = w * (0.2 + rng() * 0.6), sy = horizon * (0.3 + rng() * 0.45), sr = 18 + rng() * 26
  const glow = ctx.createRadialGradient(sx, sy, 0, sx, sy, sr * 4)
  glow.addColorStop(0, 'rgba(255,240,210,0.95)')
  glow.addColorStop(0.25, 'rgba(255,220,170,0.45)')
  glow.addColorStop(1, 'rgba(255,220,170,0)')
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, w, horizon)
  ctx.fillStyle = '#fff6e6'
  ctx.beginPath(); ctx.arc(sx, sy, sr, 0, Math.PI * 2); ctx.fill()

  // mountain layers (far → near, darker forward)
  for (let L = 0; L < 3; L++) {
    const baseY = horizon - L * 6
    const amp = 26 + rng() * 44
    ctx.fillStyle = `hsl(${(skyHue + 200 + L * 14) % 360}, ${24 - L * 4}%, ${30 - L * 8}%)`
    ctx.beginPath()
    ctx.moveTo(0, baseY)
    const steps = 6 + Math.floor(rng() * 4)
    for (let i = 0; i <= steps; i++) {
      ctx.lineTo((w * i) / steps, baseY - rng() * amp * (1 - L * 0.18))
    }
    ctx.lineTo(w, patchTop); ctx.lineTo(0, patchTop)
    ctx.closePath(); ctx.fill()
  }

  // ground / water band
  const ground = ctx.createLinearGradient(0, horizon, 0, patchTop)
  ground.addColorStop(0, `hsl(${(skyHue + 190) % 360}, 22%, 17%)`)
  ground.addColorStop(1, `hsl(${(skyHue + 190) % 360}, 18%, 10%)`)
  ctx.fillStyle = ground
  ctx.fillRect(0, horizon, w, patchTop - horizon)
  // light streak reflection under the sun
  const refl = ctx.createLinearGradient(0, horizon, 0, patchTop)
  refl.addColorStop(0, 'rgba(255,230,190,0.30)')
  refl.addColorStop(1, 'rgba(255,230,190,0)')
  ctx.fillStyle = refl
  ctx.fillRect(sx - sr * 1.2, horizon, sr * 2.4, patchTop - horizon)

  // reference patch strip (skin · grey · R · G · B · Y) — makes shifts readable
  const patches = ['#c9906c', '#7f7f7f', '#b8453a', '#3d9a52', '#3c66c4', '#d9bb45']
  const pw = w / patches.length
  patches.forEach((c, i) => {
    ctx.fillStyle = c
    ctx.fillRect(i * pw, patchTop, pw, h - patchTop)
  })
  ctx.fillStyle = '#0d0d0d'
  ctx.fillRect(0, patchTop, w, 2)
  for (let i = 1; i < patches.length; i++) ctx.fillRect(i * pw - 1, patchTop, 2, h - patchTop)
}

// ── Render params over a base image ───────────────────────────────────────────
export function renderParams(base: ImageData, p: GymParams): ImageData {
  const { data, width, height } = base
  const out = new Uint8ClampedArray(data.length)
  for (let i = 0; i < data.length; i += 4) {
    const [r, g, b] = applyPrimary(data[i] / 255, data[i + 1] / 255, data[i + 2] / 255, p)
    out[i] = Math.round(r * 255); out[i + 1] = Math.round(g * 255); out[i + 2] = Math.round(b * 255)
    out[i + 3] = data[i + 3]
  }
  return new ImageData(out, width, height)
}

// ── Scoring: mean Oklab ΔE between player render and target render ────────────
export interface GymScore {
  score: number
  hints: string[]
}

export function scoreAttempt(base: ImageData, user: GymParams, target: GymParams): GymScore {
  const { data } = base
  const px = data.length / 4
  const step = Math.max(1, Math.floor(px / 6000)) * 4
  let sum = 0, n = 0
  for (let i = 0; i < data.length; i += step) {
    const r = data[i] / 255, g = data[i + 1] / 255, b = data[i + 2] / 255
    const [ur, ug, ub] = applyPrimary(r, g, b, user)
    const [tr, tg, tb] = applyPrimary(r, g, b, target)
    const [uL, uA, uB] = srgbToOklab(ur, ug, ub)
    const [tL, tA, tB] = srgbToOklab(tr, tg, tb)
    sum += Math.sqrt((uL - tL) ** 2 + (uA - tA) ** 2 + (uB - tB) ** 2)
    n++
  }
  const meanDE = n ? sum / n : 1
  const score = Math.max(0, Math.min(100, Math.round(100 - meanDE * 1100)))

  // hints: which sliders are most off, in plain Indonesian
  const hints: string[] = []
  const diffs = GYM_SLIDERS.map(s => ({
    s, dp: (user[s.key] - target[s.key]) / s.range,
  })).filter(d => Math.abs(d.dp) > 0.16).sort((a, b) => Math.abs(b.dp) - Math.abs(a.dp))
  for (const { s, dp } of diffs.slice(0, 3)) {
    const sev = Math.abs(dp) > 0.6 ? 'jauh' : Math.abs(dp) > 0.33 ? 'lumayan' : 'sedikit'
    hints.push(`${dp > 0 ? 'Turunkan' : 'Naikkan'} ${s.label} (${sev} ${dp > 0 ? 'kelebihan' : 'kurang'})`)
  }
  if (!hints.length && score < 100) hints.push('Tinggal selisih halus — perhatikan patch warna di bawah gambar')
  if (score >= 95) hints.length = 0
  return { score, hints }
}

// ── Per-user gym progress (streak, history) ───────────────────────────────────
export interface GymState {
  lastPlayed: string          // dayKey of last daily submit
  streak: number
  bestToday: number
  xpDay: string               // day the base XP was granted
  bonusDay: string            // day the ≥85 bonus was granted
  history: { day: string; n: number; score: number }[]
}
const EMPTY_GYM: GymState = { lastPlayed: '', streak: 0, bestToday: 0, xpDay: '', bonusDay: '', history: [] }

export function loadGym(uid: string): GymState {
  try { return { ...EMPTY_GYM, ...JSON.parse(localStorage.getItem('halea_gym_' + uid) || '') } }
  catch { return { ...EMPTY_GYM } }
}
export function saveGym(uid: string, s: GymState) {
  try { localStorage.setItem('halea_gym_' + uid, JSON.stringify(s)) } catch {}
}

// Grant XP straight into the Academy progress store (same rank, same bar)
export function grantAcademyXp(uid: string, amount: number) {
  try {
    const key = 'halea_learn_' + uid
    const p = JSON.parse(localStorage.getItem(key) || '{"done":[],"xp":0,"missions":[]}')
    p.xp = (p.xp || 0) + amount
    localStorage.setItem(key, JSON.stringify(p))
  } catch {}
}
