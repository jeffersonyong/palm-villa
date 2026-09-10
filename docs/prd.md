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

**[C] Public contact details** (confirmed 2026-08-27): Instagram and TikTok both `@palmvilla.bn`; phone **+673 8959798 / 8837118 / 8986733**; location 4.570085, 114.220738 (Bandar Seri Begawan). **[C] All three numbers carry WhatsApp** (2026-09-05). **[O]** Which one a booking enquiry should land on is still open — a single "Chat on WhatsApp" button has to pick one, and the site currently links the first (8959798). Worth noting the client's own price list directs event enquiries to **8986733 or 8837118** and not to the number being linked.

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
deposit.approve_release                     deposit.waive
unit.manage           tenancy.manage        config.manage
report.view           document.view_identity
```

**[A] `booking.discount` is separate from `booking.create`** and is the one permission that gates discretion rather than an operation — see §8.4. Front Office holds it by default, because the desk is where a discount is asked for; withholding it from a role is one click in the Roles matrix.

**[A] `deposit.waive` is the second such permission** (5 September 2026, capability B15). It gates deciding at the desk that no security deposit is taken on a booking — see §11. Same construction and same default as the discount: separate from `booking.create` because it decides money is not taken, held by Front Office because the guest asking to stay another night is standing at the desk, and one click to withhold.

**[C]** Deposit release approval sits at the end of the pipeline, with Finance or Jason, not with Housekeeping or Front Office. Housekeeping records the inspection; a separate role approves.

**[A] Checking a guest in and out is gated by `booking.amend`**, added when the deposits slice made those two moves reachable at all (§11). There is no check-in permission in the set above — [N11](open-questions.md) is the question of who may check a guest in, and minting a string before it is answered would be this document deciding it. `booking.amend` is the nearest true thing: it already means "may move this booking on", and Front Office holds it, which is where an arriving guest is standing. **The consequence is that Security cannot check anyone in**, which is exactly what capability D3 will need, so N11 has to be answered before the arrivals screen is built rather than before this one shipped.

### Predefined roles

**[C]** v1 ships with a fixed set of roles, each pre-assigned a permission set. Users may hold **more than one role**, which is what makes the uncertain team structure a non-issue. Roles and their permissions are editable in the admin UI later without code changes.

| Role | Permission set |
|---|---|
| **Admin** | All permissions, including `config.manage` and `document.view_identity` |
| **Front Office** | `booking.*`, `payment.verify`, `payment.record_cash`, `charge.create`, `deposit.waive`, `unit.manage`, `tenancy.manage`, `document.view_identity` |
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

**As built (capabilities A1–A4, 13 September 2026).** Three screens, and they are the first writes in the product with no staff member behind them. `/stay` shows what is free on every night for the advance window with that unit type’s rate on each night, prices the stay as the customer builds it, and holds a unit. `/day-pass` sells a pass for a day. `/booking/{token}` is the customer’s way back to their own booking, carrying the reference, the amount and the bank accounts.

**The customer chooses a type; the system assigns the door.** §7.1 records that units of one type are not interchangeable because bed configurations differ, and N9 assumes staff assign. A public form offering a choice of door would give away a decision nobody has agreed to give away, so `create_public_stay_booking()` walks the free units of the type in reference order and takes the first the exclusion constraint accepts. The desk moves it with an ordinary amendment. **[A]**

**A unit type with no units is not offered.** The 2-bedroom has none until N1 is answered, and a customer shown sixty-two nights of "Full" would read that as a property with nothing free rather than a type nobody has counted. **[A]**

**Early check-in is not sold**, which is N31: Jason’s own answer makes it a desk judgement about whether a unit is ready. The form sends zero hours and tells the customer to ask on arrival.

**[O] Its photographs are staff-managed, or they are stale within a year** (proposed 10 September 2026, capability F7, unagreed with the client). A unit type gets repainted, a facility reopens, somebody commissions a better photo shoot — and under any arrangement where the images ship with the code, each of those is a developer deploy. That is the same argument §7.2 already accepted for facility inclusion and §7.1 for unit naming, applied to the one part of the product a customer actually looks at first.

**No image is real yet.** Every unit type and facility on the public site renders a labelled placeholder, so this is not a control over something that exists — it is the images and the way to manage them, together. What that costs architecturally is §8's one departure: a **public** bucket, which is the opposite of every rule [architecture.md §8](architecture.md) states for the private ones.

### 5.2 Operations portal (desktop)
Booking calendar and list, manual booking creation, payment verification queue, unit management, inspection and deposit workflow, document access, reporting, configuration.

**[A] The booking calendar is a unit × night grid** — one row per unit grouped by type, one column per night, one month per screen — the units board (B8) read across a date axis. **[A] It draws everything that blocks the unit**: every booking not expired or cancelled, long leases, and out-of-service periods, because that is the set the exclusion constraint counts ([architecture.md §5.2](architecture.md)); a completed stay whose last night has not passed is therefore drawn even though the units board calls the unit available. **[A] Day passes occupy no unit (§6.1) and do not appear on it** — they appear in the list view. An empty night that can still be sold opens a new booking with the night and the unit type filled in (B2).

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
DayPass               booking_id, date, party_composition, headcount   -- built 13 Sept 2026
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

**[A] The 2-bedroom's stated maximum is the only one that is not a single number.** "4 adults + 2 children" is carried into `lib/domain/config.ts` as `maxPax: 6`, which is a flattening: the literal reading caps adults at 4, so 5 adults + 1 child would be refused under it and allowed under the flattening. Six bodies however composed is the more permissive reading and the one that ships. Part of N2 — see §8.2.

**[O]** Units of the same type are not interchangeable, because bed configuration differs. It is unconfirmed whether guests may choose or request a configuration, or whether it is assigned by staff.

**[O]** The database seeds the 48 confirmed units only. The 2-bedroom **type** exists and prices correctly, with **zero units**, until N1 is answered. Unit references are provisional pending N10.

**Both are now answerable in the product rather than in a migration** (capability F6). The unit registry screen sets the number of units of each type and what each one is called, so N1 is a number typed into a field and N10 is a naming pattern with a live preview. Neither question is *answered* by that — a count nobody has agreed is still not a fact, and both stay open in the register — but neither blocks a screen any more, and the seeded 48 and the `3B-01` scheme remain the starting point until somebody changes them.

**[A] A rename is retrospective, deliberately.** `booking_summary.unit_ref` reads through to the unit, so renaming `SD-01` to `Villa 1` relabels every stay that unit has ever hosted. That is the intent: the reference is what staff *call the door*, and a completed booking that still names a door nobody uses is the confusing outcome, not the safe one. The rename is recorded against the unit with who did it and when, which is where the old name lives. Snapshotting a reference onto each booking is out of scope.

### 7.2 Facilities

| Facility | Included in day pass |
|---|---|
| Swimming pool | **[C]** Yes |
| Water park | **[C]** Yes — *not named in the client's list of 10 September 2026; see below* |
| Indoor children's playground (the "playroom") | **[C]** Yes |
| BBQ area | **[C]** No |
| Gym | **[C]** No (10 September 2026) |
| Billiard / snooker room | **[C]** No (10 September 2026) |
| Sauna room | **[O]** Not named either way — see below |

**Answered 10 September 2026 — and one thing it did not settle.** Jason listed the day pass as pool and playroom in, billiard room, gym and BBQ out. That closes the gym and the snooker table, which had been waiting on a Ladyboss decision since this document was written. **The water park and the sauna are in neither half of his list.** The water park has been **[C]** included since §2 and is the most prominent thing on the public landing page, so the likeliest reading is that "swimming pool" covers the whole wet area — and a likeliest reading is not a confirmation for the one facility a customer is most likely to arrive expecting. Both go back to him in [C1](open-questions.md).

**[A] confirmed as the right shape.** Jason's own framing was *"I will list out all the options so your team can enable or disable whenever you want"* — which is the per-facility toggle this document already assumed, now his expectation too. Inclusion is configuration (capability F3), so every line above is a switch rather than a code change, and the two unresolved facilities cost nothing to leave off until he says.

**[A]** Facility capacity is configurable per facility. The configured number represents headroom available to day-pass visitors, not raw physical capacity, because long-term tenants have facility access at no service charge and form a permanent baseline load.

### As built (capability F3, 12 September 2026)

**The table above is now rows, and the screen is Property settings → Day pass.** Every facility carries a name, a checkbox for whether the day pass admits it, and a capacity — so the two facilities the client has not settled cost nothing to leave as they are, and settling them is a tick rather than a deploy. That is his own framing made real.

**The sauna is seeded OUT.** He named it neither way, and of the two readings only one can mis-sell a pass: a guest turned away from a sauna they were never sold is a disappointment, where a guest admitted to one the business did not price is revenue given away and a precedent set. It flips with a tick the day he says.

**Every capacity is empty, and that is the honest state** ([C2](open-questions.md)). The field exists; no number has ever been agreed. Until one is, nothing is limited and §14's day-pass panel still has no denominator to state.

**[A] A facility carries a slug it never loses.** Derived from the name once, at creation, and untouched by a rename — so "Playroom" becoming "Indoor playground" does not break a public page pointing at it. Nothing joins on it yet; it is what [architecture.md §8](architecture.md)'s F7 note asks this capability to leave behind.

---

## 8. Pricing engine

Pricing is a line-item calculation, never a single stored price. Every booking produces itemised `BookingLine` records that sum to a total.

**[C] Every figure below is a setting, not a constant** (capability F3, 12 September 2026). Rates, the extra-person charge, the sofa bed, early and late hours, the deposit and the advance window are rows the client edits on Property settings; the values stated in this section are what the property was **seeded** with. A figure carrying **[O]** is now a provisional *setting* rather than provisional code — he can answer it by typing.

**[A] There is no effective dating, and that is a decision** ([N33](open-questions.md)). A rate change touches no stored `booking_line`: a booking already taken keeps the figures it was quoted, and an amendment reprices the whole stay at today's — which is §9.6's rule, unchanged. Nobody has asked for a rate that starts on a date, and a valid-from column nothing reads would be a second copy of the fact F3 exists to hold once. The screen says so where somebody changes a rate, because "does this change what I already sold" is the first thing anybody wonders.

### 8.1 Day passes

**[C]** Per-person rates: age 1 to 12 = 5. Age 12 and above = 10.
**[A]** The boundary is **1 to 11 = 5, 12 and above = 10** (2026-09-05, Jeff). Decided by Jeff against the client's overlapping wording, not confirmed by Jason.
**[C]** Family bundles: 2 adults + 1 child = 20. 2 adults + 2 children = 25.

**[O]** Pricing for under age 1 is undefined. Free by inference from the stays rule that guests aged 3 and below are not counted — an inference, not a stated rule. The overlap at 12 that used to sit here is resolved above.
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
**[O]** "Max for 8 pax" alongside "7 per extra person" is contradictory — and it is the client's own price list that says both, in one sentence, for every unit type. Clarify whether max pax is a hard ceiling or the threshold above which the extra charge applies.

**[A] It ships as a threshold, not a ceiling.** `config.paxPolicy` is `surcharge_threshold`, so a 9th guest in a 3-bedroom books and pays 7 per night rather than being refused. This is the only reading under which the confirmed extra-person charge is ever chargeable at all — under a hard cap the rate is unreachable dead code. One field flips it.

**[O] The 2-bedroom is a second question inside the same one.** Its stated maximum is a shape ("4 adults + 2 children"), not a count, so "six people" and "at most four adults" are different rules — see the [A] in §7.1 for which one ships.
**[C]** Sofa bed: 28, includes one pillow and one blanket, subject to availability.
**[O]** Total number of sofa beds available across the property is unknown. Model as property-level add-on stock, not per unit.

**[C] Standard check-in is 14:00 and standard check-out is 12:00** (10 September 2026, answering [N6](open-questions.md)). "Early" and "late" now have a baseline, and the pricing engine no longer refuses to count early check-in hours against an undefined one. `config.standardCheckInTime` carries the time.

**[C] Late check-out is BND 15 per hour**, confirmed on the same date — unchanged from the formula above.

**[O] The client's own example does not agree with the rate he gave.** *"There is a late fee of 15/hour. For example, they want to check out at 3pm instead, that's another 15."* Three hours past 12:00 at BND 15 an hour is 45, not 15. Either the rate is per hour and the example is loose, or a late check-out is a flat BND 15 however long it runs. The engine prices it per hour, which is what the words say and what the price list has always said; the arithmetic is [N30](open-questions.md) and one line settles it.

**[A] Early check-in requires an availability check, not just a charge.** Check-out is 12:00 and units target readiness by 14:00. Early check-in is only sellable when the unit was vacant the previous night or has passed inspection. Selling it as a simple paid extra will place guests in units still being cleaned. Jason's answer is that same position from the other side — *"usually it's up for discussion as we may or may not have room ready"* — so it is a desk judgement, not a checkbox on a form.

**[O] The booking form still does not sell it**, now for a stated reason rather than for want of a check-in time. What is undecided is the rule the desk applies and whether the BND 10 an hour on the price list is what it charges when it is granted: [N31](open-questions.md).

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
**[C]** ~~Full payment is required to secure a unit. Unpaid bookings do not hold inventory.~~ **Superseded 10 September 2026 by the client** — the security deposit is what secures a unit; see below. The rest of the sentence survives in substance: a unit is never held against nothing.

**[A] One qualification, added when the payment layer was built.** A booking taken at the desk and paid by bank transfer holds its unit from the moment it is created — its occupancy row counts against the exclusion constraint — and stays held until someone confirms the money landed. That is §9.3's checkout timer in substance, but **nothing expires it**, and as of 10 September 2026 nothing should: [N7](open-questions.md) is answered *indefinitely*, which is exactly what is built. The expiry job sketched in architecture.md §6.3 is not needed. An abandoned transfer blocks a unit until a staff member cancels it — by decision now, rather than by omission — and the verification queue sorts oldest-first and shows the wait so it stays visible rather than silent.

**[C] Answered 10 September 2026, and it reverses the line above.** Asked how long to hold a unit, Jason added that *"right now it's the norm for people to make full payment only on the day itself, 90% of the time"*; asked what a guest transfers when booking, he named two cases — the deposit only, or the full amount with the deposit. Put to him directly, he confirmed it: **a booking is secured by the BND 100 security deposit, and the unit is held until someone verifies that payment.** The stay is settled on arrival.

**[C] The BND 100 is the security deposit, collected early — not a part payment of the stay.** This is the half that decides the shape of everything downstream, and it was confirmed separately (10 September 2026) because his wording admitted both readings. It is the same deposit §11 already models, taken at booking rather than at the door: the booking's own balance is untouched by it, so a BND 400 stay still owes BND 400 on arrival. **[N16](open-questions.md) is therefore not reopened** — nothing lets a guest pay half the *stay* up front, and the stated policy that a stay is paid in full stands, only later than it used to.

**What that changes, none of it built:**

- **A booking can exist with the stay unpaid.** The deposit is what holds the unit. `check_in_booking` is the only path that writes a deposit row today, inside the check-in transaction and with a backstop refusing a second, so collecting one at booking is the first piece of work.
- **Check-in stops asking for a deposit that is already held**, and §11's one-deposit-per-booking rule becomes the thing that guarantees it rather than a race nobody can reach.
- **A deposit payment must not read as a short booking payment.** §10.4's match rule compares what arrived against what the booking owes, and BND 100 against a BND 400 stay is short by BND 300 — an override reason demanded on the ordinary case, which is the failure §10.7 already fixed once and must not reintroduce. The deposit is not a booking payment and must not be recorded as one.
- **`confirmed` stops meaning `paid`.** A deposit-secured booking is confirmed with the whole stay outstanding. That is §10.7's position held consistently — owing money is a balance, not a state — and it means every screen that reads `confirmed` as settled has to be checked.
- **Settling on arrival is already built.** §10.7's outstanding balance, cash or transfer from the booking itself, is exactly this transaction. It arrived for amendments and turns out to be the ordinary path.

### 9.2 Booking states

```
draft → held → awaiting_payment_verification → confirmed → checked_in
      → completed
      ↘ expired (hold lapsed)
      ↘ cancelled
      ↘ no_show
