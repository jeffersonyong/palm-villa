'use client'

import { useState } from 'react'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { PropertySettings } from '@/lib/domain/settings'

import type { PropertyTab } from './property-tabs'

import { BankAccountsTab } from './bank-accounts-tab'
import { DayPassTab } from './day-pass-tab'
import { DocumentsTab } from './documents-tab'
import { PricingTab } from './pricing-tab'

/**
 * The four things a settings screen is (capability F3).
 *
 * Tabs rather than one long form because they are four separate saves against
 * four separate parts of the configuration: a half-finished day-pass price list
 * should not block correcting a nightly rate.
 *
 * Each tab is mounted only while it is showing, so it takes its draft from the
 * settings the server just read — and after a save, `router.refresh()` gives
 * every tab the new concurrency token by remounting them with fresh props.
 */

interface PropertySettingsTabsProps {
  settings: PropertySettings
  initialTab: PropertyTab
}

export function PropertySettingsTabs({ settings, initialTab }: PropertySettingsTabsProps) {
  const [activeTab, setActiveTab] = useState<string>(initialTab)

  return (
    <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-xl">
      <TabsList aria-label="Which settings to edit">
        <TabsTrigger value="pricing">Rates</TabsTrigger>
        <TabsTrigger value="day-pass">Day pass</TabsTrigger>
        <TabsTrigger value="documents">Documents</TabsTrigger>
        <TabsTrigger value="bank-accounts">Bank accounts</TabsTrigger>
      </TabsList>

      <TabsContent value="pricing">
        <PricingTab settings={settings} />
      </TabsContent>

      <TabsContent value="day-pass">
        <DayPassTab settings={settings} />
      </TabsContent>

      <TabsContent value="documents">
        <DocumentsTab settings={settings} />
      </TabsContent>

      <TabsContent value="bank-accounts">
        <BankAccountsTab settings={settings} />
      </TabsContent>
    </Tabs>
  )
}
