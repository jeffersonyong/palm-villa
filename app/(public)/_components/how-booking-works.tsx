import { bookingSteps, pricingCopy } from '../_content/landing'

/**
 * The page's one aqua band (design.md `content-band-aqua`) — it breaks the
 * gray/white alternation at the deepest point of the scroll. Sanctioned only
 * because no primary CTA lives here: aqua buttons never sit on aqua ground,
 * and the pale tint stays firmly below CTA level so scarcity keeps making the
 * buttons in the neighbouring bands read.
 *
 * The step circles are a polarity flip against the tinted ground — ink with a
 * light numeral. Dark keeps its own construction (raised ink-deep circle, aqua
 * numeral); a straight `invert-surface` there would put a near-white disc on
 * the band, which is the glare the footer role exists to avoid.
 */
export function HowBookingWorks() {
  return (
    <section aria-labelledby="how-heading" className="bg-accent px-xl py-3xl">
      <div className="mx-auto w-full max-w-[1200px]">
        <h2
          id="how-heading"
          className="font-display text-display-md text-foreground sm:text-display-lg"
        >
          Booking is simple
        </h2>

        <ol className="mt-2xl grid gap-xl md:grid-cols-3">
          {bookingSteps.map((step, index) => (
            <li key={step.title}>
              <span className="flex size-8 items-center justify-center rounded-full bg-invert-surface text-body-sm-strong text-invert-foreground dark:bg-card dark:text-accent-foreground">
                {index + 1}
              </span>
              <h3 className="mt-lg text-display-xs text-foreground">{step.title}</h3>
              <p className="mt-sm text-body-md text-copy">{step.description}</p>
            </li>
          ))}
        </ol>

        <p className="mt-2xl text-caption text-muted-foreground">
          {pricingCopy.stayFinePrint} {pricingCopy.paymentMethods}
        </p>
      </div>
    </section>
  )
}
