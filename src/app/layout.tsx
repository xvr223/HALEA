import type { Metadata } from 'next'
import './globals.css'
import { Navbar } from '@/components/layout/Navbar'
import { Toaster } from '@/components/ui'

export const metadata: Metadata = {
  title: 'HALEA — Cinematic Color, Engineered',
  description: 'Professional color grading tools. AI-powered LUT generator, Halation Studio, and preset shop by @robbiesatriaa.',
  keywords: ['LUT', 'color grading', 'halation', 'film look', 'premiere pro', 'davinci resolve'],
  openGraph: {
    title: 'HALEA — Cinematic Color, Engineered',
    description: 'AI-powered LUT generator & cinematic color tools',
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
