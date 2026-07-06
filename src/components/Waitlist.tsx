'use client'
import { useState } from 'react'
import { Instagram, Check, Film, Palette, Code2 } from 'lucide-react'
import { joinWaitlist } from '@/lib/launch'
import { useI18n, useT } from '@/lib/i18n'

const FEATURES = [
  ['🎬', 'Color Match Studio', 'Tiru look dari foto referensi mana pun — engine v8 content-aware mencocokkan region footage-mu ke referensi. Bukan filter, tapi transformasi yang dihitung.'],
  ['✨', 'AI Look dari Prompt', 'Ketik "kayak film Godfather" atau "sunset Bali hangat" — AI colorist nerjemahin jadi grade berlapis yang baca footage-mu dulu.'],
  ['⚡', 'Shot Matcher', 'Banyak klip beda kamera/lighting? Samakan semua ke satu master look — tiap klip dapat LUT-nya sendiri.'],
  ['🪵', 'Log Support', 'S-Log3, V-Log, D-Log, Apple Log, F-Log, C-Log3, HLG — di-decode pakai rumus resmi vendor, auto-deteksi.'],
  ['💎', 'Precision Grade 65³', 'Export LUT ultra-fidelity untuk DaVinci & project klien — gradien halus, banding minimal.'],
  ['🧬', 'HALEA Code', 'Satu look = satu baris teks. Share di caption, paste, langsung kepake. Tanpa upload file.'],
  ['🎓', 'HALEA Academy', '26 pelajaran color grading gamified + Grading Gym harian + sertifikat. Dari nol sampai jadi creator.'],
  ['🤖', 'HALEA AI', 'Konsultan color grading 24 jam dalam Bahasa Indonesia.'],
]

const ENGINE = [
  ['Content-Aware Matching', 'Region dicocokkan per konten — langit ke langit, awan tetap netral. Look nempel tanpa merusak subjek.'],
  ['Split-Tone Cast', 'Tint film di shadow & highlight — DNA sebuah look — diukur dari referensi dan dikenakan ke seluruh frame.'],
  ['Skin Intelligence', 'Kulit ikut look tapi dijaga tetap natural — tidak pernah jadi hijau, oranye neon, atau keabuan.'],
  ['100% di Perangkatmu', 'Fotomu tidak pernah di-upload ke server. Privat, instan, gratis dijalankan.'],
]

