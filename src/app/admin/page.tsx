'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore, genCode } from '@/store/auth'
import { useShopStore, Product } from '@/store/shop'
import { useSettingsStore, rp } from '@/store/settings'
import { Btn, Input, toast, DropZone } from '@/components/ui'
import { Trash2, LogOut, Plus, Users, Settings2, Rocket, Eye, LayoutDashboard, Package, Mail, Pencil } from 'lucide-react'
import { GLOBAL_LAUNCHED, PREVIEW_KEY, fetchLaunched, setLaunched, fetchWaitlist, getLocalWaitlist, WaitEntry } from '@/lib/launch'

type Tab = 'overview' | 'launch' | 'shop' | 'pricing' | 'users' | 'waitlist'
const TABS: { id: Tab; label: string; Icon: typeof Rocket }[] = [
  { id: 'overview', label: 'Overview', Icon: LayoutDashboard },
  { id: 'launch',   label: 'Launch',   Icon: Rocket },
  { id: 'shop',     label: 'Produk',   Icon: Package },
  { id: 'pricing',  label: 'Harga',    Icon: Settings2 },
  { id: 'users',    label: 'User',     Icon: Users },
  { id: 'waitlist', label: 'Waitlist', Icon: Mail },
]

export default function AdminPage() {
  const { user, logout, users, adminSetCredits, adminDeleteUser } = useAuthStore()
  const { products, addProduct, removeProduct, updateProduct, sync: syncShop, configured: shopDb } = useShopStore()
  const settings = useSettingsStore()
  const router = useRouter()

  const [tab, setTab] = useState<Tab>('overview')
  const [form, setForm] = useState<{ name: string; type: Product['type']; desc: string; price: number; credits: number }>({ name: '', type: 'lut', desc: '', price: 0, credits: 10 })
  const [newPack, setNewPack] = useState({ name: '', credits: 50, price: 50000, tag: '' })
  const [creditEdits, setCreditEdits] = useState<Record<string, string>>({})
  const [thumb, setThumb] = useState<string | undefined>()
  const [fileData, setFileData] = useState<string | undefined>()
  const [fileExt, setFileExt] = useState('.cube')
  const [fileName, setFileName] = useState('')
  const [creditAmt, setCreditAmt] = useState(10)
  const [generatedCode, setGeneratedCode] = useState('')

  // ── Launch + DB state ──
  const [launch, setLaunch] = useState<{ live: boolean; configured: boolean }>({ live: GLOBAL_LAUNCHED, configured: false })
  const [launching, setLaunching] = useState(false)
  const [preview, setPreview] = useState(false)
  const [wl, setWl] = useState<WaitEntry[]>([])
  const [wlConfigured, setWlConfigured] = useState(false)

  useEffect(() => {
    try { setPreview(localStorage.getItem(PREVIEW_KEY) === 'live') } catch {}
    fetch('/api/launch', { cache: 'no-store' }).then(r => r.json())
      .then(j => setLaunch({ live: !!j.launched, configured: !!j.configured })).catch(() => {})
    fetchWaitlist().then(r => { setWl(r.entries.length ? r.entries : getLocalWaitlist()); setWlConfigured(r.configured) })
  }, [])

  useEffect(() => { if (!user || user.role !== 'admin') router.push('/login') }, [user, router])
  useEffect(() => { syncShop() }, [syncShop])
  if (!user || user.role !== 'admin') return null

  const doLaunch = async (next: boolean) => {
    setLaunching(true)
    const res = await setLaunched(next)
    setLaunching(false)
    if (res.ok) { setLaunch(l => ({ ...l, live: next })); toast(next ? '🚀 HALEA LIVE — semua pengunjung bisa akses penuh!' : '◐ Kembali ke pre-launch') }
    else toast(res.error || 'Gagal', 'err')
  }
  const togglePreview = () => {
    const next = !preview; setPreview(next)
    try { next ? localStorage.setItem(PREVIEW_KEY, 'live') : localStorage.removeItem(PREVIEW_KEY) } catch {}
    toast(next ? '👁 Preview app penuh aktif (device ini)' : 'Preview off')
  }
  const copyEmails = () => {
    if (!wl.length) { toast('Belum ada email', 'warn'); return }
    navigator.clipboard?.writeText(wl.map(w => w.email).join('\n')); toast(`✓ ${wl.length} email disalin`)
  }
  const exportCsv = () => {
    if (!wl.length) return
    const csv = 'email,tanggal\n' + wl.map(w => `${w.email},${new Date(w.ts).toISOString()}`).join('\n')
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = 'halea_waitlist.csv'; a.click()
  }

  // thumbnails are downscaled (max 640px, JPEG) so photos never blow the DB request cap
  const handleThumb = (f: File) => {
    const img = new Image(); const url = URL.createObjectURL(f)
    img.onload = () => {
      const scale = Math.min(1, 640 / Math.max(img.width, img.height))
      const c = document.createElement('canvas')
      c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale)
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height)
      setThumb(c.toDataURL('image/jpeg', 0.82)); URL.revokeObjectURL(url)
    }
    img.src = url
  }
  const handleFile = (f: File) => {
    const r = new FileReader()
    r.onload = e => {
      const data = e.target?.result as string
      if (shopDb && data.length > 950_000) { toast('File terlalu besar untuk DB (maks ~700KB) — pakai LUT 17³/preset, atau kirim via DM', 'err'); return }
      setFileName(f.name); setFileExt('.' + f.name.split('.').pop()); setFileData(data)
    }
    r.readAsDataURL(f)
  }

  // ── Produk: tambah / edit (dengan tombol Simpan) ──
  const [editId, setEditId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const resetForm = () => {
    setForm({ name: '', type: 'lut', desc: '', price: 0, credits: 10 })
    setThumb(undefined); setFileData(undefined); setFileName(''); setEditId(null)
  }
  const startEdit = (p: Product) => {
    setEditId(p.id)
    setForm({ name: p.name, type: p.type, desc: p.desc, price: p.price, credits: p.credits ?? 10 })
    setThumb(p.thumb); setFileData(undefined); setFileName(''); setFileExt(p.fileExt || '.cube')
    setTab('shop')
  }
  const submit = async () => {
    if (!form.name.trim()) { toast('Isi nama produk', 'err'); return }
    setSaving(true)
    const payload = { ...form, thumb, ...(fileData ? { fileData, fileExt } : {}) }
    const err = editId
      ? await updateProduct(editId, payload)
      : await addProduct({ ...payload, fileExt: fileData ? fileExt : undefined })
    setSaving(false)
    if (err) { toast(err, 'err'); return }
    toast(editId ? '✓ Perubahan disimpan!' : '✓ Produk dipublish!')
    resetForm()
  }
  const doDelete = async (p: Product) => {
    if (!confirm(`Hapus "${p.name}" dari shop?`)) return
    const err = await removeProduct(p.id)
    if (err) { toast(err, 'err'); return }
    if (editId === p.id) resetForm()
    toast('✓ Dihapus')
  }
  const handleGenCode = () => { const code = genCode(creditAmt); setGeneratedCode(code); navigator.clipboard?.writeText(code).then(() => toast('✓ Kode disalin!')) }

  const stats = { total: products.length, free: products.filter(p => p.price === 0).length, paid: products.filter(p => p.price > 0).length }
  const totalCredits = users.reduce((s, u) => s + u.credits, 0)

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-fraunces text-3xl sm:text-4xl font-semibold mb-1">Admin <span className="italic text-a2">Dashboard</span></h1>
          <div className="flex items-center gap-2">
            <span className={`text-[10px] font-black tracking-widest uppercase px-2.5 py-1 rounded-full ${launch.live ? 'bg-ok text-white' : 'bg-accent text-white'}`}>
              {launch.live ? '● LIVE' : '◐ PRE-LAUNCH'}
            </span>
            <span className="text-[10px] text-t3 font-mono">DB {launch.configured ? 'terhubung ✓' : 'belum diset'}</span>
          </div>
        </div>
        <button onClick={() => { logout(); router.push('/') }}
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-t2 hover:text-err hover:bg-err/10 text-sm font-bold transition-colors">
          <LogOut size={15} /> Keluar
        </button>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 mb-7 overflow-x-auto border-b border-b1 pb-px">
        {TABS.map(({ id, label, Icon }) => (
          <button key={id} onClick={() => setTab(id)}
            className={`flex items-center gap-1.5 px-3.5 py-2.5 text-xs font-bold whitespace-nowrap border-b-2 -mb-px transition-colors ${tab === id ? 'border-a2 text-a2' : 'border-transparent text-t3 hover:text-t2'}`}>
            <Icon size={14} />{label}{id === 'waitlist' && wl.length > 0 && <span className="ml-0.5 text-[9px] bg-a4/20 text-a4 px-1.5 py-0.5 rounded-full">{wl.length}</span>}
          </button>
        ))}
      </div>

      {/* ════ OVERVIEW ════ */}
      {tab === 'overview' && (
        <div className="flex flex-col gap-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[['Produk', stats.total, 'accent'], ['User', users.length, 'a4'], ['Waitlist', wl.length, 'a2'], ['Total Kredit', totalCredits, 'ok']].map(([l, v, c]) => (
              <div key={String(l)} className="bg-s2 border border-b1 rounded-2xl p-5 text-center">
                <div className={`font-mono text-4xl font-bold text-${c} mb-1`}>{v}</div>
                <div className="text-[9px] font-black tracking-widest uppercase text-t3">{l}</div>
              </div>
            ))}
          </div>
          <div className={`rounded-2xl border p-6 ${launch.live ? 'border-ok/30 bg-ok/5' : 'border-accent/30 bg-gradient-to-br from-accent/10 to-a2/5'}`}>
            <div className="flex items-center gap-3 mb-2">
              <Rocket size={18} className={launch.live ? 'text-ok' : 'text-accent'} />
              <h2 className="font-bold text-base flex-1">{launch.live ? 'HALEA sudah LIVE 🎉' : 'Masih mode Pre-Launch'}</h2>
            </div>
            <p className="text-[13px] text-t2 leading-relaxed mb-4">
              {launch.live ? 'Semua pengunjung bisa akses app penuh. Kelola dari tab Launch.' : 'Pengunjung baru cuma lihat halaman waitlist. Buka tab Launch untuk go-live sekali klik.'}
            </p>
            <button onClick={() => setTab('launch')} className="text-xs font-bold text-a2 hover:underline">Buka Launch Control →</button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[['🎬', 'Produk', 'shop'], ['💰', 'Harga & Paket', 'pricing'], ['👥', 'User', 'users']].map(([ic, lb, t]) => (
              <button key={lb} onClick={() => setTab(t as Tab)} className="bg-s2 border border-b1 rounded-2xl p-5 text-left hover:border-a2/40 transition-colors">
                <span className="text-2xl block mb-2">{ic}</span><p className="font-bold text-sm">{lb}</p>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ════ LAUNCH ════ */}
      {tab === 'launch' && (
        <div className="max-w-2xl flex flex-col gap-5">
          <div className={`rounded-2xl border p-6 ${launch.live ? 'border-ok/30 bg-ok/5' : 'border-accent/30 bg-gradient-to-br from-accent/10 to-a2/5'}`}>
            <div className="flex items-center gap-3 mb-5">
              <Rocket size={22} className={launch.live ? 'text-ok' : 'text-accent'} />
              <div className="flex-1">
                <h2 className="font-bold text-lg leading-tight">Launch Control</h2>
                <p className="text-[11px] text-t3 mt-0.5">Saklar global untuk semua pengunjung</p>
              </div>
              <span className={`text-[10px] font-black tracking-widest uppercase px-3 py-1.5 rounded-full ${launch.live ? 'bg-ok text-white' : 'bg-accent text-white'}`}>
                {launch.live ? '● LIVE' : '◐ PRE-LAUNCH'}
              </span>
            </div>

            {launch.configured ? (
              <>
                <button onClick={() => doLaunch(!launch.live)} disabled={launching}
                  className={`w-full py-4 rounded-2xl text-sm font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2.5 disabled:opacity-50 ${launch.live ? 'bg-s3 border border-b2 text-t2 hover:border-err/40 hover:text-err' : 'bg-accent text-white hover:bg-orange-400 shadow-xl shadow-accent/25'}`}>
                  {launching ? <><span className="w-5 h-5 border-[3px] border-current/30 border-t-current rounded-full animate-spin" /></> : <Rocket size={17} />}
                  {launch.live ? 'Kembalikan ke Pre-Launch' : '🚀 LAUNCH HALEA SEKARANG'}
                </button>
                <p className="text-[11px] text-t3 text-center mt-3">{launch.live ? 'Klik untuk sembunyikan app & tampilkan waitlist lagi.' : 'Sekali klik — semua pengunjung langsung bisa akses app penuh.'}</p>
              </>
            ) : (
              <div className="bg-s2 border border-b1 rounded-xl p-4">
                <p className="text-[9px] font-black tracking-widest uppercase text-accent mb-2">⚙️ Aktifkan tombol launch (sekali setup)</p>
                <p className="text-[12px] text-t2 leading-relaxed mb-2">Untuk tombol launch 1-klik, sambungkan database gratis (Upstash Redis):</p>
                <ol className="text-[12px] text-t2 leading-relaxed list-decimal pl-4 space-y-1">
                  <li>Buat database di <strong className="text-txt">upstash.com</strong> (gratis) → Redis → copy <strong className="text-txt">REST URL & TOKEN</strong></li>
                  <li>Vercel → Settings → Environment Variables, tambah: <code className="text-accent bg-s3 px-1 rounded text-[11px]">KV_REST_API_URL</code> & <code className="text-accent bg-s3 px-1 rounded text-[11px]">KV_REST_API_TOKEN</code></li>
                  <li>(Opsional) <code className="text-accent bg-s3 px-1 rounded text-[11px]">ADMIN_KEY</code> untuk amankan tombol</li>
                  <li>Redeploy — tombol LAUNCH langsung aktif & waitlist tersimpan lintas-device.</li>
                </ol>
                <p className="text-[10px] text-t3 mt-2.5">Tanpa DB, kamu masih bisa go-live via env <code className="text-t2">NEXT_PUBLIC_LAUNCHED=true</code> + redeploy.</p>
              </div>
            )}
          </div>

          {/* Preview override */}
          <div className="bg-s2 border border-b1 rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-2"><Eye size={15} className="text-a2" /><h3 className="font-bold text-sm">Preview Mode</h3></div>
            <p className="text-[11px] text-t3 mb-3">Lihat app penuh di device ini tanpa go-live ke publik — buat tes sebelum launch.</p>
            <button onClick={togglePreview}
              className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${preview ? 'bg-a2/20 border border-a2/40 text-a2' : 'bg-s3 border border-b2 text-t2 hover:border-b3'}`}>
              {preview ? '👁 Preview aktif — matikan' : 'Aktifkan preview app penuh'}
            </button>
          </div>
        </div>
      )}

      {/* ════ SHOP / PRODUK ════ */}
      {tab === 'shop' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className={`bg-s2 border rounded-2xl p-6 ${editId ? 'border-a2/50' : 'border-b1'}`}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-bold text-lg flex items-center gap-2">
                {editId ? <><Pencil size={16} className="text-a2" /> Edit Produk</> : <><Plus size={18} className="text-accent" /> Upload Produk</>}
              </h2>
              <span className={`text-[9px] font-black tracking-widest uppercase px-2 py-1 rounded-full ${shopDb ? 'bg-ok/10 text-ok border border-ok/30' : 'bg-warn/10 text-warn border border-warn/30'}`}>
                {shopDb ? '☁ DB — semua user' : '📍 Lokal — device ini aja'}
              </span>
            </div>
            <div className="flex flex-col gap-3">
              <div><label className="text-[9px] font-black tracking-widest uppercase text-t3 block mb-1.5">Nama</label>
                <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Jakarta Nights LUT Pack" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-[9px] font-black tracking-widest uppercase text-t3 block mb-1.5">Tipe</label>
                  <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value as Product['type'] }))}
                    className="w-full bg-s3 border border-b1 text-txt px-3 py-2 rounded-lg text-sm outline-none focus:border-accent">
                    <option value="lut">LUT</option><option value="preset">Preset</option><option value="pack">Pack</option><option value="credits">AI Credits</option>
                  </select></div>
                <div><label className="text-[9px] font-black tracking-widest uppercase text-t3 block mb-1.5">Harga (USD)</label>
                  <Input type="number" value={form.price} onChange={e => setForm(f => ({ ...f, price: +e.target.value }))} min={0} /></div>
              </div>
              <div><label className="text-[9px] font-black tracking-widest uppercase text-t3 block mb-1.5">Deskripsi</label>
                <textarea value={form.desc} onChange={e => setForm(f => ({ ...f, desc: e.target.value }))}
                  className="w-full bg-s3 border border-b1 text-txt px-3 py-2 rounded-lg text-sm outline-none focus:border-accent resize-none" rows={2} placeholder="Deskripsi singkat..." /></div>
              <div className="grid grid-cols-2 gap-3">
                <DropZone label="Thumbnail" sub="JPG · PNG" icon="🖼" accept="image/*" onFile={handleThumb} />
                <DropZone label={fileName || 'File LUT'} sub=".cube · .3dl · .zip" icon="📁" accept=".cube,.3dl,.lut,.zip" onFile={handleFile} />
              </div>
              {thumb && <img src={thumb} alt="" className="w-full h-24 object-cover rounded-lg" />}
              {editId && fileName && <p className="text-[10px] text-a2">File baru: {fileName} (menggantikan file lama)</p>}
              <div className="flex gap-2">
                <Btn variant="accent" size="lg" className="flex-1" onClick={submit} loading={saving}>
                  {editId ? '💾 Simpan Perubahan' : 'Publish ke Shop'}
                </Btn>
                {editId && (
                  <button onClick={resetForm}
                    className="px-4 rounded-xl border border-b2 text-t2 text-xs font-bold hover:border-b3 transition-colors">
                    Batal
                  </button>
                )}
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-6">
            <div className="bg-s2 border border-b1 rounded-2xl p-6">
              <h2 className="font-bold text-lg mb-4">🤖 AI Credit Codes</h2>
              <p className="text-t2 text-xs mb-4 leading-relaxed">Generate kode buat dikasih customer setelah bayar. Tiap kode = X kredit AI.</p>
              <div className="flex gap-2 mb-3">
                <select value={creditAmt} onChange={e => setCreditAmt(+e.target.value)} className="flex-1 bg-s3 border border-b1 text-txt px-3 py-2 rounded-lg text-sm outline-none focus:border-accent">
                  {[5, 10, 25, 50, 100].map(n => <option key={n} value={n}>{n} kredit</option>)}
                </select>
                <Btn variant="accent" onClick={handleGenCode}>Generate</Btn>
              </div>
              {generatedCode && (
                <button onClick={() => { navigator.clipboard?.writeText(generatedCode); toast('Disalin!') }}
                  className="w-full bg-s3 border border-ok/30 rounded-xl p-3 font-mono text-xs text-ok break-all text-left hover:border-ok/50 transition-colors">
                  {generatedCode}<span className="block text-t3 text-[10px] mt-1">Klik untuk salin · kirim via DM</span>
                </button>
              )}
            </div>
            <div className="bg-s2 border border-b1 rounded-2xl p-6 flex-1">
              <h2 className="font-bold text-lg mb-4">📦 Produk ({products.length})</h2>
              <div className="flex flex-col gap-2 max-h-80 overflow-y-auto pr-1">
                {products.length === 0 ? <p className="text-t3 text-xs text-center py-8">Belum ada produk</p> : products.map(p => (
                  <div key={p.id} className={`flex items-center gap-3 rounded-xl p-3 ${editId === p.id ? 'bg-a2/10 border border-a2/40' : 'bg-s3'}`}>
                    <span className="text-lg">{p.type === 'lut' ? '🎞' : p.type === 'credits' ? '🤖' : p.type === 'pack' ? '📦' : '✦'}</span>
                    <div className="flex-1 min-w-0"><p className="font-bold text-sm truncate">{p.name}</p><p className="text-t3 text-[10px]">{p.type} · {p.price === 0 ? 'Free' : '$' + p.price}{p.hasFile || p.fileData ? ' · 📁' : ''}</p></div>
                    <button onClick={() => startEdit(p)} className="text-t3 hover:text-a2 transition-colors p-1" title="Edit"><Pencil size={14} /></button>
                    <button onClick={() => doDelete(p)} className="text-t3 hover:text-err transition-colors p-1" title="Hapus"><Trash2 size={14} /></button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ════ PRICING ════ */}
      {tab === 'pricing' && (
        <div className="max-w-2xl bg-s2 border border-b1 rounded-2xl p-6">
          <h2 className="font-bold text-lg mb-1 flex items-center gap-2"><Settings2 size={17} className="text-a2" /> Harga & Ekonomi Kredit</h2>
          <p className="text-t3 text-xs mb-5">Berlaku langsung ke seluruh app — Shop, Studio, Matcher, AI.</p>
          <div className="grid grid-cols-2 gap-3 mb-6">
            {([
              ['Harga / kredit (Rp)', 'creditPrice', settings.creditPrice],
              ['Bonus user baru', 'welcomeCredits', settings.welcomeCredits],
              ['Bake Standard (33³)', 'matchCost', settings.matchCost],
              ['Precision Grade (65³)', 'powerGradeCost', settings.powerGradeCost],
              ['Biaya chat AI', 'aiChatCost', settings.aiChatCost],
            ] as [string, 'creditPrice' | 'welcomeCredits' | 'matchCost' | 'powerGradeCost' | 'aiChatCost', number][]).map(([label, key, val]) => (
              <div key={key}>
                <label className="text-[9px] font-black tracking-widest uppercase text-t3 block mb-1.5">{label}</label>
                <Input type="number" min={0} value={val} onChange={e => settings.update({ [key]: Math.max(0, +e.target.value) })} />
              </div>
            ))}
          </div>
          <p className="text-[9px] font-black tracking-widest uppercase text-a2 mb-3">📦 Paket & Bundling Kredit</p>
          <div className="flex flex-col gap-2 mb-4">
            {settings.packages.map(p => {
              const per = Math.round(p.price / p.credits), disc = Math.max(0, Math.round((1 - per / settings.creditPrice) * 100))
              return (
                <div key={p.id} className="flex items-center gap-3 bg-s3 rounded-xl px-3 py-2.5">
                  <div className="flex-1 min-w-0"><p className="font-bold text-sm truncate">{p.name} {p.tag && <span className="text-[8px] font-black text-a2 ml-1">{p.tag}</span>}</p>
                    <p className="text-t3 text-[10px]">{p.credits} kredit · {rp(p.price)} · {rp(per)}/kredit{disc > 0 ? ` · hemat ${disc}%` : ''}</p></div>
                  <button onClick={() => { const code = genCode(p.credits); navigator.clipboard?.writeText(code); toast(`✓ Kode ${p.credits} kredit disalin`) }} className="text-[10px] font-bold text-ok hover:text-ok/70 flex-shrink-0">🎫 Kode</button>
                  <button onClick={() => settings.removePackage(p.id)} className="text-t3 hover:text-err p-1 flex-shrink-0"><Trash2 size={13} /></button>
                </div>
              )
            })}
          </div>
          <div className="grid grid-cols-[1fr_72px_96px_auto] gap-2 items-end">
            <div><label className="text-[9px] font-black tracking-widest uppercase text-t3 block mb-1.5">Nama paket</label>
              <Input value={newPack.name} onChange={e => setNewPack(p => ({ ...p, name: e.target.value }))} placeholder="Hemat 100" /></div>
            <div><label className="text-[9px] font-black tracking-widest uppercase text-t3 block mb-1.5">Kredit</label>
              <Input type="number" min={1} value={newPack.credits} onChange={e => setNewPack(p => ({ ...p, credits: +e.target.value }))} /></div>
            <div><label className="text-[9px] font-black tracking-widest uppercase text-t3 block mb-1.5">Harga Rp</label>
              <Input type="number" min={0} value={newPack.price} onChange={e => setNewPack(p => ({ ...p, price: +e.target.value }))} /></div>
            <Btn variant="accent" onClick={() => {
              if (!newPack.name.trim() || newPack.credits < 1) { toast('Isi nama & kredit paket', 'err'); return }
              settings.addPackage({ name: newPack.name.trim(), credits: newPack.credits, price: newPack.price, tag: newPack.tag || undefined })
              setNewPack({ name: '', credits: 50, price: 50000, tag: '' }); toast('✓ Paket ditambahkan')
            }}><Plus size={14} /></Btn>
          </div>
        </div>
      )}

      {/* ════ USERS ════ */}
      {tab === 'users' && (
        <div className="max-w-2xl bg-s2 border border-b1 rounded-2xl p-6">
          <h2 className="font-bold text-lg mb-1 flex items-center gap-2"><Users size={17} className="text-a4" /> User Management</h2>
          <p className="text-t3 text-xs mb-5">User terdaftar di perangkat ini — atur saldo kredit atau hapus akun.</p>
          <div className="flex flex-col gap-2 max-h-[520px] overflow-y-auto pr-1">
            {users.length === 0 ? <p className="text-t3 text-xs text-center py-10">Belum ada user terdaftar</p> : users.map(u => (
              <div key={u.id} className="bg-s3 rounded-xl p-3">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-accent to-orange-400 text-white flex items-center justify-center text-sm font-black flex-shrink-0">{u.name[0]?.toUpperCase()}</div>
                  <div className="flex-1 min-w-0"><p className="font-bold text-sm truncate">{u.name} <span className="text-t3 font-normal text-xs">@{u.username}</span></p>
                    <p className="text-t3 text-[10px]">Join {new Date(u.joined).toLocaleDateString('id-ID')} · <span className="text-ok font-bold">{u.credits} kredit</span></p></div>
                  <button onClick={() => { if (confirm(`Hapus akun @${u.username}?`)) { adminDeleteUser(u.id); toast('User dihapus') } }} className="text-t3 hover:text-err p-1 flex-shrink-0"><Trash2 size={14} /></button>
                </div>
                <div className="flex gap-2 mt-2.5">
                  <input type="number" min={0} placeholder={String(u.credits)} value={creditEdits[u.id] ?? ''} onChange={e => setCreditEdits(c => ({ ...c, [u.id]: e.target.value }))}
                    className="w-24 bg-s2 border border-b1 text-txt px-2.5 py-1.5 rounded-lg text-xs outline-none focus:border-accent" />
                  <button onClick={() => { const v = parseInt(creditEdits[u.id] || ''); if (isNaN(v)) { toast('Masukkan jumlah', 'warn'); return } adminSetCredits(u.id, v); setCreditEdits(c => ({ ...c, [u.id]: '' })); toast(`✓ Saldo @${u.username} → ${v}`) }}
                    className="px-3 py-1.5 bg-ok/10 border border-ok/30 text-ok rounded-lg text-[10px] font-bold hover:bg-ok/20">Set Saldo</button>
                  <button onClick={() => { adminSetCredits(u.id, u.credits + 10); toast(`+10 kredit @${u.username}`) }} className="px-3 py-1.5 bg-s2 border border-b2 text-t2 rounded-lg text-[10px] font-bold hover:border-b3">+10</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ════ WAITLIST ════ */}
      {tab === 'waitlist' && (
        <div className="max-w-2xl bg-s2 border border-b1 rounded-2xl p-6">
          <div className="flex items-center gap-2 mb-1">
            <Mail size={17} className="text-a4" /><h2 className="font-bold text-lg flex-1">Waitlist</h2>
            <span className="text-sm font-mono font-bold text-a4">{wl.length}</span>
          </div>
          <p className="text-t3 text-xs mb-4">
            {wlConfigured ? 'Tersimpan di database (lintas-device) ✓' : 'DB belum diset — menampilkan signup device ini. Sambungkan DB di tab Launch untuk koleksi lintas-device.'}
          </p>
          {wl.length > 0 && (
            <div className="flex gap-2 mb-4">
              <button onClick={copyEmails} className="px-3 py-2 bg-s3 border border-b2 rounded-lg text-[11px] font-bold text-t2 hover:border-b3">📋 Salin email</button>
              <button onClick={exportCsv} className="px-3 py-2 bg-s3 border border-b2 rounded-lg text-[11px] font-bold text-t2 hover:border-b3">⬇ Export CSV</button>
            </div>
          )}
          <div className="flex flex-col gap-1.5 max-h-[480px] overflow-y-auto pr-1">
            {wl.length === 0 ? <p className="text-t3 text-xs text-center py-10">Belum ada yang gabung waitlist</p> : wl.map(w => (
              <div key={w.email} className="flex items-center justify-between bg-s3 rounded-lg px-3 py-2">
                <span className="text-xs font-mono text-t2 truncate">{w.email}</span>
                <span className="text-[10px] text-t3 flex-shrink-0 ml-2">{new Date(w.ts).toLocaleDateString('id-ID')}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
