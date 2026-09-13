import { centsToDecimal, type Cents } from '@/lib/domain/money'
import type { CsvValue } from '@/lib/domain/csv'
import { isSiteImageSlot, slotLabel } from '@/lib/domain/site-image'
import { dataClient } from '@/lib/supabase/data'

import { currentPropertyId } from './property'
import { readAllRows } from './rows'
import { readPropertySettings } from './settings'
import { listStaff } from './staff'

/**
 * Every table the business runs on, as CSV (capability F5).
 *
 * scope-of-capabilities.md F5 is "export all business data at any time in a
 * usable format — the data is yours", and prd.md §19 makes it an ownership
 * promise rather than a feature: the client owns their data outright, with an
 * export right. So this is deliberately the whole of it, table by table, rather
 * than a report — the reports screen already exports what it shows (E5), and
 * that is a different thing entirely.
 *
 * ── Usable means a spreadsheet ─────────────────────────────────────────────
 *
 * One file per table rather than one file of everything: an accountant opens a
 * spreadsheet, and a single archive of eighteen tables is a developer's
 * convenience. Money goes out as bare decimals with the currency in the column
 * header, because a cell reading `BND 2,360.00` is text a spreadsheet cannot
 * sum. Booleans are yes/no for the same reason a person reads them.
 *
 * ── Documents are metadata, never bytes ────────────────────────────────────
 *
 * A document row exports what is known ABOUT the file — kind, size, who
 * uploaded it, when it stops being kept — and never the file, never its storage
 * key, and **never an identity document's filename**: architecture.md §8.1
 * counts that filename as content, and a CSV is not permission-gated the way
 * the document route is. The files themselves stay behind their permissions and
 * their retention clocks, which is what G2 and G4 promise.
 *
 * ── The 1000-row cap ───────────────────────────────────────────────────────
 *
 * PostgREST is configured with `max_rows = 1000` (supabase/config.toml), and it
 * TRUNCATES rather than failing. An export that silently stopped at a thousand
 * bookings would be worse than one that refused, so every read here is chunked
 * and the loop is what the test proves.
 *
 * That loop now lives in ./rows.ts. It was written here and it was needed in
 * five more places — `listPayments` alone had six callers reading past the
 * ceiling, the revenue report and the daily cash-up among them.
 */

export interface CsvDocument {
  headers: readonly string[]
  rows: readonly (readonly CsvValue[])[]
}

export interface ExportTable {
  id: string
  label: string
  /** What the table holds, in a sentence, for the screen that lists it. */
  description: string
  count: () => Promise<number>
  document: () => Promise<CsvDocument>
}

async function countOf(table: string): Promise<number> {
  const propertyId = await currentPropertyId()

  const { count, error } = await dataClient()
    .from(table)
    .select('*', { count: 'exact', head: true })
    .eq('property_id', propertyId)

  if (error) {
    throw new Error(`Could not count ${table}: ${error.message}`)
  }

  return count ?? 0
}

/** Reads a whole table for the property, ordered so two exports agree. */
async function allOf<T>(table: string, columns: string, orderBy: string): Promise<T[]> {
  const propertyId = await currentPropertyId()

  return readAllRows<T>((from, to) =>
    dataClient()
      .from(table)
      .select(columns)
      .eq('property_id', propertyId)
      .order(orderBy, { ascending: true })
      .order('id', { ascending: true })
      .range(from, to),
  )
}

// ── Cell helpers ───────────────────────────────────────────────────────────

/** Money as a bare decimal. The currency belongs in the column header. */
function money(amount: Cents | null | undefined): CsvValue {
  return amount === null || amount === undefined ? '' : Number(centsToDecimal(amount))
}

function yesNo(value: boolean | null | undefined): CsvValue {
  return value === null || value === undefined ? '' : value ? 'yes' : 'no'
}

function text(value: unknown): CsvValue {
  return typeof value === 'string'
    ? value
    : value === null || value === undefined
      ? ''
      : String(value)
}

/** A nested object or array, as JSON. Text, so the formula guard applies. */
function json(value: unknown): CsvValue {
  return value === null || value === undefined ? '' : JSON.stringify(value)
}

// ── The tables ─────────────────────────────────────────────────────────────

