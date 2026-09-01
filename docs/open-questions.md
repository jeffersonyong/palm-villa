# Open questions

| | |
|---|---|
| **Status** | Normative for what is unanswered. This is the single register; PRD §18 points here. |
| **Owner** | Jeff |
| **For** | The running list of things only the client can answer, in the order they matter |

**How to use this.** Take it into any conversation with Jason and work down from the top. Each entry says what to ask, what it is holding up, and what has been assumed in the meantime so nothing was blocked waiting. When one is answered, fill in the answer and the date, move it to **Answered** at the bottom, and propagate the decision into whichever document is normative for it — the PRD for a business rule, architecture.md for a technical one. **Do not leave an answer only here.**

**Tags** carry the same meaning as the PRD: **[C]** confirmed by the client · **[A]** assumed by Jeff, safe to build against but unconfirmed · **[O]** open.

---

## 1. Answer these first — a finished screen is waiting

Not hypothetical. Each screen below exists and works, and is deliberately incomplete in one specific way until Jason answers — except N16, which is a feature the desk has asked for and which cannot be built at all until he settles a rule he has already given.

### N5 — Which payment is forfeited when someone cancels or doesn't show up?

**Ask:** "If a guest cancels, or just doesn't turn up, what do we keep — the money they paid for the stay, or the BND 100 security deposit?"

**Why it's ambiguous:** the PRD says "the deposit is forfeited", but there are two things that could mean. The BND 100 security deposit is collected *on arrival*, so a no-show never paid it in the first place. It most likely means the booking payment, but that is a guess about someone's money.

**What's blocked:** the cancel screen is built and working. It releases the unit, records who cancelled and why — and moves no money at all. It says so on screen: *"No refund or forfeiture is calculated here. Any money already taken is settled outside the system."*

**Assumed meanwhile:** nothing. Deliberately. The platform cannot state a forfeiture policy it has not been given, so it states none. The two amounts are named separately throughout the product and the database precisely so this answer can go either way without rework.

**Answer:** _unanswered_

---

### N7 — How long do we hold a unit for someone who says they'll transfer?

**Ask:** "Someone books and says they're transferring the money. How long do we hold that unit before we give it back? An hour? Until end of day?"

**What's blocked:** the payment verification queue is built and working. But **nothing releases an abandoned booking.** If a guest says they'll transfer and never does, that unit stays blocked until a staff member notices and cancels it by hand.

**Assumed meanwhile:** nothing expires. The queue lists oldest-first and shows how long each has been waiting, so it is visible rather than silent — but it relies on a person looking. The PRD suggests 60 minutes for stays and 30 for day passes as a starting point; nobody has agreed it.

**Worth raising alongside:** this also decides what the public booking site's checkout countdown says, so it will block Phase 2 as well.

**Answer:** _unanswered_

---

### N16 — Can a guest pay part of a booking now and the rest later?

**Ask:** "If someone wants to pay half now and half on arrival, do we let them — and is the unit theirs while the balance is outstanding?"

**Why this needs Jason and not a build decision:** it contradicts a **[C]** he has already given. PRD §9.1 says *"Full payment is required to secure a unit. Unpaid bookings do not hold inventory"*, and §9.4 excludes booked-ahead, pay-on-arrival from v1 in as many words. A booking confirmed with a balance owing is a softer version of exactly that. It is also the same conversation as the adoption risk §9.4 already flags — if staff are informally holding units for regulars today, part payment is how that habit comes back.

**What's blocked:** part payments are **not built**, and nothing in the system can express one. The payment slice opens by recording that it "is NOT a ledger" — it computes no balance, and two payments against one booking are two recorded facts rather than an arithmetic. Concretely, four things would have to change:

- The **mismatch rule** would have to match against the outstanding balance rather than the booking total. Today a payment for less than the total can only be confirmed with a written override reason (capability B5) — a deliberate 50% deposit would trip that flag every time, and a flag that fires on the ordinary case stops meaning anything.
- **`expected_amount_cents`** currently means "what the whole booking is worth", refreshed under lock at verification. It would have to mean "what was outstanding when this payment was raised".
- The **state machine** has no partial state: `verify_payment` and `pay_in_full` both reach `confirmed`, so the first BND 100 of a BND 400 booking would confirm it outright.
- Somewhere has to answer **"what is still owed"**, derived from the verified payments rather than stored, or the two figures drift.

**Assumed meanwhile:** nothing. A booking is paid in full or it is not, and the desk records a second payment against a booking as a second fact with no balance attached to it.

**The shape agreed with Jeff if Jason says yes** (2026-09-01): status stays about the *stay* — the booking is confirmed and the money owed is a derived balance shown beside it — rather than adding a `partially_paid` state to the machine. Recorded here so the answer lands on a decision already taken rather than reopening it.

