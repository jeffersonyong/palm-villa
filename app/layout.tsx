import type { Metadata, Viewport } from 'next'
import { Fraunces, Inter } from 'next/font/google'

import { themeInitScript } from '@/lib/theme'

import './globals.css'

/**
 * Two families (design.md §Typography). Inter carries everything; hierarchy
 * comes from size, weight and tracking — 400/500/600 is the whole range.
 */
const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-inter',
  display: 'swap',
})

/**
 * The display face: public-site display headlines only, one weight, never on
 * the portal or field surfaces (design.md §Typography).
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
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f4f5f6' },
    { media: '(prefers-color-scheme: dark)', color: '#16181b' },
  ],
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
      <body>{children}</body>
    </html>
  )
}
