# Palm Villa Platform — Architecture

| | |
|---|---|
| **Version** | 0.1 (draft) |
| **Date** | 18 August 2026 |
| **Status** | Normative for all engineering decisions |
| **Related** | `prd.md` (product requirements, business rules) · `design.md` (design system, normative for tokens) |

**Document boundaries.** `prd.md` owns business rules, pricing, flows and open questions. This document owns how the system is built: stack, structure, data, security, and operational concerns. Where the PRD sketches technical shape (entity list, lifecycle, non-functionals), this document is the authoritative version. `design.md` owns visual tokens and components.

---

## 1. Stack

| Layer | Choice | Rationale |
|---|---|---|
| Framework | **Next.js (App Router), single app** | One codebase serves all three surfaces via route groups. Matches the developer's existing projects, which matters for a solo build at ~20 h/week. |
| Hosting | **Vercel** (personal account) | Zero-ops deployment, preview deployments per PR. |
| Database / Auth / Storage | **Supabase** (personal account), region **`ap-southeast-1` (Singapore)** | Postgres with the constraints this domain needs; closest region to Brunei; keeps personal data in-region, the defensible position under Brunei's PDPO. |
| Styling | **Tailwind CSS + shadcn/ui**, themed from `design.md` tokens | Known toolchain; shadcn components re-skinned via CSS variables. |
| Email | **Resend** | Transactional confirmations and QR delivery. Assumed; swappable. |
| QR generation | **`qrcode`** (npm), server-side | Produces a PNG at confirmation time for email attachment and WhatsApp forwarding. |
| PDF generation | **`pdf-lib`** | Accounting pack assembly server-side. |
| Payments | **None in v1** | Bank transfer + manual verification per PRD §10. A `PaymentProvider` interface isolates this so a gateway can be added without touching booking logic. |
| Validation | **Zod** | Server actions receive untyped `FormData` from a browser. An authenticated staff member is trusted; the request is not. One schema per action, parsed before anything reaches `lib/domain`. Added 2026-08-27 with the walk-in booking form. |
| Testing | **Vitest** (dev) | §2 makes coverage mandatory for the pricing engine and state machine, which needs a runner. Node's built-in `node:test` was the zero-dependency alternative but needs stable TS stripping the `engines` floor of Node 20.9 lacks, so it would have pulled in `tsx` regardless. Added 2026-08-27. |

**Explicitly not used:** no monorepo (route groups are sufficient at this scale), no separate API service, no native apps, no client-side direct database access, no form-state library (React 19 `useActionState` plus a server action covers the forms in scope), no date-picker library (see `design.md` — no calendar component is specified yet).

### 1.1 Ownership boundary

This platform is personal IP, built and hosted entirely on personal accounts: personal GitHub repository, personal Vercel, personal Supabase. **No employer (Go10) infrastructure, organisations, accounts, or code may be used or referenced.** No code is copied from employer repositories. This boundary exists to keep the ownership position clean and must not be crossed for convenience.

---

## 2. Application structure

```
app/
  (public)/          # Customer-facing: availability, booking, payment, FAQ, lookup
  (portal)/          # Staff desktop: calendar, bookings, payment queue, config, reports
  (field)/           # Mobile web: security check-in, housekeeping checkout
  c/[token]/         # QR landing route (public entry, role-aware rendering)
  api/               # Route handlers only where a server action doesn't fit
lib/
  db/                # Query layer; all database access lives here
  domain/            # Pricing engine, booking state machine, availability
  payments/          # PaymentProvider interface + manual-transfer implementation
  auth/              # Session, role and permission helpers
components/
  ui/                # shadcn primitives, themed per design.md
  ...
supabase/
  migrations/        # SQL migrations, committed, applied via Supabase CLI
```

**Rendering and data rules:**

- All database access is **server-side** (server components, server actions, route handlers). The browser never holds a Supabase client with data access.
- Mutations are server actions. Every mutation passes through the permission check helper before touching `lib/db`.
- The pricing engine and booking state machine are **pure functions** in `lib/domain`, unit-testable without a database. These two modules carry most of the correctness risk in the product and are the only parts where test coverage is treated as mandatory rather than pragmatic.

---

## 3. Authentication and sessions

