import type { Metadata } from 'next'

import { PlannedScreen } from '@/components/portal/planned-screen'

export const metadata: Metadata = {
  title: 'Bookings',
}

export default function BookingsListPage() {
  return (
    <PlannedScreen
      title="Bookings"
      description="Every booking in one list, filterable by status and dates — the single source of truth replacing the spreadsheet."
      capability="B1 (list view)"
    />
  )
}
