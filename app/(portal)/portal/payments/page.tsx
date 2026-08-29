import type { Metadata } from 'next'

import { PlannedScreen } from '@/components/portal/planned-screen'

export const metadata: Metadata = {
  title: 'Payment verification',
}

export default function PaymentVerificationPage() {
  return (
    <PlannedScreen
      title="Payment verification"
      description="Bookings waiting on a transfer: reference, amount expected, how long they have been waiting, and the uploaded slip."
      capability="B4–B6"
    />
  )
}
