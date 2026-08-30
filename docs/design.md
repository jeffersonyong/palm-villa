---
version: 1.0
name: Palm-Villa-design-system
description: Design language for the Palm Villa booking platform — quiet-utility minimalism. A white ground structured by hairlines and faint gray panels; deep lagoon teal as the customer surface's action colour (vivid aqua in dark) while the staff operations surfaces (portal and field) run monochrome (ink/white actions); an Inter type scale tightened around 14px body and 11px uppercase micro-labels with Fraunces 600 reserved for display headlines, small radii, dense-but-breathing spacing, and the lagoon hue otherwise spent as a text-first brand accent. Semantic colour carries status meaning only, on every surface.
colors:
  brand: "#2fc9c0"
  brand-deep: "#0e6b64"
  brand-active: "#7fe3dc"
  brand-pale: "#dff5f3"
  ink: "#131417"
  ink-deep: "#1d2025"
  body: "#45494f"
  mute: "#6a7076"
  canvas: "#ffffff"
  canvas-soft: "#f7f7f8"
  positive: "#1fa552"
  positive-deep: "#166534"
  positive-tint: "#e2f5e9"
  warning: "#d97706"
  warning-deep: "#92400e"
  warning-tint: "#fdf3d9"
  negative: "#d03238"
  negative-deep: "#9f1d24"
  negative-tint: "#fbe9ea"

typography:
  # Inter everywhere. Hierarchy is size, weight (400/500/600) and tight
  # negative tracking at display sizes. The display face is the one sanctioned
  # exception, one weight: public-site display headlines (display-md and
  # above) plus each portal screen's single h1 page title — nothing else, and
  # the field surface never uses it (§Typography).
  display-face:
    fontFamily: Fraunces, Georgia, serif
    fontWeight: 600
  display-xl:
    fontFamily: Inter, system-ui, sans-serif
    fontSize: 44px
    fontWeight: 600
    lineHeight: 50px
    letterSpacing: -1.2px
  display-lg:
    fontFamily: Inter, system-ui, sans-serif
    fontSize: 34px
    fontWeight: 600
    lineHeight: 40px
    letterSpacing: -0.8px
  display-md:
    fontFamily: Inter, system-ui, sans-serif
    fontSize: 28px
    fontWeight: 600
    lineHeight: 34px
    letterSpacing: -0.56px
  display-sm:
    fontFamily: Inter, system-ui, sans-serif
    fontSize: 22px
    fontWeight: 600
    lineHeight: 28px
    letterSpacing: -0.35px
  display-xs:
    fontFamily: Inter, system-ui, sans-serif
    fontSize: 17px
    fontWeight: 600
    lineHeight: 24px
    letterSpacing: -0.17px
  body-lg:
    fontFamily: Inter, system-ui, sans-serif
    fontSize: 16px
    fontWeight: 400
    lineHeight: 25px
  body-md:
    fontFamily: Inter, system-ui, sans-serif
    fontSize: 14px
    fontWeight: 400
    lineHeight: 21px
  body-md-strong:
    fontFamily: Inter, system-ui, sans-serif
    fontSize: 14px
    fontWeight: 500
    lineHeight: 21px
  body-sm:
    fontFamily: Inter, system-ui, sans-serif
    fontSize: 13px
    fontWeight: 400
    lineHeight: 18px
  body-sm-strong:
    fontFamily: Inter, system-ui, sans-serif
    fontSize: 13px
    fontWeight: 500
    lineHeight: 18px
  caption:
    fontFamily: Inter, system-ui, sans-serif
    fontSize: 12px
    fontWeight: 400
    lineHeight: 16px
  micro:
    fontFamily: Inter, system-ui, sans-serif
    fontSize: 11px
    fontWeight: 500
    lineHeight: 14px
    letterSpacing: 0.55px
    textTransform: uppercase
  button-md:
    fontFamily: Inter, system-ui, sans-serif
    fontSize: 13px
    fontWeight: 500
    lineHeight: 20px

rounded:
  none: 0px
  sm: 4px
  md: 6px
  lg: 10px
  xl: 14px
  pill: 9999px
  full: 9999px

spacing:
  xxs: 2px
  xs: 4px
  sm: 8px
  md: 12px
  lg: 16px
  xl: 24px
  2xl: 32px
  3xl: 48px

