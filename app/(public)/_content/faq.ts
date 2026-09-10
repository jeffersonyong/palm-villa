import type { PropertySettings } from '@/lib/domain/settings'
import { formatCents } from '@/lib/domain/money'

/**
 * The questions a customer asks before they book (capability A10).
 *
 * Copy here is restricted to **[C]-confirmed facts from prd.md**, exactly as
 * `landing.ts` is. Two further rules, and they are what make this file safe to
 * edit without reading the whole PRD first:
 *
 *   - **No figure is written in this file.** Every rate, time, facility and
 *     account number has been a settings row since capability F3, so it
 *     arrives through `FaqFacts` and is read when the page renders. A number
 *     typed in here is the drift `pricingCopy.dayPassLine` already has — it
 *     still says "from BND 5" because somebody typed it before the day-pass
 *     bands were editable.
 *   - **A question we cannot answer is not left out.** It is asked, answered
 *     as far as the docs go, and carries its open items in `pending`, which
 *     the page renders as visible markers. Each string maps to an entry in
 *     open-questions.md; delete it when the answer lands. A page that quietly
 *     omits the six things a guest most wants to know is a page they leave to
 *     phone somebody, which is the thing this whole product is replacing.
 *
 * **Nothing here promises an email or a QR code.** `/booking/{token}` does,
 * on the client's instruction, and architecture.md §9 already calls those
 * "the only sentences in the product that describe something unbuilt" —
 * nothing sends until N42 answers and no code can be issued until D3 is
 * built. Saying it to one guest who has just paid is a debt; saying it on a
 * page a search engine indexes is a debt with an audience. So these answers
 * say what the confirmation emails say — that we confirm the booking, and
 * that the reference is what to quote at the gate.
 */

/**
 * The live figures an answer may quote.
 *
 * Formatted strings rather than raw values, so an answer is a sentence and
 * never arithmetic — and so a cents integer cannot reach the page by being
 * interpolated somewhere nobody looked.
 */
export interface FaqFacts {
  /** `HH:MM`, as the confirmation email states them. */
  checkInTime: string
  checkOutTime: string
  securityDeposit: string
  extraPersonPerNight: string
  exemptAgeMax: number
  sofaBedFee: string
  lateCheckOutPerHour: string
  advanceDays: number
  includedFacilities: readonly string[]
  excludedFacilities: readonly string[]
  dayPassBands: readonly { label: string; price: string }[]
  dayPassBundles: readonly { label: string; price: string }[]
  bankAccounts: readonly { bankName: string; accountNumber: string }[]
  /** Sellable types only — a type with no units is not on sale. */
  unitTypes: readonly { name: string; fromRate: string; maxPax: number; carParks: number }[]
}

export interface FaqEntry {
  /**
   * A stable slug, and it is a URL fragment: staff send people to a single
   * answer over WhatsApp, so renaming one breaks a link somebody has already
   * sent. Never renamed, only retired.
   */
  id: string
  question: string
  /** One string per paragraph. Never empty. */
  answer: (facts: FaqFacts) => readonly string[]
  /**
   * Open [O] items this answer cannot cover, as `PendingDetail` labels. Each
   * maps to an entry in open-questions.md.
   */
  pending?: readonly string[]
}

export interface FaqTopic {
  id: string
  title: string
  entries: readonly FaqEntry[]
}

