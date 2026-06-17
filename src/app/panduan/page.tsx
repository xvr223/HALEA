'use client'
import { useState } from 'react'
import Link from 'next/link'
import { ArrowRight, AlertTriangle, Check, ChevronDown } from 'lucide-react'

// ── FAQ data ──────────────────────────────────────────────────────────────────
const FAQ: { q: string; a: React.ReactNode }[] = [
  {
    q: 'Kenapa LUT-ku jadi beda pas dipasang di footage lain?',
    a: <>Ini pertanyaan #1 — dan jawabannya penting. LUT dari <strong className="text-txt">Studio itu footage-specific</strong>: dia dihitung khusus dari warna footage still yang kamu upload, menuju referensi. Jadi LUT-nya berarti <em>&ldquo;warna footage INI → warna referensi&rdquo;</em>. Kalau dipasang ke klip lain yang warnanya beda (lighting beda, kamera beda, siang vs sore), inputnya beda → hasilnya beda. <strong className="text-accent">Untuk banyak klip berbeda, pakai Shot Matcher</strong> — tiap klip dapat LUT-nya sendiri.</>,
  },
  {
    q: 'Jadi bedanya Studio sama Shot Matcher apa?',
    a: <><strong className="text-txt">Studio</strong> = 1 footage, 1 referensi → 1 LUT presisi untuk footage itu. Cocok kalau semua klipmu kondisinya mirip (satu scene, satu kamera). <strong className="text-txt">Shot Matcher</strong> = banyak klip beda warna → semua disamakan ke 1 &ldquo;master look&rdquo;, tiap klip dapat LUT berbeda yang menuju look sama. Cocok untuk multicam, wedding, atau project multi-hari.</>,
  },
  {
    q: 'Aku mau 1 look yang bisa dipasang ke SEMUA klip, bisa?',
    a: <>Konsep &ldquo;satu preset untuk semua&rdquo; itu beda dari match footage-specific. Caranya: ambil 1 still dari <strong className="text-txt">tiap</strong> klip → masukkan semua ke Shot Matcher dengan satu master look → download LUT per klip. Hasilnya semua klip konsisten walau footage-nya beda-beda. Itu cara yang benar, bukan paksa 1 LUT ke semua footage.</>,
  },
  {
    q: 'Kenapa preview gratis tapi Bake LUT pakai kredit?',
    a: <>Biar kamu bisa coba-coba sepuasnya dulu — match, fine-tune, lihat hasilnya — tanpa bayar. Kredit baru kepakai pas kamu <strong className="text-txt">benar-benar download</strong> file LUT jadinya. Bake Standard 33³ = 1 kredit, Precision Grade 65³ = 3 kredit. User baru dapat bonus kredit gratis.</>,
  },
  {
    q: 'Bedanya Standard 33³ sama Precision 65³?',
    a: <>Angkanya = kepadatan grid warna LUT. <strong className="text-txt">33³</strong> = 35.937 titik (standar industri, dipakai mayoritas .cube). <strong className="text-txt">65³</strong> = 274.625 titik = gradien lebih halus, banding minimal — kualitas yang dicari colorist di DaVinci/project klien. Untuk konten sosmed harian, 33³ udah lebih dari cukup.</>,
  },
  {
    q: 'Footage-ku Log (S-Log3, D-Log, V-Log, Apple Log...). Gimana?',
    a: <>HALEA <strong className="text-txt">otomatis mendeteksi log</strong> dari karakteristik footage saat kamu upload still-nya. Cek dropdown <em>&ldquo;Input Footage&rdquo;</em> di Studio — kalau terdeteksi, dia decode dengan rumus resmi vendor. LUT yang di-bake sudah termasuk konversi log-nya. Kalau deteksinya salah, tinggal ganti manual di dropdown.</>,
  },
  {
    q: 'Reference photo yang bagus itu kayak gimana?',
    a: <>Pilih referensi yang <strong className="text-txt">kondisi lighting-nya mirip</strong> footage kamu: outdoor match outdoor, malam match malam, indoor match indoor. Frame film, foto fotografer favorit, atau still kreator lain semua sah. Referensi yang lighting-nya jauh beda (referensi malam, footage siang) bakal kasih hasil aneh.</>,
  },
  {
    q: 'Match Strength itu untuk apa?',
    a: <>Slider 0–100% buat ngatur seberapa kuat look-nya nempel. 100% = full transfer (kadang terlalu kuat), 70–80% = biasanya paling natural. Geser sambil lihat preview, terus baru bake. Nilai strength ini ikut ke-bake ke LUT.</>,
  },
  {
    q: 'Skin Guard fungsinya apa?',
    a: <>Melindungi warna kulit. Grading sekuat apa pun, pixel kulit cuma kena 25% efek — jadi wajah tetap natural walau background-nya digrade ekstrem (teal pekat, dll). Aktifkan kalau ada orang di footage dan kulitnya mulai keliatan aneh.</>,
  },
  {
    q: 'Apa itu HALEA Code?',
    a: <>Look kamu di-encode jadi kode teks pendek (~100 karakter). Copy → tempel di caption IG/TikTok atau share ke teman → mereka paste di Studio → look-nya langsung ke-load. Tanpa upload file, tanpa server. Cara paling gampang berbagi (atau jualan) look.</>,
  },
  {
    q: 'Foto yang aku upload disimpan di server HALEA?',
    a: <><strong className="text-ok">Tidak. Sama sekali.</strong> Semua analisis & rendering terjadi 100% di browser/HP kamu. Fotomu tidak pernah dikirim ke mana pun — privat, dan itu juga kenapa HALEA terasa cepat. Refresh halaman = data hilang.</>,
  },
  {
    q: 'LUT-ku ga muncul di app editing, kenapa?',
    a: <>Biasanya: (1) belum di-refresh LUT list-nya (di Resolve klik kanan → Refresh), atau (2) file .cube belum dipindah ke folder LUT yang benar. Untuk CapCut/VN: pakai menu Import LUT, bukan taruh di folder. Lihat panduan per-app di bawah.</>,
  },
]

