'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore, genCode } from '@/store/auth'
import { useShopStore, Product } from '@/store/shop'
import { useSettingsStore, rp } from '@/store/settings'
import { Btn, Input, Badge, toast, DropZone } from '@/components/ui'
import { Trash2, LogOut, Plus, Users, Settings2 } from 'lucide-react'

export default function AdminPage() {
  const { user, logout, users, adminSetCredits, adminDeleteUser } = useAuthStore()
  const { products, addProduct, removeProduct, seedDemo } = useShopStore()
  const settings = useSettingsStore()
  const router = useRouter()

  const [form, setForm] = useState<{ name: string; type: Product['type']; desc: string; price: number; credits: number }>({ name: '', type: 'lut', desc: '', price: 0, credits: 10 })
  const [newPack, setNewPack] = useState({ name: '', credits: 50, price: 50000, tag: '' })
  const [creditEdits, setCreditEdits] = useState<Record<string, string>>({})
  const [thumb, setThumb] = useState<string | undefined>()
  const [fileData, setFileData] = useState<string | undefined>()
  const [fileExt, setFileExt] = useState('.cube')
  const [fileName, setFileName] = useState('')
  const [creditAmt, setCreditAmt] = useState(10)
  const [generatedCode, setGeneratedCode] = useState('')

  useEffect(() => { if (!user || user.role !== 'admin') router.push('/login') }, [user, router])
  useEffect(() => { seedDemo() }, [seedDemo])

  if (!user || user.role !== 'admin') return null

  const handleThumb = (f: File) => {
    const r = new FileReader(); r.onload = e => setThumb(e.target?.result as string); r.readAsDataURL(f)
  }
  const handleFile = (f: File) => {
    setFileName(f.name); setFileExt('.' + f.name.split('.').pop())
    const r = new FileReader(); r.onload = e => setFileData(e.target?.result as string); r.readAsDataURL(f)
  }

  const submit = () => {
    if (!form.name.trim()) { toast('Enter product name', 'err'); return }
    addProduct({ ...form, thumb, fileData, fileExt })
    setForm({ name: '', type: 'lut', desc: '', price: 0, credits: 10 })
    setThumb(undefined); setFileData(undefined); setFileName('')
    toast('✓ Product published!')
  }

  const handleGenCode = () => {
    const code = genCode(creditAmt)
    setGeneratedCode(code)
    navigator.clipboard?.writeText(code).then(() => toast('✓ Code copied!'))
  }

  const stats = {
    total: products.length,
    free: products.filter(p => p.price === 0).length,
    paid: products.filter(p => p.price > 0).length,
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10">

      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-fraunces text-4xl font-semibold mb-1">Admin <span className="italic text-a2">Dashboard</span></h1>
          <p className="text-t3 text-sm font-mono">HALEA Shop Management</p>
        </div>
        <button onClick={() => { logout(); router.push('/') }}
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-t2 hover:text-err hover:bg-err/10 text-sm font-bold transition-colors">
          <LogOut size={15} /> Sign Out
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-10">
        {[['Products', stats.total, 'accent'], ['Free', stats.free, 'ok'], ['Paid', stats.paid, 'gold'], ['Users', users.length, 'a4']].map(([l, v, c]) => (
          <div key={String(l)} className="bg-s2 border border-b1 rounded-2xl p-5 text-center">
            <div className={`font-mono text-4xl font-bold text-${c} mb-1`}>{v}</div>
            <div className="text-[9px] font-black tracking-widest uppercase text-t3">{l}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Upload Product */}
        <div className="bg-s2 border border-b1 rounded-2xl p-6">
          <h2 className="font-bold text-lg mb-5 flex items-center gap-2"><Plus size={18} className="text-accent" /> Upload Product</h2>
          <div className="flex flex-col gap-3">
            <div>
              <label className="text-[9px] font-black tracking-widest uppercase text-t3 block mb-1.5">Name</label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Jakarta Nights LUT Pack" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[9px] font-black tracking-widest uppercase text-t3 block mb-1.5">Type</label>
                <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value as Product['type'] }))}
                  className="w-full bg-s3 border border-b1 text-txt px-3 py-2 rounded-lg text-sm outline-none focus:border-accent">
                  <option value="lut">LUT</option>
                  <option value="preset">Preset</option>
                  <option value="pack">Pack</option>
                  <option value="credits">AI Credits</option>
                </select>
              </div>
              <div>
                <label className="text-[9px] font-black tracking-widest uppercase text-t3 block mb-1.5">Price (USD)</label>
                <Input type="number" value={form.price} onChange={e => setForm(f => ({ ...f, price: +e.target.value }))} min={0} />
              </div>
            </div>
            <div>
              <label className="text-[9px] font-black tracking-widest uppercase text-t3 block mb-1.5">Description</label>
              <textarea value={form.desc} onChange={e => setForm(f => ({ ...f, desc: e.target.value }))}
                className="w-full bg-s3 border border-b1 text-txt px-3 py-2 rounded-lg text-sm outline-none focus:border-accent resize-none"
                rows={2} placeholder="Short description..." />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <DropZone label="Thumbnail" sub="JPG · PNG" icon="🖼" accept="image/*" onFile={handleThumb} />
              <DropZone label={fileName || "LUT File"} sub=".cube · .3dl · .zip" icon="📁" accept=".cube,.3dl,.lut,.zip" onFile={handleFile} />
            </div>
            {thumb && <img src={thumb} alt="" className="w-full h-24 object-cover rounded-lg" />}
            <Btn variant="accent" size="lg" className="w-full" onClick={submit}>Publish to Shop</Btn>
          </div>
        </div>

        {/* Right column */}
        <div className="flex flex-col gap-6">

          {/* Credit Code Generator */}
          <div className="bg-s2 border border-b1 rounded-2xl p-6">
            <h2 className="font-bold text-lg mb-4">🤖 AI Credit Codes</h2>
            <p className="text-t2 text-xs mb-4 leading-relaxed">Generate codes to give customers after payment. Each code = X AI Match credits.</p>
            <div className="flex gap-2 mb-3">
              <select value={creditAmt} onChange={e => setCreditAmt(+e.target.value)}
                className="flex-1 bg-s3 border border-b1 text-txt px-3 py-2 rounded-lg text-sm outline-none focus:border-accent">
                <option value={5}>5 credits</option>
                <option value={10}>10 credits</option>
                <option value={25}>25 credits</option>
                <option value={50}>50 credits</option>
              </select>
              <Btn variant="accent" onClick={handleGenCode}>Generate</Btn>
            </div>
            {generatedCode && (
              <button onClick={() => { navigator.clipboard?.writeText(generatedCode); toast('Copied!') }}
                className="w-full bg-s3 border border-ok/30 rounded-xl p-3 font-mono text-xs text-ok break-all text-left hover:border-ok/50 transition-colors">
                {generatedCode}
                <span className="block text-t3 text-[10px] mt-1">Click to copy · Send via DM</span>
              </button>
            )}
          </div>

          {/* Product list */}
          <div className="bg-s2 border border-b1 rounded-2xl p-6 flex-1">
            <h2 className="font-bold text-lg mb-4">📦 Products ({products.length})</h2>
            <div className="flex flex-col gap-2 max-h-72 overflow-y-auto pr-1">
              {products.length === 0 ? (
                <p className="text-t3 text-xs text-center py-8">No products</p>
              ) : products.map(p => (
                <div key={p.id} className="flex items-center gap-3 bg-s3 rounded-xl p-3">
                  <span className="text-lg">{p.type === 'lut' ? '🎞' : p.type === 'credits' ? '🤖' : p.type === 'pack' ? '📦' : '✦'}</span>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-sm truncate">{p.name}</p>
                    <p className="text-t3 text-[10px]">{p.type} · {p.price === 0 ? 'Free' : '$' + p.price}</p>
                  </div>
                  <button onClick={() => { removeProduct(p.id); toast('Deleted') }} className="text-t3 hover:text-err transition-colors p-1">
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Pricing & Credit Economy ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
        <div className="bg-s2 border border-b1 rounded-2xl p-6">
          <h2 className="font-bold text-lg mb-1 flex items-center gap-2"><Settings2 size={17} className="text-a2" /> Harga & Ekonomi Kredit</h2>
          <p className="text-t3 text-xs mb-5">Berlaku langsung ke seluruh app — Shop, Studio, Matcher, AI.</p>
          <div className="grid grid-cols-2 gap-3 mb-5">
            {([
              ['Harga / kredit (Rp)',      'creditPrice', settings.creditPrice],
              ['Bonus user baru',         'welcomeCredits', settings.welcomeCredits],
              ['Bake Standard (33³)',     'matchCost', settings.matchCost],
              ['Precision Grade (65³)',   'powerGradeCost', settings.powerGradeCost],
              ['Biaya chat AI',           'aiChatCost', settings.aiChatCost],
            ] as [string, 'creditPrice'|'welcomeCredits'|'matchCost'|'powerGradeCost'|'aiChatCost', number][]).map(([label, key, val]) => (
              <div key={key}>
                <label className="text-[9px] font-black tracking-widest uppercase text-t3 block mb-1.5">{label}</label>
                <Input type="number" min={0} value={val}
                  onChange={e => settings.update({ [key]: Math.max(0, +e.target.value) })} />
              </div>
            ))}
          </div>

          {/* Packages */}
          <p className="text-[9px] font-black tracking-widest uppercase text-a2 mb-3">📦 Paket & Bundling Kredit</p>
          <div className="flex flex-col gap-2 mb-4">
            {settings.packages.map(p => {
              const perCredit = Math.round(p.price / p.credits)
              const disc = Math.max(0, Math.round((1 - perCredit / settings.creditPrice) * 100))
              return (
                <div key={p.id} className="flex items-center gap-3 bg-s3 rounded-xl px-3 py-2.5">
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-sm truncate">{p.name} {p.tag && <span className="text-[8px] font-black text-a2 ml-1">{p.tag}</span>}</p>
                    <p className="text-t3 text-[10px]">{p.credits} kredit · {rp(p.price)} · {rp(perCredit)}/kredit{disc > 0 ? ` · hemat ${disc}%` : ''}</p>
                  </div>
                  <button onClick={() => { const code = genCode(p.credits); navigator.clipboard?.writeText(code); toast(`✓ Kode ${p.credits} kredit disalin`) }}
                    className="text-[10px] font-bold text-ok hover:text-ok/70 transition-colors flex-shrink-0">🎫 Kode</button>
                  <button onClick={() => settings.removePackage(p.id)} className="text-t3 hover:text-err transition-colors p-1 flex-shrink-0">
                    <Trash2 size={13} />
                  </button>
                </div>
              )
            })}
          </div>
          <div className="grid grid-cols-[1fr_72px_96px_auto] gap-2 items-end">
            <div>
              <label className="text-[9px] font-black tracking-widest uppercase text-t3 block mb-1.5">Nama paket</label>
              <Input value={newPack.name} onChange={e => setNewPack(p => ({ ...p, name: e.target.value }))} placeholder="Hemat 100" />
            </div>
            <div>
              <label className="text-[9px] font-black tracking-widest uppercase text-t3 block mb-1.5">Kredit</label>
              <Input type="number" min={1} value={newPack.credits} onChange={e => setNewPack(p => ({ ...p, credits: +e.target.value }))} />
            </div>
            <div>
              <label className="text-[9px] font-black tracking-widest uppercase text-t3 block mb-1.5">Harga Rp</label>
              <Input type="number" min={0} value={newPack.price} onChange={e => setNewPack(p => ({ ...p, price: +e.target.value }))} />
            </div>
            <Btn variant="accent" onClick={() => {
              if (!newPack.name.trim() || newPack.credits < 1) { toast('Isi nama & kredit paket', 'err'); return }
              settings.addPackage({ name: newPack.name.trim(), credits: newPack.credits, price: newPack.price, tag: newPack.tag || undefined })
              setNewPack({ name: '', credits: 50, price: 50000, tag: '' })
              toast('✓ Paket ditambahkan')
            }}><Plus size={14} /></Btn>
          </div>
        </div>

        {/* ── User Management ── */}
        <div className="bg-s2 border border-b1 rounded-2xl p-6">
          <h2 className="font-bold text-lg mb-1 flex items-center gap-2"><Users size={17} className="text-a4" /> User Management</h2>
          <p className="text-t3 text-xs mb-5">User terdaftar di perangkat ini — atur saldo kredit atau hapus akun.</p>
          <div className="flex flex-col gap-2 max-h-[420px] overflow-y-auto pr-1">
            {users.length === 0 ? (
              <p className="text-t3 text-xs text-center py-10">Belum ada user terdaftar</p>
            ) : users.map(u => (
              <div key={u.id} className="bg-s3 rounded-xl p-3">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-accent to-orange-400 text-white flex items-center justify-center text-sm font-black flex-shrink-0">
                    {u.name[0]?.toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-sm truncate">{u.name} <span className="text-t3 font-normal text-xs">@{u.username}</span></p>
                    <p className="text-t3 text-[10px]">Join {new Date(u.joined).toLocaleDateString('id-ID')} · <span className="text-ok font-bold">{u.credits} kredit</span></p>
                  </div>
                  <button onClick={() => { if (confirm(`Hapus akun @${u.username}?`)) { adminDeleteUser(u.id); toast('User dihapus') } }}
                    className="text-t3 hover:text-err transition-colors p-1 flex-shrink-0">
                    <Trash2 size={14} />
                  </button>
                </div>
                <div className="flex gap-2 mt-2.5">
                  <input type="number" min={0} placeholder={String(u.credits)}
                    value={creditEdits[u.id] ?? ''}
                    onChange={e => setCreditEdits(c => ({ ...c, [u.id]: e.target.value }))}
                    className="w-24 bg-s2 border border-b1 text-txt px-2.5 py-1.5 rounded-lg text-xs outline-none focus:border-accent" />
                  <button onClick={() => {
                    const v = parseInt(creditEdits[u.id] || '')
                    if (isNaN(v)) { toast('Masukkan jumlah kredit', 'warn'); return }
                    adminSetCredits(u.id, v)
                    setCreditEdits(c => ({ ...c, [u.id]: '' }))
                    toast(`✓ Saldo @${u.username} → ${v} kredit`)
                  }} className="px-3 py-1.5 bg-ok/10 border border-ok/30 text-ok rounded-lg text-[10px] font-bold hover:bg-ok/20 transition-colors">
                    Set Saldo
                  </button>
                  <button onClick={() => { adminSetCredits(u.id, u.credits + 10); toast(`+10 kredit untuk @${u.username}`) }}
                    className="px-3 py-1.5 bg-s2 border border-b2 text-t2 rounded-lg text-[10px] font-bold hover:border-b3 transition-colors">
                    +10
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
