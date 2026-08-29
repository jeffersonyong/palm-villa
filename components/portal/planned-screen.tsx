import { EmptyState } from '@/components/portal/empty-state'
import { PageHeader } from '@/components/portal/page-header'

/**
 * A route that exists in the navigation but is not built yet.
 *
 * The portal's information architecture is established up front so later slices
 * drop into a settled shell rather than rearranging it. These stubs make the
 * remaining work visible — to us, and to the client during a walkthrough —
 * instead of leaving dead links or hiding the plan.
 *
 * `capability` is the scope-of-capabilities.md reference this screen delivers,
 * so what is promised and what is built stay legible against each other.
 * Replacing a stub means deleting one component usage.
 *
 * It is optional because a few screens are navigational rather than
 * capability-bearing (the Admin landing page). Omitting it is the honest
 * option — inventing a reference to fill the slot would put a promise in the
 * UI that the scope document never made.
 */

interface PlannedScreenProps {
  title: string
  /** What this screen will do, in the language staff would use. */
  description: string
  /** Scope reference(s), e.g. `B4–B6`. Omit where none applies. */
  capability?: string
}

export function PlannedScreen({ title, description, capability }: PlannedScreenProps) {
  return (
    <>
      <PageHeader title={title} description={description} />
      <EmptyState
        className="mt-xl"
        title="Not built yet"
        description={
          capability
            ? `This screen is planned for a later slice. It covers ${capability} in the agreed scope.`
            : 'This screen is planned for a later slice.'
        }
      />
    </>
  )
}
