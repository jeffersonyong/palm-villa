# Palm Villa Booking & Operations Platform

**Product Requirements Document**

| | |
|---|---|
| **Version** | 0.1 (draft, pre-client-sign-off) |
| **Date** | 18 August 2026 |
| **Author** | Jeff |
| **Client** | Palm Villa, Brunei |
| **Client contacts** | Jason (primary), "Ladyboss" (decision authority on some scope) |
| **Status** | Draft for scoping and quotation |

> **How to read this document.** Requirements are tagged to show confidence:
> **[C]** Confirmed by client. **[A]** Assumed by Jeff, needs confirming but safe to build against. **[O]** Open, blocking or near-blocking.
> All currency is Brunei Dollars (BND). The client writes prices as "$"; this document reads that as BND throughout.

> **Document map.** This PRD owns business rules, pricing, flows and roles. `open-questions.md` owns the register of what is still unanswered — §18 is now a pointer to it. `architecture.md` is normative for all engineering decisions (stack, data model implementation, security, infrastructure) and supersedes the technical sketches here (§6, §15) where they differ. `design.md` is normative for the design system.

---

## 1. Purpose

Palm Villa runs an apartment building in Brunei with three revenue streams: facility day passes, short-term stays, and long-term tenancies. The entire operation currently runs on WhatsApp, bank transfers, cash, and a single Excel spreadsheet.

This platform replaces that with one web application: a public booking site for customers, an operations portal for staff, and mobile screens for on-site staff, all over a single database.

---

## 2. Background: current state

**How customers reach them.** An Instagram page advertises the units and displays contact numbers. Customers message on WhatsApp. Bookings are handled by the Reservations / Front Office team, who check availability, confirm details, and assist with payment.

**[C] Public contact details** (confirmed 2026-08-27): Instagram and TikTok both `@palmvilla.bn`; phone **+673 8959798 / 8837118 / 8986733**; location 4.570085, 114.220738 (Bandar Seri Begawan). **[O]** Which of the three numbers carries WhatsApp for booking enquiries is not stated — the public site currently links the first.

**How bookings are recorded.** Manually into Excel, including payment status. Bookings are approved by a person before being confirmed, which is currently the only thing preventing double bookings.

**What is collected.** Name, phone number, number of people, vehicle registration number, and a copy of the guest's IC.

**How money moves.** Bank transfer to BIBD or Baiduri accounts, or cash on site. Guests send a transfer slip over WhatsApp. Cash is reconciled by comparing cash collected against recorded transactions and receipts, then verified by the Finance team.

**Record keeping.** For each transaction, staff manually compile a PDF pack containing the transfer screenshot, the customer's IC, and the transaction confirmation.

**On arrival.** Customers may fill in a second form. Gates are usually left open, so verification is limited. Security need to be told who to expect.

### Problems this creates

1. No single source of truth. Availability lives in one spreadsheet and several WhatsApp threads.
2. Every enquiry requires a human, including simple availability and price questions.
3. Payment reconciliation is manual and depends on matching names to transfers.
4. Guest data, including identity documents, accumulates indefinitely in a folder on a computer with no retention or access control.
5. Deposit handling has no ledger. Nobody can answer "what deposits do we owe back right now."
6. The accounting document pack is assembled by hand, per transaction.
7. Double booking is prevented only by manual approval, which is exactly the control that self-service booking removes.

---

## 3. Goals and non-goals

### Goals

- **G1.** One system of record for units, bookings, payments, and guest documents.
- **G2.** Customers can check availability, see a price, and book without messaging anyone.
- **G3.** Staff can create and manage bookings faster than the current spreadsheet.
- **G4.** Payment reconciliation reduced to a short verification step per booking.
- **G5.** Deposits tracked as a liability from collection to release, with inspection evidence.
- **G6.** Accounting document packs generated automatically.
- **G7.** Guest identity documents stored with access control and a retention policy.
- **G8.** Architecture supports additional properties without rework.

### Non-goals for v1

- **NG1.** Card payment gateway integration (Baiduri / BIBD merchant onboarding).
- **NG2.** Automated bank statement matching.
- **NG3.** WhatsApp Business API integration.
- **NG4.** Native mobile applications.
- **NG5.** Full long-term tenancy management (agreements, e-signing, rent collection workflow, renewals).
- **NG6.** Channel management or OTA synchronisation (Airbnb, Booking.com).
- **NG7.** Events and party bookings as a self-service product.
- **NG8.** Smart locks or automated physical access control.
- **NG9.** Multi-property administration UI (the data model supports it; the UI does not expose it).

---

## 4. Users and roles

| Role | Device | Primary jobs |
|---|---|---|
| **Customer** | Any browser | Check availability, book, pay, upload slip, receive QR, self-serve FAQ |
| **Reservations / Front Office** | Desktop | Create and amend bookings, verify payments, confirm units ready, handle enquiries |
| **Housekeeping** | Phone browser | See today's checkouts, record unit inspection, mark unit ready |
| **Security** | Phone browser | See today's expected arrivals, check guests in by QR or vehicle registration |
| **Finance / Approver** | Desktop | Verify cash reconciliation, approve deposit releases and charges |
| **Owner / Admin** | Desktop | Everything, plus configuration and reporting |

**[C] Resolved: the real team structure does not block the build.** Client answers reference distinct Front Office, Housekeeping and Finance teams, while the earlier picture was Jason plus perhaps two others, a security guard, and a head cleaner. This is handled by allowing **one user to hold multiple roles**. If Jason is Front Office, Finance and Admin simultaneously, he is assigned all three. If those functions later separate into different people, roles are reassigned with no code change.

### Permissions model

**[A]** Permissions are modelled as atomic capabilities, not hardcoded roles. Roles are compositions of permissions, editable in the admin UI without code changes.

Indicative permission set:

```
booking.view          booking.create        booking.amend
booking.cancel        booking.override_hold booking.discount
payment.verify        payment.record_cash
inspection.record     charge.create         charge.waive
deposit.approve_release
unit.manage           tenancy.manage        config.manage
report.view           document.view_identity
```

**[A] `booking.discount` is separate from `booking.create`** and is the one permission that gates discretion rather than an operation — see §8.4. Front Office holds it by default, because the desk is where a discount is asked for; withholding it from a role is one click in the Roles matrix.

**[C]** Deposit release approval sits at the end of the pipeline, with Finance or Jason, not with Housekeeping or Front Office. Housekeeping records the inspection; a separate role approves.