// ── App apply guides ──────────────────────────────────────────────────────────
const APPS = [
  { icon: '🎬', name: 'Premiere Pro', steps: 'Adjustment Layer → Lumetri Color → Creative → Look → Browse → pilih .cube → Intensity 100. Pakai adjustment layer biar 1 LUT kena semua klip.' },
  { icon: '⚡', name: 'DaVinci Resolve', steps: 'Color page → klik kanan panel LUTs → Open LUT Folder → copy .cube ke situ → Refresh → klik kanan node → pilih LUT. Untuk Precision 65³ pakai jalur ini.' },
  { icon: '📱', name: 'CapCut (PC/Pro)', steps: 'Filters → tab LUT → + Import → pilih .cube → atur intensity. Sekali import, tersimpan untuk project berikutnya.' },
  { icon: '🎞', name: 'VN Video Editor', steps: 'Filter → My LUT → + → pilih .cube. VN gratis, tanpa watermark, support .cube penuh — favorit editor mobile.' },
  { icon: '📸', name: 'Lightroom Mobile', steps: 'Untuk foto: export .xmp dari HALEA → Lightroom → Presets → ⋯ → Import Presets → pilih file. Apply ke 1 foto, copy-paste ke foto lain biar feed senada.' },
  { icon: '✂️', name: 'After Effects', steps: 'Effect → Utility → Apply Color LUT → pilih .cube. Atau pakai Lumetri Color seperti Premiere.' },
]

