import type { Metadata } from 'next'

import { PlannedScreen } from '@/components/portal/planned-screen'

export const metadata: Metadata = {
  title: 'Reports',
}

export default function ReportsPage() {
  return (
    <PlannedScreen
      title="Reports"
      description="Occupancy, revenue by stream, outstanding deposits and charges, the daily cash-up, and day-pass volume against capacity."
      capability="E4–E5"
    />
  )
}