**[A] Checking a guest in and out is gated by `booking.amend`**, added when the deposits slice made those two moves reachable at all (§11). There is no check-in permission in the set above — [N11](open-questions.md) is the question of who may check a guest in, and minting a string before it is answered would be this document deciding it. `booking.amend` is the nearest true thing: it already means "may move this booking on", and Front Office holds it, which is where an arriving guest is standing. **The consequence is that Security cannot check anyone in**, which is exactly what capability D3 will need, so N11 has to be answered before the arrivals screen is built rather than before this one shipped.

### Predefined roles

**[C]** v1 ships with a fixed set of roles, each pre-assigned a permission set. Users may hold **more than one role**, which is what makes the uncertain team structure a non-issue. Roles and their permissions are editable in the admin UI later without code changes.

| Role | Permission set |
|---|---|
| **Admin** | All permissions, including `config.manage` and `document.view_identity` |
| **Front Office** | `booking.*`, `payment.verify`, `payment.record_cash`, `charge.create`, `unit.manage`, `tenancy.manage`, `document.view_identity` |
| **Housekeeping** | `inspection.record`, `unit.manage` (status only), read-only booking view for today |

**[A] What "(status only)" means concretely**, settled when the units screens were built. `unit.manage` opens the units board and the two service actions — taking a unit out of service and returning it — which is exactly the cleaner's job. Two neighbouring things are deliberately *not* on it:

- **Marking a unit let long-term is `tenancy.manage`.** Declaring a unit let to a tenant for six months is a commercial statement, not an operational one, and it should not sit with the person who reports that the shower door sticks. The permission already existed in the vocabulary and had never been held for anything; Front Office gains it.
- **Naming and counting the units is `config.manage`** (the unit registry, F6). Renumbering the building is configuration, in the same class as pricing (F3). A seventeenth permission string was considered and rejected — it would cost a migration, a seed change and a role rework for a screen an administrator opens twice a year — at the price that Front Office cannot correct a typo'd door number.
| **Security** | Today's arrivals view, check-in action, read-only booking summary. No document or payment access. |
| **Finance** | `payment.verify`, `deposit.approve_release`, `charge.waive`, `report.view`, read-only booking view |

**Principle:** identity documents and payment verification are the two most sensitive capabilities. Neither is granted to Security or Housekeeping by default.

---

## 5. Product surfaces

All three surfaces are one codebase, one database, one deployment. What a user sees is determined by their session.

### 5.1 Public booking site
Availability, pricing, booking, payment instructions, slip upload, booking lookup, FAQ.

### 5.2 Operations portal (desktop)
Booking calendar and list, manual booking creation, payment verification queue, unit management, inspection and deposit workflow, document access, reporting, configuration.

### 5.3 Field screens (mobile web)
Purpose-built single screens. Security: today's arrivals plus check-in. Housekeeping: today's checkouts, inspection, unit ready toggle. No app installation.

---

## 6. Domain model

### 6.1 Core principle

**A short stay and a long tenancy are the same object:** unit X is occupied from date A to date B. They differ only in duration, pricing cadence, and payment schedule. Modelling them as one `Occupancy` concept means one availability query and makes phase-three tenancy features additive rather than a second system.

**A day pass occupies no unit.** It consumes facility capacity on a date.

### 6.2 Entities (indicative)

```
Property              id, name, timezone, currency, config
Facility              property_id, name, capacity, included_in_day_pass (bool)
UnitType              property_id, name, base_rate, max_pax, car_allowance,
                      extra_person_rate, child_exempt_age
BedConfiguration      unit_type_id, description
Unit                  property_id, unit_type_id, ref, bed_config_id, status
Occupancy             unit_id, type (short_stay|tenancy), start, end, booking_id
Booking               property_id, reference, stream, status, guest_id,
                      pax_breakdown, total, created_by, hold_expires_at
DayPass               booking_id, date, party_composition, headcount
BookingLine           booking_id, type, description, qty, unit_price, amount
Guest                 name, phone, email, vehicle_registrations[]
Document              owner_type, owner_id, kind, storage_key, retain_until
Payment               booking_id, method, amount, reference, status,
                      verified_by, verified_at, slip_document_id
Deposit               booking_id, amount, status, collected_by, released_by
Inspection            occupancy_id, inspected_by, outcome, notes, photos[]
Charge                booking_id, amount, reason, created_by, settled
Tenancy               unit_id, tenant_id, start, end, monthly_rent
RentPeriod            tenancy_id, period_start, due_date, amount, status
AuditEvent            actor_id, action, entity, before, after, at
```

### 6.3 Multi-property

**[A]** Every table carries `property_id` from day one. Every query is scoped by it. Rates, tax, fees, policies and facilities are per-property configuration, never hardcoded. No multi-property administration UI is built in v1.

### 6.4 Unit lifecycle

```
available → held → booked → occupied → awaiting_inspection → cleaning → available
                ↘ (hold expires) → available
available → leased_long_term → (lease end) → available
any → out_of_service → available
```

**How each state is actually held** — settled by the units slice (B8–B9), and worth being explicit about because only two of them are stored:

| State | How it is held |
|---|---|
| `available`, `held`, `booked`, `occupied` | **Derived** from the occupancy rows that already exist. There is no `unit.status` column and there will not be one; storing these would be a second copy of a fact recorded elsewhere. See architecture.md §5.1. |
| `out_of_service` | **Stored** on the unit, as a since-date and a required reason. The one part of the lifecycle nothing else can tell you. |
| `leased_long_term` | **Stored** as an occupancy row with no booking, so §6.1's "one Occupancy concept" gives it the same availability guarantee a booking gets. |
| `awaiting_inspection`, `cleaning` | **Not built.** Written and cleared by the inspection flow (C2–C3). Named in code as deferred rather than omitted, so the gap is visible. The *inspection itself* now exists (§11), so what these two are waiting on is the housekeeping field screen and a rule about when a unit becomes bookable again — not a fact nobody records. |

**[A] A unit with a live booking on it cannot be taken out of service.** The PRD does not say either way. Out of service means nobody can be put in the unit, so allowing it over a confirmed booking produces a unit that is simultaneously sold and unusable — and the guest finds out at the door. The refusal names how many bookings are in the way and the first reference, so the clerk can move or cancel them on a screen they already have. Warning and allowing was considered and rejected: it puts that decision in a toast nobody reads.

