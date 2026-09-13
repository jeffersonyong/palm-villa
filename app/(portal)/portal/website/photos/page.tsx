import type { Metadata } from 'next'
import Link from 'next/link'
import { ExternalLink } from 'lucide-react'

import { EmptyState } from '@/components/portal/empty-state'
import { ExportCsvButton } from '@/components/portal/export-csv'
import { PageHeader } from '@/components/portal/page-header'
import { SectionCard } from '@/components/portal/section-card'
import { Button } from '@/components/ui/button'
import { hasPermission } from '@/lib/auth/permissions'
import { getActor } from '@/lib/auth/require-permission'
import { exportGroup } from '@/lib/db/export'
import { listCurrentSiteImages } from '@/lib/db/site-images'
import { listStaff } from '@/lib/db/staff'

import { photoSections } from './photo-sections'
import { PhotoSlot } from './photo-slot'

export const metadata: Metadata = {
  title: 'Website photos',
}

/**
 * The photographs on the public website (capability F7).
 *
 * Render-gated on `site_image.manage`, the way Property settings is gated on
 * `config.manage`: somebody without it gets a quiet card and this reads
 * nothing. The gate that matters is the first line of every action in
 * ./actions.ts; this one only spares somebody a screen they cannot use.
 *
 * The download sits behind `config.manage` like every other export (open
 * question N34), so a member of staff trusted with the photographs but not
 * with the business's records sees no download here.
 */
export default async function WebsitePhotosPage() {
  const actor = await getActor()

  if (!actor || !hasPermission(actor.permissions, 'site_image.manage')) {
    return (
      <>
        <PageHeader title="Website photos" description="The photographs on the public website." />
        <EmptyState
          className="mt-xl"
          title="You don't have access to this screen"
          description={
            'Changing the photos on the website needs the "Manage website photos" permission. Ask an administrator if this is part of your job.'
          }
        />
      </>
    )
  }

  const [images, staff] = await Promise.all([listCurrentSiteImages(), listStaff()])
  const names = new Map(staff.map((account) => [account.id, account.displayName]))
  const sections = photoSections(images, (userId) => names.get(userId) ?? 'a former colleague')

  return (
    <>
      <PageHeader
        title="Website photos"
        description="The photographs on the public website, in the order the front page shows them. A change is live as soon as it is saved, and every change is recorded."
        actions={
          <>
            {hasPermission(actor.permissions, 'config.manage') ? (
              <ExportCsvButton tables={exportGroup('website')} />
            ) : null}
            <Button asChild variant="tertiary">
              <Link href="/" target="_blank" rel="noopener noreferrer">
                <ExternalLink aria-hidden />
                View the website
              </Link>
            </Button>
          </>
        }
      />

      <div className="mt-xl grid gap-xl">
        {sections.map((section) => (
          <SectionCard
            key={section.id}
            id={`photos-${section.id}`}
            title={section.title}
            hint={section.hint}
          >
            <ul className="grid gap-lg sm:grid-cols-2 lg:grid-cols-4">
              {section.slots.map((slot) => (
                <li key={slot.key}>
                  <PhotoSlot slot={slot} />
                </li>
              ))}
            </ul>
          </SectionCard>
        ))}
      </div>
    </>
  )
}