interface BookingRow {
  reference: string
  status: string
  stream: string
  guest_name: string
  guest_phone: string
  unit_ref: string | null
  unit_type_slug: string | null
  check_in: string | null
  check_out: string | null
  chargeable_guests: number
  exempt_guests: number
  total_cents: number
  paid_cents: number | null
  security_deposit_cents: number
  deposit_waiver_reason: string | null
  discount_kind: string | null
  discount_value: number | null
  discount_reason: string | null
  no_vehicle: boolean
  vehicles: unknown
  created_at: string
  updated_at: string
}

const bookings: ExportTable = {
  id: 'bookings',
  label: 'Bookings',
  description: 'Every booking with its guest, unit, dates, total and what has been paid.',
  count: () => countOf('booking'),
  document: async () => {
    const rows = await allOf<BookingRow>(
      'booking_summary',
      'id, reference, status, stream, guest_name, guest_phone, unit_ref, unit_type_slug, check_in, check_out, chargeable_guests, exempt_guests, total_cents, paid_cents, security_deposit_cents, deposit_waiver_reason, discount_kind, discount_value, discount_reason, no_vehicle, vehicles, created_at, updated_at',
      'created_at',
    )

    return {
      headers: [
        'Reference',
        'Status',
        'Stream',
        'Guest',
        'Phone',
        'Unit',
        'Unit type',
        'Check in',
        'Check out',
        'Guests charged',
        'Guests exempt',
        'Total (BND)',
        'Paid (BND)',
        'Security deposit (BND)',
        'Deposit waiver reason',
        'Discount kind',
        'Discount value',
        'Discount reason',
        'No vehicle',
        'Vehicles',
        'Created',
        'Updated',
      ],
      rows: rows.map((row) => [
        row.reference,
        row.status,
        row.stream,
        row.guest_name,
        row.guest_phone,
        text(row.unit_ref),
        text(row.unit_type_slug),
        text(row.check_in),
        text(row.check_out),
        row.chargeable_guests,
        row.exempt_guests,
        money(row.total_cents),
        money(row.paid_cents),
        money(row.security_deposit_cents),
        text(row.deposit_waiver_reason),
        text(row.discount_kind),
        row.discount_value ?? '',
        text(row.discount_reason),
        yesNo(row.no_vehicle),
        json(row.vehicles),
        row.created_at,
        row.updated_at,
      ]),
    }
  },
}

interface LineRow {
  line_type: string
  description: string
  quantity: number
  unit_price_cents: number
  amount_cents: number
  booking: { reference: string } | null
}

const bookingLines: ExportTable = {
  id: 'booking-lines',
  label: 'Booking lines',
  description: 'The itemised price behind every booking — the lines that sum to its total.',
  count: () => countOf('booking_line'),
  document: async () => {
    const rows = await allOf<LineRow>(
      'booking_line',
      'id, line_type, description, quantity, unit_price_cents, amount_cents, booking(reference)',
      'sort_order',
    )

    return {
      headers: ['Booking', 'Kind', 'Description', 'Quantity', 'Unit price (BND)', 'Amount (BND)'],
      rows: rows.map((row) => [
        text(row.booking?.reference),
        row.line_type,
        row.description,
        row.quantity,
        money(row.unit_price_cents),
        money(row.amount_cents),
      ]),
    }
  },
}

interface VehicleRow {
  registration: string
  created_at: string
  booking: { reference: string } | null
}

const bookingVehicles: ExportTable = {
  id: 'booking-vehicles',
  label: 'Vehicles',
  description: 'The registrations recorded against each booking, for the gate.',
  count: () => countOf('booking_vehicle'),
  document: async () => {
    const rows = await allOf<VehicleRow>(
      'booking_vehicle',
      'id, registration, created_at, booking(reference)',
      'created_at',
    )

    return {
      headers: ['Booking', 'Registration', 'Recorded'],
      rows: rows.map((row) => [text(row.booking?.reference), row.registration, row.created_at]),
    }
  },
}

interface NoteRow {
  audience: string
  body: string
  author_id: string | null
  created_at: string
  booking: { reference: string } | null
}