**[C] A unit carries its own note** (capability B14, answering the second half of open-questions.md N18). A standing fact about the unit — a sticking door, where the spare key lives — belongs to the unit rather than to whoever is staying in it, so it survives every booking. One editable block rather than an append-only thread, because the fact stops being true when somebody fixes it; every edit is an audit event carrying the text before and after, so the trail is the thread. Written under `unit.manage`, which is what makes it a thing Housekeeping can record.

**[A] A lease records a name, a start date, and nothing else that is required.** §6.2 sketches a `Tenancy` with a tenant record and a monthly rent, and §16 makes that Phase 3. B9 asks only that availability reflects reality and that staff can see who is in the unit, so the occupant is free text on the occupancy row until the tenancy module gives it a real relationship. No rent, agreement or renewal is recorded, and the screen says so.

**[C] A lease's end date is optional** (open-questions.md N19, answered 3 September 2026). A month-to-month tenancy has no agreed last day, and requiring one made staff invent a date so the system would accept the truth — a made-up date in a field that drives availability is worse than no date at all, because nothing on screen distinguishes it from a real one. A lease with no end date runs until somebody ends it, and "End the lease" is the same action whether it is moving a last day or setting the first one. This costs availability nothing: an occupancy is a range, and an open-ended one is unbounded above, so the exclusion constraint blocks every future booking over the unit by construction (architecture.md §5.2). **A booking's end date stays required** — a stay is sold and priced by nights, and one with no checkout is not a thing the product can express.

---

## 7. Inventory

### 7.1 Unit types

| Type | Rate/night | Max pax | Car parks | Bed configurations | Units |
|---|---|---|---|---|---|
| 2-bedroom | 180 | 4 adults + 2 children | 2 | 1 king + 1 twin, or 2 king | **[O] unknown** |
| 3-bedroom | 200 | 8 | 2 | 2 king + 1 twin, or 3 king | 36 |
| 4-bedroom | 250 | 10 | 2 | 3 king + 1 twin, or 2 king + 2 twin | 6 |
| Semi-detached (4 rooms) | 320 | 20 | 4 | 3 king + 1 twin, or 2 king + 2 twin | 6 |

**[C]** Extra person charge: 7 per person per night. Guests aged 3 and below are not counted. See §8.2.

**[O]** Units of the same type are not interchangeable, because bed configuration differs. It is unconfirmed whether guests may choose or request a configuration, or whether it is assigned by staff.

**[O]** The database seeds the 48 confirmed units only. The 2-bedroom **type** exists and prices correctly, with **zero units**, until N1 is answered. Unit references are provisional pending N10.

**Both are now answerable in the product rather than in a migration** (capability F6). The unit registry screen sets the number of units of each type and what each one is called, so N1 is a number typed into a field and N10 is a naming pattern with a live preview. Neither question is *answered* by that — a count nobody has agreed is still not a fact, and both stay open in the register — but neither blocks a screen any more, and the seeded 48 and the `3B-01` scheme remain the starting point until somebody changes them.

**[A] A rename is retrospective, deliberately.** `booking_summary.unit_ref` reads through to the unit, so renaming `SD-01` to `Villa 1` relabels every stay that unit has ever hosted. That is the intent: the reference is what staff *call the door*, and a completed booking that still names a door nobody uses is the confusing outcome, not the safe one. The rename is recorded against the unit with who did it and when, which is where the old name lives. Snapshotting a reference onto each booking is out of scope.

### 7.2 Facilities

| Facility | Included in day pass |
|---|---|
| Swimming pool | **[C]** Yes |
| Water park | **[C]** Yes |
| Indoor children's playground | **[C]** Yes |
| BBQ area | **[C]** No |
| Gym | **[O]** Pending Ladyboss decision |
| Snooker table | **[O]** Pending Ladyboss decision |
| Sauna room | **[O]** Pending Ladyboss decision |

**[A]** Facility inclusion is a per-facility toggle in configuration, so pending decisions become a settings change rather than a code change.

**[A]** Facility capacity is configurable per facility. The configured number represents headroom available to day-pass visitors, not raw physical capacity, because long-term tenants have facility access at no service charge and form a permanent baseline load.

---

## 8. Pricing engine

Pricing is a line-item calculation, never a single stored price. Every booking produces itemised `BookingLine` records that sum to a total.

### 8.1 Day passes

**[C]** Per-person rates: age 1 to 12 = 5. Age 12 and above = 10.
**[C]** Family bundles: 2 adults + 1 child = 20. 2 adults + 2 children = 25.

**[O] The age bands overlap at 12.** Must be resolved to a clean boundary. Pricing for under age 1 is undefined.
**[O]** Bundles are defined only for two combinations. Any other family shape (1 adult + 2 children, 2 adults + 3 children) has no stated rule.

**[A] Implementation.** Price per person by age band, then apply the best matching bundle override automatically. The customer is never charged more than the cheapest applicable combination. This avoids a self-declared "family" category that cannot be verified and removes the need for two parallel pricing modes.

### 8.2 Short stays

```
total = (base_rate × nights)
      + (extra_persons × 7 × nights)
      + (sofa_beds × 28)
      + (early_checkin_hours × 10)
      + (late_checkout_hours × 15)
```

**[C]** Extra person rate is 7 per person. Guests aged 3 and below are not counted.
**[O]** The under-3 exemption is stated for the apartments but not for the semi-detached. Assume it applies unless told otherwise.
**[O]** "Max for 8 pax" alongside "7 per extra person" is contradictory. Clarify whether max pax is a hard ceiling or a threshold above which the extra charge applies.
**[C]** Sofa bed: 28, includes one pillow and one blanket, subject to availability.
**[O]** Total number of sofa beds available across the property is unknown. Model as property-level add-on stock, not per unit.

**[A] Early check-in requires an availability check, not just a charge.** Check-out is 12:00 and units target readiness by 14:00. Early check-in is only sellable when the unit was vacant the previous night or has passed inspection. Selling it as a simple paid extra will place guests in units still being cleaned.

**[O]** Standard check-in time is not stated, so "early" is currently undefined.

### 8.3 Long-term

**[C]** Flexible, negotiated per tenancy. Not rate-card driven. Stored on the `Tenancy` record.

### 8.4 Discounts

The PRD has never described a discount, and staff asked for one: a guest at the desk negotiates, and the alternative is a clerk quietly typing a different total into a spreadsheet. The following are **[A]** assumptions made when the discount was built, and are the ones to put in front of the client.

