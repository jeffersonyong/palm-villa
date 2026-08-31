import type { Metadata, Viewport } from 'next'
import { Fraunces, Geist, Geist_Mono } from 'next/font/google'

import { Toaster } from '@/components/ui/toast'
import { themeInitScript } from '@/lib/theme'

import './globals.css'

/**
 * Geist carries every surface; hierarchy comes from size, weight and tracking
 * — 400/500/600/700 is the whole range, with 700 reaching only the two display
 * headline sizes (design.md §Typography). A variable font, so every weight the
 * scale asks for is a real one, and the figures are tabular.
 */
const geist = Geist({
  subsets: ['latin'],
  variable: '--font-geist',
  display: 'swap',
})

/**
 * The mono face — booking references, bank references, the one-time password.
 * Geist's own cut, so `font-mono` reads as the same instrument rather than as
 * whatever the operating system ships (Consolas here, Menlo there).
 */
const geistMono = Geist_Mono({
  subsets: ['latin'],
  variable: '--font-geist-mono',
  display: 'swap',
})

/**
 * The display face — the one sanctioned exception: public-site display
 * headlines (`display-md`+) only, never on the portal or field surfaces
 * (design.md §Typography).
 *
 * Both weights are loaded because a public headline crosses the breakpoint
 * between them: it sets `display-md` (600) on mobile and `display-lg` (700)
 * from `sm` up. Without the second, the browser synthesises a faux bold, which
 * on a serif smears the stroke contrast that is the whole reason this face is
 * here.
 */
const fraunces = Fraunces({
  subsets: ['latin'],
  weight: ['600', '700'],
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
  /* The light default — `canvas-sunk`, the page ground. Theming ignores the OS
     preference (globals.css), so the browser chrome must too; lib/theme.ts
     rewrites this meta when the reader's explicit choice is dark, and holds
     the matching pair. */
  themeColor: '#f3f3f3',
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${geist.variable} ${geistMono.variable} ${fraunces.variable}`}
      suppressHydrationWarning
    >
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
