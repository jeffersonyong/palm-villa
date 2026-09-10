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
          {/* Destinations left, actions right. The links describe the place
              and belong beside its name; the two buttons are what you came to
              do, and they read as a pair only when nothing sits between them
              and the edge. */}
          <div className="flex items-center gap-xl">
            <Link href="/" className="flex items-center gap-sm text-body-md-strong text-foreground">
              {/* The logo moment — the one place raw brand aqua appears as a
                  graphic on this surface (design.md §Color). */}
              <span aria-hidden className="size-2 rounded-full bg-brand" />
              Palm Villa
            </Link>
            {/* Hidden below 640px: the links do not fit beside the brand, the
                buttons and the toggle, and every destination is reachable from
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
          </div>
          <div className="flex items-center gap-sm">
            <ThemeToggle />
            {/* `tertiary`, and it has to be: design.md gives the customer
                surface one lagoon fill per screen region, and that one is
                "Book a stay". A returning guest looking for their own booking
                is not competing with somebody about to make one, so this is
                the hairline button beside it rather than a second solid. */}
            <Button asChild variant="tertiary" className="ml-sm hidden sm:inline-flex">
              <Link href="/find-booking">Find booking</Link>
            </Button>
            <Button asChild className="hidden sm:inline-flex">
              <Link href="/stay">Book a stay</Link>
            </Button>
          </div>
        </nav>
      </header>

      {/* `bg-card` here rather than on each section, because the surface is
          the layout's promise and not the page's: `main` is `flex-1`, so on a
          page shorter than the viewport — a booking, a confirmation, any of
          the short ones — the extra height showed the app ground as a grey
          band above the footer. Sections that paint themselves (the dark
          moments on the landing page) still cover it. */}
      <main className="flex-1 bg-card">{children}</main>

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
              {/* All three carry WhatsApp (N14), so each row offers both: tap
                  the number to call, or the label to open a chat. */}
              <ul className="mt-sm space-y-xxs">
                {contact.phones.map((phone) => (
                  <li key={phone.display} className="flex items-center gap-sm">
                    <a href={`tel:${phone.display.replace(/\s/g, '')}`}>{phone.display}</a>
                    <a
                      href={phone.whatsappUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-mute"
                    >
                      WhatsApp
                    </a>
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
                  <Link href="/find-booking">Find your booking</Link>
                </li>
                <li>
                  <Link href="/faq">Questions</Link>
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