components:
  nav-bar:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    typography: "{typography.body-sm}"
    padding: "{spacing.md} {spacing.xl}"
  nav-link:
    textColor: "{colors.body}"
    typography: "{typography.body-sm}"
  button-primary:
    backgroundColor: "{colors.brand-deep}"
    textColor: "{colors.canvas}"
    typography: "{typography.button-md}"
    rounded: "{rounded.md}"
    padding: "{spacing.sm} {spacing.lg}"
  button-secondary:
    backgroundColor: "{colors.canvas-soft}"
    textColor: "{colors.ink}"
    typography: "{typography.button-md}"
    rounded: "{rounded.md}"
    padding: "{spacing.sm} {spacing.lg}"
  button-tertiary:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    borderColor: "{colors.ink} @ 12%"
    typography: "{typography.button-md}"
    rounded: "{rounded.md}"
    padding: "{spacing.sm} {spacing.lg}"
  button-icon:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "{spacing.sm}"
  text-input:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    borderColor: "{colors.ink} @ 12%"
    typography: "{typography.body-md}"
    rounded: "{rounded.md}"
    padding: "{spacing.xs} {spacing.md}"
  card:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    borderColor: "{colors.ink} @ 8%"
    typography: "{typography.body-md}"
    rounded: "{rounded.lg}"
    padding: "{spacing.lg}"
  card-inset:
    backgroundColor: "{colors.canvas-soft}"
    textColor: "{colors.ink}"
    typography: "{typography.body-md}"
    rounded: "{rounded.md}"
    padding: "{spacing.md}"
  card-dark:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.canvas}"
    typography: "{typography.body-md}"
    rounded: "{rounded.lg}"
    padding: "{spacing.xl}"
  section:
    backgroundColor: "{colors.canvas}"
    borderTop: "1px {colors.ink} @ 6%"
    padding: "{spacing.3xl} {spacing.xl}"
  section-tinted:
    backgroundColor: "{colors.canvas-soft}"
    borderTop: "1px {colors.ink} @ 6%"
    padding: "{spacing.3xl} {spacing.xl}"
  footer:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.canvas-soft}"
    typography: "{typography.body-sm}"
    padding: "{spacing.3xl} {spacing.xl}"
  badge-positive:
    backgroundColor: "{colors.positive-tint}"
    textColor: "{colors.positive-deep}"
    typography: "{typography.caption} @ 500"
    padding: "{spacing.xxs} {spacing.sm}"
    rounded: "{rounded.pill}"
  badge-warning:
    backgroundColor: "{colors.warning-tint}"
    textColor: "{colors.warning-deep}"
    typography: "{typography.caption} @ 500"
    padding: "{spacing.xxs} {spacing.sm}"
    rounded: "{rounded.pill}"
  badge-negative:
    backgroundColor: "{colors.negative-tint}"
    textColor: "{colors.negative-deep}"
    typography: "{typography.caption} @ 500"
    padding: "{spacing.xxs} {spacing.sm}"
    rounded: "{rounded.pill}"
  # Elevation level 3. Dialogs, popovers and menus share one shell.
  overlay:
    backgroundColor: "{colors.canvas}"
    borderColor: "{colors.ink} @ 12%"
    typography: "{typography.body-md}"
    rounded: "{rounded.xl}"
    padding: "{spacing.xl}"
    shadow: "shadow-overlay"
  # A label, not a panel: control radius and the polarity-flip surface.
  tooltip:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.canvas}"
    typography: "{typography.caption}"
    rounded: "{rounded.md}"
    padding: "{spacing.xs} {spacing.sm}"
  # Menu items are controls inside the overlay shell.
  menu-item:
    textColor: "{colors.body}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.md}"
    padding: "{spacing.sm} {spacing.md}"
  # The portal's chrome bar. Ground fill, structure by hairline.
  topbar:
    backgroundColor: "{colors.canvas}"
    borderBottom: "1px {colors.ink} @ 7%"
    height: 56px
    padding: "0 {spacing.xl}"
  # Segmented control — the same "where am I" construction as the sidebar chip.
  # The active chip's faint shadow is the system's one non-overlay shadow.
  tab-segment:
    trackBackgroundColor: "{colors.canvas-soft}"
    activeBackgroundColor: "{colors.canvas}"
    activeTextColor: "{colors.ink}"
    activeShadow: "shadow-chip"
    textColor: "{colors.body}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.sm}"
    padding: "0 {spacing.md}"
  avatar:
    backgroundColor: "{colors.canvas-soft}"
    textColor: "{colors.ink}"
    typography: "{typography.caption} @ 500"
    rounded: "{rounded.full}"
    size: 32px

