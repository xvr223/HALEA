'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore, genCode } from '@/store/auth'
import { useShopStore, Product } from '@/store/shop'
import { Btn, Input, Badge, toast, DropZone } from '@/components/ui'
import { Trash2, LogOut, Plus } from 'lucide-react'

export default function AdminPage() {
  const { user, logout } = useAuthStore()
  const { products, addProduct, removeProduct, seedDemo } = useShopStore()
  const router = useRouter()

  const [form, setForm] = useState({ name: '', type: 'lut', desc: '', price: 0, credits: 10 })
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
      <div className="grid grid-cols-3 gap-4 mb-10">
        {[['Total', stats.total, 'accent'], ['Free', stats.free, 'ok'], ['Paid', stats.paid, 'gold']].map(([l, v, c]) => (
          <div key={String(l)} className="bg-s2 border border-b1 rounded-2xl p-5 text-center">
            <div className={`font-mono text-4xl font-bold text-${c} mb-1`}>{v}</div>
            <div className="text-[9px] font-black tracking-widest uppercase text-t3">{l} Products</div>
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
                <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value as any }))}
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
    </div>
  )
}
