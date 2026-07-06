import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { useMemo } from 'react'

// ── HALEA i18n ───────────────────────────────────────────────────────────────
// Zero-dependency, gettext-style: Indonesian source strings ARE the keys.
// - Indonesian users (browser language id/ms) → original Indonesian
// - Everyone else → English from the EN dictionary below
// - Missing translations gracefully fall back to Indonesian
// - Manual toggle (Navbar / Waitlist) overrides auto-detection & persists

export type Locale = 'id' | 'en'

interface I18nState {
  locale: Locale
  auto: boolean                    // still following the browser language
  setLocale: (l: Locale) => void   // manual choice — turns auto-follow off
  _autoSet: (l: Locale) => void    // detection result — keeps auto on
}

export const useI18n = create<I18nState>()(
  persist(
    (set) => ({
      locale: 'id',
      auto: true,
      setLocale: (l) => set({ locale: l, auto: false }),
      _autoSet: (l) => set({ locale: l }),
    }),
    { name: 'halea-locale' }
  )
)

// Call once on mount (Shell). Respects a manual choice; otherwise follows the
// browser language: Indonesian/Malay → id, everything else → en.
export function detectLocale() {
  const s = useI18n.getState()
  if (!s.auto) return
  try {
    const lang = (navigator.language || '').toLowerCase()
    const want: Locale = lang.startsWith('id') || lang.startsWith('ms') ? 'id' : 'en'
    if (want !== s.locale) s._autoSet(want)
  } catch {}
}

// Translate hook — `const t = useT()` then wrap strings: t('Buka Studio').
// Templates use {n}: t('Daftar + {n} Kredit Gratis').replace('{n}', ...)
export function useT() {
  const locale = useI18n(s => s.locale)
  return useMemo(() => (s: string) => (locale === 'en' ? (EN[s] ?? s) : s), [locale])
}

