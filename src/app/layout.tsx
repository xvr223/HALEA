import type { Metadata } from 'next'
import './globals.css'
import { Navbar } from '@/components/layout/Navbar'
import { Toaster } from '@/components/ui'

export const metadata: Metadata = {
  title: 'HALEA — Warna Sinematik, Dirancang dengan Presisi',
  description: 'Tools color grading profesional untuk video editor Indonesia. Generator LUT berbasis AI, Halation Studio, dan toko preset premium oleh @haleastudio.',
  keywords: ['LUT', 'color grading', 'halation', 'film look', 'premiere pro', 'davinci resolve', 'preset', 'video editing indonesia'],
  openGraph: {
    title: 'HALEA — Warna Sinematik, Dirancang dengan Presisi',
    description: 'Generator LUT berbasis AI & tools color grading sinematik untuk kreator Indonesia',
    url: 'https://halea.vercel.app',
    siteName: 'HALEA',
    type: 'website',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-bg text-txt font-syne antialiased min-h-screen flex flex-col">
        <Navbar />
        <main className="flex-1">{children}</main>
        <Toaster />
      </body>
    </html>
  )
}