### Staff
Supabase Auth, email + password. Staff accounts are created by an Admin; there is no self-registration. Sessions are httpOnly cookies via `@supabase/ssr`. The `(portal)` and `(field)` route groups are gated in middleware; render is additionally gated per-permission server-side.

### Customers
**No accounts.** Guest checkout only (PRD decision). Post-booking access is via:

1. **Booking lookup**: reference + phone number, on the public site.
2. **Magic link**: each confirmation email contains a signed URL to the booking summary.
3. **QR token**: see §7.

### Field staff
Same Supabase Auth. The `(field)` surface is a filtered, large-touch-target view determined by role, not a separate auth system.

---

## 4. Authorisation

Three tables: `roles`, `role_permissions`, `user_roles`. Users hold **one or more roles**; effective permissions are the union. Permission strings are the atomic unit (see PRD §4 for the canonical set and the five predefined roles). Roles are data, not code: editing a role's permission set is an Admin UI operation.

**Enforcement is in the server layer** (a `requirePermission(session, 'deposit.approve_release')` helper called at the top of every server action). Postgres RLS is enabled on all tables as defence in depth, but the application does not rely on RLS for business-level authorisation, because permission logic (e.g. "approve is only available once inspection is recorded") is richer than row filters.

**Approvals are events, not flags.** Any action carrying an approval semantic (deposit release, charge waiver, manual payment match) writes an `audit_event` row with actor, action, entity, before/after, timestamp. The audit table is append-only; no update or delete grants exist on it.

---

## 5. Data model

The PRD's entity list (§6.2) is the conceptual model. Normative implementation decisions:

### 5.1 Conventions
- Every table carries `property_id` (uuid, FK) and every query is scoped by it. v1 seeds exactly one property.
- Primary keys are uuids. Human-facing references (`PV-4821`) are separate, unique, indexed columns.
- **Money is stored as integer cents** (BND). Never floats.
- Timestamps are `timestamptz` in UTC. Stay dates are `date` interpreted in the property's timezone (`Asia/Brunei`, UTC+8, no DST).

### 5.2 Double-booking prevention (structural)

The availability invariant is enforced **in the database**, not in application logic:

```sql
create extension if not exists btree_gist;

alter table occupancy add constraint no_overlapping_occupancy
  exclude using gist (
    unit_id with =,
    daterange(start_date, end_date, '[)') with &&
  )
  where (status not in ('expired', 'cancelled'));
```

Half-open ranges `[)` make back-to-back bookings (checkout day = next check-in day) legal by construction. A `held` occupancy participates in the constraint (a held unit is unavailable) and is released by hold expiry (§6.3).

Day passes have no unit; capacity is enforced by a transactional check against the configured facility headroom for the date, with the booking insert and the count in one transaction.

### 5.3 Booking state machine

States per PRD §9.2: `draft → held → awaiting_payment_verification → confirmed → checked_in → completed`, with exits to `expired`, `cancelled`, `no_show`. Transitions are implemented as a single function in `lib/domain` that validates legality; no code path sets `status` directly. Every transition writes an audit event.

### 5.4 Rent periods

`rent_period` is one row per period per tenancy (due date, amount, status, paid date, method, reference) — never a boolean on the tenancy (PRD §16 rationale).

---

## 6. Payments (manual transfer, v1)

### 6.1 Reference format
`PV-` + 4-digit number, unique per property, generated at booking creation. Short enough to type into a bank transfer description; the customer-facing reference is **not** used in any URL (see §7 for tokens).

### 6.2 Verification queue
Backed by bookings in `awaiting_payment_verification`. Confirming requires `payment.verify`, records verifier and timestamp, and matches on **amount as well as reference**: a mismatched amount can only be confirmed through an explicit override that records a reason. A manual-match action attaches an arbitrary observed payment to a booking for customers who omit the reference.

### 6.3 Hold expiry
`hold_expires_at` on the booking. A scheduled job (Vercel cron hitting an internal route, every 5 minutes) transitions lapsed `held` bookings to `expired`, freeing the exclusion-constraint row. Expiry is also checked lazily at read time so availability is never stale between cron runs.

