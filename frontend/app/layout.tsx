import type { Metadata, Viewport } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import './globals.css'
import { ErrorBoundary } from '@/components/ErrorBoundary'

// The CSS variable names must match the ones the Tailwind theme reads.
const geistSans = Geist({
  variable: '--font-sans',
  subsets: ['latin'],
  display: 'swap',
})

const geistMono = Geist_Mono({
  variable: '--font-mono',
  subsets: ['latin'],
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'CodeScope',
  description:
    'Local-first AI assistant for exploring and understanding your codebase. Nothing leaves your machine.',
}

export const viewport: Viewport = {
  themeColor: '#0f1117',
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} flex h-dvh items-center justify-center overflow-hidden bg-[#0f1117] p-0 antialiased sm:p-6`}
      >
        {/* Desktop-style window frame. The traffic lights belong here only; the
            page must not draw a second set inside it. */}
        <div className="relative flex h-full max-h-[900px] w-full max-w-[1400px] flex-col overflow-hidden border border-white/10 bg-[#1a1b26]/90 shadow-2xl backdrop-blur-xl sm:rounded-xl">
          <div className="flex h-10 shrink-0 items-center justify-between border-b border-white/5 bg-white/5 px-4">
            <div className="flex items-center gap-2" aria-hidden="true">
              <span className="h-3 w-3 rounded-full border border-[#e0443e] bg-[#ff5f56]" />
              <span className="h-3 w-3 rounded-full border border-[#dea123] bg-[#ffbd2e]" />
              <span className="h-3 w-3 rounded-full border border-[#1aab29] bg-[#27c93f]" />
            </div>
            <p className="text-xs font-medium text-white/40">
              CodeScope — Local Codebase Assistant
            </p>
            <div className="w-10" aria-hidden="true" />
          </div>

          <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden text-slate-200">
            <ErrorBoundary>{children}</ErrorBoundary>
          </div>
        </div>
      </body>
    </html>
  )
}