**Jeff's position (2026-09-01): out of v1 unless Jason asks for it.** Not a "not yet decided" — a decision to leave the stated policy standing. The question stays open because it is Jason's to reverse, but nothing is waiting on it and no screen is incomplete without it. If he does ask, it is a slice of its own, not an addition to one.

**Answer:** _unanswered — deferred out of v1 by Jeff, pending Jason_

---

### N17 — Is there a ceiling on a staff discount, or a sign-off above some figure?

**Ask:** "Front Office can now take money off a booking at the desk. Is there a limit — and should anything above, say, twenty percent need you or the Ladyboss to approve it?"

**What it decides:** whether the discount control needs a cap, and whether a large discount needs a second person the way a deposit release does (PRD §11 [C]).

**Assumed meanwhile:** no cap and no approval step. A discount of up to the full value of the booking is allowed — comping a stay outright is a real thing a manager does — and it is *recorded* rather than gated: every discount carries a typed reason and its own audit event (`booking.discounted`), so "who discounted what, and why" is answerable today even though nothing is prevented. Adding a threshold later is a rule in one pure module plus a permission, not a rework. See [prd.md §8.4](prd.md).

**Answer:** _unanswered_

---

### N18 — Is a housekeeping note on a booking actually useful, and what about notes on a unit?

**Ask:** "When the cleaner opens a unit on their phone, is there anything the office would want to tell them about *that guest*? And separately — where should 'the shower door sticks' live, given it's true long after the guest has gone?"

**Why it is here rather than built:** flagged by Jeff as not thought through, and it is the right instinct — the housekeeping field screen does not exist yet (C-series, and the current `/field` route is a placeholder with no data layer), so nothing can show a housekeeping note today.

**What's been built anyway, and why it is cheap:** notes carry an `internal` / `housekeeping` audience tag from the outset. Both appear in one thread on the booking screen, each labelled, and the housekeeping filter the field screen will need already exists and is tested. If the answer turns out to be "the cleaner needs nothing", the cost of having asked is one tag nobody selects.

**What was deliberately not built, and now is:** a note against the *unit*. The reasoning here was that it outlives every booking, so hanging it off one would lose it when the guest leaves — correct, and what it was missing was a screen to put it on. The units board is that screen, so **the second half of this question is answered**: `unit.notes` is a single editable block on the unit's own page, and the shower door lives there.

It is a block rather than a thread on purpose. A booking's notes accumulate — each entry stays true about the moment it was written — but "the shower door sticks" stops being true when somebody fixes it, and a thread would make the current state of a unit something a reader reconstructs from the bottom of a list. Nothing is lost: every edit writes an audit event with the text before and after, so the unit's history *is* the thread, and the card at the top always says what is true now.

**The first half is still open.** Whether the office has anything to tell a cleaner about *this guest* is a question about a screen that does not exist — the housekeeping field surface is C-series — and the `housekeeping` audience tag on booking notes is still the cheap bet it always was.

**Answer:** _partly_. Unit notes: built, 2 September 2026 (capability B14). Housekeeping notes on a booking: still unanswered.

---

## 2. Needed before a particular screen is built

Not blocking today, but each one is a screen that cannot be finished without it.

### Pricing and capacity

| # | Ask | What it decides | Assumed meanwhile |
|---|---|---|---|
| **N2** | "Is 8 pax a hard limit, or the point where the BND 7 per person charge kicks in?" | Whether the booking form refuses a 9th guest or charges for them. The PRD says both. | Treated as a hard cap. |
| **N3** | "Day pass ages — under 1, 1 to 12, 12 and above. What about a child who's exactly 12? And do babies pay?" | The day pass age bands overlap at 12, so a 12-year-old currently matches two prices. | Under 1 is free; 12 counts as an adult. |
| **N4** | "Family bundles are priced for 2 adults + 1 child and 2 adults + 2 children. What about 1 adult + 2 children, or 2 + 3?" | Any other family shape has no stated price. | The system always charges the cheapest applicable combination, so an unlisted shape falls back to per-person pricing. |
| **N6** | "What time is standard check-in?" | "Early check-in" cannot be defined, so the early check-in charge cannot be applied. | The pricing engine refuses to price early check-in at all rather than guess. |
| **N15** | "The under-3 free rule — does it apply to the semi-detached units too, or only the apartments?" | Whether a toddler is chargeable in a semi-detached. | Assumed it applies everywhere. **[A]** |

### The building itself

Two of these — **N1** and **N10** — changed character on 2 September 2026 without being answered. They used to block: the number of 2-bedroom units and the names on the doors were both baked into a seed file, so getting them wrong meant a migration. The unit registry screen (capability **F6**) makes both a setting an administrator changes, which is the same move §7.2 already made for facility inclusion. They stay open because the client has still not said what the answers are; what has gone is the cost of finding out.


