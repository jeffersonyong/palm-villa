import { DOCUMENT_KIND_LABELS, isDocumentKind } from './document'
import { INSPECTION_OUTCOME_LABELS, isInspectionOutcome } from './inspection'
import { formatCents } from './money'
import { PAYMENT_METHOD_LABELS, type PaymentMethod } from './payment'

/**
 * What each recorded event says, in words (capability F4).
 *
 * Three screens each held their own vocabulary — a booking's history, a
 * deposit's, a unit's — which was right while a trail was always read against
 * one record. The property-wide audit log is read against all of them at once,
 * so a fourth copy would have been the first one to disagree with the others.
 * They are merged here, and the three screens now pass this in.
 *
 * Where two of them worded a verb differently, the **richer** wording wins: the
 * deposit screen said "Security deposit collected — BND 100.00, in cash" where
 * the booking screen said "Security deposit collected", and the figure is the
 * half a reader came for. Nothing was dropped in the merge.
 *
 * ── The fallback is deliberate ─────────────────────────────────────────────
 *
 * An action with no label still renders, as its own verb with the family
 * stripped. Hiding it would make the trail lie by omission about something
 * that happened, which is the one thing an audit trail may not do. Every verb
 * the product writes today IS labelled — `KNOWN_AUDIT_ACTIONS` is the list, and
 * the test asserts each one reaches a real sentence — so the fallback is for
 * the verb somebody adds next.
 */

/** Everything a label needs. Structural, so `lib/db`'s rows satisfy it. */
export interface AuditEventLike {
  action: string
  before: Record<string, unknown> | null
  after: Record<string, unknown> | null
}

/**
 * Every verb the product writes, by family.
 *
 * Gathered from the SQL functions in supabase/migrations and the two
 * TypeScript writers (lib/db/staff.ts and lib/db/documents.ts). The list is
 * what the test walks to prove nothing falls through to the raw-verb fallback.
 */
export const KNOWN_AUDIT_ACTIONS = [
  'booking.created_walk_in',
  'booking.created_public',
  'booking.link_issued',
  'booking.amended',
  'booking.discounted',
  'booking.hold',
  'booking.submit_payment',
  'booking.verify_payment',
  'booking.pay_in_full',
  'booking.secure_with_deposit',
  'booking.check_in',
  'booking.check_out',
  'booking.expire',
  'booking.cancel',
  'booking.mark_no_show',
  'payment.recorded',
  'payment.cash_recorded',
  'payment.verified',
  'payment.amount_overridden',
  'payment.matched_manually',
  'deposit.waived',
  'deposit.collected',
  'deposit.promised',
  'deposit.topped_up',
  'deposit.amount_overridden',
  'deposit.matched_manually',
  'deposit.release_approved',
  'deposit.owed_settled',
  'deposit.forfeited',
  'deposit.returned',
  'charge.created',
  'charge.waived',
  'inspection.recorded',
  'document.attached',
  'document.viewed',
  'document.removed',
  'document.expired',
  'document.superseded',
  'unit.added',
  'unit.removed',
  'unit.renamed',
  'unit.marked_out_of_service',
  'unit.returned_to_service',
  'unit.leased',
  'unit.lease_ended',
  'unit.lease_cancelled',
  'unit.note_added',
  'unit.note_changed',
  'unit.note_cleared',
  'unit_registry.updated',
  'unit_type.updated',
  'property.policy_updated',
  'day_pass_band.added',
  'day_pass_band.updated',
  'day_pass_band.removed',
  'day_pass_bundle.added',
  'day_pass_bundle.updated',
  'day_pass_bundle.removed',
  'facility.added',
  'facility.updated',
  'facility.removed',
  'document_retention.updated',
  'bank_account.added',
  'bank_account.updated',
  'bank_account.removed',
  'role.permissions_set',
  'staff.roles_set',
  'staff.account_created',
  'staff.account_disabled',
  'staff.account_enabled',
  'staff.password_reset',
  'staff.account_deleted',
  'cash.banked',
  'email.sent',
  'email.failed',
] as const

/** The families the audit screen filters by, in the order it offers them. */
export const AUDIT_FAMILIES = [
  'booking',
  'payment',
  'deposit',
  'charge',
  'inspection',
  'document',
  'email',
  'unit',
  'unit_registry',
  'unit_type',
  'property',
  'day_pass_band',
  'day_pass_bundle',
  'facility',
  'document_retention',
  'bank_account',
  'role',
  'staff',
  'cash',
] as const