export function Waitlist() {
  const [email, setEmail] = useState('')
  const [done, setDone] = useState(false)
  const { locale, setLocale } = useI18n()
  const t = useT()

  const [busy, setBusy] = useState(false)
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    const ok = await joinWaitlist(email)
    setBusy(false)
    if (ok) setDone(true)
  }

  return (
    <main className="min-h-screen">

      {/* ── HERO ── */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-accent/8 rounded-full blur-[160px]" />
        </div>

        {/* language switch — standalone page has no navbar */}
        <div className="absolute top-4 right-4 z-10 flex items-center rounded-full border border-b1 bg-s2/80 backdrop-blur p-0.5">
          {(['id', 'en'] as const).map(l => (
            <button key={l} onClick={() => setLocale(l)}
              className={`px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-wider transition-colors ${locale === l ? 'bg-accent text-white' : 'text-t3 hover:text-txt'}`}>
              {l}
            </button>
          ))}
        </div>

        <div className="relative max-w-3xl mx-auto px-6 pt-20 pb-16 md:pt-28 text-center">
          {/* logo mark */}
          <div className="flex justify-center mb-6">
            <svg width="64" height="64" viewBox="0 0 72 72">
              <circle cx="36" cy="36" r="32" fill="none" stroke="#f97316" strokeWidth="1" opacity="0.18"/>
              <circle cx="36" cy="36" r="22" fill="none" stroke="#f97316" strokeWidth="1.5" opacity="0.45"/>
              <circle cx="36" cy="36" r="13" fill="none" stroke="#f97316" strokeWidth="2" opacity="0.7"/>
              <circle cx="36" cy="36" r="6" fill="#f97316"/>
            </svg>
          </div>
          <span className="inline-block text-[10px] font-black tracking-[0.3em] uppercase text-accent border border-accent/30 bg-accent/10 rounded-full px-4 py-1.5 mb-6">
            {t('✦ Segera Hadir')}
          </span>
          <h1 className="font-fraunces text-4xl md:text-6xl font-semibold leading-tight mb-5">
            {t('Color grading sinematik,')}<br/><span className="italic text-accent">{t('secerdas colorist pro.')}</span>
          </h1>
          <p className="text-t2 text-base md:text-lg leading-relaxed max-w-xl mx-auto mb-9">
            {t('HALEA mengubah footage apa pun jadi look film — dari foto referensi, atau cukup ketik look yang kamu mau. Engine riset-grade, jalan 100% di browser, dibuat untuk kreator Indonesia.')}
          </p>

          {/* email capture */}
          {done ? (
            <div className="max-w-md mx-auto bg-ok/10 border border-ok/30 rounded-2xl px-6 py-5 flex items-center gap-3 justify-center animate-fade-in">
              <Check size={20} className="text-ok flex-shrink-0" />
              <p className="text-sm text-t2 text-left">{t('Kamu masuk waitlist! 🎉 Follow')} <a href="https://instagram.com/haleastudio" target="_blank" className="text-accent font-bold">@haleastudio</a> {t('biar ga ketinggalan kabar launch.')}</p>
            </div>
          ) : (
            <form onSubmit={submit} className="max-w-md mx-auto flex flex-col sm:flex-row gap-2.5">
              <input type="email" required value={email} onChange={e => setEmail(e.target.value)}
                placeholder={t('email kamu...')}
                className="flex-1 bg-s2 border border-b2 text-txt px-4 py-3.5 rounded-xl text-sm outline-none focus:border-accent transition-colors placeholder:text-t3"/>
              <button type="submit" disabled={busy}
                className="px-6 py-3.5 bg-accent text-white rounded-xl text-sm font-black uppercase tracking-wider hover:bg-orange-400 transition-all shadow-lg shadow-accent/25 whitespace-nowrap disabled:opacity-50">
                {busy ? t('Mendaftar...') : t('Gabung Waitlist')}
              </button>
            </form>
          )}
          <p className="text-[11px] text-t3 mt-3">{t('Dapatkan akses awal + bonus kredit AI saat launch. Gratis.')}</p>
        </div>
      </section>

      {/* ── WHY POWERFUL ── */}
      <section className="border-t border-b1 bg-s2/40">
        <div className="max-w-4xl mx-auto px-6 py-16 md:py-20">
          <div className="text-center mb-10">
            <p className="text-[9px] font-black tracking-[0.3em] uppercase text-accent mb-3">{t('Sepowerful apa?')}</p>
            <h2 className="font-fraunces text-3xl md:text-4xl font-semibold">
              {t('Bukan filter.')} <span className="italic text-accent">{t('Engine warna riset-grade.')}</span>
            </h2>
            <p className="text-t2 text-sm max-w-xl mx-auto mt-4 leading-relaxed">
              {t('Dibangun di atas riset color science industri film (Reinhard 2001, Pitié-Kokaram 2007, Chang 2015) — lalu dikembangkan 8 generasi. Inilah yang ada di dalamnya:')}
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {ENGINE.map(([ti, d]) => (
              <div key={ti} className="bg-s2 border border-b1 rounded-2xl p-5">
                <h3 className="font-bold text-sm mb-1.5 text-accent">{t(ti)}</h3>
                <p className="text-t2 text-[13px] leading-relaxed">{t(d)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FEATURES ── */}
      <section className="max-w-5xl mx-auto px-6 py-16 md:py-20">
        <div className="text-center mb-10">
          <p className="text-[9px] font-black tracking-[0.3em] uppercase text-accent mb-3">{t('Satu ekosistem lengkap')}</p>
          <h2 className="font-fraunces text-3xl md:text-4xl font-semibold">{t('Semua yang editor butuhkan')}</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {FEATURES.map(([icon, title, desc]) => (
            <div key={title} className="bg-s2 border border-b1 rounded-2xl p-5">
              <span className="text-2xl block mb-2.5">{icon}</span>
              <h3 className="font-bold text-sm mb-1.5">{t(title)}</h3>
              <p className="text-t3 text-[11px] leading-relaxed">{t(desc)}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── ACADEMY teaser ── */}
      <section className="border-t border-b1 bg-s2/40">
        <div className="max-w-3xl mx-auto px-6 py-16 md:py-20 text-center">
          <span className="text-4xl block mb-4">🎓</span>
          <h2 className="font-fraunces text-3xl md:text-4xl font-semibold mb-4">HALEA <span className="italic text-accent">Academy</span></h2>
          <p className="text-t2 text-sm leading-relaxed max-w-xl mx-auto mb-8">
            {t('Bukan cuma tool — juga tempat belajar. 6 bab berjenjang (26 pelajaran), kuis, misi praktek, Grading Gym harian dengan skor, dan sertifikat yang bisa dipajang di CV/bio. Dari nol sampai jadi creator yang dibayar.')}
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            {['Dasar Warna', 'Log & Kamera', 'Teknik Grading', 'Jual Preset', '🏋️ Grading Gym', '📜 Sertifikat'].map(c => (
              <span key={c} className="text-[11px] font-bold px-3 py-1.5 rounded-full bg-s3 border border-b1 text-t2">{t(c)}</span>
            ))}
          </div>
        </div>
      </section>

      {/* ── FOUNDER ── */}
      <section className="border-t border-b1">
        <div className="max-w-3xl mx-auto px-6 py-16 md:py-20">
          <p className="text-[9px] font-black tracking-[0.3em] uppercase text-accent mb-8 text-center">{t('Di balik HALEA')}</p>
          <div className="flex flex-col md:flex-row items-center gap-8 md:gap-12">
            {/* photo */}
            <div className="flex-shrink-0 relative">
              <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-accent/30 via-accent/10 to-transparent blur-2xl scale-110 opacity-70" />
              <div className="relative w-40 h-48 md:w-48 md:h-60 rounded-3xl overflow-hidden border border-accent/20 shadow-2xl shadow-black/60">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/robbie.jpg" alt="Robbie Satria" className="w-full h-full object-cover object-top"
                  onError={(e) => { e.currentTarget.src = 'https://unavatar.io/instagram/haleastudio' }} />
                <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent pointer-events-none" />
              </div>
            </div>
            {/* identity + story */}
            <div className="text-center md:text-left">
              <p className="text-[9px] font-black tracking-[0.3em] uppercase text-accent mb-2">Founder · HALEA</p>
              <h2 className="font-fraunces text-3xl md:text-4xl font-semibold mb-3">Robbie <span className="italic text-accent">Satria</span></h2>
              <div className="flex flex-wrap gap-2 justify-center md:justify-start mb-4">
                {[[<Film key="f" size={11} />, 'Content Creator'], [<Palette key="p" size={11} />, 'Video Editor'], [<Code2 key="c" size={11} />, 'Web Developer']].map(([ic, lb]) => (
                  <span key={String(lb)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-s3 border border-b2 text-[10px] font-bold text-t2 uppercase tracking-wider">{ic}{lb}</span>
                ))}
              </div>
              <p className="text-t2 text-[15px] leading-relaxed mb-3">
                {t('“Sejak 2017 aku habiskan ribuan jam di depan timeline — belajar color grading, nyobain ratusan LUT, ngejar look film yang aku suka. Tapi mendapatkan warna yang pas selalu makan waktu jauh lebih lama dari seharusnya.”')}
              </p>
              <p className="text-t2 text-[15px] leading-relaxed mb-5">
                {t('HALEA lahir dari frustrasi itu — dibuat oleh kreator yang ngerti langsung masalahnya, bukan perusahaan yang lihat peluang pasar.')}
                <strong className="text-txt"> {t('Tujuannya satu: bikin kamu fokus berkarya, bukan ngutak-atik warna.')}</strong>
              </p>
              <a href="https://instagram.com/haleastudio" target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-accent text-white text-xs font-bold hover:bg-orange-400 transition-all shadow-lg shadow-accent/25">
                <Instagram size={13} /> @haleastudio
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* ── FINAL CTA ── */}
      <section className="max-w-2xl mx-auto px-6 py-16 md:py-24 text-center">
        <h2 className="font-fraunces text-3xl md:text-4xl font-semibold mb-4">
          {t('Jadi yang')} <span className="italic text-accent">{t('pertama')}</span> {t('pas launch.')}
        </h2>
        <p className="text-t3 text-sm mb-8 max-w-md mx-auto">{t('Gabung waitlist sekarang, atau follow Instagram untuk update & sneak peek.')}</p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center items-center">
          {!done && (
            <button onClick={() => document.querySelector('input')?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
              className="px-6 py-3.5 bg-accent text-white rounded-xl text-sm font-bold hover:bg-orange-400 transition-colors w-full sm:w-auto">
              ↑ {t('Gabung Waitlist')}
            </button>
          )}
          <a href="https://instagram.com/haleastudio" target="_blank" rel="noopener noreferrer"
            className="px-6 py-3.5 bg-s3 border border-b2 text-t2 rounded-xl text-sm font-bold hover:border-accent/30 hover:text-accent transition-all flex items-center justify-center gap-2 w-full sm:w-auto">
            <Instagram size={15} /> @haleastudio
          </a>
        </div>
        <p className="text-[11px] text-t3 mt-12">© {new Date().getFullYear()} HALEA — by @haleastudio</p>
      </section>
    </main>
  )
}
