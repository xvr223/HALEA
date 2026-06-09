'use client'
import { useEffect, useState } from 'react'
import { useShopStore, Product } from '@/store/shop'
import { useAuthStore } from '@/store/auth'
import { Badge, Btn, Card, toast } from '@/components/ui'
import Link from 'next/link'

const TYPE_LABELS: Record<string, string> = { lut: 'LUT', preset: 'Preset', pack: 'Pack', credits: 'AI Credits' }
const FILTERS = ['All', 'LUT', 'Preset', 'Pack', 'AI Credits', 'Free']

export default function ShopPage() {
  const { products, seedDemo } = useShopStore()
  const { user, credits, redeemCode } = useAuthStore()
  const [filter, setFilter] = useState('All')
  const [selected, setSelected] = useState<Product | null>(null)

  useEffect(() => { seedDemo() }, [seedDemo])

  const filtered = products.filter(p => {
    if (filter === 'All') return true
    if (filter === 'Free') return p.price === 0
    if (filter === 'AI Credits') return p.type === 'credits'
    return p.type === filter.toLowerCase()
  })

  const handleRedeem = () => {
    const code = prompt('Enter AI Credits code:')
    if (!code) return
    if (redeemCode(code)) toast('✓ Credits added!')
    else toast('Invalid code', 'err')
  }

  const handleDownload = (p: Product) => {
    if (!p.fileData) { toast('No file attached', 'err'); return }
    const a = document.createElement('a')
    a.href = p.fileData; a.download = p.name.replace(/\s+/g, '_') + (p.fileExt || '.cube'); a.click()
    toast('✓ Downloaded: ' + p.name)
    setSelected(null)
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12">

      {/* Header */}
      <div className="text-center mb-12">
        <p className="text-[10px] font-bold tracking-[.2em] uppercase text-accent mb-3">HALEA Shop</p>
        <h1 className="font-fraunces text-5xl sm:text-6xl font-semibold mb-4">
          Premium <span className="italic text-accent">LUTs</span> &amp; Presets
        </h1>
        <p className="text-t2 max-w-md mx-auto text-sm leading-relaxed">
          Cinematic looks crafted by @robbiesatriaa. Free & paid. Works with Premiere, Resolve, AE, FCPX.
        </p>

        {/* Credit badge */}
        <div className="flex items-center justify-center gap-3 mt-6">
          {user?.role !== 'admin' && (
            <button onClick={handleRedeem}
              className="flex items-center gap-2 px-4 py-2 rounded-full bg-ok/10 border border-ok/20 text-ok text-xs font-bold hover:bg-ok/15 transition-colors">
              🤖 {credits} AI Credits · Redeem Code
            </button>
          )}
          {!user && (
            <Link href="/login" className="text-t3 text-xs hover:text-accent transition-colors">Sign in as admin →</Link>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap mb-8">
        {FILTERS.map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-4 py-1.5 rounded-full text-xs font-bold border transition-colors ${filter === f ? 'bg-accent border-accent text-white' : 'bg-s2 border-b1 text-t2 hover:border-b3'}`}>
            {f}
          </button>
        ))}
      </div>

      {/* Grid */}
      {filtered.length === 0 ? (
        <div className="text-center py-24 text-t3">
          <div className="text-5xl mb-4 opacity-20">🛍</div>
          <p className="text-sm">No products yet.{user ? ' Go to Admin to add some.' : ''}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map(p => (
            <button key={p.id} onClick={() => setSelected(p)}
              className="bg-s2 border border-b1 rounded-2xl overflow-hidden hover:border-accent/30 hover:-translate-y-1 transition-all text-left group">
              {/* Thumb */}
              {p.thumb ? (
                <img src={p.thumb} alt={p.name} className="w-full h-40 object-cover" />
              ) : (
                <div className="w-full h-40 bg-gradient-to-br from-s3 to-s4 flex items-center justify-center text-4xl opacity-40">
                  {p.type === 'lut' ? '🎞' : p.type === 'credits' ? '🤖' : p.type === 'pack' ? '📦' : '✦'}
                </div>
              )}
              <div className={`px-1 py-0.5 text-center text-[9px] font-black tracking-widest ${p.price === 0 ? 'bg-ok/20 text-ok' : 'bg-accent/20 text-accent'}`}>
                {p.price === 0 ? 'FREE' : 'PRO'}
              </div>
              <div className="p-4">
                <p className="text-[9px] font-bold tracking-widest uppercase text-accent mb-1">{TYPE_LABELS[p.type] || p.type}</p>
                <h3 className="font-bold text-sm mb-2 group-hover:text-accent transition-colors leading-tight">{p.name}</h3>
                <p className="text-t2 text-[11px] leading-relaxed mb-3 line-clamp-2">{p.desc}</p>
                <div className="flex items-center justify-between">
                  <span className={`font-mono text-sm font-bold ${p.price === 0 ? 'text-ok' : 'text-a2'}`}>
                    {p.price === 0 ? 'Free' : '$' + p.price}
                  </span>
                  <span className="text-[10px] text-t3 font-bold">{p.price === 0 ? 'Download →' : 'Get →'}</span>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Product Modal */}
      {selected && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in"
          onClick={e => e.target === e.currentTarget && setSelected(null)}>
          <div className="bg-s2 border border-b2 rounded-2xl max-w-md w-full max-h-[85vh] overflow-y-auto">
            {selected.thumb && <img src={selected.thumb} alt={selected.name} className="w-full h-48 object-cover rounded-t-2xl" />}
            <div className="p-6">
              <Badge color={selected.type === 'credits' ? 'ai' : 'accent'}>{TYPE_LABELS[selected.type]}</Badge>
              <h2 className="font-bold text-xl mt-2 mb-1">{selected.name}</h2>
              <p className={`font-mono text-lg font-bold mb-3 ${selected.price === 0 ? 'text-ok' : 'text-a2'}`}>
                {selected.price === 0 ? 'Free' : '$' + selected.price}
              </p>
              <p className="text-t2 text-sm leading-relaxed mb-5">{selected.desc}</p>

              {selected.type === 'credits' ? (
                <div className="space-y-3">
                  <div className="bg-s3 rounded-xl p-4 text-sm text-t2 leading-relaxed">
                    💡 Buy AI Credits via DM → receive a code → redeem above for instant activation.
                    <br/>Current balance: <span className="text-ok font-bold">{credits} credits</span>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={handleRedeem} className="flex-1 px-4 py-2.5 bg-s4 border border-b2 text-xs font-bold rounded-xl hover:border-b3 transition-colors">
                      🎫 Redeem Code
                    </button>
                    <a href="https://instagram.com/robbiesatriaa" target="_blank"
                      className="flex-1 px-4 py-2.5 bg-a4 text-black text-xs font-bold rounded-xl text-center hover:bg-purple-300 transition-colors">
                      Buy via DM
                    </a>
                  </div>
                </div>
              ) : selected.price === 0 ? (
                <Btn variant="accent" size="lg" className="w-full" onClick={() => handleDownload(selected)}>
                  ⬇ Download Free
                </Btn>
              ) : (
                <a href="https://instagram.com/robbiesatriaa" target="_blank"
                  className="block text-center px-6 py-3 bg-accent text-white text-sm font-bold rounded-xl hover:bg-orange-400 transition-colors">
                  Contact to Buy — @robbiesatriaa
                </a>
              )}
              <button onClick={() => setSelected(null)} className="w-full mt-3 text-t3 text-xs hover:text-txt transition-colors">Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
