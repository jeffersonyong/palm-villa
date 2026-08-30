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

These two are not hypothetical. The screens exist, work, and are deliberately incomplete in one specific way until Jason answers.

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

| # | Ask | What it decides | Assumed meanwhile |
|---|---|---|---|
| **N1** | "How many 2-bedroom units are there? Is 48 units still the right total?" | The 2-bedroom type exists and prices correctly but has **zero units** in the system, so none can be booked. | 48 units seeded, no 2-bedrooms. Answering it is a one-line database insert. |
| **N8** | "How many sofa beds are there in total across the building?" | Whether the system can stop overbooking sofa beds. | Modelled as property-wide stock with no limit set. |
| **N9** | "Can guests ask for a particular bed setup, or does staff just assign it?" | Units of the same type aren't actually interchangeable — the bed configuration differs. | Staff assign; no guest choice offered. |
| **N10** | "How are the units labelled on the actual doors?" | Staff will not recognise the references on screen. | Provisional scheme (`3B-01`, `3B-02`…) purely so units are distinguishable. |

### Rules and permissions

| # | Ask | What it decides | Assumed meanwhile |
|---|---|---|---|
| **N11** | "Who is allowed to check a guest in? And should confirming an odd payment amount need someone more senior?" | There is no permission for check-in at all, so Security cannot be granted it. Separately: confirming a short payment and hand-matching a transfer both reuse "verify payments". | Security holds view-only. All three payment actions treated as one job. **Note the consequence:** Finance can override a payment amount but cannot record cash. |
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
