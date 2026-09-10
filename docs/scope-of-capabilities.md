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
| A1 | Check live availability for any dates — without messaging anyone — **delivered 13 September 2026** |
| A2 | See the exact itemised price before booking: nightly rate, extra persons, sofa beds, early check-in, late check-out — **delivered 13 September 2026, less early check-in, which is not sold (see N31)** |
| A3 | Book a facility day pass online, with per-person rates and family bundles applied automatically — the system always charges the cheapest applicable combination — **delivered 13 September 2026** |
| A4 | Book a short stay online; the unit is held while payment completes — **reworded 10 September 2026, see the notes below; delivered 13 September 2026** |
| A5 | Receive bank transfer instructions (BIBD / Baiduri) with a unique payment reference to include in the transfer |
| A6 | Upload their transfer slip directly, instead of sending it over WhatsApp |
| A7 | Provide guest details and identity document as part of the booking, replacing the paper/WhatsApp collection step |
| A8 | Receive booking confirmation and an entry QR code by email — delivered as a forwardable image so staff can also send it in an existing WhatsApp conversation — **email half delivered 14 September 2026; the QR travels with the security screen (D3), see the notes below** |
| A9 | Look up their own booking any time using booking reference + phone number — **delivered 16 September 2026** |
| A10 | Get answers to common questions from a self-serve FAQ page — **delivered 16 September 2026, see the notes below on what it cannot yet answer** |
| A11 | Browse a public landing page presenting the day-pass facilities, the unit types and "from" rates, with an enquiry route for long-term lets — **(proposed 27 August 2026, pending client agreement — not yet part of the quoted delivery)** |

> **A4 is now secured by the deposit, like B16.** The owner confirmed on 10 September 2026 that a booking is held by the BND 100 security deposit with the stay paid on arrival, which is how the business already works. The public flow asks a customer for the deposit rather than the whole stay; everything else about A4 is unchanged.

> **A4 no longer promises a timer.** Asked how long a unit should be held for a guest who says they are transferring, the answer was *indefinitely, until somebody checks* — so nothing releases a booking automatically, by decision rather than by omission. The public flow will state the reference and the amount and say the unit is held until payment is confirmed; a countdown the system does not enforce would be a promise it does not keep. Nothing about the delivery changes. See the register.

