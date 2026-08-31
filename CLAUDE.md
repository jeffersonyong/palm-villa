# Palm Villa Booking & Operations Platform

A single web application for Palm Villa (Brunei) — an apartment building with three revenue streams: facility day passes, short stays, and long-term tenancies. It replaces WhatsApp + Excel with one system of record: a public booking site, a staff operations portal, and mobile field screens for security and housekeeping, all one codebase over one database.

**Goal in one line:** customers can check availability, book and pay without messaging anyone; staff can verify payments, track deposits, and answer "who is arriving today" from one screen.

## Documentation map (read before building anything)

The `docs/` folder is the source of truth. Each doc is **normative for its domain** — do not re-derive or contradict decisions recorded there:

| Doc | Owns | Notes |
|---|---|---|
| [docs/prd.md](docs/prd.md) | Business rules, pricing, booking flows, roles, phasing | Requirements are tagged **[C]** confirmed / **[A]** assumed / **[O]** open. Never silently resolve an [O] item — flag it or check the register first. |
| [docs/open-questions.md](docs/open-questions.md) | Everything unanswered, and what each one is holding up | The single register. An answer is written into whichever doc owns the decision **and** moved to the register's Answered section — never left only in one place. |
| [docs/architecture.md](docs/architecture.md) | Stack, app structure, data model, security, infra | **Supersedes the PRD's technical sketches where they differ.** |
| [docs/design.md](docs/design.md) | Design tokens, typography, components, do's/don'ts | Frontmatter is the machine-readable token set. |
| [docs/scope-of-capabilities.md](docs/scope-of-capabilities.md) | Client-facing scope baseline (A1–G7 capability refs) | Defines what is in and out of v1. If it's not listed there, it's not in the quoted delivery. |

**Rules of authority:**

- architecture.md is normative for engineering; design.md is normative for tokens and is never overridden by ad-hoc styling; prd.md is normative for business rules; scope-of-capabilities.md defines what is in and out of v1.
- **Conflicts are surfaced, not resolved.** If a doc is ambiguous or two docs disagree, stop and ask — don't pick a side and build on it.
- **Never invent database schema, pricing rules, or capacity logic that isn't stated in prd.md.** A gap in the PRD is a question for the client, not a design decision to make silently.
- **No new dependencies without asking.** The stack in architecture.md §1 is the approved set.

## Architecture (summary — details in architecture.md)

- **Stack:** Next.js App Router (single app, route groups `(public)` / `(portal)` / `(field)`), Vercel, Supabase (`ap-southeast-1`), Tailwind + shadcn/ui themed from design.md tokens, Resend, `qrcode`, `pdf-lib`.
- **Non-negotiable invariants:**
  - Double-booking is prevented **in the database** (GiST exclusion constraint on occupancy ranges), never by application logic alone.
  - All DB access is server-side; the browser never holds a data-access Supabase client. Every mutation is a server action gated by `requirePermission(...)`.
  - Pricing engine and booking state machine are **pure functions** in `lib/domain` — the two modules where tests are mandatory, not optional.
  - Money is integer cents (BND). Timestamps `timestamptz` UTC; stay dates are `date` in `Asia/Brunei`. Every table carries `property_id` and every query scopes by it.
  - Approvals and sensitive actions are append-only **audit events**, not status flags. Identity documents: private buckets, signed URLs, permission-gated, every access logged, retention-expired.
- **Ownership boundary:** this is personal IP on personal accounts. No employer (Go10) infrastructure, accounts, or code — ever, including for convenience.

## Design & UX guidelines (summary — details in design.md)

