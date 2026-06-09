'use client'
import { useEffect, useState } from 'react'
import clsx from 'clsx'

// ── Button ─────────────────────────────────────────────────────────────────
interface BtnProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'accent' | 'ghost' | 'ai' | 'gold' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
}
export function Btn({ variant = 'ghost', size = 'md', loading, children, className, disabled, ...rest }: BtnProps) {
  const base = 'inline-flex items-center justify-center gap-2 font-bold tracking-wide uppercase transition-all rounded-lg disabled:opacity-40 disabled:cursor-not-allowed'
  const sizes = { sm: 'px-3 py-1.5 text-[10px]', md: 'px-4 py-2.5 text-xs', lg: 'px-6 py-3 text-sm' }
  const variants = {
    accent:  'bg-accent text-white hover:bg-orange-400 hover:-translate-y-0.5 shadow-lg shadow-accent/20',
    ghost:   'bg-s3 border border-b1 text-t2 hover:text-txt hover:border-b3',
    ai:      'bg-a4 text-black hover:bg-purple-300 hover:-translate-y-0.5 shadow-lg shadow-a4/20',
    gold:    'bg-a2 text-black hover:bg-yellow-300 hover:-translate-y-0.5',
    danger:  'bg-err/10 border border-err/30 text-err hover:bg-err/20',
  }
  return (
    <button className={clsx(base, sizes[size], variants[variant], className)} disabled={disabled || loading} {...rest}>
      {loading ? <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" /> : null}
      {children}
    </button>
  )
}

// ── Badge ──────────────────────────────────────────────────────────────────
export function Badge({ children, color = 'accent' }: { children: React.ReactNode; color?: 'accent'|'ok'|'ai'|'gold'|'warn' }) {
  const colors = {
    accent: 'bg-accent/10 text-accent border-accent/25',
    ok:     'bg-ok/10 text-ok border-ok/25',
    ai:     'bg-a4/10 text-a4 border-a4/25',
    gold:   'bg-a2/10 text-a2 border-a2/25',
    warn:   'bg-warn/10 text-warn border-warn/25',
  }
  return <span className={clsx('inline-block px-2 py-0.5 rounded text-[9px] font-bold tracking-widest uppercase border', colors[color])}>{children}</span>
}

// ── Card ───────────────────────────────────────────────────────────────────
export function Card({ children, className, hover }: { children: React.ReactNode; className?: string; hover?: boolean }) {
  return (
    <div className={clsx('bg-s2 border border-b1 rounded-xl', hover && 'hover:border-b3 hover:-translate-y-0.5 transition-all cursor-pointer', className)}>
      {children}
    </div>
  )
}

// ── Slider ─────────────────────────────────────────────────────────────────
interface SliderProps {
  label: string
  min: number; max: number; step?: number; value: number
  format?: (v: number) => string
  onChange: (v: number) => void
}
export function Slider({ label, min, max, step = 1, value, format, onChange }: SliderProps) {
  const pct = ((value - min) / (max - min)) * 100
  const display = format ? format(value) : (value > 0 && step >= 1 ? `+${value}` : String(value))
  return (
    <div className="flex items-center gap-2.5">
      <span className="text-[10px] text-t2 w-20 flex-shrink-0 font-medium">{label}</span>
      <input type="range" min={min} max={max} step={step} value={value}
        style={{ '--fill': `${pct}%` } as React.CSSProperties}
        className="flex-1"
        onChange={e => onChange(parseFloat(e.target.value))} />
      <span className="text-[10px] text-accent w-10 text-right flex-shrink-0 font-mono font-medium">{display}</span>
    </div>
  )
}

// ── Input ──────────────────────────────────────────────────────────────────
export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input {...props}
      className={clsx('w-full bg-s2 border border-b1 text-txt px-3 py-2 rounded-lg text-sm font-syne outline-none focus:border-accent transition-colors', props.className)} />
  )
}

// ── Select ─────────────────────────────────────────────────────────────────
export function Select({ label, children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement> & { label?: string }) {
  return (
    <div className={label ? 'flex flex-col gap-1.5' : ''}>
      {label && <span className="text-[9px] font-bold tracking-widest uppercase text-t3">{label}</span>}
      <select {...props}
        className={clsx('w-full bg-s2 border border-b1 text-txt px-3 py-2 rounded-lg text-sm font-syne outline-none focus:border-accent transition-colors', props.className)}>
        {children}
      </select>
    </div>
  )
}

// ── SectionHeader ──────────────────────────────────────────────────────────
export function SectionHeader({ children, accent }: { children: React.ReactNode; accent?: boolean }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <span className={clsx('text-[9px] font-black tracking-widest uppercase', accent ? 'text-accent' : 'text-t3')}>{children}</span>
      <div className="flex-1 h-px bg-b1" />
    </div>
  )
}

// ── DropZone ───────────────────────────────────────────────────────────────
export function DropZone({ label, sub, icon, onFile, accept }: {
  label: string; sub?: string; icon?: string; accept?: string
  onFile: (f: File) => void
}) {
  const [drag, setDrag] = useState(false)
  return (
    <label
      className={clsx('relative flex flex-col items-center justify-center gap-2 border border-dashed rounded-xl p-6 cursor-pointer transition-all',
        drag ? 'border-accent bg-accent/5' : 'border-b2 bg-s2 hover:border-accent/50'
      )}
      onDragOver={e => { e.preventDefault(); setDrag(true) }}
      onDragLeave={() => setDrag(false)}
      onDrop={e => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files[0]; if (f) onFile(f) }}>
      <input type="file" accept={accept} className="sr-only" onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f) }} />
      <span className="text-3xl opacity-40">{icon || '📁'}</span>
      <span className="text-xs font-bold text-t2">{label}</span>
      {sub && <span className="text-[10px] text-t3">{sub}</span>}
    </label>
  )
}

// ── Toggle ─────────────────────────────────────────────────────────────────
export function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <button
      onClick={() => onChange(!on)}
      className={clsx('flex items-center gap-2 text-[10px] font-bold tracking-widest uppercase transition-colors', on ? 'text-accent' : 'text-t3')}>
      <div className={clsx('w-7 h-4 rounded-full relative transition-colors', on ? 'bg-accent' : 'bg-b2')}>
        <div className={clsx('absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all', on ? 'left-3.5' : 'left-0.5')} />
      </div>
      {label}
    </button>
  )
}

// ── Toaster ─────────────────────────────────────────────────────────────────
let _toast: ((msg: string, type?: 'ok'|'err'|'warn') => void) | null = null
export const toast = (msg: string, type: 'ok'|'err'|'warn' = 'ok') => _toast?.(msg, type)

export function Toaster() {
  const [items, setItems] = useState<{ id: number; msg: string; type: string }[]>([])
  useEffect(() => {
    _toast = (msg, type = 'ok') => {
      const id = Date.now()
      setItems(i => [...i, { id, msg, type }])
      setTimeout(() => setItems(i => i.filter(x => x.id !== id)), 3000)
    }
  }, [])
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 flex flex-col gap-2 z-[999] pointer-events-none">
      {items.map(({ id, msg, type }) => (
        <div key={id} className={clsx('px-5 py-2.5 rounded-full text-xs font-bold shadow-xl animate-slide-up',
          type === 'ok'  ? 'bg-ok text-black' :
          type === 'err' ? 'bg-err text-white' :
          'bg-warn text-black'
        )}>{msg}</div>
      ))}
    </div>
  )
}
