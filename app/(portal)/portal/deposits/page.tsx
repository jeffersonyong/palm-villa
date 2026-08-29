import type { Metadata } from 'next'

import { PlannedScreen } from '@/components/portal/planned-screen'

export const metadata: Metadata = {
  title: 'Deposits',
}

export default function DepositsPage() {
  return (
    <PlannedScreen
      title="Deposits"
      description="What is held right now, itemised charges against a deposit, and release approvals once an inspection is recorded."
      capability="E1–E3"
    />
  )
}
