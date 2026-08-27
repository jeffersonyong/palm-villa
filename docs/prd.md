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

> **Document map.** This PRD owns business rules, pricing, flows, roles and open questions. `architecture.md` is normative for all engineering decisions (stack, data model implementation, security, infrastructure) and supersedes the technical sketches here (§6, §15) where they differ. `design.md` is normative for the design system.

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
booking.cancel        booking.override_hold
payment.verify        payment.record_cash
inspection.record     charge.create         charge.waive
deposit.approve_release
unit.manage           tenancy.manage        config.manage
report.view           document.view_identity
```

**[C]** Deposit release approval sits at the end of the pipeline, with Finance or Jason, not with Housekeeping or Front Office. Housekeeping records the inspection; a separate role approves.

### Predefined roles

**[C]** v1 ships with a fixed set of roles, each pre-assigned a permission set. Users may hold **more than one role**, which is what makes the uncertain team structure a non-issue. Roles and their permissions are editable in the admin UI later without code changes.

| Role | Permission set |
|---|---|
| **Admin** | All permissions, including `config.manage` and `document.view_identity` |
| **Front Office** | `booking.*`, `payment.verify`, `payment.record_cash`, `charge.create`, `unit.manage`, `document.view_identity` |
| **Housekeeping** | `inspection.record`, `unit.manage` (status only), read-only booking view for today |
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

---

## 9. Booking flows

### 9.1 Constraints

**[C]** Maximum advance booking period is two months.
**[C]** Full payment is required to secure a unit. Unpaid bookings do not hold inventory.

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

**[C] Booked-ahead, pay-on-arrival is explicitly excluded from v1.** Staff cannot reserve a unit for a customer who intends to pay cash on the day. Advance bookings require payment, in line with stated policy.

**Adoption risk to manage, not a build risk.** If staff currently hold units informally for regular cash customers, v1 removes that ability. This should be raised with the client before go-live rather than discovered by a front office staff member turning a regular away. If it later proves necessary, it is an **additive** change: the state machine already carries a `held` state with an expiry, so adding a `confirmed_payment_due` state with the authorising staff member recorded against it is a small extension, not a rework.

### 9.5 Cancellation and no-show

**[C]** The deposit paid is forfeited on cancellation or no-show.
**[O]** Ambiguous which deposit this refers to. The BND 100 security deposit is collected on arrival, so a no-show never pays it. This most likely means the prepayment. **The two must be named distinctly in the product** (for example "booking payment" and "security deposit") before the ambiguity propagates into the schema.

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

### 10.5 Cash

**[C]** Cash is collected on site and reconciled against recorded transactions and receipts, verified by Finance.

Requirements: record who collected, when, and against which booking. Provide a daily cash-up view comparing recorded cash against banked amounts.

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

Brunei's Personal Data Protection Order 2025 commenced most substantive provisions on 1 January 2026, covering collection, use, disclosure, retention and access rights, with significant penalties for non-compliance.

### Requirements

1. Identity documents stored encrypted at rest, never in a public bucket, served via short-lived signed URLs.
2. Access to identity documents gated behind an explicit permission, and every access logged.
3. A configurable **retention period** per document kind, with expiry and deletion. The current practice of indefinite accumulation is the specific problem being solved.
4. Automatic generation of the accounting record pack: transfer slip, IC, transaction confirmation, itemised booking. Replaces manual PDF assembly.
5. Data export capability for the client, in a usable format.

**Migration position.** The system holds data from go-live onward. The existing folder of accumulated documents is **not** migrated. Taking custody of historical identity documents with unverifiable consent imports a liability that was not created by this project.

**Note.** This document does not constitute legal advice. The client should take their own advice on their obligations.

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

**On lease end dates:** in scope even in the thin version, because forward availability cannot be answered without them. Renewal alerts then fall out as a date filter with no additional machinery.

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

### Resolved (previously blocking)

| # | Question | Decision |
|---|---|---|
| B1 | Support booked-ahead, pay-on-arrival bookings that hold a unit without payment? | **No, excluded from v1.** Walk-ins pay on the spot; advance bookings require payment. Additive to introduce later if needed. |
| B2 | How many actual people, holding how many roles? | **Non-blocking.** Ship predefined roles (§4) and allow one user to hold several. Adjust as the structure clarifies. |
| B3 | Does the Ladyboss need to approve scope, or is Jason the decision maker? | **Non-blocking.** Either is acceptable to the client. |

**No blocking questions remain. The scope is sufficient to quote and begin Phase 1.**

### Needed before the relevant screen is built

| # | Question |
|---|---|
| N1 | How many 2-bedroom units are there, and does the 48-unit total still hold? |
| N2 | Is stated max pax a hard cap, or a threshold above which the 7 per person charge applies? |
| N3 | Age band boundary for day passes (1 to 12 and 12 and above overlap). Pricing under age 1? |
| N4 | Family bundle rule for combinations other than 2+1 and 2+2? |
| N5 | Which deposit is forfeited on cancellation: booking payment or security deposit? |
| N6 | Standard check-in time, so "early check-in" is definable? |
| N7 | Agreed hold duration for unpaid bookings? |
| N8 | Total sofa beds available across the property? |
| N9 | Can guests choose or request a bed configuration? |

### Non-blocking, configurable later

| # | Question |
|---|---|
| C1 | Ladyboss decision on gym, snooker table and sauna inclusion in the day pass |
| C2 | Facility capacities and day pass operating hours |
| C3 | Does the guardhouse have reliable signal or wifi? |
| C4 | Do field screens need Malay? |
| C5 | Should events and parties be supported as a product later? |
| C6 | Existing merchant account or BIBD QuickPay registration? |

### Client risk items to confirm in writing

| # | Item |
|---|---|
| R1 | Position on short-term letting within the building |
| R2 | Insurance, lifeguard and supervision requirements for admitting paying non-residents to a water park and indoor children's playground |
| R3 | Total parking bays, given per-unit car allowances plus day pass visitor vehicles |

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
