'use client'
import { useState } from 'react'
import Link from 'next/link'
import { verifyCert, CertInfo } from '@/lib/cert'
import { ShieldCheck, ShieldX } from 'lucide-react'

export default function VerifyPage() {
  const [input, setInput] = useState('')
  const [checked, setChecked] = useState(false)
  const [info, setInfo] = useState<CertInfo | null>(null)

  const check = () => {
    setInfo(verifyCert(input))
    setChecked(true)
  }

  return (
    <div className="min-h-[85vh] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">

        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <svg width="56" height="56" viewBox="0 0 72 72">
              <circle cx="36" cy="36" r="32" fill="none" stroke="#f97316" strokeWidth="1.5" opacity="0.2"/>
              <circle cx="36" cy="36" r="21" fill="none" stroke="#f97316" strokeWidth="2" opacity="0.45"/>
              <circle cx="36" cy="36" r="11" fill="none" stroke="#f97316" strokeWidth="2.5" opacity="0.75"/>
              <circle cx="36" cy="36" r="4.5" fill="#f97316"/>
            </svg>
          </div>
          <h1 className="font-fraunces text-3xl font-semibold mb-2">
            Verifikasi <span className="italic text-accent">Sertifikat</span>
          </h1>
          <p className="text-t2 text-sm leading-relaxed">
            Cek keaslian sertifikat HALEA Academy — paste kode verifikasi yang tertera di sertifikat.
          </p>
        </div>

        <div className="bg-s2 border border-b1 rounded-2xl p-5 flex flex-col gap-3">
          <textarea value={input} onChange={e => { setInput(e.target.value); setChecked(false) }}
            placeholder="HALEA-CERT:..."
            rows={3}
            className="w-full bg-s3 border border-b1 text-txt px-3 py-2.5 rounded-xl text-xs font-mono outline-none focus:border-accent transition-colors resize-none placeholder:text-t3" />
          <button onClick={check} disabled={!input.trim()}
            className="w-full py-3 bg-accent text-white rounded-xl text-sm font-bold hover:bg-orange-400 transition-colors disabled:opacity-40">
            Cek Keaslian
          </button>
        </div>

        {checked && (
          info ? (
            <div className="mt-4 bg-ok/5 border border-ok/30 rounded-2xl p-5 animate-fade-in">
              <div className="flex items-center gap-2.5 mb-4">
                <ShieldCheck size={18} className="text-ok" />
                <p className="font-bold text-ok text-sm">Sertifikat Asli ✓</p>
              </div>
              {[
                ['Nama',  info.name],
                ['Gelar', `${info.tier.icon} HALEA ${info.tier.title}`],
                ['Terbit', info.dateStr],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between items-center py-2 border-b border-b1 last:border-0">
                  <span className="text-[10px] text-t3 uppercase tracking-widest font-bold">{k}</span>
                  <span className="text-sm font-bold text-txt">{v}</span>
                </div>
              ))}
              <p className="text-[10px] text-t3 mt-3 leading-relaxed">
                Diterbitkan oleh HALEA Academy setelah menyelesaikan kurikulum & lulus seluruh kuis.
              </p>
            </div>
          ) : (
            <div className="mt-4 bg-err/5 border border-err/30 rounded-2xl p-5 flex items-center gap-3 animate-fade-in">
              <ShieldX size={18} className="text-err flex-shrink-0" />
              <div>
                <p className="font-bold text-err text-sm">Kode tidak valid</p>
                <p className="text-[11px] text-t3 mt-0.5">Sertifikat ini tidak diterbitkan oleh HALEA, atau kodenya tidak lengkap.</p>
              </div>
            </div>
          )
        )}

        <p className="text-center mt-8 text-xs text-t3">
          <Link href="/learn" className="hover:text-accent transition-colors">Mau sertifikatmu sendiri? Belajar di HALEA Academy →</Link>
        </p>
      </div>
    </div>
  )
}