### 6.4 Provider interface
```ts
interface PaymentProvider {
  initiate(booking): PaymentInstruction   // v1: bank details + reference + deadline
  confirm(paymentId, actor): void          // v1: manual staff confirmation
  refund(paymentId, amount, actor): void   // v1: recorded as instruction, executed manually
}
```
v1 ships `ManualTransferProvider` only. A card gateway (Baiduri/BIBD) or statement-import matcher plugs in behind this interface later.

---

## 7. QR and check-in tokens

- Token: `nanoid(21)`, stored on the booking, unique-indexed, **revocable and regenerable** (regeneration invalidates the old token).
- URL: `/c/{token}`. The route renders by session: an authenticated staff member with check-in permission sees the check-in action; anyone else sees a minimal booking summary (guest name partially masked, dates, status). The QR grants no authority; the staff session does.
- QR PNG generated server-side at confirmation (≥ 400px, error correction M), attached to the confirmation email, downloadable from the portal for WhatsApp forwarding. The plain-text booking reference is rendered beside it.
- The security field screen defaults to **today's arrivals** with search by vehicle registration and name; QR scanning is via the phone's native camera (no in-app scanner in v1). The arrivals list is served cache-friendly so a single load remains usable on poor signal.

---

## 8. Documents and data protection

- Supabase Storage, **private buckets only**: `identity-docs`, `payment-slips`, `inspection-photos`, `packs`.
- Access is exclusively via short-lived signed URLs (60 s) issued server-side after a permission check. Identity documents additionally require `document.view_identity`, and **every issuance is logged** (who, which document, when) to the audit table.
- Every document row carries `retain_until`, set from per-kind retention config at upload. A daily scheduled job hard-deletes expired objects and marks the rows deleted. Defaults (client-adjustable): identity docs 12 months after checkout; slips and packs 7 years (accounting records); inspection photos 24 months.
- Accounting pack: generated server-side (`pdf-lib`) when a booking completes payment — itemised booking + slip + IC reference — stored in `packs`, replacing manual assembly.
- **No legacy migration.** The system holds data from go-live onward (PRD §13).

---

## 9. Email

Resend, transactional only: booking created (payment instructions + deadline), booking confirmed (QR attached), payment reminder before hold expiry, deposit release note. Sender uses the Vercel-hosted domain until the client selects a domain, at which point the domain is verified in Resend and templates re-pointed. Email capture is added to the booking form; where a customer provides no email, delivery falls back to staff forwarding the QR image via WhatsApp (accepted v1 gap, PRD assumption A6).

---

## 10. Environments and delivery

| Environment | Purpose |
|---|---|
| Local | Supabase CLI local stack; seed script creates the property, unit types, units, facilities, roles. |
| Preview | Vercel preview per PR, pointed at a **dev** Supabase project. |
| Production | Vercel production + **prod** Supabase project. Two Supabase projects total. |

- Migrations are SQL files in `supabase/migrations/`, committed, applied via CLI. No dashboard-only schema changes.
- Secrets live in Vercel env vars and Supabase config; nothing secret in the repository.
- Backups: Supabase automated daily backups; restore procedure tested once before go-live and documented in the repo.
- Observability: Vercel logs plus Sentry (free tier) for error reporting. A 24/7 booking system with a solo maintainer needs errors to announce themselves.

---

## 11. Multi-property posture

Everything is scoped by `property_id`; rates, fees, policies, facilities, retention periods and hold durations are rows in per-property config, never constants. **No multi-property UI is built in v1** — the discipline is in the data layer only, which is the cheap insurance (PRD §6.3, NG9).

---

## 12. Design system

`design.md` is **normative** for colors, typography, spacing, radii and component chrome. Tokens are implemented as CSS variables in the Tailwind theme; shadcn components consume them. The field surface uses the same tokens with enlarged touch targets (≥ 48px) per `design.md`'s responsive rules.

---

## 13. Open engineering items

1. Client domain not yet selected; Vercel domain in use for QR URLs and email until then (links in issued QRs survive a domain move only if re-generated — regenerate tokensʼ QR images after the domain cutover).
2. Statement import format for phase-two auto-matching (depends on BIBD/Baiduri export capabilities — to investigate with real exports).
3. WhatsApp Business API evaluation (deferred; manual forwarding accepted in v1).
4. Whether the field surface needs Malay (PRD C4); i18n is not scaffolded in v1 and would be added via `next-intl` if confirmed.