export type AuditFamily = (typeof AUDIT_FAMILIES)[number]

export function isAuditFamily(value: string): value is AuditFamily {
  return (AUDIT_FAMILIES as readonly string[]).includes(value)
}

/**
 * How a family is named in the filter.
 *
 * Grouped by what somebody would look for rather than by the verb prefix: the
 * six settings families all read "Settings", because "show me what changed in
 * settings" is one question and nobody thinks of it as five.
 */
export const AUDIT_FAMILY_LABELS: Readonly<Record<AuditFamily, string>> = {
  booking: 'Bookings',
  payment: 'Payments',
  deposit: 'Deposits',
  charge: 'Charges',
  inspection: 'Inspections',
  document: 'Documents',
  email: 'Emails',
  unit: 'Units',
  unit_registry: 'Unit registry',
  unit_type: 'Settings — rates',
  property: 'Settings — policy',
  day_pass_band: 'Settings — day pass',
  day_pass_bundle: 'Settings — bundles',
  facility: 'Settings — facilities',
  document_retention: 'Settings — retention',
  bank_account: 'Settings — bank accounts',
  role: 'Roles',
  staff: 'Staff accounts',
  cash: 'Cash banked',
}

const ACTION_LABELS: Readonly<Record<string, string>> = {
  'booking.amended': 'Edited',
  'booking.cancel': 'Cancelled',
  'booking.check_in': 'Checked in',
  'booking.check_out': 'Checked out',
  // The booking's own status move, distinct from the payment event beside it.
  // Labelling both "Payment verified" made the trail say the same thing twice:
  // the money is the payment's event, the status is the booking's.
  'booking.verify_payment': 'Booking confirmed',
  'booking.pay_in_full': 'Booking confirmed',
  // The same words as the two above it, and deliberately: what confirmed the
  // booking is the deposit event sitting beside it in the trail, and three
  // different phrasings for one outcome would make a reader hunt for a
  // difference that is not there.
  'booking.secure_with_deposit': 'Booking confirmed',
  'booking.submit_payment': 'Sent for verification',
  // The clause after the dash is doing work the actor column cannot. This
  // event has no actor — the customer did it — and `EventHistory` renders a
  // null actor as "System", which would read as the property issuing itself a
  // link. Naming how it was found is what says a person asked for it.
  'booking.link_issued': 'Booking link issued — found by reference and phone',
  'booking.expire': 'Hold expired',
  'booking.mark_no_show': 'Marked no-show',
  'booking.hold': 'Held',
  'payment.recorded': 'Bank transfer awaited',
  'payment.cash_recorded': 'Cash recorded',
  'payment.verified': 'Payment verified',
  'payment.amount_overridden': 'Confirmed at an amount other than the total',
  'payment.matched_manually': 'Matched to a booking by hand',
  'deposit.matched_manually': 'Matched to a booking by hand',
  'deposit.waived': 'Security deposit waived',
  'unit.marked_out_of_service': 'Taken out of service',
  'unit.returned_to_service': 'Returned to service',
  'unit.leased': 'Let long-term',
  'unit.lease_ended': 'Lease end date changed',
  'unit.lease_cancelled': 'Lease removed',
  'unit.added': 'Added to the building',
  'unit.removed': 'Removed from the building',
  'unit.note_added': 'Note added',
  'unit.note_changed': 'Note changed',
  'unit.note_cleared': 'Note cleared',
  'role.permissions_set': 'Role permissions changed',
  'staff.roles_set': 'Roles changed',
  'staff.account_created': 'Staff account created',
  'staff.account_disabled': 'Staff account disabled',
  'staff.account_enabled': 'Staff account re-enabled',
  'staff.password_reset': 'Password reset',
  'staff.account_deleted': 'Staff account deleted',
  'day_pass_band.added': 'Age band added',
  'day_pass_band.removed': 'Age band removed',
  'day_pass_bundle.added': 'Family bundle added',
  'day_pass_bundle.removed': 'Family bundle removed',
  'facility.added': 'Facility added',
  'facility.removed': 'Facility removed',
  'bank_account.added': 'Bank account added',
  'bank_account.removed': 'Bank account removed',
}

const DOCUMENT_VERBS: Readonly<Record<string, string>> = {
  'document.attached': 'attached',
  'document.viewed': 'opened',
  'document.removed': 'removed',
  'document.expired': 'deleted — retention period ended',
  'document.superseded': 'replaced by a newer pack',
}

