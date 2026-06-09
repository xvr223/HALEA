'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuthStore } from '@/store/auth'
import { Btn, Input, toast } from '@/components/ui'

export default function LoginPage() {
  const [user, setUser] = useState('')
  const [pass, setPass] = useState('')
  const [loading, setLoading] = useState(false)
  const { login } = useAuthStore()
  const router = useRouter()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    await new Promise(r => setTimeout(r, 400))
    const ok = login(user, pass)
    setLoading(false)
    if (ok) { toast('✓ Signed in as Admin'); router.push('/admin') }
    else toast('Wrong credentials', 'err')
  }

  return (
    <div className="min-h-[90vh] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">

        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-accent to-orange-400 flex items-center justify-center mx-auto mb-4 glow-accent">
            <svg width="28" height="28" viewBox="0 0 20 20"><circle cx="10" cy="10" r="3" fill="white"/><circle cx="10" cy="10" r="6.5" fill="none" stroke="white" strokeWidth="1.2" opacity=".5"/></svg>
          </div>
          <h1 className="font-fraunces text-3xl font-semibold mb-1">Sign in to <span className="italic text-accent">HALEA</span></h1>
          <p className="text-t2 text-sm">Admin access for managing your shop</p>
        </div>

        {/* Form */}
        <form onSubmit={handleLogin} className="bg-s2 border border-b1 rounded-2xl p-6 flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-[9px] font-black tracking-widest uppercase text-t3">Username</label>
            <Input type="text" placeholder="admin" value={user} onChange={e => setUser(e.target.value)} autoFocus />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-[9px] font-black tracking-widest uppercase text-t3">Password</label>
            <Input type="password" placeholder="••••••••" value={pass} onChange={e => setPass(e.target.value)} />
          </div>
          <Btn type="submit" variant="accent" size="lg" loading={loading} className="w-full mt-2">
            Sign In
          </Btn>
          <p className="text-center text-[10px] text-t3 font-mono">Demo: admin / halea2025</p>
        </form>

        <p className="text-center mt-6 text-xs text-t3">
          <Link href="/" className="hover:text-accent transition-colors">← Back to HALEA</Link>
        </p>
      </div>
    </div>
  )
}