> **A1–A4 delivered 13 September 2026, and A5 is half delivered with them.** A customer picks a unit type, sees what is free on every night for the next two months with the nightly rate on each one, gets an itemised price before committing to anything, and books — a day pass or a short stay. They are then shown the reference, the amount and the bank accounts to transfer to, which is A5 without the slip upload (A6) and without the email (A8).
>
> Six things worth saying plainly, because they are the decisions behind the screens:
>
> - **A short stay is held by the deposit, and the stay is paid on arrival** — B16. The customer transfers BND 100, somebody verifies it in the payments queue, and the booking is confirmed with the stay still owed in full. **The desk works the same way, from 15 September 2026**: the booking form takes the deposit as the booking is made and asks whether the guest is paying the deposit alone or the stay with it. The deposit is what makes a booking a booking — money for the stay never confirms one whose deposit is still owed, and a guest whose deposit is not in cannot be checked in until the office records it.
> - **A guest who would rather pay everything now can.** Asked what a guest transfers when booking, the owner named two cases — the deposit only, or the full amount with the deposit — and both are offered, with the deposit as the default. It is one transfer and two figures on the queue, because the refundable deposit and the money for the stay are different things and stay apart. This is not part payment: the stay is settled in full either way, only sooner.
> - **There is no countdown, by decision.** The register's N7 makes a hold indefinite, so the page says the unit is held until the transfer is confirmed. A timer nothing enforces would be a promise the system does not keep — and an indefinite hold is only safe while somebody works the queue, which is the same sentence that answer has carried since it was given.
> - **The system picks the unit, not the customer.** A customer chooses a *type*; the system assigns a door and the desk can move it. Units of one type are not interchangeable (bed configurations differ), so offering a choice of door would be giving away a decision nobody has agreed to give away.
> - **A day pass never asks the customer to find the bundle.** The engine tries every arrangement and charges the cheapest, so two adults and a child pay BND 20 rather than BND 25 without needing to know a bundle exists. **Confirm before go-live** whether a bundle may apply more than once on one booking — a family of four adults and two children is BND 40 under the current reading and BND 45 under the other.
> - **The public site is defended without a CAPTCHA.** A hidden field, a request counter, and a cap on how many unpaid bookings one phone number may hold at once. The last is the one that protects rooms; the numbers behind all three are in the register.
> - **The 2-bedroom is not on sale.** It has no units until the count is agreed, so it is not offered rather than shown as full on every night.
>
> **Still to come on this surface:** the customer uploading their transfer slip (A6) and identity document (A7), and the entry QR code (A8's other half).

> **A9 and A10 delivered 16 September 2026.** A customer who has lost the link to their booking types the reference from their transfer and the phone number they booked with, and lands on their booking. A visitor who has not booked yet reads the answers to the questions guests actually ask, with every rate and time on the page read live from Property settings.
>
> Four things worth saying plainly:
>
> - **A9 matters more than its one line suggests, because the email is off.** The confirmation email is built and switched off until the sending domain is agreed (register N42), so until then a customer who closes the tab has *no* route back to their booking. A9 is that route.
> - **A booking taken at the desk gets a link the first time somebody looks it up.** Walk-in bookings have never had one and never needed one; a guest who rings up asking to see their booking is the case that changes that. The link is created on the spot, the same link every time afterwards, and the booking's history records that it was issued and how it was found.
> - **Somebody who knows a reference and the number it was booked with can open that booking.** That is the capability, stated plainly. A reference is short and sequential because it has to be typed into a bank transfer, so the phone number is what actually protects the booking, backed by a limit on how many attempts one device or one reference gets. **The figures are in the register (N47) and nobody has agreed them.**
> - **The FAQ answers only what has been confirmed, and says so where it has not.** Eight questions a guest would obviously ask are open items — what a stay includes at the facilities, whether cancelling early costs less, house rules, opening hours, and four more — and each is on the page as a visible "to confirm" marker rather than an invented answer. **The count of those markers is the count of questions still with the client**, and four new ones (N44–N47) were raised by writing the page. It also deliberately does not repeat the booking page's promise of a confirmation email and an entry QR code, because neither exists yet and a search-indexed page saying so is a phone call to the desk.

---

> **A8's email half delivered 14 September 2026.** A customer who books now receives two emails: one when they book, carrying the reference, what to transfer, the bank accounts and a link back to their own booking page; one when the desk verifies the money, confirming it and saying what is left to pay on arrival. Before this, everything a customer needed lived on one page behind one link nobody had sent them — close the tab and the only way back was to message the office, which is the habit this product exists to replace.
>
> Five things worth saying plainly:
>
> - **The QR code is deliberately not in this half.** Nothing can read one yet: checking a guest in is still a desk action, because who may do it at the gate is unanswered (N11), and the security screen that would scan a code is unbuilt. A code issued now would also stop working the day the domain changes, so every guest who had one would need a new one. It arrives with the arrivals screen, and the emails say what to quote instead of promising a code that does nothing.
> - **Nothing is being sent yet, and that is the domain question.** The mail service will only deliver to the developer's own address until a Palm Villa sending domain is verified, and no domain has been chosen. The feature is finished, tested and switched off; turning it on is one setting and a few DNS records, on the day the domain is decided. **This is now the thing the unanswered domain question is holding up.**
> - **One email per booking, and only ever these two.** The booking form promises "we will not email you anything else", so it is a standing constraint rather than a preference: no reminders, no marketing, no receipts for each payment. A guest who pays in three instalments hears once.
> - **The confirmation states what is actually left to pay**, which the booking page had been getting wrong. A guest who chose to send everything up front was still being told the whole stay was due on arrival. Both surfaces now read the same figure from the same place, so they cannot disagree — and a guest cannot be asked twice for money they have already sent.
> - **A guest cannot be used to send mail to a stranger.** Anyone can reach the booking form, so the address a booking names is capped at a few emails a day — the only limit in the system that protects somebody other than the property.
>
> **Two things the desk should know.** A booking made online without an email address says so on its own screen, so somebody knows to confirm by phone or WhatsApp. And when an email cannot be delivered, that is recorded on the booking's history with the reason — the desk reads it there and falls back to WhatsApp, which is what it does today anyway.

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
| B16 | Take an advance booking secured by the security deposit: the guest transfers the BND 100 when they book, the unit is held until someone verifies it, and the stay itself is settled on arrival. A guest who cancels or does not turn up forfeits the deposit. **(added 10 September 2026 at the owner's request — it replaces the walk-ins-only rule the scope was written against. **Delivered 13–15 September 2026**: a customer booking online transfers the deposit and the queue verifies it; the desk form takes it as a booking is made, in cash or as a transfer, and asks whether the guest is paying the deposit alone or the stay with it; the deposit is what confirms a booking, so money for the stay never confirms one whose deposit is still owed; and check-in collects nothing, refusing a booking whose deposit is not in.)** |

**B8 is delivered across two slices.** Four of the six states — available, held, booked, occupied — are live now, alongside out of service and leased long-term from B9. **Awaiting inspection** and **cleaning** are the two the housekeeping flow writes, so they arrive with **C2–C3** and B8 is not complete until those screens land. Said here rather than left to be noticed: until then the board can tell you a unit is empty, but not whether it has been cleaned.

**B1's calendar half delivered 8 September 2026.** Every stay, hold and lease is laid out by unit and by night, one month at a time, coloured by state; an empty night starts a booking with the night and the unit type filled in (B2). Day passes are not on the grid: they occupy no unit and nothing writes one yet — they appear in the list view, and arrive on their own terms with the day-pass flow in phase two.

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
| E5 | View reports: occupancy by unit and type, revenue by stream, outstanding deposits, outstanding charges, and day-pass volume against capacity — **each table downloadable as a CSV** for the period and filters on screen |

**E4–E5 delivered 9 September 2026.** The reports screen answers occupancy by unit and by type over any period, revenue by stream, and what is held and owed right now; the daily cash-up is its own screen, comparing the cash the desk recorded against the cash somebody took to the bank, day by day.

Four things worth saying plainly, because they are the decisions behind the figures:

- **The cash-up counts booking payments, not deposits.** A cash security deposit goes into the same drawer, so the day states how much of it is there — but it is money you owe back rather than money you earned, and adding it to the takings would bank a liability as revenue. Whether Finance would rather count the drawer as one figure is a question in the register.
- **Banking is recorded, never edited.** A trip to the bank is a physical act with a witness, so a correction is a second entry and the day's difference moves. Both entries stay on the day, with who recorded each.
- **Revenue is money received, not money quoted.** A payment counts on the day it actually arrived — cash on the day it was taken, a transfer on the date read off the bank — and a payment nobody has confirmed counts for nothing. So the revenue figure agrees with what the bank holds rather than with what bookings were worth.
- **A tenancy shows no revenue, and says so.** A long lease is recorded as occupancy with no money attached until the tenancy module arrives, so it appears in occupancy and at zero in revenue.

**One item of E5 is not delivered: day-pass volume against capacity.** Day passes are not bookable in the portal yet, carry no date of their own, and no facility capacity has been agreed (see the register, C2) — so neither the volume nor the number to compare it against exists. The screen says so where the figure will go, and it arrives with the day-pass booking flow in phase two.

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
| F3 | Configure pricing, facility inclusion and capacity, and document retention periods — pending decisions (e.g. whether gym, snooker or sauna are included in the day pass) become a settings change, not a development change. **Hold durations struck from this wording 12 September 2026**, see the note below |
| F4 | Review the full audit trail: every change to bookings, payments, deposits, and charges, with actor and timestamp |
| F5 | Export all business data at any time in a usable format — the data is yours |
| F6 | Name the units the way they are labelled on the actual doors, and set how many of each type the building has — so the system matches the building without a developer. Names are set as a pattern per unit type and can be adjusted one at a time where a block does not follow the pattern. Every rename is recorded, and a unit that has hosted a booking is taken out of service rather than deleted, so its history survives. **(added 2 September 2026 — it removes two of the open questions from the critical path)** |
| F7 | Replace the photographs on the public site — one current image per unit type and per facility, uploaded from the portal with the descriptive text that goes with it. A repaint, a renovation or a new photo shoot is an upload, not a developer deploy. **(proposed 10 September 2026 by Jeff, pending client agreement — not yet part of the quoted delivery)** |

> **F7 is provisional, and it depends on a conversation A11 is already waiting for.** The public site currently shows a labelled placeholder where each photograph belongs — no real images exist yet — so this is a capability and the imagery it manages, not a control added over something already built. It is recorded here so the baseline stays honest, on the same footing as A11, and both belong in one conversation: the landing page A11 describes is the surface F7's photographs appear on, and neither is in the quoted work until confirmed.

> **F3, F4 and F5 delivered 12 September 2026.** Property settings edits the rates, the day-pass prices, what a day pass admits, how long each kind of document is kept, and the bank accounts customers transfer to. The audit log reads the whole trail on one screen. Every table the business runs on downloads as a spreadsheet — from the screen that holds its records, so the bookings come off the register and the deposits off the ledger.
>
> Five things worth saying plainly, because they are the decisions behind the screens:
>
> - **"Hold durations" has gone from F3's wording, and nothing was lost.** The owner's answer of 10 September was that a unit is held indefinitely until somebody checks — so a setting for how long a hold lasts would be a number he could change that changed nothing, inviting him to shorten a timer that does not exist.
> - **A rate change is not retrospective.** A booking already taken keeps the price it was quoted; only a new booking, or an amendment to an existing one, is priced at the new rate. The screen says so where the rates are edited.
> - **Shortening a retention period does apply to files already held.** Cut identity documents to six months and every one on file is re-dated to six months after its stay; anything then past its date stops being viewable at once and is destroyed on the next nightly run. The record that the file existed, who uploaded it and who opened it survives either way.
> - **The export is the records, never the files.** Documents come out as a list of what was held — kind, size, who uploaded it, when it stops being kept — and an identity document's filename is left out, because it usually carries the guest's name and IC number and a spreadsheet is not protected the way the document screen is.
> - **The audit log and the export are Admin-only, and downloads are not themselves logged.** Neither decision is in the PRD; both are in the register for confirmation.
>
> **One thing F3 cannot finish alone:** every facility's day-pass capacity is empty, because no capacity has ever been agreed (see the register, C2). The field is there; the number is his.

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

- **The IC is referenced in the pack, not copied into it.** The pack records that the IC was collected, when and by whom. It does not carry the image, because the pack is kept seven years and can be opened by every role that can view a booking, while the IC itself is kept twelve months and opened only by Admin and Front Office. Copying it in would quietly undo both of those promises. Confirmed with the client on 10 September 2026: the accountant does **not** need the image in the pack, so this stands as built.
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
| X11 | Part payments — a guest *choosing* to pay part of the **stay** now and the rest later | Not in the quoted delivery. **Read this against B16, added 10 September 2026:** a guest now pays the BND 100 security deposit to secure a booking and the stay on arrival, which is not part payment — the deposit is a separate refundable amount and the stay is still settled in full, in one go. What remains out is a guest choosing to split the stay itself, say BND 200 of a BND 400 booking. Raised 1 September 2026. **Note the distinction from B13:** the system can track an outstanding balance, because an amendment can leave one. What it does not do is let a guest opt into instalments. |

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
