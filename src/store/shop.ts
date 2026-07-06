import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { getAdminKey } from '@/lib/launch'

export type ProductType = 'lut' | 'preset' | 'pack' | 'credits'

export interface Product {
  id: string
  name: string
  type: ProductType
  desc: string
  price: number
  thumb?: string
  fileData?: string      // local/demo products only — server files fetched on demand
  fileExt?: string
  credits?: number
  created: number
  hasFile?: boolean      // server-side file exists (download via /api/products?file=id)
}

// DB-backed shop: sync() pulls from /api/products so admin changes reach every
// visitor. Mutations go to the API (admin key) with an optimistic local update.
// When the DB isn't configured (local dev) it falls back to the old
// localStorage-only behavior, incl. demo seed. Actions resolve to an error
// message, or null on success.
interface ShopState {
  products: Product[]
  configured: boolean    // true = shared DB; false = this-device-only fallback
  synced: boolean
  sync: () => Promise<void>
  addProduct: (p: Omit<Product, 'id' | 'created'>) => Promise<string | null>
  updateProduct: (id: string, data: Partial<Product>) => Promise<string | null>
  removeProduct: (id: string) => Promise<string | null>
  seedDemo: () => void
}

const DEMO: Omit<Product, 'id' | 'created'>[] = [
  { name: 'Jakarta Nights', type: 'lut', price: 0, desc: 'Neon-soaked urban Indonesia night look with red halation. Free.' },
  { name: 'Golden Tropics', type: 'lut', price: 12, desc: 'Warm golden-hour grade for tropical daylight & skin tones.' },
  { name: 'Kopi & Film Pack', type: 'pack', price: 29, desc: '5 LUTs: warm vintage looks inspired by Indonesian coffee culture.' },
  { name: 'Clean Commercial', type: 'preset', price: 0, desc: 'Natural punchy look for product & commercial work. Free.' },
  { name: 'AI Credits — 10 Pack', type: 'credits', price: 5, credits: 10, desc: '10 AI Match credits. Claude Vision analyzes your reference photo. Code via DM.' },
  { name: 'AI Credits — 25 Pack', type: 'credits', price: 10, credits: 25, desc: '25 AI Match credits. Best value for active editors.' },
]

const adminHeaders = () => ({ 'Content-Type': 'application/json', 'x-admin-key': getAdminKey() })

export const useShopStore = create<ShopState>()(
  persist(
    (set, get) => ({
      products: [],
      configured: false,
      synced: false,

      sync: async () => {
        try {
          const r = await fetch('/api/products', { cache: 'no-store' })
          const j = await r.json()
          if (j.configured) {
            set({ products: j.products || [], configured: true, synced: true })
            return
          }
        } catch {}
        set({ configured: false, synced: true })
        get().seedDemo()   // local dev mode — keep old demo behavior
      },

      addProduct: async (p) => {
        if (!get().configured) {
          set(s => ({ products: [{ ...p, id: 'p_' + Date.now() + Math.random().toString(36).slice(2, 5), created: Date.now() }, ...s.products] }))
          return null
        }
        try {
          const r = await fetch('/api/products', { method: 'POST', headers: adminHeaders(), body: JSON.stringify(p) })
          const j = await r.json()
          if (!r.ok) return j.error || 'Gagal menyimpan'
          set(s => ({ products: [j.product, ...s.products] }))
          return null
        } catch { return 'Koneksi ke DB gagal' }
      },

      updateProduct: async (id, data) => {
        if (!get().configured) {
          set(s => ({ products: s.products.map(p => p.id === id ? { ...p, ...data } : p) }))
          return null
        }
        try {
          const r = await fetch('/api/products', { method: 'PUT', headers: adminHeaders(), body: JSON.stringify({ id, ...data }) })
          const j = await r.json()
          if (!r.ok) return j.error || 'Gagal menyimpan'
          set(s => ({ products: s.products.map(p => p.id === id ? j.product : p) }))
          return null
        } catch { return 'Koneksi ke DB gagal' }
      },

      removeProduct: async (id) => {
        if (!get().configured) {
          set(s => ({ products: s.products.filter(p => p.id !== id) }))
          return null
        }
        try {
          const r = await fetch('/api/products', { method: 'DELETE', headers: adminHeaders(), body: JSON.stringify({ id }) })
          const j = await r.json()
          if (!r.ok) return j.error || 'Gagal menghapus'
          set(s => ({ products: s.products.filter(p => p.id !== id) }))
          return null
        } catch { return 'Koneksi ke DB gagal' }
      },

      seedDemo: () => {
        const s = get()
        if (s.configured || s.products.length > 0) return
        set({ products: DEMO.map((p, i) => ({ ...p, id: `demo_${i}`, created: Date.now() + i })) })
      },
    }),
    { name: 'halea-shop' }
  )
)