const bookingNotes: ExportTable = {
  id: 'booking-notes',
  label: 'Booking notes',
  description: 'What staff wrote against a booking, and who wrote it.',
  count: () => countOf('booking_note'),
  document: async () => {
    const rows = await allOf<NoteRow>(
      'booking_note',
      'id, audience, body, author_id, created_at, booking(reference)',
      'created_at',
    )

    return {
      headers: ['Booking', 'Audience', 'Note', 'Author id', 'Written'],
      rows: rows.map((row) => [
        text(row.booking?.reference),
        row.audience,
        row.body,
        text(row.author_id),
        row.created_at,
      ]),
    }
  },
}

interface GuestRow {
  name: string
  phone: string
  email: string | null
  created_at: string
}

const guests: ExportTable = {
  id: 'guests',
  label: 'Guests',
  description: 'Everyone who has stayed, with the contact details they gave.',
  count: () => countOf('guest'),
  document: async () => {
    const rows = await allOf<GuestRow>('guest', 'id, name, phone, email, created_at', 'created_at')

    return {
      headers: ['Name', 'Phone', 'Email', 'First recorded'],
      rows: rows.map((row) => [row.name, row.phone, text(row.email), row.created_at]),
    }
  },
}

interface PaymentRow {
  booking_reference: string
  method: string
  status: string
  expected_amount_cents: number
  amount_cents: number | null
  observed_reference: string | null
  observed_sender: string | null
  observed_on: string | null
  match_kind: string | null
  amount_override_reason: string | null
  match_reason: string | null
  collected_at: string | null
  verified_at: string | null
  created_at: string
}

const payments: ExportTable = {
  id: 'payments',
  label: 'Payments',
  description: 'Every payment raised or taken, what was expected, and what arrived.',
  count: () => countOf('payment'),
  document: async () => {
    const rows = await allOf<PaymentRow>(
      'payment_summary',
      'id, booking_reference, method, status, expected_amount_cents, amount_cents, observed_reference, observed_sender, observed_on, match_kind, amount_override_reason, match_reason, collected_at, verified_at, created_at',
      'created_at',
    )

    return {
      headers: [
        'Booking',
        'Method',
        'Status',
        'Expected (BND)',
        'Received (BND)',
        'Reference seen',
        'Sender seen',
        'Seen on',
        'Matched',
        'Override reason',
        'Match reason',
        'Collected',
        'Verified',
        'Raised',
      ],
      rows: rows.map((row) => [
        row.booking_reference,
        row.method,
        row.status,
        money(row.expected_amount_cents),
        money(row.amount_cents),
        text(row.observed_reference),
        text(row.observed_sender),
        text(row.observed_on),
        text(row.match_kind),
        text(row.amount_override_reason),
        text(row.match_reason),
        text(row.collected_at),
        text(row.verified_at),
        row.created_at,
      ]),
    }
  },
}

interface DepositRow {
  booking_reference: string
  unit_ref: string | null
  amount_cents: number
  method: string
  collected_at: string | null
  inspection_outcome: string | null
  inspected_at: string | null
  charges_total_cents: number
  approved_charges_total_cents: number | null
  released_at: string | null
  released_amount_cents: number | null
  release_note: string | null
  owed_cents: number | null
  owed_settled_at: string | null
  owed_settled_method: string | null
  forfeited_at: string | null
  forfeited_amount_cents: number | null
}

const deposits: ExportTable = {
  id: 'deposits',
  label: 'Deposits',
  description:
    'What was held per booking, what was charged against it, and what was returned or kept.',
  count: () => countOf('deposit'),
  document: async () => {
    const rows = await allOf<DepositRow>(
      'deposit_summary',
      'id, booking_reference, unit_ref, amount_cents, method, collected_at, inspection_outcome, inspected_at, charges_total_cents, approved_charges_total_cents, released_at, released_amount_cents, release_note, owed_cents, owed_settled_at, owed_settled_method, forfeited_at, forfeited_amount_cents',
      'collected_at',
    )

    return {
      headers: [
        'Booking',
        'Unit',
        'Held (BND)',
        'Taken as',
        'Collected',
        'Inspection',
        'Inspected',
        'Charges (BND)',
        'Approved charges (BND)',
        'Released',
        'Returned (BND)',
        'Release note',
        'Owed (BND)',
        'Owed settled',
        'Owed settled as',
        'Kept',
        'Kept (BND)',
      ],
      rows: rows.map((row) => [
        row.booking_reference,
        text(row.unit_ref),
        money(row.amount_cents),
        row.method,
        text(row.collected_at),
        text(row.inspection_outcome),
        text(row.inspected_at),
        money(row.charges_total_cents),
        money(row.approved_charges_total_cents),
        text(row.released_at),
        money(row.released_amount_cents),
        text(row.release_note),
        money(row.owed_cents),
        text(row.owed_settled_at),
        text(row.owed_settled_method),
        text(row.forfeited_at),
        money(row.forfeited_amount_cents),
      ]),
    }
  },
}

