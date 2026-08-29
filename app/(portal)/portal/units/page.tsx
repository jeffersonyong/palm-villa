import type { Metadata } from 'next'

import { PlannedScreen } from '@/components/portal/planned-screen'

export const metadata: Metadata = {
  title: 'Units',
}

export default function UnitsPage() {
  return (
    <PlannedScreen
      title="Units"
      description="Each unit's live status through its lifecycle, plus marking units out of service or leased long-term."
      capability="B8–B9"
    />
  )
}