export function describeAuditEvent(event: AuditEventLike): string {
  const described =
    describeBooking(event) ??
    describeDeposit(event) ??
    describeUnit(event) ??
    describeEmail(event) ??
    describeSettings(event) ??
    ACTION_LABELS[event.action]

  return described ?? fallbackLabel(event.action)
}

/**
 * The two emails a booking can send (capability A8).
 *
 * A branch rather than an `ACTION_LABELS` entry because the sentence depends
 * on which email it was, and a failure is worth naming as a failure: this is
 * the only place anybody finds out that a guest never received their
 * confirmation. It reads as a sentence with no payload at all, which is what
 * the walk over `KNOWN_AUDIT_ACTIONS` asserts.
 */
function describeEmail(event: AuditEventLike): string | null {
  if (event.action !== 'email.sent' && event.action !== 'email.failed') {
    return null
  }

  const kind = typeof event.after?.kind === 'string' ? event.after.kind : null
  const what =
    kind === 'booking_confirmed'
      ? 'Confirmation email'
      : kind === 'booking_created'
        ? 'Booking email'
        : 'Email'

  if (event.action === 'email.sent') {
    return `${what} sent`
  }

  const failure = typeof event.after?.failure === 'string' ? event.after.failure : null

  return failure === null
    ? `${what} could not be sent`
    : `${what} could not be sent — ${EMAIL_FAILURE_LABELS[failure] ?? failure.replace(/_/g, ' ')}`
}

/** Plain readings of `lib/email/send.ts`'s failure classes, for the history. */
const EMAIL_FAILURE_LABELS: Readonly<Record<string, string>> = {
  unreachable: 'the mail service could not be reached',
  timed_out: 'the mail service did not answer in time',
  throttled: 'the mail service was rate-limiting us',
  provider_down: 'the mail service was failing',
  rejected: 'the mail service refused it',
  unreadable: 'the mail service answered in a way we could not read',
  not_configured: 'no mail service is configured',
  rate_limited: 'too many emails to that address today',
}

/**
 * An unmapped verb, as itself.
 *
 * `deposit.owed_settled` would read "owed settled" — clumsy, and unmistakably
 * a gap rather than a sentence somebody wrote, which is the point.
 */
function fallbackLabel(action: string): string {
  return action.replace(/^[a-z_]+\./, '').replace(/_/g, ' ')
}

// ── Bookings, payments and documents ───────────────────────────────────────

function describeBooking(event: AuditEventLike): string | null {
  if (event.action === 'booking.created_walk_in') {
    // Creation reads differently depending on how the guest paid: "paid on the
    // spot" is a lie about a transfer booking, which exists precisely because
    // the money has not been confirmed.
    return event.after?.payment_method === 'bank_transfer'
      ? 'Created — walk-in, paying by transfer'
      : 'Created — walk-in, paid on the spot'
  }

  if (event.action === 'booking.created_public') {
    // The customer did this themselves, which is the fact the trail is missing
    // everywhere else: every other creation verb has a staff member beside it,
    // and this one has nobody. The stream is named as well, because a day pass
    // and a stay are the two things the public site sells and nothing else on
    // the line will say which was sold.
    return event.after?.stream === 'day_pass'
      ? 'Booked online — day pass'
      : 'Booked online — short stay'
  }

  if (event.action === 'booking.discounted') {
    return discountLabel(event)
  }

  if (event.action.startsWith('document.')) {
    return documentLabel(event)
  }

  return null
}

/**
 * One verb, three things that happened.
 *
 * `booking.discounted` is written when a discount is given, changed and taken
 * away — deliberately, so "every discount this month" stays a lookup on one
 * action. "Discount changed" against a removal is not clumsy phrasing, it is
 * the trail describing an event that did not happen.
 */
function discountLabel(event: AuditEventLike): string {
  const had = Boolean(event.before?.kind)
  const has = Boolean(event.after?.kind)

  if (!had) {
    return 'Discount applied'
  }

  return has ? 'Discount changed' : 'Discount removed'
}

/**
 * Which document, not just that there was one.
 *
 * It matters most on `document.viewed`: capability G3 promises a record of who
 * opened an **identity document**, and "Document opened" beside a slip and an
 * IC makes that a record somebody has to cross-reference rather than read.
 */