**[A] A discount is a line, not an adjusted total.** §8's rule holds unchanged — the total is the sum of the lines — so a discount appears on the booking as a negative `discount` line and the receipt still explains itself. Nothing anywhere subtracts a figure from a stored price.

**[A] Two shapes: a fixed amount in BND, or a whole percentage of the priced lines.** Both are what staff actually say. The **instruction** is stored on the booking as well as its effect, which is what lets an amendment re-derive it: a stay given ten percent off and then extended by a night is discounted ten percent of the longer stay, not the dollars the shorter one happened to produce.

**[A] The security deposit is never discounted.** §11 makes the BND 100 a refundable liability rather than revenue, so a discount applies only to the priced lines above it. Taking money off a sum that is given back is a shortfall at release time, not a discount.

**[A] A typed reason is required, and is enforced by the database.** Not by the form alone. A discount is discretionary money, and the first question anyone asks about one later is what it was for. The reason is staff-facing only — it is never shown to the guest and never printed on a receipt.

**[A] Discounting is its own permission, `booking.discount`.** Every other permission gates an operational act; this one gates giving money away, so it is separable from `booking.create` and can be withheld from a role that otherwise takes bookings all day. Seeded to Admin and Front Office. A staff member who does not hold it never sees the control — and amending a discounted booking **carries the existing discount through untouched**, so changing a guest's phone number cannot silently restore full price.

**[A] There is no cap and no approval step.** A discount of up to the whole booking is allowed — comping a stay outright is a real thing a manager does — and it is recorded rather than gated. **[O] Whether the client wants a ceiling, or a second person's sign-off above some figure, is [N17](open-questions.md).**

**Every discount is its own audit event** (`booking.discounted`), on creation and on every amendment that moves one, including removal. "Show me every discount given this month" is therefore a lookup on one verb rather than a scan through booking history.

---

## 9. Booking flows

### 9.1 Constraints

**[C]** Maximum advance booking period is two months.
**[C]** Full payment is required to secure a unit. Unpaid bookings do not hold inventory.

**[A] One qualification, added when the payment layer was built.** A booking taken at the desk and paid by bank transfer holds its unit from the moment it is created — its occupancy row counts against the exclusion constraint — and stays held until someone confirms the money landed. That is §9.3's checkout timer in substance, but **nothing expires it**: the duration is [N7](open-questions.md), still open, and the expiry job in architecture.md §6.3 is unbuilt. Until N7 is answered, an abandoned transfer blocks a unit until a staff member cancels it. The verification queue sorts oldest-first and shows the wait so this is visible rather than silent.

### 9.2 Booking states

```
draft → held → awaiting_payment_verification → confirmed → checked_in
      → completed
      ↘ expired (hold lapsed)
      ↘ cancelled
      ↘ no_show
```

### 9.3 The hold

**[A]** A short hold is required despite the "full payment secures" policy. Between a customer submitting a booking and their transfer landing, the unit must be reserved or two customers will pay for the same night and one requires a manual refund. Refunding a bank transfer by hand is materially worse than a short hold.

Framed to the client as a **checkout timer**, not a reservation: the unit is held while payment completes, then released automatically.

**[O]** Hold duration to be agreed. Suggested default: 60 minutes for stays, 30 minutes for day passes.

### 9.4 Manual booking (staff)

**[C]** Staff can check availability and create a booking on the spot, using the same availability check, pricing engine, and document capture as the public flow.

**[C] v1 supports walk-ins only.** The guest is present and pays immediately. The booking is created and paid in a single action, and no unit is ever held against an unpaid promise.

**[A] "Pays immediately" covers both methods in §10.1.** Cash is counted at the desk and the booking is confirmed outright. A bank transfer is sent from the guest's phone while they stand there — payment made, but not yet payment seen — so the booking goes to the verification queue and someone checks the bank (§10.3). Neither is the booked-ahead, pay-on-arrival case excluded below: in both, the guest has actually paid. This is what gives the queue something to work on before the public flow (phase two) exists. The qualification in §9.1 applies to the transfer path.

**[C] Booked-ahead, pay-on-arrival is explicitly excluded from v1.** Staff cannot reserve a unit for a customer who intends to pay cash on the day. Advance bookings require payment, in line with stated policy.

**Adoption risk to manage, not a build risk.** If staff currently hold units informally for regular cash customers, v1 removes that ability. This should be raised with the client before go-live rather than discovered by a front office staff member turning a regular away. If it later proves necessary, it is an **additive** change: the state machine already carries a `held` state with an expiry, so adding a `confirmed_payment_due` state with the authorising staff member recorded against it is a small extension, not a rework.

### 9.5 Cancellation and no-show

**[C]** The deposit paid is forfeited on cancellation or no-show.
**[O]** Ambiguous which deposit this refers to. The BND 100 security deposit is collected on arrival, so a no-show never pays it. This most likely means the prepayment. **The two must be named distinctly in the product** (for example "booking payment" and "security deposit") before the ambiguity propagates into the schema.

**Partly addressed.** The naming demand is met: the schema names the refundable BND 100 `security_deposit_cents` and never a bare `deposit`, and the booking payment is a separate concept per the §6.2 entity list. **N5 itself remains open** — which of the two is forfeited is still unanswered. Cancellation is now built (capability B3) and deliberately moves no money: it releases the unit, records who cancelled it, when and why, and states on screen that settlement happens outside the system. Nothing in the schema or the code depends on the answer, so N5 can still be answered either way — but it is now the one thing standing between the cancel screen and being complete.

### 9.6 Amendment

The PRD has never stated rules for changing a booking after it exists — §4 grants Front Office `booking.amend` and nothing defines what may be amended. The following are **[A]** assumptions made when capability B3 was built, and are the ones to put in front of the client.

**[A] What can be changed:** dates, unit, party size, sofa beds, late check-out, and the guest's name, phone and vehicle. Every change reprices through the same engine as creation; the price charged is always the one the server derives, never one submitted by a screen.

**[A] Which bookings can be changed:** anything not yet checked in and not closed — `draft`, `held`, `awaiting_payment_verification`, `confirmed`. Closed bookings (`completed`, `expired`, `cancelled`, `no_show`) are kept as a record.

