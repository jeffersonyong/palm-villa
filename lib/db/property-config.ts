import type { PropertyConfig } from '@/lib/domain/config'
import { configFromSettings } from '@/lib/domain/settings'

import { readPropertySettings } from './settings'

/**
 * The configuration the pricing engine prices with (capability F3).
 *
 * The one entry point for "what does this property charge". Everything that
 * quotes — the walk-in form, the amendment form and both their actions — reads
 * it here rather than importing `palmVillaConfig`, which is now the seed's
 * fixture and not the live figures (see lib/domain/config.ts).
 *
 * **Not memoised, deliberately.** A rate the client changed a second ago has to
 * be the rate the next quote uses, and a per-process cache would keep the old
 * one until the server restarted — for a setting whose whole purpose is that
 * changing it takes effect. `currentPropertyId()` caches the property's uuid,
 * which cannot change; the figures are read fresh, and it is one indexed call
 * per render of the two screens that quote.
 *
 * The result is a plain serialisable object, because both forms take it as a
 * client prop.
 */
export async function getPropertyConfig(): Promise<PropertyConfig> {
  return configFromSettings(await readPropertySettings())
}
