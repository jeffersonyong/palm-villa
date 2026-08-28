import type { Metadata } from 'next'

import { PlannedScreen } from '@/components/portal/planned-screen'

export const metadata: Metadata = {
  title: 'Booking calendar',
}

export default function BookingCalendarPage() {
  return (
    <PlannedScreen
      title="Booking calendar"
      description="Every booking across all streams, laid out by unit and date."
      capability="B1 (calendar view)"
    />
  )
}
