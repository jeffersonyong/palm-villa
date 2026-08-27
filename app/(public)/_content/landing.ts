import { FerrisWheel, ToyBrick, Waves, type LucideIcon } from 'lucide-react'

/**
 * Landing-page content. Copy here is restricted to [C]-confirmed facts from
 * prd.md — no occupancy ("sleeps N"), bed-configuration, or age-band claims,
 * all of which carry open [O] items. Rates are display integers for marketing
 * copy only; the pricing engine (lib/domain) works in integer cents and is the
 * sole source of charged amounts.
 */

export interface Facility {
  name: string
  description: string
  icon: LucideIcon
  imageLabel: string
}

export interface UnitType {
  slug: string
  name: string
  fromRateBnd: number
  description: string
  imageLabel: string
}

export interface BookingStep {
  title: string
  description: string
}

/** The three facilities confirmed as included in the day pass (prd.md §7.2). */
export const facilities: Facility[] = [
  {
    name: 'Swimming pool',
    description: 'The centrepiece. Open all day on a single pass — swim as long as you like.',
    icon: Waves,
    imageLabel: 'Pool photo',
  },
  {
    name: 'Water park',
    description: 'Slides and splash play for the kids, included in every day pass.',
    icon: FerrisWheel,
    imageLabel: 'Water park photo',
  },
  {
    name: 'Indoor children’s playground',
    description: 'Air-conditioned play space — somewhere to dry off without winding down.',
    icon: ToyBrick,
    imageLabel: 'Playground photo',
  },
]

/** The four unit types and nightly base rates (prd.md §7.1, BND). */
export const unitTypes: UnitType[] = [
  {
    slug: 'two-bedroom',
    name: '2-bedroom',
    fromRateBnd: 180,
    description: 'The compact option for a night or a weekend.',
    imageLabel: '2-bedroom unit photo',
  },
  {
    slug: 'three-bedroom',
    name: '3-bedroom',
    fromRateBnd: 200,
    description: 'Room for the whole family without anyone on the sofa.',
    imageLabel: '3-bedroom unit photo',
  },
  {
    slug: 'four-bedroom',
    name: '4-bedroom',
    fromRateBnd: 250,
    description: 'The big apartment — space to spread out properly.',
    imageLabel: '4-bedroom unit photo',
  },
  {
    slug: 'semi-detached',
    name: 'Semi-detached',
    fromRateBnd: 320,
    description: 'Four rooms and the most space on the property.',
    imageLabel: 'Semi-detached house photo',
  },
]

/**
 * Written for the product as delivered, not for the current build — by the
 * time this page is public, booking is live. Each step maps to a capability in
 * scope-of-capabilities.md (A1/A2, A5/A6, A8), so nothing here over-promises.
 */
export const bookingSteps: BookingStep[] = [
  {
    title: 'Pick your day or dates',
    description: 'See what’s free and the full price — extra guests and all — before you commit.',
  },
  {
    title: 'Pay your way',
    description:
      'Transfer to BIBD or Baiduri with your booking reference, and upload the slip as you book. No card needed.',
  },
  {
    title: 'You’re confirmed',
    description: 'Your confirmation and entry QR code arrive by email. Show the QR on arrival.',
  },
]

/**
 * Contact details as supplied by the client on 2026-08-27.
 *
 * TODO(client): three phone numbers were given without saying which carries
 * WhatsApp. The first is used for every WhatsApp link below — confirm, or say
 * which number should receive booking enquiries.
 */
export const contact = {
  phones: ['+673 8959798', '+673 8837118', '+673 8986733'],
  whatsappUrl: 'https://wa.me/6738959798',
  instagramHandle: '@palmvilla.bn',
  instagramUrl: 'https://instagram.com/palmvilla.bn',
  tiktokHandle: '@palmvilla.bn',
  tiktokUrl: 'https://tiktok.com/@palmvilla.bn',
  /** Palm Villa, 4.570085, 114.220738. */
  mapsUrl: 'https://www.google.com/maps/search/?api=1&query=4.570085,114.220738',
}

/**
 * Open [O] items from prd.md §18 that a customer would expect answered before
 * booking. Rendered as visible markers rather than left silent, so reviewing
 * the page surfaces the questions instead of hiding them. Each entry is
 * deleted once the answer lands in the PRD.
 */
export const pendingDayPassDetails = [
  'Child and adult age bands',
  'What the family bundles cover',
  'Opening hours',
]

/**
 * The last three were per-unit markers on the landing grid until 2026-08-27.
 * They read as missing facts, but each is a policy question (PRD §18 N2, N9,
 * N1) rather than a per-unit unknown — max pax and bed configurations are
 * confirmed in PRD §7.1 — so they belong on the stay detail, asked once, not
 * repeated on four marketing cards.
 */
export const pendingStayDetails = [
  'Check-in and check-out times',
  'Cancellation policy',
  'Whether the BND 100 deposit is refunded on cancellation',
  'Whether stated guest limits are a hard cap or a surcharge threshold',
  'Whether guests can request a bed configuration',
  'How many 2-bedroom units there are',
]

/** Display strings shared by the landing sections and the stub routes. */
export const pricingCopy = {
  dayPassLine: 'From BND 5 per person · family bundles from BND 20',
  dayPassFinePrint: 'The BBQ area is not included in the day pass.',
  stayFinePrint: 'BND 100 refundable security deposit · bookings open up to 2 months ahead.',
  paymentMethods: 'Pay by bank transfer (BIBD / Baiduri) or cash.',
}
