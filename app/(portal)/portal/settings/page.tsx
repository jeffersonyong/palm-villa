import type { Metadata } from 'next'

import { PlannedScreen } from '@/components/portal/planned-screen'

export const metadata: Metadata = {
  title: 'Settings',
}

/**
 * Settings for the person signed in, not for the property.
 *
 * No `capability` ref: this is account housekeeping — display name, password,
 * notification preferences — which the scope never had to ask for, and which
 * every role can reach. The permission-gated screens (F1–F4) are the Admin
 * group's, and they sit beneath this URL only because the routes were laid out
 * when Settings meant the Admin landing page; the nesting is worth revisiting
 * before this screen is built.
 *
 * F5 — exporting the business data, promised in the scope with no screen
 * anywhere — is property-level, so it belongs to Admin rather than here.
 */
export default function SettingsPage() {
  return (
    <PlannedScreen
      title="Settings"
      description="Your own account — name, password and notification preferences. Property-level configuration lives under Admin."
    />
  )
}
