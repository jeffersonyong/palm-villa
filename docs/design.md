---
version: beta
name: Palm-Villa-design-system
description: Design language for the Palm Villa booking platform — a minimal, modern, soft surface built on a neutral near-white/near-black core, one lagoon-aqua accent used sparingly, a quiet Inter type scale with a Fraunces display face reserved for public-site headlines, and gently rounded white cards on a cool light-gray ground; calm enough to carry an operations portal, with just enough colour to feel like a place with a pool.
colors:
  primary: "#2fc9c0"
  primary-deep: "#0e6b64"
  on-primary: "#16181b"
  primary-active: "#7fe3dc"
  primary-neutral: "#a9e8e3"
  primary-pale: "#dff5f3"
  ink: "#16181b"
  ink-deep: "#1f2225"
  body: "#41474c"
  mute: "#626b71"
  canvas: "#ffffff"
  canvas-soft: "#f4f5f6"
  positive: "#1fa552"
  positive-deep: "#166534"
  positive-tint: "#dcf3e4"
  warning: "#d97706"
  warning-deep: "#92400e"
  warning-tint: "#fdf2d6"
  negative: "#d03238"
  negative-deep: "#9f1d24"
  negative-tint: "#fbe7e8"

typography:
  # Display face — public-site display headlines ONLY (hero h1 and section
  # h2s at display-md and above). One weight. Portal and field surfaces never
  # use it; every token below stays Inter.
  display-face:
    fontFamily: Fraunces, Georgia, serif
    fontWeight: 600
  display-xl:
    fontFamily: Inter, system-ui, sans-serif
    fontSize: 52px
    fontWeight: 600
    lineHeight: 60px
    letterSpacing: -1.04px
  display-lg:
    fontFamily: Inter, system-ui, sans-serif
    fontSize: 40px
    fontWeight: 600
    lineHeight: 46px
    letterSpacing: -0.8px
  display-md:
    fontFamily: Inter, system-ui, sans-serif
    fontSize: 32px
    fontWeight: 600
    lineHeight: 38px
    letterSpacing: -0.64px
  display-sm:
    fontFamily: Inter, system-ui, sans-serif
    fontSize: 24px
    fontWeight: 600
    lineHeight: 30px
    letterSpacing: -0.48px
  display-xs:
    fontFamily: Inter, system-ui, sans-serif
    fontSize: 20px
    fontWeight: 600
    lineHeight: 26px
    letterSpacing: -0.3px
  body-lg:
    fontFamily: Inter, system-ui, sans-serif
    fontSize: 18px
    fontWeight: 400
    lineHeight: 28px
  body-md:
    fontFamily: Inter, system-ui, sans-serif
    fontSize: 15px
    fontWeight: 400
    lineHeight: 22px
  body-md-strong:
    fontFamily: Inter, system-ui, sans-serif
    fontSize: 15px
    fontWeight: 500
    lineHeight: 22px
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
  button-md:
    fontFamily: Inter, system-ui, sans-serif
    fontSize: 14px
    fontWeight: 500
    lineHeight: 20px