interface ChargeRow {
  amount_cents: number
  reason: string
  created_at: string
  waived_at: string | null
  waive_reason: string | null
  deposit: { booking: { reference: string } | null } | null
}

const depositCharges: ExportTable = {
  id: 'deposit-charges',
  label: 'Charges',
  description: 'Every charge raised against a deposit, and every one waived.',
  count: () => countOf('deposit_charge'),
  document: async () => {
    const rows = await allOf<ChargeRow>(
      'deposit_charge',
      'id, amount_cents, reason, created_at, waived_at, waive_reason, deposit(booking(reference))',
      'created_at',
    )

    return {
      headers: ['Booking', 'Amount (BND)', 'Reason', 'Raised', 'Waived', 'Waive reason'],
      rows: rows.map((row) => [
        text(row.deposit?.booking?.reference),
        money(row.amount_cents),
        row.reason,
        row.created_at,
        text(row.waived_at),
        text(row.waive_reason),
      ]),
    }
  },
}

interface InspectionRow {
  outcome: string
  notes: string | null
  inspected_at: string
  occupancy: { unit: { ref: string } | null; booking: { reference: string } | null } | null
}

const inspections: ExportTable = {
  id: 'inspections',
  label: 'Inspections',
  description: 'What each unit looked like after a stay, and when it was checked.',
  count: () => countOf('inspection'),
  document: async () => {
    const rows = await allOf<InspectionRow>(
      'inspection',
      'id, outcome, notes, inspected_at, occupancy(unit(ref), booking(reference))',
      'inspected_at',
    )

    return {
      headers: ['Booking', 'Unit', 'Outcome', 'Notes', 'Inspected'],
      rows: rows.map((row) => [
        text(row.occupancy?.booking?.reference),
        text(row.occupancy?.unit?.ref),
        row.outcome,
        text(row.notes),
        row.inspected_at,
      ]),
    }
  },
}

interface DocumentRow {
  kind: string
  original_filename: string
  mime_type: string
  byte_size: number
  uploaded_by: string | null
  uploaded_at: string
  retain_until: string
  deleted_at: string | null
  deleted_reason: string | null
  purged_at: string | null
  booking: { reference: string } | null
}

const documents: ExportTable = {
  id: 'documents',
  label: 'Documents',
  description:
    'What files exist and what is known about them — never the files themselves, and never an identity document’s filename.',
  count: () => countOf('document'),
  document: async () => {
    const rows = await allOf<DocumentRow>(
      'document',
      'id, kind, original_filename, mime_type, byte_size, uploaded_by, uploaded_at, retain_until, deleted_at, deleted_reason, purged_at, booking(reference)',
      'uploaded_at',
    )

    return {
      headers: [
        'Booking',
        'Kind',
        'Filename',
        'Type',
        'Bytes',
        'Uploaded by',
        'Uploaded',
        'Kept until',
        'Deleted',
        'Deleted because',
        'File destroyed',
      ],
      rows: rows.map((row) => [
        text(row.booking?.reference),
        row.kind,
        // architecture.md §8.1 counts an identity document's filename as
        // content — it routinely carries the guest's name and IC number — and a
        // CSV is not gated the way the document route is.
        row.kind === 'identity' ? '' : row.original_filename,
        row.mime_type,
        row.byte_size,
        text(row.uploaded_by),
        row.uploaded_at,
        row.retain_until,
        text(row.deleted_at),
        text(row.deleted_reason),
        text(row.purged_at),
      ]),
    }
  },
}

interface UnitRow {
  ref: string
  out_of_service_since: string | null
  out_of_service_reason: string | null
  notes: string | null
  created_at: string
  unit_type: { slug: string; name: string } | null
}

