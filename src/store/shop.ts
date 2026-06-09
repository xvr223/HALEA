import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type ProductType = 'lut' | 'preset' | 'pack' | 'credits'

export interface Product {
  id: string
  name: string
  type: ProductType
  desc: string
  price: number
  thumb?: string
  fileData?: string
  fileExt?: string
  credits?: number
  created: number
}

interface ShopState {
  products: Product[]
  addProduct: (p: Omit<Product, 'id' | 'created'>) => void
  removeProduct: (id: string) => void
  updateProduct: (id: string, data: Partial<Product>) => void
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

export const useShopStore = create<ShopState>()(
  persist(
    (set, get) => ({
      products: [],

      addProduct: (p) => set(s => ({
        products: [...s.products, { ...p, id: 'p_' + Date.now() + Math.random().toString(36).slice(2,5), created: Date.now() }]
      })),

      removeProduct: (id) => set(s => ({ products: s.products.filter(p => p.id !== id) })),

      updateProduct: (id, data) => set(s => ({
        products: s.products.map(p => p.id === id ? { ...p, ...data } : p)
      })),

      seedDemo: () => {
        const existing = get().products
        if (existing.length > 0) return
        set({
          products: DEMO.map((p, i) => ({ ...p, id: `demo_${i}`, created: Date.now() + i }))
        })
      },
    }),
    { name: 'halea-shop' }
  )
)