rounded:
  none: 0px
  sm: 4px
  md: 8px
  lg: 12px
  xl: 16px
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
    typography: "{typography.body-sm-strong}"
    padding: "{spacing.md} {spacing.xl}"
  nav-link:
    textColor: "{colors.ink}"
    typography: "{typography.body-sm-strong}"
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
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
    borderColor: "{colors.ink} @ 10%"
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
    borderColor: "{colors.ink} @ 10%"
    typography: "{typography.body-md}"
    rounded: "{rounded.md}"
    padding: "{spacing.md} {spacing.lg}"
  card-content:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    typography: "{typography.body-md}"
    rounded: "{rounded.lg}"
    padding: "{spacing.xl}"
  card-feature-muted:
    backgroundColor: "{colors.canvas-soft}"
    textColor: "{colors.ink}"
    typography: "{typography.body-md}"
    rounded: "{rounded.lg}"
    padding: "{spacing.xl}"
  card-feature-aqua:
    backgroundColor: "{colors.primary-pale}"
    textColor: "{colors.ink}"
    typography: "{typography.body-md}"
    rounded: "{rounded.lg}"
    padding: "{spacing.xl}"
  card-feature-dark:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.canvas}"
    typography: "{typography.body-md}"
    rounded: "{rounded.lg}"
    padding: "{spacing.xl}"
  booking-summary-card:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    borderColor: "{colors.ink} @ 10%"
    typography: "{typography.body-md}"
    rounded: "{rounded.lg}"
    padding: "{spacing.xl}"
  hero-band:
    backgroundColor: "{colors.canvas-soft}"
    textColor: "{colors.ink}"
    typography: "{typography.display-xl}"
    padding: "{spacing.3xl} {spacing.xl}"
  hero-band-dark:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.canvas}"
    typography: "{typography.display-xl}"
    padding: "{spacing.3xl} {spacing.xl}"
  content-band:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    typography: "{typography.display-md}"
    padding: "{spacing.3xl} {spacing.xl}"
  # At most ONE per page, public site only, and never a band containing a
  # primary CTA (aqua never sits on aqua). Exists to break the gray/white
  # band alternation once per scroll; in dark it resolves through the accent
  # role like every pale-aqua surface.
  content-band-aqua:
    backgroundColor: "{colors.primary-pale}"
    textColor: "{colors.ink}"
    typography: "{typography.display-md}"
    padding: "{spacing.3xl} {spacing.xl}"
  footer:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.canvas-soft}"
    typography: "{typography.body-sm}"
    padding: "{spacing.3xl} {spacing.xl}"
  badge-positive:
    backgroundColor: "{colors.positive-tint}"
    textColor: "{colors.positive-deep}"
    typography: "{typography.body-sm-strong}"
    padding: "{spacing.xs} {spacing.md}"
    rounded: "{rounded.pill}"
  badge-warning:
    backgroundColor: "{colors.warning-tint}"
    textColor: "{colors.warning-deep}"
    typography: "{typography.body-sm-strong}"
    padding: "{spacing.xs} {spacing.md}"
    rounded: "{rounded.pill}"
  badge-negative:
    backgroundColor: "{colors.negative-tint}"
    textColor: "{colors.negative-deep}"
    typography: "{typography.body-sm-strong}"
    padding: "{spacing.xs} {spacing.md}"
    rounded: "{rounded.pill}"

# Theme-aware roles. The palette above is the fixed brand set; these roles are
# what application code consumes, and each resolves per theme. Dark values are
# derived from existing tokens — no new hexes were introduced.
themes:
  light:
    background: "{colors.canvas-soft}"
    card: "{colors.canvas}"
    muted: "{colors.canvas-soft}"
    foreground: "{colors.ink}"
    copy: "{colors.body}"
    muted-foreground: "{colors.mute}"
    border: "{colors.ink} @ 10%"
    divider: "{colors.ink} @ 6%"
    accent: "{colors.primary-pale}"
    accent-foreground: "{colors.primary-deep}"
    secondary: "{colors.canvas-soft}"
    secondary-foreground: "{colors.ink}"
    invert-surface: "{colors.ink}"
    invert-foreground: "{colors.canvas}"
    footer-surface: "{colors.ink}"
    badge-positive: "{colors.positive-tint}"
    badge-positive-foreground: "{colors.positive-deep}"
    badge-warning: "{colors.warning-tint}"
    badge-warning-foreground: "{colors.warning-deep}"
    badge-negative: "{colors.negative-tint}"
    badge-negative-foreground: "{colors.negative-deep}"
    badge-active: "{colors.primary-pale}"
    badge-active-foreground: "{colors.primary-deep}"
  dark:
    background: "{colors.ink}"
    card: "{colors.ink-deep}"
    muted: "mix({colors.ink-deep} 55%, {colors.ink})"
    foreground: "{colors.canvas}"
    copy: "{colors.canvas-soft}"
    muted-foreground: "mix({colors.mute} 55%, {colors.canvas-soft})"
    border: "{colors.canvas} @ 12%"
    divider: "{colors.canvas} @ 8%"
    accent: "mix({colors.primary} 20%, {colors.ink-deep})"
    accent-foreground: "{colors.primary-active}"
    secondary: "mix({colors.canvas} 8%, {colors.ink-deep})"
    secondary-foreground: "{colors.canvas-soft}"
    invert-surface: "{colors.canvas-soft}"
    invert-foreground: "{colors.ink}"
    footer-surface: "mix({colors.ink-deep} 60%, {colors.ink})"
    badge-positive: "mix({colors.positive} 28%, {colors.ink-deep})"
    badge-positive-foreground: "{colors.canvas-soft}"
    badge-warning: "mix({colors.warning} 26%, {colors.ink-deep})"
    badge-warning-foreground: "{colors.canvas-soft}"
    badge-negative: "mix({colors.negative} 28%, {colors.ink-deep})"
    badge-negative-foreground: "{colors.canvas-soft}"
    badge-active: "mix({colors.primary} 24%, {colors.ink-deep})"
    badge-active-foreground: "{colors.primary-active}"
