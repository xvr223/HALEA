'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuthStore } from '@/store/auth'
import { useSettingsStore, rp } from '@/store/settings'
import { toast } from '@/components/ui'
import { LogOut, Trash2, ShoppingBag, GraduationCap, Zap } from 'lucide-react'
import { RANKS, CHAPTERS } from '../learn/curriculum'

interface LearnProgress { done: string[]; xp: number; missions: string[] }

export default function ProfilePage() {
  const { user, credits, users, logout, adminDeleteUser, redeemCode } = useAuthStore()
  const { matchCost, aiChatCost, creditPrice } = useSettingsStore()
  const router = useRouter()
  const [learn, setLearn] = useState<LearnProgress>({ done: [], xp: 0, missions: [] })

  useEffect(() => {
    if (!user) { router.push('/login?next=/profile'); return }
    try {
      const p = JSON.parse(localStorage.getItem(`halea_learn_${user.id}`) || '')
      setLearn({ done: p.done || [], xp: p.xp || 0, missions: p.missions || [] })
    } catch {}
  }, [user, router])

  if (!user) return null

  const account = users.find(u => u.id === user.id)
  const rank = RANKS.reduce((acc, r) => learn.xp >= r.xp ? r : acc, RANKS[0])
  const totalLessons = CHAPTERS.reduce((s, c) => s + c.lessons.length, 0)
  const isAdmin = user.role === 'admin'

  const handleRedeem = () => {
    const code = prompt('Masukkan kode kredit dari admin:')
    if (!code) return
    if (redeemCode(code)) toast('✓ Kredit berhasil ditambahkan!')
    else toast('Kode tidak valid', 'err')
  }

  const handleDelete = () => {
    if (!confirm('Hapus akun ini beserta saldo kreditnya? Tidak bisa dibatalkan.')) return
    adminDeleteUser(user.id)
    toast('Akun dihapus')
    router.push('/')
  }

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10">

      {/* Header card */}
      <div className="bg-s2 border border-b1 rounded-2xl p-6 mb-6 flex items-center gap-5">
        <div className={`w-16 h-16 rounded-2xl flex items-center justify-center text-2xl font-black flex-shrink-0 ${isAdmin ? 'bg-a2 text-black' : 'bg-gradient-to-br from-accent to-orange-400 text-white'}`}>
          {user.name[0]?.toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="font-fraunces text-2xl font-semibold leading-tight truncate">{user.name}</h1>
          <p className="text-t3 text-sm font-mono">@{user.username}</p>
          <div className="flex items-center gap-2 mt-1.5">
            <span className={`text-[9px] font-black tracking-widest uppercase px-2 py-0.5 rounded-full border ${isAdmin ? 'text-a2 border-a2/30 bg-a2/10' : 'text-accent border-accent/30 bg-accent/10'}`}>
              {isAdmin ? '👑 Admin' : `${rank.icon} ${rank.title}`}
            </span>
            {account && <span className="text-[10px] text-t3">Bergabung {new Date(account.joined).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}</span>}
          </div>
        </div>
        <button onClick={() => { logout(); router.push('/') }}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-t2 hover:text-err hover:bg-err/10 text-xs font-bold transition-colors flex-shrink-0">
          <LogOut size={14} /> Keluar
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">

        {/* Credits */}
        <div className="bg-s2 border border-b1 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <Zap size={14} className="text-ok" />
            <p className="text-[9px] font-black tracking-widest uppercase text-t3">Kredit AI</p>
          </div>
          <p className="font-mono text-4xl font-bold text-ok mb-1">{isAdmin ? '∞' : credits}</p>
          <p className="text-[11px] text-t3 leading-relaxed mb-4">
            Bake LUT: {matchCost} kredit · LUT Matcher: {matchCost} kredit · Chat AI: {aiChatCost} kredit
            {!isAdmin && <><br/>Harga satuan: {rp(creditPrice)}/kredit</>}
          </p>
          {!isAdmin && (
            <div className="flex gap-2">
              <Link href="/shop" className="flex-1 px-3 py-2.5 bg-ok/10 border border-ok/30 text-ok rounded-xl text-xs font-bold text-center hover:bg-ok/20 transition-colors">
                <ShoppingBag size={12} className="inline mr-1.5 -mt-0.5"/>Beli Paket
              </Link>
              <button onClick={handleRedeem} className="flex-1 px-3 py-2.5 bg-s3 border border-b2 text-txt rounded-xl text-xs font-bold hover:border-b3 transition-colors">
                🎫 Redeem Kode
              </button>
            </div>
          )}
        </div>

        {/* Learning */}
        <div className="bg-s2 border border-b1 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <GraduationCap size={14} className="text-accent" />
            <p className="text-[9px] font-black tracking-widest uppercase text-t3">HALEA Academy</p>
          </div>
          <div className="flex items-baseline gap-2 mb-1">
            <p className="font-mono text-4xl font-bold text-accent">{learn.xp}</p>
            <p className="text-sm font-bold text-t2">XP</p>
            <p className="text-2xl ml-auto">{rank.icon}</p>
          </div>
          <p className="text-[11px] text-t3 mb-4">
            {learn.done.length}/{totalLessons} pelajaran · {learn.missions.length} misi selesai
          </p>
          <Link href="/learn" className="block px-3 py-2.5 bg-accent/10 border border-accent/30 text-accent rounded-xl text-xs font-bold text-center hover:bg-accent/20 transition-colors">
            Lanjut Belajar →
          </Link>
        </div>
      </div>

      {/* Quick links */}
      <div className="grid grid-cols-3 gap-3 mb-8">
        {[
          ['/studio',  '🎬', 'Studio'],
          ['/matcher', '⚡', 'Matcher'],
          ['/ai',      '🤖', 'HALEA AI'],
        ].map(([href, icon, label]) => (
          <Link key={href} href={href}
            className="bg-s2 border border-b1 rounded-xl p-4 text-center hover:border-accent/40 hover:-translate-y-0.5 transition-all">
            <span className="text-2xl block mb-1">{icon}</span>
            <span className="text-xs font-bold text-t2">{label}</span>
          </Link>
        ))}
      </div>

      {/* Danger zone */}
      {!isAdmin && (
        <div className="border border-err/20 bg-err/5 rounded-2xl p-5 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-bold text-err mb-0.5">Hapus Akun</p>
            <p className="text-[11px] text-t3">Akun, saldo kredit, dan progres belajar di perangkat ini akan terhapus permanen.</p>
          </div>
          <button onClick={handleDelete}
            className="flex items-center gap-1.5 px-4 py-2.5 bg-err/10 border border-err/30 text-err rounded-xl text-xs font-bold hover:bg-err/20 transition-colors flex-shrink-0">
            <Trash2 size={13} /> Hapus
          </button>
        </div>
      )}
    </div>
  )
}
