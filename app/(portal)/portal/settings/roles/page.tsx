import type { Metadata } from 'next'

import { PlannedScreen } from '@/components/portal/planned-screen'

export const metadata: Metadata = {
  title: 'Roles & staff',
}

export default function RolesSettingsPage() {
  return (
    <PlannedScreen
      title="Roles & staff"
      description="Staff accounts and what each role may do. One person can hold several roles."
      capability="F1–F2"
    />
  )
}
