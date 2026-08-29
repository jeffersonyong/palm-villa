import type { Metadata } from 'next'

import { PlannedScreen } from '@/components/portal/planned-screen'

export const metadata: Metadata = {
  title: 'Pricing',
}

export default function PricingSettingsPage() {
  return (
    <PlannedScreen
      title="Pricing"
      description="Rates, fees, facility inclusion and capacity, hold durations and retention periods — settings, not code changes."
      capability="F3"
    />
  )
}
