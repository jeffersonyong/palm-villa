import Link from 'next/link'

import { Button } from '@/components/ui/button'
import { contact } from '@/lib/domain/contact'

/**
 * A link that does not open a booking (capability A9's other half).
 *
 * This is where a truncated WhatsApp link lands, and until capability A9 it
 * landed on the framework's default 404 — a dead end for the one visitor on
 * this surface who is definitely a real customer with a real booking. The
 * lookup form is the answer to exactly their problem, so it is offered here
 * rather than only in the footer.
 *
 * **It says nothing about why.** A malformed token and an unknown one render
 * this same page, which is architecture.md §3's rule and the reason the copy
 * cannot be more helpful than it is: "that link has expired" and "that link
 * was never real" are two different facts, and telling them apart is the only
 * thing a guesser wants from this route.
 */
export default function BookingNotFound() {
  return (
    <section aria-labelledby="not-found-heading" className="bg-card px-xl py-3xl">
      <div className="mx-auto w-full max-w-[560px]">
        <p className="micro-label text-accent-foreground">Your booking</p>
        <h1
          id="not-found-heading"
          className="mt-md font-display text-display-md text-foreground sm:text-display-lg"
        >
          That link does not open a booking
        </h1>
        <p className="mt-md max-w-[52ch] text-body-lg text-copy">
          It may have been cut short on the way to you. You can open your booking with the reference
          from it and the phone number you booked with.
        </p>

        <Button asChild className="mt-xl">
          <Link href="/find-booking">Find your booking</Link>
        </Button>

        <p className="mt-lg text-caption text-muted-foreground">
          Or call us —{' '}
          {contact.phones.map((phone, index) => (
            <span key={phone.display}>
              {index > 0 ? ', ' : ''}
              <a className="underline hover:no-underline" href={`tel:${phone.display}`}>
                {phone.display}
              </a>
            </span>
          ))}
          .
        </p>
      </div>
    </section>
  )
}
