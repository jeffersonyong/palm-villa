# Palm Villa Platform — Scope of Capabilities

**Companion to the project proposal · Draft for review · 20 August 2026**

This document lists, in plain language, everything the Palm Villa platform will let your customers and your team do. It is the agreed scope baseline for the quoted work:

- **If a capability is listed here, it is included** in the quoted delivery.
- **If it is not listed here, it is not included.** The "Not included in this delivery" section makes the deliberate exclusions explicit, with notes on when each can be added.
- Every capability has a reference number (A1, B4, …) so we can point at specific items when reviewing — "add this", "remove that", or "this wasn't in scope".

---

## What is being delivered

One web application, one shared database, serving three surfaces:

1. **Public booking site** — where customers check availability, book, and pay.
2. **Operations portal** — the desktop workspace for reservations, finance, and management. This replaces the spreadsheet.
3. **Field screens** — simple phone-browser screens for security and housekeeping. Nothing to install.

Everyone works from the same live data, so availability, payments, and booking status are always consistent across all three.

---

## A. What customers can do (public site)

| # | Capability |
|---|---|
| A1 | Check live availability for any dates — without messaging anyone |
| A2 | See the exact itemised price before booking: nightly rate, extra persons, sofa beds, early check-in, late check-out |
| A3 | Book a facility day pass online, with per-person rates and family bundles applied automatically — the system always charges the cheapest applicable combination |
| A4 | Book a short stay online; the unit is held on a checkout timer while payment completes, then released automatically if unpaid |
| A5 | Receive bank transfer instructions (BIBD / Baiduri) with a unique payment reference to include in the transfer |
| A6 | Upload their transfer slip directly, instead of sending it over WhatsApp |
| A7 | Provide guest details and identity document as part of the booking, replacing the paper/WhatsApp collection step |
| A8 | Receive booking confirmation and an entry QR code by email — delivered as a forwardable image so staff can also send it in an existing WhatsApp conversation |
| A9 | Look up their own booking any time using booking reference + phone number |
| A10 | Get answers to common questions from a self-serve FAQ page |
| A11 | Browse a public landing page presenting the day-pass facilities, the unit types and "from" rates, with an enquiry route for long-term lets — **(proposed 27 August 2026, pending client agreement — not yet part of the quoted delivery)** |

> **A11 is provisional.** A1–A10 describe a booking site; a marketing landing page is a separate surface that was built ahead of agreement and is recorded here so the baseline stays honest. It is included in the quoted work only once confirmed.

---

## B. What Reservations / Front Office can do (portal)

