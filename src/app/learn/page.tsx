'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/auth'
import { toast } from '@/components/ui'
import { CHAPTERS, RANKS, LESSON_XP, MISSION_XP, Lesson } from './curriculum'

// ── Progress store (localStorage, per akun) ───────────────────────────────────
interface Progress { done: string[]; xp: number; missions: string[] }
const EMPTY: Progress = { done: [], xp: 0, missions: [] }

function loadProgress(key: string): Progress {
  try {
    const p = JSON.parse(localStorage.getItem(key) || '')
    return { done: p.done || [], xp: p.xp || 0, missions: p.missions || [] }
  } catch { return { ...EMPTY } }
}
function saveProgress(key: string, p: Progress) {
  try { localStorage.setItem(key, JSON.stringify(p)) } catch {}
}
// Scan mission flags set by Studio/Matcher → auto-claim XP
function claimMissions(p: Progress): { next: Progress; gained: number } {
  let gained = 0
  const missions = [...p.missions]
  for (const ch of CHAPTERS) for (const l of ch.lessons) {
    if (!l.mission || missions.includes(l.mission.flag)) continue
    try {
      if (localStorage.getItem(l.mission.flag)) { missions.push(l.mission.flag); gained += MISSION_XP }
    } catch {}
  }
  return gained ? { next: { ...p, missions, xp: p.xp + gained }, gained } : { next: p, gained: 0 }
}
const rankFor = (xp: number) => RANKS.reduce((acc, r) => xp >= r.xp ? r : acc, RANKS[0])