// ── English dictionary (Indonesian source → English) ────────────────────────
const EN: Record<string, string> = {
  // ── Navbar ──
  'Beranda': 'Home',
  'Belajar': 'Learn',
  'Panduan': 'Guide',
  'Tentang': 'About',
  'Masuk': 'Sign in',
  'Masuk / Daftar': 'Sign in / Register',
  'kredit': 'credits',
  'Profil': 'Profile',

  // ── Home ──
  'Warna Sinematik, Dirancang dengan Presisi': 'Cinematic Color, Engineered with Precision',
  'Tools color grading profesional untuk video editor Indonesia. Generator LUT berbasis AI, Halation Studio, dan toko preset premium — semua dalam satu platform.':
    'Professional color grading tools for video editors. AI-powered LUT generator, Halation Studio, and a premium preset shop — all in one platform.',
  'Buka Studio': 'Open Studio',
  'Lihat Shop': 'Browse Shop',
  'Apa yang ada di HALEA': "What's inside HALEA",
  'Semua yang kamu butuhkan untuk': 'Everything you need to',
  'grade seperti profesional': 'grade like a professional',
  'Pipeline grading berbasis node yang menghasilkan file .cube — Primary, Curves, HSL, Halation.':
    'Node-based grading pipeline that produces .cube files — Primary, Curves, HSL, Halation.',
  'Analisis warna otomatis dari foto referensi. Upload foto, dapatkan grade-nya secara instan.':
    'Automatic color analysis from a reference photo. Upload a photo, get its grade instantly.',
  'Asisten color grading berbasis AI. Tanya soal LUT, film look, strategi jualan preset — semua dijawab.':
    'An AI color grading assistant. Ask about LUTs, film looks, preset-selling strategy — it answers everything.',
  'LUT & preset premium karya @haleastudio. Gratis & berbayar. Download langsung, pakai selamanya.':
    'Premium LUTs & presets by @haleastudio. Free & paid. Download instantly, keep forever.',
  'Frame calc, color temp chart, panduan log exposure, storage calc, shortcut Premiere Pro.':
    'Frame calculator, color temp chart, log exposure guide, storage calculator, Premiere Pro shortcuts.',
  '15+ modul belajar color grading dari dasar sampai bisnis jualan preset ke pasar global.':
    '15+ color grading modules — from the basics to selling presets to a global market.',
  'Mulai grading sinematik sekarang.': 'Start grading cinematically now.',
  'Tools gratis, berbasis AI, kompatibel dengan semua NLE.': 'Free AI-powered tools, compatible with every NLE.',

  // ── Waitlist ──
  '✦ Segera Hadir': '✦ Coming Soon',
  'Color grading sinematik,': 'Cinematic color grading,',
  'secerdas colorist pro.': 'as smart as a pro colorist.',
  'HALEA mengubah footage apa pun jadi look film — dari foto referensi, atau cukup ketik look yang kamu mau. Engine riset-grade, jalan 100% di browser, dibuat untuk kreator Indonesia.':
    'HALEA turns any footage into a film look — from a reference photo, or just by typing the look you want. A research-grade engine, running 100% in your browser, built for creators.',
  'Kamu masuk waitlist! 🎉 Follow': "You're on the waitlist! 🎉 Follow",
  'biar ga ketinggalan kabar launch.': "so you don't miss the launch.",
  'email kamu...': 'your email...',
  'Mendaftar...': 'Joining...',
  'Gabung Waitlist': 'Join the Waitlist',
  'Dapatkan akses awal + bonus kredit AI saat launch. Gratis.': 'Get early access + bonus AI credits at launch. Free.',
  'Sepowerful apa?': 'How powerful?',
  'Bukan filter.': 'Not a filter.',
  'Engine warna riset-grade.': 'A research-grade color engine.',
  'Dibangun di atas riset color science industri film (Reinhard 2001, Pitié-Kokaram 2007, Chang 2015) — lalu dikembangkan 9 generasi. Inilah yang ada di dalamnya:':
    "Built on the color science research used by the film industry (Reinhard 2001, Pitié-Kokaram 2007, Chang 2015) — then evolved through 9 generations. Here's what's inside:",
  'Region dicocokkan per konten — langit ke langit, awan tetap netral. Look nempel tanpa merusak subjek.':
    'Regions are matched by content — sky to sky, clouds stay neutral. The look lands without destroying the subject.',
  'Tint film di shadow & highlight — DNA sebuah look — diukur dari referensi dan dikenakan ke seluruh frame.':
    'The film tint in shadows & highlights — the DNA of a look — measured from the reference and applied across the whole frame.',
  'Kulit ikut look tapi dijaga tetap natural — tidak pernah jadi hijau, oranye neon, atau keabuan.':
    'Skin follows the look but stays natural — never green, neon orange, or gray.',
  '100% di Perangkatmu': '100% On Your Device',
  'Fotomu tidak pernah di-upload ke server. Privat, instan, gratis dijalankan.':
    'Your photos are never uploaded to a server. Private, instant, free to run.',
  'Satu ekosistem lengkap': 'One complete ecosystem',
  'Semua yang editor butuhkan': 'Everything an editor needs',
  'Tiru look dari foto referensi mana pun — engine v9 content-aware menetralkan white balance footage dulu, lalu mencocokkan region ke referensi. Bukan filter, tapi transformasi yang dihitung.':
    'Copy the look of any reference photo — the content-aware v9 engine first neutralizes your footage\'s white balance, then matches regions to the reference. Not a filter: a computed transformation.',
  'AI Look dari Prompt': 'AI Look from a Prompt',
  'Ketik "kayak film Godfather" atau "sunset Bali hangat" — AI colorist nerjemahin jadi grade berlapis yang baca footage-mu dulu.':
    'Type "like The Godfather" or "warm Bali sunset" — an AI colorist translates it into a layered grade that reads your footage first.',
  'Banyak klip beda kamera/lighting? Samakan semua ke satu master look — tiap klip dapat LUT-nya sendiri.':
    'Clips from different cameras/lighting? Match them all to one master look — each clip gets its own LUT.',
  'S-Log3, V-Log, D-Log, Apple Log, F-Log, C-Log3, HLG — di-decode pakai rumus resmi vendor, auto-deteksi.':
    "S-Log3, V-Log, D-Log, Apple Log, F-Log, C-Log3, HLG — decoded with each vendor's official formula, auto-detected.",
  'Export LUT ultra-fidelity untuk DaVinci & project klien — gradien halus, banding minimal.':
    'Export ultra-fidelity LUTs for DaVinci & client projects — smooth gradients, minimal banding.',
  'Satu look = satu baris teks. Share di caption, paste, langsung kepake. Tanpa upload file.':
    'One look = one line of text. Share it in a caption, paste it, use it instantly. No file uploads.',
  '26 pelajaran color grading gamified + Grading Gym harian + sertifikat. Dari nol sampai jadi creator.':
    '26 gamified color grading lessons + a daily Grading Gym + certificates. From zero to working creator.',
  'Konsultan color grading 24 jam dalam Bahasa Indonesia.': 'A 24/7 color grading consultant.',
  'Bukan cuma tool — juga tempat belajar. 6 bab berjenjang (26 pelajaran), kuis, misi praktek, Grading Gym harian dengan skor, dan sertifikat yang bisa dipajang di CV/bio. Dari nol sampai jadi creator yang dibayar.':
    'Not just a tool — a place to learn. 6 progressive chapters (26 lessons), quizzes, practice missions, a daily scored Grading Gym, and certificates you can show on your CV/bio. From zero to paid creator.',
  'Dasar Warna': 'Color Basics',
  'Log & Kamera': 'Log & Cameras',
  'Teknik Grading': 'Grading Techniques',
  'Jual Preset': 'Sell Presets',
  '📜 Sertifikat': '📜 Certificates',
  'Di balik HALEA': 'Behind HALEA',
  '“Sejak 2017 aku habiskan ribuan jam di depan timeline — belajar color grading, nyobain ratusan LUT, ngejar look film yang aku suka. Tapi mendapatkan warna yang pas selalu makan waktu jauh lebih lama dari seharusnya.”':
    '“Since 2017 I\'ve spent thousands of hours on the timeline — learning color grading, trying hundreds of LUTs, chasing the film looks I love. But getting the color right always took far longer than it should.”',
  'HALEA lahir dari frustrasi itu — dibuat oleh kreator yang ngerti langsung masalahnya, bukan perusahaan yang lihat peluang pasar.':
    'HALEA was born from that frustration — built by a creator who lives the problem, not a company chasing a market.',
  'Tujuannya satu: bikin kamu fokus berkarya, bukan ngutak-atik warna.':
    'One goal: let you focus on creating, not fiddling with color.',
  'Jadi yang': 'Be the',
  'pertama': 'first',
  'pas launch.': 'at launch.',
  'Gabung waitlist sekarang, atau follow Instagram untuk update & sneak peek.':
    'Join the waitlist now, or follow Instagram for updates & sneak peeks.',

  // ── Look Library ──
  'Komunitas': 'Community',
  'Look komunitas — browse gratis, pakai di footage-mu dengan satu klik. Punya look keren? Publish dari Studio.':
    'Community looks — browse free, apply to your footage in one click. Made something great? Publish it from Studio.',
  'Preview di-render live di browser-mu — tiap look diterapkan ke scene test yang sama.':
    'Previews render live in your browser — every look applied to the same test scene.',
  'Terbaru': 'Newest',
  'Populer': 'Popular',
  'Pakai Look ini': 'Use this Look',
  'Pakai': 'Use',
  'Salin Code': 'Copy Code',
  'Code disalin!': 'Code copied!',
  'oleh': 'by',
  'baru saja': 'just now',
  'jam': 'h',
  'hari': 'd',
  'Memuat looks...': 'Loading looks...',
  'Library butuh koneksi database — coba lagi nanti.': 'The library needs a database connection — try again later.',
  'Belum ada look di library.': 'No looks in the library yet.',
  'Jadilah yang pertama — bikin look di Studio (referensi atau prompt AI) lalu tekan Publish.':
    'Be the first — create a look in Studio (reference or AI prompt) and hit Publish.',
  'Browse & pakai look = gratis. Export hasilnya (Bake LUT / Download Foto / Precision) pakai kredit seperti biasa.':
    'Browsing & using looks is free. Exporting the result (Bake LUT / Download Photo / Precision) uses credits as usual.',

  // ── Login ──
  'Masuk ke': 'Sign in to',
  'Daftar': 'Register',
  'Gratis': 'Free',
  'Lanjutkan grading & belajarmu': 'Continue your grading & learning',
  'Langsung dapat {n} kredit AI gratis': 'Get {n} free AI credits instantly',
  'Nama': 'Name',
  'Nama kamu': 'Your name',
  'Daftar + {n} Kredit Gratis': 'Register + {n} Free Credits',
  'Akun tersimpan di perangkat ini. Kredit AI dipakai untuk Bake LUT, Shot Matcher, dan HALEA AI.':
    'Your account is stored on this device. AI credits are used for Bake LUT, Shot Matcher, and HALEA AI.',
  '← Kembali ke HALEA': '← Back to HALEA',
  '✓ Masuk sebagai Admin': '✓ Signed in as Admin',
  '✓ Selamat datang kembali!': '✓ Welcome back!',
  '🎉 Akun dibuat — bonus {n} kredit AI!': '🎉 Account created — {n} bonus AI credits!',
  'Username / password salah': 'Wrong username / password',
}