---

# Palm Villa Design System

A minimal, modern, soft design language. The base is strictly neutral — near-white cool-gray ground, white cards, near-black text — and **lagoon aqua** (pool water) is the single accent, spent only where it earns attention: the primary CTA and small brand moments. Type is one family (Inter) at a quiet scale; geometry is gently rounded, never bubbly. The temperament is "calm product with a pool", not "resort brochure".

> **Superseded direction (2026-08-25).** An earlier alpha used a warm-sand canvas, Manrope 800 display type up to 126px, and 24px pill radii. That direction was reviewed and recut: too warm, too loud, too rounded. This document is the sole current direction; nothing from the alpha survives except the aqua accent and the token architecture.

The same tokens serve all three surfaces. The public site uses the fuller range (hero band, feature cards); the operations portal and field screens use the quiet subset: white cards on the gray ground, semantic badges, and aqua reserved for the single most important action per screen.

## Color

### Roles
- `{colors.primary}` lagoon aqua is the sole brand accent and the conversion signature. Every primary CTA is aqua. It appears rarely elsewhere — the less of it on screen, the more the CTA reads. It is never used as a success indicator; that is `{colors.positive}`.
- `{colors.primary-deep}` is the readable dark aqua: text on `primary-pale` surfaces and the checked-in badge. Never a background of its own.
- `{colors.canvas-soft}` cool near-white gray is the page ground; `{colors.canvas}` white cards sit on it. Surface contrast is the elevation system.
- `{colors.ink}` neutral near-black carries headings and the dark-theme ground; `{colors.ink-deep}` is the slightly *raised* dark surface (dark-theme cards).
- Semantic set is **tint + deep text**: each status renders as a soft tinted chip (`positive-tint` etc.) with deep same-hue text (`positive-deep` etc.). The saturated mid hues (`positive`, `warning`, `negative`) exist for icons, accents, and the destructive button — not for chip backgrounds. In the portal these drive the **booking state badges**: confirmed = positive, awaiting payment = warning, expired / cancelled / no-show = negative, checked-in = `primary-pale` with `primary-deep` text.

### Accessibility
- `{colors.primary}` on white fails as body text. Aqua is a surface and accent colour; text on aqua surfaces is `{colors.on-primary}` ink (8.7:1 measured).
- Body copy is `{colors.body}` on white or gray ground (8.6:1); `{colors.mute}` is caption scale only and clears AA on both grounds (4.98:1 on `canvas-soft`). This resolves the alpha's open item on caption contrast — the neutral recut chose `mute` to pass, so the question is closed.

## Dark theme

The palette is one fixed brand set; **light and dark are two role mappings over it**, listed in the `themes` frontmatter. Application code consumes roles (`background`, `card`, `copy`, `border`), never raw tokens, which is what lets a single class serve both.

Every dark value is derived from a token that already exists — no new hexes.

### What inverts, and why

- **Surface contrast stays the elevation system.** Light runs gray ground → white card; dark runs `{colors.ink}` → `{colors.ink-deep}` (which is *lighter* than ink, so the card still sits above the ground). Shadows remain overlay-only in both themes.
- **The accent does not change.** One aqua, same `{colors.on-primary}` ink label, in both themes. Aqua sits only on neutral grounds, and ink is a neutral ground.
- **Hairlines invert.** Light uses ink at 10%; on a dark ground that is invisible, so dark uses white at 12%. Table rules and nav edges use the quieter `divider` role (6% / 8%).
- **Polarity-flip surfaces flip with the theme.** `card-feature-dark` and `hero-band-dark` are defined by being the opposite of the current ground, so in dark they become light-on-dark's inverse. Their *intent* — a polarity break — is what carries over, not their value.
- **The footer is the exception.** A near-white slab glares on a dark page, so dark uses a raised ink instead of the straight flip.
- **Status chips invert their construction.** Light uses soft tints with deep text. Dark uses a hue-tinted dark chip with `{colors.canvas-soft}` text. The hue mapping is unchanged, so the status language reads identically.

### Mechanism

