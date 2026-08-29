import type { Metadata } from 'next'

import { PlannedScreen } from '@/components/portal/planned-screen'

export const metadata: Metadata = {
  title: 'Audit log',
}

export default function AuditLogPage() {
  return (
    <PlannedScreen
      title="Audit log"
      description="Every change to bookings, payments, deposits and charges, with who did it and when."
      capability="F4"
    />
  )
}
