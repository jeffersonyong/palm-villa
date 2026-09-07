import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, test } from 'vitest'

import {
  auditSubjectHref,
  describeAuditEvent,
  isAuditEntityType,
  isAuditFamily,
  KNOWN_AUDIT_ACTIONS,
  type AuditEventLike,
} from './audit-label'
import { bnd } from './money'

/**
 * The audit vocabulary (capability F4).
 *
 * Two things are worth testing here and one of them is unusual. The ordinary
 * half is that the payload-derived labels say what they should. The other half
 * reads the migrations: the verbs the database writes are the ones this module
 * has to know about, and the only way that stays true as slices are added is to
 * ask the migrations rather than to remember.
 */

function event(action: string, payload: Partial<AuditEventLike> = {}): AuditEventLike {
  return { action, before: payload.before ?? null, after: payload.after ?? null }
}

describe('describeAuditEvent', () => {
  test('gives every verb the product writes a real sentence', () => {
    // The fallback exists so an unlabelled verb still renders rather than
    // vanishing. Nothing shipped today should be reaching it.
    for (const action of KNOWN_AUDIT_ACTIONS) {
      const label = describeAuditEvent(event(action))
      const fallback = action.replace(/^[a-z_]+\./, '').replace(/_/g, ' ')

      expect(label, `${action} falls through to the raw verb`).not.toBe(fallback)
      expect(label.length).toBeGreaterThan(0)
    }
  })

  test('still renders a verb nobody has labelled', () => {
    expect(describeAuditEvent(event('booking.teleported'))).toBe('teleported')
  })

  test('names how a walk-in paid, because it changes what happened', () => {
    expect(describeAuditEvent(event('booking.created_walk_in'))).toContain('paid on the spot')
    expect(
      describeAuditEvent(
        event('booking.created_walk_in', { after: { payment_method: 'bank_transfer' } }),
      ),
    ).toContain('paying by transfer')
  })

  test('tells a discount applied, changed and removed apart', () => {
    expect(describeAuditEvent(event('booking.discounted', { after: { kind: 'percent' } }))).toBe(
      'Discount applied',
    )
    expect(
      describeAuditEvent(
        event('booking.discounted', { before: { kind: 'percent' }, after: { kind: 'amount' } }),
      ),
    ).toBe('Discount changed')
    expect(
      describeAuditEvent(
        event('booking.discounted', { before: { kind: 'percent' }, after: { kind: null } }),
      ),
    ).toBe('Discount removed')
  })

  test('names which document was opened — the whole point of the G3 log', () => {
    expect(describeAuditEvent(event('document.viewed', { after: { kind: 'identity' } }))).toBe(
      'Identity document opened',
    )
    expect(describeAuditEvent(event('document.viewed', { after: { kind: 'payment_slip' } }))).toBe(
      'Transfer slip opened',
    )
  })

  test('carries the figure on the verbs a reader came for', () => {
    expect(
      describeAuditEvent(
        event('charge.created', { after: { amount_cents: bnd(130) } }),
      ),
    ).toBe('Charge added — BND 130.00')

    expect(
      describeAuditEvent(
        event('deposit.collected', { after: { amount_cents: bnd(100), method: 'cash' } }),
      ),
    ).toContain('BND 100.00')
  })

  test('names both sides of a rename', () => {
    expect(
      describeAuditEvent(
        event('unit.renamed', { before: { ref: 'SD-01' }, after: { ref: 'Villa 1' } }),
      ),
    ).toBe('Renamed from SD-01 to Villa 1')
  })

  test('reads a settings change as the field that moved', () => {
    expect(
      describeAuditEvent(
        event('unit_type.updated', {
          before: { base_rate_cents: bnd(200) },
          after: { base_rate_cents: bnd(220) },
        }),
      ),
    ).toBe('Nightly rate changed — BND 200.00 → BND 220.00')

    expect(
      describeAuditEvent(
        event('facility.updated', {
          before: { included_in_day_pass: true },
          after: { included_in_day_pass: false },
        }),
      ),
    ).toBe('In the day pass changed — yes → no')
  })

  test('counts the fields when a settings change moved several', () => {
    expect(
      describeAuditEvent(
        event('property.policy_updated', {
          before: { security_deposit_cents: bnd(100), check_in_time: '14:00' },
          after: { security_deposit_cents: bnd(150), check_in_time: '15:00' },
        }),
      ),
    ).toBe('Booking policy updated — 2 fields changed')
  })

  test('keeps the retention event tied to the document it governs', () => {
    // `kind` survives the diff on both sides deliberately — it is what the
    // event is about, not something that changed.
    expect(
      describeAuditEvent(
        event('document_retention.updated', {
          before: { kind: 'identity', months: 12 },
          after: { kind: 'identity', months: 6, documents_rescheduled: 4 },
        }),
      ),
    ).toBe('Identity document retention changed — 12 → 6 months, 4 files re-dated')
  })

  test('says what a registry update did', () => {
    expect(
      describeAuditEvent(
        event('unit_registry.updated', { after: { renamed: 36, added: 4, removed: 0 } }),
      ),
    ).toBe('Unit registry updated — 36 renamed, 4 added')
  })
})