function documentLabel(event: AuditEventLike): string {
  const kind = event.after?.kind ?? event.before?.kind
  const noun =
    typeof kind === 'string' && isDocumentKind(kind) ? DOCUMENT_KIND_LABELS[kind] : 'Document'
  const verb = DOCUMENT_VERBS[event.action]

  return verb ? `${noun} ${verb}` : noun
}

// ── Deposits, charges and inspections ──────────────────────────────────────

function cents(value: unknown): string | null {
  return typeof value === 'number' ? formatCents(value) : null
}

function methodLabel(value: unknown): string | null {
  return typeof value === 'string' && value in PAYMENT_METHOD_LABELS
    ? PAYMENT_METHOD_LABELS[value as PaymentMethod].toLowerCase()
    : null
}

/**
 * Four of these verbs carry a figure, and the figure is the point of the line:
 * "Charge added" says less than half of what "Charge added — BND 130.00" says.
 *
 * Read out of the event rather than off the row, because prd.md §11's whole
 * point is that an approval is a recorded event — the deposit may have been
 * added to since, and this line has to say what was true when somebody signed.
 */
function describeDeposit(event: AuditEventLike): string | null {
  const amount = cents(event.after?.amount_cents)

  switch (event.action) {
    case 'deposit.collected': {
      const method = methodLabel(event.after?.method)

      return `Security deposit collected${amount ? ` — BND ${amount}` : ''}${method ? `, in ${method}` : ''}`
    }
    case 'deposit.promised': {
      // The customer says they have transferred it. Worded as a wait rather than
      // as money, because that is what it is until somebody looks — the same
      // distinction `payment.recorded` draws with "awaited".
      return `Security deposit transfer awaited${amount ? ` — BND ${amount}` : ''}`
    }
    case 'deposit.topped_up': {
      // The added figure leads, because that is the act; the running total
      // follows so a reader can see whether it closed the gap without holding
      // two lines in their head.
      const added = cents(event.after?.added_cents)
      const quoted = cents(event.after?.quoted_cents)
      const method = methodLabel(event.after?.method)

      return `Security deposit topped up${added ? ` — BND ${added}` : ''}${
        method ? `, in ${method}` : ''
      }${amount && quoted ? ` — BND ${amount} held of BND ${quoted}` : ''}`
    }
    case 'deposit.amount_overridden': {
      const quoted = cents(event.before?.quoted_cents)

      return `Deposit accepted at an amount other than the ${quoted ? `BND ${quoted} ` : ''}quoted figure`
    }
    case 'deposit.release_approved': {
      const owed = cents(event.after?.owed_cents)
      const returned = cents(event.after?.released_amount_cents)

      if (owed !== null && event.after?.owed_cents !== 0) {
        return `Release approved — BND ${owed} owed by the guest`
      }

      return returned === null ? 'Release approved' : `Release approved — BND ${returned} returned`
    }
    case 'deposit.owed_settled': {
      const owed = cents(event.after?.owed_cents)
      const method = methodLabel(event.after?.method)

      return `Amount owed settled${owed ? ` — BND ${owed}` : ''}${method ? `, in ${method}` : ''}`
    }
    case 'deposit.forfeited': {
      // Why it was kept travels in the event rather than being read off the
      // booking: the two closes that keep a deposit read differently in a
      // dispute, and the trail is what gets read in one.
      const why =
        event.after?.booking_event === 'mark_no_show' ? 'guest did not arrive' : 'booking cancelled'

      return `Security deposit kept${amount ? ` — BND ${amount}` : ''}, ${why}`
    }
    case 'deposit.returned': {
      // The figure that went back, which is less than what was held only where
      // charges stood against it — the release arithmetic, applied at the close.
      const returned = cents(event.after?.released_amount_cents)

      return `Security deposit returned${returned ? ` — BND ${returned}` : ''}, booking cancelled`
    }
    case 'inspection.recorded': {
      const outcome = event.after?.outcome

      return typeof outcome === 'string' && isInspectionOutcome(outcome)
        ? `Inspection recorded — ${INSPECTION_OUTCOME_LABELS[outcome].toLowerCase()}`
        : 'Inspection recorded'
    }
    case 'charge.created':
      return amount === null ? 'Charge added' : `Charge added — BND ${amount}`
    case 'charge.waived':
      return amount === null ? 'Charge waived' : `Charge waived — BND ${amount}`
    case 'cash.banked': {
      const banked = cents(event.after?.amount_cents)
      const day = event.after?.business_date

      return `Cash banked${banked ? ` — BND ${banked}` : ''}${typeof day === 'string' ? `, taken on ${day}` : ''}`
    }
    default:
      return null
  }
}