```

### 9.3 The hold

**[A]** A short hold is required even when a payment is expected immediately. Between a customer submitting a booking and their transfer landing, the unit must be reserved or two customers will pay for the same night and one requires a manual refund. Refunding a bank transfer by hand is materially worse than a short hold. **This was written against the full-payment policy §9.1 has since struck through**, and it survives the reversal unchanged: what is now awaited is the deposit rather than the whole stay, and the reason for holding the unit while it lands is identical.

Framed to the client as a **checkout timer**, not a reservation: the unit is held while payment completes, then released automatically.

**[C] There is no timer** (10 September 2026, answering [N7](open-questions.md)). Asked how long a unit should be held for someone promising a transfer, Jason said indefinitely, until somebody checks. The automatic release above is therefore **not built and not wanted**: a hold ends when a staff member confirms the payment or cancels the booking, and nothing else ends it. `holdMinutesStay` and `holdMinutesDayPass` were **deleted with capability F3** (12 September 2026) rather than given a settings row. They had been kept as inert values in case the public flow wanted a *displayed* expectation, and a number the client can change that changes nothing is worse than no number at all: it invites him to shorten a timer that does not exist. If phase two wants to state an expectation to a customer, that is a decision about a screen with nothing behind it.

**The consequence for phase two:** §10.3's transfer flow shows the customer "a countdown". With no expiry behind it that is a promise the system does not keep, so the public flow states the reference and the amount and says the unit is held until payment is confirmed. Capability A4 in scope-of-capabilities.md is worded as a checkout timer and needs the same correction.

**And the consequence to raise rather than absorb:** an indefinite hold is only safe because a person is watching the queue. [N29](open-questions.md) is this same answer from the other end — if most guests really do pay on the day, "held indefinitely" is not a fallback, it is the product.

### As built (capabilities A1–A4, 13 September 2026)

**`held` is persisted for the first time.** Every booking before this went straight to `awaiting_payment_verification` or `confirmed`, because the guest was at the desk and had paid. A customer online has not, so the booking is created `held`, its occupancy row counts against the exclusion constraint, and it stays that way until somebody verifies the transfer or cancels it. Nothing expires it, which is this section’s answer unchanged.

**What changes is who can now create one.** An indefinite hold reachable only from a desk is a staff member forgetting to chase somebody; the same hold reachable from the open internet is a unit anybody can take out of the property’s inventory for nothing. Three things stand in the way, and none of them is a CAPTCHA — the alternative to a booking is a phone call, so a customer asked to prove they are human is a customer lost. **[A]**

- **A honeypot**, refused silently. Telling a script which check it failed is telling it what to change.
- **Request counters**, per address and per phone number, over fixed windows. Keys are hashed, because an address and a number are both personal data (§13).
- **A cap on unpaid bookings per phone number**, enforced inside the write transaction. This is the one that protects rooms rather than bandwidth, and it counts only bookings the customer made themselves — a desk taking four advance bookings for one regular is doing its job.

The figures are constants in `lib/domain/public-booking.ts` rather than settings, deliberately: every figure the client can edit is one this document makes a business rule, and nobody has agreed these. A settings row would invite the owner to tune a control nobody has explained to him, upward, on the day a real customer trips it. They are in the register instead.

### 9.4 Manual booking (staff)

**[C]** Staff can check availability and create a booking on the spot, using the same availability check, pricing engine, and document capture as the public flow.

**[C] v1 supports walk-ins only.** ~~The guest is present and pays immediately. The booking is created and paid in a single action, and no unit is ever held against an unpaid promise.~~ **Superseded 10 September 2026** — see §9.1. An advance booking secured by the deposit is now in scope, so this is no longer the only shape a staff-created booking takes. The walk-in path itself is unchanged: a guest at the desk still pays in full in a single action.

**[A] The two paths differ only in what has been paid.** Same availability check, same pricing engine, same document capture, same unit held by the same occupancy row. A walk-in settles the stay at the desk; an advance booking settles it at check-in through the path §10.7 already built for a booking that owes money. Nothing new is minted to express the difference — the balance says it.

**As built (15 September 2026).** The desk form takes the deposit as the booking is made, and asks which of the customer's two answers (§10.3) the guest is giving — *the deposit only*, or *the deposit and the stay*. That is this paragraph's distinction made into one control rather than left implicit: the walk-in at the counter pays everything, the regular ringing ahead pays the BND 100 and settles on arrival, and both are one form. The deposit alone is the **default**, for the reason it is the default on the customer's own page — it is the smaller commitment and the one the policy is written around, and a default that over-collects records cash nobody handed over. The figure crossing the counter is on the submit button either way.

**[C] Booked-ahead, pay-on-arrival is explicitly excluded from v1.** ~~Staff cannot reserve a unit for a customer who intends to pay cash on the day. Advance bookings require payment, in line with stated policy.~~ **Reversed 10 September 2026 by the client** ([N29](open-questions.md)). It was excluded on the strength of §9.1's full-payment rule, which he has now reversed. What replaces it is not "reserve a unit for nothing": the deposit is real money taken before the unit is held, and a guest who does not turn up loses it (§9.5).

**The adoption risk this section flagged is answered, and it was the right risk to flag.** It read: *if staff currently hold units informally for regular cash customers, v1 removes that ability, and this should be raised with the client before go-live rather than discovered by a front office staff member turning a regular away.* They do, it would have, and the owner said so himself before any staff member had to. The change is the additive one this paragraph predicted — no rework, and no `confirmed_payment_due` state either, because §10.7 made owing money a balance rather than a status.

### 9.5 Cancellation and no-show

**[C]** The deposit paid is forfeited on cancellation or no-show.

**[C] It is the security deposit that is kept, and the booking payment is refunded** (10 September 2026, answering [N5](open-questions.md)). Jason: *"We keep the deposit, booking payment is refunded if that is paid during booking."* The BND 100 therefore does two jobs — it secures the booking against a cancellation and the unit against damage — and *"if that is paid during booking"* carries the fact §11 now has to absorb: the deposit is taken **when the booking is made**, not only at the door.

**The naming demand this section made was worth making.** The schema names the refundable BND 100 `security_deposit_cents` and never a bare `deposit`, and the booking payment is a separate concept per the §6.2 entity list — so the answer lands on two amounts that were already distinct, rather than on one word that meant either.

**What is built, and what the answer now asks for.** Cancellation (capability B3) deliberately moves no money: it releases the unit, records who cancelled it, when and why, and states on screen that settlement happens outside the system. That stays right for the **refund** — architecture.md §6.4 keeps a v1 refund an instruction a person executes in a banking app. It is no longer complete for the **forfeiture**, because a deposit that is kept is money the business now owns. Three things follow, none of them built:

- The deposit gains an outcome the ledger does not have: **forfeited**, beside held and released. §11's stages are derived rather than stored, so this is a rule and not a column.
- A forfeited deposit **stops being a liability and becomes revenue**, on the day it was forfeited. §14's revenue figure excludes deposits in both directions today — **[O] [N32](open-questions.md)**.
- The cancel screen should **state the forfeiture** instead of disclaiming any calculation, and say so plainly when no deposit was ever taken. That was the bullet waiting on §9.1's policy question, and it is no longer waiting: a booking is secured by the deposit ([N29](open-questions.md)), so the ordinary cancellation now has money against it to forfeit.

### 9.6 Amendment

The PRD has never stated rules for changing a booking after it exists — §4 grants Front Office `booking.amend` and nothing defines what may be amended. The following are **[A]** assumptions made when capability B3 was built, and are the ones to put in front of the client.

**[A] What can be changed:** dates, unit, party size, sofa beds, late check-out, and the guest's name, phone and vehicle. Every change reprices through the same engine as creation; the price charged is always the one the server derives, never one submitted by a screen.

**[A] Which bookings can be changed:** anything not yet checked in and not closed — `draft`, `held`, `awaiting_payment_verification`, `confirmed`. Closed bookings (`completed`, `expired`, `cancelled`, `no_show`) are kept as a record.

**[O] Amending a booking whose guest has already checked in is not supported.** Extending an in-house guest by a night is a real front-office need, and this is the one exclusion likely to be felt in practice. It is excluded rather than half-built because §9.1's two-month advance window is implemented as "check-in cannot be in the past", so repricing a stay that has already begun is refused by the pricing engine. Enabling it means deciding what a mid-stay reprice charges for nights already taken — a pricing question, not an interface one. **To confirm with the client.**

**[A] The stated procedure for an in-house extension is a second booking, with the deposit waived** (5 September 2026, Jeff). Occupancy ranges are half-open, so a booking ending on the 5th and a new one starting on the 5th on the same unit do not collide, and the desk can sell the extra night today. What made that unworkable was the deposit: check-in takes BND 100 in the same transaction, so the extension would have taken a second one off a guest who already has one in the safe. §11's waiver is the answer — the second booking is created quoting no deposit, with a reason naming the booking that holds it. Two consequences are accepted rather than solved: the stay is two references, two packs and two identity-document records, and Housekeeping sees a departure and an arrival on a unit nobody left. Amending a checked-in booking stays out until the pricing question above is answered.

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

**[C] The accounts, given 10 September 2026:**

| Bank | Account number |
|---|---|
| BIBD | `0018-02-0010611` |
| Baiduri | `03-0110-455273` |

**[C] The number alone is what a customer is shown — no account name.** Two accounts exist for one reason: a Bruneian customer already banks with one or the other and transfers within their own bank without a fee or a delay. It is a choice of convenience, not two products, and nothing in the system routes on which one they pick or reconciles them differently.

**As built (capability F3, 12 September 2026):** both accounts are rows, edited on Property settings → Bank accounts, and nothing else reads them yet. The customer-facing transfer instructions are capability A5, phase two; the desk still reads the number off a phone. What this buys today is that the day a number changes, there is one place to change it.

**[A] These are property configuration, not copy.** They belong beside the rates in the property's settings (capability F3), because the day a number changes is the day every transfer instruction and every accounting pack has to change with it — and a number pasted into a marketing page is the copy nobody remembers to update. Neither is in the product yet: the customer-facing transfer instructions are phase two (capability A5), and the desk reads them off a phone today.

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

**As built (13 September 2026), and two of those six steps are different.**

**There is no countdown** (step 2). N7 makes the hold indefinite, so the page states the reference and the amount and says the unit is held until the transfer is confirmed. A timer nothing enforces is a promise the system does not keep.

**The customer says when they have paid** (steps 3–4), and the booking is created before that. Creating it holds the unit; pressing *I have made the transfer* moves it to `awaiting_payment_verification` and raises the pending row. That is what `payment.created_at` was always meant to measure — the queue’s waiting column is how long somebody has been left waiting, not how long they spent on a form. Slip upload is still A6 and still phase two, so step 3 is a transfer and not yet an upload.

**What is raised depends on what the customer chose**, and both answers are his own (§9.1: *the deposit only, or the full amount with the deposit*). A short stay quoting a deposit offers the two on the instructions page — the deposit is the default, since it is the smaller commitment and the one the policy is written around — and raises a pending deposit, plus a pending payment for the stay when they choose to settle it now. Anything else has nothing to defer and is simply paid for.

**Two rows for one transfer, and they stay two.** The customer sends BND 700 once; the queue shows BND 100 against the deposit and BND 600 against the stay, because §11 makes one a liability the property owes back and the other revenue it has earned. Merging them into a single row would be the one place in the product those could be confused. **[A]**

**Settling up front is not [N16](open-questions.md).** The stated policy is that a stay is paid in full; this is that happening earlier. A part payment would be the stay paid in halves, and nothing offers one.

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

**This is not part payments**, and it did not become part payments when §9.1 changed. The **[C]** that stands after 10 September 2026 is that the deposit secures the unit and **the stay is paid in full** — on arrival rather than at booking, but in full, and nothing offers a guest the choice of paying half of it. What is now expressible is a shortfall the *system itself* created by repricing a booking somebody had already paid for. The balance being computable does make instalments mechanically possible — worth stating plainly, because it means the policy is now enforced by the product declining to offer them rather than by the schema being unable to represent one. **[N16](open-questions.md) is unchanged and still the client's to answer** — the deposit-secured booking he did agree to leaves the stay whole, so it settles nothing here.

### 10.6 Later (out of scope for v1)

**[A]** Automated matching will realistically be **statement CSV import matched on payment reference**, not a live bank API. Brunei business banking is unlikely to offer programmatic access. Only exceptions reach the manual queue. Same screen, less work.

---

## 11. Deposits, inspections and charges

**[C]** Security deposit: BND 100, refundable.
**[C]** Process: Housekeeping inspects the unit after check-out. Once condition is confirmed, deposit release is authorised by the approving role. Damages or charges are deducted before the balance is released.
**[C]** Additional charges apply if costs exceed the deposit. **The deposit is not a cap on liability.**

**[C] "Refundable" means refundable after a stay that happens.** §9.5's answer of 10 September 2026 makes this same BND 100 the amount kept when a guest cancels or does not turn up, so the deposit carries a second job this section never described: it is the commitment that secures a booking as well as the security against damage. §9.1's answer of the same date says where it is taken — **at booking, or at the door, and one or the other every time** — which is the change this section absorbs; see the as-built block below.

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

**[A] The deposit is collected at check-in, as part of checking the guest in.** One action, one transaction: the booking moves to `checked_in` and the deposit row is written together, because a guest checked in with no deposit recorded is precisely the gap in the spreadsheet this replaces. It is taken in cash or by bank transfer, for the amount the booking quoted, and it cannot be skipped at the door. A booking quoting no deposit checks in without one, and the screen says so rather than implying money changed hands.

**[C] The client has since answered that, and the deposit is now collected at booking too** (10 September 2026, [N29](open-questions.md)). A booking is secured by the BND 100, so the money arrives before the guest does — and the same BND 100, taken early, is what §9.5 forfeits when they never turn up. The door stays one of the places a deposit is collected; it is no longer the only one.

**What that asks of this section, none of it built.** `check_in_booking` writes the only deposit row there is, inside the check-in transaction, and refuses a second — which is exactly the right guarantee once a deposit can arrive earlier, and exactly the wrong place for it to be the only writer. Three things follow:

- **A deposit is collected when a booking is created**, by whoever takes the booking, in cash or by bank transfer. A transfer is not verified money until somebody checks the bank, so the unit is held on a deposit that is *promised* until then — which is precisely the hold §9.1 already describes, now carrying the deposit rather than the stay.
- **Check-in recognises a deposit already held** and takes nothing. It is not a new state: the check-in screen already says so for a booking quoting no deposit (B15's waiver), and this is the same sentence with a different reason behind it.
- **A deposit is still never a booking payment.** It settles no booking, appears in no cash-up total (§14, [N27](open-questions.md)) and leaves the stay fully owed. Recording it as a payment would make every deposit-secured booking read as short against its own total, which is the flag §10.7 spent a slice making meaningful.

### As built (capability B16, 13–14 September 2026)

All three of the bullets above are built. The public half landed first, for a customer booking online; the staff half followed on 14 September and is described at the foot of this block.

**A deposit can now be outstanding, and that is one nullable column rather than a status.** `collected_at` becomes nullable and `promised_at` records when the customer said they had transferred. A row with a promise and no collection is the one state in which this deposit is not yet a liability: it is not on the ledger, not in the cash-up, cannot be charged against, and cannot be released. Its stage is `awaiting_verification`, ahead of the other four.

**It lives on `deposit` rather than as a kind of `payment`, and that is the decision the whole design turns on.** §9.1 above spends a paragraph on why a deposit must never read as a booking payment; putting the pending state here means `booking_summary.paid_cents`, the outstanding balance, the revenue report, the cash-up and the accounting pack’s due-list are all untouched by construction, rather than each having to remember to exclude it. The first reader to forget would have been silent. What it costs is that the verification queue reads two tables and the ledger filters one column — both stated rather than discovered. **[A]**

**Verifying one is the same job as verifying a payment**, so it takes `payment.verify` and mints no new permission string — the position §10.7 and §13 already took. The amount is matched against what the booking **quoted**, not against what it owes, because no other payment moves that figure; a discrepancy needs a written reason exactly as §10.4 requires, and an overpayment is refused as firmly as a short one. It schedules no accounting pack: a pack is assembled when money is verified *against the booking*, and this settles nothing.

**Check-in has three cases now, and the middle one is a judgement.** A deposit already collected means the door takes nothing and says so. **A deposit still only promised is collected at the door** rather than refused — the guest is standing there, an abandoned transfer is exactly when the desk needs the BND 100 in cash, and refusing would send a paying customer away to fix a row. The promise is fulfilled on its own row, so one-deposit-per-booking holds and `promised_at` survives as the record that the customer said they had sent it. **[A]** *(Superseded 15 September 2026 — the door collects nothing at all; see the as-built block below. The judgement survives in substance: the abandoned transfer is still settled in cash at the desk, from the booking, one screen earlier.)*

**The desk can now take the deposit, and until it could the gap was worse than a missing button.** A customer who transferred the BND 100 and never pressed the button on their own page left a clerk with no correct action: `record_transfer_payment()` raises a *payment* for the outstanding stay, which is both the wrong figure and the wrong kind of money, and recording cash would have put a deposit into the cash-up total §14 deliberately keeps it out of. The only honest workaround was to telephone a guest who had already paid and ask them to click something. `record_booking_deposit()` closes it: **cash is counted and secures the booking on the spot; a transfer is written as a promise and joins the same queue the customer's own button feeds**, verified by the same `verify_deposit()`. The amount is never passed in — it is the booking's quoted figure read under the row lock, exactly as check-in reads it. **[A]**

**A promise can be settled in cash before the guest arrives, and that is this section's own judgement applied earlier.** The bullet above answers the case at the door — an abandoned transfer is exactly when the desk needs the BND 100 in cash, and refusing would send a paying customer away to fix a row. Nothing in that reasoning depends on the guest arriving to check in, so cash recorded against a standing promise **fulfils it on the same row**: the method is corrected to what actually changed hands, `promised_at` survives as the record that the customer said they had sent it, and the booking confirms by `verify_payment` — the edge verification already uses, rather than a second way into `confirmed` for one kind of money. Without it the only routes were stating in the ledger that a transfer had been seen when it had not, or booking the deposit as stay revenue. A *second transfer* against a standing promise is still refused: it clears nothing. **[A]**

**Securing a booking is its own transition, not `pay_in_full`.** A deposit taken in cash reaches `confirmed` while the stay stays owed in full, so reusing the event that means "the guest handed over the whole price" would make the history say something untrue about money — the distinction §10.7 spent a slice making legible. `secure_with_deposit` is that event, legal only from `draft` and `held`. A deposit taken against a booking already confirmed moves nothing, which is `verify_payment()`'s arrangement for a top-up and for the same reason. **[A]**

**It takes `payment.record_cash` and mints no new permission.** Taking money at the counter is one job, and this section has twice taken that position already — verifying a deposit rides `payment.verify`, and the excess above one is settled by whoever may record a payment. **[A]**

**Every screen that said the deposit arrives at the door has been corrected.** The walk-in form, its receipt, the waiver control, the booking's Money card and the deposit screen's empty state all described a BND 100 collected at check-in, which stopped being true when §9.1 was reversed on 10 September. A quote with nothing against it now reads *owed* rather than *due at check-in*, and the receipt for a new booking says plainly that the deposit has not been taken yet — copy naming the door was itself how the money went uncollected. The door remains the last place it can be collected, never the only one.

**There is no slip on a deposit.** A document hangs off a payment id (architecture.md §8.1) and a deposit is not a payment, so a guest’s screenshot of the transfer has nowhere to live. The queue’s cell says so rather than reading as a slip somebody forgot to attach. The bank app was always the check (§10.4); this is in the register. **[O]**

**[A] The deposit can be waived — at creation, with a reason, under its own permission** (5 September 2026, capability B15). The first build held that "a deposit somebody decided not to take is a conversation, not a field", and the conversation turned out to be a real one: a guest who extends after checking in gets a second booking (§9.6), and a second booking takes a second BND 100. The waiver is a checkbox in a *Security deposit* section at the foot of the walk-in form, shown only to a holder of `deposit.waive`. Ticking it opens a dialog rather than a field — the register every other consequential act in the portal uses — which says what the tick means (nothing held, nothing to charge damage against) and takes the reason there, by convention naming the booking whose deposit covers the stay; it cannot be confirmed empty, and cancelling leaves the box unticked. Unticking clears the waiver at once. A waived booking quotes zero, which is the path check-in already had; what the waiver adds is the **record**: the reason on the booking, a `deposit.waived` event in its history carrying the figure not taken, and a schema constraint that a booking with a waiver cannot quote a deposit — so an amendment repricing the stay cannot quietly put it back. It is decided at creation only; there is no waiving at the door, for the reason above.

**[A] `booking.security_deposit_cents` stays the quote; the deposit row is what was taken.** The two can differ, because an amendment can reprice a booking after it was quoted, and what is held must not move with it. Every screen that used to read the quoted figure and call it "held" now says which of the two it means.

**[A] An inspection is recorded once per stay, after check-out, with one of two outcomes** — *clean* or *issues found* — and notes are required when something was found. Two outcomes because this section branches exactly once: condition confirmed, or damages to deduct. A finer taxonomy would be categories nobody asked for, and the notes carry the detail in the inspector's own words.

**Requirement 2 is now met: photographs arrived with the documents slice** (7 September 2026, capability B10). An inspection carries any number of them, stored privately, deleted automatically after two years, with every access logged and who attached each one on the record — see §13's as-built block. They are attached under `inspection.record`, the inspection's own permission rather than a second one, and are **not frozen when the release is approved**: a photograph taken to support a charge is evidence, and locking the evidence at the moment of approval was a rule nobody asked for. The delta against scope-of-capabilities.md C2 is closed.

**[A] Recording an inspection and photographing it are one step, not two.** The first build split them — the dialog wrote the inspection, then a notice sent you back to the card to attach — because a photograph hangs off an `inspection_id` and there is nothing to attach to until the inspection exists. That is the schema's order, not the work's: somebody walks the unit once, with the photographs already on the phone they are typing into, and a second errand is how the cheapest evidence in a dispute becomes the step that gets skipped. The dependency is now met by sequencing inside one dialog. Two consequences: the inspection is written first and **has no update path**, so a photograph that fails to upload cannot be retried by resubmitting the form — the dialog freezes the outcome and notes and continues as photographs only; and **photographs stay optional**, including when something was found, because requiring one is a rule nobody has agreed. They can still be added to the inspection at any time afterwards, which is what a dispute months later needs.

**[A] Requirement 4's "charges entered" is satisfied by the approver seeing them.** The inspection is a hard gate — the database refuses a release without one — but a release with no charges against it is the ordinary case, so there is nothing to require. What the approval screen does instead is state the itemised charges and the three resulting figures before the click.

**[A] Charges can be raised from check-in until the release is approved, and approval closes them.** A broken window on the second night is a charge against that deposit, and making somebody wait for the guest to leave is how it ends up in WhatsApp. Approval freezes the list, because the statement a guest is given has to be what was signed off. A charge is **waived rather than deleted** — `charge.waive` is Finance's, so dropping one is a decision, and a decision that leaves no row is one nobody can review.

**[A] Approval records who, when, and three figures — returned, charges, owed — and moves no money.** Requirement 5 read literally. The figures are computed in the database under the deposit's own row lock, so a charge added while the dialog was open is either counted or refuses the approval; it can never be signed against a list that moved. Handing the notes back happens at the desk, which is the position architecture.md §6.4 already takes on refunds.

**[A] Where charges exceed the deposit, the excess is recorded as settled by whoever may record a payment** (`payment.record_cash`). It is not a booking payment: it settles no booking and appears in no cash-up. Whole amounts only — a part payment against an excess, and what happens to one nobody ever pays, are [N21](open-questions.md).

**[A] A deposit's stage is derived, never stored** — from the release, the inspection and the booking's status. The same reasoning architecture.md §5.1 gives for `unit.status`.

**The statement is a printable page rather than a generated file.** Every browser prints to PDF, staff already forward images over WhatsApp, and a document that is also a URL is one a colleague can open. It renders only once a release is approved, because before that the figures can still move and a statement whose numbers change after it was sent is worse than none.

### As built (capability B16, 15 September 2026) — the deposit secures the booking, and nothing else does

The two slices above built the deposit-secured booking one half at a time, and each left a door open the other did not know about. Three things were still true that §9.1 says are not, and all three are the same mistake seen from different screens: **the deposit was treated as one of several ways money could arrive, rather than as the thing that makes a booking a booking.**

- **The desk form never took it.** It wrote a payment for the stay and left the BND 100 to a receipt saying "record it later", so a booking taken at the counter reached `confirmed` on the stay alone and the money that is supposed to secure it was an errand.
- **Money for the stay confirmed a booking whose deposit was unverified.** A guest who chose "everything now" raised two rows; verifying the stay's row first confirmed the booking and emailed them while the deposit sat unchecked. A guest who sent the stay and forgot the deposit was confirmed on the wrong money.
- **Check-in was still a place a deposit got collected**, which is the spreadsheet's habit the reversal of 10 September was meant to end.

**The rule, stated once and enforced in the database.** A booking quoting a deposit is confirmed by that deposit — counted in cash, or verified in the queue — and by nothing else. A booking quoting none is confirmed by paying for it. The stay's money is recorded whenever it arrives and settles the balance, but it moves no booking to `confirmed` while the deposit is owed. `booking_deposit_is_secured()` answers that question under the row lock and `verify_payment()`, `record_cash_payment()` and `check_in_booking()` all ask it, so the rule cannot be got round by a screen — the position §10.4's amount rule already takes. **[A]**

**The desk form takes the deposit as the booking is made**, in the same transaction as the booking, cash or promise — see §9.4's as-built note for the control and its default.

**Check-in collects nothing, and refuses what it cannot check in.** A booking whose quoted deposit is not in hand is turned back with the two honest ways out named on screen: confirm the transfer in the queue, or take the BND 100 in cash from the booking. That reverses the middle case of the block above, and the reasoning that made it a judgement then is what makes this safe now — the cash is still taken at the desk without sending anybody away, one screen earlier and on the booking rather than at the door. What it buys is that "checked in" can no longer mean "we never got the deposit", which is the gap in the spreadsheet this product exists to close. **[A]**

**The ledger gains a stage, because most deposits now belong to guests who have not arrived.** `secured` — *held before arrival* — sits between `awaiting_verification` and `in_house`. Reading a deposit taken at booking as "guest in stay" was the ledger assuming a deposit could only exist because somebody had checked in. A deposit against a booking that was cancelled or never turned up reads `secured` too: the least wrong stage available, because the forfeiture §9.5 describes is [N5](open-questions.md)/[N32](open-questions.md) and still unbuilt. **[A]**

**Every screen that could imply the door takes money now says otherwise** — the walk-in receipt, the booking's Money card, the check-in dialog, the cash log, the verification queue, the deposits ledger and the dashboard's arrivals list. The cash screen in particular says plainly that a security deposit is not recorded there: it goes on its own ledger, from the booking, and putting it through the cash form would bank a liability as takings (§14, [N27](open-questions.md)).

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

### As built (15 September 2026)

**Check-in takes no money, and that is the whole of what it does to a booking.** It moves the stay to `checked_in` and nothing else. The security deposit arrived when the booking was made (§9.1, §11), so a guest at the door already has one held — and a booking whose quoted deposit is *not* held is refused rather than made an occasion to collect it, with the way out named on screen. **[A]**

This sharpens requirement 6 rather than changing it. The guard's screen still shows payment status so an unpaid arrival is routed to the office; what is now also true is that an arrival with no deposit cannot be checked in at all, by anybody, until the office has recorded one. The stay's own balance is unaffected — a deposit-secured guest owes the whole stay on arrival and settles it at the desk (§10.7), which is a payment against the booking and not a condition of checking in.

---

## 13. Documents and data protection

**[C]** A copy of the guest's IC is required for registration. Name and vehicle registration are required for records and security.

**[C] An email address is captured, and it is optional** (13 September 2026, capabilities A1–A4). `guest.email` has existed since the first migration and nothing had ever written it; the public booking form is what architecture.md §9 meant by "email capture is added to the booking form". It is optional because A6’s fallback is a staff member forwarding the QR over WhatsApp (assumption A6), and refusing a booking for want of an address nobody needs yet would lose the booking.

**[C] Two emails are sent to that address, and never a third** (14 September 2026, capability A8's email half — see [architecture.md §9](architecture.md)). One when the booking is made, carrying the reference, the amounts and the bank accounts; one when the money is verified. The field's own hint on the form says *"For your confirmation. We will not email you anything else"*, which makes this a **standing constraint on every later slice** rather than a preference: a reminder, a receipt per payment or anything marketing would break a promise the customer was shown as they typed. It is also why the optionality above still holds — a booking with no address is confirmed by phone, as it is today, and the desk is told which bookings those are.

Nothing is actually delivered until a sending domain is verified, which is [N42](open-questions.md) and architecture.md §13 item 1.

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

### As built (capabilities B10, G2–G4, 7 September 2026; G5, 8 September 2026)

All five requirements are met. Requirements 1 to 4 arrived with the documents slice (the accounting pack a day after the rest), and requirement 5 — data export — is capability F5, delivered 12 September 2026: every table the business runs on downloads as a CSV. It was a single *Export data* screen under Admin listing all seventeen; since 9 September 2026 each table is taken from the screen holding its records instead — bookings from the register, deposits from the ledger, the trail from the audit log — because whoever wants a spreadsheet of the bookings is already looking at the bookings. Coverage is unchanged and is now held by a test rather than by a screen that listed everything. A document exports as a **record** of what was held and never as the file, and an identity document's filename is left out of it, because §8.1 counts that filename as content and a spreadsheet is not gated the way the document route is. The technical shape is [architecture.md §8.1 and §8.2](architecture.md). The following are **[A]** assumptions made while building, and are the ones to put in front of the client.

**[A] Three kinds of document, one mechanism.** A guest's IC on the booking, a transfer slip on a payment, and photographs on an inspection all use the same private storage, the same permission gate, the same access log and the same retention clock. That is why the slip (§10.4) and the inspection photographs (§11 requirement 2) arrive with this and not separately: they were never a different problem.

**[A] Who may open what, and who may attach it.** §4 mints exactly one document permission, `document.view_identity`, held by Admin and Front Office. That settles the sensitive half. The rest reuse the permission that already means the same job — a slip is attached and opened by whoever verifies payments, a photograph by whoever records the inspection — and **an identity document is attached and removed under `booking.amend`**, because putting an IC on file is a change to the booking's record. Attaching is deliberately *not* limited by booking status the way an amendment is: an IC that turns up after check-out is still the record this system exists to keep. **[O] [N23](open-questions.md)** puts the whole table to the client, along with its one non-obvious consequence — a role configured with `booking.amend` and without `document.view_identity` could remove an identity document it cannot open. No seeded role is in that position.

**[A] Existence is not content.** Anyone who may view a booking sees *that* an identity document is on file, what kind it is, how big it is and when it arrived; only opening it is gated. **The filename is not among them**, and that was a correction: an IC arrives named by whoever scanned it, so printing it would hand the guest's name — and often their IC number — to every reader the file itself was withheld from, through the one field nobody had gated. A reader who may not open it is shown the kind of document instead. A guard who can see the IC was collected is being told something useful and shown nothing, and hiding the row entirely would make "did anyone take it?" unanswerable by the people whose job it is to ask. Security and Housekeeping therefore see the row and never the file, which is the principle §4 states.

**[A] Retention is anchored differently per kind.** An identity document is kept twelve months after **checkout**, and its clock follows the stay — extending a booking moves it. A slip and a pack run seven years from when they were taken, because an accounting record dates from the transaction; a photograph two years from the inspection. Periods are configuration, not code, and capability F3 is the screen that edits them — **so no screen states the number.** An upload dialog that reads "kept for two years" is a second copy of that setting in the one place nothing will think to update, and it would start lying the first time Jason shortens the period himself. The copy says a file is kept privately and deleted when its retention period ends; what the period *is* belongs to F3, and to the document's own row.

**[A] Changing a period re-anchors what is already held** (12 September 2026, with F3). Shorten identity documents to six months and every one on file is re-dated to six months after its own stay — the anchors above are untouched, only the period moves. A retention policy describes what the business keeps, not what it happened to promise on the day each file arrived, and a screen that said "twelve months" while holding files under four different periods would be describing nothing. A file that is past its new date stops being viewable at once — every read already refuses an expired document — and the nightly job destroys it on its next run, rather than a settings save reaching into Storage. The event records how many files moved, because shortening a period that re-dates forty files is a different act from one that re-dates none.

**[O] The anchor for a cancelled booking is still open** ([N22](open-questions.md)). F3 makes the *duration* editable and no setting moves the anchor: an identity document taken for a booking that was cancelled still expires twelve months after a checkout that never happened.

**[O] What a cancelled booking's identity document should do is [N22](open-questions.md).** It keeps an anchor on a checkout that never happened. Under the PDPO the client may well want it destroyed sooner, and that is their call rather than an assumption to bury in a default.

**[A] A document is destroyed but its record is not.** When a retention period ends the file is deleted from storage permanently; the row survives as a tombstone, so the trail of who attached it and who opened it stays readable afterwards. That is the point rather than a technicality — the questions asked about an identity document are usually asked once it is gone.

**Every access is logged, and the log is on the screen.** Requirement 2's "every access logged" is an audit event per issued link, and it renders in the booking's own history as "Identity document opened", with who and when. A log the client cannot read is a control they were told about and cannot check.

**One limit is the platform's rather than a policy: 4 MB per file.** Phone photographs and WhatsApp screenshots sit well under it. See architecture.md §8.1 for what raises it when the housekeeping phone screen needs more. A pack is assembled on the server and never crosses that limit; its own ceiling is 25 MB.

**The accounting pack (requirement 4, capability G5).** Assembled by the system, never by hand: the itemised booking, each payment's verification record, each transfer slip copied in, and the identity document referenced. It sits on the booking as a document like any other — opened by anyone who may view the booking, kept seven years, every opening logged. The following are **[A]**.

**[A] The IC is referenced in the pack, not copied into it.** Requirement 4 says "IC" and the pack says *when it was collected, by whom, and which record it is* — never the image, never the filename. The reason is the two clocks above: a pack is kept seven years and opened by every role that can view a booking, an identity document twelve months and by Admin and Front Office only. A copy inside the pack would outlive the original by six years and reach Security and Housekeeping, which G2 promises never happens. **[C] That is what the accountant needs** (10 September 2026): asked outright whether the IC belongs inside the pack, Jason said no. [N24](open-questions.md) is answered, the pack keeps its own seven-year clock and its own audience, and the permission and retention decision the other answer would have forced does not arise. The scope wording that lists the IC among the pack contents is met by the reference.

**[A] "Transaction confirmation" is the verification record.** Nothing in the system is called a confirmation. What confirms a transfer is a person checking the bank (§10.4), so the pack prints that act: who verified it and when, the reference and sender they saw, whether it was matched by reference or by hand and why, and why an odd amount was accepted. Cash prints who counted it.

**[A] A pack is assembled the moment a payment is verified, and rebuilt overnight when what it records changes.** architecture.md §8 says "when a booking completes payment"; read literally that pack would usually be missing the IC, which arrives at check-in, and the slip, which arrives whenever the guest sends it. So the first pack exists within seconds of the money being confirmed, and every night any pack older than its newest slip, identity document, verified payment or booking change is assembled again. The earlier pack is kept on the history as replaced, never deleted. An identity document *expiring* on its own clock does not rebuild the pack: the pack states what was on file when it was assembled.

**[A] The desk can also rebuild a pack on demand, and the screen now knows when one is behind.** Two halves of the same fault. The staleness rule lived twice — the nightly job asked the database, and the booking screen decided for itself from verifications alone — so **a slip attached after a pack was built left the job treating the pack as due while the screen showed it as current**, a pack presented as up to date that was missing a file somebody had just added. The rule is now one database function (`accounting_pack_changed_at`, migration 20260909000100) that the job and the screen both read, so the two cannot drift. With the screen telling the truth, waiting until tonight became a choice rather than the only option: a pack that is behind carries a **Rebuild now** control on its title line, which assembles it there and then. It appears only when the pack is actually behind, and the permission is **[A] `payment.verify`** — [N25](open-questions.md).

**[A] The pack prints Latin script only.** It uses the PDF's built-in font, which spares the product a font file and a second library; a name in Chinese or Jawi characters is shown as `?` and the pack says so on the page, with the booking screen carrying the name in full. Whether that is acceptable is [C7](open-questions.md).

**The security deposit is one line in the pack, pointing at its own statement.** §11 keeps it a separate liability with its own record, and repeating it here would make the pack the whole ledger.

---

## 14. Reporting

v1 reporting is deliberately minimal:

- Occupancy by unit and by type, over a date range
- Revenue by stream (day passes, short stays, long-term)
- Outstanding deposits held
- Outstanding charges owed
- Daily cash-up: recorded versus banked
- Day pass volume against configured capacity

### As built (capabilities E4–E5, 9 September 2026)

Five of the six are live. Day-pass volume against capacity is not, and cannot be: a day pass is not bookable in the portal, carries no date of its own, and no facility capacity has been agreed ([C2](open-questions.md)). The reports screen states that where the figure will go rather than omitting the row, and it arrives with the day-pass flow. The following are **[A]** assumptions made while building, and are the ones to put in front of the client.

**[A] Occupancy is unit-nights sold or lived in, over the property's whole inventory.** A unit-night counts when an occupancy row covers it in one of four statuses — confirmed, checked in, completed, or leased. A **held** unit does not count: a hold is somebody's intention and expires on its own (§9.3), so counting it would report a building fuller than the money says it was. Nor does a no-show. The denominator is units of the type × nights in the period, and **a unit out of service stays in it** — removing it would make a building that broke down look fuller than one that did not. Nights are half-open, matching every other range in the system. `lib/db/bookings.ts` flagged that this definition had to be agreed rather than inherited from the dashboard's "occupied tonight" figure; this is that agreement, and the screen states it beside the table.

**[A] Revenue is money received, on the day it arrived.** Verified payments only — §10.7 already took this position for the balance, and a report built on booking totals would state income the bank has never held, moving whenever a booking is amended. Cash counts on the day it was collected; a transfer on `observed_on`, the date the verifier read off the bank. **`observed_on` is optional, so a transfer without one falls back to the day it was verified** — named rather than silent, because a run of payments dated by when a clerk was at their desk is worth noticing. The consequence worth stating: this is a **cash-basis** figure. A stay paid for in August and taken in September is August's revenue, which is the basis Finance reconciles on and the one that agrees with the cash-up beside it. Security deposits are excluded in both directions (§11) — with one exception nobody has priced yet. §9.5's answer of 10 September 2026 makes a forfeited deposit money the business keeps, and money kept is revenue on the day it is kept. Nothing forfeits a deposit today, so no figure here is wrong; the rule arrives with the forfeiture, and whether the accountant wants it counted that way is [N32](open-questions.md).

**[A] The cash-up's recorded figure is cash booking payments, and deposits sit outside it.** A cash deposit goes into the same drawer, so the day states how much of it is there and the total leaves it out: §11 makes a deposit a refundable liability rather than takings, and banking one as revenue would be counting money the business owes back. The excess a guest settles beyond their deposit is excluded on the reasoning §11 already recorded — it "settles no booking and appears in no cash-up". Whether Finance would rather count the drawer as one figure is **[N27](open-questions.md)**; the answer moves one line.

**[A] A banking is its own record, against a business day, and it is never edited.** Not a third payment status: notes from six payments go to the bank in one envelope, and the same money may be banked across two runs or the next morning. So a banking carries the day the cash was **taken** — chosen by the person banking, defaulted to the day on screen, and never in the future — while when the trip happened is a separate fact on the same row. A correction is a **second entry** rather than a change to the first, because editing one rewrites what somebody says they did; both stay on the day and the difference moves. Amounts are positive: money coming back out of the bank is a refund, and refunds are [N5](open-questions.md).

**[A] Banking is recorded under `payment.verify`, minting no new permission.** §10.5's own [A] reads "verified by Finance" as the cash-up rather than as a per-payment sign-off, so whoever may verify that money arrived is whoever may say it reached the bank. That is the position §10.7 took for recording a transfer and §13 for rebuilding a pack. **[N26](open-questions.md)** puts it to the client, with the consequence that Front Office — who take the cash — hold neither `report.view` nor a way onto the screen.

**[A] The reconciliation is a running balance, not a per-day variance.** The first build compared each day's cash against each day's banking and reported the difference per row. That is only correct for a desk that banks every day it takes cash, and this one does not: an evening's notes go in the next morning, and a quiet week goes in on one trip. Under a per-day rule that trip left four days reading "not banked" and the fifth "over" by four days' takings, and squaring it would have meant splitting one deposit slip across five rows by hand — a reconciliation that makes the ordinary week look broken is one nobody keeps up. So a day now carries a **balance brought forward**: everything taken, less everything banked, since the building opened. One lump sum clears whatever has built up, whichever days it came from, and no row is matched to another. The screen leads with **cash on hand** — what should be in the drawer right now — which is the one figure here a person can verify directly by counting it. A window's own recorded and banked totals still answer §10.5's "recorded cash against banked amounts" for the period; what changed is that the *day* is no longer the unit of reconciliation. A negative balance is the one state arithmetic can call wrong — more has reached the bank than was ever recorded — and it is named **over-banked** rather than dressed as a shortfall.

**Every report table downloads as CSV.** A report nobody can get out of the browser is half a tool: the accountant works in a spreadsheet and a screenshot cannot be summed. Each table carries a *Download CSV* on its title line, exporting the rows behind it **for the period and filters on screen** — the file is the screen, read through the same functions the page uses, so the two cannot disagree. Deliberately unpaged: a page boundary is a reading convenience and a spreadsheet has no use for one. Amounts go out as bare decimals with the currency named in the column header, because a cell reading `BND 2,360.00` is text a spreadsheet cannot add up. **This is not F5**, which is the whole-business data export: that one hands over a *table*, this one hands over the *screen* — its period, its filters and its arithmetic. The two now sit in one menu on the cash-up, where both exist, and the menu names them apart for exactly that reason.

**[A] Nothing about a day's reconciliation is stored.** Recorded, banked and the difference between them are derived from the payments, the deposits and the bankings on every read — the same argument [architecture.md §5.1](architecture.md) makes for `unit.status` and a deposit's stage. A banking recorded late correctly changes yesterday's answer.

**A day boundary is an instant, not a date.** Every timestamp is `timestamptz`, and a bare date compared against one is cast at the *session's* midnight — UTC on Supabase, which is 08:00 in Brunei. The cash log had that bug and was filing the first eight hours of every day under the day before; the conversion now happens once, at the boundary. Worth recording because it is invisible until somebody counts a drawer.

**`report.view` is now enforced.** It was seeded to Admin and Finance and checked nowhere; the two reporting screens are its first consumers.

---

## 15. Non-functional requirements

| Area | Requirement |
|---|---|
| **Platform** | Responsive web application. No native apps. Field screens must work on mid-range phones over mobile data. |
| **Availability integrity** | Double booking must be structurally impossible. Enforce with a database-level constraint on overlapping occupancies, not application logic alone. |
| **Timezone** | Brunei time (UTC+8). All dates stored in UTC, displayed local. |
| **Currency** | BND. |
| **Language** | English. **[O]** Whether field screens require Malay is unconfirmed. |
| **Audit** | All state changes on bookings, payments, deposits and charges recorded with actor and timestamp. Readable in full on one screen since 12 September 2026 (capability F4), filtered by what changed, which record, who did it and when — and settings changes are recorded there too, which F4's wording predates. |
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