**[O] Amending a booking whose guest has already checked in is not supported.** Extending an in-house guest by a night is a real front-office need, and this is the one exclusion likely to be felt in practice. It is excluded rather than half-built because §9.1's two-month advance window is implemented as "check-in cannot be in the past", so repricing a stay that has already begun is refused by the pricing engine. Enabling it means deciding what a mid-stay reprice charges for nights already taken — a pricing question, not an interface one. **To confirm with the client.**

**[A] A cancellation requires a typed reason; an amendment's is optional.** B3 promises who, what and when. The reason adds why, and the two differ because an amendment already records both sides of every field it touched, whereas a cancellation would otherwise record only that it happened — and §9.5 forfeits a payment on one.

**[A] Money is not moved by either action — but an amendment now records what it left owing.** A cancellation still calculates no refund or forfeiture at all. An amendment still moves no money, but the difference it creates is no longer only a sentence on screen: the booking carries it as an outstanding balance and it can be settled in cash or by bank transfer from the booking itself (§10.7). A price *reduction* is unchanged — that is a refund, and refunds are settled outside the system. This is a direct consequence of **N5 being open** (§9.5): the platform cannot state a forfeiture policy it has not been given. It is also consistent with architecture.md §6.4, where a v1 refund is a recorded instruction executed by a person in a banking app, never an automated movement.

### 9.7 Notes on a booking

Nothing in the PRD gives staff anywhere to write down what they know about a stay, and §2 records that the current system is WhatsApp — which is mostly this. A booking with no scratchpad is a booking whose context stays in a chat thread nobody else can search. The following are **[A]**.

**[A] Notes are a thread, not a field.** Each note records its author and the moment it was written, and notes are **append-only**: no edit, no delete, and a correction is a further note. A mutable text box would let one person overwrite another's account of the same guest without trace, which is exactly the value a note has in a dispute.

**[A] Each note carries an audience: `internal` or `housekeeping`.** One system, not two. "Notes for the team" and "notes for the cleaner" are the same act differing only in who needs to read it, and the tag is what lets the housekeeping field screen (C-series) show its subset when that screen is built. Both appear in one thread in the portal, each labelled, so an office note and a housekeeping note about the same guest sit next to each other.

**[A] Anyone who can view a booking may add a note.** Deliberately not a permission of its own. A note moves no money, changes no status and releases no unit, and a note nobody may add is a note everyone keeps in WhatsApp instead. If a role should read notes without writing them, that is one permission string added later.

**[A] Notes are not audit events, and audit events are not notes.** A note carries its own author and timestamp and is never mutated, so a second row asserting that somebody wrote something would say nothing the first does not. The two live side by side on the booking screen: the history is the system's account of what happened, the notes are the staff's.

**[O] A note about the *unit* rather than the stay is not modelled.** "The shower door sticks" outlives every booking, so hanging it off one loses it the moment the guest leaves. It belongs with the inspections slice (§11) and is [N18](open-questions.md) — which also asks whether the housekeeping audience is genuinely useful before the field screens are built around it.

---

## 10. Payments

### 10.1 Methods in v1

**[C]** Bank transfer to BIBD or Baiduri. Cash on site.
**[C]** No card payment in v1. Deferred to a later phase pending merchant onboarding.

### 10.2 Payment reference

Every booking generates a unique, human-readable payment reference (for example `PV-4821`). The customer enters it in the transfer description.

This is the highest-leverage detail in the payment design. It turns verification from name-matching into a direct lookup, and it is the prerequisite for automated statement matching later.

### 10.3 Transfer flow

1. Customer completes booking and selects bank transfer.
2. System displays bank details, amount, reference, and a countdown.
3. Customer transfers and uploads the slip.
4. Booking enters `awaiting_payment_verification` and appears in the staff queue.
5. Staff check the bank app, match reference and amount, and confirm.
6. Booking becomes `confirmed`. QR is issued.

### 10.4 Verification queue

Each row shows reference, guest name, amount expected, time waiting, and the uploaded slip.

**Required behaviours:**
- Match on **amount as well as reference**. A short payment must flag rather than auto-confirm.
- Provide a **manual match escape hatch**. Customers will omit the reference. Without a way to attach an arbitrary payment to a booking, staff will revert to WhatsApp.
- Treat the slip as **evidence, not verification**. Slips can be edited. Staff still check the bank. The slip's value is dispute resolution and automatic inclusion in the accounting pack.

**As built.** A mismatched amount can only be confirmed through an explicit override that records a reason — architecture.md §6.2 tightened "must flag" into that, and it is enforced by a database constraint, not only by the screen. An overpayment is refused without a reason exactly as firmly as a short payment: an overpayment is a refund conversation, and refunds are [N5](open-questions.md), open.

**The slip arrived with the documents slice** (7 September 2026, capability B10), and the delta against scope-of-capabilities.md B4 is closed. The queue's cell reads *On file* or *None*, and a slip is attached from the booking. Two things are deliberately unchanged by it: the bank app is still the check — the slip is filed under the payment as a record rather than presented as something to approve against — and **a slip belongs to a bank transfer** [A], because cash was counted at the desk and has no slip to send. Customer-facing upload (A6) is still phase two; what exists is staff attaching what a guest sent them over WhatsApp, which is exactly what §2 describes them doing today.

### 10.5 Cash

**[C]** Cash is collected on site and reconciled against recorded transactions and receipts, verified by Finance.

Requirements: record who collected, when, and against which booking. Provide a daily cash-up view comparing recorded cash against banked amounts.

**[A] "Verified by Finance" is read as the daily cash-up**, not a per-payment approval step. A cash payment is therefore recorded as verified when it is taken — there is no bank to check, the clerk is holding the notes — and Finance's reconciliation is the separate cash-up screen. If the client means a per-payment sign-off, that is a third payment status and an additional screen; additive, but it should be asked rather than assumed.

**[A] Who and when are the acting user and the moment of recording**, not editable fields. The schema carries both as columns, so back-dating or recording on a colleague's behalf is a later form change rather than a migration.

**Cash gets the same amount rule as a transfer.** Where the notes do not add up to the booking total, a person says why; the system does not write its own justification to satisfy the constraint.

### 10.7 Settling what a booking still owes

Added when the amendment path made the gap real. Nothing in §10 described what happens when a booking's price moves *after* it has been paid — and §9.6 said only that the difference is "collected outside the system", which stopped being good enough once staff had no way to record collecting it. The following are **[A]**.

