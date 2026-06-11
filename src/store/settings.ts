import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// Admin-configurable pricing & credit economy
export interface CreditPackage {
  id: string
  name: string
  credits: number
  price: number        // Rupiah
  tag?: string         // 'POPULER' | 'BEST VALUE' | ...
}

interface SettingsState {
  creditPrice: number      // Rp per kredit (harga satuan / custom)
  welcomeCredits: number   // bonus kredit user baru
  matchCost: number        // kredit per Bake LUT (Smart Match) & per LUT Shot Matcher
  aiChatCost: number       // kredit per pesan HALEA AI
  packages: CreditPackage[]
  update: (p: Partial<Omit<SettingsState, 'packages' | 'update' | 'addPackage' | 'removePackage' | 'updatePackage'>>) => void
  addPackage: (p: Omit<CreditPackage, 'id'>) => void
  removePackage: (id: string) => void
  updatePackage: (id: string, p: Partial<CreditPackage>) => void
}

const mkId = () => 'pk' + Date.now() + Math.random().toString(36).slice(2, 5)

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      creditPrice: 2000,
      welcomeCredits: 10,
      matchCost: 1,
      aiChatCost: 1,
      packages: [
        { id: 'pk_starter', name: 'Starter',    credits: 25,  price: 39000 },
        { id: 'pk_creator', name: 'Creator',    credits: 60,  price: 79000,  tag: 'POPULER' },
        { id: 'pk_pro',     name: 'Studio Pro', credits: 150, price: 159000, tag: 'BEST VALUE' },
      ],
      update: (p) => set(p),
      addPackage: (p) => set(s => ({ packages: [...s.packages, { ...p, id: mkId() }] })),
      removePackage: (id) => set(s => ({ packages: s.packages.filter(x => x.id !== id) })),
      updatePackage: (id, p) => set(s => ({ packages: s.packages.map(x => x.id === id ? { ...x, ...p } : x) })),
    }),
    { name: 'halea-settings' }
  )
)

export const rp = (n: number) => 'Rp' + n.toLocaleString('id-ID')
