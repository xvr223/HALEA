// HALEA Academy — kurikulum color grading berjenjang.
// Konten dirender lewat replace-chain modal (h3/p/ul/ol/strong/div.tip).

export interface Quiz { q: string; opts: string[]; a: number }
export interface Mission { text: string; href: string; flag: string }
export interface Lesson {
  id: string; title: string; sub: string; mins: number
  body: string; quiz: Quiz[]; mission?: Mission
}
export interface Chapter {
  id: string; icon: string; title: string; desc: string; lessons: Lesson[]
}

export const LESSON_XP = 30
export const MISSION_XP = 30

export const RANKS = [
  { xp: 0,   title: 'Newbie',        icon: '🥚' },
  { xp: 120, title: 'Color Curious', icon: '🌱' },
  { xp: 300, title: 'Grader Muda',   icon: '🎬' },
  { xp: 550, title: 'Colorist',      icon: '🎨' },
  { xp: 780, title: 'Color Master',  icon: '👑' },
]

export const CHAPTERS: Chapter[] = [
  // ═══════════ BAB 1 ═══════════
  {
    id: 'b1', icon: '🎨', title: 'Kenapa Warna Itu Penting?',
    desc: 'Mindset dulu sebelum teknis — paham kenapa warna menentukan rasa sebuah video.',
    lessons: [
      {
        id: 'b1l1', title: 'Warna = Bahasa Emosi', sub: 'Psikologi warna dalam film', mins: 4,
        body: `<h3>Penonton Merasakan Warna Sebelum Cerita</h3><p>Sebelum dialog pertama terdengar, otak penonton sudah memutuskan "rasa" video kamu dari warnanya. Ini kenapa film horor dingin kebiruan, film keluarga hangat keemasan, dan film blockbuster pakai teal-orange.</p><h3>Kamus Emosi Warna</h3><ul><li><strong>Warm (orange/gold)</strong> — nostalgia, nyaman, manusiawi. Dipakai untuk flashback & momen keluarga.</li><li><strong>Cool (teal/biru)</strong> — teknologi, jarak, tegang, malam.</li><li><strong>Desaturated</strong> — suram, realistis, perang, depresi.</li><li><strong>High saturation</strong> — energi, fantasi, masa kecil, iklan makanan.</li><li><strong>Green tint</strong> — sakit, misterius, tidak nyaman (The Matrix).</li></ul><div class="tip">💡 Sebelum grading, tulis SATU kata emosi yang mau kamu sampaikan. Semua keputusan warna mengacu ke kata itu.</div>`,
        quiz: [
          { q: 'Tujuan utama color grading adalah...', opts: ['Membuat video terang', 'Menyampaikan emosi & mood', 'Menaikkan resolusi', 'Memperbesar file'], a: 1 },
          { q: 'Look "teal-orange" paling sering dipakai untuk kesan...', opts: ['Horor', 'Dokumenter', 'Blockbuster / sinematik', 'Video tutorial'], a: 2 },
        ],
      },
      {
        id: 'b1l2', title: 'Kenapa Video Pro Terlihat "Mahal"', sub: 'Production value & 3 detik pertama', mins: 4,
        body: `<h3>Penonton Menilai dalam 3 Detik</h3><p>Di TikTok/Reels, keputusan scroll terjadi dalam 1–3 detik. Sebelum konten kamu dinilai, <strong>kualitas visualnya</strong> sudah dinilai duluan. Footage yang di-grade rapi = sinyal "ini kreator serius".</p><h3>Rahasianya Bukan Kamera Mahal</h3><p>Video iPhone yang di-grade dengan niat sering terlihat lebih pro daripada footage kamera 30 juta yang dibiarkan mentah. Yang membedakan:</p><ul><li><strong>Konsistensi</strong> — semua shot satu tone, tidak loncat-loncat.</li><li><strong>Intensionalitas</strong> — warna terasa "dipilih", bukan kebetulan.</li><li><strong>Skin tone sehat</strong> — wajah tetap natural walau background ekstrem.</li></ul><div class="tip">💡 Brand besar punya "warna khas" yang sama di semua kontennya. Itu bukan kebetulan — itu grading yang konsisten.</div>`,
        quiz: [
          { q: 'Apa yang paling membedakan video "pro" dari amatir?', opts: ['Harga kamera', 'Konsistensi & intensionalitas warna', 'Durasi video', 'Banyaknya transisi'], a: 1 },
          { q: 'Berapa lama penonton menilai kualitas video di sosmed?', opts: ['1–3 detik', '30 detik', '1 menit', 'Setelah selesai nonton'], a: 0 },
        ],
      },
      {
        id: 'b1l3', title: 'Correction vs Grading', sub: 'Dua tahap yang sering ketukar', mins: 5,
        body: `<h3>Dua Pekerjaan Berbeda</h3><p><strong>Color Correction</strong> = membetulkan. Bikin footage netral & akurat: white balance benar, exposure pas, semua kamera match. Hasilnya: footage "bersih" tapi belum punya gaya.</p><p><strong>Color Grading</strong> = memberi gaya. Setelah netral, baru kasih look: teal-orange, vintage, moody, dll.</p><h3>Urutannya Tidak Boleh Kebalik</h3><ol><li>Correction — netralkan dulu</li><li>Grading — baru kasih style</li></ol><p>Kalau langsung grading di footage yang WB-nya melenceng, look kamu "numpang" di atas kesalahan — hasilnya tidak konsisten antar shot.</p><div class="tip">💡 Di HALEA: Smart Match menangani keduanya sekaligus — distribusi warna dinormalkan DAN diberi look referensi dalam satu transform. Fine-Tune untuk koreksi rasa terakhir.</div>`,
        quiz: [
          { q: 'Mana yang dilakukan duluan?', opts: ['Grading (kasih style)', 'Correction (netralkan)', 'Export', 'Tambah grain'], a: 1 },
          { q: 'Color correction bertujuan untuk...', opts: ['Memberi look sinematik', 'Membuat footage netral & akurat', 'Menambah kontras', 'Membuat video gelap'], a: 1 },
        ],
      },
      {
        id: 'b1l4', title: 'Mata Manusia & Warna', sub: 'Kenapa skin tone itu sakral', mins: 5,
        body: `<h3>Otak Kamu Punya Auto White Balance</h3><p>Mata manusia beradaptasi: kertas putih terlihat putih di bawah lampu kuning maupun siang hari. Tapi kamera merekam apa adanya — itulah kenapa footage indoor sering kuning/oranye. Ini disebut <strong>chromatic adaptation</strong>.</p><h3>Memory Colors</h3><p>Ada warna yang otak manusia "hafal" dan langsung protes kalau salah: <strong>kulit manusia, langit, dan daun</strong>. Langit agak ungu? Mungkin lolos. Kulit keabu-abuan atau oranye neon? Semua orang langsung sadar ada yang aneh — walau tidak bisa menjelaskan kenapa.</p><ul><li>Skin tone = anchor utama grading. Salah di sini, seluruh grade terasa gagal.</li><li>Karena itu colorist pro selalu cek kulit dulu, look belakangan.</li></ul><div class="tip">💡 Ini alasan HALEA punya Skin Guard — grading boleh ekstrem, kulit tetap dilindungi.</div>`,
        quiz: [
          { q: '"Memory color" yang paling sensitif bagi penonton adalah...', opts: ['Warna mobil', 'Warna kulit manusia', 'Warna baju', 'Warna logo'], a: 1 },
          { q: 'Kenapa footage indoor sering terlihat kuning?', opts: ['Kamera rusak', 'Mata beradaptasi, kamera tidak', 'Lensa kotor', 'Resolusi rendah'], a: 1 },
        ],
      },
    ],
  },
  // ═══════════ BAB 2 ═══════════
  {
    id: 'b2', icon: '📐', title: 'Fondasi Wajib',
    desc: 'Exposure, white balance, kontras, saturasi, dan LUT — bahasa dasar seorang grader.',
    lessons: [
      {
        id: 'b2l1', title: 'Exposure & Histogram', sub: 'Baca grafik sebelum percaya mata', mins: 6,
        body: `<h3>Histogram = Peta Cahaya</h3><p>Sumbu kiri = shadow, kanan = highlight. Gunung di tengah = exposure aman. Grafik nabrak dinding kanan = <strong>clipping</strong>: detail highlight hilang PERMANEN — tidak bisa diselamatkan grading apapun.</p><h3>Aturan Praktis</h3><ul><li>Lindungi highlight — shadow gelap masih bisa diangkat, highlight putih total tidak bisa dikembalikan.</li><li>Wajah orang: targetkan di sekitar 50–70% (gunakan zebra kamera di 70%).</li><li>Jangan percaya layar HP di bawah matahari — percaya histogram.</li></ul><div class="tip">💡 Grading tidak bisa memperbaiki exposure yang hancur. Garbage in, garbage out — 50% hasil grade ditentukan saat shooting.</div>`,
        quiz: [
          { q: 'Histogram menabrak dinding kanan artinya...', opts: ['Footage gelap', 'Highlight clipping — detail hilang permanen', 'Warna terlalu jenuh', 'White balance salah'], a: 1 },
          { q: 'Mana yang lebih bisa diselamatkan saat grading?', opts: ['Highlight yang putih total', 'Shadow yang gelap', 'Dua-duanya sama', 'Tidak ada yang bisa'], a: 1 },
        ],
      },
      {
        id: 'b2l2', title: 'White Balance & Kelvin', sub: 'Netral dulu, kreatif kemudian', mins: 5,
        body: `<h3>Skala Kelvin</h3><ul><li><strong>1800–3200K</strong> — lilin, lampu tungsten (cahaya oranye)</li><li><strong>4000–4500K</strong> — lampu neon putih</li><li><strong>5600K</strong> — matahari siang (standar "netral")</li><li><strong>6500–9000K</strong> — mendung, bayangan (cahaya kebiruan)</li></ul><p>Set WB kamera sesuai sumber cahaya supaya putih terlihat putih. Salah set = footage kuning atau biru semua.</p><h3>Creative WB</h3><p>Setelah netral, kamu boleh sengaja menggeser: +200K untuk kehangatan golden hour, -300K untuk malam yang dingin. Bedanya dengan salah WB: ini <strong>keputusan sadar</strong> di atas dasar yang benar.</p><div class="tip">💡 Shooting penting? Rekam grey card 2 detik di awal — jadi referensi netral yang akurat saat correction.</div>`,
        quiz: [
          { q: 'Matahari siang kira-kira berapa Kelvin?', opts: ['2700K', '4000K', '5600K', '9000K'], a: 2 },
          { q: 'Grey card berguna untuk...', opts: ['Menstabilkan kamera', 'Referensi netral white balance', 'Menambah cahaya', 'Mengukur jarak fokus'], a: 1 },
        ],
      },
      {
        id: 'b2l3', title: 'Kontras & Tone Curve', sub: 'S-curve, faded look, dan "punch"', mins: 6,
        body: `<h3>Tone Curve = Senjata Paling Kuat</h3><p>Curve memetakan brightness input → output. Bentuknya menentukan karakter:</p><ul><li><strong>S-curve</strong> — shadow diturunkan + highlight dinaikkan = kontras filmis yang enak.</li><li><strong>Lifted blacks</strong> — titik hitam diangkat sedikit = faded/vintage film look.</li><li><strong>Soft highlights</strong> — ujung kanan dilandaikan = highlight lembut seperti film analog.</li></ul><h3>Kontras yang Benar</h3><p>"Punch" datang dari <strong>kontras midtone</strong>, bukan dari crush shadow. Kalau shadow dihancurkan jadi hitam total, detail hilang dan footage terasa "murah".</p><div class="tip">💡 Smart Match HALEA membaca bentuk curve referensi otomatis (lifted blacks, soft highlight) lewat CDF matching — perhatikan deskripsi "Tone" di hasil analisis.</div>`,
        quiz: [
          { q: 'Lifted blacks (titik hitam diangkat) menghasilkan kesan...', opts: ['Tajam modern', 'Faded / vintage film', 'Horor', 'Neon cyberpunk'], a: 1 },
          { q: '"Punch" yang enak datang dari kontras di...', opts: ['Shadow yang di-crush', 'Midtone', 'Highlight clipping', 'Saturasi maksimal'], a: 1 },
        ],
      },
      {
        id: 'b2l4', title: 'Saturasi vs Vibrance', sub: 'Sinyal amatir #1: oversaturate', mins: 4,
        body: `<h3>Beda Keduanya</h3><ul><li><strong>Saturation</strong> — menaikkan SEMUA warna secara rata, termasuk kulit. Cepat terlihat "neon".</li><li><strong>Vibrance</strong> — pintar: menaikkan warna yang kusam lebih banyak, melindungi skin tone dan warna yang sudah jenuh.</li></ul><h3>Tanda Oversaturate</h3><p>Kulit oranye seperti jeruk, rumput hijau stabilo, langit biru elektrik. Ini sinyal amatir paling umum — penonton merasa "lebay" walau tidak bisa menjelaskan.</p><p>Patokan aman: naikkan saturasi sampai terasa pas... lalu turunkan 10%. Mata kita cepat terbiasa dengan warna jenuh saat editing lama.</p><div class="tip">💡 Aktifkan 🎭 Skin Guard di HALEA Studio — grading sekuat apapun, kulit hanya terpengaruh 25%.</div>`,
        quiz: [
          { q: 'Vibrance berbeda dari saturation karena...', opts: ['Lebih kuat efeknya', 'Melindungi skin tone & warna yang sudah jenuh', 'Hanya untuk video', 'Membuat gelap'], a: 1 },
          { q: 'Sinyal grading amatir yang paling umum adalah...', opts: ['Terlalu gelap', 'Oversaturate (warna neon)', 'Terlalu tajam', 'Ada grain'], a: 1 },
        ],
      },
      {
        id: 'b2l5', title: 'Apa itu LUT (Sebenarnya)?', sub: 'Look Up Table dibedah', mins: 5,
        body: `<h3>LUT = Kamus Warna</h3><p>File berisi tabel: setiap warna input RGB dipetakan ke warna output. Format .cube ukuran 33 artinya grid 33×33×33 = 35.937 titik warna; warna di antara titik dihitung dengan interpolasi.</p><h3>Dua Jenis</h3><ul><li><strong>Technical LUT</strong> — konversi (misal S-Log3 → Rec.709). Matematis, bukan gaya.</li><li><strong>Creative LUT</strong> — look/style (teal-orange, vintage...).</li></ul><h3>Yang LUT TIDAK Bisa</h3><p>LUT itu pemetaan tetap — dia tidak tahu footage kamu gelap atau terang. Exposure & WB harus benar dulu, baru LUT bekerja seperti seharusnya. LUT bukan magic, dia konsisten — itu kekuatannya.</p><div class="tip">💡 LUT dari HALEA menggabungkan technical (log decode) + creative (Smart Match) dalam satu file .cube — itulah kenapa kamu pilih Input Footage sebelum bake.</div>`,
        quiz: [
          { q: 'LUT_3D_SIZE 33 artinya...', opts: ['33 warna saja', 'Grid 33×33×33 titik pemetaan warna', '33 MB', '33 layer'], a: 1 },
          { q: 'Kenapa LUT yang sama bisa terlihat beda di footage berbeda?', opts: ['LUT-nya rusak', 'Karena exposure/WB footage berbeda — LUT itu pemetaan tetap', 'Kebetulan', 'Resolusi beda'], a: 1 },
        ],
      },
    ],
  },
  // ═══════════ BAB 3 ═══════════
  {
    id: 'b3', icon: '🎥', title: 'Log & Teknis Kamera',
    desc: 'Footage flat itu fitur, bukan bug — kuasai log dan kamu naik kelas.',
    lessons: [
      {
        id: 'b3l1', title: 'Kenapa Footage Log Flat?', sub: 'Dynamic range & kurva log', mins: 5,
        body: `<h3>Sensor Lebih Kaya dari Layar</h3><p>Sensor kamera modern menangkap 12–14 stop dynamic range; layar Rec.709 standar hanya menampilkan ~6 stop. Kalau direkam langsung "jadi", detail shadow & highlight dibuang permanen.</p><h3>Solusinya: Kurva Log</h3><p>Log profile "memeras" seluruh dynamic range sensor ke dalam file: shadow diangkat, highlight ditekan. Hasilnya terlihat flat, pucat, abu-abu — karena memang <strong>belum di-decode</strong>, bukan karena jelek.</p><ul><li>Flat = data lengkap menunggu diproses</li><li>Decode (lewat LUT/conversion) = mengembalikan kontras dengan benar</li><li>Bonus: ruang grading jauh lebih luas tanpa rusak</li></ul><div class="tip">💡 Jangan kirim footage log mentah ke klien — selalu decode dulu. Flat bukan "look", itu format penyimpanan.</div>`,
        quiz: [
          { q: 'Footage log terlihat flat karena...', opts: ['Kamera murah', 'Dynamic range dipadatkan, belum di-decode', 'Lensa berkabut', 'Salah fokus'], a: 1 },
          { q: 'Keuntungan utama shooting log adalah...', opts: ['File lebih kecil', 'Ruang grading lebih luas (DR tersimpan)', 'Tidak perlu grading', 'Lebih tajam'], a: 1 },
        ],
      },
      {
        id: 'b3l2', title: 'Kenali Macam-Macam Log', sub: 'S-Log3, D-Log, V-Log, Apple Log...', mins: 6,
        body: `<h3>Tiap Brand Punya Kurva Sendiri</h3><ul><li><strong>S-Log3</strong> — Sony Alpha/FX/ZV. Grey di 41%, black pedestal 9.3%.</li><li><strong>D-Log / D-Log M</strong> — DJI drone & Osmo Pocket. Favorit kreator travel.</li><li><strong>V-Log</strong> — Panasonic Lumix. Pedestal lebih tinggi (12.5%).</li><li><strong>Apple Log</strong> — iPhone 15 Pro ke atas. Game changer untuk mobile filmmaker.</li><li><strong>F-Log / F-Log2</strong> — Fujifilm. <strong>C-Log3</strong> — Canon R series.</li><li><strong>HLG</strong> — format HDR, umum di HP & Sony.</li></ul><p>Kurva dan "titik hitam"-nya beda-beda — <strong>LUT untuk S-Log3 akan salah di V-Log</strong>. Selalu cocokkan LUT dengan log profile kamu.</p><div class="tip">💡 HALEA Studio auto-detect log dari karakteristik footage (pedestal + chroma) dan menyediakan decode matematis exact untuk 8 format. Cek dropdown "Input Footage".</div>`,
        quiz: [
          { q: 'Bolehkah LUT S-Log3 dipakai di footage V-Log?', opts: ['Boleh, sama saja', 'Tidak — kurva & pedestal-nya beda', 'Boleh kalau video pendek', 'Boleh di CapCut'], a: 1 },
          { q: 'Apple Log tersedia mulai dari...', opts: ['iPhone 11', 'iPhone 13', 'iPhone 15 Pro', 'Semua Android'], a: 2 },
        ],
      },
      {
        id: 'b3l3', title: 'Expose Log dengan Benar', sub: 'ETTR, zebra, dan noise', mins: 6,
        body: `<h3>Log Itu Haus Cahaya</h3><p>Karena shadow diangkat, noise paling kelihatan di area gelap. Strategi standar: <strong>ETTR (Expose To The Right)</strong> — sengaja overexpose 1–2 stop, lalu diturunkan saat grading. Hasil: shadow bersih dari noise.</p><h3>Patokan Praktis</h3><ul><li><strong>S-Log3:</strong> +1.3 sampai +2 stop dari meter normal</li><li><strong>Zebra:</strong> set 70% untuk kulit wajah, 95%+ artinya hampir clipping</li><li><strong>Cek histogram:</strong> jangan sampai nabrak kanan — overexpose iya, clipping jangan</li></ul><p>Underexposed log = bencana: begitu diangkat saat grading, noise muncul di mana-mana dan warna jadi "kotor".</p><div class="tip">💡 Auto Exposure di HALEA mengoreksi log yang melenceng sampai ±1.5 stop — tapi tetap, exposure benar di kamera selalu lebih baik.</div>`,
        quiz: [
          { q: 'ETTR artinya...', opts: ['Edit cepat', 'Sengaja expose lebih terang (ke kanan histogram) lalu turunkan saat grade', 'Export resolusi tinggi', 'Pakai tripod'], a: 1 },
          { q: 'Kenapa underexposed log berbahaya?', opts: ['File membesar', 'Noise muncul saat shadow diangkat', 'Kamera panas', 'Fokus meleset'], a: 1 },
        ],
      },
      {
        id: 'b3l4', title: '8-bit vs 10-bit', sub: 'Banding dan batas grading', mins: 5,
        body: `<h3>Bit Depth = Jumlah Gradasi</h3><p>8-bit menyimpan 256 level per channel (16.7 juta warna); 10-bit menyimpan 1.024 level (1.07 miliar warna). Untuk video "jadi", 8-bit cukup. Untuk <strong>grading berat</strong>, beda jauh.</p><h3>Masalahnya: Banding</h3><p>Saat gradasi halus (langit, kulit, dinding polos) di-stretch ketika grading, 8-bit kehabisan level — muncul garis-garis bertingkat (banding). Di footage <strong>log 8-bit</strong> risikonya paling besar, karena log memang akan di-stretch.</p><ul><li>Shooting log? Usahakan 10-bit (HEVC/H.265 10-bit).</li><li>Cuma punya 8-bit? Grading lebih ringan, hindari push ekstrem, grain halus bisa menyamarkan banding.</li></ul><div class="tip">💡 Urutan prioritas setting kamera untuk grading: 10-bit > bitrate tinggi > resolusi. 1080p 10-bit lebih enak di-grade daripada 4K 8-bit.</div>`,
        quiz: [
          { q: 'Banding paling berisiko muncul di...', opts: ['Footage 10-bit jadi', 'Log 8-bit yang di-grade berat', 'Foto JPEG', 'Video hitam putih'], a: 1 },
          { q: '10-bit menyimpan berapa level per channel?', opts: ['256', '512', '1024', '4096'], a: 2 },
        ],
      },
    ],
  },
  // ═══════════ BAB 4 ═══════════
  {
    id: 'b4', icon: '🎛', title: 'Teknik Grading',
    desc: 'Urutan kerja, skin tone, resep look, dan film texture — dapur seorang colorist.',
    lessons: [
      {
        id: 'b4l1', title: 'Urutan Grading yang Benar', sub: 'Pipeline 5 tahap', mins: 5,
        body: `<h3>Grading Itu Berlapis, Seperti Masak</h3><ol><li><strong>Normalize</strong> — decode log ke ruang kerja standar</li><li><strong>Primary correction</strong> — exposure, WB, kontras dasar (netralkan)</li><li><strong>Secondary</strong> — perbaiki area spesifik: skin, langit, baju</li><li><strong>Creative look</strong> — style: teal-orange, vintage, moody</li><li><strong>Finishing</strong> — grain, halation, vignette</li></ol><p>Kebalik urutannya = hasil tidak konsisten. Contoh klasik: kasih look dulu baru benerin WB → look-nya ikut bergeser di tiap shot.</p><div class="tip">💡 Pipeline HALEA mengikuti urutan ini: log decode → Smart Match (correction+look) → Fine-Tune → halation. Satu LUT, urutan benar.</div>`,
        quiz: [
          { q: 'Tahap pertama untuk footage log adalah...', opts: ['Kasih look vintage', 'Normalize / decode log', 'Tambah grain', 'Export'], a: 1 },
          { q: 'Grain & halation termasuk tahap...', opts: ['Normalize', 'Primary', 'Secondary', 'Finishing'], a: 3 },
        ],
      },
      {
        id: 'b4l2', title: 'Skin Tone adalah Raja', sub: 'Garis suci di vectorscope', mins: 6,
        body: `<h3>Satu Garis untuk Semua Manusia</h3><p>Fakta menarik: di vectorscope, kulit SEMUA manusia — terang maupun gelap — jatuh di sekitar garis yang sama (≈33° antara merah dan kuning), yang disebut <strong>skin tone line</strong>. Yang berbeda hanya kecerahannya, bukan hue-nya.</p><h3>Workflow Skin-First</h3><ul><li>Grade seluruh shot → cek kulit → kalau kulit rusak, kurangi efek di area kulit, bukan batalkan look.</li><li>Kulit sehat ada di hue oranye 20–40°; bergeser ke hijau = sakit, ke magenta = aneh.</li><li>Background boleh ekstrem (teal pekat, ungu, apapun) — selama kulit aman, penonton menerima.</li></ul><div class="tip">💡 Skin Guard HALEA mendeteksi pixel kulit (hue, saturasi, lightness) dan hanya meneruskan 25% efek grading ke sana — look tetap kuat, wajah tetap manusia.</div>`,
        quiz: [
          { q: 'Skin tone line di vectorscope adalah...', opts: ['Garis khusus kulit putih', 'Garis hue yang sama untuk semua warna kulit manusia', 'Garis exposure', 'Garis fokus'], a: 1 },
          { q: 'Kulit bergeser ke arah hijau memberi kesan...', opts: ['Sehat', 'Sakit / tidak nyaman', 'Hangat', 'Profesional'], a: 1 },
        ],
      },
      {
        id: 'b4l3', title: 'Resep Teal & Orange', sub: 'Kenapa works + angka pastinya', mins: 5,
        body: `<h3>Kenapa Look Ini Mendominasi Hollywood</h3><p>Oranye (kulit manusia) dan teal (biru-hijau) adalah <strong>warna komplementer</strong> — saling berseberangan di color wheel. Ditaruh bersebelahan, keduanya saling menguatkan: wajah "pop" keluar dari background.</p><h3>Resep Praktis</h3><ul><li>Shadow → dorong ke teal/cyan (sedikit!)</li><li>Midtone-highlight kulit → jaga di oranye sehat</li><li>Temperature +5 sampai +10, lalu shadow tint ke cyan</li><li>Amount look: <strong>40–60%</strong>. 100% = versi sinetron.</li></ul><h3>Kapan JANGAN Dipakai</h3><p>Konten makanan (food butuh warm bersih), produk berwarna putih/pastel, dan brand dengan warna khas yang bentrok dengan teal.</p><div class="tip">💡 Cara tercepat di HALEA: cari still film blockbuster yang look-nya kamu suka → jadikan referensi Smart Match → Fine-Tune strength.</div>`,
        quiz: [
          { q: 'Teal & orange bekerja karena keduanya...', opts: ['Warna paling terang', 'Warna komplementer yang saling menguatkan', 'Mudah dibuat', 'Warna favorit sutradara'], a: 1 },
          { q: 'Amount look yang disarankan adalah...', opts: ['100% biar maksimal', '40–60%', '10%', '0%'], a: 1 },
        ],
      },
      {
        id: 'b4l4', title: 'Film Look: Halation & Grain', sub: 'Kenapa digital terasa "terlalu bersih"', mins: 5,
        body: `<h3>Ketidaksempurnaan yang Dirindukan</h3><p>Film analog punya "cacat" indah yang membuat gambar terasa organik:</p><ul><li><strong>Halation</strong> — cahaya terang menembus emulsi film dan memantul balik, menciptakan glow kemerahan di sekitar highlight (lampu, jendela, matahari).</li><li><strong>Grain</strong> — butiran perak acak, hidup, tidak pernah sama antar frame. Beda dengan noise digital yang statis dan jelek.</li></ul><h3>Pakai dengan Takaran</h3><ul><li>Grain: blend Overlay/Soft Light, opacity 20–40%. Terlihat jelas = kebanyakan.</li><li>Halation: hanya di highlight (threshold ~65%), intensitas kecil.</li><li>Keduanya menyamarkan banding 8-bit — bonus teknis!</li></ul><div class="tip">💡 HALEA punya keduanya: node halation otomatis terdeteksi dari referensi di Studio, dan Film Grain Generator di halaman Belajar → Alat Cepat.</div>`,
        quiz: [
          { q: 'Halation adalah...', opts: ['Noise digital', 'Glow kemerahan di sekitar highlight khas film analog', 'Jenis LUT', 'Efek transisi'], a: 1 },
          { q: 'Setting grain yang disarankan...', opts: ['Opacity 100%', 'Blend Overlay/Soft Light, opacity 20–40%', 'Normal blend 80%', 'Multiply 50%'], a: 1 },
        ],
      },
      {
        id: 'b4l5', title: 'Shot Matching Multicam', sub: 'Pain terbesar editor event', mins: 6,
        mission: { text: 'Buka Shot Matcher, upload master look + minimal 1 shot, lalu download LUT-nya', href: '/matcher', flag: 'halea_m_matcher' },
        body: `<h3>Masalah Sejuta Editor Wedding</h3><p>Kamera A Sony, kamera B Canon, drone DJI — direkam bareng, warnanya beda semua. Skin tone loncat antar angle = penonton sadar "ini editan", immersion pecah.</p><h3>Cara Manual (Yang Pro Lakukan)</h3><ol><li>Pilih satu shot terbaik sebagai <strong>master</strong></li><li>Samakan exposure via waveform antar shot</li><li>Samakan WB & skin via vectorscope</li><li>Baru apply creative look ke semuanya</li></ol><p>Butuh jam terbang dan... waktu. Per klip.</p><h3>Cara HALEA</h3><p>Shot Matcher melakukan matching statistik otomatis: upload master + still tiap klip → tiap klip dihitung transform-nya sendiri → download LUT per klip. Multicam konsisten dalam hitungan menit.</p><div class="tip">💡 Tiap kamera dapat LUT BERBEDA yang menuju look yang SAMA — itu kuncinya, bukan satu LUT untuk semua.</div>`,
        quiz: [
          { q: 'Kenapa satu LUT yang sama tidak cukup untuk multicam?', opts: ['LUT mahal', 'Tiap kamera punya karakter warna beda — butuh transform berbeda menuju look sama', 'File kebesaran', 'NLE tidak support'], a: 1 },
          { q: 'Langkah pertama shot matching adalah...', opts: ['Tambah grain', 'Pilih satu shot master sebagai acuan', 'Export semua', 'Naikkan saturasi'], a: 1 },
        ],
      },
    ],
  },
  // ═══════════ BAB 5 ═══════════
  {
    id: 'b5', icon: '🛠', title: 'Praktek di Aplikasi',
    desc: 'Dari HALEA ke Premiere, Resolve, CapCut, VN, dan Lightroom — workflow lengkap.',
    lessons: [
      {
        id: 'b5l1', title: 'Workflow HALEA: Referensi → LUT', sub: 'Praktek pertamamu', mins: 7,
        mission: { text: 'Lakukan Smart Match (referensi + footage) lalu Bake LUT pertamamu di Studio', href: '/studio', flag: 'halea_m_bake' },
        body: `<h3>Referensi Bagus = 50% Hasil</h3><p>Pilih referensi yang <strong>kondisi lighting-nya mirip</strong> footage kamu: outdoor match outdoor, malam match malam. Still film, foto fotografer favorit, atau frame video kreator lain — semuanya sah sebagai bahan belajar.</p><h3>Langkah Lengkap</h3><ol><li>Upload <strong>referensi</strong> (look yang dituju)</li><li>Upload <strong>footage still</strong> — frame dari video kamu (screenshot di NLE)</li><li>Klik <strong>✦ Match Colors</strong> → Smart Match menghitung transform spesifik footage-mu</li><li>Geser <strong>Match Strength</strong> (mulai dari 80%)</li><li><strong>🎛 Fine-Tune</strong>: trim temperature/contrast/saturation sesuai rasa</li><li><strong>Bake LUT</strong> → export .cube</li></ol><div class="tip">💡 Footage log? Pastikan dropdown Input Footage sesuai (biasanya sudah auto-detect) — LUT yang di-bake akan termasuk konversinya.</div>`,
        quiz: [
          { q: 'Referensi yang baik adalah yang...', opts: ['Paling viral', 'Kondisi lighting-nya mirip footage kamu', 'Resolusinya 4K', 'Warnanya paling jenuh'], a: 1 },
          { q: 'Footage still untuk preview diambil dari...', opts: ['Google', 'Frame video kamu sendiri', 'Foto orang lain', 'Template'], a: 1 },
        ],
      },
      {
        id: 'b5l2', title: 'Apply di Premiere Pro', sub: 'Lumetri & adjustment layer', mins: 5,
        body: `<h3>Cara Standar</h3><ol><li>Pilih klip → buka panel <strong>Lumetri Color</strong></li><li>Tab <strong>Creative</strong> → Look → Browse → pilih file .cube</li><li>Atur <strong>Intensity</strong> 70–100% sesuai selera</li></ol><h3>Cara Pro: Adjustment Layer</h3><p>File → New → Adjustment Layer → taruh di track paling atas → apply LUT di situ. Keuntungan:</p><ul><li>Satu LUT mengenai semua klip di bawahnya — konsisten otomatis</li><li>Mau ganti look? Edit satu layer, bukan 50 klip</li><li>Bisa di-keyframe untuk transisi look antar scene</li></ul><div class="tip">💡 Urutan efek penting: koreksi exposure per-klip dulu (Basic Correction), LUT di adjustment layer di atasnya. Correction per klip, look global.</div>`,
        quiz: [
          { q: 'LUT di Premiere diimport lewat...', opts: ['File → Import', 'Lumetri → Creative → Look → Browse', 'Effects → Transitions', 'Audio panel'], a: 1 },
          { q: 'Keuntungan adjustment layer adalah...', opts: ['Render lebih cepat', 'Satu LUT untuk semua klip, mudah diganti', 'File lebih kecil', 'Warna lebih jenuh'], a: 1 },
        ],
      },
      {
        id: 'b5l3', title: 'Apply di DaVinci Resolve', sub: 'Node — cara kerja colorist pro', mins: 5,
        body: `<h3>Resolve Berpikir dalam Node</h3><p>Di color page, efek dirangkai sebagai node berurutan — persis pipeline yang kamu pelajari di Bab 4. Ini software yang dipakai colorist Hollywood, dan versi gratisnya luar biasa lengkap.</p><h3>Apply LUT</h3><ol><li>Simpan .cube ke folder LUT (Project Settings → Color Management → Open LUT Folder)</li><li>Klik kanan di daftar LUT → Refresh</li><li>Di color page: klik kanan <strong>node</strong> → LUTs → pilih</li></ol><h3>Struktur Node Sehat</h3><p>Node 1: exposure/WB → Node 2: LUT HALEA → Node 3: trim akhir. Pisahkan tugas per node — gampang di-debug, gampang diatur kekuatannya (key output gain per node).</p><div class="tip">💡 Apply LUT di node, bukan langsung di clip — supaya bisa dikurangi intensitasnya dan ditambah koreksi sebelum/sesudahnya.</div>`,
        quiz: [
          { q: 'Di Resolve, LUT sebaiknya di-apply ke...', opts: ['Langsung ke file', 'Node di color page', 'Timeline', 'Audio track'], a: 1 },
          { q: 'Struktur node yang sehat adalah...', opts: ['Semua efek di satu node', 'Tugas terpisah per node (correction → LUT → trim)', 'LUT duluan baru correction', 'Tanpa node'], a: 1 },
        ],
      },
      {
        id: 'b5l4', title: 'Mobile: CapCut, VN & Lightroom', sub: 'Grading serius di HP', mins: 5,
        body: `<h3>CapCut (PC/Pro)</h3><p>Filters → tab LUT → <strong>+ Import</strong> → pilih .cube → atur intensity. Sekali import, LUT tersimpan untuk project berikutnya.</p><h3>VN Video Editor</h3><p>Filter → My LUT → + → pilih .cube. VN gratis, tanpa watermark, dan support .cube penuh — kombinasi favorit kreator mobile Indonesia.</p><h3>Lightroom Mobile (foto)</h3><p>Untuk foto, export <strong>.xmp</strong> dari HALEA → Lightroom: Presets → ⋯ → Import Presets → pilih file. Apply ke satu foto → Copy/Paste settings ke foto lain biar feed senada.</p><div class="tip">💡 Workflow mobile lengkap: HALEA di browser HP (bikin LUT) → VN/CapCut (apply ke video) → semua tanpa PC.</div>`,
        quiz: [
          { q: 'Format preset untuk Lightroom Mobile dari HALEA adalah...', opts: ['.cube', '.xmp', '.3dl', '.png'], a: 1 },
          { q: 'Import LUT di VN lewat...', opts: ['Settings → About', 'Filter → My LUT → +', 'Export menu', 'Tidak bisa'], a: 1 },
        ],
      },
    ],
  },
  // ═══════════ BAB 6 ═══════════
  {
    id: 'b6', icon: '💰', title: 'Jadi Creator',
    desc: 'Dari skill jadi penghasilan — signature look, jualan, marketing, dan klien.',
    lessons: [
      {
        id: 'b6l1', title: 'Bangun Signature Look', sub: 'Konsistensi = brand', mins: 5,
        body: `<h3>Satu Look yang Orang Hafal</h3><p>Kreator besar dikenali dari warnanya bahkan sebelum logo muncul. Itu bukan bakat — itu disiplin: <strong>satu signature look untuk ~80% konten</strong>, variasi hanya untuk momen khusus.</p><h3>Cara Menemukannya</h3><ol><li>Kumpulkan 5–10 frame/foto yang "rasanya kamu banget" (moodboard)</li><li>Cari benang merahnya: warm atau cool? Kontras atau soft? Faded atau pekat?</li><li>Bangun di HALEA: referensi terbaik → Smart Match → Fine-Tune sampai pas</li><li>Simpan sebagai HALEA Code pribadi — look-mu kini satu baris teks yang abadi</li></ol><div class="tip">💡 Tes signature look: apply ke 5 video berbeda (indoor, outdoor, malam). Kalau tetap enak di semuanya, itu dia.</div>`,
        quiz: [
          { q: 'Signature look sebaiknya dipakai di...', opts: ['Satu video saja', '~80% konten secara konsisten', 'Hanya video sponsor', 'Tidak perlu konsisten'], a: 1 },
          { q: 'Langkah pertama menemukan signature look...', opts: ['Beli LUT termahal', 'Kumpulkan moodboard 5–10 referensi yang "kamu banget"', 'Tiru kreator lain persis', 'Pakai semua look bergantian'], a: 1 },
        ],
      },
      {
        id: 'b6l2', title: 'Jual LUT & Preset', sub: 'Pricing untuk pasar Indonesia', mins: 6,
        body: `<h3>Pasarnya Nyata dan Besar</h3><p>"Preset Lightroom" dan "LUT CapCut" adalah produk digital terlaris di kalangan kreator Indonesia. Pembelinya bukan editor pro — justru orang umum yang ingin feed-nya bagus.</p><h3>Pricing Pasar Lokal</h3><ul><li>Single LUT/preset: <strong>Rp15–50rb</strong></li><li>Pack (5–10): <strong>Rp75–200rb</strong></li><li>Bundle + tutorial: <strong>Rp200–500rb</strong></li></ul><h3>Funnel yang Terbukti</h3><ol><li><strong>Gratis 1–2 look</strong> — bangun trust & daftar calon pembeli</li><li>Konten before/after rutin — produknya terlihat bekerja</li><li>Pack berbayar dengan bonus (tutorial singkat, update gratis)</li></ol><div class="tip">💡 Jual lewat: DM Instagram (paling umum), Lynk.id / Mayar (link in bio + payment otomatis), atau Shopee untuk jangkauan massal.</div>`,
        quiz: [
          { q: 'Harga wajar satu pack LUT (5–10 isi) di pasar Indonesia...', opts: ['Rp5rb', 'Rp75–200rb', 'Rp2 juta', 'Gratis semua'], a: 1 },
          { q: 'Fungsi look gratisan dalam funnel adalah...', opts: ['Rugi-rugian', 'Bangun trust & menarik calon pembeli pack berbayar', 'Pamer', 'Tidak ada fungsinya'], a: 1 },
        ],
      },
      {
        id: 'b6l3', title: 'Marketing dengan HALEA Code', sub: 'Kode di caption = mesin viral', mins: 5,
        mission: { text: 'Buat grade di Studio lalu salin HALEA Code-nya (tombol 🧬)', href: '/studio', flag: 'halea_m_code' },
        body: `<h3>Formula Konten yang Terbukti</h3><ol><li><strong>Hook 1 detik pertama:</strong> langsung tampilkan before → after (jangan intro panjang)</li><li>Footage relatable: cafe, jalanan kota, golden hour pantai</li><li>Caption: taruh <strong>HALEA Code</strong> — penonton paste di HALEA dan langsung pakai look kamu</li><li>CTA jelas: "Save dulu, kodenya di caption"</li></ol><h3>Kenapa Code &gt; File</h3><ul><li>Tidak perlu link download / Google Drive ribet</li><li>Kode pendek (~66 karakter) muat di caption & komentar</li><li>Orang yang pakai kodenya otomatis kenal HALEA → audiens kamu tumbuh</li><li>Kode premium bisa dijual — produknya literally sebaris teks</li></ul><div class="tip">💡 Share Card HALEA (4 format: 1:1, 4:5, 9:16, 16:9) + kode di caption = satu paket konten jadi dalam 2 menit.</div>`,
        quiz: [
          { q: 'Hook video before/after yang efektif...', opts: ['Intro 10 detik', 'Langsung tampilkan transformasi di detik pertama', 'Cerita dulu panjang', 'Logo animasi'], a: 1 },
          { q: 'Keunggulan HALEA Code dibanding share file...', opts: ['Lebih berat', 'Muat di caption, tanpa link download, penerima langsung pakai', 'Butuh server', 'Hanya untuk PC'], a: 1 },
        ],
      },
      {
        id: 'b6l4', title: 'Portofolio & Klien Pertama', sub: 'Dari hobi ke invoice', mins: 6,
        body: `<h3>Portofolio: 3 Video Cukup</h3><p>Klien tidak menonton 50 video — mereka menonton 3. Siapkan: satu before/after grading, satu video jadi terbaikmu, satu yang relevan dengan niche klien (wedding/brand/food). Format reel 30–60 detik.</p><h3>Rate Editor + Colorist Pemula (ID)</h3><ul><li>Short-form (reels/TikTok): <strong>Rp150–500rb</strong>/video</li><li>Wedding highlight: <strong>Rp500rb–2jt</strong></li><li>Retainer bulanan UMKM (8–12 video): <strong>Rp1.5–4jt</strong></li></ul><h3>Di Mana Carinya</h3><ul><li>Grup FB "info loker editor", komunitas Discord editing, X/Twitter</li><li>DM UMKM lokal yang kontennya bagus tapi warnanya berantakan — tawarkan 1 video contoh</li><li>Vendor wedding di kotamu — mereka SELALU butuh editor</li></ul><div class="tip">💡 Skill grading adalah pembeda: ribuan orang bisa cutting, sedikit yang paham warna. Pasang "color grading" di headline jasa kamu.</div>`,
        quiz: [
          { q: 'Portofolio efektif untuk calon klien berisi...', opts: ['Semua video yang pernah dibuat', '3 video terkurasi yang relevan', 'Sertifikat saja', 'Daftar alat'], a: 1 },
          { q: 'Kenapa skill grading jadi pembeda di pasar jasa edit?', opts: ['Karena paling mudah', 'Banyak yang bisa cutting, sedikit yang paham warna', 'Karena gratis', 'Tidak jadi pembeda'], a: 1 },
        ],
      },
    ],
  },
]