// ── Units ──────────────────────────────────────────────────────────────────

function describeUnit(event: AuditEventLike): string | null {
  if (event.action === 'unit.renamed') {
    const from = typeof event.before?.ref === 'string' ? event.before.ref : null
    const to = typeof event.after?.ref === 'string' ? event.after.ref : null

    return from && to ? `Renamed from ${from} to ${to}` : 'Renamed'
  }

  if (event.action === 'unit_registry.updated') {
    const parts = [
      countPart(event.after?.renamed, 'renamed'),
      countPart(event.after?.added, 'added'),
      countPart(event.after?.removed, 'removed'),
    ].filter((part): part is string => part !== null)

    return parts.length > 0
      ? `Unit registry updated — ${parts.join(', ')}`
      : 'Unit registry updated'
  }

  return null
}

function countPart(value: unknown, verb: string): string | null {
  return typeof value === 'number' && value > 0 ? `${value} ${verb}` : null
}

// ── Settings ───────────────────────────────────────────────────────────────

/**
 * How a settings field is named on the screen that edits it.
 *
 * The event carries only the changed keys (audit_settings_change diffs an
 * update), so a label is one field's worth of sentence rather than a
 * restatement of the whole row.
 */
const FIELD_LABELS: Readonly<Record<string, string>> = {
  base_rate_cents: 'Nightly rate',
  max_pax: 'Maximum guests',
  car_parks: 'Car parks',
  pax_policy: 'What happens over the maximum',
  extra_person_per_night_cents: 'Extra guest charge',
  pax_exempt_age_max: 'Age not counted up to',
  sofa_bed_fee_cents: 'Sofa bed fee',
  sofa_bed_stock: 'Sofa beds available',
  early_check_in_per_hour_cents: 'Early check-in rate',
  late_check_out_per_hour_cents: 'Late check-out rate',
  check_in_time: 'Check-in time',
  check_out_time: 'Check-out time',
  security_deposit_cents: 'Security deposit',
  max_advance_booking_days: 'Advance booking window',
  label: 'Name',
  name: 'Name',
  min_age: 'Starts at age',
  max_age_exclusive: 'Ends before age',
  price_cents: 'Price',
  included_in_day_pass: 'In the day pass',
  day_pass_capacity: 'Day-pass capacity',
  bank_name: 'Bank',
  account_number: 'Account number',
  lines: 'What it includes',
  months: 'Kept for',
}

const SETTINGS_UPDATES: Readonly<Record<string, string>> = {
  'unit_type.updated': 'Rate',
  'property.policy_updated': 'Booking policy',
  'day_pass_band.updated': 'Age band',
  'day_pass_bundle.updated': 'Family bundle',
  'facility.updated': 'Facility',
  'bank_account.updated': 'Bank account',
}

function describeSettings(event: AuditEventLike): string | null {
  if (event.action === 'document_retention.updated') {
    return retentionLabel(event)
  }

  const subject = SETTINGS_UPDATES[event.action]

  if (!subject) {
    return null
  }

  const changed = Object.keys(event.after ?? {})

  // One changed field reads as a sentence; more than one would be a paragraph,
  // so the count stands in and the payload holds the detail.
  const only = changed[0]

  if (changed.length === 1 && only) {
    const was = settingsValue(only, event.before?.[only])
    const now = settingsValue(only, event.after?.[only])

    return `${FIELD_LABELS[only] ?? only.replace(/_/g, ' ')} changed — ${was} → ${now}`
  }

  return changed.length === 0
    ? `${subject} updated`
    : `${subject} updated — ${changed.length} fields changed`
}

/**
 * The retention event is the one that keeps its subject on both sides: `kind`
 * is what the event is ABOUT rather than something that changed, so the diff
 * leaves it in place and the label reads it.
 */
function retentionLabel(event: AuditEventLike): string {
  const kind = event.after?.kind
  const noun =
    typeof kind === 'string' && isDocumentKind(kind) ? DOCUMENT_KIND_LABELS[kind] : 'Document'
  const was = event.before?.months
  const now = event.after?.months
  const moved = event.after?.documents_rescheduled

  const period =
    typeof was === 'number' && typeof now === 'number'
      ? ` — ${was} → ${now} months`
      : typeof now === 'number'
        ? ` — ${now} months`
        : ''

  const files =
    typeof moved === 'number' && moved > 0
      ? `, ${moved} ${moved === 1 ? 'file' : 'files'} re-dated`
      : ''

  return `${noun} retention changed${period}${files}`
}

