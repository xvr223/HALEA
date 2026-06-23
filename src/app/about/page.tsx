'use client'
import Link from 'next/link'
import { Instagram, ArrowRight, Code2, Film, Palette, Cpu, ShieldCheck, Zap, Sparkles } from 'lucide-react'

export default function AboutPage() {
  return (
    <main className="min-h-screen">

      {/* ── HERO ─────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden border-b border-b1">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[700px] h-[500px] bg-accent/6 rounded-full blur-[140px]" />
        </div>

        <div className="max-w-5xl mx-auto px-6 py-16 md:py-28 flex flex-col md:flex-row items-center gap-10 md:gap-20">

          {/* Photo */}
          <div className="flex-shrink-0 relative">
            <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-accent/30 via-accent/10 to-transparent blur-2xl scale-110 opacity-70" />
            <div className="relative w-48 h-56 md:w-60 md:h-72 rounded-3xl overflow-hidden border border-accent/20 shadow-2xl shadow-black/60">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/robbie.jpg"
                alt="Robbie Satria"
                className="w-full h-full object-cover object-top"
                onError={(e) => {
                  e.currentTarget.src = 'https://unavatar.io/instagram/haleastudio'
                }}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent pointer-events-none" />
            </div>
          </div>

          {/* Identity */}
          <div className="text-center md:text-left">
            <p className="text-[9px] font-black tracking-[0.3em] uppercase text-accent mb-3">Founder · HALEA</p>
            <h1 className="font-fraunces text-4xl md:text-6xl font-semibold leading-tight mb-3">
              Robbie <span className="italic text-accent">Satria</span>
            </h1>

            <div className="flex flex-wrap gap-2 justify-center md:justify-start mb-5">
              {[
                { icon: <Film size={11} />,    label: 'Content Creator' },
                { icon: <Palette size={11} />, label: 'Video Editor' },
                { icon: <Code2 size={11} />,   label: 'Web Developer' },
              ].map(({ icon, label }) => (
                <span key={label} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-s3 border border-b2 text-[10px] font-bold text-t2 uppercase tracking-wider">
                  {icon}{label}
                </span>
              ))}
            </div>

            <p className="text-t2 text-base leading-relaxed mb-6 max-w-md">
              Membuat konten, edit video, dan membangun tools — sejak 2017.
              HALEA lahir dari ribuan jam di depan timeline.
            </p>

            <div className="flex flex-wrap items-center gap-3 justify-center md:justify-start">
              <a href="https://instagram.com/haleastudio" target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-accent text-white text-xs font-bold hover:bg-orange-400 transition-all shadow-lg shadow-accent/25 hover:-translate-y-0.5">
                <Instagram size={13} />
                @haleastudio
              </a>
              <Link href="/studio"
                className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-s3 border border-b2 text-t2 text-xs font-bold hover:border-accent/40 hover:text-accent transition-all">
                Coba Studio
                <ArrowRight size={13} />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── LORE: NAMA HALEA ─────────────────────────────────────────────── */}
      <section className="border-b border-b1 bg-s2/50">
        <div className="max-w-3xl mx-auto px-6 py-16 md:py-20 text-center">
          <div className="flex justify-center mb-6">
            {/* concentric halation rings — the HALEA mark */}
            <svg width="72" height="72" viewBox="0 0 72 72">
              <circle cx="36" cy="36" r="32" fill="none" stroke="#f97316" strokeWidth="1" opacity="0.18"/>
              <circle cx="36" cy="36" r="22" fill="none" stroke="#f97316" strokeWidth="1.5" opacity="0.4"/>
              <circle cx="36" cy="36" r="13" fill="none" stroke="#f97316" strokeWidth="2" opacity="0.7"/>
              <circle cx="36" cy="36" r="6" fill="#f97316"/>
            </svg>
          </div>
          <p className="text-[9px] font-black tracking-[0.3em] uppercase text-accent mb-4">Kenapa &ldquo;HALEA&rdquo;?</p>
          <h2 className="font-fraunces text-3xl md:text-4xl font-semibold mb-6 leading-snug">
            Dari kata <span className="italic text-accent">Halation</span> —<br className="hidden md:block" />
            cahaya yang bocor di film analog.
          </h2>
          <div className="text-t2 text-base leading-[1.85] space-y-4 text-left md:text-center max-w-2xl mx-auto">
            <p>
              Di era film seluloid, cahaya yang terlalu terang menembus lapisan emulsi, memantul,
              dan bocor balik — menciptakan <strong className="text-txt">glow kemerahan yang lembut</strong> di
              sekitar lampu, jendela, dan matahari. Para insinyur menyebutnya cacat.
              Para sinematografer menyebutnya <em>magic</em>.
            </p>
            <p>
              Halation adalah alasan kenapa film look terasa hidup, hangat, dan manusiawi —
              ketidaksempurnaan yang justru dirindukan di era digital yang terlalu bersih.
              Logo lingkaran HALEA adalah halation itu: <strong className="text-accent">satu titik cahaya yang
              memancar keluar</strong>, lapis demi lapis.
            </p>
            <p className="text-txt font-medium font-fraunces text-lg pt-1">
              Filosofinya sederhana: teknologi yang presisi, untuk rasa yang manusiawi.
            </p>
          </div>
        </div>
      </section>

      {/* ── STORY ────────────────────────────────────────────────────────── */}
      <section className="max-w-3xl mx-auto px-6 py-16 md:py-24">

        <blockquote className="mb-14 border-l-2 border-accent pl-6">
          <p className="font-fraunces text-2xl md:text-3xl text-txt/90 leading-snug italic">
            &ldquo;Mendapatkan warna yang tepat sering kali memakan waktu jauh lebih lama daripada yang seharusnya.&rdquo;
          </p>
        </blockquote>

        <div className="space-y-6 text-t2 text-base leading-[1.85]">
          <p>HALEA lahir dari pengalaman nyata sebagai seorang editor.</p>
          <p>
            Sejak tahun <strong className="text-txt font-semibold">2017</strong>, saya menghabiskan ribuan jam
            di depan timeline — mempelajari color grading, mencoba berbagai LUT, dan berusaha mereplikasi
            tampilan visual dari film referensi yang saya sukai. Dalam proses itu saya menyadari satu hal:
            mendapatkan warna yang tepat sering kali memakan waktu jauh lebih lama daripada yang seharusnya.
          </p>
          <p>
            Dan masalahnya bukan cuma waktu. LUT komersial dibuat untuk footage orang lain — dipaksakan ke
            footage kita, skin tone Asia Tenggara rusak, lighting tropis ditukar dengan lighting Eropa.
            Tools yang bagus berat dan mahal. Yang gratis, asal-asalan.
          </p>

          <div className="flex items-center gap-4 py-2">
            <div className="flex-1 h-px bg-b1" />
            <span className="text-accent">✦</span>
            <div className="flex-1 h-px bg-b1" />
          </div>

          <p>Dari situlah <strong className="text-accent font-semibold">HALEA</strong> lahir — dengan satu prinsip yang tidak bisa ditawar:</p>
          <p className="font-fraunces text-xl text-txt">
            LUT tidak seharusnya dipaksakan ke footage. LUT seharusnya <em className="text-accent">dihitung dari</em> footage.
          </p>
          <p>
            Setiap kali kamu match di HALEA, engine menganalisis distribusi warna footage-mu DAN referensimu,
            lalu menghitung transformasi matematis yang spesifik untuk keduanya. Bukan preset. Bukan filter.
            Transformasi yang dihitung — untuk footage kamu, hari itu, lighting itu.
          </p>
          <p>
            HALEA tidak dibuat oleh perusahaan besar yang melihat peluang pasar. HALEA dibuat oleh seorang
            kreator yang memahami langsung rasa frustrasinya — dan kebetulan bisa menulis kode.
          </p>
        </div>
      </section>

      {/* ── SEPOWERFUL APA? ──────────────────────────────────────────────── */}
      <section className="border-t border-b1 bg-s2/50">
        <div className="max-w-4xl mx-auto px-6 py-16 md:py-24">
          <div className="text-center mb-12">
            <p className="text-[9px] font-black tracking-[0.3em] uppercase text-accent mb-3">Di balik layar</p>
            <h2 className="font-fraunces text-3xl md:text-4xl font-semibold mb-4">
              Sepowerful apa <span className="italic text-accent">engine-nya?</span>
            </h2>
            <p className="text-t2 text-sm max-w-xl mx-auto leading-relaxed">
              Smart Match Engine v7 dibangun di atas riset color science yang dipakai
              industri film (Reinhard 2001, Pitié-Kokaram 2007) — lalu dikembangkan jauh melampauinya.
              Semua berjalan di perangkatmu, dalam hitungan detik.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[
              {
                icon: <Cpu size={16}/>, title: 'Full-Distribution Transport (IDT)',
                desc: 'Bukan cuma menyamakan rata-rata warna — engine mencocokkan SELURUH distribusi warna lewat Iterative Distribution Transfer (Sliced-Wasserstein optimal transport), lalu di-bake jadi 3D LUT presisi tinggi. Metode riset film, di browser-mu.',
              },
              {
                icon: <Sparkles size={16}/>, title: 'Zone Matrix 24 Sel',
                desc: '8 kelompok warna × 3 zona kecerahan dikoreksi terpisah. "Shadow teal, highlight warm" dihitung otomatis — cara kerja colorist profesional, tanpa sentuh satu slider pun.',
              },
              {
                icon: <ShieldCheck size={16}/>, title: 'Skin Intelligence',
                desc: 'Kulit dideteksi di kedua gambar. Ada manusia di referensi? Skin di-match langsung. Tidak ada? Skin diproteksi otomatis. Wajah tidak pernah dikorbankan demi look.',
              },
              {
                icon: <Zap size={16}/>, title: 'Self-Correcting + Jujur',
                desc: 'Engine menerapkan hasilnya, mengukur sisa error, lalu mengoreksi dirinya sendiri (iterative refinement). Di akhir, dia menilai hasilnya — "Match 87%" — dan bilang jujur kalau ada bagian look yang tidak bisa ditransfer.',
              },
            ].map(({ icon, title, desc }) => (
              <div key={title} className="bg-s2 border border-b1 rounded-2xl p-6 hover:border-accent/25 transition-colors">
                <div className="w-9 h-9 rounded-xl bg-accent/10 border border-accent/20 text-accent flex items-center justify-center mb-4">
                  {icon}
                </div>
                <h3 className="font-bold text-base mb-2">{title}</h3>
                <p className="text-t2 text-[13px] leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>

          {/* Pipeline strip */}
          <div className="mt-8 bg-s2 border border-b1 rounded-2xl p-5 overflow-x-auto">
            <p className="text-[9px] font-black tracking-widest uppercase text-t3 mb-3 text-center">Pipeline sekali klik</p>
            <div className="flex items-center justify-center gap-2 min-w-max mx-auto text-[10px] font-bold">
              {['Log Decode', 'Distribution Transfer', 'Zone Matrix', 'Skin Layer', 'Dense 3D LUT', 'Guards', 'Export'].map((step, i, arr) => (
                <span key={step} className="flex items-center gap-2">
                  <span className={`px-3 py-1.5 rounded-full border ${i === arr.length - 1 ? 'bg-accent text-white border-accent' : 'bg-s3 border-b2 text-t2'}`}>{step}</span>
                  {i < arr.length - 1 && <span className="text-t3">→</span>}
                </span>
              ))}
            </div>
          </div>

          {/* Log + privacy strip */}
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-s2 border border-b1 rounded-2xl p-5">
              <p className="text-[9px] font-black tracking-widest uppercase text-warn mb-2">🪵 Log Support — Matematis Exact</p>
              <p className="text-t2 text-[13px] leading-relaxed">
                S-Log3, D-Log, V-Log, Apple Log, F-Log/F-Log2, C-Log3, HLG — di-decode pakai rumus resmi
                tiap vendor, bukan aproksimasi. Format log bahkan <strong className="text-txt">terdeteksi otomatis</strong> dari
                karakteristik footage, lengkap dengan koreksi exposure pintar.
              </p>
            </div>
            <div className="bg-s2 border border-b1 rounded-2xl p-5">
              <p className="text-[9px] font-black tracking-widest uppercase text-ok mb-2">🔒 100% di Perangkatmu</p>
              <p className="text-t2 text-[13px] leading-relaxed">
                Fotomu <strong className="text-txt">tidak pernah di-upload ke server manapun</strong>. Semua analisis
                dan rendering terjadi di browser — privat, instan, dan tetap jalan tanpa koneksi cepat.
                Itu kenapa HALEA terasa secepat ini.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── PERJALANAN ENGINE V1 → V5 ────────────────────────────────────── */}
      <section className="border-t border-b1">
        <div className="max-w-3xl mx-auto px-6 py-16 md:py-24">
          <div className="text-center mb-12">
            <p className="text-[9px] font-black tracking-[0.3em] uppercase text-accent mb-3">Bukan dibangun dalam semalam</p>
            <h2 className="font-fraunces text-3xl md:text-4xl font-semibold mb-4">
              Perjalanan <span className="italic text-accent">Engine</span> — V1 ke V5
            </h2>
            <p className="text-t2 text-sm max-w-xl mx-auto leading-relaxed">
              Lima generasi, ratusan jam riset & ngoprek. Tiap versi lahir dari satu masalah nyata yang
              bikin hasil grading belum &ldquo;nempel&rdquo;. Ini catatan perjalanannya.
            </p>
          </div>

          <div className="relative">
            {/* vertical line */}
            <div className="absolute left-[19px] top-3 bottom-3 w-px bg-gradient-to-b from-b2 via-accent/30 to-accent hidden sm:block" />

            <div className="flex flex-col gap-5">
              {[
                {
                  v: 'V1', tag: 'Reference Analyzer', cur: false,
                  problem: 'Engine cuma menganalisis foto referensi sendirian — hitung rata-rata warna, lalu tebak temperature/contrast/saturation. Footage-mu tidak dipakai sama sekali.',
                  fix: 'Apply adjustment generik berdasarkan tebakan.',
                  flaw: 'Hasilnya generik — "agak warm" atau "agak teal", bukan benar-benar meniru look referensi.',
                },
                {
                  v: 'V2', tag: 'Smart Match — Color Transfer', cur: false,
                  problem: 'Look referensi tidak bisa ditiru tanpa membandingkannya dengan footage asli.',
                  fix: 'Beralih ke true color transfer (MKL / Monge-Kantorovich di Oklab): memetakan distribusi warna footage → distribusi warna referensi. Plus tone curve via CDF matching.',
                  flaw: 'Cuma mencocokkan rata-rata & kovarians. Referensi langit biru bisa "menyeret" warna kulit jadi oranye neon.',
                },
                {
                  v: 'V3', tag: 'Content-Aware', cur: false,
                  problem: 'Transfer global merusak subjek penting — kulit digoreng demi mengejar warna dominan referensi.',
                  fix: 'Per-hue-band matching (hijau ke hijau, oranye ke oranye) + deteksi & proteksi skin tone + perceptual guards (batas rotasi hue, limiter chroma anti-neon).',
                  flaw: 'Koreksi masih per-warna, belum sadar terang-gelap. "Shadow teal + highlight warm" belum ketangkep.',
                },
                {
                  v: 'V4', tag: 'Zone Matrix + Self-Correcting', cur: false,
                  problem: 'Look sinematik hidup di kombinasi warna × kecerahan — satu koreksi per-hue tidak cukup.',
                  fix: 'Zone Matrix 8 hue × 3 zona luma = 24 sel koreksi. Iterative refinement (engine mengukur hasilnya & mengoreksi diri). Plus Confidence Report yang menilai & menjelaskan hasilnya dengan jujur.',
                  flaw: 'Masih mencocokkan momen statistik (rata-rata + kovarians), belum seluruh distribusi warna.',
                },
                {
                  v: 'V5', tag: 'Full-Distribution Transport', cur: false,
                  problem: 'Mencocokkan rata-rata saja punya plafon akurasi. Untuk look yang benar-benar "nempel" perlu mencocokkan SELURUH distribusi warna.',
                  fix: 'Iterative Distribution Transfer (Sliced-Wasserstein optimal transport, Pitié-Kokaram 2007): proyeksikan kedua cloud warna ke puluhan sumbu 3D acak, selesaikan optimal transport 1D per sumbu, ulangi sampai konvergen — lalu bake jadi dense 3D LUT presisi tinggi.',
                  flaw: '77% lebih dekat ke distribusi referensi (vs 53% di V4) — tapi distribusi yang ekstrem bisa bikin transport "tajam" → warna pecah/banding di gradien halus (langit, kulit).',
                },
                {
                  v: 'V6', tag: 'Hybrid Transport — Smooth & Skin-Safe', cur: true,
                  problem: 'Transport distribusi penuh kadang terlalu tajam → banding di langit & kulit, dan kulit bisa keabuan/kehijauan kalau referensi punya warna dominan lain.',
                  fix: 'Arsitektur hybrid: transport linear MKL yang mulus mengerjakan bulk-nya dulu, IDT cuma me-refine sisa distribusi (di-damp). Plus gamut compression (turunkan chroma, bukan clip per-channel → hue tidak pecah) + skin guard baru yang lebih lebar & menjaga kulit tidak pernah jadi abu.',
                  flaw: 'Hasil: transport 26% lebih mulus, kulit terjaga warnanya, nol warna out-of-gamut. Inilah engine yang dipakai HALEA sekarang.',
                },
              ].map((e) => (
                <div key={e.v} className="relative sm:pl-14">
                  {/* node dot */}
                  <div className={`absolute left-0 top-1 w-10 h-10 rounded-full hidden sm:flex items-center justify-center text-[11px] font-black border-2 ${e.cur ? 'bg-accent text-white border-accent shadow-lg shadow-accent/30' : 'bg-s2 text-t2 border-b2'}`}>
                    {e.v}
                  </div>
                  <div className={`rounded-2xl border p-5 ${e.cur ? 'border-accent/40 bg-accent/5' : 'border-b1 bg-s2'}`}>
                    <div className="flex items-center gap-2 mb-3 flex-wrap">
                      <span className="sm:hidden text-[10px] font-black px-2 py-0.5 rounded-full bg-s4 text-t2">{e.v}</span>
                      <h3 className="font-bold text-base">{e.tag}</h3>
                      {e.cur && <span className="text-[9px] font-black tracking-widest uppercase px-2 py-0.5 rounded-full bg-accent text-white">Sekarang</span>}
                    </div>
                    <div className="space-y-2.5 text-[13px] leading-relaxed">
                      <p className="text-t2"><span className="text-t3 font-bold">Masalah:</span> {e.problem}</p>
                      <p className="text-t2"><span className="text-accent font-bold">Solusi:</span> {e.fix}</p>
                      <p className={e.cur ? 'text-ok' : 'text-t3'}><span className="font-bold">{e.cur ? 'Hasil:' : 'Yang masih kurang:'}</span> {e.flaw}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-10 bg-s2 border border-b1 rounded-2xl p-6 text-center">
            <p className="text-t2 text-sm leading-relaxed">
              Setiap versi bukan sekadar &ldquo;update&rdquo; — tiap kali, satu masalah warna yang spesifik dibedah,
              dicarikan dasar matematisnya di paper riset, lalu dibangun ulang dari nol agar tetap ringan & jalan di browser.
              <strong className="text-txt"> Itulah kenapa HALEA bukan filter biasa.</strong>
            </p>
          </div>
        </div>
      </section>

      {/* ── EKOSISTEM ────────────────────────────────────────────────────── */}
      <section className="max-w-4xl mx-auto px-6 py-16 md:py-24">
        <div className="text-center mb-10">
          <p className="text-[9px] font-black tracking-[0.3em] uppercase text-accent mb-3">Bukan satu tool — satu ekosistem</p>
          <h2 className="font-fraunces text-3xl md:text-4xl font-semibold">
            Semua yang editor <span className="italic text-accent">butuhkan</span>
          </h2>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {[
            ['🎬', 'Studio', 'Match referensi → fine-tune → bake LUT (.cube, .3dl, .xmp, CapCut)', '/studio'],
            ['⚡', 'Shot Matcher', 'Samakan warna multicam — tiap klip dapat LUT-nya sendiri', '/matcher'],
            ['🧬', 'HALEA Code', 'Satu look = satu baris teks. Share di caption, paste, langsung kepake', '/studio'],
            ['🃏', 'Share Card', 'Before/after siap post — 4 format sosmed', '/share'],
            ['🎓', 'Academy', '26 pelajaran gamified, dari nol sampai jadi creator', '/learn'],
            ['🤖', 'HALEA AI', 'Konsultan grading 24 jam dalam Bahasa Indonesia', '/ai'],
          ].map(([icon, title, desc, href]) => (
            <Link key={String(title)} href={String(href)}
              className="bg-s2 border border-b1 rounded-2xl p-5 hover:border-accent/30 hover:-translate-y-0.5 transition-all group">
              <span className="text-2xl block mb-2">{icon}</span>
              <h3 className="font-bold text-sm mb-1 group-hover:text-accent transition-colors">{title}</h3>
              <p className="text-t3 text-[11px] leading-relaxed">{desc}</p>
            </Link>
          ))}
        </div>
      </section>

      {/* ── NUMBERS ──────────────────────────────────────────────────────── */}
      <section className="border-t border-b border-b1 bg-s2">
        <div className="max-w-5xl mx-auto px-6 py-14 grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
          {[
            { n: 'V7',     label: 'Generasi engine sekarang' },
            { n: '0',      label: 'Foto di-upload ke server' },
            { n: '8',      label: 'Format log — rumus exact' },
            { n: '24',     label: 'Sel koreksi per match' },
            { n: '77%',    label: 'Lebih dekat ke referensi (vs V4)' },
            { n: '<2 dtk', label: 'Referensi → LUT jadi' },
            { n: '26',     label: 'Pelajaran di Academy' },
            { n: '2017',   label: 'Tahun perjalanan dimulai' },
          ].map(({ n, label }) => (
            <div key={label}>
              <p className="font-fraunces text-4xl md:text-5xl font-semibold text-accent mb-2">{n}</p>
              <p className="text-[10px] text-t3 uppercase tracking-widest font-bold">{label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── HARAPAN ──────────────────────────────────────────────────────── */}
      <section className="max-w-3xl mx-auto px-6 py-16 md:py-20">
        <div className="space-y-6 text-t2 text-base leading-[1.85] text-center">
          <p className="text-txt font-medium">Harapan saya sederhana.</p>
          <p>
            Jika HALEA bisa membantu seseorang menghemat waktu, menemukan <em>look</em> yang mereka
            cari lebih cepat, dan membuat proses berkarya jadi lebih menyenangkan — maka tujuan
            HALEA sudah tercapai.
          </p>
          <p className="font-fraunces text-2xl text-txt pt-2">Selamat datang di HALEA. ✦</p>
        </div>
      </section>

      {/* ── CTA ──────────────────────────────────────────────────────────── */}
      <section className="max-w-2xl mx-auto px-6 pb-20 text-center">
        <div className="bg-s2 border border-b1 rounded-3xl px-8 py-12">
          <p className="text-[9px] font-black tracking-[0.3em] uppercase text-accent mb-4">Mulai sekarang</p>
          <h2 className="font-fraunces text-3xl md:text-4xl font-semibold mb-4">
            Start grading <span className="italic text-accent">cinematic.</span>
          </h2>
          <p className="text-t3 text-sm mb-8 max-w-md mx-auto leading-relaxed">
            Daftar gratis, langsung dapat bonus kredit AI. Upload referensi, dan lihat sendiri
            apa yang engine ini bisa lakukan ke footage-mu.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link href="/studio"
              className="px-6 py-3.5 rounded-xl bg-accent text-white text-sm font-bold hover:bg-orange-400 transition-all shadow-lg shadow-accent/25 hover:-translate-y-0.5 flex items-center justify-center gap-2">
              Buka Studio <ArrowRight size={15} />
            </Link>
            <a href="https://instagram.com/haleastudio" target="_blank" rel="noopener noreferrer"
              className="px-6 py-3.5 rounded-xl bg-s3 border border-b2 text-t2 text-sm font-bold hover:border-accent/30 hover:text-accent transition-all flex items-center justify-center gap-2">
              <Instagram size={15} />
              @haleastudio
            </a>
          </div>
        </div>
      </section>

    </main>
  )
}
