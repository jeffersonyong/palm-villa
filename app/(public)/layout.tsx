import Link from 'next/link'

import { Button } from '@/components/ui/button'
import { ThemeToggle } from '@/components/theme-toggle'

import { contact } from './_content/landing'

/**
 * Public site chrome. One continuous white surface (design.md §Layout):
 * sections separate with hairlines, and the header carries the funnel — the
 * nav links plus the one primary button.
 */
export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      {/* Sticky: the day-pass and stays links are the funnel, and on a phone
          they otherwise scroll away within the first band. `bg-card` is opaque,
          so nothing shows through. Anchors clear it via the `scroll-padding-top`
          set on `html` in globals.css. */}
      <header className="sticky top-0 z-40 border-b border-divider bg-card">
        <nav
          aria-label="Main navigation"
          className="mx-auto flex w-full max-w-[1120px] items-center justify-between gap-lg px-xl py-md"
        >
          <Link href="/" className="flex items-center gap-sm text-body-md-strong text-foreground">
            {/* The logo moment — the one place raw brand aqua appears as a
                graphic on this surface (design.md §Color). */}
            <span aria-hidden className="size-2 rounded-full bg-brand" />
            Palm Villa
          </Link>
          <div className="flex items-center gap-lg">
            {/* Hidden below 640px: the links do not fit beside the brand, the
                button and the toggle, and every destination is reachable from
                the page itself. */}
            <ul className="hidden items-center gap-lg text-body-sm text-muted-foreground sm:flex">
              <li>
                <Link href="/day-pass" className="transition-colors hover:text-foreground">
                  Day pass
                </Link>
              </li>
              <li>
                <Link href="/stay" className="transition-colors hover:text-foreground">
                  Stays
                </Link>
              </li>
              <li>
                <Link href="/#long-term" className="transition-colors hover:text-foreground">
                  Long term
                </Link>
              </li>
            </ul>
            <ThemeToggle />
            <Button asChild className="hidden sm:inline-flex">
              <Link href="/stay">Book a stay</Link>
            </Button>
          </div>
        </nav>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="bg-footer-surface px-xl py-3xl text-footer-foreground">
        <div className="mx-auto w-full max-w-[1120px] text-body-sm">
          <div className="flex flex-col gap-xl md:flex-row md:justify-between">
            <div>
              <p className="flex items-center gap-sm text-body-md-strong text-footer-foreground">
                <span aria-hidden className="size-2 rounded-full bg-brand" />
                Palm Villa
              </p>
              <p className="mt-sm">
                <a href={contact.mapsUrl} target="_blank" rel="noreferrer" className="underline">
                  Bandar Seri Begawan, Brunei Darussalam
                </a>
              </p>
              <ul className="mt-sm space-y-xxs">
                {contact.phones.map((phone) => (
                  <li key={phone}>
                    <a href={`tel:${phone.replace(/\s/g, '')}`}>{phone}</a>
                  </li>
                ))}
              </ul>
            </div>

            <nav aria-label="Footer navigation">
              <ul className="space-y-sm">
                <li>
                  <Link href="/day-pass">Day pass</Link>
                </li>
                <li>
                  <Link href="/stay">Short stays</Link>
                </li>
                <li>
                  <Link href="/#long-term">Long-term enquiry</Link>
                </li>
                <li>
                  <a href={contact.whatsappUrl} target="_blank" rel="noreferrer">
                    WhatsApp
                  </a>
                </li>
                <li>
                  <a href={contact.instagramUrl} target="_blank" rel="noreferrer">
                    Instagram {contact.instagramHandle}
                  </a>
                </li>
                <li>
                  <a href={contact.tiktokUrl} target="_blank" rel="noreferrer">
                    TikTok {contact.tiktokHandle}
                  </a>
                </li>
              </ul>
            </nav>
          </div>

          <p className="mt-2xl text-caption opacity-70">
            © 2026 Palm Villa · Bandar Seri Begawan, Brunei Darussalam
          </p>
          <p className="mt-sm text-caption opacity-70">
            Staff: <Link href="/portal">Portal</Link> · <Link href="/field">Field</Link> ·{' '}
            <Link href="/tokens">Design tokens</Link>
          </p>
        </div>
      </footer>
    </div>
  )
}
