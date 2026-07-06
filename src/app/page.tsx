'use client'
import Link from 'next/link'
import { useT } from '@/lib/i18n'

const FEATURES = [
  { icon: '🎞', title: 'LUT Studio', desc: 'Pipeline grading berbasis node yang menghasilkan file .cube — Primary, Curves, HSL, Halation.', href: '/studio', badge: 'PRO', bc: 'text-accent' },
  { icon: '✦',  title: 'AI Match', desc: 'Analisis warna otomatis dari foto referensi. Upload foto, dapatkan grade-nya secara instan.', href: '/studio', badge: 'AI', bc: 'text-a4' },
  { icon: '🤖', title: 'HALEA AI', desc: 'Asisten color grading berbasis AI. Tanya soal LUT, film look, strategi jualan preset — semua dijawab.', href: '/ai', badge: 'FREE', bc: 'text-ok' },
  { icon: '🛍', title: 'Shop', desc: 'LUT & preset premium karya @haleastudio. Gratis & berbayar. Download langsung, pakai selamanya.', href: '/shop', badge: 'SHOP', bc: 'text-a2' },
  { icon: '🛠', title: 'Editor Tools', desc: 'Frame calc, color temp chart, panduan log exposure, storage calc, shortcut Premiere Pro.', href: '/learn', badge: 'TOOLS', bc: 'text-warn' },
  { icon: '📚', title: 'Belajar', desc: '15+ modul belajar color grading dari dasar sampai bisnis jualan preset ke pasar global.', href: '/learn', badge: 'FREE', bc: 'text-ok' },
]

const COMPAT = ['Premiere Pro', 'DaVinci Resolve', 'After Effects', 'Final Cut Pro', 'Lightroom', 'CapCut Pro']

export default function Home() {
  const t = useT()
  return (
    <div className="flex flex-col">

      {/* Hero */}
      <section className="relative min-h-[92vh] flex items-center justify-center overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-accent/5 rounded-full blur-[120px]" />
          <div className="absolute top-1/2 left-1/4 w-[300px] h-[300px] bg-a4/5 rounded-full blur-[80px]" />
          <div className="absolute bottom-1/3 right-1/4 w-[250px] h-[250px] bg-a3/5 rounded-full blur-[80px]" />
        </div>

        <div className="relative z-10 max-w-5xl mx-auto px-4 text-center">
          <div className="flex items-center justify-center gap-3 mb-8">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-accent to-orange-400 flex items-center justify-center glow-accent">
              <svg width="26" height="26" viewBox="0 0 20 20"><circle cx="10" cy="10" r="3" fill="white"/><circle cx="10" cy="10" r="6.5" fill="none" stroke="white" strokeWidth="1.2" opacity=".5"/><circle cx="10" cy="10" r="9" fill="none" stroke="white" strokeWidth=".5" opacity=".2"/></svg>
            </div>
          </div>

          <h1 className="font-fraunces text-6xl sm:text-8xl font-semibold mb-4 leading-none tracking-tight">
            HAL<span className="italic text-accent">E</span>A
          </h1>
          <p className="text-t2 text-lg sm:text-xl font-mono tracking-widest uppercase mb-3">
            {t('Warna Sinematik, Dirancang dengan Presisi')}
          </p>
          <p className="text-t2 max-w-lg mx-auto text-sm leading-relaxed mb-10">
            {t('Tools color grading profesional untuk video editor Indonesia. Generator LUT berbasis AI, Halation Studio, dan toko preset premium — semua dalam satu platform.')}
          </p>

          <div className="flex flex-wrap gap-3 justify-center mb-12">
            <Link href="/studio"
              className="px-8 py-3.5 bg-accent text-white text-sm font-bold tracking-wide rounded-xl hover:bg-orange-400 hover:-translate-y-0.5 transition-all shadow-lg shadow-accent/25">
              {t('Buka Studio')}
            </Link>
            <Link href="/shop"
              className="px-8 py-3.5 bg-s3 border border-b1 text-txt text-sm font-bold tracking-wide rounded-xl hover:border-b3 hover:-translate-y-0.5 transition-all">
              {t('Lihat Shop')}
            </Link>
          </div>

          <div className="flex flex-wrap justify-center gap-2">
            {COMPAT.map(c => (
              <span key={c} className="px-3 py-1 bg-s2 border border-b1 rounded-full text-t3 text-[10px] font-bold tracking-wide">{c}</span>
            ))}
          </div>
        </div>

        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 text-t3">
          <div className="w-px h-8 bg-gradient-to-b from-transparent to-b1" />
          <span className="text-[9px] tracking-widest uppercase font-bold">Scroll</span>
        </div>
      </section>

      {/* Features */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 py-24 w-full">
        <div className="text-center mb-14">
          <p className="text-[10px] font-bold tracking-[.2em] uppercase text-accent mb-3">{t('Apa yang ada di HALEA')}</p>
          <h2 className="font-fraunces text-4xl sm:text-5xl font-semibold">
            {t('Semua yang kamu butuhkan untuk')}<br />
            <span className="italic text-accent">{t('grade seperti profesional')}</span>
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {FEATURES.map(f => (
            <Link key={f.title} href={f.href}
              className="group bg-s2 border border-b1 rounded-2xl p-6 hover:border-accent/30 hover:bg-s3 hover:-translate-y-1 transition-all">
              <div className="flex items-start justify-between mb-4">
                <span className="text-3xl">{f.icon}</span>
                <span className={`text-[9px] font-black tracking-widest uppercase px-2 py-1 rounded border border-current bg-current/10 ${f.bc}`}>{f.badge}</span>
              </div>
              <h3 className="font-bold text-base mb-2 group-hover:text-accent transition-colors">{t(f.title)}</h3>
              <p className="text-t2 text-xs leading-relaxed">{t(f.desc)}</p>
            </Link>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-b1 bg-s1">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-16 flex flex-col sm:flex-row items-center justify-between gap-6">
          <div>
            <h3 className="font-fraunces text-2xl font-semibold mb-1">{t('Mulai grading sinematik sekarang.')}</h3>
            <p className="text-t2 text-sm">{t('Tools gratis, berbasis AI, kompatibel dengan semua NLE.')}</p>
          </div>
          <div className="flex gap-3">
            <Link href="/studio" className="px-6 py-3 bg-accent text-white text-sm font-bold rounded-xl hover:bg-orange-400 transition-colors">
              {t('Buka Studio')} →
            </Link>
            <a href="https://instagram.com/haleastudio" target="_blank"
              className="px-6 py-3 bg-s3 border border-b1 text-t2 text-sm font-bold rounded-xl hover:border-b3 transition-colors">
              @haleastudio
            </a>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-b1 bg-bg py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-t3 text-xs font-mono">
          <span>© 2025 HALEA — by <a href="https://instagram.com/haleastudio" target="_blank" className="hover:text-accent transition-colors">@haleastudio</a></span>
          <div className="flex gap-4">
            {[['/', 'Beranda'], ['/studio', 'Studio'], ['/shop', 'Shop'], ['/ai', 'AI'], ['/learn', 'Belajar']].map(([href, label]) => (
              <Link key={href} href={href} className="hover:text-txt transition-colors">{t(label)}</Link>
            ))}
          </div>
        </div>
      </footer>
    </div>
  )
}