# Theme-aware roles. The palette above is the fixed brand set; these roles are
# what application code consumes, and each resolves per theme.
themes:
  light:
    background: "{colors.canvas}"
    card: "{colors.canvas}"
    muted: "{colors.canvas-soft}"
    foreground: "{colors.ink}"
    copy: "{colors.body}"
    muted-foreground: "{colors.mute}"
    border: "{colors.ink} @ 12%"
    divider: "{colors.ink} @ 7%"
    primary: "{colors.brand-deep}"
    primary-foreground: "{colors.canvas}"
    primary-hover: "mix({colors.brand-deep} 78%, {colors.brand})"
    primary-invert: "{colors.brand}"
    primary-invert-foreground: "{colors.ink}"
    primary-invert-hover: "{colors.brand-active}"
    accent: "{colors.brand-pale}"
    accent-foreground: "{colors.brand-deep}"
    secondary: "{colors.canvas-soft}"
    secondary-foreground: "{colors.ink}"
    invert-surface: "{colors.ink}"
    invert-foreground: "{colors.canvas}"
    footer-surface: "{colors.ink}"
    ring: "{colors.brand-deep}"
    scrim: "{colors.ink} @ 45%"
    badge-positive: "{colors.positive-tint}"
    badge-positive-foreground: "{colors.positive-deep}"
    badge-warning: "{colors.warning-tint}"
    badge-warning-foreground: "{colors.warning-deep}"
    badge-negative: "{colors.negative-tint}"
    badge-negative-foreground: "{colors.negative-deep}"
    badge-active: "{colors.brand-pale}"
    badge-active-foreground: "{colors.brand-deep}"
  dark:
    background: "{colors.ink}"
    card: "{colors.ink-deep}"
    muted: "mix({colors.ink-deep} 55%, {colors.ink})"
    foreground: "{colors.canvas}"
    copy: "{colors.canvas-soft}"
    muted-foreground: "mix({colors.mute} 55%, {colors.canvas-soft})"
    # 9% / 7% — anything stronger reads as wireframe against the ink ground.
    border: "{colors.canvas} @ 9%"
    divider: "{colors.canvas} @ 7%"
    primary: "{colors.brand}"
    primary-foreground: "{colors.ink}"
    primary-hover: "{colors.brand-active}"
    primary-invert: "{colors.brand-deep}"
    primary-invert-foreground: "{colors.canvas}"
    primary-invert-hover: "mix({colors.brand-deep} 78%, {colors.brand})"
    accent: "mix({colors.brand} 20%, {colors.ink-deep})"
    accent-foreground: "{colors.brand-active}"
    secondary: "mix({colors.canvas} 8%, {colors.ink-deep})"
    secondary-foreground: "{colors.canvas-soft}"
    invert-surface: "{colors.canvas-soft}"
    invert-foreground: "{colors.ink}"
    footer-surface: "mix({colors.ink-deep} 60%, {colors.ink})"
    ring: "{colors.brand}"
    # Dimming an ink ground with ink does nothing, so dark reaches past the
    # palette to black.
    scrim: "black @ 60%"
    badge-positive: "mix({colors.positive} 28%, {colors.ink-deep})"
    badge-positive-foreground: "{colors.canvas-soft}"
    badge-warning: "mix({colors.warning} 26%, {colors.ink-deep})"
    badge-warning-foreground: "{colors.canvas-soft}"
    badge-negative: "mix({colors.negative} 28%, {colors.ink-deep})"
    badge-negative-foreground: "{colors.canvas-soft}"
    badge-active: "mix({colors.brand} 24%, {colors.ink-deep})"
    badge-active-foreground: "{colors.brand-active}"
  # The operations surfaces (portal + field) are monochrome — these override
  # the maps above inside `[data-surface="ops"]`; everything not listed
  # inherits, and the semantic status colours are deliberately unchanged.
  ops:
    light:
      primary: "{colors.ink}"
      primary-foreground: "{colors.canvas}"
      primary-hover: "mix({colors.ink} 82%, {colors.canvas})"
      ring: "{colors.ink}"
      accent: "{colors.canvas-soft}"
      accent-foreground: "{colors.ink}"
    dark:
      primary: "{colors.canvas}"
      primary-foreground: "{colors.ink}"
      primary-hover: "{colors.canvas-soft}"
      ring: "{colors.canvas}"
      accent: "mix({colors.canvas} 12%, {colors.ink-deep})"
      accent-foreground: "{colors.canvas}"