| # | Ask | What it decides | Assumed meanwhile |
|---|---|---|---|
| **N1** | "How many 2-bedroom units are there? Is 48 units still the right total?" | The 2-bedroom type exists and prices correctly but has **zero units** in the system, so none can be booked. | 48 units seeded, no 2-bedrooms. **No longer blocks a screen** — an administrator sets the count on the unit registry screen, so answering it is typing rather than a migration. Still unanswered: a number nobody has agreed is not a fact, and the system ships zero 2-bedrooms until somebody says otherwise. |
| **N8** | "How many sofa beds are there in total across the building?" | Whether the system can stop overbooking sofa beds. | Modelled as property-wide stock with no limit set. |
| **N9** | "Can guests ask for a particular bed setup, or does staff just assign it?" | Units of the same type aren't actually interchangeable — the bed configuration differs. | Staff assign; no guest choice offered. |
| **N10** | "How are the units labelled on the actual doors?" | Staff will not recognise the references on screen. | Provisional scheme (`3B-01`, `3B-02`…) purely so units are distinguishable. **No longer blocks a screen** — the unit registry screen sets a naming pattern per type with a live preview, and any individual unit can be named off-pattern, so a building that is not uniform is expressible. Still unanswered: the provisional scheme stays until somebody types the real one. |

### Rules and permissions

| # | Ask | What it decides | Assumed meanwhile |
|---|---|---|---|
| **N11** | "Who is allowed to check a guest in? And should confirming an odd payment amount need someone more senior?" | There is no permission for check-in at all, so Security cannot be granted it. Separately: confirming a short payment and hand-matching a transfer both reuse "verify payments". | Security holds view-only. All three payment actions treated as one job. **Note the consequence:** Finance can override a payment amount but cannot record cash. **Also:** `payment.record_cash` now gates recording a *bank transfer* against a booking too (PRD §10.7), so its name is narrower than its job — whoever may say money arrived is the same person either way. Splitting or renaming it is part of this answer. |
| **N12** | "Can we change a booking after the guest has already checked in — and if so, what do we charge for the nights they've already had?" | Amending a checked-in booking is currently blocked outright. | Blocked. The pricing engine refuses a check-in date in the past, so a mid-stay re-price isn't possible without a deliberate decision. |
| **N14** | "Which of the three phone numbers is the WhatsApp one for booking enquiries?" | The public site links one of them. | Linking the first number listed. |

---

## 3. Decide whenever — configurable later

Nothing is blocked on these. They are settings, not structure.

| # | Ask |
|---|---|
| **C1** | Are the gym, snooker table and sauna included in the day pass? (Ladyboss decision) |
| **C2** | Facility capacities, and what hours day passes run |
| **C3** | Does the guardhouse have reliable signal or wifi? If not, the arrivals list must work from cache |
| **C4** | Do the security and housekeeping phone screens need Malay? |
| **C5** | Should events and parties become a bookable product later? |
| **C6** | Is there an existing merchant account, or a BIBD QuickPay registration? (Decides how soon card payment is possible) |

---

## 4. Get these in writing — risk, not scope

These protect Jeff and the client. They are not build decisions.

| # | Item |
|---|---|
| **R1** | The client's position on short-term letting within the building — is it permitted under the building's own rules? |
| **R2** | Insurance, lifeguard and supervision arrangements for admitting paying non-residents to a water park and an indoor children's playground |
| **R3** | Total parking bays, given per-unit car allowances plus day pass visitor vehicles |

---

## Answered

| # | Question | Decision | When |
|---|---|---|---|
| **B1** | Support booked-ahead, pay-on-arrival bookings that hold a unit without payment? | **No, excluded from v1.** Walk-ins pay on the spot; advance bookings require payment. Additive later if needed. | Pre-build |
| **B2** | How many actual people, holding how many roles? | **Non-blocking.** Ship the predefined roles and let one person hold several. | Pre-build |
| **B3** | Does the Ladyboss approve scope, or is Jason the decision maker? | **Non-blocking.** Either is acceptable. | Pre-build |
| **N13** | Is there an outcome for a transfer that never arrives, other than cancelling the booking? | **[A] No separate outcome for now** — judged unlikely enough not to design for. Staff either cancel the booking or record cash if the guest pays another way. **Not confirmed with the client**; revisit if it proves common. See the note below. | 2026-08-31, Jeff |

### Note on N13, worth knowing

Staff *can* confirm a payment that never arrived — and if they enter the exact amount expected, the system asks for nothing. No reason, no flag. The reason-required rule only fires when the amount **disagrees** with what is owed; it is a mismatch detector, not a proof that money arrived, and it cannot be the latter because the system has no connection to the bank. The bank app is the source of truth and a person is asserting what they saw in it.

So if abandoned transfers turn out to be common, the gap that exposes is not a missing `rejected` status — it is that confirming a payment that never landed is currently indistinguishable from confirming a real one, apart from whose name is against it.
