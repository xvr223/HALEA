'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuthStore } from '@/store/auth'
import { useSettingsStore } from '@/store/settings'
import { Btn, Input, toast } from '@/components/ui'
import { useT } from '@/lib/i18n'

type Mode = 'login' | 'register'

export default function LoginPage() {
  const [mode, setMode] = useState<Mode>('login')
  const [name, setName] = useState('')
  const [username, setUsername] = useState('')
  const [pass, setPass] = useState('')
  const [loading, setLoading] = useState(false)
  const { login, register } = useAuthStore()
  const welcomeCredits = useSettingsStore(s => s.welcomeCredits)
  const router = useRouter()
  const t = useT()

  const goNext = (isAdmin: boolean) => {
    const next = new URLSearchParams(window.location.search).get('next')
    router.push(isAdmin ? '/admin' : (next || '/studio'))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    await new Promise(r => setTimeout(r, 350))
    if (mode === 'login') {
      const ok = login(username, pass)
      setLoading(false)
      if (ok) {
        const isAdmin = username.trim().toLowerCase() === 'admin'
        toast(isAdmin ? t('✓ Masuk sebagai Admin') : t('✓ Selamat datang kembali!'))
        goNext(isAdmin)
      } else toast(t('Username / password salah'), 'err')
    } else {
      const err = register(name, username, pass)
      setLoading(false)
      if (!err) {
        toast(t('🎉 Akun dibuat — bonus {n} kredit AI!').replace('{n}', String(welcomeCredits)))
        goNext(false)
      } else toast(err, 'err')
    }
  }

  return (
    <div className="min-h-[90vh] flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">

        {/* Logo */}
        <div className="text-center mb-7">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-accent to-orange-400 flex items-center justify-center mx-auto mb-4 glow-accent">
            <svg width="28" height="28" viewBox="0 0 20 20"><circle cx="10" cy="10" r="3" fill="white"/><circle cx="10" cy="10" r="6.5" fill="none" stroke="white" strokeWidth="1.2" opacity=".5"/></svg>
          </div>
          <h1 className="font-fraunces text-3xl font-semibold mb-1">
            {mode === 'login' ? <>{t('Masuk ke')} <span className="italic text-accent">HALEA</span></> : <>{t('Daftar')} <span className="italic text-accent">{t('Gratis')}</span></>}
          </h1>
          <p className="text-t2 text-sm">
            {mode === 'login' ? t('Lanjutkan grading & belajarmu') : t('Langsung dapat {n} kredit AI gratis').replace('{n}', String(welcomeCredits))}
          </p>
        </div>

        {/* Mode tabs */}
        <div className="grid grid-cols-2 gap-1 bg-s3 border border-b1 rounded-xl p-1 mb-4">
          {([['login', 'Masuk'], ['register', 'Daftar']] as [Mode, string][]).map(([m, label]) => (
            <button key={m} onClick={() => setMode(m)}
              className={`py-2 rounded-lg text-xs font-bold transition-colors ${mode === m ? 'bg-accent text-white' : 'text-t2 hover:text-txt'}`}>
              {t(label)}
            </button>
          ))}
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="bg-s2 border border-b1 rounded-2xl p-6 flex flex-col gap-4">
          {mode === 'register' && (
            <div className="flex flex-col gap-1.5">
              <label className="text-[9px] font-black tracking-widest uppercase text-t3">{t('Nama')}</label>
              <Input type="text" placeholder={t('Nama kamu')} value={name} onChange={e => setName(e.target.value)} autoFocus />
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <label className="text-[9px] font-black tracking-widest uppercase text-t3">Username</label>
            <Input type="text" placeholder="username" value={username} onChange={e => setUsername(e.target.value)} autoFocus={mode === 'login'} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-[9px] font-black tracking-widest uppercase text-t3">Password</label>
            <Input type="password" placeholder="••••••••" value={pass} onChange={e => setPass(e.target.value)} />
          </div>
          <Btn type="submit" variant="accent" size="lg" loading={loading} className="w-full mt-1">
            {mode === 'login' ? t('Masuk') : t('Daftar + {n} Kredit Gratis').replace('{n}', String(welcomeCredits))}
          </Btn>
          {mode === 'register' && (
            <p className="text-center text-[10px] text-t3 leading-relaxed">
              {t('Akun tersimpan di perangkat ini. Kredit AI dipakai untuk Bake LUT, Shot Matcher, dan HALEA AI.')}
            </p>
          )}
        </form>

        <p className="text-center mt-6 text-xs text-t3">
          <Link href="/" className="hover:text-accent transition-colors">{t('← Kembali ke HALEA')}</Link>
        </p>
      </div>
    </div>
  )
}