**[A] A booking knows what it owes.** `total − paid`, where `paid` is the sum of the payments actually **verified** against it. A promised transfer counts for nothing until somebody has checked the bank, which is the same rule §10.4 already applies to confirmation. The figure is derived from the payment rows on every read, never stored: a stored total is a second copy of one the payments already hold.

**[A] The amount rule now matches against the balance, not the total.** §10.4's "match on amount as well as reference" and §10.5's cash equivalent both compared what arrived against the whole booking. On a top-up that made the ordinary case look short — settling the second night of a BND 400 booking with BND 200 demanded a written override, and a flag that fires on the routine case stops being read. It compares against what is outstanding. For a booking with one payment, which is every booking taken before this, the two figures are identical.

**[A] Both methods can settle a difference, from the booking itself.** Cash is counted at the desk and settles immediately. A bank transfer is raised as pending, appears in the verification queue like any other, and settles only once confirmed — **and it carries no amount when raised**, because a pending transfer has been promised rather than seen. One transfer at a time per booking: two pending rows for the same money means whichever is confirmed first silently makes the other wrong.

**[A] Owing money is not a status.** A booking with a balance outstanding stays `confirmed`; the amount is stated beside it rather than encoded in the state machine. §9.2's states describe the *stay* — where the guest is in their journey — and a second axis running through them would have to be answered by every screen that filters on status.

**This is not part payments.** §9.1's **[C]** stands: full payment secures a unit, and nothing offers a guest the choice of paying half up front. What is now expressible is a shortfall the *system itself* created by repricing a booking somebody had already paid for. The balance being computable does make instalments mechanically possible — worth stating plainly, because it means the policy is now enforced by the product declining to offer them rather than by the schema being unable to represent one. **[N16](open-questions.md) is unchanged and still the client's to answer.**

### 10.6 Later (out of scope for v1)

**[A]** Automated matching will realistically be **statement CSV import matched on payment reference**, not a live bank API. Brunei business banking is unlikely to offer programmatic access. Only exceptions reach the manual queue. Same screen, less work.

---

## 11. Deposits, inspections and charges

**[C]** Security deposit: BND 100, refundable.
**[C]** Process: Housekeeping inspects the unit after check-out. Once condition is confirmed, deposit release is authorised by the approving role. Damages or charges are deducted before the balance is released.
**[C]** Additional charges apply if costs exceed the deposit. **The deposit is not a cap on liability.**

### Requirements

1. Deposit tracked as a liability from collection to release. An "outstanding deposits" view must exist.
2. Inspection records outcome, notes, and **photographs**. Photo evidence is the cheapest thing that improves dispute outcomes.
3. Charges are itemised with a reason and an author.
4. Approval is gated: the approve action is unavailable until inspection is recorded and charges entered.
5. Approval is a **recorded event** (who, when, amounts), not a status flag. The audit trail is the point of an approval step.
6. Where charges exceed the deposit, the balance becomes an outstanding amount owed, with a shareable statement.

**Note for the client conversation.** Recovery of charges above BND 100, with no card on file and no legal step, will be poor in practice. The system provides the record, not the collection. If damage above the deposit proves recurrent, the commercial fix is raising the deposit, which is the client's decision.

### As built (capabilities E1–E3, 6 September 2026)

Six requirements above; five are met as written and one is not. The following are **[A]** assumptions made while building, and are the ones to put in front of the client.

**[A] The deposit is collected at check-in, as part of checking the guest in.** One action, one transaction: the booking moves to `checked_in` and the deposit row is written together, because a guest checked in with no deposit recorded is precisely the gap in the spreadsheet this replaces. It is taken in cash or by bank transfer, for the amount the booking quoted, and it cannot be skipped or waived — a deposit somebody decided not to take is a conversation, not a field. A booking quoting no deposit checks in without one, and the screen says so rather than implying money changed hands.

**[A] `booking.security_deposit_cents` stays the quote; the deposit row is what was taken.** The two can differ, because an amendment can reprice a booking after it was quoted, and what is held must not move with it. Every screen that used to read the quoted figure and call it "held" now says which of the two it means.

**[A] An inspection is recorded once per stay, after check-out, with one of two outcomes** — *clean* or *issues found* — and notes are required when something was found. Two outcomes because this section branches exactly once: condition confirmed, or damages to deduct. A finer taxonomy would be categories nobody asked for, and the notes carry the detail in the inspector's own words.

**Requirement 2 is now met: photographs arrived with the documents slice** (7 September 2026, capability B10). An inspection carries any number of them, stored privately, deleted automatically after two years, with every access logged and who attached each one on the record — see §13's as-built block. They are attached under `inspection.record`, the inspection's own permission rather than a second one, and are **not frozen when the release is approved**: a photograph taken to support a charge is evidence, and locking the evidence at the moment of approval was a rule nobody asked for. The delta against scope-of-capabilities.md C2 is closed.

**[A] Requirement 4's "charges entered" is satisfied by the approver seeing them.** The inspection is a hard gate — the database refuses a release without one — but a release with no charges against it is the ordinary case, so there is nothing to require. What the approval screen does instead is state the itemised charges and the three resulting figures before the click.

**[A] Charges can be raised from check-in until the release is approved, and approval closes them.** A broken window on the second night is a charge against that deposit, and making somebody wait for the guest to leave is how it ends up in WhatsApp. Approval freezes the list, because the statement a guest is given has to be what was signed off. A charge is **waived rather than deleted** — `charge.waive` is Finance's, so dropping one is a decision, and a decision that leaves no row is one nobody can review.

**[A] Approval records who, when, and three figures — returned, charges, owed — and moves no money.** Requirement 5 read literally. The figures are computed in the database under the deposit's own row lock, so a charge added while the dialog was open is either counted or refuses the approval; it can never be signed against a list that moved. Handing the notes back happens at the desk, which is the position architecture.md §6.4 already takes on refunds.

**[A] Where charges exceed the deposit, the excess is recorded as settled by whoever may record a payment** (`payment.record_cash`). It is not a booking payment: it settles no booking and appears in no cash-up. Whole amounts only — a part payment against an excess, and what happens to one nobody ever pays, are [N21](open-questions.md).

**[A] A deposit's stage is derived, never stored** — from the release, the inspection and the booking's status. The same reasoning architecture.md §5.1 gives for `unit.status`.

**The statement is a printable page rather than a generated file.** Every browser prints to PDF, staff already forward images over WhatsApp, and a document that is also a URL is one a colleague can open. It renders only once a release is approved, because before that the figures can still move and a statement whose numbers change after it was sent is worse than none.

