import { NextResponse } from 'next/server'

import { buildBookingEmail, type BookingEmailKind } from '@/lib/domain/booking-email'
import { contact } from '@/lib/domain/contact'
import { line } from '@/lib/domain/lines'
import { renderBookingEmail } from '@/lib/email/render'

/**
 * The four emails, drawn in a browser (capability A8).
 *
 * It exists because **nothing sends**: Resend delivers only to the account
 * owner until a sending domain is verified and none is chosen, so without this
 * the only way to see what a guest receives would be to read the markup. An
 * email is a design surface and has to be looked at.
 *
 * **404 outside development**, which is the whole of its access control — it
 * is a route rather than a page so that check is one line and cannot be
 * reached by a link. It touches no database: every figure below is invented,
 * so it discloses nothing and works against an empty stack.
 *
 *   /api/dev/email-preview                     — the four, side by side
 *   /api/dev/email-preview?case=created-stay   — one, on its own
 *   /api/dev/email-preview?case=created-stay&format=text
 */
export const dynamic = 'force-dynamic'

type PreviewCase = 'created-stay' | 'created-day-pass' | 'confirmed-stay' | 'confirmed-day-pass'

const CASES: Readonly<Record<PreviewCase, string>> = {
  'created-stay': 'Booked a stay — how to pay',
  'created-day-pass': 'Booked a day pass — how to pay',
  'confirmed-stay': 'Stay confirmed — deposit held, stay owed',
  'confirmed-day-pass': 'Day pass confirmed',
}

export function GET(request: Request): NextResponse {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const url = new URL(request.url)
  const requested = url.searchParams.get('case')

  if (requested === null) {
    return html(index())
  }

  if (!isPreviewCase(requested)) {
    return NextResponse.json({ error: 'Unknown case', cases: Object.keys(CASES) }, { status: 400 })
  }

  const rendered = renderBookingEmail(modelFor(requested))

  return url.searchParams.get('format') === 'text'
    ? new NextResponse(rendered.text, {
        headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' },
      })
    : html(rendered.html)
}

function isPreviewCase(value: string): value is PreviewCase {
  return value in CASES
}

function html(body: string): NextResponse {
  return new NextResponse(body, {
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
  })
}

/** The four in one page, each in its own frame at a phone's width. */
function index(): string {
  const frames = Object.entries(CASES)
    .map(
      ([key, label]) =>
        `<figure style="margin:0">
           <figcaption style="font:500 12px/16px system-ui;letter-spacing:.05em;text-transform:uppercase;color:#6b6b6b;padding-bottom:8px">
             ${label} · <a href="/api/dev/email-preview?case=${key}" style="color:#0e6b64">full</a>
             · <a href="/api/dev/email-preview?case=${key}&format=text" style="color:#0e6b64">text</a>
           </figcaption>
           <iframe src="/api/dev/email-preview?case=${key}" title="${label}"
             style="width:420px;height:900px;border:1px solid #e8e8e8;border-radius:12px;background:#fff"></iframe>
         </figure>`,
    )
    .join('')

  return `<!doctype html><meta charset="utf-8"><title>Booking emails — preview</title>
    <body style="margin:0;padding:24px;background:#f3f3f3;font:14px/21px system-ui">
      <h1 style="font:600 22px/28px system-ui;margin:0 0 4px 0">Booking emails</h1>
      <p style="margin:0 0 20px 0;color:#6b6b6b">Development only. Every figure is invented.</p>
      <div style="display:flex;gap:20px;flex-wrap:wrap;align-items:flex-start">${frames}</div>
    </body>`
}

function modelFor(preview: PreviewCase) {
  const isDayPass = preview.endsWith('day-pass')
  const kind: BookingEmailKind = preview.startsWith('created')
    ? 'booking_created'
    : 'booking_confirmed'

  const built = buildBookingEmail({
    kind,
    booking: {
      reference: isDayPass ? 'PV-4822' : 'PV-4821',
      stream: isDayPass ? 'day_pass' : 'short_stay',
      status: kind === 'booking_created' ? 'held' : 'confirmed',
      guestName: 'Amin Hassan',
      guestEmail: 'amin@example.com',
      accessToken: 'Ab3xY9-_ZqRs7TuVwX2Kd0',
      vehicles: ['BAA 1234'],
      noVehicle: false,
      chargeableGuests: isDayPass ? 3 : 4,
      exemptGuests: isDayPass ? 0 : 1,
      stay: isDayPass
        ? null
        : { unitTypeId: 'three-bedroom', range: { start: '2026-09-14', end: '2026-09-16' } },
      dayPass: isDayPass ? { date: '2026-09-20', headcount: 3 } : null,
      lines: isDayPass
        ? [line('day_pass_bundle', 'Family bundle — 2 adults, 1 child', 1, 2_000)]
        : [
            line('accommodation', '2 nights at BND 200.00', 2, 20_000),
            line('extra_person', 'Extra person — 1 guest, 2 nights', 2, 700),
          ],
      total: isDayPass ? 2_000 : 41_400,
      // A deposit-secured booking: confirmed, and the stay still owed in full.
      paid: 0,
      securityDeposit: isDayPass ? 0 : 10_000,
    },
    property: {
      name: 'Palm Villa',
      checkInTime: '14:00',
      checkOutTime: '12:00',
      bankAccounts: [
        { id: 'a', bankName: 'BIBD', accountNumber: '0011223344', sortOrder: 1 },
        { id: 'b', bankName: 'Baiduri', accountNumber: '5566778899', sortOrder: 2 },
      ],
      unitTypeName: 'Three-bedroom apartment',
    },
    contact,
    bookingUrl: 'https://palmvilla.bn/booking/Ab3xY9-_ZqRs7TuVwX2Kd0',
  })

  if (!built.ok) {
    throw new Error(`The preview fixture was refused: ${built.reason}`)
  }

  return built.model
}