export default function PanduanPage() {
  const [open, setOpen] = useState<number | null>(0)

  return (
    <main className="max-w-4xl mx-auto px-4 sm:px-6 py-10">

      {/* Header */}
      <div className="mb-10">
        <p className="text-[10px] font-bold tracking-[.2em] uppercase text-accent mb-3">Panduan & FAQ</p>
        <h1 className="font-fraunces text-4xl sm:text-5xl font-semibold mb-3">
          Cara Pakai <span className="italic text-accent">HALEA</span>
        </h1>
        <p className="text-t2 text-sm max-w-xl leading-relaxed">
          Baca ini dulu 2 menit — biar kamu paham cara kerjanya dan nggak salah pakai. Khususnya satu hal penting di bawah ini. 👇
        </p>
      </div>

      {/* ── THE KEY CONCEPT — big warning ── */}
      <div className="bg-gradient-to-br from-warn/10 to-accent/5 border border-warn/30 rounded-2xl p-6 mb-12">
        <div className="flex items-start gap-3 mb-4">
          <AlertTriangle size={22} className="text-warn flex-shrink-0 mt-0.5" />
          <div>
            <h2 className="font-bold text-lg leading-tight">Yang WAJIB kamu paham dulu</h2>
            <p className="text-t3 text-xs mt-0.5">Kesalahan paling umum pemula</p>
          </div>
        </div>
        <p className="text-t2 text-[15px] leading-relaxed mb-4">
          LUT dari <strong className="text-txt">Studio itu dibuat khusus untuk satu footage</strong> yang kamu upload —
          bukan look universal yang bisa ditempel ke semua klip. Bayangkan LUT-nya sebagai instruksi:
          <em className="text-accent"> &ldquo;ubah warna footage INI jadi seperti referensi&rdquo;</em>.
          Dipasang ke klip lain yang warnanya beda → hasilnya beda jauh.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="bg-err/5 border border-err/20 rounded-xl p-4">
            <p className="text-[10px] font-black tracking-widest uppercase text-err mb-2">❌ Salah</p>
            <p className="text-[13px] text-t2 leading-relaxed">Bikin 1 LUT dari 1 klip → pasang ke 20 klip berbeda dan berharap semua jadi look yang sama.</p>
          </div>
          <div className="bg-ok/5 border border-ok/20 rounded-xl p-4">
            <p className="text-[10px] font-black tracking-widest uppercase text-ok mb-2">✓ Benar</p>
            <p className="text-[13px] text-t2 leading-relaxed">Klip-klip mirip (1 scene) → 1 LUT cukup. Klip beda-beda → pakai <Link href="/matcher" className="text-accent font-bold hover:underline">Shot Matcher</Link>, tiap klip dapat LUT-nya sendiri.</p>
          </div>
        </div>
      </div>

      {/* ── Quick start ── */}
      <section className="mb-12">
        <h2 className="font-bold text-xl mb-5">🚀 Mulai dalam 4 langkah</h2>
        <div className="flex flex-col gap-3">
          {[
            ['1', 'Upload Reference Photo', 'Foto/frame dengan look yang mau kamu tiru — lighting mirip footage-mu.'],
            ['2', 'Upload Footage Still', 'Satu frame dari video kamu (screenshot dari timeline editor). Ini yang akan di-grade.'],
            ['3', 'Match Colors → Fine-Tune', 'Klik Match, lihat preview live, geser Match Strength & Fine-Tune sampai pas. Semua ini gratis.'],
            ['4', 'Bake LUT → Download', 'Pilih Standard 33³ (1 kredit) atau Precision 65³ (3 kredit) → pasang di app editing kamu.'],
          ].map(([n, t, d]) => (
            <div key={n} className="flex items-start gap-4 bg-s2 border border-b1 rounded-2xl p-4">
              <span className="w-8 h-8 rounded-full bg-accent/15 text-accent flex items-center justify-center text-sm font-black flex-shrink-0">{n}</span>
              <div>
                <p className="font-bold text-sm">{t}</p>
                <p className="text-t3 text-xs mt-0.5 leading-relaxed">{d}</p>
              </div>
            </div>
          ))}
        </div>
        <Link href="/studio" className="inline-flex items-center gap-2 mt-4 px-5 py-3 bg-accent text-white rounded-xl text-sm font-bold hover:bg-orange-400 transition-colors">
          Buka Studio <ArrowRight size={15} />
        </Link>
      </section>

      {/* ── Studio vs Matcher ── */}
      <section className="mb-12">
        <h2 className="font-bold text-xl mb-5">🤔 Studio atau Shot Matcher?</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="bg-s2 border border-b1 rounded-2xl p-5">
            <p className="text-2xl mb-2">🎬</p>
            <h3 className="font-bold text-base mb-2">Studio</h3>
            <ul className="text-[13px] text-t2 space-y-1.5">
              {['Satu footage / satu scene', 'Semua klip kondisinya mirip', 'Mau kontrol penuh + fine-tune', 'Bikin look untuk dijual (HALEA Code)'].map(x => (
                <li key={x} className="flex gap-2"><Check size={14} className="text-accent flex-shrink-0 mt-0.5" />{x}</li>
              ))}
            </ul>
          </div>
          <div className="bg-s2 border border-b1 rounded-2xl p-5">
            <p className="text-2xl mb-2">⚡</p>
            <h3 className="font-bold text-base mb-2">Shot Matcher</h3>
            <ul className="text-[13px] text-t2 space-y-1.5">
              {['Banyak klip beda warna', 'Multicam / wedding / multi-hari', 'Mau semua konsisten ke 1 look', 'Tiap klip dapat LUT sendiri'].map(x => (
                <li key={x} className="flex gap-2"><Check size={14} className="text-accent flex-shrink-0 mt-0.5" />{x}</li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* ── FAQ accordion ── */}
      <section className="mb-12">
        <h2 className="font-bold text-xl mb-5">❓ Pertanyaan yang sering muncul</h2>
        <div className="flex flex-col gap-2">
          {FAQ.map((item, i) => (
            <div key={i} className="bg-s2 border border-b1 rounded-xl overflow-hidden">
              <button onClick={() => setOpen(open === i ? null : i)}
                className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-s3 transition-colors">
                <span className="font-bold text-sm flex-1">{item.q}</span>
                <ChevronDown size={16} className={`text-t3 flex-shrink-0 transition-transform ${open === i ? 'rotate-180' : ''}`} />
              </button>
              {open === i && (
                <div className="px-4 pb-4 pt-0 text-[13px] text-t2 leading-relaxed animate-fade-in">
                  {item.a}
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ── Apply in apps ── */}
      <section className="mb-12">
        <h2 className="font-bold text-xl mb-5">📥 Cara pasang LUT di app editing</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {APPS.map(app => (
            <div key={app.name} className="bg-s2 border border-b1 rounded-2xl p-4">
              <div className="flex items-center gap-2.5 mb-2">
                <span className="text-xl">{app.icon}</span>
                <h3 className="font-bold text-sm">{app.name}</h3>
              </div>
              <p className="text-[12px] text-t2 leading-relaxed">{app.steps}</p>
            </div>
          ))}
        </div>
        <div className="bg-s3 border border-b1 rounded-xl px-4 py-3 mt-3 text-[12px] text-t2 leading-relaxed">
          💡 <strong className="text-txt">Tips:</strong> kalau hasil di editor beda dari preview HALEA — pastikan kamu pasang ke <strong className="text-txt">klip yang sama</strong> dengan still yang kamu match, di adjustment layer bersih (tanpa grade lain numpuk), dan klip diinterpret <strong className="text-txt">Rec.709</strong> (bukan log/raw).
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="bg-s2 border border-b1 rounded-2xl px-6 py-8 text-center">
        <h2 className="font-fraunces text-2xl font-semibold mb-2">Masih bingung?</h2>
        <p className="text-t3 text-sm mb-5 max-w-md mx-auto leading-relaxed">
          Tanya langsung ke HALEA AI — asisten color grading 24 jam dalam Bahasa Indonesia. Atau pelajari dari nol di Academy.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link href="/ai" className="px-5 py-3 bg-accent text-white rounded-xl text-sm font-bold hover:bg-orange-400 transition-colors">🤖 Tanya HALEA AI</Link>
          <Link href="/learn" className="px-5 py-3 bg-s3 border border-b2 text-t2 rounded-xl text-sm font-bold hover:border-accent/30 hover:text-accent transition-colors">🎓 Belajar di Academy</Link>
        </div>
      </section>
    </main>
  )
}