export const faqTopics: readonly FaqTopic[] = [
  {
    id: 'day-passes',
    title: 'Day passes',
    entries: [
      {
        id: 'what-is-included-in-a-day-pass',
        question: 'What can we use with a day pass?',
        answer: (facts) => {
          const lines =
            facts.includedFacilities.length > 0
              ? [`A day pass covers ${facts.includedFacilities.join(' · ')}.`]
              : ['The facilities a day pass covers are shown when you book.']

          if (facts.excludedFacilities.length > 0) {
            lines.push(`Not included: ${facts.excludedFacilities.join(' · ')}.`)
            lines.push('Call us if you would like to use any of those and we will work it out.')
          }

          return lines
        },
      },
      {
        id: 'how-much-is-a-day-pass',
        question: 'How much is a day pass?',
        answer: (facts) => {
          const lines = [
            facts.dayPassBands.map((band) => `${band.label} — ${band.price}`).join(' · '),
          ]

          if (facts.dayPassBundles.length > 0) {
            lines.push(
              `Family bundles: ${facts.dayPassBundles
                .map((bundle) => `${bundle.label} — ${bundle.price}`)
                .join(' · ')}`,
            )
          }

          lines.push(
            'You do not have to work out which is cheaper. We always charge the cheapest combination for the group you book.',
          )

          return lines
        },
        pending: ['Under-1 day pass price'],
      },
      {
        id: 'is-a-day-pass-all-day',
        question: 'Is a day pass for the whole day?',
        answer: () => ['Yes — a pass is for the day, not a time slot.'],
        pending: ['Opening hours'],
      },
      {
        id: 'day-pass-what-to-bring',
        question: 'What do we need to bring?',
        answer: () => [
          'Your booking reference. Tell us your car registration when you book, or that you are not bringing a car — we record every vehicle that comes in.',
        ],
      },
    ],
  },
  {
    id: 'staying',
    title: 'Staying with us',
    entries: [
      {
        id: 'what-does-a-night-cost',
        question: 'What does a night cost?',
        answer: (facts) => [
          ...facts.unitTypes.map(
            (type) =>
              `${type.name} — from ${type.fromRate} a night, for up to ${type.maxPax} people, with ${type.carParks} parking spaces.`,
          ),
          'Pick your dates on the booking page and you will see the full price, itemised, before you book anything.',
        ],
      },
      {
        id: 'how-far-ahead-can-i-book',
        question: 'How far ahead can we book?',
        answer: (facts) => [`Up to ${facts.advanceDays} days ahead.`],
      },
      {
        id: 'which-apartment',
        question: 'Which apartment will we get?',
        answer: () => [
          'You choose the type of apartment and we assign one of that type. If you need something in particular, call us and we will see what we can do.',
        ],
        pending: ['Bed setup requests'],
      },
      {
        id: 'how-many-people',
        question: 'How many people can stay?',
        answer: (facts) => [
          facts.unitTypes.map((type) => `${type.name} — up to ${type.maxPax}`).join(' · '),
          `Extra guests are ${facts.extraPersonPerNight} per person per night. Children aged ${facts.exemptAgeMax} and under are not counted.`,
        ],
        pending: ['Guest limit — cap or surcharge'],
      },
      {
        id: 'sofa-bed',
        question: 'Can we add a sofa bed?',
        answer: (facts) => [
          `${facts.sofaBedFee} each, with a pillow and a blanket, subject to availability. Add it when you book and the price includes it.`,
        ],
      },
      {
        id: 'check-in-and-check-out',
        question: 'What time is check-in and check-out?',
        answer: (facts) => [
          `Check in from ${facts.checkInTime}, and check out by ${facts.checkOutTime}.`,
        ],
      },
      {
        id: 'early-check-in-late-check-out',
        question: 'Can we check in early, or leave late?',
        answer: (facts) => [
          'Early check-in depends on whether the apartment is ready — ask us when you arrive rather than counting on it.',
          `Late check-out is ${facts.lateCheckOutPerHour} an hour.`,
        ],
        pending: ['Early check-in charge'],
      },
      {
        id: 'facilities-while-staying',
        question: 'Can we use the pool while we are staying?',
        answer: () => [
          'We have not published this yet. Call us and we will tell you before you book.',
        ],
        pending: ['Facility use during a stay'],
      },
      {
        id: 'parking',
        question: 'Is there parking?',
        answer: (facts) => [
          facts.unitTypes.map((type) => `${type.name} — ${type.carParks} spaces`).join(' · '),
          'Give us each car registration when you book, or tell us you are not bringing one. Security records every vehicle that comes in.',
        ],
      },
    ],
  },
  {
    id: 'paying',
    title: 'Paying',
    entries: [
      {
        id: 'how-do-i-pay',
        question: 'How do we pay?',
        answer: (facts) => [
          facts.bankAccounts.length > 0
            ? `Bank transfer to ${facts.bankAccounts
                .map((account) => `${account.bankName} ${account.accountNumber}`)
                .join(' or ')}, or cash on site.`
            : 'Bank transfer, or cash on site. The account to transfer to is shown on your booking page.',
          'We do not take cards yet.',
        ],
      },
      {
        id: 'what-do-i-pay-when-i-book',
        question: 'What do we pay when we book?',
        answer: (facts) => [
          `The ${facts.securityDeposit} security deposit, which is what secures the booking. It is refundable, and the stay itself is settled when you arrive.`,
          'If you would rather send everything at once, you can choose that instead when you book.',
        ],
      },
      {
        id: 'what-is-the-reference-for',
        question: 'What is the booking reference for?',
        answer: () => [
          'Put it in the description of your transfer. It is how we match your money to your booking, and it is what you quote at the gate when you arrive.',
        ],
      },
      {
        id: 'do-i-send-the-slip',
        question: 'Do we need to send you the transfer slip?',
        answer: () => [
          'Keep it, but you do not need to send it. We check the bank ourselves — press "I have made the transfer" on your booking page and we will look for it.',
        ],
      },
      {
        id: 'how-long-is-it-held',
        question: 'How long do you hold our booking?',
        answer: () => [
          'Until we have confirmed your transfer. There is no countdown and nothing expires while you are waiting on us.',
        ],
      },
      {
        id: 'how-do-i-know-it-is-confirmed',
        question: 'How do we know it is confirmed?',
        answer: () => [
          'We confirm your booking once we have seen the transfer. Your booking page always shows where it has got to, and you can open it again at any time with your reference and the number you booked with.',
        ],
      },
    ],
  },
  {
    id: 'changing-and-arriving',
    title: 'Changing, cancelling and arriving',
    entries: [
      {
        id: 'if-we-cancel',
        question: 'What if we cancel, or cannot come?',
        answer: (facts) => [
          `The ${facts.securityDeposit} security deposit is kept. Anything you had already paid towards the stay is refunded.`,
        ],
        pending: ['Cancellation notice period'],
      },
      {
        id: 'can-we-change-dates',
        question: 'Can we change our dates?',
        answer: () => [
          'Call us. We can move a booking that has not started, and the price is worked out again for the new dates.',
        ],
      },
      {
        id: 'what-to-bring',
        question: 'What do we need to bring on the day?',
        answer: () => [
          'Your booking reference, and your IC — we take a copy when you arrive, for the guest register.',
        ],
      },
      {
        id: 'what-happens-when-we-arrive',
        question: 'What happens when we arrive?',
        answer: () => ['Quote your booking reference at the gate and security will check you in.'],
      },
      {
        id: 'house-rules',
        question: 'What are the house rules?',
        answer: () => [
          'We have not published these yet. Call us before you book if any of it matters to your plans.',
        ],
        pending: ['Pets, smoking and visitors'],
      },
      {
        id: 'find-my-booking',
        question: 'We have lost the link to our booking. What now?',
        answer: () => [
          'Open it again with your booking reference and the phone number you booked with. It works whether you booked online or with us at the counter.',
        ],
      },
    ],
  },
  {
    id: 'anything-else',
    title: 'Anything else',
    entries: [
      {
        id: 'long-term-rentals',
        question: 'Do you do long-term rentals?',
        answer: () => [
          'Yes. Terms are agreed per tenancy — message us and we will talk it through.',
        ],
      },
      {
        id: 'events',
        question: 'Can we hold an event, or use something a day pass does not cover?',
        answer: () => [
          'Call us. Both are arranged case by case rather than sold online, so a conversation gets you a better answer than this page can.',
        ],
      },
      {
        id: 'where-are-you',
        question: 'Where are you?',
        answer: () => ['Bandar Seri Begawan, Brunei Darussalam.'],
      },
    ],
  },
]

