'use client'

import { useRouter } from 'next/navigation'
import { ArrowLeft, Printer } from 'lucide-react'

import { Button } from '@/components/ui/button'

/**
 * The two controls a printable document needs, and no more.
 *
 * **Back** is `router.back()` rather than a link, because this page is reached
 * from two places — the deposit and the ledger — and a hardcoded destination
 * would send half its readers somewhere they did not come from.
 *
 * **Print** calls the browser's own dialog. There is no PDF generator here on
 * purpose: every desktop browser prints to PDF, the layout is already the
 * document, and `pdf-lib` arrives with the accounting pack (architecture.md
 * §8), which has a real reason for one — assembling a slip, an IC and a
 * booking into a single file nobody is standing in front of.
 */
export function PrintButton() {
  const router = useRouter()

  return (
    <>
      <Button variant="ghost" onClick={() => router.back()}>
        <ArrowLeft aria-hidden />
        Back
      </Button>

      <Button variant="secondary" onClick={() => window.print()}>
        <Printer aria-hidden />
        Print
      </Button>
    </>
  )
}
