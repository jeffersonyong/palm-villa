import type { Metadata } from 'next'

import { PlannedScreen } from '@/components/portal/planned-screen'

export const metadata: Metadata = {
  title: 'Cash payments',
}

export default function CashPaymentsPage() {
  return (
    <PlannedScreen
      title="Cash payments"
      description="Cash recorded against a booking — who collected it, when, and how much."
      capability="B7"
    />
  )
}
