'use client'
import { useState, useRef, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/auth'
import { toast } from '@/components/ui'
import { copyText } from '@/lib/haleaCode'
import { Flame, RotateCcw, Share2, Upload, Dumbbell } from 'lucide-react'
import {
  GymParams, ZERO_PARAMS, GYM_SLIDERS, GymState, GymScore,
  mulberry32, seedFromKey, todayKey, challengeNumber,
  paintScene, genTargetParams, renderParams, scoreAttempt,
  loadGym, saveGym, grantAcademyXp,
} from '@/lib/gym'

const SCENE_W = 520, SCENE_H = 396

const toUrl = (img: ImageData) => {
  const c = document.createElement('canvas')
  c.width = img.width; c.height = img.height
  c.getContext('2d')!.putImageData(img, 0, 0)
  return c.toDataURL('image/jpeg', 0.92)
}

const yesterdayKey = () => {
  const d = new Date(Date.now() - 86400000)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Hoisted slider — keeps identity across renders so dragging stays alive
function GymSlider({ def, value, onChange }: {
  def: typeof GYM_SLIDERS[number]; value: number; onChange: (v: number) => void
}) {
  const pct = Math.round((value / def.range) * 100)
  return (
    <div>
      <div className="flex justify-between items-center mb-0.5">
        <span className="text-[10px] font-bold text-t2">{def.label}</span>
        <span className={`text-[10px] font-mono font-bold ${pct !== 0 ? 'text-accent' : 'text-t3'}`}>{pct > 0 ? '+' : ''}{pct}</span>
      </div>
      <input type="range" min={def.key === 'lift' ? 0 : -100} max={100} value={pct}
        onChange={e => onChange(+e.target.value / 100 * def.range)} className="w-full" />
      <div className="flex justify-between text-[8px] text-t3"><span>{def.lo}</span><span>{def.hi}</span></div>
    </div>
  )
}

export default function GymPage() {
  const router = useRouter()
  const { user } = useAuthStore()

  const [mode,      setMode]      = useState<'daily' | 'practice'>('daily')
  const [base,      setBase]      = useState<ImageData | null>(null)
  const [target,    setTarget]    = useState<GymParams | null>(null)
  const [params,    setParams]    = useState<GymParams>({ ...ZERO_PARAMS })
  const [userUrl,   setUserUrl]   = useState<string | null>(null)
  const [targetUrl, setTargetUrl] = useState<string | null>(null)
  const [hold,      setHold]      = useState(false)
  const [result,    setResult]    = useState<GymScore | null>(null)
  const [gym,       setGym]       = useState<GymState | null>(null)
  const rafRef = useRef<number | null>(null)

  const dayKey = todayKey()
  const chNum  = challengeNumber()

  // daily challenge — seeded by date, same for everyone
  useEffect(() => {
    if (mode !== 'daily') return
    const rng = mulberry32(seedFromKey('halea-gym-' + dayKey))
    const c = document.createElement('canvas')
    c.width = SCENE_W; c.height = SCENE_H
    const ctx = c.getContext('2d')!
    paintScene(ctx, SCENE_W, SCENE_H, rng)
    setBase(ctx.getImageData(0, 0, SCENE_W, SCENE_H))
    setTarget(genTargetParams(rng))
    setParams({ ...ZERO_PARAMS })
    setResult(null)
  }, [mode, dayKey])

  useEffect(() => { setGym(user ? loadGym(user.id) : null) }, [user])

  // render target once
  useEffect(() => {
    setTargetUrl(base && target ? toUrl(renderParams(base, target)) : null)
  }, [base, target])

  // live render of the player's grade
  useEffect(() => {
    if (!base) { setUserUrl(null); return }
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    rafRef.current = requestAnimationFrame(() => setUserUrl(toUrl(renderParams(base, params))))
  }, [base, params])

  const handlePractice = (f: File) => {
    const url = URL.createObjectURL(f)
    const img = new Image()
    img.onload = () => {
      const scale = Math.min(1, SCENE_W / img.width)
      const c = document.createElement('canvas')
      c.width = Math.round(img.width * scale)
      c.height = Math.round(img.height * scale)
      const ctx = c.getContext('2d')!
      ctx.drawImage(img, 0, 0, c.width, c.height)
      URL.revokeObjectURL(url)
      setBase(ctx.getImageData(0, 0, c.width, c.height))
      setTarget(genTargetParams(mulberry32((Math.random() * 1e9) | 0)))
      setParams({ ...ZERO_PARAMS })
      setResult(null)
    }
    img.onerror = () => { URL.revokeObjectURL(url); toast('Gagal load gambar', 'err') }
    img.src = url
  }

  const rerollPractice = () => {
    setTarget(genTargetParams(mulberry32((Math.random() * 1e9) | 0)))
    setParams({ ...ZERO_PARAMS })
    setResult(null)
  }

  const submit = useCallback(() => {
    if (!user) {
      toast('Daftar gratis dulu untuk main Gym ✦', 'warn')
      router.push('/login?next=/gym')
      return
    }
    if (!base || !target) return
    const res = scoreAttempt(base, params, target)
    setResult(res)

    if (mode === 'daily') {
      const g = loadGym(user.id)
      if (g.lastPlayed !== dayKey) {
        g.streak = g.lastPlayed === yesterdayKey() ? g.streak + 1 : 1
        g.lastPlayed = dayKey
        g.bestToday = 0
      }
      g.bestToday = Math.max(g.bestToday, res.score)
      const idx = g.history.findIndex(h => h.day === dayKey)
      if (idx >= 0) g.history[idx].score = Math.max(g.history[idx].score, res.score)
      else g.history.unshift({ day: dayKey, n: chNum, score: res.score })
      g.history = g.history.slice(0, 30)

      let gained = 0
      if (g.xpDay !== dayKey) { g.xpDay = dayKey; grantAcademyXp(user.id, 15); gained += 15 }
      if (res.score >= 85 && g.bonusDay !== dayKey) { g.bonusDay = dayKey; grantAcademyXp(user.id, 15); gained += 15 }
      saveGym(user.id, g)
      setGym({ ...g })
      if (gained) setTimeout(() => toast(`🏋️ +${gained} XP masuk ke Academy!`), 500)
    }
  }, [user, base, target, params, mode, dayKey, chNum, router])

  const shareResult = async () => {
    if (!result) return
    const streakTxt = gym && gym.streak > 1 ? ` · 🔥 streak ${gym.streak} hari` : ''
    const ok = await copyText(`🏋️ HALEA Grading Gym #${chNum} — Skor ${result.score}%${streakTxt}\nBisa lebih tinggi? 👉 halea.vercel.app/gym`)
    toast(ok ? '✓ Hasil disalin — pamer di story!' : 'Gagal menyalin', ok ? undefined : 'err')
  }

  const scoreColor = (s: number) => s >= 85 ? 'text-ok' : s >= 65 ? 'text-warn' : 'text-err'
  const streakLive = gym && (gym.lastPlayed === dayKey || gym.lastPlayed === yesterdayKey()) ? gym.streak : 0

  return (
    <div className="min-h-screen pb-16">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">

        {/* Header */}
        <div className="flex items-center gap-3 mb-6 flex-wrap">
          <div className="flex-1 min-w-0">
            <p className="text-[9px] font-black tracking-[0.25em] uppercase text-accent mb-1">HALEA Academy</p>
            <h1 className="font-fraunces text-2xl sm:text-3xl font-semibold leading-tight flex items-center gap-2.5">
              Grading <span className="italic text-accent">Gym</span> <Dumbbell size={22} className="text-accent" />
            </h1>
            <p className="text-t3 text-[11px] mt-1">Tiru target look pakai slider — engine yang menilai. Latih mata colorist-mu tiap hari.</p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="px-3 py-1.5 rounded-full bg-s3 border border-b1 text-[10px] font-black text-t2">#{chNum}</span>
            {streakLive > 0 && (
              <span className="px-3 py-1.5 rounded-full bg-warn/10 border border-warn/30 text-[10px] font-black text-warn flex items-center gap-1">
                <Flame size={11} /> {streakLive} hari
              </span>
            )}
          </div>
        </div>

        {/* Mode tabs */}
        <div className="grid grid-cols-2 gap-1 bg-s3 border border-b1 rounded-xl p-1 mb-5 max-w-xs">
          {([['daily', '📅 Harian'], ['practice', '🖼 Latihan']] as const).map(([m, label]) => (
            <button key={m} onClick={() => setMode(m)}
              className={`py-2 rounded-lg text-xs font-bold transition-colors ${mode === m ? 'bg-accent text-white' : 'text-t2 hover:text-txt'}`}>
              {label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-5 items-start">

          {/* ── LEFT: arena ── */}
          <div className="flex flex-col gap-4">
            <div className="bg-s1 border border-b1 rounded-2xl overflow-hidden relative select-none">
              {userUrl ? (
                <>
                  <img src={hold && targetUrl ? targetUrl : userUrl} alt="Gym"
                    className="w-full object-contain" draggable={false} />
                  <span className={`absolute top-3 left-3 text-[9px] font-black tracking-widest px-2.5 py-1 rounded-full backdrop-blur-sm ${hold ? 'bg-accent/25 text-accent' : 'bg-black/60 text-white/80'}`}>
                    {hold ? '🎯 TARGET' : '🎚 GRADE KAMU'}
                  </span>
                  <button
                    className="absolute bottom-3 right-3 text-[10px] font-bold text-white/90 bg-black/60 px-3 py-2 rounded-full backdrop-blur-sm active:bg-black/80 touch-none"
                    onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); setHold(true) }}
                    onPointerUp={() => setHold(false)}
                    onPointerCancel={() => setHold(false)}>
                    🎯 Tahan = Lihat Target
                  </button>
                </>
              ) : (
                <div className="flex flex-col items-center justify-center py-20 text-t3 gap-3">
                  {mode === 'practice' ? (
                    <>
                      <Upload size={28} className="opacity-30" />
                      <p className="text-sm font-bold">Upload foto untuk mulai latihan</p>
                    </>
                  ) : (
                    <span className="w-7 h-7 border-[3px] border-accent/30 border-t-accent rounded-full animate-spin" />
                  )}
                </div>
              )}
            </div>

            {mode === 'practice' && (
              <div className="flex gap-2">
                <label className="flex-1 py-3 bg-s2 border border-dashed border-b2 rounded-xl text-center text-xs font-bold text-t2 cursor-pointer hover:border-b3 transition-colors">
                  <input type="file" accept="image/*" className="sr-only"
                    onChange={e => { const f = e.target.files?.[0]; if (f) handlePractice(f); e.target.value = '' }} />
                  🖼 {base ? 'Ganti Foto' : 'Pilih Foto'}
                </label>
                {base && (
                  <button onClick={rerollPractice}
                    className="px-4 py-3 bg-s2 border border-b2 rounded-xl text-xs font-bold text-t2 hover:border-b3 transition-colors">
                    🎲 Target Baru
                  </button>
                )}
              </div>
            )}

            {/* Result */}
            {result && (
              <div className="bg-s2 border border-b1 rounded-2xl p-5 animate-fade-in">
                <div className="flex items-center gap-5">
                  <div className="text-center flex-shrink-0">
                    <p className={`font-mono text-5xl font-bold ${scoreColor(result.score)}`}>{result.score}<span className="text-xl">%</span></p>
                    <p className="text-[9px] text-t3 uppercase tracking-widest font-bold mt-1">
                      {result.score >= 95 ? 'Mata Colorist! 👑' : result.score >= 85 ? 'Keren! 🔥' : result.score >= 65 ? 'Hampir!' : 'Latihan lagi 💪'}
                    </p>
                  </div>
                  <div className="flex-1 min-w-0">
                    {result.hints.length > 0 ? (
                      <div className="flex flex-col gap-1.5">
                        {result.hints.map((h, i) => (
                          <p key={i} className="text-[11px] text-t2 leading-snug">💡 {h}</p>
                        ))}
                      </div>
                    ) : (
                      <p className="text-[11px] text-ok font-bold">Nyaris sempurna — tidak ada koreksi berarti! ✦</p>
                    )}
                    {mode === 'daily' && gym && (
                      <p className="text-[10px] text-t3 mt-2">Skor terbaik hari ini: <span className="text-accent font-bold">{gym.bestToday}%</span></p>
                    )}
                  </div>
                </div>
                <div className="flex gap-2 mt-4">
                  <button onClick={() => setResult(null)}
                    className="flex-1 py-2.5 bg-s3 border border-b2 rounded-xl text-xs font-bold text-t2 hover:border-b3 transition-colors flex items-center justify-center gap-1.5">
                    <RotateCcw size={12} /> Coba Lagi
                  </button>
                  <button onClick={shareResult}
                    className="flex-1 py-2.5 bg-accent text-white rounded-xl text-xs font-bold hover:bg-orange-400 transition-colors flex items-center justify-center gap-1.5">
                    <Share2 size={12} /> Salin Hasil
                  </button>
                </div>
              </div>
            )}

            {/* History */}
            {gym && gym.history.length > 0 && (
              <div className="bg-s2 border border-b1 rounded-2xl p-4">
                <p className="text-[9px] font-black tracking-widest uppercase text-t3 mb-3">Riwayat</p>
                <div className="flex gap-2 flex-wrap">
                  {gym.history.slice(0, 14).map(h => (
                    <div key={h.day} className="text-center px-2.5 py-1.5 bg-s3 rounded-lg border border-b1">
                      <p className={`text-xs font-mono font-bold ${scoreColor(h.score)}`}>{h.score}%</p>
                      <p className="text-[8px] text-t3">#{h.n}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* ── RIGHT: sliders ── */}
          <div className="flex flex-col gap-4">
            <div className="bg-s2 border border-b1 rounded-2xl p-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-[9px] font-black tracking-widest uppercase text-warn">🎚 Slider Grading</p>
                <button onClick={() => setParams({ ...ZERO_PARAMS })}
                  className="text-[10px] font-bold text-t3 hover:text-err transition-colors">↺ Reset</button>
              </div>
              <div className="flex flex-col gap-2.5">
                {GYM_SLIDERS.map(d => (
                  <GymSlider key={d.key} def={d} value={params[d.key]}
                    onChange={v => setParams(prev => ({ ...prev, [d.key]: v }))} />
                ))}
              </div>
            </div>

            <button onClick={submit} disabled={!base || !target}
              className="w-full py-4 bg-accent text-white rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-orange-400 transition-all disabled:opacity-40 shadow-xl shadow-accent/20">
              🏋️ Submit Skor
            </button>

            {!user && (
              <p className="text-[10px] text-t3 text-center leading-relaxed">
                <Link href="/login?next=/gym" className="text-accent font-bold">Daftar gratis</Link> untuk submit skor, streak harian, dan XP Academy
              </p>
            )}
            {mode === 'daily' ? (
              <div className="bg-s3 border border-b1 rounded-xl p-3.5 text-[10px] text-t3 leading-relaxed">
                📅 <strong className="text-t2">Challenge harian</strong> — semua orang dapat target yang sama.
                Submit = <strong className="text-accent">+15 XP</strong>, skor ≥85% = <strong className="text-accent">+15 XP bonus</strong>.
                Main tiap hari biar streak 🔥 nyala.
              </div>
            ) : (
              <div className="bg-s3 border border-b1 rounded-xl p-3.5 text-[10px] text-t3 leading-relaxed">
                🖼 <strong className="text-t2">Mode latihan</strong> — pakai fotomu sendiri, target acak,
                tanpa XP. Tempat sempurna buat melatih mata sebelum challenge harian.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
