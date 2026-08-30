import type { Metadata, Viewport } from 'next'
import { Fraunces, Inter } from 'next/font/google'

import { Toaster } from '@/components/ui/toast'
import { themeInitScript } from '@/lib/theme'

import './globals.css'

/**
 * Inter carries every surface; hierarchy comes from size, weight and tracking
 * — 400/500/600 is the whole range (design.md §Typography).
 */
const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-inter',
  display: 'swap',
})

/**
 * The display face — the one sanctioned exception: public-site display
 * headlines (`display-md`+) only, one weight, never on the portal or field
 * surfaces (design.md §Typography).
 */
const fraunces = Fraunces({
  subsets: ['latin'],
  weight: ['600'],
  variable: '--font-fraunces',
  display: 'swap',
})

export const metadata: Metadata = {
  title: {
    default: 'Palm Villa',
    template: '%s · Palm Villa',
  },
  description: 'Day passes, short stays and long-term residences at Palm Villa, Brunei.',
}

export const viewport: Viewport = {
  /* The light default (the white page ground). Theming ignores the OS
     preference (globals.css), so the browser chrome must too — lib/theme.ts
     rewrites this meta when the reader's explicit choice is dark. */
  themeColor: '#ffffff',
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${fraunces.variable}`} suppressHydrationWarning>
      <head>
        {/* Runs before paint so an explicit theme choice never flashes the
            other one. Everything else about theming is CSS. */}
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>
        {children}
        {/* One toast outlet for every surface (components/ui/toast.tsx). */}
        <Toaster />
      </body>
    </html>
  )
}
