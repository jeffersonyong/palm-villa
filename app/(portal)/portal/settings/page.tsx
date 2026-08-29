import type { Metadata } from 'next'

import { PlannedScreen } from '@/components/portal/planned-screen'

export const metadata: Metadata = {
  title: 'Settings',
}

/**
 * The Admin area's landing screen.
 *
 * No `capability` ref: the specific settings screens beneath it carry those
 * (F1–F4), and this page is navigational. Property-level settings that have
 * no home yet — and F5, exporting the business data, which is promised in the
 * scope and has no screen anywhere — are the candidates for what it holds.
 */
export default function SettingsPage() {
  return (
    <PlannedScreen
      title="Settings"
      description="Property-level settings for the operation. The specific screens live beneath this one."
    />
  )
}
