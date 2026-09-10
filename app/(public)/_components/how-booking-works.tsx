import Link from 'next/link'

import { bookingSteps, pricingCopy } from '../_content/landing'

/**
 * The page's one tinted band (design.md `section-tinted`) — a faint gray
 * pause in the white scroll, drawn in with hairlines top and bottom. The
 * step markers are hairline tiles, not coloured discs; colour has no job
 * here.
 */
export function HowBookingWorks() {
  return (
    <section
      aria-labelledby="how-heading"
      className="border-t border-divider bg-muted px-xl py-3xl"
    >
      <div className="mx-auto w-full max-w-[1120px]">
        <p className="micro-label text-muted-foreground">How it works</p>
        <h2
          id="how-heading"
          className="mt-md font-display text-display-md text-foreground sm:text-display-lg"
        >
          Booking is simple
        </h2>

        <ol className="mt-2xl grid gap-xl md:grid-cols-3">
          {bookingSteps.map((step, index) => (
            <li key={step.title}>
              <span className="flex size-9 items-center justify-center rounded-md border border-border bg-card text-body-sm-strong text-foreground">
                {index + 1}
              </span>
              <h3 className="mt-lg text-display-xs text-foreground">{step.title}</h3>
              <p className="mt-xs text-body-md text-copy">{step.description}</p>
            </li>
          ))}
        </ol>

        <p className="mt-2xl text-caption text-muted-foreground">
          {pricingCopy.stayFinePrint} {pricingCopy.paymentMethods}
        </p>

        {/* The way back in (capability A9), in the fine print rather than as a
            button: somebody who has already booked is not who this section is
            selling to, and a second call to action here would compete with the
            page's own. Underlined ink, not the lagoon — the hue is text-first
            on this surface and never marks a secondary route. */}
        <p className="mt-sm text-caption text-muted-foreground">
          {pricingCopy.alreadyBooked}{' '}
          <Link
            href="/find-booking"
            className="text-foreground underline underline-offset-2 transition-colors hover:text-copy"
          >
            {pricingCopy.alreadyBookedLink}
          </Link>
        </p>
      </div>
    </section>
  )
}
