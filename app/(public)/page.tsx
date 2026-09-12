import type { Metadata } from 'next'

import { listCurrentSiteImages } from '@/lib/db/site-images'
import {
  NO_LANDING_IMAGES,
  landingImagesFrom,
  type LandingImages,
} from '@/lib/domain/landing-images'

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

/**
 * Static, and regenerated rather than rendered per visit (capability F7).
 *
 * `/stay`, `/day-pass` and `/faq` are `force-dynamic` because a rate somebody
 * changed a second ago has to be the rate the next visitor is quoted. A
 * photograph is not a price: every portal action that changes one calls
 * `revalidatePath('/')`, so a new photo is live on the next visit anyway, and
 * the most-visited page stays a cached file rather than a database round trip
 * per request. The hour is the backstop for the one change that does not go
 * through those actions — a facility deleted in Property settings, which takes
 * its photograph with it.
 */
export const revalidate = 3600

export default async function PublicHomePage() {
  const images = await readLandingImages()

  return (
    <>
      <Hero image={images.hero} />
      <DayPassSection images={images.facilities} />
      <StaysSection images={images.unitTypes} />
      <LongTermSection />
      <HowBookingWorks />
      <SocialStrip images={images.feed} />
      <FinalCta />
    </>
  )
}

/**
 * The photographs, or none.
 *
 * The front page never fails because its photographs could not be read — at
 * build time with no database, or during an outage — so a failed read logs and
 * renders every place as its placeholder. Logged rather than swallowed, because
 * a front page quietly showing grey boxes is exactly what nobody would notice.
 */
async function readLandingImages(): Promise<LandingImages> {
  try {
    return landingImagesFrom(await listCurrentSiteImages())
  } catch (error) {
    console.error('The landing page could not read its photographs; showing placeholders.', error)

    return NO_LANDING_IMAGES
  }
}