/**
 * The live figures, projected from what capability F3 edits.
 *
 * Pure — settings in, formatted strings out — so the page reads once and the
 * copy never does arithmetic. `sellableUnitTypeSlugs` is what keeps the FAQ
 * from quoting a rate for a unit type nobody can actually book, which is the
 * same filter `/stay` applies to its own list.
 */
export function faqFactsFrom(
  settings: PropertySettings,
  sellableUnitTypeSlugs: ReadonlySet<string>,
): FaqFacts {
  const { policy } = settings

  return {
    checkInTime: policy.checkInTime,
    checkOutTime: policy.checkOutTime,
    securityDeposit: `BND ${formatCents(policy.securityDepositCents)}`,
    extraPersonPerNight: `BND ${formatCents(policy.extraPersonPerNightCents)}`,
    exemptAgeMax: policy.paxExemptAgeMax,
    sofaBedFee: `BND ${formatCents(policy.sofaBedFeeCents)}`,
    lateCheckOutPerHour: `BND ${formatCents(policy.lateCheckOutPerHourCents)}`,
    advanceDays: policy.maxAdvanceBookingDays,
    includedFacilities: settings.facilities
      .filter((facility) => facility.includedInDayPass)
      .map((facility) => facility.name),
    excludedFacilities: settings.facilities
      .filter((facility) => !facility.includedInDayPass)
      .map((facility) => facility.name),
    dayPassBands: settings.bands.map((band) => ({
      label: band.label,
      price: `BND ${formatCents(band.priceCents)}`,
    })),
    dayPassBundles: settings.bundles.map((bundle) => ({
      label: bundle.label,
      price: `BND ${formatCents(bundle.priceCents)}`,
    })),
    bankAccounts: settings.bankAccounts.map((account) => ({
      bankName: account.bankName,
      accountNumber: account.accountNumber,
    })),
    unitTypes: settings.unitTypes
      .filter((type) => sellableUnitTypeSlugs.has(type.slug))
      .map((type) => ({
        name: type.name,
        fromRate: `BND ${formatCents(type.baseRateCents)}`,
        maxPax: type.maxPax,
        carParks: type.carParks,
      })),
  }
}