describe('auditSubjectHref', () => {
  test('points a booking, a deposit and a unit at their own screens', () => {
    expect(auditSubjectHref('payment', 'PV-0042')).toBe('/portal/bookings/PV-0042')
    expect(auditSubjectHref('deposit_charge', 'PV-0042')).toBe('/portal/deposits/PV-0042')
    expect(auditSubjectHref('unit', '3B-01')).toBe('/portal/units/3B-01')
  })

  test('points a settings event at the tab that changed it', () => {
    expect(auditSubjectHref('facility', 'Gym')).toBe('/portal/settings/property?tab=day-pass')
    expect(auditSubjectHref('document_retention', 'Palm Villa')).toBe(
      '/portal/settings/property?tab=documents',
    )
  })

  test('has nowhere to point when the subject is gone', () => {
    // A removed band resolves to no label in the view, so there is no row to
    // link to — and a link to one would 404.
    expect(auditSubjectHref('day_pass_band', null)).toBeNull()
  })
})

describe('the vocabulary against the migrations', () => {
  /**
   * Every `(action, entity_type)` pair the SQL writes.
   *
   * Read out of the migrations rather than listed here, because the list this
   * asserts against is the one a future slice will forget to update. The
   * pattern matches the argument order every writer uses —
   * `..., 'verb', 'entity', ...` inside an insert into audit_event — which is a
   * convention rather than a guarantee, so a miss here is a prompt to look
   * rather than proof of a bug.
   */
  function writtenPairs(): { action: string; entityType: string }[] {
    const directory = join(process.cwd(), 'supabase', 'migrations')
    const pairs = new Map<string, { action: string; entityType: string }>()

    for (const file of readdirSync(directory).filter((name) => name.endsWith('.sql'))) {
      const sql = readFileSync(join(directory, file), 'utf8')

      for (const match of sql.matchAll(/'([a-z_]+\.[a-z_]+)',\s*'([a-z_]+)'/g)) {
        const [, action, entityType] = match

        if (action && entityType) {
          pairs.set(`${action}|${entityType}`, { action, entityType })
        }
      }
    }

    return [...pairs.values()]
  }

  test('knows every verb the migrations write', () => {
    const known = new Set<string>(KNOWN_AUDIT_ACTIONS)
    const missing = writtenPairs()
      .map((pair) => pair.action)
      .filter((action) => !known.has(action))

    expect(missing).toEqual([])
  })

  test('knows every kind of record the migrations write against', () => {
    const missing = writtenPairs()
      .map((pair) => pair.entityType)
      .filter((entityType) => !isAuditEntityType(entityType))

    expect(missing).toEqual([])
  })

  test('has a family for every verb it knows', () => {
    const missing = KNOWN_AUDIT_ACTIONS.map((action) => action.split('.')[0] ?? '').filter(
      (family) => !isAuditFamily(family),
    )

    expect(missing).toEqual([])
  })
})