/** A settings value as a person reads it: money as money, a blank as a blank. */
function settingsValue(key: string, value: unknown): string {
  if (value === null || value === undefined) {
    return 'not set'
  }

  if (typeof value === 'boolean') {
    return value ? 'yes' : 'no'
  }

  if (typeof value === 'number') {
    return key.endsWith('_cents') ? `BND ${formatCents(value)}` : String(value)
  }

  if (typeof value === 'string') {
    return value
  }

  // A composition, or anything else structured. The count is what a reader can
  // use; the payload holds the rest.
  return Array.isArray(value) ? `${value.length} entries` : 'changed'
}

// ── Where an event points ──────────────────────────────────────────────────

/**
 * The actor of an event nobody performed — retention expiry, the nightly jobs.
 *
 * Here rather than beside the trail reader in lib/db, because the filter row is
 * a client component: importing it from a module that also imports the
 * service-role client would pull that client into the browser bundle, which
 * lib/supabase/data.ts refuses at runtime and architecture.md §2 forbids.
 */
export const SYSTEM_ACTOR = 'system'

/** The kinds of record an event can be about, as the screen filters them. */
export const AUDIT_ENTITY_TYPES = [
  'booking',
  'payment',
  'deposit',
  'deposit_charge',
  'inspection',
  'document',
  'unit',
  'unit_type',
  'property',
  'document_retention',
  'day_pass_band',
  'day_pass_bundle',
  'facility',
  'bank_account',
  'staff_role',
  'staff_user',
  'cash_banking',
] as const

export type AuditEntityType = (typeof AUDIT_ENTITY_TYPES)[number]

export function isAuditEntityType(value: string): value is AuditEntityType {
  return (AUDIT_ENTITY_TYPES as readonly string[]).includes(value)
}

export const AUDIT_ENTITY_LABELS: Readonly<Record<AuditEntityType, string>> = {
  booking: 'Booking',
  payment: 'Payment',
  deposit: 'Deposit',
  deposit_charge: 'Charge',
  inspection: 'Inspection',
  document: 'Document',
  unit: 'Unit',
  unit_type: 'Unit type',
  property: 'Property',
  document_retention: 'Retention period',
  day_pass_band: 'Age band',
  day_pass_bundle: 'Family bundle',
  facility: 'Facility',
  bank_account: 'Bank account',
  staff_role: 'Role',
  staff_user: 'Staff account',
  cash_banking: 'Banking',
}

/**
 * The screen an event's subject lives on, or null where it has none.
 *
 * Returns a plain string rather than a typed `Route`: this module is pure
 * domain and knows nothing about Next, so the screen casts. That is the
 * arrangement `historyHref` already uses.
 *
 * The subject label doubles as the address for the three records addressed by
 * a human reference rather than by id — a booking, a deposit and a unit are all
 * `/portal/<thing>/<reference>` — which is why a deleted subject, whose label
 * resolves to null, correctly produces no link.
 */
export function auditSubjectHref(entityType: string, subjectLabel: string | null): string | null {
  if (!subjectLabel) {
    return null
  }

  switch (entityType) {
    case 'booking':
    case 'payment':
    case 'document':
      return `/portal/bookings/${subjectLabel}`
    case 'deposit':
    case 'deposit_charge':
    case 'inspection':
      return `/portal/deposits/${subjectLabel}`
    case 'unit':
      return `/portal/units/${subjectLabel}`
    case 'cash_banking':
      return `/portal/reports/cash-up/${subjectLabel}`
    case 'staff_role':
    case 'staff_user':
      return '/portal/settings/roles'
    // A settings event points at the tab that changed it, so "what did this
    // change" is one click rather than a hunt through four tabs.
    case 'unit_type':
    case 'property':
      return '/portal/settings/property?tab=pricing'
    case 'day_pass_band':
    case 'day_pass_bundle':
    case 'facility':
      return '/portal/settings/property?tab=day-pass'
    case 'document_retention':
      return '/portal/settings/property?tab=documents'
    case 'bank_account':
      return '/portal/settings/property?tab=bank-accounts'
    default:
      return null
  }
}
