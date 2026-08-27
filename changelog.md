# Changelog

All notable changes to the Palm Villa platform are recorded here — newest first. An entry is written when a slice of work completes (a feature, a milestone, a set of decisions), not per commit. Once versioned releases begin, entries follow [Keep a Changelog](https://keepachangelog.com/) conventions with a version heading per release.

Each entry answers: **what changed, and what decision or milestone drove it.** Link the relevant doc or PR rather than restating detail.

---

## 2026-08-28 — design recut to quiet-utility minimalism (design.md v1.0)

### Changed
- **The whole design direction was recut after client review of the built surfaces.** The beta direction (aqua-filled CTAs, Fraunces serif headlines, alternating gray/white/pale-aqua/dark marketing bands, 15px body, 8/12px radii, aqua focus glows) read as template rather than modern product. The new direction is **quiet-utility minimalism**, calibrated against modern product references: white ground structured by hairlines and faint gray panels; **deep lagoon teal as the action colour** (every primary button is a `brand-deep` fill with white text, the vivid `brand` aqua with ink text in dark — a first recut pass used ink fills, reviewed as reading like generic B2B SaaS and replaced with the branded solid at the same contrast register); Inter tightened to a 14px body with a new 11px uppercase `micro` labelling voice; radii down to 6px controls / 10px cards; focus as a ring in the action colour; a near-invisible `shadow-card` for card separation on the gray ground. **Fraunces stays, but only where the brand invites**: after review it was reinstated as the display face — public hero and marketing `h2`s at `display-md`+, plus each portal screen's single `h1` page title so the brand voice carries through the booking journey; everything else, field surface included, is strictly Inter. **Aqua is demoted from action colour to brand accent** — text moments (`brand-deep` eyebrows and price lines), the logo dot, and the checked-in badge; it no longer fills anything larger than a badge. [design.md](docs/design.md) is fully rewritten (v1.0) with a supersession note; the palette keys renamed `primary*` → `brand*` and the action roles (`primary`, `primary-hover`, `ring`) now resolve to ink.
- **Every built surface was swept onto the new DNA in the same slice** — public landing (band alternation replaced by hairline-separated white sections, one tinted band, two sanctioned ink moments), both stub routes, the portal (tables recut to the hairline-container + micro-header idiom, mono booking references, white-chip active nav), the walk-in booking form, field screens, the theme toggle (selected pip is now the ink chip), and the `/tokens` proof sheet. Card variants consolidated to one idiom: `content` / `raised` / `inset` / `dark` — the tinted feature cards are gone, and a new `inverted` button variant serves the dark surfaces.
- The theming architecture (fixed palette, two role mappings, `light-dark()`, explicit-choice dark) survives unchanged — only the role values moved.



### Added
- **Domain core** in `lib/domain/` — the pricing engine, booking state machine, money, stay-date and booking-line primitives, as pure functions with no database and no UI. [architecture.md §2](docs/architecture.md) names the pricing engine and state machine as the two modules where test coverage is mandatory rather than pragmatic; both are covered, 81 tests in total. Stay pricing implements [prd.md §8.2](docs/prd.md) line for line. Day-pass pricing implements the §8.1 [A] rule (per-person by band, then the cheapest applicable bundle combination) and is shaped but unused, since the day-pass flow is Phase 2.
- **Walk-in booking form** at `/portal/bookings/new` — capability **B2**. Dates are URL state so availability is server-rendered and a set of dates can be kept in a tab or shared; only the price panel is a client island, so the total updates as staff type without a round trip per keystroke. Pricing runs in both places deliberately — `priceStay` is pure, so the same function gives the instant preview and the authoritative figure — and **no submitted total is ever trusted**: the server re-prices from the inputs.
- **`lib/db/`** — the query layer boundary from [architecture.md §2](docs/architecture.md), with fixture bodies. **`lib/auth/require-permission.ts`** — the §4 gate, called at the top of the action. It permits everything in development and fails closed in production, so the auth slice fills in one function instead of hunting for unguarded mutations.
- **Version control.** `git init` had never been run, so CLAUDE.md's branch-and-PR etiquette had nothing to apply to. Adds `.gitattributes` pinning LF, since Prettier writes LF and a Windows checkout would otherwise normalise to CRLF and fail `format:check` on untouched files.
- shadcn Input and Label re-skinned to design.md — hairline not shadow (elevation level 1), 40px control height matching Button, `touch` variant for the field surface's ≥48px target — plus `NativeSelect`, a native `<select>` with a drawn chevron (the Radix popover Select was added and dropped unused; both booking selects live in plain HTML forms).

### Changed
- **The form screen recut for density and hierarchy after review** ("dead and basic" — accurate). First pass was four identical white slabs with one full-width field each. Now: one hairline-sectioned card with caption-uppercase section headers, content-sized fields, availability as caption-over-`display-xs` stat figures, a sticky receipt-style summary (`tabular-nums`, dates and unit at the top, total at `display-xs`), and an active state on the portal nav. All within the existing tokens — the neutral-plus-aqua direction is a recorded decision and unchanged. Pattern recorded as [design.md §Components "Portal forms"](docs/design.md).

### Decided
- **Open questions are modelled, not resolved.** Every [O] item from [prd.md §18](docs/prd.md) that touches pricing is a field in `lib/domain/config.ts` carrying a `TODO(client)` that names the question it answers. `grep -r "TODO(client)" lib/domain` is the list for Jason. This follows the pattern §7.2 already sanctions — a pending decision is a settings change, not a code change — and CLAUDE.md's rule that a gap in the PRD is a question for the client rather than a silent design decision. Two are load-bearing:
  - **N2** (is stated max pax a hard cap, or the threshold above which BND 7/person applies) is a `paxPolicy` flag. **Both readings are implemented and both are tested**, because §8.2 states both and resolves neither. Nine guests in an 8-cap 3-bedroom either books at BND 414 or is refused outright, depending on the answer.
  - **N6** (standard check-in time) leaves early check-in *unsellable* rather than charging hours against an undefined baseline. The form says so on screen.
- **The security deposit is never a booking line.** [prd.md §11](docs/prd.md) makes it a refundable liability, not revenue; folding it into the total would misstate both the price and the deposit ledger. It is returned alongside and rendered as "plus BND 100".
- **Day-pass bundle ties break towards fewer receipt rows.** 4 adults + 4 children costs BND 50 both as two 2+2 bundles and as a 2+1 plus a 2+2 plus a loose child. The guest pays the same, so the tie-break is chosen for legibility rather than left to depend on config ordering.
- **Native `<input type="date">`, no date-picker library.** design.md specifies no calendar component, so building one would be unsanctioned styling. Recorded as a gap in [design.md §Components](docs/design.md): it is adequate for a clerk entering two known dates, and **not** adequate for the public availability calendar (A1), which needs specifying before it is built.
- **Zod and Vitest added to the approved stack**, with reasoning, in [architecture.md §1](docs/architecture.md).

### Open
- **G1 is not delivered by this slice, and nothing currently enforces it.** "Double booking is structurally impossible" is a written commitment (scope-of-capabilities.md) that lives entirely in the GiST exclusion constraint of [architecture.md §5.2](docs/architecture.md). The fixture layer refuses overlapping ranges so the form behaves correctly on screen, but that is application logic — it loses a genuine race, which is precisely when the guarantee matters. Both `lib/db/fixtures.ts` and `lib/domain/availability.ts` say so prominently. The half-open `[start, end)` semantics used here match the constraint exactly, so checkout day and next check-in day are legal on the same unit — verified in the browser.
- **`lib/db/` is fixture-backed and resets on restart.** The schema slice replaces it. That slice needs a Postgres, which means the personal Supabase dev project — [architecture.md §1.1](docs/architecture.md) puts this platform on personal accounts, so it is not the client's to create.
- Unit reference formats (`3B-01`) and the 2-bedroom unit count (**N1**) are invented for the fixture and must not survive into the seed script.

## 2026-08-27

### Changed
- **Public landing warmed up within the existing palette.** The page had been using aqua only on primary CTAs; it now spends the range design.md already sanctions for the public surface: the hero eyebrow renders in the accent role, the swimming-pool facility card is the grid's single `card-feature-aqua` moment (a `featured` flag in the content module marks it — at most one per grid), the day-pass price line reads in deep aqua, and the "How booking works" steps carry pale-tint numbered circles in place of muted icons. No new colours; the neutral+aqua palette and CTA scarcity rules are unchanged. Deliberately understated because real pool photography, when it lands, will carry most of the page's colour.

- **Light is now the default theme and the OS preference is no longer followed.** `:root` declares `color-scheme: light`, so a visitor with no stored choice always gets the light surface regardless of their device setting — the brand is the light page, and Instagram traffic on phones in dark mode should see the same page as everyone else. The theme control drops to two explicit states (light, dark); the "system" option went with the behaviour it named, and `ThemePreference` narrows to `'light' | 'dark'`. The control's geometry was corrected with it: the shell moves to 12px and the selected pip to 9px, so the two are exactly concentric (12px shell less its 1px border and 2px padding). 9px is off the named radius scale deliberately — both neighbours were tested against the rendered control and rejected by eye, 8px reading sharp because the gap splays around the corner and 12px reading soft, so the pip is expressed as a calc over `--radius-lg` and `--spacing-xxs` rather than hardcoded, and tracks the shell if either changes. Recorded in [design.md §Dark theme](docs/design.md).
- **The public header is sticky.** Day pass and stays are the funnel, and on a phone they otherwise scroll away inside the first band. CSS-only (`sticky top-0`) on an already-opaque surface, so no JavaScript and nothing shows through; `html` carries a `scroll-padding-top` sized from spacing tokens so in-page anchors land clear of the 63px bar.

- **One pale-aqua band per page** breaks the gray/white alternation: "How booking works" now sits on a `primary-pale` ground (`content-band-aqua`, recorded in [design.md §Components](docs/design.md)), turning the page's back half into white → aqua → white → ink. The band carries no primary CTA (aqua never sits on aqua). Its step markers take the polarity flip — ink discs with light numerals — which is the only treatment that reads at chip scale against the tint; dark keeps its raised ink-deep disc with an aqua numeral, since a near-white disc there would glare. All text pairings on the tint verified AA.

- **Stay cards slimmed to a teaser; open items moved to the stay detail.** Each unit card was carrying two or three dashed "to confirm" markers — nine across the grid, and an inconsistent count because only the 2-bedroom had "Unit count". All three were policy questions rather than per-unit unknowns (max pax and bed configurations are confirmed in [prd.md §7.1](docs/prd.md); the open items are §18 N2, N9 and N1), so they now sit once in `pendingStayDetails` on `/stay`, phrased as the questions the PRD actually asks. The cards keep photo, name, one line and the rate, with rates pushed to the card foot so they align across the row. Cards are now links to `/stay`, which makes the existing hover lift honest; they become per-unit routes on the existing `slug` in Phase 2. The `grep PendingDetail` launch audit is unaffected — the markers moved, none were deleted.

### Fixed
- **`dark:` variant no longer disagrees with the tokens.** It still matched `prefers-color-scheme: dark` after light became the default, so a visitor on an OS-dark device with no stored choice would have got the light page with dark-mode utilities applied. It now matches `[data-theme="dark"]` only, exactly as the tokens resolve. Latent until this release (nothing used `dark:` on the public site) and caught while writing the first such utility; the rule is recorded in [design.md §Dark theme](docs/design.md) because toggling the theme control cannot reproduce it.

### Decided
- **Fraunces 600 as the public display face** — a narrow, recorded amendment to design.md's one-family rule. Public-site display headlines only (hero `h1`, marketing `h2`s at `display-md`+), one weight, loaded via `next/font` alongside Inter as `--font-display`; portal and field surfaces stay Inter-only. Rationale and scope in [design.md §Typography](docs/design.md).

### Added
- **Public landing page** at `/`, replacing the walking-skeleton home page. Seven bands alternating gray ground and white cards: hero, day pass + facilities, short stays, long-term enquiry, how booking works, an Instagram strip, and a closing CTA. Sections live in `app/(public)/_components/`, with all copy and rates in one typed module, `app/(public)/_content/landing.ts`.
- **Stub routes `/day-pass` and `/stay`** — rates and an "online booking opens soon, message us" path, so landing CTAs have real destinations. The Phase 2 booking flows replace these pages at the same URLs.
- **`MediaPlaceholder`** — a labelled, aspect-ratio image slot standing in for photography we do not have. The wrapper is the layout contract: adding `src`/`alt` later renders `next/image` inside the same box, with no consumer changes and no layout shift.
- Public header now carries visitor links (day pass, stays, long term); the footer gains a links column and a quiet staff row to `/portal`, `/field` and `/tokens`.
- **Instagram and TikTok marks drawn inline** (`_components/social-icons.tsx`). lucide v1 removed its brand icons, so rather than add an icon dependency the two marks follow lucide's own geometry — 24px box, 2px round strokes, no fill — and inherit size and colour from the button holding them.

### Decided
- **No scroll-reveal animation.** Two implementations were built and both were removed: an IntersectionObserver version and a CSS `animation-timeline: view()` version. Each left sections blank whenever the page is rendered without real scrolling (screenshot and preview tooling reproduced it, and in-app webviews and print are the same class of risk). design.md defines no motion vocabulary, so the payoff was an unsanctioned fade against a failure mode of invisible content. Motion is now limited to hover and focus transitions — a `card-interactive` utility in `globals.css` carrying colour plus a 1px lift, disabled under `prefers-reduced-motion`. The landing page ships with **zero client-side JavaScript**.
- **No AI-generated property imagery.** Every image slot is an obvious labelled placeholder naming the asset that belongs there, so nothing on the page can be mistaken for a photograph of the building.
- **Copy is restricted to [C]-confirmed facts**, with prices shown as "from" figures only. The page deliberately avoids: occupancy or "sleeps N" claims (max pax contradicts the extra-person charge, PRD §18 N2), bed-configuration promises (N9), printed day-pass age bands (N3–N4), and gym/snooker/sauna (pending Ladyboss, §7.2). The BBQ area is stated as excluded, which is confirmed.
- **Open items are shown, not hidden.** Facts a guest expects but that remain open [O] — guest counts, bed setups, check-in times, cancellation policy, day-pass age bands — render as a visible dashed "to confirm" marker (`PendingDetail`) instead of being silently omitted, so reviewing the page surfaces the questions. Each marker maps to a PRD §18 item and must be gone before launch; `grep PendingDetail` lists them.

### Resolved
- **Public contact details confirmed by the client** (2026-08-27) and recorded in [prd.md §2](docs/prd.md): Instagram and TikTok `@palmvilla.bn`, phones +673 8959798 / 8837118 / 8986733, and the Google Maps location (4.570085, 114.220738), now wired through `contact` in the content module into the footer, the social strip and every WhatsApp CTA. **Still open:** which of the three numbers carries WhatsApp — the first is linked for now.

### Open
- **Landing page has no capability ref.** The scope baseline A1–A10 is entirely transactional; a marketing page is not listed, and [scope-of-capabilities.md](docs/scope-of-capabilities.md) says what is not listed is not included. A provisional **A11** is recorded there, marked pending client agreement — it needs Jason's sign-off to become part of the quoted delivery.
- Real photography, contact details and the Instagram account are needed before this page can go live.

## 2026-08-25

### Added
- **Walking skeleton.** Next.js 16 App Router app with the three route groups from [architecture.md §2](docs/architecture.md) — `(public)`, `(portal)`, `(field)` — each rendering a placeholder screen. No schema, no auth, no booking/pricing/payment logic.
- `app/globals.css` — the [design.md](docs/design.md) frontmatter transcribed once as the Tailwind v4 theme (colour roles, type scale, radii, 4px spacing), plus a shadcn/ui semantic layer mapped onto those tokens so unmodified shadcn components render in brand.
- `/tokens` — a token proof sheet rendering the colour roles, type scale, radii, spacing and themed components for visual review. Nothing on it is styled with a literal hex or pixel value, so a broken token shows immediately.
- `components/ui/` — Button, Badge and Card re-skinned to design.md (aqua pill primary at 24px radius, semantic status badges, surface-contrast card variants).
- `lib/supabase/` — server client (all data access) and browser client (auth sessions only, per the architecture invariant), reading env vars through a validated `lib/env.ts`; `.env.example` documents them.
- `README.md` — setup, scripts and layout.
- Toolchain: `typecheck`, `lint`, `format` scripts, all passing on a clean checkout.
- **Dark theme**, at the client's request. design.md had no dark palette, so one was derived entirely from existing tokens — no new hexes — and recorded in [design.md §Dark theme](docs/design.md) plus a `themes` frontmatter block. Ships with a light/dark/system control.

### Changed
- **Design direction recut: neutral, minimal, soft.** On review, the alpha direction read too warm, too loud and too rounded — the warm-sand canvas looked brown, Manrope 800 at hero scale shouted, and 24px pill geometry felt bubbly rather than friendly. The recut keeps the token architecture and the aqua accent and replaces everything else: a cool near-white ground (`#f4f5f6`) with white cards, a strictly neutral ink/gray text ramp, aqua spent only on the primary CTA, one type family (Inter, 400/500/600, nothing above 52px — Manrope dropped entirely), and soft geometry (8px controls, 12px cards, 16px overlays; pills survive only on status badges). Status chips moved from bright fills to tint-background + deep-same-hue text. `accent-sun` was dropped — the direction needs no second decorative colour. [design.md](docs/design.md) is rewritten as the sole current direction and records the superseded alpha; `app/globals.css`, the three `components/ui/` primitives and all four screens follow it.
- **Application code now consumes theme roles, not raw palette tokens.** `bg-canvas` → `bg-card`, `text-ink` → `text-foreground`, `text-body` → `text-copy`, and so on. Raw utilities survive only in the token sheet's swatch grids, where fixed values are the point. This is what makes one class serve both themes.

### Decided
- **ESLint pinned to the 9.x line.** ESLint 10 is incompatible with the `eslint-plugin-react` version bundled by `eslint-config-next@16` (crashes on the changed rule-context API). Revisit when Next ships an ESLint 10-compatible config.
- **TypeScript pinned to 5.9.** TypeScript 7 is out of the peer range `typescript-eslint` supports (`>=4.8.4 <6.1.0`).
- **Dark theme mechanism: `color-scheme` + CSS `light-dark()`, no dependency.** Each role is declared once and the browser picks the branch, so the OS preference works with JavaScript disabled; an explicit choice flips `data-theme` on `<html>`, which switches every role at once. Chosen over `next-themes` because CLAUDE.md requires asking before adding a dependency, and this needs none.
- **Polarity-flip surfaces flip with the theme** rather than staying literally ink: `card-feature-dark` is defined by being the opposite of the current ground, so its intent is what carries over. The footer is the deliberate exception — a full-width sand slab glares on a dark page, so dark uses a raised ink.

### Resolved
- **Light-theme caption contrast now clears AA.** The alpha's `mute` (#84908d) on the sand canvas measured 2.80:1, failing even the large-text floor. The neutral recut chose the new `mute` (#626b71) on the new ground (#f4f5f6) to pass: **4.98:1**, verified against the rendered `/tokens` page. Every text pairing in both themes now clears 4.5:1 — the next tightest is the light checked-in badge at 5.59:1. The open question is closed.

### Open
- `CLAUDE.md` — project guide for AI-assisted sessions: documentation map (which doc is normative for what), architecture invariants, design/UX summary, repo etiquette (branch naming, descriptive PRs), and documentation practices.
- `CHANGELOG.md` — this file, to track project evolution per session/release.

## 2026-08-20

### Added
- `docs/scope-of-capabilities.md` — client-facing scope baseline with referenced capabilities (A1–G7) and explicit exclusions (X1–X10). Established as the agreed boundary of the quoted delivery.

### Decided
- Payment slip upload becomes part of the booking form itself (customer pays as part of booking), so transfer bookings enter the verification queue immediately rather than depending on a separate upload step.
- Build order confirmed: operations portal (Phase 1) before the public site (Phase 2) — the spreadsheet is the acute pain, and the portal delivers value before payment flows are exposed publicly.

## 2026-08-18

### Added
- `docs/prd.md` v0.1 — product requirements: business rules, pricing engine, booking flows and states, roles/permissions, phasing (Phase 1 portal, Phase 2 public, Phase 3 thin tenancy), open questions with [C]/[A]/[O] confidence tags.
- `docs/architecture.md` v0.1 — normative engineering decisions: Next.js single app with route groups, Supabase (Singapore), DB-level double-booking constraint, server-side-only data access, audit-event model, document retention.
- `docs/design.md` (alpha) — Palm Villa design system: lagoon-aqua accent on warm-sand/white surfaces, Manrope 800 + Inter, token set and component specs serving all three surfaces.

### Decided
- No blocking questions remain (PRD §18); scope is sufficient to quote and begin Phase 1.
- v1 covers Phases 1 and 2; walk-ins only for staff bookings (no booked-ahead pay-on-arrival); no card gateway, no legacy document migration.
