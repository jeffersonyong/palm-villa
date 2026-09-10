import { describe, expect, it } from 'vitest'

import { bnd } from '@/lib/domain/money'
import type { PropertySettings } from '@/lib/domain/settings'

import { faqFactsFrom, faqTopics, type FaqFacts } from './faq'

/**
 * The FAQ is copy, so most of it is not a thing a test can check. Two things
 * are, and both are ways the page could quietly start lying:
 *
 *   - **A figure typed into the copy instead of read from settings.** That is
 *     the drift `pricingCopy.dayPassLine` already has, and it is invisible
 *     until somebody changes a rate and the FAQ keeps quoting the old one.
 *   - **A raw cents integer reaching a sentence**, which reads as "BND 500" in
 *     place of "BND 5.00" and is exactly the kind of thing nobody notices in
 *     a paragraph of prose.
 *
 * The ids are checked because they are URL fragments staff send to people.
 */

const settings: PropertySettings = {
  propertyId: 'p1',
  name: 'Palm Villa',
  timeZone: 'Asia/Brunei',
  currency: 'BND',
  settingsUpdatedAt: '2026-09-16T00:00:00.000Z',
  policy: {
    paxPolicy: 'surcharge_threshold',
    extraPersonPerNightCents: bnd(7),
    paxExemptAgeMax: 3,
    sofaBedFeeCents: bnd(28),
    sofaBedStock: null,
    earlyCheckInPerHourCents: bnd(15),
    lateCheckOutPerHourCents: bnd(15),
    checkInTime: '14:00',
    checkOutTime: '12:00',
    securityDepositCents: bnd(100),
    maxAdvanceBookingDays: 62,
  },
  unitTypes: [
    {
      id: 'u1',
      slug: 'three-bedroom',
      name: 'Three-bedroom apartment',
      baseRateCents: bnd(180),
      maxPax: 6,
      carParks: 2,
    },
    {
      id: 'u2',
      slug: 'two-bedroom',
      name: 'Two-bedroom apartment',
      baseRateCents: bnd(150),
      maxPax: 4,
      carParks: 2,
    },
  ],
  bands: [
    { id: 'b1', label: 'Child 1–11', minAge: 1, maxAgeExclusive: 12, priceCents: bnd(5) },
    { id: 'b2', label: 'Adult 12+', minAge: 12, maxAgeExclusive: null, priceCents: bnd(10) },
  ],
  bundles: [
    {
      id: 'x1',
      label: '2 adults + 1 child',
      priceCents: bnd(20),
      sortOrder: 1,
      lines: [
        { bandId: 'b2', headcount: 2 },
        { bandId: 'b1', headcount: 1 },
      ],
    },
  ],
  facilities: [
    {
      id: 'f1',
      slug: 'pool',
      name: 'the pool',
      includedInDayPass: true,
      dayPassCapacity: null,
      sortOrder: 1,
    },
    {
      id: 'f2',
      slug: 'bbq-area',
      name: 'the BBQ area',
      includedInDayPass: false,
      dayPassCapacity: null,
      sortOrder: 2,
    },
  ],
  retention: [],
  bankAccounts: [{ id: 'a1', bankName: 'BIBD', accountNumber: '0018-02-0010611', sortOrder: 1 }],
}

const SELLABLE = new Set(['three-bedroom'])
const facts = faqFactsFrom(settings, SELLABLE)

/** Everything the page renders, flattened. */
function everyEntry() {
  return faqTopics.flatMap((topic) => topic.entries)
}

describe('faqTopics', () => {
  it('gives every entry an id nothing else uses, because it is a URL fragment', () => {
    const ids = everyEntry().map((entry) => entry.id)

    expect(new Set(ids).size).toBe(ids.length)
  })

  it('gives every topic an id nothing else uses', () => {
    const ids = faqTopics.map((topic) => topic.id)

    expect(new Set(ids).size).toBe(ids.length)
  })

  it('answers every question it asks with at least one real sentence', () => {
    for (const entry of everyEntry()) {
      const paragraphs = entry.answer(facts)

      expect(paragraphs.length, entry.id).toBeGreaterThan(0)

      for (const paragraph of paragraphs) {
        expect(paragraph.trim(), entry.id).not.toBe('')
      }
    }
  })

  it('names each open item once and never blankly', () => {
    for (const entry of everyEntry()) {
      if (!entry.pending) {
        continue
      }

      expect(entry.pending.length, entry.id).toBeGreaterThan(0)
      expect(new Set(entry.pending).size, entry.id).toBe(entry.pending.length)

      for (const label of entry.pending) {
        expect(label.trim(), entry.id).not.toBe('')
      }
    }
  })

  /**
   * The drift guard. Every figure on this page has been a settings row since
   * capability F3, so a rate written into the copy would survive the client
   * changing it — and nobody would find out until a guest quoted the page
   * back at the desk.
   */
  it('quotes no money figure that did not come from settings', () => {
    const rendered = everyEntry()
      .flatMap((entry) => entry.answer(facts))
      .join('\n')

    const quoted = rendered.match(/BND [\d.,]+/g) ?? []
    const fromSettings = new Set(moneyIn(facts))

    for (const figure of quoted) {
      expect(fromSettings.has(figure), `${figure} is not a settings value`).toBe(true)
    }
  })
})

describe('faqFactsFrom', () => {
  it('formats every money figure rather than passing cents through', () => {
    for (const figure of moneyIn(facts)) {
      expect(figure, figure).toMatch(/^BND \d+\.\d{2}$/)
    }
  })

  it('leaves out a unit type the building cannot sell', () => {
    expect(facts.unitTypes.map((type) => type.name)).toEqual(['Three-bedroom apartment'])
  })

  it('splits the facilities by whether a day pass covers them', () => {
    expect(facts.includedFacilities).toEqual(['the pool'])
    expect(facts.excludedFacilities).toEqual(['the BBQ area'])
  })

  it('carries the times through as the confirmation email states them', () => {
    expect(facts.checkInTime).toBe('14:00')
    expect(facts.checkOutTime).toBe('12:00')
  })
})

/** Every money string the facts carry, wherever it sits. */
function moneyIn(value: FaqFacts): string[] {
  return [
    value.securityDeposit,
    value.extraPersonPerNight,
    value.sofaBedFee,
    value.lateCheckOutPerHour,
    ...value.dayPassBands.map((band) => band.price),
    ...value.dayPassBundles.map((bundle) => bundle.price),
    ...value.unitTypes.map((type) => type.fromRate),
  ]
}
