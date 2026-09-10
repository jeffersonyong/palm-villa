import type { Metadata } from 'next'

import { contact } from '@/lib/domain/contact'

import { LookupForm } from './lookup-form'

export const metadata: Metadata = {
  title: 'Find your booking — Palm Villa',
  description:
    'Open your Palm Villa booking again with your booking reference and the phone number you booked with.',
}

/**
 * The way back to a booking whose link is gone (capability A9).
 *
 * Every other route to `/booking/{token}` assumes the customer still has the
 * link. Two ordinary situations break that assumption and this page is the
 * answer to both: a customer who booked online and closed the tab — the
 * confirmation email that would have carried the link is built and switched
 * off until N42 answers — and a guest who booked at the counter, whose
 * booking has never had a link at all until they ask for one here.
 *
 * **This is the one page on this surface that wants to be indexed.** Everything
 * under `/booking/*` is `noindex` because it is about one person's booking;
 * this is about the *idea* of finding one, and "palm villa find my booking" is
 * a real thing somebody types into a search engine at nine at night. That is
 * also why it does not live at `/booking/find`.
 *
 * No database read, so no `force-dynamic`: the page is a form, and everything
 * that knows anything happens in the action behind it.
 */
export default function FindBookingPage() {
  return (
    <section aria-labelledby="find-booking-heading" className="bg-card px-xl py-3xl">
      <div className="mx-auto w-full max-w-[560px]">
        <p className="micro-label text-accent-foreground">Your booking</p>
        <h1
          id="find-booking-heading"
          className="mt-md font-display text-display-md text-foreground sm:text-display-lg"
        >
          Find your booking
        </h1>
        <p className="mt-md max-w-[52ch] text-body-lg text-copy">
          Enter the reference from your booking and the phone number you booked with, and we will
          open it for you.
        </p>

        <LookupForm />

        <p className="mt-lg text-caption text-muted-foreground">
          Cannot find it? Call or message us —{' '}
          {contact.phones.map((phone, index) => (
            <span key={phone.display}>
              {index > 0 ? ', ' : ''}
              <a className="hover:underline" href={`tel:${phone.display.replace(/\s/g, '')}`}>
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