| # | Capability |
|---|---|
| B1 | See every booking across all streams in a calendar view and a list view — the single source of truth replacing Excel |
| B2 | Create a walk-in booking on the spot, using the same availability check and pricing engine as the public site — no double-entry, no divergent prices |
| B3 | Amend and cancel bookings, with every change recorded (who, what, when) |
| B4 | Work a payment verification queue: each pending booking shows reference, guest, amount expected, waiting time, and the uploaded slip |
| B5 | Confirm payments by matching **both** reference and amount — a short payment is flagged, never silently accepted |
| B6 | Manually match a transfer to a booking when a customer forgets the reference |
| B7 | Record cash payments against a booking: who collected, when, how much |
| B8 | See each unit's live status through its full lifecycle: available → held → booked → occupied → awaiting inspection → cleaning → available |
| B9 | Mark units out of service, or as leased long-term, so availability always reflects reality |
| B10 | Access guest records and identity documents, subject to permission (see G-series) |
| B11 | Discount a booking at the desk — a fixed amount or a percentage — with a typed reason recorded against it. Discounting is its own permission, so it can be withheld from a role that otherwise takes bookings, and every discount given appears in the audit trail. **(added 1 September 2026 at the client team's request)** |
| B12 | Keep free-text notes on any booking: an append-only thread with who wrote each note and when, so context stops living in WhatsApp. Each note is marked for the office or for housekeeping. **(added 1 September 2026 at the client team's request)** |
| B13 | Settle what an amendment left owing: a booking shows what has been paid and what is still outstanding, and the difference can be taken in cash or by bank transfer from the booking itself. A top-up transfer goes through the same verification queue as any other. **(added 1 September 2026 — the gap the amend feature created)** |

| B14 | Keep a note against a **unit** — a sticking door, a temperamental aircon, where the spare key lives. It belongs to the unit rather than to whoever is staying in it, so it survives every booking, and every change to it is recorded with who made it and when. **(added 2 September 2026 at the owner's request)** |
| B15 | Waive the security deposit on a booking at the desk, with a typed reason recorded in the booking's history — the case is a guest extending their stay, where the deposit is already held under the first booking. Waiving is its own permission, so it can be withheld from a role that otherwise takes bookings, and a waived booking checks in taking nothing and says so. **(added 5 September 2026 at the owner's request)** |

**B8 is delivered across two slices.** Four of the six states — available, held, booked, occupied — are live now, alongside out of service and leased long-term from B9. **Awaiting inspection** and **cleaning** are the two the housekeeping flow writes, so they arrive with **C2–C3** and B8 is not complete until those screens land. Said here rather than left to be noticed: until then the board can tell you a unit is empty, but not whether it has been cleaned.

---

## C. What Housekeeping can do (phone)

| # | Capability |
|---|---|
| C1 | See today's check-outs on a single phone screen |
| C2 | Record a unit inspection: outcome, notes, and photographs as evidence |
| C3 | Mark a unit as ready, returning it to bookable availability |

---

## D. What Security can do (phone)

| # | Capability |
|---|---|
| D1 | See today's expected arrivals on a single phone screen, built to remain usable on poor signal |
| D2 | Look up an arriving guest by **vehicle registration** or name |
| D3 | Check a guest in by scanning their QR code with the phone's normal camera — no app, no special scanner |
| D4 | See the booking's payment status at the gate, so an unpaid arrival is flagged and routed to the office rather than waved through |

A forwarded or leaked QR code grants nothing by itself — check-in authority comes from the logged-in staff member, and each code can be revoked and re-issued.

---

## E. What Finance can do (portal)

| # | Capability |
|---|---|
| E1 | See all security deposits currently held, as a live ledger — "what do we owe back right now" answered in one screen |
| E2 | Approve deposit releases — the approval is only available once the inspection is recorded, and is logged as a formal event (who approved, when, how much) |
| E3 | Record itemised charges against a deposit, each with a reason and author; where charges exceed the deposit, the balance is tracked as an amount owed with a shareable statement |
| E4 | Run a daily cash-up view: cash recorded in the system versus cash banked |
| E5 | View reports: occupancy by unit and type, revenue by stream, outstanding deposits, outstanding charges, and day-pass volume against capacity |

**E1–E3 delivered 6 September 2026.** The ledger answers what is held right now, a deposit has its own screen carrying the inspection, its itemised charges and the release approval, and a released deposit prints a statement to send on.

- **Photographs on an inspection arrived on 7 September 2026** with document storage, closing the gap this entry flagged. C2's evidence is now real: any number of photographs per inspection, stored privately, deleted automatically after two years.
- **Checking a guest in and out became possible along the way**, because a deposit is collected on arrival and inspected after departure, and neither moment existed in the product before. It is a desk action under the same permission as amending a booking; **Security still cannot check anyone in**, which is what D3 needs and what open question N11 has to settle.

**B8 is unchanged.** Awaiting inspection and cleaning are still the two unit states this build cannot show — what has changed is that the inspection they depend on is now a fact somebody records, so C2–C3 have something to derive from.

---

## F. What the Owner / Admin can do (portal)

| # | Capability |
|---|---|
| F1 | Manage staff accounts and assign roles — one person can hold several roles (e.g. Front Office + Finance + Admin), so the system fits the team as it is today and as it grows |
| F2 | Adjust what each role is allowed to do, without developer involvement |
| F3 | Configure pricing, facility inclusion and capacity, hold durations, and document retention periods — pending decisions (e.g. whether gym, snooker or sauna are included in the day pass) become a settings change, not a development change |
| F4 | Review the full audit trail: every change to bookings, payments, deposits, and charges, with actor and timestamp |
| F5 | Export all business data at any time in a usable format — the data is yours |
| F6 | Name the units the way they are labelled on the actual doors, and set how many of each type the building has — so the system matches the building without a developer. Names are set as a pattern per unit type and can be adjusted one at a time where a block does not follow the pattern. Every rename is recorded, and a unit that has hosted a booking is taken out of service rather than deleted, so its history survives. **(added 2 September 2026 — it removes two of the open questions from the critical path)** |

---

## G. Built-in guarantees (system-wide)

| # | Capability |
|---|---|
| G1 | **Double booking is structurally impossible** — enforced by the database itself, not by staff vigilance or an approval step |
| G2 | Identity documents are stored encrypted, in private storage, and can only be viewed by roles explicitly granted access — Security and Housekeeping have none by default |
| G3 | Every access to an identity document is logged: who viewed which document, and when |
| G4 | Documents are kept under a configurable retention policy and deleted automatically when it expires — replacing indefinite accumulation, in line with Brunei's Personal Data Protection Order 2025 |
| G5 | The accounting record pack (transfer slip + IC + confirmation + itemised booking) is generated automatically per booking — no more manual PDF assembly |
| G6 | Automatic daily backups, with a restore procedure tested before go-live |
| G7 | Errors are monitored and reported automatically, so problems announce themselves |

**G2, G3 and G4 delivered 7 September 2026, along with B10 — and they close the two gaps flagged above.** Documents are now real throughout: a guest's IC on the booking, a transfer slip on a payment (**B4**), and photographs on an inspection (**C2**). All three sit in private storage that nothing on the public internet can reach, are opened only through a link that expires after a minute, and are deleted automatically when their period ends — twelve months after checkout for identity documents, seven years for slips, two years for photographs. Those periods are settings, not code.

Four things worth saying plainly, because they are what the guarantees actually mean in daily use:

- **Seeing that a document exists and being able to open it are different permissions.** Anyone who can view a booking can see that the IC was collected and when. Only Admin and Front Office can open it. Security and Housekeeping have no access to the file at all, as promised.
- **Every opening is recorded on the booking's own history** — who opened which document and when — so G3 is something you can read rather than something you are told about.
- **When a document is deleted, the record that it existed stays.** The file is destroyed; the trail of who attached it and who ever opened it survives, because those are the questions asked *after* a document is gone.
- **A file is checked for what it actually is**, not what it is named. A document renamed to look like a photograph is stored as what it really is, or refused.

**G5 delivered 8 September 2026.** Every booking with a verified payment now carries an accounting pack — one PDF with the itemised booking, the record of who confirmed each payment and what they saw in the bank, the transfer slip copied in, and the record of the guest's identity document — assembled by the system the moment a payment is verified, and rebuilt overnight whenever a slip or IC is attached later, a payment is confirmed, or the booking changes. It sits on the booking beside the payments, opens like any other document, and is kept for seven years. Two things worth saying plainly:

- **The IC is referenced in the pack, not copied into it.** The pack records that the IC was collected, when and by whom. It does not carry the image, because the pack is kept seven years and can be opened by every role that can view a booking, while the IC itself is kept twelve months and opened only by Admin and Front Office. Copying it in would quietly undo both of those promises. If the accountant needs the image inside the pack, that is a decision to make deliberately — see the register.
- **An earlier version of a pack is never lost.** When a pack is rebuilt, the previous one is recorded as replaced on the booking's history, so what was sent to the accountant last month remains answerable.

**Still to come in this area:** **A7** — customers uploading their own IC and slip during booking — remains phase two; today staff attach what a guest sends them, which is what they do now anyway.

**One question this raised for you:** what should happen to a guest's identity document when their booking is **cancelled**? It currently follows the same twelve-month clock counted from the stay they never took. You may want it destroyed sooner. See the register.

---

## Delivery phases

The quoted delivery covers Phases 1 and 2.

**Phase 1 — Operations portal first.** The staff-facing system: unit registry, pricing, availability, booking management, payment verification, cash recording, deposits and inspections, document storage, accounting packs, roles, and reporting. The spreadsheet is the acute pain, so it is replaced first — the business is materially better off within weeks, before anything is exposed publicly.

**Phase 2 — Customer-facing.** The public booking site (day passes and short stays, payment instructions, slip upload), QR issue and delivery, the security check-in screen, the housekeeping checkout screen, and the FAQ.

---

## Not included in this delivery

These exclusions are deliberate. Each is either not needed on day one or depends on an external step. All are natural later additions — the system is designed so none of them requires rework.

| # | Excluded | Notes |
|---|---|---|
| X1 | Online card payments | Requires Baiduri / BIBD merchant onboarding. The payment layer is built so a gateway plugs in later without changing booking logic. |
| X2 | Automated bank statement matching | The unique payment reference on every booking is the groundwork; a statement-import matcher is a later addition that reduces the manual queue to exceptions only. |
| X3 | WhatsApp Business API integration | Confirmations and QR codes are delivered by email plus a forwardable image for WhatsApp, which works from day one. |
| X4 | Native iOS / Android apps | The field screens are mobile web — nothing to install, nothing to update. |
| X5 | Full long-term tenancy management | Rent collection workflow, agreements, e-signing, renewals. Units can be marked leased long-term so availability stays correct; a thin tenancy module (tenancy records, per-month rent tracking, agreement files) is a defined Phase 3 extension. |
| X6 | Channel / OTA sync (Airbnb, Booking.com) | Not part of the current sales model. |
| X7 | Events and party bookings as a self-service product | Can be handled as manual bookings in the portal; a dedicated product is a later decision. |
| X8 | Smart locks / automated gate control | Physical access remains as-is; the system tells Security who to expect. |
| X9 | Multi-property administration screens | The data layer supports additional properties from day one; the management UI for it is built when a second property is real. |
| X10 | Migration of historical documents | The system holds data from go-live onward. The existing folder of accumulated documents stays outside the system. |
| X11 | Part payments — a guest *choosing* to pay a deposit now and the balance later | Not in the quoted delivery, and not a technical limitation: the stated policy is that full payment secures a unit and that unpaid bookings hold no inventory. Raised 1 September 2026; it needs that policy revisited before it can be offered. **Note the distinction from B13:** the system can now track an outstanding balance, because an amendment can leave one. What it does not do is let a guest opt into paying in instalments at booking time. |

---

## Details to confirm together during the build

None of these block starting; each is needed before its specific screen is finalised.

1. Number of 2-bedroom units, and confirmation of the total unit count. **No longer blocks delivery** — F6 makes this a setting rather than a build step, so it can be answered on the day the system is handed over.
2. Whether stated max occupancy is a hard cap, or the point above which the extra-person charge applies.
3. The exact day-pass age boundary (the current "1–12" and "12+" bands overlap at 12), and pricing under age 1.
4. Family bundle pricing for shapes other than 2 adults + 1 child and 2 adults + 2 children.
5. Which payment is forfeited on cancellation / no-show — the booking payment or the BND 100 security deposit (the platform names these two separately to keep this unambiguous).
6. Standard check-in time, so "early check-in" has a definition.
7. How long an unpaid booking holds a unit (suggested: 60 minutes for stays, 30 for day passes).
8. Total sofa beds available across the property.
9. Whether guests may choose a bed configuration, or staff assign it.
10. Whether a staff discount needs a ceiling, or a second person's approval above some figure. It is currently uncapped and fully recorded rather than gated.
11. Whether part payments should be possible at all — see X11 above.
12. What, if anything, the office needs to tell housekeeping about a particular guest, once the phone screens are built.

---

*This document describes functional scope only. Pricing, timeline, and commercial terms are covered in the accompanying proposal.*
