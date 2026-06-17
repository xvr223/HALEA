'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import { Menu, X, Instagram } from 'lucide-react'
import { useAuthStore } from '@/store/auth'
import clsx from 'clsx'

const NAV = [
  { href: '/',        label: 'Beranda' },
  { href: '/studio',  label: 'Studio' },
  { href: '/matcher', label: 'Matcher' },
  { href: '/shop',    label: 'Shop' },
  { href: '/ai',      label: 'AI' },
  { href: '/learn',   label: 'Belajar' },
  { href: '/gym',     label: 'Gym' },
  { href: '/panduan', label: 'Panduan' },
  { href: '/about',   label: 'Tentang' },
]

export function Navbar() {
  const path = usePathname()
  const [open, setOpen] = useState(false)
  const { user, credits } = useAuthStore()
  const isAdmin = user?.role === 'admin'

  return (
    <header className="sticky top-0 z-50 glass border-b border-b1">
      <nav className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center gap-4">

        {/* Logo */}
        <Link href="/" className="flex items-center gap-2.5 mr-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-accent to-orange-400 flex items-center justify-center glow-accent flex-shrink-0">
            <svg width="16" height="16" viewBox="0 0 20 20"><circle cx="10" cy="10" r="3" fill="white"/><circle cx="10" cy="10" r="6.5" fill="none" stroke="white" strokeWidth="1.2" opacity=".5"/><circle cx="10" cy="10" r="9" fill="none" stroke="white" strokeWidth=".5" opacity=".2"/></svg>
          </div>
          <span className="font-fraunces text-lg font-semibold">
            HAL<span className="italic text-accent">E</span>A
          </span>
        </Link>

        {/* Desktop Nav */}
        <div className="hidden md:flex items-center gap-1 flex-1">
          {NAV.map(n => (
            <Link key={n.href} href={n.href}
              className={clsx(
                'px-3 py-1.5 rounded-md text-xs font-bold tracking-widest uppercase transition-colors',
                path === n.href
                  ? 'text-accent bg-accent/10'
                  : 'text-t2 hover:text-txt hover:bg-s3'
              )}>
              {n.label}
            </Link>
          ))}
          {isAdmin && (
            <Link href="/admin"
              className={clsx('px-3 py-1.5 rounded-md text-xs font-bold tracking-widest uppercase transition-colors',
                path === '/admin' ? 'text-a2 bg-a2/10' : 'text-t3 hover:text-a2 hover:bg-a2/10'
              )}>
              Admin
            </Link>
          )}
        </div>

        <div className="flex-1 hidden md:block" />

        {/* Right side */}
        <div className="hidden md:flex items-center gap-3">
          <a href="https://instagram.com/haleastudio" target="_blank"
            className="flex items-center gap-1.5 text-t3 hover:text-accent text-xs font-mono transition-colors">
            <Instagram size={13} />
            @haleastudio
          </a>

          {user ? (
            <div className="flex items-center gap-2">
              {!isAdmin && (
                <Link href="/shop" className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-ok/10 border border-ok/20 text-ok text-xs font-bold">
                  🤖 {credits} kredit
                </Link>
              )}
              <Link href={isAdmin ? '/admin' : '/profile'}
                className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-s3 border border-b1 text-xs font-bold hover:border-b3 transition-colors">
                <div className={clsx('w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black', isAdmin ? 'bg-a2 text-black' : 'bg-accent text-white')}>
                  {user.name[0]}
                </div>
                {user.name}
              </Link>
            </div>
          ) : (
            <Link href="/login"
              className="px-3 py-1.5 rounded-md bg-accent text-white text-xs font-bold tracking-wide hover:bg-orange-400 transition-colors">
              Masuk
            </Link>
          )}
        </div>

        {/* Mobile hamburger */}
        <button className="md:hidden ml-auto text-t2 hover:text-txt" onClick={() => setOpen(!open)}>
          {open ? <X size={20} /> : <Menu size={20} />}
        </button>
      </nav>

      {/* Mobile Menu */}
      {open && (
        <div className="md:hidden bg-s1 border-t border-b1 px-4 py-3 flex flex-col gap-1 animate-fade-in">
          {NAV.map(n => (
            <Link key={n.href} href={n.href} onClick={() => setOpen(false)}
              className={clsx('px-3 py-2.5 rounded-md text-sm font-bold tracking-wide uppercase',
                path === n.href ? 'text-accent bg-accent/10' : 'text-t2'
              )}>
              {n.label}
            </Link>
          ))}
          {isAdmin && <Link href="/admin" onClick={() => setOpen(false)} className="px-3 py-2.5 text-sm font-bold text-a2">Admin</Link>}
          {user && !isAdmin ? (
            <Link href="/profile" onClick={() => setOpen(false)}
              className="px-3 py-2.5 rounded-md text-sm font-bold tracking-wide uppercase text-t2 flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-accent text-white flex items-center justify-center text-[10px] font-black">{user.name[0]}</span>
              Profil · 🤖 {credits}
            </Link>
          ) : !user && (
            <Link href="/login" onClick={() => setOpen(false)}
              className="px-3 py-2.5 rounded-md text-sm font-bold tracking-wide uppercase text-accent">
              Masuk / Daftar
            </Link>
          )}
        </div>
      )}
    </header>
  )
}
