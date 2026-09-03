# Palm Villa Platform — Architecture

| | |
|---|---|
| **Version** | 0.1 (draft) |
| **Date** | 18 August 2026 |
| **Status** | Normative for all engineering decisions |
| **Related** | `prd.md` (product requirements, business rules) · `design.md` (design system, normative for tokens) |

**Document boundaries.** `prd.md` owns business rules, pricing, flows and roles; `open-questions.md` owns the register of what is still unanswered. This document owns how the system is built: stack, structure, data, security, and operational concerns. Where the PRD sketches technical shape (entity list, lifecycle, non-functionals), this document is the authoritative version. `design.md` owns visual tokens and components.

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

**Explicitly not used:** no monorepo (route groups are sufficient at this scale), no separate API service, no native apps, no client-side direct database access, no form-state library (React 19 `useActionState` plus a server action covers the forms in scope), no date-picker library — the single-date field and the two-month range picker are built on one shared month grid in `components/ui`, from the tokens, and are specified in `design.md` §Components (the public availability calendar, A1, is still unspecified and unbuilt). A library would have arrived with its own geometry and its own opinion about ranges.

### 1.1 Ownership boundary

This platform is personal IP, built and hosted entirely on personal accounts: personal GitHub repository, personal Vercel, personal Supabase. **No employer (Go10) infrastructure, organisations, accounts, or code may be used or referenced.** No code is copied from employer repositories. This boundary exists to keep the ownership position clean and must not be crossed for convenience.

---

## 2. Application structure