---

## 12. Arrival and check-in

**[C]** On booking confirmation, the customer receives a QR code, delivered as a forwardable image alongside the confirmation link so staff can send it in an existing WhatsApp conversation.

### Requirements

1. The QR encodes a URL containing a **random opaque token**, not a booking ID. Sequential IDs allow enumeration of other guests' bookings.
2. The token is stored against the booking, indexed, and **revocable and regenerable**.
3. **Authority comes from the staff session, not the QR.** A logged-in staff member scanning sees the check-in action and the event records who performed it. A customer scanning their own code sees only their booking summary. A leaked or forwarded QR grants nothing.
4. **No scanner is built.** Native iOS and Android camera apps read QR codes and open URLs. In-browser scanning is a later convenience, not v1.
5. **Vehicle registration lookup is a first-class path, not a fallback.** A car arrives and the guard sees a plate. Search by plate or name, with today's arrivals listed by default. Expect plate lookup to carry more traffic than QR scanning.
6. The guard's screen displays **payment status**, so an unpaid cash arrival is flagged and routed rather than waved through. The guard does not confirm payment.
7. The booking reference appears in plain text beside the QR for manual fallback.
8. Render at minimum 200px with default quiet zone. Error correction level M for screen, H if ever printed.

**[O]** Whether the guardhouse has reliable signal or wifi. If not, today's arrivals list must load once and function from cache.

---

## 13. Documents and data protection

**[C]** A copy of the guest's IC is required for registration. Name and vehicle registration are required for records and security.

**[A] A booking records every vehicle arriving on it, and the guest with no car says so explicitly.** §6.2 already sketches vehicle registrations as a list, and §12.5 makes plate lookup the guard's primary path — a family arriving in two cars has one of them unfindable at the gate if only one plate is stored. Two assumptions sit on top of the [C] above, neither confirmed with Jason:

- **A guest may genuinely arrive without a car**, and the booking form accepts that as a ticked exception rather than a blank field. "No car" and "nobody asked" are different facts and are stored differently ([architecture.md §5.1](architecture.md)); the exception is deliberately made the awkward option, not an equal choice.
- **No cap is enforced against the unit type's `car_allowance`** (§7.1). A family that turns up in three cars for a two-car unit is a fact Security needs recorded, not a booking to refuse; whether that is chargeable or capacity-limited waits on **R3** in the [open-questions register](open-questions.md), which asks how many bays the property actually has.

Brunei's Personal Data Protection Order 2025 commenced most substantive provisions on 1 January 2026, covering collection, use, disclosure, retention and access rights, with significant penalties for non-compliance.

### Requirements

1. Identity documents stored encrypted at rest, never in a public bucket, served via short-lived signed URLs.
2. Access to identity documents gated behind an explicit permission, and every access logged.
3. A configurable **retention period** per document kind, with expiry and deletion. The current practice of indefinite accumulation is the specific problem being solved.
4. Automatic generation of the accounting record pack: transfer slip, IC, transaction confirmation, itemised booking. Replaces manual PDF assembly.
5. Data export capability for the client, in a usable format.

**Migration position.** The system holds data from go-live onward. The existing folder of accumulated documents is **not** migrated. Taking custody of historical identity documents with unverifiable consent imports a liability that was not created by this project.

**Note.** This document does not constitute legal advice. The client should take their own advice on their obligations.

### As built (capabilities B10, G2–G4, 7 September 2026)

Requirements 1, 2 and 3 are met; requirement 4 (the accounting pack) is not built and requirement 5 (data export) is capability F5, unbuilt. The technical shape is [architecture.md §8.1](architecture.md). The following are **[A]** assumptions made while building, and are the ones to put in front of the client.

**[A] Three kinds of document, one mechanism.** A guest's IC on the booking, a transfer slip on a payment, and photographs on an inspection all use the same private storage, the same permission gate, the same access log and the same retention clock. That is why the slip (§10.4) and the inspection photographs (§11 requirement 2) arrive with this and not separately: they were never a different problem.

**[A] Who may open what, and who may attach it.** §4 mints exactly one document permission, `document.view_identity`, held by Admin and Front Office. That settles the sensitive half. The rest reuse the permission that already means the same job — a slip is attached and opened by whoever verifies payments, a photograph by whoever records the inspection — and **an identity document is attached and removed under `booking.amend`**, because putting an IC on file is a change to the booking's record. Attaching is deliberately *not* limited by booking status the way an amendment is: an IC that turns up after check-out is still the record this system exists to keep. **[O] [N23](open-questions.md)** puts the whole table to the client, along with its one non-obvious consequence — a role configured with `booking.amend` and without `document.view_identity` could remove an identity document it cannot open. No seeded role is in that position.

**[A] Existence is not content.** Anyone who may view a booking sees *that* an identity document is on file, what kind it is, how big it is and when it arrived; only opening it is gated. **The filename is not among them**, and that was a correction: an IC arrives named by whoever scanned it, so printing it would hand the guest's name — and often their IC number — to every reader the file itself was withheld from, through the one field nobody had gated. A reader who may not open it is shown the kind of document instead. A guard who can see the IC was collected is being told something useful and shown nothing, and hiding the row entirely would make "did anyone take it?" unanswerable by the people whose job it is to ask. Security and Housekeeping therefore see the row and never the file, which is the principle §4 states.

**[A] Retention is anchored differently per kind.** An identity document is kept twelve months after **checkout**, and its clock follows the stay — extending a booking moves it. A slip and a pack run seven years from when they were taken, because an accounting record dates from the transaction; a photograph two years from the inspection. Periods are configuration, not code, and capability F3 is the screen that edits them.

**[O] What a cancelled booking's identity document should do is [N22](open-questions.md).** It keeps an anchor on a checkout that never happened. Under the PDPO the client may well want it destroyed sooner, and that is their call rather than an assumption to bury in a default.

**[A] A document is destroyed but its record is not.** When a retention period ends the file is deleted from storage permanently; the row survives as a tombstone, so the trail of who attached it and who opened it stays readable afterwards. That is the point rather than a technicality — the questions asked about an identity document are usually asked once it is gone.

**Every access is logged, and the log is on the screen.** Requirement 2's "every access logged" is an audit event per issued link, and it renders in the booking's own history as "Identity document opened", with who and when. A log the client cannot read is a control they were told about and cannot check.