- **Quiet-utility minimalism:** structure drawn with **four neutral surface rungs** — app background → panel → container → card, each a step in tone away from what it sits on and every seam a single 1px hairline. Never coloured bands, and depth is never a shadow. **Two accents, one system**: on the *customer surface* (public site + booking flow) deep lagoon teal is the action colour (`brand-deep` fill with white text; vivid `brand` aqua with ink text in dark), one per screen region, and ink never fills a button there; the *operations surfaces* (portal **and** field screens) are deliberately **monochrome** — ink actions in light, white in dark, no teal anywhere. Beyond the primary fill, the lagoon hue is *text-first* on the public site — eyebrows, key price lines, the logo dot — never a band or card fill, and never a success indicator; status uses the semantic tint/deep pairs on every surface, and they are never decorative.
- **Surface system:** `canvas-sunk` is the app background (never an object); `canvas` the content panel; `canvas-soft` the container — table header strips, pagination footers, inset panels, tab tracks, hover/selected chips; `canvas` again the card. An object is whichever tone is a step away from what it sits on, so a gray panel is right *inside* a card and wrong standing on the ops ground. The **operations shell is two columns and one surface**: the nav column sits directly on the background with no fill, border, radius or shadow, and the content panel is a bottom-anchored sheet that bleeds past the viewport and owns the scroll — there is no top bar. Shadows: `shadow-overlay` for things that genuinely float, and `shadow-lift` (one `0 1px 2px` at 4%) for the "where am I" chip alone. Nothing else casts one.
- **Type:** Geist — 400/500/600, with **700 reaching only the two display headline sizes**; 14px body, Geist Mono for references and codes, nothing above 44px, portal capped at `display-sm`. Text is a **two-step ladder** — ink for content, mute for what labels it, and deliberately nothing between. Fraunces is the one exception, and it belongs to the **customer surface alone**: public-site display headlines (`display-md`+, inheriting the token's weight — 700 at `display-lg`/`display-xl`, 600 at `display-md`) — never the portal, never the field surface, never body or UI text. Brand face and brand hue travel together, so the monochrome operations surfaces refuse both. The 11px uppercase `micro` label is the voice for table headers, form sections, stats and eyebrows. Data numbers always `tabular-nums`.
- **Geometry:** radii **nest** rather than repeat — 6px controls, status badges and the nav's active chip; 12px cards and menu panels; 16px dialogs, popovers and the content panel's top corners. **Nothing is a pill:** round (`full`) is for avatars and status dots only, and a badge is a 6px rectangle. Controls are 36px, tightened to 32px on the operations register and ≥ 48px on field screens.
- **Three surfaces, one token set:** public site gets more air plus two sanctioned dark (ink) moments; portal and field screens are the dense subset.
- **Field-screen UX:** single column, mobile-first, ≥48px touch targets, today's list loads first, primary action full-width at the bottom of each row card. Must stay usable on mid-range phones and poor signal.
- **Users are non-technical staff on a live operation.** Every screen must save time over the spreadsheet on day one, or it gets abandoned. Prefer fewer, clearer actions over configurability.

## Repo etiquette

- **Branches:** `<type>/<short-kebab-description>` — e.g. `feat/payment-verification-queue`, `fix/hold-expiry-race`, `docs/update-architecture`. Types: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`. Never commit directly to `main`.
- **Commits:** conventional format `<type>: <description>`, body explaining *why* when it isn't obvious. Small, coherent commits over one big drop.
- **PRs must be descriptive:** every PR gets a real summary — what changed and why, which PRD/scope items it implements (cite refs like `B4`, `G1`, PRD §10.4), any [A]/[O] assumptions it leans on, and a test plan. Review the full diff against the base branch (`git diff main...HEAD`), not just the last commit. No PR opens with failing checks or unresolved conflicts.
- **Migrations:** SQL files in `supabase/migrations/`, committed and applied via CLI. No dashboard-only schema changes.
- **Secrets:** never in the repo. Vercel/Supabase env config only.

## Documentation practices

Docs are living documents and must evolve with the project:

- **[changelog.md](changelog.md) is updated only when a slice of work is complete — not per commit.** A dated entry (newest first) with what was added/changed/decided and why. Link the doc or PR; don't restate detail. This is the running narrative of how the project evolved, not a commit log.
- **Update `docs/` after every major milestone or significant addition** — a phase completing, a schema-shaping decision, a scope change, or an [O]/[A] item being resolved with the client. The change belongs in the same PR as the work, in whichever doc is normative for it.
- When the client answers an open question, move it to the Answered section of [open-questions.md](docs/open-questions.md), update its [O]/[A] tag to [C] where it arises in the PRD, and propagate the decision to the relevant section — don't leave the answer only in a chat thread, or only in the register.
- If implementation is forced to diverge from architecture.md, update architecture.md in the same PR with the reasoning — the doc stays normative only if it stays true.
- Scope changes agreed with the client get a capability ref added to (or struck from) scope-of-capabilities.md, so the scope baseline stays honest.
- Keep docs concise: record decisions and rationale, not narration. Prefer editing the existing section over appending changelogs.