`color-scheme` plus CSS `light-dark()`. Each role is declared once and the browser picks the branch. An explicit choice sets `data-theme="light"` or `data-theme="dark"` on `<html>`, which flips `color-scheme` and therefore every role at once. No theming dependency is used.

**Light is the default, and the OS preference is deliberately not followed** (amended 2026-08-27). `:root` declares `color-scheme: light`, so a visitor with no stored choice always gets the light surface — the brand is the light page, and someone arriving from Instagram on a phone in OS dark mode should see what everyone else sees. Dark remains a first-class choice, offered as two explicit states; there is no "system" option to pick, because there is no OS-following state to name.

The Tailwind `dark:` variant matches this exactly — `[data-theme="dark"]` and nothing else. It must never be keyed to `prefers-color-scheme` again: a variant that disagrees with the tokens would style an OS-dark visitor's *light* page with dark-mode rules, and the mismatch is invisible to anyone testing by toggling the control.

### Contrast

Measured on the rendered `/tokens` page, every text/ground pairing in both themes clears AA (4.5:1). The tightest are light-theme `mute` on the ground at 4.98:1 and the light checked-in badge (`primary-deep` on `primary-pale`) at 5.59:1; status chips run 6.1–6.6:1 in light and 6.7–11:1 in dark. Verify any new pairing before adding it.

## Typography

**Inter carries every surface**, via `next/font`. Hierarchy comes from size, weight (400/500/600) and tight letter-spacing at display sizes. Nothing on any surface exceeds `display-xl` (52px), and only the public hero uses it.

**One sanctioned exception (2026-08-27): Fraunces 600 as the public display face.** The public site is the one surface that has to invite rather than operate, and Inter-only headlines read flat there. Fraunces — a soft serif with warmth that suits "a place with a pool" — is used *only* for public-site display headlines: the hero `h1` and marketing-section `h2`s, i.e. type rendered at `display-md` and above on `(public)` routes. It ships in exactly one weight (600) and inherits the display tokens' sizes, line-heights and tracking. Everything else on the public site — body, buttons, cards, captions, `display-xs` card titles — stays Inter, and the portal and field surfaces never use Fraunces at all; their tone remains calm and single-family. This amends, deliberately and narrowly, the earlier one-family rule; the alpha's mistake was a loud face used everywhere at huge sizes, not the existence of a display face.

| Token | Size | Weight | Use |
|---|---|---|---|
| `display-xl` | 52px | 600 | Public-site hero only. |
| `display-lg` | 40px | 600 | Public section headlines. |
| `display-md` | 32px | 600 | Card headlines; public sub-sections. |
| `display-sm` | 24px | 600 | Portal page titles. |
| `display-xs` | 20px | 600 | Portal section headings; card titles. |
| `body-lg` | 18px | 400 | Lead paragraphs (public). |
| `body-md` (+strong) | 15px | 400/500 | Default body; table cells. |
| `body-sm` (+strong) | 13px | 400/500 | Secondary body; nav links; badges. |
| `caption` | 12px | 400 | Fine print, timestamps, audit lines. |
| `button-md` | 14px | 500 | Button labels. |

The portal never uses display sizes above `display-sm`; its tone is calm. Field screens use the same scale — legibility comes from spacing and touch-target size, not larger type.

## Layout

- **Base unit 4px**; token scale as frontmatter. Bands pad `{spacing.3xl}` vertically on desktop; card interiors are `{spacing.xl}`.
- Public marketing container centres at ~1200px. Portal content is full-width with a max of ~1440px and a left nav.
- Field screens are single-column, mobile-first, thumb-reach ordering: today's list on load, primary action at the bottom of each row card.

### Breakpoints
| Name | Width | Key changes |
|---|---|---|
| Mobile | < 768px | Everything stacks; grids 1-up; field surface's native width. |
| Tablet | 768–1023px | Grids 2-up. |
| Desktop | ≥ 1024px | Portal nav expands; grids full. |

### Touch targets
On **field screens**, every interactive element is ≥ 48px tall and row-level primary actions (Check in, Mark ready) render as full-width `button-primary` in the `touch` size. On desktop surfaces (public site, portal) the standard control height is 40px.

## Elevation & Depth

| Level | Treatment | Use |
|---|---|---|
| 0 — Flat | No shadow, no border | Default. |
| 1 — Hairline | 1px neutral hairline (`ink` @ 10% light, `canvas` @ 12% dark) | Tertiary buttons, inputs, `booking-summary-card`. |
| 2 — Surface contrast | White card on gray ground | Cards; the primary elevation cue. Shadows only on overlays (modals, toasts). |

