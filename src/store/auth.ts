import { create } from 'zustand'
import { persist } from 'zustand/middleware'

type User = { name: string; role: 'admin' | 'user' }

interface AuthState {
  user: User | null
  credits: number
  login: (user: string, pass: string) => boolean
  logout: () => void
  addCredits: (n: number) => void
  useCredit: () => boolean
  redeemCode: (code: string) => boolean
}

const ADMIN = { user: 'admin', pass: 'halea2025' }

function genCode(credits: number) {
  return btoa(`HALEA:${credits}:${Date.now()}`).replace(/=/g, '')
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      credits: 0,

      login: (user, pass) => {
        if (user === ADMIN.user && pass === ADMIN.pass) {
          set({ user: { name: 'Robbie', role: 'admin' } })
          return true
        }
        return false
      },

      logout: () => set({ user: null }),

      addCredits: (n) => set(s => ({ credits: s.credits + n })),

      useCredit: () => {
        const { user, credits } = get()
        if (user?.role === 'admin') return true
        if (credits <= 0) return false
        set(s => ({ credits: s.credits - 1 }))
        return true
      },

      redeemCode: (code) => {
        try {
          const dec = atob(code.replace(/-/g, '+').replace(/_/g, '/'))
          const [prefix, credits] = dec.split(':')
          if (prefix === 'HALEA' && credits) {
            set(s => ({ credits: s.credits + parseInt(credits) }))
            return true
          }
        } catch {}
        return false
      },
    }),
    { name: 'halea-auth' }
  )
)

// Export for admin use
export { genCode }