---

# Palm Villa Design System

**Quiet-utility minimalism.** The reference class is modern product software — tight tables, hairline structure, decisive solid actions, tiny uppercase labels — applied to a place with a pool. The page is white and calm; structure comes from 1px hairlines and faint gray panels, not from coloured bands. On the public surface the action colour is **deep lagoon teal**: every primary button is a `{colors.brand-deep}` fill with white text in light (the vivid `{colors.brand}` with ink text in dark) — one striking, saturated solid per screen region, which is what makes the booking site read as decisive *and* branded. The **operations surfaces run monochrome** — ink actions in light, white in dark — because the staff tool (portal and field alike) is its own product and earns its premium feel from restraint rather than brand colour. Elsewhere the lagoon hue stays text-first — eyebrows, key price lines, the logo moment, the checked-in badge — and it never fills a band or a card. Type is Inter, tightened around a 14px body with 11px uppercase micro-labels doing the labelling work — with **Fraunces 600 as the display face** (public display headlines, plus each portal screen's `h1`), the one place the system spends personality in type. Radii are small (6px controls, 10px cards). Semantic colour means status and nothing else.

> **Superseded direction (2026-08-27, v1.0).** The beta direction used aqua-filled primary CTAs, alternating gray/white/pale-aqua/dark marketing bands, 15px body type, 8/12px radii and aqua focus glows. Reviewed against modern product references and recut: too soft, too coloured, too template. Nothing survives except the neutral-base principle, the aqua hue (demoted to brand accent), the semantic status pairs, the Fraunces public display face (dropped in the first recut pass, deliberately reinstated 2026-08-28 — see §Typography), and the theming architecture. An earlier alpha (warm sand, Manrope 800, pills) is two generations gone.

The same tokens serve all three surfaces. The public site gets slightly more air and the two sanctioned dark moments (long-term card, closing band); the portal and field screens are the dense subset — tables, forms, badges.

## Color

### Roles
- **Lagoon is the action colour — on the public surface.** `primary` resolves to `{colors.brand-deep}` in light and vivid `{colors.brand}` in dark: filled buttons, the selected state, the focus ring. A screen region has at most one filled-primary button. On locally dark surfaces (the promo card, the closing band) the `primary-invert` roles carry the same construction with the polarity swapped.
- **Two accents, one system.** The **customer-facing surface** — the public site and the booking flow — carries the lagoon accent; that is the brand's pop of personality. The **operations surfaces are monochrome**: the portal *and the field screens*, which are one product on different hardware and are never seen by a customer. There `primary` is ink in light and white in dark, the focus ring and selection follow, and nothing is teal. Only the action roles flip (`primary`, `primary-hover`, `ring`, `accent`); every structural role and every **semantic status colour is identical everywhere** — status is meaning, not brand, so the checked-in chip keeps its aqua pair on every surface. Implemented as `data-surface="ops"` on `<html>` — the same mechanism as `data-theme`, so overlays portaled into `<body>` inherit it; the frontmatter `themes.ops` block records the values.
- **Beyond the primary fill, the lagoon hue is text-first.** `{colors.brand-deep}` doubles as the readable brand text: the hero eyebrow, a key price line. Raw `{colors.brand}` outside dark-ground fills is reserved for small graphic moments (the logo dot, the checked-in badge hue) — never bands, never body text (it fails contrast on white).
- `{colors.canvas}` white is the working surface **and the page ground** — the portal sits on white, not gray. `{colors.canvas-soft}` is the faint gray spent on *selected and hover chips, inset panels, table header strips and tab tracks* — the small surfaces, never the ground. The two are close on purpose — the seam between them is always drawn with a hairline, not carried by the fill.
- `{colors.ink}` carries headings and the dark surfaces (footer, the two public dark moments); it never fills a button.
- Semantic set is **tint + deep text**: soft tinted chip, deep same-hue text. The saturated mid hues exist for icons and the destructive button only. Booking states: confirmed = positive, awaiting payment = warning, expired / cancelled / no-show = negative, checked-in = `brand-pale` with `brand-deep` text. Aqua is never a success indicator; that is `positive`.

### Accessibility
- Body copy `{colors.body}` on white: 8.9:1. `{colors.mute}` (captions, micro-labels): 4.9:1 on `canvas-soft`, passes AA at caption scale.
- `{colors.brand-deep}` on white: 6.3:1 — the only aqua that may carry text, and as a fill it carries white button labels at the same ratio. Vivid `{colors.brand}` with ink text (dark-theme primary, `primary-invert` on ink): ~8.9:1.
- Verify any new pairing before adding it.

## Dark theme

One fixed palette; **light and dark are two role mappings over it** (see `themes` frontmatter). Application code consumes roles (`background`, `card`, `copy`, `border`, `primary`), never raw tokens.

- **Surface order keeps its logic.** Light: white ground and white card, separated by the hairline — structure is drawn, not filled. Dark: ink ground → ink-deep card (lighter, so it still sits above).
- **The action colour shifts register, not hue.** Deep teal on the light ground becomes vivid aqua on the dark one — the primary button is always the one saturated solid on the screen, in both themes.
- **Hairlines invert** (ink @ 12% ↔ white @ 14%; dividers 7% ↔ 9%).
- **Status chips invert construction**: light = soft tint + deep text; dark = hue-tinted dark chip + light text. Hue mapping unchanged.
- **Mechanism**: `color-scheme` + CSS `light-dark()`. Light is the default; the OS preference is deliberately not followed (amended 2026-08-27) — dark is an explicit choice via `data-theme="dark"` on `<html>`. The Tailwind `dark:` variant keys to `[data-theme="dark"]` only, never `prefers-color-scheme`.

## Typography

**Inter carries every surface** via `next/font`. Hierarchy is size, weight (400/500/600) and negative tracking at display sizes. Numbers in data contexts always set `tabular-nums`; booking references may use the system mono stack (`font-mono`) at body-sm.

**One sanctioned exception (reinstated 2026-08-28): Fraunces 600 as the display face.** The public site is the surface that has to invite rather than operate, and it is where the brand shows personality in type. Fraunces is used for public-site display headlines — the hero `h1` and marketing-section `h2`s, i.e. type rendered at `display-md` and above on `(public)` routes — **and for the single `h1` page title of each portal screen** (at `display-sm`), so the brand voice carries through the booking journey instead of stopping at the portal door. One weight (600); it inherits the display tokens' sizes, line-heights and tracking. Everything else, on every surface — body, buttons, cards, captions, `display-xs` titles, section headings, micro-labels, the whole field surface — stays Inter. The failure mode this rule guards against is the alpha's — a loud face used everywhere at huge sizes — not the existence of a display face.

| Token | Size | Weight | Use |
|---|---|---|---|
| `display-xl` | 44px | 600 | Public hero only (Fraunces). |
| `display-lg` | 34px | 600 | Public section headlines (Fraunces). |
| `display-md` | 28px | 600 | Public sub-sections (Fraunces on public routes). |
| `display-sm` | 22px | 600 | Portal page titles (Fraunces on the `h1` only); key figures. |
| `display-xs` | 17px | 600 | Card titles; portal section headings. |
| `body-lg` | 16px | 400 | Lead paragraphs (public). |
| `body-md` (+strong) | 14px | 400/500 | Default body; form inputs. |
| `body-sm` (+strong) | 13px | 400/500 | Table cells; secondary body; nav links. |
| `caption` | 12px | 400 | Fine print, timestamps; badge text at 500. |
| `micro` | 11px | 500 | **The labelling voice**: uppercase, +0.55px tracking. Table headers, form section headers, stat labels, eyebrows. |
| `button-md` | 13px | 500 | Button labels. |

The `micro` token is what makes surfaces read as engineered: everywhere a label names a region of data (column header, form section, stat, metadata key), it is 11px uppercase mute — never a bolded body size. The portal never uses display sizes above `display-sm`. Field screens use the same scale; legibility comes from spacing and touch-target size, not larger type.

## Layout

- **Base unit 4px**; token scale in frontmatter. Public bands pad `{spacing.3xl}` vertically; card interiors are `{spacing.lg}` (16px) — dense, with `{spacing.xl}` reserved for marketing cards that carry media.
- Public marketing container centres at ~1120px. Portal content is full-width to ~1440px with a left nav.
- Field screens are single-column, mobile-first, thumb-reach ordering.
- **Sections separate with hairlines, not colour.** The public page is a continuous white surface; a `section-tinted` (`canvas-soft`) band may appear at most once per page for rhythm. The dark moments (long-term card, closing band) are the only other departures.

### Breakpoints
| Name | Width | Key changes |
|---|---|---|
| Mobile | < 768px | Everything stacks; grids 1-up. |
| Tablet | 768–1023px | Grids 2-up. |
| Desktop | ≥ 1024px | Portal nav expands; grids full. |

### Control heights & touch targets
Standard control height is **36px** (buttons, inputs, selects) on the customer surface. The **portal** tightens the same controls to **32px** — next to its 30px nav rows, 36px controls read padded — via the `--spacing-control` override on the operations register, so buttons, inputs and tab tracks stay one height. On **field screens** every interactive element is ≥ 48px tall and row-level primary actions render full-width in the `touch` size.

## Elevation & Depth

| Level | Treatment | Use |
|---|---|---|
| 0 — Flat | Nothing | Default. |
| 1 — Hairline | 1px `border` | Inputs, tertiary buttons, table containers, cards — every in-page surface. |
| 2 — Overlay | Hairline + `shadow-overlay` | Modals, popovers, menus, drawers, toasts, tooltips — anything that floats. |

**Surfaces are flat.** A card, a table, a chip never carries a shadow — the hairline is the entire boundary. The system's one shadow belongs to overlays, where it is structure (the thing genuinely floats) rather than decoration. Single exception: the segmented control's active chip carries the faint `shadow-chip` in place of a hairline (§Components — Tabs); nothing else borrows it.

Overlays sit over a `scrim` (ink @ 45% in light; black @ 60% in dark, because dimming an ink ground with ink does nothing) and take `{rounded.xl}` 14px, a hairline and `shadow-overlay`. Two exceptions: **edge-anchored drawers** drop the radius on the edges they meet — a rounded corner against the viewport edge reads as a rendering error — and **tooltips** take the control radius on the polarity-flip surface, because at caption height a 14px corner reads as a pill.

### Motion
Overlays fade and zoom in at ~150ms; drawers slide (300ms in, 200ms out). Motion stays on `opacity` and `transform`. Every animation is suppressed under `prefers-reduced-motion` — the element appears in its final state rather than moving.

## Components

**Buttons.** `primary` (the action colour: lagoon on the customer surface, ink/white on the operations surfaces — see *Two accents, one system*), `secondary` (faint gray fill), `tertiary` (white, hairline), `ghost`, `destructive`, and `inverted` (the `primary-invert` construction for dark surfaces). Radius `{rounded.md}` 6px; height 36px (portal 32px, field `touch` ≥ 48px); label `button-md` 13px/500. One primary fill per screen region. Focus is a 2px ring in the action colour. A primary **create** action leads with a plus glyph — "+ New booking" — never a bare verb-noun label. An **edit form's Save is dirty-gated**: disabled until the draft actually differs from what is saved, so an idle click cannot fire a no-op write or its audit event. Create forms stay enabled — they are never a no-op.

**Cards.** One card idiom: white, `{rounded.lg}` 10px, 1px hairline, no shadow. `card-inset` is the faint gray panel *inside* a card (fine print, deposit notes, grouped stats) at `{rounded.md}`. `card-dark` (ink) is the public site's promotional moment, used at most twice per page. There are no tinted feature cards — colour is not a card treatment. Interactive cards signal hover by strengthening the hairline and a 1px lift, never a shadow.

**Inputs.** White, hairline, `{rounded.md}` 6px, `body-md` 14px, height 36px (portal 32px), horizontal padding `{spacing.md}`. Focus: the border strengthens to the action colour plus a faint same-hue halo (`ring`) — decisive, not a glow. Labels are `body-sm-strong` ink. Field-screen inputs use the `touch` size.

**Date entry — no calendar component is specified.** Surfaces needing dates use native `<input type="date">` with the input treatment. Adequate for the portal; **not** adequate for the public availability calendar (A1), which must be specified here before it is built.

**Portal forms.** A form is one card, never a stack of sibling cards: sections divide with hairline rules and take `micro` headers in mute. Fields size to their content (a two-digit count gets ~150px, not a row). The itemised price sits beside the form in a sticky card — figures `tabular-nums`, total at `display-sm` — carrying the screen's one primary button. Native selects draw their own chevron (`appearance-none` + 16px mute chevron). Stat readouts render as `micro` label over `display-xs`/`display-sm` figure.

**Status badges.** Pill, `caption` 12px at weight 500, `{spacing.xxs} {spacing.sm}` padding, tint + deep text. Small and quiet — a badge is metadata, not a button. Pills appear nowhere else.

**Tables (the portal's signature surface).** A hairline-bounded container at `{rounded.lg}` with `overflow-hidden`; header row on `canvas-soft` in `micro` mute; body rows `body-sm` with `divider` rules; cells pad `{spacing.md} {spacing.lg}` vertically tight. Reference and money columns set `tabular-nums`. Row hover is a whisper of `canvas-soft`. This is the payment queue, arrivals list, and every list screen.

**Table pagination.** The footer bookends the header: the same `canvas-soft` strip, the same `divider` hairline, *inside* the table's container so one boundary and one radius hold the whole surface. Left, the range in `body-sm` mute with `tabular-nums` ("1–10 of 18 accounts") — it stays even when there is a single page, because the count is useful; the page controls appear only when there is more than one. Right, an optional `micro` "Per page" select and the page chips at control size. **The current page is a white chip with a hairline** — "where am I" as a quiet surface shift, the sidebar's and segmented control's language — and deliberately *without* `shadow-chip`, which stays the segmented control's alone. Idle pages are `copy`, hover lifts them to the card fill; the step arrows fade rather than disappear at the ends. An ellipsis only ever stands in for two or more pages, and the control's slot count is constant, so it never changes width as you page.

**QR block.** White card, centred QR ≥ 200px with default quiet zone, booking reference in `display-sm` beneath, guidance in `body-sm`.

**Portal topbar.** 56px tall — the 36px controls inside need air, at 48px they read as suffocated — filled with the page ground and separated by a bottom hairline. The sidebar's brand block takes the same height and the same bottom hairline, so **one unbroken rule runs across the full width**, separating the brand from both the navigation and the content — the sidebar's construction continued across the top. Breadcrumbs sit left in `body-sm` mute with chevron separators, the current crumb in ink at 500; the tools that belong to no single screen (search, notifications, theme) sit right. It is sticky, and it **never carries the page title** — that stays the screen's single `h1` beneath it. Below `lg` it also holds the drawer trigger.

**Portal nav items.** Every item pairs a 16px icon with its label. The active item is a `canvas-soft` chip with ink text at 500 — a quiet surface shift on the white ground, never a colour; hover is the same chip at a whisper. Icons render in `mute` and lift to ink with the chip — they follow the item's state, never carry the brand hue, and never appear without a label in the sidebar. **Every item belongs to a labelled group** — there is no ungrouped lead item.

Group headers are `micro` in `mute`, and always sit **one step below the items they label** — they organise the nav, they do not compete with it. Light gets that from the roles directly (`mute` label under `copy` items); dark takes `muted-foreground` at 75%, because there the label and item roles would otherwise resolve to the same value. The result is one contrast ladder in both themes: label ≈ 5:1, idle ≈ 8–9:1, selected 18:1, with the label still clearing AA at 11px.

Idle items are `copy` in light but step down to **`muted-foreground` in dark**. This asymmetry is deliberate and load-bearing: `copy` sits a readable distance below `foreground` in light (`{colors.body}` against `{colors.ink}`) but nearly on top of it in dark (`{colors.canvas-soft}` against `{colors.canvas}`), where idle items would otherwise read as bright as the selected one.

**Overlays (dialogs, popovers, menus).** One shell: `{rounded.xl}` 14px, hairline, `shadow-overlay`, over the `scrim`. A dialog title is `display-xs` in Inter — a modal heading is a section heading, so the display face stays off it. Its footer holds at most one primary fill, like any other screen region. Menu items are *controls* inside that shell: `{rounded.md}` 6px, `body-sm`, 16px icons in mute, `muted` fill on focus. Menu group labels are `micro`, same as every other data-region label.

**Drawers.** The mobile portal nav is a left drawer, 280px, sliding over the scrim, closing on navigation. It fills with the page ground — the same surface the sidebar sits on, so the nav reads identically in both places. Edge-anchored, so no radius.

**Tabs — a segmented control, not underlines.** A `muted` track at control height and `{rounded.md}` with `{spacing.xxs}` padding; the active segment is a white card chip at `{rounded.sm}` (concentric inside the track), stretched to the track's full inner height — a chip floating with track above and below it breaks the concentric geometry. No hairline on the chip: it carries `shadow-chip`, a faint lift that is the system's **one non-overlay shadow** — an edge felt rather than drawn. Dark grounds swallow shade, so in dark the lift flips to light: a 1px white-alpha edge ring with deeper black shade beneath, and the chip's fill (`tab-chip`) lifts a half-step above card (canvas @ 4% over ink-deep) — dark elevation reads through a lighter surface, held short of `secondary`'s full step. Labels `body-sm`, ink and 500 when active. The same principle as the sidebar's active item — *where am I* is a quiet surface shift, never the action colour; here the track supplies the gray, so the active segment lifts out of it in white. No underline tabs, no pill tabs.

**Checkboxes.** 16px, `{rounded.sm}` 4px (6px reads as a circle at that size), hairline on white; checked fills with the action colour. Small enough that the fill does not count against the one-primary-per-region rule.

**Textareas.** The input treatment at multiple lines — same hairline, radius, type and focus — sized to their content rather than fixed.

**Avatars.** Circular, 32px by default, `muted` fill with initials at `caption`/500. The sanctioned exception to "pills are badges only", which concerns rectangles becoming pills, not identity marks. Never a brand fill — an avatar identifies a person, it is not an accent.

**Skeletons.** `muted` at the control radius, shaped to match the content arriving, pulsing gently and static under reduced motion. Never a shimmer sweep: that is decoration, and it does not survive the theme flip cleanly.

## Do's and Don'ts

### Do
- Keep the ground white and quiet; draw structure with hairlines and faint gray panels.
- Make every primary action a lagoon fill (`brand-deep` in light, vivid `brand` in dark); keep exactly one per screen region — its scarcity is what makes it striking.
- Elsewhere spend the hue as text and small brand moments (`brand-deep` for text, raw `brand` for graphic dots/logo).
- Label data regions in `micro` uppercase mute — tables, form sections, stats, eyebrows.
- Keep radii small: 6px controls, 10px cards, 14px overlays, pills for badges only.
- Set `tabular-nums` on every number that sits in a column or a total.
- Reach for theme roles (`background`, `card`, `copy`, `border`, `primary`) in application code, never raw palette tokens.

### Don't
- Don't fill bands, cards or any surface larger than a button with the lagoon hue — the primary button (and the badge chip) are its only fills.
- Don't fill a button with ink **on the customer surface**; there, ink is text and the dark surfaces, and a black button reads as someone else's brand. The operations surfaces are the deliberate exception — their whole register is monochrome, so ink (white in dark) *is* their primary.
- Don't use aqua as a success state; success is the `positive` pair.
- Don't let Fraunces off display headlines — public `display-md`+ and the portal's `h1` page title only; never on the field surface, never for body or UI text. And no third family, anywhere.
- Don't build coloured band alternation; sections separate with hairlines on white.
- Don't put a shadow on anything that is not an overlay. Cards, tables and chips are hairline-bounded and flat; `shadow-overlay` exists only for things that genuinely float (dialogs, menus, popovers, drawers, tooltips, toasts). The segmented control's active chip (`shadow-chip`) is the one exception — don't reuse it elsewhere.
- Don't let bolded body text do a label's job; if it names a data region, it is `micro`.
- Don't let any type above `display-sm` into the portal.
- Don't render buttons or cards as pills — badges and avatars are the only round things.
- Don't size anything with `max-w-lg` / `w-xl` and friends: the named spacing scale owns those suffixes here, so `max-w-lg` is 16px, not a container width. Widths are explicit (`max-w-[480px]`).
- Don't answer "where am I" with the action colour; it is always a quiet surface shift — a muted chip on the white ground (nav), or a white chip lifted from the muted track (tabs).