```
app/
  (public)/          # Customer-facing: availability, booking, payment, FAQ, lookup
  (portal)/          # Staff desktop: calendar, bookings, payment queue, config, reports
  (field)/           # Mobile web: security check-in, housekeeping checkout
  (print)/           # Printable documents in the portal's URL space, without its shell
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

**`(print)` is a layout boundary, not a fourth surface.** It holds one route today — the deposit statement (E3) — and it exists for a mechanical reason rather than a stylistic one: the operations shell is `h-dvh overflow-hidden` with the content panel owning the scroll (§Layout in design.md), and a browser printing a page whose content lives inside a scroll container prints exactly one screenful of it. A nested layout cannot remove its parent, so a document rendered inside the portal shell could never print past the fold. It keeps the portal's **URL space** — `/portal/deposits/PV-4821/statement` — so `proxy.ts`, which matches `/portal/:path*`, still requires a session; only the chrome differs.

**Rendering and data rules:**

- All database access is **server-side** (server components, server actions, route handlers). The browser never holds a Supabase client with data access.
- **Two Supabase clients, one purpose each.** `lib/supabase/server.ts` is the *session* client: cookie-backed via `@supabase/ssr`, tied to a request, and used for auth. `lib/supabase/data.ts` is the *data* client that `lib/db` uses — no cookies, service-role key, memoised per process — because the query layer also runs in server components and in Vitest, where there is no request to read cookies from. It refuses to load in a browser. Authorisation for those queries is `requirePermission(...)` in the server layer (§4), not RLS.
- Mutations are server actions. Every mutation passes through the permission check helper before touching `lib/db`.
- The pricing engine and booking state machine are **pure functions** in `lib/domain`, unit-testable without a database. These two modules carry most of the correctness risk in the product and are the only parts where test coverage is treated as mandatory rather than pragmatic.

---

## 3. Authentication and sessions

### Staff
Supabase Auth, email + password. Staff accounts are created by an Admin; there is no self-registration (public signup is disabled in the Supabase config; account creation goes through the service-role admin API). Sessions are httpOnly cookies via `@supabase/ssr`. The `(portal)` and `(field)` route groups are gated in the request pipeline (`proxy.ts`), which answers only "is anyone signed in"; render is additionally gated per-permission server-side, and every mutation re-checks via `requirePermission` (§4).

**Provisioning [A]:** an Admin creates the account with a temporary password and shares it out-of-band (in person / WhatsApp) — there are **no auth emails at all**: no invites, no confirmations, no reset emails (§9). Staff change their own password from the account menu; a forgotten password is an Admin reset to a new temporary one. The first Admin is created by `scripts/bootstrap-admin.mjs` (idempotent, env-driven; locally `npm run db:bootstrap-admin`, in production the same script run once from an operator machine).

**Identity [A]:** the display name lives in `auth.users.user_metadata.display_name` — no staff profile table exists, because nothing beyond a name is stored about staff. **Disabling [A]** is a GoTrue ban (`ban_duration`), not a flag or a deletion: an account that has acted is pinned forever by the audit trail's foreign key (restrict, not cascade — migration 001000), so access ends by ban and history stays resolvable. The one carve-out: an account that has **never** acted (no audit rows as actor — a typo'd email, a duplicate) may be deleted outright from the admin UI; the FK stays the backstop if an action races the delete, and the deletion itself is audited. A banned account's already-issued access token stays valid until it expires (≤1 h) — accepted for v1.

### Customers
**No accounts.** Guest checkout only (PRD decision). Post-booking access is via:

1. **Booking lookup**: reference + phone number, on the public site.
2. **Magic link**: each confirmation email contains a signed URL to the booking summary.
3. **QR token**: see §7.

### Field staff
Same Supabase Auth. The `(field)` surface is a filtered, large-touch-target view determined by role, not a separate auth system.

---

## 4. Authorisation

Three tables: `staff_role`, `role_permission`, `user_role` (named to keep clear water from Postgres roles). Users hold **one or more roles**; effective permissions are the union. Permission strings are the atomic unit (see PRD §4 for the canonical set and the five predefined roles). Roles are data, not code: editing a role's permission set is an Admin UI operation.

**Enforcement is in the server layer** — `requirePermission('deposit.approve_release')` called at the top of every server action. The helper reads the session itself from the request's cookies (a server action has ambient cookie access, so passing a session parameter would be a line of boilerplate per action for nothing) and returns the **Actor** — `{ userId, permissions }` — so the action can thread `userId` into the database functions as `p_actor_id`. Session and permission lookups are memoised per request. A non-throwing `getActor()` exists for render-time gating (a screen showing a quiet "no access" card rather than erroring); mutations never use it. Postgres RLS is enabled on all tables as defence in depth, but the application does not rely on RLS for business-level authorisation, because permission logic (e.g. "approve is only available once inspection is recorded") is richer than row filters.

**Approvals are events, not flags.** Any action carrying an approval semantic (deposit release, charge waiver, manual payment match) writes an `audit_event` row with actor, action, entity, before/after, timestamp. The audit table is append-only; no update or delete grants exist on it. **Role administration is audited too [A]:** creating/disabling an account, resetting a password, and every change to a role's permission set or a user's role set writes an audit event (the role-set writes atomically with their change, via SQL functions) — F4 promises the owner the full trail, and a role change alters what every other event could have been.

**`booking.discount` is a permission of its own [A].** Every other string in the set gates an operation; this one gates discretion — giving money away — so it is separable from `booking.create` and can be withheld from a role that otherwise takes bookings all day (PRD §8.4). It is checked twice on the create path: the control is not rendered without it, and the server action calls `requirePermission('booking.discount')` before pricing when a discount is present. On the amend path the check is inverted for safety — an amender **without** it has the booking's existing discount carried through untouched rather than read as a removal, because the lines are replaced wholesale and a discount nobody resubmitted would otherwise vanish. Every discount writes its own `booking.discounted` audit event, on creation and on any amendment that moves one, including removal.

**Lock-out guards [A]:** the admin UI refuses the two unrecoverable-by-UI edits — removing your own path to `config.manage`, and removing `config.manage` from the `admin` role. Everything else, including one admin demoting another, is allowed.

---

## 5. Data model

The PRD's entity list (§6.2) is the conceptual model. Normative implementation decisions:

### 5.1 Conventions
- Every table carries `property_id` (uuid, FK) and every query is scoped by it. v1 seeds exactly one property.
- Primary keys are uuids. Human-facing references (`PV-4821`) are separate, unique, indexed columns.
- **Money is stored as integer cents** (BND). Never floats.
- Timestamps are `timestamptz` in UTC. Stay dates are `date` interpreted in the property's timezone (`Asia/Brunei`, UTC+8, no DST).
- Property-scoped tables also carry `unique (property_id, id)`, so children reference them with a **composite foreign key**. A row can then never point at a parent in another property — the data-layer half of §11, at the cost of one extra index.
- **Vehicles hang off the booking, one row per car** (`booking_vehicle`), not an array on the guest as the PRD §6.2 sketch has it: Security checks the vehicle that arrived for *this* stay, and the same guest returning in a different car is a different fact. Plural because a booking is frequently a family arriving in two or three cars. A child table rather than `text[]` because PRD §12.5 makes plate lookup the primary arrival path — that is `where registration = ?`, which wants an indexed row. Registrations are normalised on the way in (upper case, single-spaced) by `lib/domain/vehicle.ts`, so the plate typed at the desk and the one read at the gate are the same string; **no format is validated**, since Brunei plates are not one shape and refusing a legitimate plate at a front desk is worse than a loose field.
- **`booking.no_vehicle` is an assertion, not an absence.** PRD §13 [C] makes a registration required, so the rare guest arriving without a car needs a way to say so that is distinguishable from a field nobody filled in. No vehicles *and* no flag means **not recorded** — the state of bookings taken before the rule — and the product says so rather than claiming the guest has no car. The rule "at least one vehicle, or the flag" is enforced in `create_walk_in_booking()` and `amend_booking()`, the only two writers, rather than as a constraint: it spans two tables, and a check constraint cannot see across one. It is deliberately **not** in the same class as the G1 exclusion constraint — a booking missing a plate is a record-keeping gap, not a unit sold twice.
- **`payment` carries two amounts, and they mean different things.** `expected_amount_cents` is what the payment was raised *for* and again what it was verified against — §6.2 explains why it is refreshed rather than snapshotted — while `amount_cents` is what was actually observed, null until somebody has looked.
- **There is now a balance, and it is derived.** `booking_summary.paid_cents` sums the payments **verified** against a booking; what is owed is `total - paid`, computed by `balanceOf()` in `lib/domain/balance.ts` and stored nowhere. This reverses the payment slice's original "not a ledger" position, and the reason is recorded in migration 20260903000200: the amendment path (§5.4) can reprice a booking that has already been paid for, so a shortfall exists whether or not the schema can express one, and until this the product could neither name it nor take a second transfer to clear it. **Only verified payments count** — a promised transfer is not money. It remains *not* part payments: PRD §9.1's [C] is untouched and N5's refund question is still open, so an overpayment is named and left alone rather than netted off.
- **A discount is a negative `booking_line`, and the instruction that produced it lives on the booking.** PRD §8 makes the total the sum of the lines, so a discount is a line (`line_type = 'discount'`, quantity 1, negative unit price) and nothing anywhere subtracts a figure from a stored price; `booking.total_cents >= 0` becomes the floor by construction. `discount_kind` / `discount_value` / `discount_reason` are the *instruction* — all three present or all three null, enforced by `booking_discount_is_whole` — and they exist because an amendment reprices: ten percent off a stay extended by a night must re-derive against the new subtotal, which the resolved cents cannot do. The same relationship `chargeable_guests` has to the `extra_person` line it produces. The arithmetic lives in exactly one place, `resolveDiscount()` in `lib/domain/discount.ts`, and both SQL writers take it already priced. The security deposit is never discounted (PRD §11 makes it a liability, not revenue).
- **`booking_note` is one table with an audience tag** (`internal` / `housekeeping`), not two note systems: the same act, differing only in who reads it, and the tag is the filter the housekeeping field screen will use. A plain table write rather than an RPC — one row, no audit event beside it to keep atomic, so a transaction would buy nothing. Append-only **as a product rule**: `lib/db/notes.ts` exposes list and add and nothing else. Deliberately *not* enforced by a rejection trigger the way `audit_event` is — the audit trail is a control promised to the client, whereas this is staff shorthand, and letting an author remove a note they mistyped should stay a screen rather than a migration.
- **`unit.status` (the PRD §6.4 lifecycle) is still not a column, and now never will be.** This section used to say it was deferred, on the grounds that "an unread status column that availability silently ignores is worse than none". The units slice (B8–B9) cashed that in rather than reversing it. Four of the six states — available, held, booked, occupied — are **derived** from the occupancy rows that already exist, by `deriveUnitStatus()` in `lib/domain/unit-status.ts`; storing them as well would be a second copy of a fact, and the copy would drift. The rules live in TypeScript rather than a SQL `case` for the reason §5.3 keeps the booking transition table out of plpgsql: branching that decides a status belongs in exactly one place. `unit_state(p_property_id, p_as_of)` returns the *facts* and nothing else — a function rather than a view because the board asks about today and the calendar slice will ask about a date, and `available_units()` is the precedent for "inventory, as of a date".
- **Two unit facts are stored, and both are read by availability.** That was the condition this section set, and it is the test either of them had to pass. `out_of_service_since` / `out_of_service_reason` are a both-or-neither pair on `unit` (the `booking_discount_is_whole` construction; the flag *is* `since is not null`, with no boolean beside it), and `available_units()` filters on it. Who took a unit out of service is an audit event, not a column (§4). A **long lease** is an `occupancy` row with no booking at `status = 'leased'`, so the exclusion constraint blocks bookings over it by construction — PRD §6.1's "a short stay and a long tenancy are the same object", paying for itself. A separate lease table would have needed an overlap constraint spanning two tables, which Postgres cannot express, and the application check standing in for it is exactly what G1 refuses.
- **`occupancy.booking_id` is nullable, and that cost less than it looks.** The composite foreign key is MATCH SIMPLE, so a null satisfies it untouched; `sync_occupancy_status()` matches `where booking_id = new.id` and `null = uuid` is null, so the trigger that mirrors booking statuses can never reach a lease row; and `booking_summary` is driven `from booking b left join occupancy o`, so a booking-less occupancy can never appear in it. `occupancy_is_a_booking_or_a_lease` keeps the two shapes from wearing each other's fields. The 20260829000200 comment anticipated this widening; this is its narrower half, ahead of the phase-three `Tenancy` record.
- **`awaiting_inspection` and `cleaning` are still unbuilt, and are named in code rather than omitted.** `DEFERRED_UNIT_STATUSES` exists so the gap is visible where the statuses are. They are written and cleared by the inspection flow (capabilities C2–C3), and a board that invented them would show a state nothing can set and nobody can clear. B8 is therefore delivered across two slices, and scope-of-capabilities.md says so.
- **Unit references are editable configuration** (capability F6), not fixed data. `unique (property_id, ref)` is **deferrable initially immediate**, because renumbering walks through references the old scheme still holds: Postgres checks a non-deferrable unique index as each *row's* index tuple is written, so a swap raises `23505` or does not depending on physical scan order. Deferring makes the constraint mean what it was always for — references are unique when the work is finished — and only `apply_unit_registry()` defers. A rename is consequently **retrospective**: `booking_summary.unit_ref` reads through to `unit.ref`, so a past stay is relabelled with the door's new name. That is the intent rather than a side effect (PRD §7.1 [A]); the `unit.renamed` events are the trail.

- **Deposits are three tables and a derived stage.** `deposit` (one per booking, created at check-in), `inspection` (one per occupancy) and `deposit_charge` (many per deposit). None of them carries a status: the four stages a deposit passes through are consequences of the release columns, the inspection row and the booking's own status, so `depositStageOf()` in `lib/domain/deposit.ts` derives them — this section's argument about `unit.status`, applied a second time. `deposit_summary` returns facts and no stage.

  Three shapes are worth naming because each is a departure from the PRD §6.2 sketch. **An inspection hangs off the occupancy**, as the sketch has it, which is what will let a lease that ends be inspected in phase three without a second table; the write path takes a *booking* id, because that is what every screen holds. **A charge hangs off the deposit** rather than the booking: it exists only because money is being held to answer for it, and `settled` is a fact about the excess as a whole — one guest, one balance — so it lives on the deposit and not once per charge. **Neither is a `booking_line`**: §8's lines *are* the price and `priceStay()` re-derives them on every amendment, so a damage charge there would be revenue on the booking and would be wiped by the next amend.

  The approved figures are stored as well as audited, because "what do we owe back right now" is a query and answering it out of jsonb would be reading the audit trail as a data store. They are consistent by **constraint** rather than by code path: `deposit_release_arithmetic` repeats `depositFiguresOf()` in SQL, so the three figures somebody signed cannot disagree with each other however they were written. This is the one place the arithmetic is deliberately duplicated, and prd.md §11 [C] — the deposit is not a cap on liability — is why it is worth it.

  **Lock order is deposit, then charge**, in every function that touches both, so an approval and a charge landing together queue rather than deadlock. The charges are summed *under* the deposit's lock at approval, which is what makes "signed against a list that moved" impossible rather than unlikely.

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

**`end_date` is nullable, and only for a lease.** A month-to-month tenancy has no agreed last day (open-questions.md N19, answered 3 September 2026), and `daterange(start, null, '[)')` is `[start,)` — unbounded above. So an open-ended lease overlaps every future range and the constraint above needs no change to block bookings over it; neither does `available_units()`, whose overlap test is the same `&&`. That is the range model in §6.1 paying for itself a second time. What it does *not* survive is a plain `end_date > some_day` comparison, which is null rather than true for an open-ended row — `unit_state()` and `set_unit_out_of_service()` were the only two, and both are now null-guarded. `occupancy_only_a_lease_is_open_ended` keeps the relaxation where it belongs: a stay is sold and priced by nights, so a booking with no checkout stays structurally impossible.

`occupancy.status` mirrors `booking.status`, maintained by an `after update` trigger on the booking and by nothing else. The constraint's `where` clause needs the status on the occupancy row, and two hand-maintained copies would drift; the booking stays the single writer. Availability reads (`available_units()`) apply the identical half-open predicate, so the list a screen renders and the write it then attempts cannot disagree at the boundary.

The constraint is covered by `lib/db/no-double-booking.test.ts`, which fires eight simultaneous bookings at one unit and asserts exactly one wins. That file documents how to watch it fail with the constraint dropped — a concurrency test nobody has seen fail is not evidence.

Day passes have no unit; capacity is enforced by a transactional check against the configured facility headroom for the date, with the booking insert and the count in one transaction.

**Two corrections the units slice made here, both worth stating rather than absorbing.**

`available_units()` filtered occupancies with `o.booking_id is distinct from p_exclude_booking_id`, which was correct while every occupancy had a booking. It stopped being correct the moment a lease could have none: on an ordinary call `p_exclude_booking_id` is null, a lease's `booking_id` is null, and `null is distinct from null` is **false** — so the lease row was skipped by the `not exists` and the unit reported free. G1 would have been defeated by a null comparison rather than by a race. The exclusion only ever meant "skip this one booking's own row" and is now guarded on there being a booking to exclude, in the same migration that made the column nullable. `lib/db/units.test.ts` names the case.

A `completed` or `no_show` occupancy whose `end_date` has not yet passed still blocks availability, but the board derives it as `available`. **That divergence is the missing `awaiting_inspection` state**, not a bug in either half: a no-show recorded on the arrival day leaves the unit unsellable for the rest of the stay, which predates this slice. It is left alone rather than patched with a seventh status nothing could clear — the inspection flow (C2–C3) truncates the occupancy and owns the fix. Two tests in `lib/domain/unit-status.test.ts` assert the current behaviour so that closing the gap is a deliberate act.

**Recording an inspection does not truncate the occupancy**, and the divergence above is therefore unchanged by the deposits slice. What that slice added is the *fact* — an inspection row against the occupancy — which is what C2–C3 will derive `awaiting_inspection` and `cleaning` from, along with a rule about when a unit becomes bookable again that nobody has written yet. Truncating a stay because somebody looked at the room would be this slice deciding that rule quietly.

A unit that is out of service is refused as an occupancy target by a `before insert or update` trigger, scoped to rows arriving at a unit or changing the days they cover — a status mirrored down from a booking is not re-checked, or completing a stay that ended before the unit broke would be refused.

### 5.3 Booking state machine

States per PRD §9.2: `draft → held → awaiting_payment_verification → confirmed → checked_in → completed`, with exits to `expired`, `cancelled`, `no_show`. Transitions are implemented as a single function in `lib/domain` that validates legality; no code path sets `status` directly. Every transition writes an audit event.

**`check_in` and `check_out` became reachable from the portal with the deposits slice** (prd.md §11), having existed in the machine and been invoked only by tests since the schema slice. `check_out` goes through `transition_booking()` unchanged — nothing else moves when a guest leaves. `check_in` does not: `check_in_booking()` inlines the status update so the move and the deposit insert are one transaction, for the reason `verify_payment()` inlines its own — a plpgsql `return` does not roll back, so calling `transition_booking()` and then inserting would leave a moved booking behind a refusal. Legality still lives here: the caller passes the pair `transition()` derived, and the schema never chooses a status.

`submit_payment` leaves `draft` as well as `held`. The two are the same event for the same reason — the customer says they have paid and somebody must check — and differ only in whether a hold preceded it. A booking taken at the desk and paid by transfer needs to reach the queue, and the alternative, walking it through `held`, would fabricate a state that is never persisted and that carries hold semantics (`hold_expires_at`, §6.3's expiry job) this path does not have. The routes to `confirmed` are unchanged, so "no booking is confirmed without a verified payment or a walk-in payment" still holds.

Legality is decided in TypeScript by `transition()`; persistence is `transition_booking()`, which makes the status write and its audit event atomic and updates `where status = <the status the caller read>`. Zero rows updated means the booking moved underneath the caller — two staff members acting on it at once — which is returned as a message, not a lost write. The booking write path (`create_walk_in_booking()`) is passed the status the state machine already derived; the schema never chooses one.

### 5.3a The read model carries every stream

`booking_summary` is the view every portal list sits on. It **LEFT joins occupancy**, so a booking that occupies no unit is a row rather than a row that was joined away — PRD §6.1 is explicit that a day pass consumes facility capacity on a date and occupies nothing, and an inner join made the bookings register structurally incapable of showing one. `payment_summary` had already set the precedent (§7) for the same reason.

The consequence reaches TypeScript: `Booking.stay` is **nullable**, and it is one object (`unitId`, `unitRef`, `unitTypeId`, `range`) rather than four nullable fields, because the four are one fact. One check narrows all four, so no screen can read a unit reference while treating the dates as absent. Screens that amend or price a *stay* — the amend form, and `amend_booking()` itself — refuse a booking without one rather than assuming it.

Nothing writes a `day_pass` or `tenancy` booking yet; those are phases two and three. What this buys now is that those slices add a writer rather than reworking every list screen.

### 5.4 Amendment

**An amendment is not a state transition.** A booking's status does not move when its dates, unit, party or guest details change, so there is no `amend` event in the machine and `transition_booking()` is not the write path. What §5.3 governs is *which* statuses may be amended at all, and that stays in the same module: `canAmend()` in `lib/domain/booking-state.ts`, never re-decided in SQL or in a screen.

`checked_in` is excluded. The guest is in the unit, and `priceStay` refuses a check-in date in the past, so an in-progress stay cannot be repriced without a deliberate exception to the pricing engine — see PRD §9.6.

Persistence is `amend_booking()`, a single transaction over the guest row, the booking row, the occupancy row, the priced lines and the audit event. The transaction boundary exists for the same reason `create_walk_in_booking()`'s does: PostgREST has no multi-statement transaction, and a booking whose occupancy moved but whose lines did not is a guest charged for a stay they are not having. Lines are **replaced wholesale**, not reconciled — PRD §8 makes the lines the price, so the honest representation of a reprice is the new set.

The occupancy update is the statement that wins or loses the race against the §5.2 constraint, exactly as the insert is on creation. A row does not conflict with itself, so extending a stay in the same unit is legal by construction; only a neighbouring booking can refuse it, and the refusal returns `unit_unavailable` with nothing written.

**Concurrency guard.** §5.3's `where status = <the status the caller read>` cannot work here, because an amendment leaves the status alone. `booking.updated_at` takes its place — already maintained by the `booking_touch_updated_at` trigger, exposed through `booking_summary`, and compared exactly. It is carried from the read to the write **as an opaque string and never parsed into a `Date`**: Postgres keeps microseconds and JavaScript's `Date` does not, so a round trip through one would refuse every save as stale.

**Guest edits are in place, conditionally.** Correcting a name updates the `guest` row, which is correct only while every booking owns a guest row of its own — `create_walk_in_booking()` guarantees that today by inserting a fresh guest per booking and deliberately not de-duplicating. When a guest slice consolidates guests, editing a name here would rewrite it across that person's whole history, and this must become a booking-level override instead.

**A discount survives an amendment because the instruction does.** `amend_booking()` takes `p_discount_kind` / `p_discount_value` / `p_discount_reason` alongside the replaced lines and writes them wholesale — null clears the discount, which is how removal is expressed. The server action decides which instruction is submitted (see §4), and `priceStay` resolves it against the *new* subtotal, so the discount line among the replaced lines is always the current one.

**Cancellation** is an ordinary transition and needed no new write path. `transition_booking()` gained an optional `p_reason`, recorded in the audit event's `after` payload (omitted rather than null when absent) — the audit `before`/`after` are jsonb precisely so a fact about an event can be added without a schema change. No refund or forfeiture is computed anywhere; N5 in the open-questions register is open and §9.6 records why nothing depends on it.

### 5.5 Rent periods

`rent_period` is one row per period per tenancy (due date, amount, status, paid date, method, reference) — never a boolean on the tenancy (PRD §16 rationale).

---

## 6. Payments (manual transfer, v1)

### 6.1 Reference format
`PV-` + 4-digit number, unique per property, generated at booking creation. Short enough to type into a bank transfer description; the customer-facing reference is **not** used in any URL (see §7 for tokens).

Allocated from a sequence, so it is unique by construction and never gapless — a rolled-back booking burns its number, and uniqueness rather than contiguity is the requirement. **Four digits is a minimum, not a width:** past 9999 the reference simply grows, because a reference identifies exactly one booking forever and truncating it back to four would make two bookings share one. Anything reading a reference must therefore accept `PV-\d{4,}`. The formatting is `booking_reference_for()`, split out from the allocator so the boundary can be tested without burning ten thousand sequence values.

### 6.2 Verification queue
Backed by bookings in `awaiting_payment_verification`. Confirming requires `payment.verify`, records verifier and timestamp, and matches on **amount as well as reference**: a mismatched amount can only be confirmed through an explicit override that records a reason. A manual-match action attaches an arbitrary observed payment to a booking for customers who omit the reference.

**As built.** One `payment` row per payment, with `verify_payment()` and `record_cash_payment()` writing the payment, the booking's status and the audit events in one transaction.

- **The amount rule is a database constraint**, not only a code path. `payment_mismatch_needs_reason` refuses a verified payment whose amount disagrees with what is due unless a reason is attached — from any server action, any RPC, or a `psql` session. The pure `checkPaymentMatch()` in `lib/domain` refuses first, with a sentence a clerk can act on; the constraint refuses last. An overpayment is refused as firmly as a short payment (N5 in the open-questions register is open, so a refund is not something to imply).
- **`expected_amount_cents` is re-read from `booking.total_cents` under the row lock at verification**, not trusted from when the payment was raised. Without that, a booking quoted at 400, amended to 500 and verified at 400 reports a match, and the amount rule is defeated by the amend path rather than by anything in the payment layer. The original quote survives in the audit event's `before`.
- **Both functions take their row locks first and validate before writing anything**, because a plpgsql `return` does not roll back — a guard that fired after the payment insert would leave the payment written and the booking unmoved. That is also why neither calls `transition_booking()`, which reports a refused move as a return value; both inline the status update instead, and `transition_booking()` carries a comment saying so.
- **Manual match is an action on a queue row**, not an inbox of unattached payments. The clerk describes what the bank actually shows (amount, sender, date, whatever reference appeared) and the payment is attached with a required reason. No payment row ever exists without a booking, so there is no second reconciliation problem; the inbox shape belongs with statement import (scope X2).
- **Three audit verbs**, because one click can carry up to three approval semantics: `payment.verified` always, plus `payment.amount_overridden` and `payment.matched_manually` where they apply. Separate rows rather than fields inside one, so "every payment confirmed against a mismatch" is a lookup on `action` rather than a jsonb scan — and §4 names manual payment match as an approval act in its own right.
- **Reads go through a `payment_summary` view** rather than columns appended to `booking_summary`, which `create or replace view` can only ever add to. It LEFT joins occupancy, unlike `booking_summary`, so a day pass — which occupies no unit — cannot fall out of the queue.
- **Slip display is deferred** to the documents slice. `slip_document_id` exists without a foreign key until the `document` table does, and the queue says "No slip on file" on screen. PRD §10.4's "evidence, not verification" is what makes the queue complete without it; the delta against scope B4 is flagged to the client.

### 6.2a Settling a difference

Two writers created a `payment` row — booking creation and the cash form — so a second **bank transfer** against an existing booking could not be represented at all. `record_transfer_payment()` is the missing mirror: it raises a `pending_verification` row for whatever is outstanding, takes **no amount** (a promised transfer has not been seen, and `payment_verified_is_observed` enforces that `amount_cents` stays null), moves no booking status, and refuses both a booking that owes nothing and a second transfer while one is already pending.

`verify_payment()` and `record_cash_payment()` both changed in the body only — the amount is matched against `total - (other verified payments)` rather than against `total`. For every payment written before this the two are the same figure. `verify_payment()`'s booking transition also became optional: a top-up is confirmed against a booking that is already `confirmed`, there is no legal move from there, and writing `confirmed → confirmed` would have put a second "Booking confirmed" line in the history for a booking that never moved.

**Owing money is not a status.** The state machine describes the stay; the balance sits beside it. A second axis running through §5.3's states would have to be answered by every screen that filters on one.

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

**Not built yet, deliberately, and this section is the record of that.** The payments slice implements manual verification directly in `lib/db/payments.ts` over the two database functions, and `lib/payments/` does not exist. Of the three methods above only `confirm` is reachable today, and there it *is* `verify_payment()` — one implementation, one caller, nothing to abstract over. The other two cannot be written honestly: `initiate` must return bank details and a deadline, and there are no bank details anywhere in the PRD (C6 in the open-questions register asks whether a merchant account exists) and no agreed deadline (N7); `refund` is blocked by N5 and forbidden by §9.6. `PaymentInstruction`'s shape will be decided by the phase-two public payment screen, so anything written now would be redesigned then.

This is the judgement §5.1 already records about `unit.status` — "an unread status column that availability silently ignores is worse than none" — applied to an interface. The seam is cut when the second caller exists, which is the public flow.

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

Resend, transactional only: booking created (payment instructions + deadline), booking confirmed (QR attached), payment reminder before hold expiry, deposit release note. **No auth emails** — staff provisioning and password resets are out-of-band (§3), and Supabase's own auth mailer stays unused. Sender uses the Vercel-hosted domain until the client selects a domain, at which point the domain is verified in Resend and templates re-pointed. Email capture is added to the booking form; where a customer provides no email, delivery falls back to staff forwarding the QR image via WhatsApp (accepted v1 gap, PRD assumption A6).

---

## 10. Environments and delivery

| Environment | Purpose |
|---|---|
| Local | Supabase CLI local stack; seed script creates the property, unit types, units, facilities, roles. |
| Preview | Vercel preview per PR, pointed at a **dev** Supabase project. |
| Production | Vercel production + **prod** Supabase project. Two Supabase projects total. |

- Migrations are SQL files in `supabase/migrations/`, committed, applied via CLI (`npm run db:start`, `npm run db:reset`). The Supabase CLI is a pinned devDependency so every machine replays them with the same version. No dashboard-only schema changes.
- `npm run test` runs both suites: `unit` (pure `lib/domain`) and `integration` (`lib/db` against the local stack). The integration suite **fails loudly when the stack is down rather than skipping**, so a green run always means capability G1 was checked.
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