const units: ExportTable = {
  id: 'units',
  label: 'Units',
  description: 'Every door in the building, its type, and any note against it.',
  count: () => countOf('unit'),
  document: async () => {
    const rows = await allOf<UnitRow>(
      'unit',
      'id, ref, out_of_service_since, out_of_service_reason, notes, created_at, unit_type(slug, name)',
      'ref',
    )

    return {
      headers: [
        'Reference',
        'Type',
        'Out of service since',
        'Out of service reason',
        'Note',
        'Added',
      ],
      rows: rows.map((row) => [
        row.ref,
        text(row.unit_type?.name),
        text(row.out_of_service_since),
        text(row.out_of_service_reason),
        text(row.notes),
        row.created_at,
      ]),
    }
  },
}

interface OccupancyRow {
  occupancy_type: string
  status: string
  start_date: string
  end_date: string | null
  occupant_name: string | null
  unit: { ref: string } | null
  booking: { reference: string } | null
}

const occupancies: ExportTable = {
  id: 'occupancies',
  label: 'Occupancy',
  description: 'Which unit was occupied when — stays and long leases alike.',
  count: () => countOf('occupancy'),
  document: async () => {
    const rows = await allOf<OccupancyRow>(
      'occupancy',
      'id, occupancy_type, status, start_date, end_date, occupant_name, unit(ref), booking(reference)',
      'start_date',
    )

    return {
      headers: ['Unit', 'Kind', 'Status', 'From', 'To', 'Booking', 'Occupant'],
      rows: rows.map((row) => [
        text(row.unit?.ref),
        row.occupancy_type,
        row.status,
        row.start_date,
        // A month-to-month tenancy has no agreed last day (N19).
        text(row.end_date),
        text(row.booking?.reference),
        text(row.occupant_name),
      ]),
    }
  },
}

interface BankingRow {
  business_date: string
  amount_cents: number
  note: string | null
  banked_by: string | null
  banked_at: string
}

const cashBankings: ExportTable = {
  id: 'cash-bankings',
  label: 'Cash banked',
  description: 'Every trip to the bank: the day the cash was taken, and how much went in.',
  count: () => countOf('cash_banking'),
  document: async () => {
    const rows = await allOf<BankingRow>(
      'cash_banking',
      'id, business_date, amount_cents, note, banked_by, banked_at',
      'business_date',
    )

    return {
      headers: ['Cash taken on', 'Amount (BND)', 'Note', 'Recorded by', 'Recorded at'],
      rows: rows.map((row) => [
        row.business_date,
        money(row.amount_cents),
        text(row.note),
        text(row.banked_by),
        row.banked_at,
      ]),
    }
  },
}

const staffAccounts: ExportTable = {
  id: 'staff',
  label: 'Staff',
  description: 'Who has an account, what they are called, and which roles they hold.',
  count: async () => (await listStaff()).length,
  document: async () => {
    const staff = await listStaff()

    return {
      headers: ['Name', 'Email', 'Disabled', 'Roles'],
      rows: staff.map((account) => [
        account.displayName,
        account.email,
        yesNo(account.disabled),
        account.roles.map((role) => role.name).join('; '),
      ]),
    }
  },
}

interface RolePermissionRow {
  permission: string
  staff_role: { slug: string; name: string } | null
}

const rolePermissions: ExportTable = {
  id: 'role-permissions',
  label: 'Roles',
  description: 'What each role is allowed to do.',
  count: () => countOf('role_permission'),
  document: async () => {
    const propertyId = await currentPropertyId()
    const rows = await readAllRows<RolePermissionRow>((from, to) =>
      dataClient()
        .from('role_permission')
        .select('permission, staff_role(slug, name)')
        .eq('property_id', propertyId)
        .order('role_id', { ascending: true })
        .order('permission', { ascending: true })
        .range(from, to),
    )

    return {
      headers: ['Role', 'Permission'],
      rows: rows.map((row) => [text(row.staff_role?.name), row.permission]),
    }
  },
}

interface AuditRow {
  at: string
  actor_id: string | null
  action: string
  entity_type: string
  entity_id: string
  subject_label: string | null
  before: unknown
  after: unknown
}