## Components

**Buttons.** `button-primary` (aqua, ink text), `button-secondary` (gray), `button-tertiary` (white, neutral hairline). One primary per screen region. Canonical radius `{rounded.md}` 8px; standard height 40px, field `touch` size ≥ 48px.

**Cards.** `card-content` default white; `card-feature-muted` / `card-feature-aqua` for public-site feature grids; `card-feature-dark` for promotional polarity flips (public only, used sparingly). `booking-summary-card` is the signature interactive card — the availability/price summary on the public flow and the booking detail header in the portal — white with a neutral hairline. Canonical radius `{rounded.lg}` 12px; `{rounded.xl}` 16px is reserved for overlays (modals, sheets).

**Bands (public site).** Marketing pages are full-width bands alternating the gray ground and the white card surface, with `hero-band-dark` as the sanctioned polarity flip. `content-band-aqua` (2026-08-27) is the one further band surface: a `primary-pale` ground used **at most once per page** to break the gray/white alternation mid-scroll. It may never hold a primary CTA — aqua does not sit on aqua — and elements that are pale-aqua on neutral grounds (step markers, `card-feature-aqua`) cannot stay pale-aqua inside it. Small markers on this band take the **polarity flip**: ink with a light label, which is the only treatment that reads at chip scale against the tint. Dark keeps its own construction — a raised `card` disc with an `accent-foreground` label — because a straight polarity flip there would put a near-white disc on the band, the same glare the `footer-surface` role exists to avoid. Verified pairings on `primary-pale`: `body` 8.5:1, `mute` 4.9:1, `primary-deep` 5.6:1; the flipped marker is `canvas` on `ink` at 17:1.

**Inputs.** White, neutral hairline, `{rounded.md}` 8px, `body-md`. Field-screen inputs scale padding up one step. Labels are `body-sm-strong` in `{colors.ink}` — a label a staff member must read to fill the form correctly is not secondary text.

**Date entry — no calendar component is specified (2026-08-27).** The system has no date-picker or calendar spec, so surfaces needing dates use the browser's native `<input type="date">`, which inherits the input treatment above. That is adequate for the portal, where a booking clerk enters two known dates. It is **not** adequate for the public availability calendar (capability A1), which shows availability across a month and is a designed surface rather than a control. That component needs specifying here before it is built — until then, building one would be unsanctioned styling.

**Status badges.** Pill-shaped (`{rounded.pill}`) — the one place pills survive, because at chip scale a pill reads as soft, not bubbly. `body-sm-strong`, tint background + deep same-hue text per the color roles above. These are the portal's core status language and appear in the calendar, queue, and lists.

**Data surfaces (portal).** Table headers in `caption` uppercase `{colors.mute}` on `{colors.canvas-soft}`; rows in `body-sm` with `divider` rules. The payment verification queue and today's-arrivals list are this pattern.

**QR block.** White card, centred QR at ≥ 200px with default quiet zone, booking reference in `display-xs` directly beneath, guidance in `body-sm`. Renders identically in email and on screen.

## Do's and Don'ts

### Do
- Keep the base strictly neutral; spend aqua only on the primary CTA and small brand moments. Scarcity is what makes it read.
- Build hierarchy with size, weight and spacing inside the one type scale. The hero never exceeds 52px. Fraunces appears only on public display headlines (`display-md`+); everything else, on every surface, is Inter.
- Use 8px radius for controls, 12px for cards, 16px for overlays. Pills are for badges only.
- Cycle gray ground → white cards (ink → ink-deep in dark); let surface contrast carry elevation.
- Use the semantic tint/deep pairs for all status meaning; keep them out of decorative use.
- Reach for a theme role (`background`, `card`, `copy`, `border`) in application code, not a raw palette token — raw tokens do not respond to the theme.

### Don't
- Don't introduce a second accent or decorative colour. Neutral + aqua is the whole palette.
- Don't use aqua as a success state; success is the `positive` pair.
- Don't render buttons or cards as pills; the generous-pill geometry belongs to the superseded alpha.
- Don't let any type above `display-sm` into the portal; its tone is calm. Fraunces never appears on portal or field surfaces, at any size.
- Don't place aqua CTAs on aqua surfaces; aqua sits on neutral (gray / white / ink) only.
- Don't hardcode a raw palette token where a theme role exists; it will be wrong in one of the two themes.
