'use client'
import Link from 'next/link'
import { Instagram, ArrowRight } from 'lucide-react'

export default function AboutPage() {
  return (
    <main className="min-h-screen">

      {/* ── HERO ─────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden border-b border-b1">
        {/* background grain / glow */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-accent/5 rounded-full blur-[120px]" />
        </div>

        <div className="max-w-5xl mx-auto px-6 py-20 md:py-32 flex flex-col md:flex-row items-center gap-12 md:gap-20">

          {/* Photo */}
          <div className="flex-shrink-0 relative">
            {/* glow ring */}
            <div className="absolute inset-0 rounded-full bg-gradient-to-br from-accent/40 to-transparent blur-2xl scale-110 opacity-60" />
            <div className="relative w-44 h-44 md:w-56 md:h-56 rounded-full overflow-hidden border-2 border-accent/30 shadow-2xl shadow-accent/20">
              {/* Replace src with your photo — download from IG and put in /public/robbie.jpg */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="https://unavatar.io/instagram/robbiesatriaa"
                alt="Robbie Satria"
                className="w-full h-full object-cover"
                onError={(e) => {
                  const t = e.currentTarget
                  t.style.display = 'none'
                  t.parentElement!.innerHTML = `<div class="w-full h-full flex items-center justify-center bg-s3 text-6xl select-none">🎬</div>`
                }}
              />
            </div>
          </div>

          {/* Identity */}
          <div className="text-center md:text-left">
            <p className="text-[9px] font-black tracking-[0.3em] uppercase text-accent mb-3">Founder & Creator</p>
            <h1 className="font-fraunces text-4xl md:text-5xl font-semibold leading-tight mb-4">
              Robbie <span className="italic text-accent">Satria</span>
            </h1>
            <p className="text-t2 text-base leading-relaxed mb-6 max-w-md">
              Editor, colorist, dan pembuat HALEA. Bergelut di dunia color grading sejak 2017.
            </p>
            <div className="flex flex-wrap items-center gap-3 justify-center md:justify-start">
              <a href="https://instagram.com/robbiesatriaa" target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-accent text-white text-xs font-bold hover:bg-orange-400 transition-colors shadow-lg shadow-accent/25">
                <Instagram size={13} />
                @robbiesatriaa
              </a>
              <Link href="/studio"
                className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-s3 border border-b2 text-t2 text-xs font-bold hover:border-accent/40 hover:text-accent transition-colors">
                Coba Studio
                <ArrowRight size={13} />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── STORY ────────────────────────────────────────────────────────── */}
      <section className="max-w-3xl mx-auto px-6 py-16 md:py-24">

        {/* Pull quote */}
        <blockquote className="mb-16 border-l-2 border-accent pl-6">
          <p className="font-fraunces text-2xl md:text-3xl text-txt/90 leading-snug italic">
            &ldquo;Mendapatkan warna yang tepat sering kali memakan waktu jauh lebih lama daripada yang seharusnya.&rdquo;
          </p>
        </blockquote>

        {/* Body */}
        <div className="space-y-6 text-t2 text-base leading-[1.85] prose-like">
          <p>
            Halea lahir dari pengalaman nyata sebagai seorang editor.
          </p>
          <p>
            Sejak tahun <strong className="text-txt font-semibold">2017</strong>, saya menghabiskan ribuan jam di depan timeline — mempelajari color grading, mencoba berbagai LUT, dan berusaha mereplikasi tampilan visual dari gambar atau film referensi yang saya sukai. Dalam proses itu, saya menyadari satu hal: mendapatkan warna yang tepat sering kali memakan waktu jauh lebih lama daripada yang seharusnya.
          </p>
          <p>
            Banyak kreator menghabiskan berjam-jam untuk menebak-nebak pengaturan warna, melakukan trial and error, serta mencoba berbagai kombinasi sampai akhirnya menemukan hasil yang mendekati referensi yang mereka inginkan.
          </p>

          {/* Section break */}
          <div className="flex items-center gap-4 py-4">
            <div className="flex-1 h-px bg-b1" />
            <span className="text-accent text-lg">✦</span>
            <div className="flex-1 h-px bg-b1" />
          </div>

          <p>
            Dari situlah <strong className="text-accent font-semibold">Halea</strong> lahir.
          </p>
          <p>
            Halea adalah alat yang membantu kreator menghasilkan LUT dari gambar referensi dengan lebih cepat dan mudah. Tujuannya sederhana: mengurangi waktu yang terbuang untuk proses teknis, sehingga kreator bisa lebih fokus pada hal yang paling penting — yaitu berkarya.
          </p>
          <p>
            Halea tidak dibuat oleh perusahaan besar yang melihat peluang pasar. Halea dibuat oleh seorang kreator yang memahami langsung tantangan dalam proses editing dan color grading.
          </p>
          <p>
            Setiap fitur yang dikembangkan berangkat dari kebutuhan nyata yang saya temui selama bertahun-tahun bekerja dengan visual, warna, dan proses kreatif.
          </p>

          {/* Section break */}
          <div className="flex items-center gap-4 py-4">
            <div className="flex-1 h-px bg-b1" />
            <span className="text-accent text-lg">✦</span>
            <div className="flex-1 h-px bg-b1" />
          </div>

          <p className="text-txt font-medium">Harapan saya sederhana.</p>
          <p>
            Jika Halea bisa membantu seseorang menghemat waktu, menemukan <em>look</em> yang mereka cari lebih cepat, dan membuat proses berkarya menjadi lebih menyenangkan — maka tujuan Halea sudah tercapai.
          </p>
          <p className="font-fraunces text-xl text-txt">Selamat datang di Halea.</p>
        </div>
      </section>

      {/* ── NUMBERS ──────────────────────────────────────────────────────── */}
      <section className="border-t border-b border-b1 bg-s2">
        <div className="max-w-4xl mx-auto px-6 py-12 grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
          {[
            { n: '2017', label: 'Mulai editing' },
            { n: '8+',   label: 'Tahun experience' },
            { n: '100%', label: 'Made by creator' },
            { n: '∞',    label: 'Gratis selamanya' },
          ].map(({ n, label }) => (
            <div key={label}>
              <p className="font-fraunces text-4xl md:text-5xl font-semibold text-accent mb-1">{n}</p>
              <p className="text-[11px] text-t3 uppercase tracking-widest font-bold">{label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── CTA ──────────────────────────────────────────────────────────── */}
      <section className="max-w-2xl mx-auto px-6 py-20 text-center">
        <p className="text-[9px] font-black tracking-[0.3em] uppercase text-accent mb-4">Mulai sekarang</p>
        <h2 className="font-fraunces text-3xl md:text-4xl font-semibold mb-4">
          Start grading <span className="italic text-accent">cinematic.</span>
        </h2>
        <p className="text-t3 text-sm mb-8 max-w-md mx-auto leading-relaxed">
          Free tools, no account needed. Upload foto referensi dan generate LUT dalam hitungan detik.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link href="/studio"
            className="px-6 py-3.5 rounded-xl bg-accent text-white text-sm font-bold hover:bg-orange-400 transition-colors shadow-lg shadow-accent/25 flex items-center justify-center gap-2">
            Open Studio <ArrowRight size={15} />
          </Link>
          <a href="https://instagram.com/robbiesatriaa" target="_blank" rel="noopener noreferrer"
            className="px-6 py-3.5 rounded-xl bg-s3 border border-b2 text-t2 text-sm font-bold hover:border-accent/30 hover:text-accent transition-colors flex items-center justify-center gap-2">
            <Instagram size={15} />
            Follow di Instagram
          </a>
        </div>
      </section>

    </main>
  )
}