const auditEvents: ExportTable = {
  id: 'audit-events',
  label: 'Audit log',
  description: 'Every recorded change, with who made it and when. Append-only.',
  count: () => countOf('audit_event'),
  document: async () => {
    const propertyId = await currentPropertyId()
    const rows = await readAllRows<AuditRow>((from, to) =>
      dataClient()
        .from('audit_event_summary')
        .select('at, actor_id, action, entity_type, entity_id, subject_label, before, after')
        .eq('property_id', propertyId)
        .order('at', { ascending: true })
        .order('id', { ascending: true })
        .range(from, to),
    )

    return {
      headers: [
        'When',
        'Actor id',
        'Action',
        'Record type',
        'Record id',
        'Record',
        'Before',
        'After',
      ],
      rows: rows.map((row) => [
        row.at,
        text(row.actor_id),
        row.action,
        row.entity_type,
        row.entity_id,
        text(row.subject_label),
        json(row.before),
        json(row.after),
      ]),
    }
  },
}

/**
 * The settings as they stand, one row per figure.
 *
 * Long format rather than one wide row, because the settings are not a table —
 * they are a page of unrelated figures, and a spreadsheet of eighty columns
 * with one row in it is not a thing anybody reads.
 */
const settings: ExportTable = {
  id: 'settings',
  label: 'Settings',
  description: 'Every rate, price, period and account the property is configured with.',
  count: async () => {
    const current = await readPropertySettings()

    return (
      11 +
      current.unitTypes.length * 3 +
      current.bands.length +
      current.bundles.length +
      current.facilities.length +
      current.retention.length +
      current.bankAccounts.length
    )
  },
  document: async () => {
    const current = await readPropertySettings()
    const rows: (readonly CsvValue[])[] = []

    for (const [key, value] of Object.entries(current.policy)) {
      rows.push(['Policy', key.replace(/([A-Z])/g, ' $1').toLowerCase(), text(value)])
    }

    for (const unitType of current.unitTypes) {
      rows.push(['Rates', `${unitType.name} — per night (BND)`, money(unitType.baseRateCents)])
      rows.push(['Rates', `${unitType.name} — maximum guests`, unitType.maxPax])
      rows.push(['Rates', `${unitType.name} — car parks`, unitType.carParks])
    }

    for (const band of current.bands) {
      rows.push([
        'Day pass',
        `${band.label} (${band.minAge}–${band.maxAgeExclusive ?? 'and above'}) (BND)`,
        money(band.priceCents),
      ])
    }

    for (const bundle of current.bundles) {
      rows.push(['Day pass bundles', `${bundle.label} (BND)`, money(bundle.priceCents)])
    }

    for (const facility of current.facilities) {
      rows.push([
        'Facilities',
        facility.name,
        facility.includedInDayPass ? 'in the day pass' : 'not in the day pass',
      ])
    }

    for (const period of current.retention) {
      rows.push(['Document retention', `${period.kind} (months)`, period.months])
    }

    for (const account of current.bankAccounts) {
      rows.push(['Bank accounts', account.bankName, account.accountNumber])
    }

    return { headers: ['Section', 'Setting', 'Value'], rows }
  },
}

interface SiteImageExportRow {
  slot: string | null
  alt_text: string
  focus: string
  mime_type: string
  byte_size: number
  uploaded_by: string
  uploaded_at: string
  retired_at: string | null
  retired_reason: string | null
  purged_at: string | null
  unit_type: { name: string } | null
  facility: { name: string } | null
}

/**
 * Every photograph the site has shown (capability F7), current and retired.
 *
 * What is known about each — where it appeared, how it was described, who put
 * it up and when it came down — and never its storage key or public address,
 * for the reason documents give: the export is the records, not a way to the
 * files.
 */
