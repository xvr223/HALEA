import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { useSettingsStore } from './settings'

// Akun bersifat lokal per-perangkat (tanpa backend) — cocok dengan model
// pembayaran via DM + redeem code. Password disimpan sebagai hash sederhana.

export interface RegisteredUser {
  id: string
  name: string
  username: string
  passHash: string
  credits: number
  joined: number
}

type SessionUser = { id: string; name: string; username: string; role: 'admin' | 'user' }

interface AuthState {
  user: SessionUser | null
  credits: number              // mirror saldo user aktif (untuk UI)
  users: RegisteredUser[]
  register: (name: string, username: string, pass: string) => string | null   // null = sukses, string = pesan error
  login: (username: string, pass: string) => boolean
  logout: () => void
  addCredits: (n: number) => void
  useCredit: (n?: number) => boolean
  redeemCode: (code: string) => boolean
  // admin
  adminSetCredits: (id: string, n: number) => void
  adminDeleteUser: (id: string) => void
}

const ADMIN = { user: 'admin', pass: 'halea2025' }

const hash = (s: string) => {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0
  return 'h' + (h >>> 0).toString(36)
}
const mkId = () => 'u' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)

export function genCode(credits: number) {
  return btoa(`HALEA:${credits}:${Date.now()}`).replace(/=/g, '')
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      credits: 0,
      users: [],

      register: (name, username, pass) => {
        const uname = username.trim().toLowerCase()
        if (!name.trim()) return 'Nama tidak boleh kosong'
        if (!/^[a-z0-9_]{3,16}$/.test(uname)) return 'Username 3–16 karakter (huruf kecil, angka, _)'
        if (uname === ADMIN.user) return 'Username tidak tersedia'
        if (pass.length < 4) return 'Password minimal 4 karakter'
        if (get().users.some(u => u.username === uname)) return 'Username sudah terdaftar di perangkat ini'
        const welcome = useSettingsStore.getState().welcomeCredits
        const nu: RegisteredUser = {
          id: mkId(), name: name.trim(), username: uname,
          passHash: hash(pass), credits: welcome, joined: Date.now(),
        }
        set(s => ({
          users: [...s.users, nu],
          user: { id: nu.id, name: nu.name, username: nu.username, role: 'user' },
          credits: nu.credits,
        }))
        return null
      },

      login: (username, pass) => {
        const uname = username.trim().toLowerCase()
        if (uname === ADMIN.user && pass === ADMIN.pass) {
          set({ user: { id: 'admin', name: 'Robbie', username: 'admin', role: 'admin' }, credits: 0 })
          return true
        }
        const u = get().users.find(x => x.username === uname && x.passHash === hash(pass))
        if (!u) return false
        set({ user: { id: u.id, name: u.name, username: u.username, role: 'user' }, credits: u.credits })
        return true
      },

      logout: () => set({ user: null, credits: 0 }),

      addCredits: (n) => {
        const { user } = get()
        if (!user || user.role === 'admin') return
        set(s => ({
          users: s.users.map(u => u.id === user.id ? { ...u, credits: u.credits + n } : u),
          credits: s.credits + n,
        }))
      },

      useCredit: (n = 1) => {
        const { user, credits } = get()
        if (!user) return false
        if (user.role === 'admin') return true
        if (credits < n) return false
        set(s => ({
          users: s.users.map(u => u.id === user.id ? { ...u, credits: u.credits - n } : u),
          credits: s.credits - n,
        }))
        return true
      },

      redeemCode: (code) => {
        try {
          const dec = atob(code.trim().replace(/-/g, '+').replace(/_/g, '/'))
          const [prefix, credits] = dec.split(':')
          if (prefix === 'HALEA' && credits && +credits > 0) {
            get().addCredits(parseInt(credits))
            return true
          }
        } catch {}
        return false
      },

      adminSetCredits: (id, n) => set(s => ({
        users: s.users.map(u => u.id === id ? { ...u, credits: Math.max(0, n) } : u),
        credits: s.user?.id === id ? Math.max(0, n) : s.credits,
      })),

      adminDeleteUser: (id) => set(s => ({
        users: s.users.filter(u => u.id !== id),
        ...(s.user?.id === id ? { user: null, credits: 0 } : {}),
      })),
    }),
    {
      name: 'halea-auth',
      version: 2,
      migrate: () => ({ user: null, credits: 0, users: [] }) as Partial<AuthState> as AuthState,
    }
  )
)
