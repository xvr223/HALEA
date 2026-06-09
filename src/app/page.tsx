import Link from 'next/link'
import { Badge } from '@/components/ui'

const FEATURES = [
  { icon: '🎞', title: 'LUT Studio', desc: 'Node-based grading pipeline baked to universal .cube — Primary, Curves, HSL Secondary, Halation.', href: '/studio', badge: 'PRO' },
  { icon: '✦',  title: 'AI Match', desc: 'Claude Vision reads your reference photo and builds a precise grade automatically.', href: '/studio?mode=ai', badge: 'AI' },
  { icon: '🤖', title: 'AI Assistant', desc: 'Gemini-powered color grading expert. Tanya soal LUT, film look, atau strategi jualan preset.', href: '/ai', badge: 'FREE' },
  { icon: '🛍', title: 'Shop', desc: 'Premium LUTs & presets crafted by @robbiesatriaa. Free & paid. Instant download.', href: '/shop', badge: 'SHOP' },
  { icon: '🛠', title: 'Editor Tools', desc: 'Frame calc, color temp chart, log exposure guide, storage calc, Premiere shortcuts.', href: '/learn', badge: 'TOOLS' },
  { icon: '📚', title: 'Learn', desc: '15+ modul belajar color grading dari basics sampai bisnis jualan preset ke global market.', href: '/learn#learn', badge: 'FREE' },
]

const COMPAT = ['Premiere Pro', 'DaVinci Resolve', 'After Effects', 'Final Cut Pro', 'Lightroom', 'CapCut Pro']

export default function Home() {
  return (
    <div className="flex flex-col">

      {/* Hero */}
      <section className="relative min-h-[92vh] flex items-center justify-center overflow-hidden">
        {/* BG glow */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-accent/5 rounded-full blur-[120px]" />
          <div className="absolute top-1/2 left-1/4 w-[300px] h-[300px] bg-a4/5 rounded-full blur-[80px]" />
          <div className="absolute bottom-1/3 right-1/4 w-[250px] h-[250px] bg-a3/5 rounded-full blur-[80px]" />
        </div>

        {/* Grain texture */}
        <div className="absolute inset-0 opacity-[0.03] pointer-events-none"
          style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")` }} />

        <div className="relative z-10 max-w-5xl mx-auto px-4 text-center">
          {/* Logo mark */}
          <div className="flex items-center justify-center gap-3 mb-8">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-accent to-orange-400 flex items-center justify-center glow-accent">
              <svg width="26" height="26" viewBox="0 0 20 20"><circle cx="10" cy="10" r="3" fill="white"/><circle cx="10" cy="10" r="6.5" fill="none" stroke="white" strokeWidth="1.2" opacity=".5"/><circle cx="10" cy="10" r="9" fill="none" stroke="white" strokeWidth=".5" opacity=".2"/></svg>
            </div>
          </div>

          <h1 className="font-fraunces text-6xl sm:text-8xl font-semibold mb-4 leading-none tracking-tight">
            HAL<span className="italic text-accent">E</span>A
          </h1>
          <p className="text-t2 text-lg sm:text-xl font-mono tracking-widest uppercase mb-3">
            Cinematic Color, Engineered
          </p>
          <p className="text-t2 max-w-lg mx-auto text-sm leading-relaxed mb-10">
            Professional color grading tools for video editors. AI-powered LUT generator, Halation Studio, and premium preset shop.
          </p>

          <div className="flex flex-wrap gap-3 justify-center mb-12">
            <Link href="/studio"
              className="px-8 py-3.5 bg-accent text-white text-sm font-bold tracking-wide rounded-xl hover:bg-orange-400 hover:-translate-y-0.5 transition-all shadow-lg shadow-accent/25">
              Open Studio
            </Link>
            <Link href="/shop"
              className="px-8 py-3.5 bg-s3 border border-b1 text-txt text-sm font-bold tracking-wide rounded-xl hover:border-b3 hover:-translate-y-0.5 transition-all">
              Browse Shop
            </Link>
          </div>

          {/* Compat list */}
          <div className="flex flex-wrap justify-center gap-2">
            {COMPAT.map(c => (
              <span key={c} className="px-3 py-1 bg-s2 border border-b1 rounded-full text-t3 text-[10px] font-bold tracking-wide">{c}</span>
            ))}
          </div>
        </div>

        {/* Scroll hint */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 text-t3">
          <div className="w-px h-8 bg-gradient-to-b from-transparent to-b1" />
          <span className="text-[9px] tracking-widest uppercase font-bold">Scroll</span>
        </div>
      </section>

      {/* Features grid */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 py-24 w-full">
        <div className="text-center mb-14">
          <p className="text-[10px] font-bold tracking-[.2em] uppercase text-accent mb-3">What's inside</p>
          <h2 className="font-fraunces text-4xl sm:text-5xl font-semibold">
            Everything you need to<br />
            <span className="italic text-accent">grade like a pro</span>
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {FEATURES.map(f => (
            <Link key={f.title} href={f.href}
              className="group bg-s2 border border-b1 rounded-2xl p-6 hover:border-accent/30 hover:bg-s3 hover:-translate-y-1 transition-all">
              <div className="flex items-start justify-between mb-4">
                <span className="text-3xl">{f.icon}</span>
                <Badge color={f.badge === 'AI' ? 'ai' : f.badge === 'FREE' ? 'ok' : f.badge === 'SHOP' ? 'gold' : 'accent'}>
                  {f.badge}
                </Badge>
              </div>
              <h3 className="font-bold text-base mb-2 group-hover:text-accent transition-colors">{f.title}</h3>
              <p className="text-t2 text-xs leading-relaxed">{f.desc}</p>
            </Link>
          ))}
        </div>
      </section>

      {/* CTA Strip */}
      <section className="border-t border-b1 bg-s1">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-16 flex flex-col sm:flex-row items-center justify-between gap-6">
          <div>
            <h3 className="font-fraunces text-2xl font-semibold mb-1">Start grading cinematic.</h3>
            <p className="text-t2 text-sm">Free tools, AI-powered, works with every NLE.</p>
          </div>
          <div className="flex gap-3">
            <Link href="/studio" className="px-6 py-3 bg-accent text-white text-sm font-bold rounded-xl hover:bg-orange-400 transition-colors">
              Open Studio →
            </Link>
            <a href="https://instagram.com/robbiesatriaa" target="_blank"
              className="px-6 py-3 bg-s3 border border-b1 text-t2 text-sm font-bold rounded-xl hover:border-b3 transition-colors">
              @robbiesatriaa
            </a>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-b1 bg-bg py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-t3 text-xs font-mono">
          <span>© 2025 HALEA — by <a href="https://instagram.com/robbiesatriaa" target="_blank" className="hover:text-accent transition-colors">@robbiesatriaa</a></span>
          <div className="flex gap-4">
            {[['/', 'Home'], ['/studio', 'Studio'], ['/shop', 'Shop'], ['/ai', 'AI'], ['/learn', 'Learn']].map(([href, label]) => (
              <Link key={href} href={href} className="hover:text-txt transition-colors">{label}</Link>
            ))}
          </div>
        </div>
      </footer>
    </div>
  )
}