const websitePhotos: ExportTable = {
  id: 'website-photos',
  label: 'Website photos',
  description:
    'Every photograph the public site has shown, where it appeared, and when it was replaced or taken down.',
  count: () => countOf('site_image'),
  document: async () => {
    const rows = await allOf<SiteImageExportRow>(
      'site_image',
      'slot, alt_text, focus, mime_type, byte_size, uploaded_by, uploaded_at, retired_at, retired_reason, purged_at, unit_type(name), facility(name)',
      'uploaded_at',
    )

    return {
      headers: [
        'Where',
        'Description',
        'Keep in view',
        'Type',
        'Bytes',
        'Uploaded by',
        'Uploaded',
        'Taken down',
        'Taken down because',
        'File destroyed',
      ],
      rows: rows.map((row) => [
        placeName(row),
        row.alt_text,
        row.focus,
        row.mime_type,
        row.byte_size,
        row.uploaded_by,
        row.uploaded_at,
        text(row.retired_at),
        text(row.retired_reason),
        text(row.purged_at),
      ]),
    }
  },
}

/** A photograph's place in words: the unit type or facility, else the slot. */
function placeName(row: SiteImageExportRow): string {
  if (row.unit_type) {
    return row.unit_type.name
  }

  if (row.facility) {
    return row.facility.name
  }

  return row.slot !== null && isSiteImageSlot(row.slot) ? slotLabel(row.slot) : ''
}

export const EXPORT_TABLES: readonly ExportTable[] = [
  bookings,
  bookingLines,
  bookingVehicles,
  bookingNotes,
  guests,
  payments,
  deposits,
  depositCharges,
  inspections,
  documents,
  units,
  occupancies,
  cashBankings,
  staffAccounts,
  rolePermissions,
  auditEvents,
  settings,
  websitePhotos,
]

export function exportTableById(id: string): ExportTable | undefined {
  return EXPORT_TABLES.find((table) => table.id === id)
}

/**
 * Which screen each table is taken from (capability F5).
 *
 * There is no *Export data* screen. A list of seventeen table names in Admin
 * is a schema browser, and the person who wants the bookings as a spreadsheet
 * is already looking at the bookings — so every table is downloaded from the
 * screen whose records it holds, and a screen with satellites offers them
 * together: the register hands over its lines, vehicles, notes, guests and
 * documents alongside the bookings themselves.
 *
 * **Every table is in exactly one group**, which is the whole of F5 —
 * "export all business data" is a promise about coverage, and coverage is
 * exactly what is lost when the single screen listing everything goes away.
 * `export.test.ts` holds it: a new table with no home fails the suite rather
 * than quietly becoming unexportable.
 *
 * The gate does not move with the placement. Every one of these is still
 * `config.manage` (architecture.md §3, open question N34), so a front-desk
 * account sees no download on the register — the route answers 404 either way.
 */
export const EXPORT_GROUPS = {
  /** The register, and everything hanging off a booking. */
  bookings: [
    'bookings',
    'booking-lines',
    'booking-vehicles',
    'booking-notes',
    'guests',
    'documents',
  ],
  /** The verification queue. */
  payments: ['payments'],
  /** The deposits ledger, and what was charged against what it held. */
  deposits: ['deposits', 'deposit-charges'],
  /** The units board: the doors, who was in them, and how they came back. */
  units: ['units', 'occupancies', 'inspections'],
  /** Roles & staff. */
  staff: ['staff', 'role-permissions'],
  /** The audit log reading itself out. */
  audit: ['audit-events'],
  /** Property settings — every rate, price, period and account. */
  settings: ['settings'],
  /** The daily cash-up, where the trips to the bank are recorded. */
  cash: ['cash-bankings'],
  /** Website photos, downloaded beside the photographs themselves. */
  website: ['website-photos'],
} as const satisfies Record<string, readonly string[]>

export type ExportGroupName = keyof typeof EXPORT_GROUPS

/** What a screen names its table in a menu: the id to fetch, and the label. */
export interface ExportTableRef {
  id: string
  label: string
}

/**
 * One screen's tables, in the order they are listed.
 *
 * Resolved through `EXPORT_TABLES` rather than restating the labels, so a
 * table renamed in one place is renamed in the menu too.
 */
export function exportGroup(name: ExportGroupName): readonly ExportTableRef[] {
  return EXPORT_GROUPS[name].map((id) => {
    const table = exportTableById(id)

    if (!table) {
      // Unreachable while the ids above are drawn from EXPORT_TABLES, which the
      // test proves. Loud rather than a menu item that downloads nothing.
      throw new Error(`No export table with id ${id}`)
    }

    return { id: table.id, label: table.label }
  })
}
