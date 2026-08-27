import type { Metadata } from 'next'

import { DayPassSection } from './_components/day-pass-section'
import { FinalCta } from './_components/final-cta'
import { Hero } from './_components/hero'
import { HowBookingWorks } from './_components/how-booking-works'
import { SocialStrip } from './_components/social-strip'
import { LongTermSection } from './_components/long-term-section'
import { StaysSection } from './_components/stays-section'

export const metadata: Metadata = {
  title: 'Palm Villa — day passes and stays in Bandar Seri Begawan',
  description:
    'Facility day passes for the swimming pool, water park and indoor children’s playground, plus apartment stays from BND 180 a night at Palm Villa, Bandar Seri Begawan.',
}

export default function PublicHomePage() {
  return (
    <>
      <Hero />
      <DayPassSection />
      <StaysSection />
      <LongTermSection />
      <HowBookingWorks />
      <SocialStrip />
      <FinalCta />
    </>
  )
}