// ── Lesson modal (hoisted — quiz state stays alive across parent renders) ─────
function LessonModal({ lesson, isDone, missionDone, onClose, onComplete, onManualMission }: {
  lesson: Lesson
  isDone: boolean
  missionDone: boolean
  onClose: () => void
  onComplete: (l: Lesson) => void
  onManualMission: (flag: string) => void
}) {
  const [answers, setAnswers] = useState<(number | null)[]>(lesson.quiz.map(() => null))
  const [checked, setChecked] = useState(false)
  const allAnswered = answers.every(a => a !== null)
  const allCorrect  = checked && lesson.quiz.every((q, i) => answers[i] === q.a)

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-s2 border border-b2 rounded-2xl max-w-lg w-full max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-b1 sticky top-0 bg-s2 z-10">
          <div>
            <h2 className="font-bold text-lg leading-tight">{lesson.title}</h2>
            <p className="text-[11px] text-t3 mt-0.5">{lesson.sub} · ⏱ {lesson.mins} menit{isDone ? ' · ✓ Selesai' : ''}</p>
          </div>
          <button onClick={onClose} className="text-t2 hover:text-txt text-xl flex-shrink-0 ml-3">✕</button>
        </div>

        {/* Body */}
        <div className="p-5 text-sm text-t2 leading-relaxed"
          dangerouslySetInnerHTML={{ __html: lesson.body
            .replace(/<h3>/g, '<h3 class="text-txt font-bold text-sm mt-4 mb-2 first:mt-0">')
            .replace(/<ul>/g, '<ul class="list-disc pl-4 mb-3 space-y-1">')
            .replace(/<ol>/g, '<ol class="list-decimal pl-4 mb-3 space-y-1">')
            .replace(/<div class="tip">/g, '<div class="bg-accent/10 border border-accent/20 rounded-xl p-3 my-3 text-accent text-xs">')
            .replace(/<strong>/g, '<strong class="text-txt">')
          }} />

        {/* Mission */}
        {lesson.mission && (
          <div className={`mx-5 mb-4 rounded-xl border p-4 ${missionDone ? 'bg-ok/10 border-ok/30' : 'bg-a2/5 border-a2/25'}`}>
            <p className={`text-[9px] font-black tracking-widest uppercase mb-1.5 ${missionDone ? 'text-ok' : 'text-a2'}`}>
              {missionDone ? '✓ Misi Selesai +' + MISSION_XP + ' XP' : '🎯 Misi Praktek · +' + MISSION_XP + ' XP'}
            </p>
            <p className="text-xs text-t2 leading-relaxed mb-3">{lesson.mission.text}</p>
            {!missionDone && (
              <div className="flex items-center gap-2">
                <Link href={lesson.mission.href}
                  className="px-4 py-2 bg-a2 text-black rounded-lg text-xs font-bold hover:bg-yellow-300 transition-colors">
                  Kerjakan →
                </Link>
                <button onClick={() => onManualMission(lesson.mission!.flag)}
                  className="text-[10px] text-t3 hover:text-t2 transition-colors">sudah kucoba, tandai ✓</button>
              </div>
            )}
          </div>
        )}

        {/* Quiz */}
        {!isDone ? (
          <div className="mx-5 mb-5 rounded-xl border border-b2 bg-s3 p-4">
            <p className="text-[9px] font-black tracking-widest uppercase text-accent mb-3">📝 Kuis — jawab benar semua untuk lanjut</p>
            <div className="flex flex-col gap-4">
              {lesson.quiz.map((q, qi) => (
                <div key={qi}>
                  <p className="text-xs font-bold text-txt mb-2">{qi + 1}. {q.q}</p>
                  <div className="flex flex-col gap-1.5">
                    {q.opts.map((opt, oi) => {
                      const selected = answers[qi] === oi
                      const showState = checked && selected
                      const correct = oi === q.a
                      return (
                        <button key={oi}
                          onClick={() => { if (!checked) setAnswers(a => a.map((v, i) => i === qi ? oi : v)) }}
                          className={`text-left px-3 py-2 rounded-lg border text-xs transition-colors ${
                            showState
                              ? correct ? 'border-ok bg-ok/15 text-ok font-bold' : 'border-err bg-err/10 text-err'
                              : selected ? 'border-accent bg-accent/10 text-txt font-bold' : 'border-b1 bg-s2 text-t2 hover:border-b3'
                          }`}>
                          {opt}{showState && (correct ? ' ✓' : ' ✗')}
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-2 mt-4">
              {!checked ? (
                <button onClick={() => setChecked(true)} disabled={!allAnswered}
                  className="px-5 py-2.5 bg-accent text-white rounded-xl text-xs font-bold hover:bg-orange-400 disabled:opacity-40 transition-colors">
                  Cek Jawaban
                </button>
              ) : allCorrect ? (
                <button onClick={() => onComplete(lesson)}
                  className="px-5 py-2.5 bg-ok text-white rounded-xl text-xs font-black hover:opacity-90 transition-opacity animate-fade-in">
                  🎉 Klaim +{LESSON_XP} XP
                </button>
              ) : (
                <>
                  <button onClick={() => { setChecked(false); setAnswers(lesson.quiz.map(() => null)) }}
                    className="px-5 py-2.5 bg-s4 border border-b2 text-txt rounded-xl text-xs font-bold hover:border-b3 transition-colors">
                    ↻ Coba Lagi
                  </button>
                  <span className="text-[11px] text-err">Ada yang belum tepat — baca lagi materinya 📖</span>
                </>
              )}
            </div>
          </div>
        ) : (
          <div className="mx-5 mb-5 rounded-xl border border-ok/30 bg-ok/10 p-4 text-center">
            <p className="text-xs font-bold text-ok">✓ Pelajaran selesai — +{LESSON_XP} XP sudah diklaim</p>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function LearnPage() {
  const [progress, setProgress] = useState<Progress>(EMPTY)
  const [activeLesson, setActiveLesson] = useState<Lesson | null>(null)
  const [activeTool, setActiveTool] = useState<string | null>(null)

  const router = useRouter()
  const { user: authUser } = useAuthStore()
  const storeKey = authUser ? `halea_learn_${authUser.id}` : 'halea_learn_guest'

  const doneSet = new Set(progress.done)
  const totalLessons = CHAPTERS.reduce((s, c) => s + c.lessons.length, 0)
  const rank = rankFor(progress.xp)
  const nextRank = RANKS[RANKS.indexOf(rank) + 1]
  const rankPct = nextRank ? Math.min(100, Math.round((progress.xp - rank.xp) / (nextRank.xp - rank.xp) * 100)) : 100

  // load + claim missions on mount and when returning to the tab
  const progressRef = useRef(progress)
  useEffect(() => { progressRef.current = progress }, [progress])

  const refresh = useCallback((announce: boolean) => {
    const base = progressRef.current === EMPTY ? loadProgress(storeKey) : progressRef.current
    const { next, gained } = claimMissions(base)
    if (next !== progressRef.current) {
      saveProgress(storeKey, next)
      progressRef.current = next
      setProgress(next)
    }
    if (gained && announce) toast(`🎯 Misi selesai! +${gained} XP`)
  }, [storeKey])

  useEffect(() => {
    // reset & reload saat ganti akun (progress per user)
    progressRef.current = EMPTY
    setProgress(EMPTY)
    refresh(true)
    const onFocus = () => refresh(true)
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [refresh])

  const openLesson = (l: Lesson) => {
    if (!authUser) {
      toast('Daftar gratis dulu untuk mulai belajar ✦', 'warn')
      router.push('/login?next=/learn')
      return
    }
    setActiveLesson(l)
  }

  const isUnlocked = (ci: number) => {
    if (ci === 0) return true
    const prev = CHAPTERS[ci - 1]
    const need = Math.ceil(prev.lessons.length * 0.6)
    return prev.lessons.filter(l => doneSet.has(l.id)).length >= need
  }

  const completeLesson = (lesson: Lesson) => {
    const prev = progressRef.current
    if (!prev.done.includes(lesson.id)) {
      const before = rankFor(prev.xp)
      const next = { ...prev, done: [...prev.done, lesson.id], xp: prev.xp + LESSON_XP }
      saveProgress(storeKey, next)
      progressRef.current = next
      setProgress(next)
      toast(`✓ +${LESSON_XP} XP — ${lesson.title}`)
      const after = rankFor(next.xp)
      if (after !== before) setTimeout(() => toast(`🎉 Naik rank: ${after.title} ${after.icon}`), 800)
    }
    setActiveLesson(null)
  }

  const manualMission = (flag: string) => {
    try { localStorage.setItem(flag, '1') } catch {}
    refresh(true)
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10">

      {/* ── Header + progress ── */}
      <div className="mb-10">
        <p className="text-[10px] font-bold tracking-[.2em] uppercase text-accent mb-3">HALEA Academy</p>
        <h1 className="font-fraunces text-4xl sm:text-5xl font-semibold mb-3">
          Belajar <span className="italic text-accent">Color Grading</span>
        </h1>
        <p className="text-t2 text-sm mb-6 max-w-xl leading-relaxed">
          6 bab berjenjang dari nol sampai jadi creator. Selesaikan pelajaran, lulus kuis, kerjakan misi — kumpulkan XP.
        </p>

        {!authUser && (
          <div className="bg-accent/10 border border-accent/25 rounded-2xl px-5 py-4 mb-5 flex flex-col sm:flex-row sm:items-center gap-3">
            <p className="text-sm text-t2 flex-1">
              <strong className="text-txt">Daftar gratis</strong> untuk mulai belajar — progres & XP tersimpan di akunmu, plus bonus kredit AI 🎁
            </p>
            <Link href="/login?next=/learn"
              className="px-5 py-2.5 bg-accent text-white rounded-xl text-xs font-black text-center hover:bg-orange-400 transition-colors flex-shrink-0">
              Daftar Sekarang →
            </Link>
          </div>
        )}

        <div className="bg-s2 border border-b1 rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center gap-5">
          <div className="flex items-center gap-4 flex-1 min-w-0">
            <span className="text-4xl flex-shrink-0">{rank.icon}</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline justify-between gap-3 mb-1.5">
                <p className="font-bold text-base">{rank.title}</p>
                <p className="text-[11px] font-mono text-accent font-bold flex-shrink-0">{progress.xp} XP</p>
              </div>
              <div className="h-2 bg-s4 rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-accent to-orange-400 rounded-full transition-all duration-700" style={{ width: rankPct + '%' }} />
              </div>
              <p className="text-[10px] text-t3 mt-1.5">
                {nextRank ? `${nextRank.xp - progress.xp} XP lagi menuju ${nextRank.title} ${nextRank.icon}` : 'Rank maksimal tercapai! 👑'}
              </p>
            </div>
          </div>
          <div className="flex gap-6 sm:gap-5 sm:border-l border-b1 sm:pl-5 flex-shrink-0">
            <div className="text-center">
              <p className="font-black text-xl text-accent">{progress.done.length}<span className="text-t3 text-sm font-bold">/{totalLessons}</span></p>
              <p className="text-[9px] text-t3 uppercase tracking-wider font-bold">Pelajaran</p>
            </div>
            <div className="text-center">
              <p className="font-black text-xl text-a2">{progress.missions.length}</p>
              <p className="text-[9px] text-t3 uppercase tracking-wider font-bold">Misi</p>
            </div>
            <div className="text-center">
              <p className="font-black text-xl text-ok">{Math.round(progress.done.length / totalLessons * 100)}%</p>
              <p className="text-[9px] text-t3 uppercase tracking-wider font-bold">Selesai</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Learning path ── */}
      <section className="mb-16 flex flex-col gap-8">
        {CHAPTERS.map((ch, ci) => {
          const open = isUnlocked(ci)
          const doneCount = ch.lessons.filter(l => doneSet.has(l.id)).length
          const prevCh = CHAPTERS[ci - 1]
          const needMore = prevCh ? Math.ceil(prevCh.lessons.length * 0.6) - prevCh.lessons.filter(l => doneSet.has(l.id)).length : 0
          return (
            <div key={ch.id} className={open ? '' : 'opacity-60'}>
              {/* Chapter header */}
              <div className="flex items-center gap-3 mb-4">
                <span className="text-2xl">{open ? ch.icon : '🔒'}</span>
                <div className="flex-1 min-w-0">
                  <h2 className="font-bold text-lg leading-tight">Bab {ci + 1} — {ch.title}</h2>
                  <p className="text-t3 text-xs mt-0.5">{ch.desc}</p>
                </div>
                <span className={`text-[10px] font-mono font-bold flex-shrink-0 px-2.5 py-1 rounded-full border ${doneCount === ch.lessons.length ? 'text-ok border-ok/30 bg-ok/10' : 'text-t2 border-b1 bg-s2'}`}>
                  {doneCount}/{ch.lessons.length}
                </span>
              </div>

              {!open ? (
                <div className="bg-s2 border border-dashed border-b2 rounded-2xl px-5 py-6 text-center">
                  <p className="text-sm text-t3">
                    🔒 Selesaikan <strong className="text-txt">{needMore} pelajaran lagi</strong> di Bab {ci} untuk membuka
                  </p>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {ch.lessons.map((l, li) => {
                    const done = doneSet.has(l.id)
                    const missionDone = !!l.mission && progress.missions.includes(l.mission.flag)
                    return (
                      <button key={l.id} onClick={() => openLesson(l)}
                        className={`flex items-center gap-4 border rounded-xl p-4 text-left transition-all hover:-translate-y-0.5 ${done ? 'bg-ok/5 border-ok/25' : 'bg-s2 border-b1 hover:border-b3'}`}>
                        <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-black flex-shrink-0 ${done ? 'bg-ok/20 text-ok' : 'bg-s4 text-t2'}`}>
                          {done ? '✓' : li + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-sm leading-tight">{l.title}</p>
                          <p className="text-t3 text-xs mt-0.5 truncate">{l.sub} · ⏱ {l.mins} mnt</p>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {l.mission && (
                            <span className={`text-[9px] font-black px-2 py-1 rounded-full border ${missionDone ? 'text-ok border-ok/30 bg-ok/10' : 'text-a2 border-a2/30 bg-a2/10'}`}>
                              {missionDone ? '🎯 ✓' : '🎯 MISI'}
                            </span>
                          )}
                          <span className={`text-[10px] font-mono font-bold ${done ? 'text-ok' : 'text-t3'}`}>
                            {done ? '+' + LESSON_XP : LESSON_XP + ' XP'}
                          </span>
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </section>

      {/* ── Quick tools ── */}
      <section id="tools" className="mb-16">
        <h2 className="font-bold text-xl mb-5">🛠 Alat Cepat</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {TOOLS.map(t => (
            <button key={t.id} onClick={() => setActiveTool(activeTool === t.id ? null : t.id)}
              className={`bg-s2 border rounded-xl p-4 text-left hover:-translate-y-0.5 transition-all ${activeTool === t.id ? 'border-accent bg-s3' : 'border-b1 hover:border-b3'}`}>
              <span className="text-2xl block mb-2">{t.icon}</span>
              <p className="font-bold text-xs mb-1">{t.title}</p>
              <span className={`text-[9px] font-black tracking-widest ${t.color}`}>{t.badge}</span>
            </button>
          ))}
        </div>
        {activeTool && TOOL_CONTENT[activeTool] && (
          <div className="mt-4 bg-s2 border border-b1 rounded-2xl p-6 animate-fade-in">
            {TOOL_CONTENT[activeTool]()}
          </div>
        )}
      </section>

      {/* Lesson Modal */}
      {activeLesson && (
        <LessonModal
          key={activeLesson.id}
          lesson={activeLesson}
          isDone={doneSet.has(activeLesson.id)}
          missionDone={!!activeLesson.mission && progress.missions.includes(activeLesson.mission.flag)}
          onClose={() => setActiveLesson(null)}
          onComplete={completeLesson}
          onManualMission={manualMission}
        />
      )}
    </div>
  )
}

// ── Quick tools (unchanged) ───────────────────────────────────────────────────
const TOOLS = [
  { id: 'grainGen',  icon: '🎞', title: 'Film Grain Generator', badge: 'NEW', color: 'text-accent' },
  { id: 'frameCalc', icon: '⏱', title: 'Frame Rate Calc', badge: 'CALC', color: 'text-a2' },
  { id: 'colorTemp', icon: '🌡', title: 'Color Temp Chart', badge: 'REF', color: 'text-warn' },
  { id: 'logGuide',  icon: '📊', title: 'Log Exposure Guide', badge: 'GUIDE', color: 'text-accent' },
  { id: 'storage',   icon: '💾', title: 'Storage Calculator', badge: 'CALC', color: 'text-a2' },
  { id: 'aspect',    icon: '📐', title: 'Aspect Ratio Guide', badge: 'REF', color: 'text-a3' },
  { id: 'shortcuts', icon: '⌨️', title: 'Premiere Shortcuts', badge: 'CHEAT', color: 'text-a4' },
  { id: 'shotMatch', icon: '🎨', title: 'Shot Match Tips', badge: 'TIPS', color: 'text-ok' },
  { id: 'export',    icon: '🚀', title: 'Export Settings', badge: 'GUIDE', color: 'text-accent' },
]

// Lazy factories so each click mounts a fresh component instance
const TOOL_CONTENT: Record<string, () => JSX.Element> = {
  grainGen:  () => <GrainGen />,
  frameCalc: () => <FrameCalc />,
  colorTemp: () => <ColorTempChart />,
  logGuide:  () => <LogGuide />,
  storage:   () => <StorageCalc />,
  shortcuts: () => <ShortcutsSheet />,
  aspect:    () => <AspectGuide />,
  shotMatch: () => <ShotMatchTips />,
  export:    () => <ExportGuide />,
}

function FrameCalc() {
  const [fps, setFps] = useState('30')
  const [dur, setDur] = useState(60)
  const frames = Math.round(parseFloat(fps) * dur)
  const tc = [Math.floor(dur/3600), Math.floor(dur/60)%60, dur%60, Math.round(frames%(parseFloat(fps)||30))].map(v=>String(Math.floor(v)).padStart(2,'0')).join(':')
  return (
    <div><h3 className="font-bold text-base mb-4">⏱ Frame Rate Calculator</h3>
    <div className="grid grid-cols-2 gap-3 mb-4">
      <div><label className="text-[9px] font-black tracking-widest uppercase text-t3 block mb-1.5">FPS</label>
        <select value={fps} onChange={e=>setFps(e.target.value)} className="w-full bg-s3 border border-b1 text-txt px-3 py-2 rounded-lg text-sm outline-none">
          {['23.976','24','25','30','50','60','120'].map(f=><option key={f}>{f}</option>)}
        </select></div>
      <div><label className="text-[9px] font-black tracking-widest uppercase text-t3 block mb-1.5">Duration (sec)</label>
        <input type="number" value={dur} onChange={e=>setDur(+e.target.value)} className="w-full bg-s3 border border-b1 text-txt px-3 py-2 rounded-lg text-sm outline-none" /></div>
    </div>
    <div className="bg-s3 rounded-xl p-4 font-mono text-sm space-y-1">
      <p>FPS: <span className="text-accent">{fps}</span></p>
      <p>Duration: <span className="text-accent">{dur}s</span></p>
      <p>Total Frames: <span className="text-accent font-bold">{frames.toLocaleString()}</span></p>
      <p>Timecode: <span className="text-accent">{tc}</span></p>
    </div></div>
  )
}

function ColorTempChart() {
  const temps = [['1800K','Candlelight','#ff6000'],['2700K','Warm Bulb','#ff8c40'],['3200K','Tungsten','#ffaa60'],['4000K','Cool White','#ffd090'],['5000K','Daylight','#fff5e0'],['5600K','Noon Sun','#fffef5'],['6500K','Overcast','#f0f8ff'],['7500K','Cloudy','#d8ecff'],['9000K','Blue Sky','#a8ccff']]
  return (<div><h3 className="font-bold text-base mb-4">🌡 Color Temperature</h3>
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      {temps.map(([k,l,c])=>(
        <div key={k} className="flex items-center gap-3 bg-s3 rounded-xl p-3">
          <div className="w-8 h-8 rounded-lg flex-shrink-0 border border-white/10" style={{background:c}}/>
          <div><p className="font-mono text-sm font-bold text-accent">{k}</p><p className="text-xs text-t2">{l}</p></div>
        </div>))}
    </div></div>)
}

function LogGuide() {
  const logs = [['S-Log2','Sony','Expose +1 to +2 stops. Middle grey ≈ 32%.'],['S-Log3','Sony','Expose +1.5 to +2. Middle grey ≈ 41%.'],['F-Log2','Fujifilm','Expose +1.5. 14+ stops DR.'],['D-Log M','DJI','Expose +0.5 to +1. Osmo Pocket 3.'],['Apple Log','iPhone','Expose +0.5. Auto metering accurate.'],['V-Log','Panasonic','Expose 0 to +1. Wide latitude.']]
  return (<div><h3 className="font-bold text-base mb-4">📊 Log Exposure Guide</h3>
    {logs.map(([n,c,t])=>(<div key={n} className="flex gap-3 bg-s3 rounded-xl p-3 mb-2"><div className="flex-shrink-0"><p className="font-bold text-sm text-accent">{n}</p><p className="text-[10px] text-t3">{c}</p></div><p className="text-xs text-t2 leading-relaxed">{t}</p></div>))}</div>)
}

function StorageCalc() {
  const [mbps, setMbps] = useState(100)
  const [dur, setDur] = useState(60)
  const gb = (mbps*1e6/8*dur*60/1e9).toFixed(1)
  return (<div><h3 className="font-bold text-base mb-4">💾 Storage Calculator</h3>
    <div className="grid grid-cols-2 gap-3 mb-4">
      <div><label className="text-[9px] font-black tracking-widest uppercase text-t3 block mb-1.5">Bitrate (Mbps)</label>
        <select value={mbps} onChange={e=>setMbps(+e.target.value)} className="w-full bg-s3 border border-b1 text-txt px-3 py-2 rounded-lg text-sm outline-none">
          {[[25,'H.264 4K 25'],[50,'H.264 4K 50'],[100,'H.265 100'],[200,'ProRes Proxy'],[400,'ProRes HQ'],[800,'RAW']].map(([v,l])=><option key={v} value={v}>{l} Mbps</option>)}
        </select></div>
      <div><label className="text-[9px] font-black tracking-widest uppercase text-t3 block mb-1.5">Duration (min)</label>
        <input type="number" value={dur} onChange={e=>setDur(+e.target.value)} className="w-full bg-s3 border border-b1 text-txt px-3 py-2 rounded-lg text-sm outline-none" /></div>
    </div>
    <div className="bg-s3 rounded-xl p-4 font-mono text-sm space-y-1">
      <p>File Size: <span className="text-accent font-bold">{gb} GB</span></p>
      <p>256GB card: <span className="text-accent">~{Math.floor(256/+gb)} clips</span></p>
      <p>1TB SSD: <span className="text-accent">~{Math.floor(1000/+gb)} clips</span></p>
    </div></div>)
}

function ShortcutsSheet() {
  const groups = [['NAVIGATION',[['J/K/L','Rewind/Pause/Forward'],['Space','Play/Pause'],['Shift+←→','5 frames jump']]],['EDITING',[['C','Razor'],['V','Selection'],['Ctrl+K','Cut at playhead'],['Q/W','Ripple trim']]],['COLOR',[['Shift+5','Lumetri panel'],['~','Maximize panel']]],['EXPORT',[['Ctrl+M','Export Media'],['Ctrl+Shift+E','Export Frame']]]]
  return (<div><h3 className="font-bold text-base mb-4">⌨️ Premiere Pro Shortcuts</h3>
    {groups.map(([g, items])=>(<div key={String(g)} className="mb-3"><p className="text-[9px] font-black tracking-widest uppercase text-t3 mb-2">{String(g)}</p>
      {(items as string[][]).map(([k,v])=>(<div key={k} className="flex justify-between bg-s3 rounded-lg px-3 py-2 mb-1"><span className="font-mono text-xs text-accent">{k}</span><span className="text-xs text-t2">{v}</span></div>))}
    </div>))}</div>)
}

function AspectGuide() {
  const ratios = [['16:9','1920×1080','YouTube, broadcast'],['2.39:1','Anamorphic','Cinema widescreen'],['9:16','1080×1920','TikTok, Reels'],['1:1','1080×1080','Instagram square'],['4:5','1080×1350','Instagram portrait']]
  return (<div><h3 className="font-bold text-base mb-4">📐 Aspect Ratio Guide</h3>
    {ratios.map(([r,res,use])=>(<div key={r} className="flex justify-between bg-s3 rounded-xl px-4 py-3 mb-2"><span className="font-mono text-sm font-bold text-accent">{r}</span><span className="text-xs text-t3">{res}</span><span className="text-xs text-t2">{use}</span></div>))}</div>)
}

function ShotMatchTips() {
  const tips = [['Match Exposure First','Cek waveform. Samain exposure semua klip sebelum grading.'],['Neutralize WB','Set white balance konsisten dulu pakai grey card / referensi.'],['Skin Tone is King','Skin tone = anchor utama. Konsistenin warna kulit dulu.'],['Use Color Wheels','Lift/Gamma/Gain lebih powerful dari slider untuk match.']]
  return (<div><h3 className="font-bold text-base mb-4">🎨 Shot Match Tips</h3>
    {tips.map(([t,d])=>(<div key={t} className="bg-s3 rounded-xl p-3 mb-2"><p className="font-bold text-xs text-accent mb-1">{t}</p><p className="text-xs text-t2 leading-relaxed">{d}</p></div>))}</div>)
}

function ExportGuide() {
  const settings = [['YouTube 4K','H.264/265 · 3840×2160 · 35-45 Mbps'],['YouTube 1080p','H.264 · 1920×1080 · 15-20 Mbps'],['Instagram Reels','H.264 · 1080×1920 · 8-12 Mbps'],['TikTok','H.264 · 1080×1920 · 8-10 Mbps'],['Master/Archive','ProRes 422 HQ · match source res']]
  return (<div><h3 className="font-bold text-base mb-4">🚀 Export Settings</h3>
    {settings.map(([p,s])=>(<div key={p} className="bg-s3 rounded-xl px-4 py-3 mb-2"><p className="font-bold text-xs text-txt mb-0.5">{p}</p><p className="text-xs text-t2 font-mono">{s}</p></div>))}</div>)
}

function GrainGen() {
  const [intensity, setIntensity] = useState(35)
  const [res,       setRes]       = useState('1920x1080')
  const [type,      setType]      = useState<'mono'|'warm'|'cool'|'film'>('warm')
  const [generating,setGenerating]= useState(false)
  const [previewUrl,setPreviewUrl]= useState<string|null>(null)

  // Generate a small 320×180 preview on param change
  const updatePreview = (t: typeof type, intens: number) => {
    const c = document.createElement('canvas')
    c.width = 320; c.height = 180
    const ctx = c.getContext('2d')!
    const img = ctx.createImageData(320, 180)
    const d = img.data
    for (let i = 0; i < d.length; i += 4) {
      const n  = (Math.random() * 2 - 1) * intens
      const n2 = (Math.random() * 2 - 1) * intens * 0.3
      let r = 128 + n + n2
      let g = 128 + n + n2 * 0.8
      let b = 128 + n + n2 * 0.6
      if (t === 'warm') { r += 10; b -= 12 }
      else if (t === 'cool') { r -= 8; b += 14 }
      else if (t === 'film') { r += 6; g += 1; b -= 8 }
      d[i]=Math.max(0,Math.min(255,r)); d[i+1]=Math.max(0,Math.min(255,g))
      d[i+2]=Math.max(0,Math.min(255,b)); d[i+3]=255
    }
    ctx.putImageData(img, 0, 0)
    setPreviewUrl(c.toDataURL('image/jpeg', 0.92))
  }

  // Generate preview on first render
  useEffect(() => { updatePreview('warm', 35) }, [])

  const generate = () => {
    setGenerating(true)
    setTimeout(() => {
      try {
        const [w, h] = res.split('x').map(Number)
        const c = document.createElement('canvas')
        c.width = w; c.height = h
        const ctx = c.getContext('2d')!
        const img = ctx.createImageData(w, h)
        const d = img.data
        for (let i = 0; i < d.length; i += 4) {
          const n  = (Math.random() * 2 - 1) * intensity
          const n2 = (Math.random() * 2 - 1) * intensity * 0.3
          let r = 128 + n + n2
          let g = 128 + n + n2 * 0.8
          let b = 128 + n + n2 * 0.6
          if (type === 'warm') { r += 10; b -= 12 }
          else if (type === 'cool') { r -= 8; b += 14 }
          else if (type === 'film') { r += 6; g += 1; b -= 8 }
          d[i]=Math.max(0,Math.min(255,r)); d[i+1]=Math.max(0,Math.min(255,g))
          d[i+2]=Math.max(0,Math.min(255,b)); d[i+3]=255
        }
        ctx.putImageData(img, 0, 0)
        const a = document.createElement('a')
        a.href = c.toDataURL('image/png')
        a.download = `HALEA_Grain_${type}_${intensity}.png`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
      } catch {}
      setGenerating(false)
    }, 80)
  }

  return (
    <div>
      <h3 className="font-bold text-base mb-1">🎞 Film Grain Generator</h3>
      <p className="text-xs text-t3 mb-4 leading-relaxed">
        Generate PNG overlay 50% gray dengan film grain. Di timeline: Import PNG → set blend mode <strong className="text-txt">Overlay</strong> atau <strong className="text-txt">Soft Light</strong> → turunin opacity 20–50%.
      </p>
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div>
          <label className="text-[9px] font-black tracking-widest uppercase text-t3 block mb-1.5">Resolusi</label>
          <select value={res} onChange={e=>setRes(e.target.value)} className="w-full bg-s3 border border-b1 text-txt px-3 py-2 rounded-lg text-sm outline-none">
            {[['1920x1080','1080p Full HD'],['3840x2160','4K UHD'],['1080x1920','1080p Vertical']].map(([v,l])=><option key={v} value={v}>{l}</option>)}
          </select>
        </div>
        <div>
          <label className="text-[9px] font-black tracking-widest uppercase text-t3 block mb-1.5">Karakter Grain</label>
          <select value={type} onChange={e=>{const v=e.target.value as typeof type;setType(v);updatePreview(v,intensity)}} className="w-full bg-s3 border border-b1 text-txt px-3 py-2 rounded-lg text-sm outline-none">
            <option value="mono">Mono (netral)</option>
            <option value="warm">Warm (analog Kodak)</option>
            <option value="cool">Cool (Fuji Superia)</option>
            <option value="film">Film (CineStill-like)</option>
          </select>
        </div>
      </div>
      <div className="mb-4">
        <label className="text-[9px] font-black tracking-widest uppercase text-t3 block mb-2">Intensitas — {intensity}</label>
        <input type="range" min={10} max={80} value={intensity}
          onChange={e=>{const v=+e.target.value;setIntensity(v);updatePreview(type,v)}}
          className="w-full"/>
        <div className="flex justify-between text-[9px] text-t3 mt-1"><span>Halus</span><span>Kasar</span></div>
      </div>
      {/* Live preview */}
      {previewUrl && (
        <div className="mb-4 rounded-xl overflow-hidden border border-b1 relative">
          <img src={previewUrl} alt="Grain preview" className="w-full h-28 object-cover"/>
          <span className="absolute bottom-2 right-2 text-[9px] bg-black/60 text-white/60 px-2 py-0.5 rounded font-mono">preview</span>
        </div>
      )}
      <div className="bg-s3 rounded-xl p-3 mb-4 text-xs text-t2 space-y-1 font-mono">
        <p>Resolusi: <span className="text-accent">{res}</span></p>
        <p>Tipe: <span className="text-accent capitalize">{type}</span></p>
        <p>Intensitas: <span className="text-accent">{intensity}/80</span></p>
        <p>File: <span className="text-accent">HALEA_Grain_{type}_{intensity}.png</span></p>
      </div>
      <button onClick={generate} disabled={generating}
        className="w-full py-3 bg-accent text-white rounded-xl text-sm font-black hover:bg-orange-400 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
        {generating?<><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/>Generating...</>:'⬇ Generate & Download PNG'}
      </button>
      <p className="text-[9px] text-t3 text-center mt-2">4K membutuhkan beberapa detik — file PNG ~15–30MB</p>
    </div>
  )
}
