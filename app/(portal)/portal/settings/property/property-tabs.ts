/**
 * Which tab of the settings screen is showing (capability F3).
 *
 * A plain module with no `'use client'`, deliberately — the reports screen's
 * `page-size.ts` records the same reason. The server page CALLS `isPropertyTab`
 * to read `?tab=`, and an export from a client module reaching a server
 * component arrives as a reference to be rendered, not as a function to be run:
 * it type-checks, it builds, and it throws at request time.
 *
 * The tab is in the URL so a link can point at one — the audit log sends a
 * settings event to the tab it came from.
 */

export const PROPERTY_TABS = ['pricing', 'day-pass', 'documents', 'bank-accounts'] as const

export type PropertyTab = (typeof PROPERTY_TABS)[number]

export function isPropertyTab(value: string): value is PropertyTab {
  return (PROPERTY_TABS as readonly string[]).includes(value)
}