**One limit is the platform's rather than a policy: 4 MB per file.** Phone photographs and WhatsApp screenshots sit well under it. See architecture.md §8.1 for what raises it when the housekeeping phone screen needs more.

---

## 14. Reporting

v1 reporting is deliberately minimal:

- Occupancy by unit and by type, over a date range
- Revenue by stream (day passes, short stays, long-term)
- Outstanding deposits held
- Outstanding charges owed
- Daily cash-up: recorded versus banked
- Day pass volume against configured capacity

---

## 15. Non-functional requirements

| Area | Requirement |
|---|---|
| **Platform** | Responsive web application. No native apps. Field screens must work on mid-range phones over mobile data. |
| **Availability integrity** | Double booking must be structurally impossible. Enforce with a database-level constraint on overlapping occupancies, not application logic alone. |
| **Timezone** | Brunei time (UTC+8). All dates stored in UTC, displayed local. |
| **Currency** | BND. |
| **Language** | English. **[O]** Whether field screens require Malay is unconfirmed. |
| **Audit** | All state changes on bookings, payments, deposits and charges recorded with actor and timestamp. |
| **Backups** | Automated daily, with a tested restore procedure. |
| **Support** | Support terms to be defined separately. This is a 24/7 operational system and unbounded informal support is the primary delivery risk. |

---

## 16. Phasing

### Phase 1: Operations portal
Unit registry and lifecycle, facility configuration, pricing engine, availability, booking records, manual booking creation, payment verification queue, cash recording, deposit and inspection workflow, document storage with access control, accounting pack generation, auth, roles and permissions, basic reporting.

*Indicative: 150 to 200 hours.*

**Rationale for building this first.** The spreadsheet is the acute pain, not the absence of online booking. This phase delivers value in weeks, validates the data model against real bookings before payment is exposed publicly, and leaves the client materially better off than Excel even if the project stalls. It also serves all three streams permanently, whereas the public booking site serves the two streams the client intends to phase out.

### Phase 2: Customer-facing
Public availability and booking, day pass and short stay flows, payment instructions and slip upload, QR issue and delivery, security check-in screen, housekeeping checkout screen, FAQ.

*Indicative: 120 to 160 hours.*

### Phase 3: Long-term tenancy (thin)
Unit occupancy by tenant, tenancy records with start and end dates, rent periods with paid/unpaid status, agreement file attachment.

*Indicative: 40 to 60 hours.*

**[C]** v1 is intended to cover phases 1 and 2.

**On rent tracking:** rent status must be modelled as **one row per rent period** (due date, amount, status, date paid, method, reference), not a boolean on the tenancy. The boolean version looks identical in the UI for the first month and becomes unusable thereafter, by which point real data is in the wrong shape.

**On lease end dates:** in scope even in the thin version, because forward availability cannot be answered without them. Renewal alerts then fall out as a date filter with no additional machinery. **They are optional rather than required** — see §6.4 **[C]**: an open-ended tenancy is an unbounded range, which availability answers perfectly well ("occupied, indefinitely"), and the alternative was staff typing dates nobody had agreed. Renewal alerts filter the leases that *have* an end date; a month-to-month tenancy is not a renewal question.

### Deferred beyond v1
Card gateway, automated statement matching, WhatsApp Business API, full tenancy management, events and parties as a product, multi-property administration UI, channel management.

---

## 17. Assumptions

| # | Assumption | Impact if wrong |
|---|---|---|
| A1 | "$" in client materials means BND | Pricing display |
| A2 | The 48-unit total excludes 2-bedroom units, which are additional | Inventory setup only |
| A3 | Under-3 exemption applies to semi-detached as it does elsewhere | Minor pricing |
| A4 | Guests do not select bed configuration; staff assign | Booking flow complexity |
| A5 | Day pass is a single all-day session, not time slots | Capacity model |
| A6 | Confirmations and QR delivered by email, with a forwardable image for WhatsApp | Delivery mechanism |
| A7 | Long-term tenants are not counted against day pass capacity, but reduce configured headroom | Capacity configuration |
| A8 | English only for v1 | Field screen adoption |

---

## 18. Open questions

**Moved to [open-questions.md](open-questions.md), which is now the single register.**

They lived here, at the end of a long document, mixed in with the questions that had already been answered — which made them hard to find and easy to leave stale. They are now one file, ordered by what is actually holding something up, phrased as questions to put to a person rather than as engineering notes, and each one recording what was assumed in the meantime so nothing was blocked waiting on an answer.

The register is normative for what is unanswered. **An answer never lives only there:** when one comes back it is written into whichever document owns the decision — this one for a business rule, architecture.md for a technical one — and the entry moves to the register's Answered section. That is the same rule as before; only the location changed.

Two things stand out as you read the rest of this document:

- **N5** — which payment is forfeited on cancellation. The cancel screen is built and deliberately moves no money.
- **N7** — how long a unit is held for an unpaid transfer. The verification queue is built and nothing expires an abandoned one.

Both are marked **[O]** at the point they arise in the sections above.

---

## 19. Commercial and ownership

**Working position for this draft:** the developer retains ownership of the platform.

- Developer retains ownership of the platform code.
- Client receives a perpetual, irrevocable, non-exclusive licence to use it for their properties, including the client's other buildings.
- Client owns all of their data outright, with an export right in a usable format.
- If the developer ceases to support the platform, or the engagement ends, the client receives a source release so they are not stranded.
- Pricing reflects retained ownership and should be below the cost of a full assignment. Exclusivity, if requested, is a separate and more expensive arrangement.

**Outstanding.** Support terms after launch. Payment terms and currency. Governing jurisdiction, given a UK-based developer and a Brunei client.

**Note.** Contract terms should be professionally drafted. Employment contract IP clauses should be checked before agreeing anything.

---

## 20. Success criteria

1. The spreadsheet is no longer used for bookings within one month of Phase 1 go-live.
2. Staff can create a booking faster in the portal than in the spreadsheet, measured on day one.
3. Payment verification takes under 30 seconds per booking.
4. Availability is answerable without asking a person.
5. "What deposits do we currently hold" is answerable in one screen.
6. Accounting packs require no manual assembly.

**Primary delivery risk.** Jason is a booking taker, the accountant, and the decision maker. He is the primary user, not a stakeholder who delegates. If a screen does not save him time on day one, it can wait. In a small operation, an over-engineered system is quietly abandoned and everyone drifts back to WhatsApp.
