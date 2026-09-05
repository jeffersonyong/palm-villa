---
version: 1.0
name: Palm-Villa-design-system
description: Design language for the Palm Villa booking platform — quiet-utility minimalism. Four neutral surface rungs — app background → panel → container → card — each a step away from what it sits on and bounded by one hairline, with the operations surfaces putting the navigation directly on the background and elevating only the content panel; deep lagoon teal as the customer surface's action colour (vivid aqua in dark) while the staff operations surfaces (portal and field) run monochrome (ink/white actions); a Geist type scale tightened around 14px body, a two-step ink/mute text ladder and 11px uppercase micro-labels, with Fraunces 700 reserved for the customer surface's display headlines; nested radii, spacing that is tight inside a cluster and loose between clusters, and the lagoon hue otherwise spent as a text-first brand accent. Brand colour and brand face travel together: both belong to the customer surface, neither to operations. Semantic colour carries status meaning only, on every surface.
colors:
  brand: "#2fc9c0"
  brand-deep: "#0e6b64"
  brand-active: "#7fe3dc"
  brand-pale: "#dff5f3"

  # The neutral ramp is achromatic (§Color — the neutral ramp). Dark carries the
  # four surface rungs on its own tones, climbing all the way (§Dark theme).
  ink: "#111111"
  ink-panel: "#161616"
  ink-deep: "#1c1c1c"
  ink-raised: "#242424"
  mute: "#6b6b6b"

  # The light surface tones, lightest last, plus the one hairline.
  canvas-sunk: "#f3f3f3"
  canvas-soft: "#f7f7f7"
  canvas: "#ffffff"
  hairline: "#e8e8e8"

  # Semantic — mid hue and deep text. Chip and panel grounds are derived from
  # the mid hue by color-mix, not named (§Color — semantic construction).
  positive: "#1fa552"
  positive-deep: "#166534"
  warning: "#d97706"
  warning-deep: "#92400e"
  negative: "#d03238"
  negative-deep: "#9f1d24"
  info: "#1c80dd"
  info-deep: "#0f5ea8"

  # Identity — avatar hues, a tint fill under deep same-hue text, one
  # construction in both themes. Ordered; the order is load bearing (§Avatars).
  # The seven mid hues retired 2026-08-31 with the dark mix that was their only
  # consumer.
  identity-sky-tint: "#c3eefa"
  identity-sky-deep: "#155e75"
  identity-blue-tint: "#cde3fe"
  identity-blue-deep: "#1e40af"
  identity-violet-tint: "#e0dafe"
  identity-violet-deep: "#5b21b6"
  identity-fuchsia-tint: "#f8dcff"
  identity-fuchsia-deep: "#86198f"
  identity-rose-tint: "#ffd9dd"
  identity-rose-deep: "#9f1239"
  identity-orange-tint: "#fee2c0"
  identity-orange-deep: "#9a3412"
  identity-lime-tint: "#e3fbb4"
  identity-lime-deep: "#3f6212"

  # Stream — which product was sold. Mid hues only, deliberately: a stream is
  # never a fill, so there is no tint to build a badge out of.
  stream-short-stay: "#6366f1"
  stream-day-pass: "#f97316"
  stream-tenancy: "#c026d3"

typography:
  # Geist everywhere (Geist Mono for references and codes). Hierarchy is size,
  # weight (400/500/600/700) and tight
  # negative tracking at display sizes. The display face is the one sanctioned
  # exception, one weight, and it belongs to the customer surface alone:
  # public-site display headlines (display-md and above) — nothing else. The
  # portal and the field surface never use it (§Typography).
  display-face:
    fontFamily: Fraunces, Georgia, serif
    fontWeight: 700
  # The two headline sizes carry 700 and -0.02em; the scale returns to 600
  # below them (§Typography).
  display-xl:
    fontFamily: Geist, system-ui, sans-serif
    fontSize: 44px
    fontWeight: 700
    lineHeight: 50px
    letterSpacing: -0.88px
  display-lg:
    fontFamily: Geist, system-ui, sans-serif
    fontSize: 34px
    fontWeight: 700
    lineHeight: 40px
    letterSpacing: -0.68px
  display-md:
    fontFamily: Geist, system-ui, sans-serif
    fontSize: 28px
    fontWeight: 600
    lineHeight: 34px
    letterSpacing: -0.56px
  display-sm:
    fontFamily: Geist, system-ui, sans-serif
    fontSize: 22px
    fontWeight: 600
    lineHeight: 28px
    letterSpacing: -0.35px
  display-xs:
    fontFamily: Geist, system-ui, sans-serif
    fontSize: 15px
    fontWeight: 600
    lineHeight: 22px
    letterSpacing: -0.15px
  body-lg:
    fontFamily: Geist, system-ui, sans-serif
    fontSize: 16px
    fontWeight: 400
    lineHeight: 25px
  body-md:
    fontFamily: Geist, system-ui, sans-serif
    fontSize: 14px
    fontWeight: 400
    lineHeight: 21px
  body-md-strong:
    fontFamily: Geist, system-ui, sans-serif
    fontSize: 14px
    fontWeight: 500
    lineHeight: 21px
  body-sm:
    fontFamily: Geist, system-ui, sans-serif
    fontSize: 13px
    fontWeight: 400
    lineHeight: 18px
  body-sm-strong:
    fontFamily: Geist, system-ui, sans-serif
    fontSize: 13px
    fontWeight: 500
    lineHeight: 18px
  # The metadata voice.
  caption:
    fontFamily: Geist, system-ui, sans-serif
    fontSize: 12px
    fontWeight: 500
    lineHeight: 16px
  micro:
    fontFamily: Geist, system-ui, sans-serif
    fontSize: 11px
    fontWeight: 500
    lineHeight: 14px
    letterSpacing: 0.55px
    textTransform: uppercase
  button-md:
    fontFamily: Geist, system-ui, sans-serif
    fontSize: 13px
    fontWeight: 500
    lineHeight: 20px

# Nested, never uniform: each level is the one inside it plus a step, so a chip
# inside a card inside an overlay stays concentric all the way out. `full` is
# for the things that are actually round — avatars, status dots — and there is
# no pill: a capsule reads as a small button (§Geometry).
rounded:
  none: 0px
  sm: 4px
  md: 6px
  lg: 12px
  xl: 16px
  full: 9999px

# The whole shadow budget, and it is two entries (§Elevation & Depth).
# `lift` stands in for a hairline under the one chip that answers "where am
# I"; in dark it flips to a white-alpha edge ring, because an ink ground
# swallows shade. `overlay` is for things that genuinely float and nothing
# else. Cards, tables and panels are tone-stepped and hairline-bounded.
shadows:
  lift: "0 0 0 1px light-dark(transparent, rgb(255 255 255 / 0.08)), 0 1px 2px 0 light-dark(rgb(0 0 0 / 0.04), rgb(0 0 0 / 0.4))"
  overlay: "0 2px 8px -2px rgb(0 0 0 / 0.06), 0 12px 32px -8px rgb(0 0 0 / 0.1)"

spacing:
  xxs: 2px
  xs: 4px
  sm: 8px
  md: 12px
  card: 14px
  lg: 16px
  xl: 24px
  gutter: 28px
  2xl: 32px
  3xl: 48px
  # The operations panel's sticky header. Named because the header sets its
  # height from it and every other sticky element inside the panel has to
  # clear it (§Layout).
  panel-header: 56px
  # Control heights. `control` tracks the surface (36px, 32px on the operations
  # register); `control-sm` is the compact icon square and is fixed.
  control: 36px
  control-sm: 28px
  touch: 48px

components:
  nav-bar:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    typography: "{typography.body-sm}"
    padding: "{spacing.md} {spacing.xl}"
  nav-link:
    textColor: "{colors.mute}"
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
    borderColor: "{colors.hairline}"
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
    borderColor: "{colors.hairline}"
    typography: "{typography.body-md}"
    rounded: "{rounded.md}"
    padding: "{spacing.xs} {spacing.md}"
  card:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    borderColor: "{colors.hairline}"
    typography: "{typography.body-md}"
    rounded: "{rounded.lg}"
    padding: "{spacing.card}"
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
    borderTop: "1px {colors.hairline}"
    padding: "{spacing.3xl} {spacing.xl}"
  section-tinted:
    backgroundColor: "{colors.canvas-soft}"
    borderTop: "1px {colors.hairline}"
    padding: "{spacing.3xl} {spacing.xl}"
  footer:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.canvas-soft}"
    typography: "{typography.body-sm}"
    padding: "{spacing.3xl} {spacing.xl}"
  badge-positive:
    backgroundColor: "mix({colors.positive} 10%, {colors.canvas})"
    textColor: "{colors.positive-deep}"
    typography: "{typography.caption}"
    padding: "{spacing.xxs} {spacing.sm}"
    rounded: "{rounded.md}"
  badge-warning:
    backgroundColor: "mix({colors.warning} 10%, {colors.canvas})"
    textColor: "{colors.warning-deep}"
    typography: "{typography.caption}"
    padding: "{spacing.xxs} {spacing.sm}"
    rounded: "{rounded.md}"
  badge-negative:
    backgroundColor: "mix({colors.negative} 10%, {colors.canvas})"
    textColor: "{colors.negative-deep}"
    typography: "{typography.caption}"
    padding: "{spacing.xxs} {spacing.sm}"
    rounded: "{rounded.md}"
  # The badge construction at panel scale. Not a card: cards take no tint.
  notice:
    backgroundColor: "mix({colors.info} 14%, {colors.canvas})"
    textColor: "{colors.info-deep}"
    typography: "{typography.body-sm}"
    # Nested in a card or an overlay — an inset panel.
    padding: "{spacing.md}"
    rounded: "{rounded.md}"
    # Standing on the page ground — card scale.
    pagePadding: "{spacing.card}"
    pageRounded: "{rounded.lg}"
  # The notice construction with an outcome hue: what happened, not what to
  # know. `negative` for a refusal, `positive` for a confirmation the reader
  # must act on. Same placement rule as a notice.
  callout-negative:
    backgroundColor: "mix({colors.negative} 10%, {colors.canvas})"
    textColor: "{colors.negative-deep}"
    typography: "{typography.body-sm}"
    padding: "{spacing.md}"
    rounded: "{rounded.md}"
    pagePadding: "{spacing.card}"
    pageRounded: "{rounded.lg}"
  callout-positive:
    backgroundColor: "mix({colors.positive} 10%, {colors.canvas})"
    textColor: "{colors.positive-deep}"
    typography: "{typography.body-sm}"
    padding: "{spacing.md}"
    rounded: "{rounded.md}"
    pagePadding: "{spacing.card}"
    pageRounded: "{rounded.lg}"
  # The error line under a field or a form: text on the ground, no chip.
  field-error:
    textColor: "{themes.light.negative-text}"
    typography: "{typography.body-sm}"
  # Elevation level 3. Dialogs, popovers and menus share one shell.
  overlay:
    backgroundColor: "{colors.canvas}"
    borderColor: "{colors.hairline}"
    typography: "{typography.body-md}"
    rounded: "{rounded.xl}"
    padding: "{spacing.xl}"
    shadow: "shadow-overlay"
  # The same shell at menu scale. Its items reach the corner, so the radius is
  # concentric with them rather than surface-scale — see §Components, Overlays.
  overlay-menu:
    backgroundColor: "{colors.canvas}"
    borderColor: "{colors.hairline}"
    rounded: "{rounded.lg}"
    # A list of items pads xs; a calendar pads its own grid. The panel sizes to
    # what it holds either way — see §Components, Overlays.
    padding: "{spacing.xs}"
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
    # Ink, not mute: an option is the content of the menu, not a label on it
    # (§Typography — the two-step ladder). Only the group header above it is mute.
    textColor: "{colors.ink}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.md}"
    padding: "{spacing.sm} {spacing.md}"
  # The operations navigation column. Deliberately has no surface of its own:
  # no fill, no border, no radius, no shadow (§Layout).
  app-sidebar:
    backgroundColor: none
    borderColor: none
    width: 260px
    # One inset per level, and the two differ so that the brand mark (inset
    # once) and the nav icons (inset twice) share one 16px left edge.
    brandPadding: "0 {spacing.lg}"
    rowPadding: "0 {spacing.sm}"
    listPadding: "0 {spacing.sm}"
  # The content panel — the one elevated surface in the operations layout.
  # Bottom-anchored: gutter at top, left and right, none at the bottom, and the
  # bottom corners are square and off-screen.
  app-panel:
    backgroundColor: "{themes.light.surface-panel}"
    borderColor: "{colors.hairline}"
    borderBottom: none
    roundedTop: "{rounded.xl}"
    roundedBottom: "{rounded.none}"
    gutter: "{spacing.sm}"
    contentPadding: "{spacing.xl}"
    # The header is chrome and the h1 starts the content, so the gap between
    # them is a break between clusters, not a margin.
    contentPaddingTop: "{spacing.2xl}"
    contentPaddingBottom: "{spacing.3xl}"
  # The panel's sticky header. No fill of its own beyond the panel's; separated
  # from the content by one full-width hairline and nothing else.
  panel-header:
    backgroundColor: "{themes.light.surface-panel}"
    borderBottom: "1px {colors.hairline}"
    textColor: "{colors.mute}"
    typography: "{typography.body-sm}"
    height: "{spacing.panel-header}"
    padding: "0 {spacing.xl}"
  # Segmented control — the same "where am I" construction as the sidebar chip.
  # The active chip's faint shadow is the system's one non-overlay shadow.
  tab-segment:
    trackBackgroundColor: "{colors.canvas-soft}"
    activeBackgroundColor: "{colors.canvas}"
    activeTextColor: "{colors.ink}"
    activeShadow: "shadow-lift"
    textColor: "{colors.mute}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.sm}"
    padding: "0 {spacing.md}"
  # Identity mark. The fill and text are the person's identity hue, indexed
  # from their account id — not a fixed pair. Unseeded falls back to neutral.
  avatar:
    backgroundColor: "{themes.light.avatar-*}"
    textColor: "{themes.light.avatar-*-foreground}"
    unseededBackgroundColor: "{colors.canvas-soft}"
    unseededTextColor: "{colors.ink}"
    typography: "{typography.caption} @ 500"
    rounded: "{rounded.full}"
    size: 32px

# Theme-aware roles. The palette above is the fixed brand set; these roles are
# what application code consumes, and each resolves per theme.
themes:
  light:
    # The four surface rungs. Rung 0 is `background`, rung 1 the panel, and
    # rungs 2 and 3 are `muted` and `card` — only the panel needs a new name,
    # the rest are listed in §Elevation so the ladder reads in one place.
    surface-panel: "{colors.canvas}"
    background: "{colors.canvas-sunk}"
    muted: "{colors.canvas-soft}"
    card: "{colors.canvas}"
    foreground: "{colors.ink}"
    # One content step and one secondary step, and nothing between them.
    copy: "{colors.ink}"
    muted-foreground: "{colors.mute}"
    # One hairline tone for every drawn edge in light.
    border: "{colors.hairline}"
    divider: "{colors.hairline}"
    primary: "{colors.brand-deep}"
    primary-foreground: "{colors.canvas}"
    primary-hover: "mix({colors.brand-deep} 78%, {colors.brand})"
    primary-invert: "{colors.brand}"
    primary-invert-foreground: "{colors.ink}"
    primary-invert-hover: "{colors.brand-active}"
    accent: "{colors.brand-pale}"
    accent-foreground: "{colors.brand-deep}"
    selection: "mix({colors.brand} 30%, {colors.canvas})"
    selection-foreground: "{colors.ink}"
    secondary: "{colors.canvas-soft}"
    secondary-foreground: "{colors.ink}"
    secondary-hover: "mix({colors.ink} 6%, {colors.canvas-soft})"
    invert-surface: "{colors.ink}"
    invert-foreground: "{colors.canvas}"
    footer-surface: "{colors.ink}"
    ring: "{colors.brand-deep}"
    scrim: "{colors.ink} @ 45%"
    badge-positive: "mix({colors.positive} 10%, {colors.canvas})"
    badge-positive-foreground: "{colors.positive-deep}"
    badge-warning: "mix({colors.warning} 10%, {colors.canvas})"
    badge-warning-foreground: "{colors.warning-deep}"
    badge-negative: "mix({colors.negative} 10%, {colors.canvas})"
    badge-negative-foreground: "{colors.negative-deep}"
    negative-text: "{colors.negative-deep}"
    notice-info: "mix({colors.info} 14%, {colors.canvas})"
    notice-info-foreground: "{colors.info-deep}"
    badge-active: "mix({colors.brand} 10%, {colors.canvas})"
    badge-active-foreground: "{colors.brand-deep}"
    avatar-sky: "{colors.identity-sky-tint}"
    avatar-sky-foreground: "{colors.identity-sky-deep}"
    avatar-blue: "{colors.identity-blue-tint}"
    avatar-blue-foreground: "{colors.identity-blue-deep}"
    avatar-violet: "{colors.identity-violet-tint}"
    avatar-violet-foreground: "{colors.identity-violet-deep}"
    avatar-fuchsia: "{colors.identity-fuchsia-tint}"
    avatar-fuchsia-foreground: "{colors.identity-fuchsia-deep}"
    avatar-rose: "{colors.identity-rose-tint}"
    avatar-rose-foreground: "{colors.identity-rose-deep}"
    avatar-orange: "{colors.identity-orange-tint}"
    avatar-orange-foreground: "{colors.identity-orange-deep}"
    avatar-lime: "{colors.identity-lime-tint}"
    avatar-lime-foreground: "{colors.identity-lime-deep}"
  dark:
    # Dark climbs all four rungs on its own tones — it has headroom above the
    # card where light has none (§Dark theme). The card ceiling rose to
    # `ink-raised` to make room; `ink-deep` stayed put and is now the container.
    surface-panel: "{colors.ink-panel}"
    background: "{colors.ink}"
    card: "{colors.ink-raised}"
    muted: "{colors.ink-deep}"
    foreground: "{colors.canvas}"
    copy: "{colors.canvas}"
    muted-foreground: "mix({colors.mute} 50%, {colors.canvas})"
    # 9% / 7% — anything stronger reads as wireframe against the ink ground.
    border: "{colors.canvas} @ 9%"
    divider: "{colors.canvas} @ 7%"
    primary: "{colors.brand}"
    primary-foreground: "{colors.ink}"
    primary-hover: "{colors.brand-active}"
    primary-invert: "{colors.brand-deep}"
    primary-invert-foreground: "{colors.canvas}"
    primary-invert-hover: "mix({colors.brand-deep} 78%, {colors.brand})"
    accent: "mix({colors.brand} 20%, {colors.ink-raised})"
    accent-foreground: "{colors.brand-active}"
    selection: "mix({colors.brand} 34%, {colors.ink-raised})"
    selection-foreground: "{colors.canvas}"
    secondary: "mix({colors.canvas} 8%, {colors.ink-raised})"
    secondary-foreground: "{colors.canvas-soft}"
    secondary-hover: "mix({colors.canvas} 12%, {colors.ink-raised})"
    invert-surface: "{colors.canvas-soft}"
    invert-foreground: "{colors.ink}"
    footer-surface: "mix({colors.ink-deep} 60%, {colors.ink})"
    ring: "{colors.brand}"
    # Dimming an ink ground with ink does nothing, so dark reaches past the
    # palette to black.
    scrim: "black @ 60%"
    negative-text: "mix({colors.negative} 60%, {colors.canvas})"
    # Every hue-bearing chip and panel is the same construction: the *deep*
    # mixed into the card, under a light 50% tint of the mid. Never
    # `canvas-soft` — a hue never reaches outside itself for its second colour
    # (§Components — Status badges).
    badge-positive: "mix({colors.positive-deep} 30%, {colors.ink-raised})"
    badge-positive-foreground: "mix({colors.positive} 50%, {colors.canvas})"
    badge-warning: "mix({colors.warning-deep} 30%, {colors.ink-raised})"
    badge-warning-foreground: "mix({colors.warning} 50%, {colors.canvas})"
    badge-negative: "mix({colors.negative-deep} 30%, {colors.ink-raised})"
    badge-negative-foreground: "mix({colors.negative} 50%, {colors.canvas})"
    badge-active: "mix({colors.brand-deep} 30%, {colors.ink-raised})"
    badge-active-foreground: "mix({colors.brand} 50%, {colors.canvas})"
    # A panel, so a step stronger than a chip — the light map's 14-against-10.
    notice-info: "mix({colors.info-deep} 40%, {colors.ink-raised})"
    notice-info-foreground: "mix({colors.info} 50%, {colors.canvas})"
    # Identity swaps its own pair: the deep as ground, the tint as text. 65%
    # against a chip's 30% is what keeps a face off the status hue nearest it.
    avatar-sky: "mix({colors.identity-sky-deep} 65%, {colors.ink-raised})"
    avatar-sky-foreground: "{colors.identity-sky-tint}"
    avatar-blue: "mix({colors.identity-blue-deep} 65%, {colors.ink-raised})"
    avatar-blue-foreground: "{colors.identity-blue-tint}"
    avatar-violet: "mix({colors.identity-violet-deep} 65%, {colors.ink-raised})"
    avatar-violet-foreground: "{colors.identity-violet-tint}"
    avatar-fuchsia: "mix({colors.identity-fuchsia-deep} 65%, {colors.ink-raised})"
    avatar-fuchsia-foreground: "{colors.identity-fuchsia-tint}"
    avatar-rose: "mix({colors.identity-rose-deep} 65%, {colors.ink-raised})"
    avatar-rose-foreground: "{colors.identity-rose-tint}"
    avatar-orange: "mix({colors.identity-orange-deep} 65%, {colors.ink-raised})"
    avatar-orange-foreground: "{colors.identity-orange-tint}"
    avatar-lime: "mix({colors.identity-lime-deep} 65%, {colors.ink-raised})"
    avatar-lime-foreground: "{colors.identity-lime-tint}"
  # The operations surfaces (portal + field) are monochrome — these override
  # the maps above inside `[data-surface="ops"]`; everything not listed
  # inherits, and the semantic status *and* identity colours are deliberately
  # unchanged.
  ops:
    light:
      primary: "{colors.ink}"
      primary-foreground: "{colors.canvas}"
      primary-hover: "mix({colors.ink} 82%, {colors.canvas})"
      ring: "{colors.ink}"
      accent: "{colors.canvas-soft}"
      accent-foreground: "{colors.ink}"
      selection: "mix({colors.ink} 16%, {colors.canvas})"
      selection-foreground: "{colors.ink}"
    dark:
      primary: "{colors.canvas}"
      primary-foreground: "{colors.ink}"
      primary-hover: "{colors.canvas-soft}"
      ring: "{colors.canvas}"
      accent: "mix({colors.canvas} 12%, {colors.ink-raised})"
      accent-foreground: "{colors.canvas}"
      selection: "mix({colors.canvas} 26%, {colors.ink-raised})"
      selection-foreground: "{colors.canvas}"
---

# Palm Villa Design System

**Quiet-utility minimalism.** The reference class is modern product software — tight tables, layered neutral surfaces, decisive solid actions, tiny uppercase labels — applied to a place with a pool. The page is calm and almost colourless; structure comes from **four neutral rungs, each a step away from what it sits on** — app background, panel, container, card — every seam between them drawn with a single 1px `{colors.hairline}`. Depth is a step in tone, never a shadow, and never a coloured band. On the operations surfaces those rungs assemble into a **shell with one surface in it**: the navigation column sits directly on the background with no container of its own, and the content panel is the single elevated sheet — anchored to the bottom of the viewport and bleeding past it, so it reads as continuing below the fold rather than as a card that stops. On the public surface the action colour is **deep lagoon teal**: every primary button is a `{colors.brand-deep}` fill with white text in light (the vivid `{colors.brand}` with ink text in dark) — one striking, saturated solid per screen region, which is what makes the booking site read as decisive *and* branded. The **operations surfaces run monochrome** — ink actions in light, white in dark — because the staff tool (portal and field alike) is its own product and earns its premium feel from restraint rather than brand colour. Elsewhere the lagoon hue stays text-first — eyebrows, key price lines, the logo moment, the checked-in badge — and it never fills a band or a card. Type is Geist, tightened around a 14px body, a **two-step ink/mute ladder** with nothing between the two, and 11px uppercase micro-labels doing the labelling work — with **Fraunces 700 as the display face on public display headlines**, the one place the system spends personality in type, and the portal in Geist throughout for the same reason it is monochrome. Radii nest rather than repeat (6px controls and the nav's active chip, 12px cards, 16px overlays and the content panel's top corners). Semantic colour means status and nothing else.

> **Superseded direction (2026-08-27, v1.0).** The beta direction used aqua-filled primary CTAs, alternating gray/white/pale-aqua/dark marketing bands, 15px body type, 8/12px radii and aqua focus glows. Reviewed against modern product references and recut: too soft, too coloured, too template. Nothing survives except the neutral-base principle, the aqua hue (demoted to brand accent), the semantic status pairs, the Fraunces public display face (dropped in the first recut pass, reinstated 2026-08-28, and confined to the customer surface on 2026-08-31 — see §Typography), and the theming architecture. An earlier alpha (warm sand, Manrope 800, pills) is two generations gone.

> **Surface recut (2026-08-31, v1.1).** The white-ground-plus-hairlines construction was recut to three layered tones. It was right for a marketing page and wrong for a dense one: on a screen of tables, panels, chips and inset figures, every boundary was drawn in the same 12% ink, so nothing said which surface was in front and the portal read as a wireframe of itself. What changed, and nothing else did: the ground drops to `canvas-sunk` so card and panel step up out of it; the two hairline weights collapse to one `{colors.hairline}`; the text ladder loses its middle rung; radii nest (6/10/12/16) instead of clustering at 6/10/14; the neutral ramp goes achromatic; badges take a derived 10% mix and a 6px radius instead of hand-picked pastels and a capsule; the page's shadow budget shrinks to one 4% lift under the chip that says "where am I"; icons drop to a 1.5px stroke. The action colours, the semantic hues, the identity set, Fraunces-on-the-customer-surface, and the theming architecture are untouched.

> **Shell recut (2026-08-31, v1.2).** v1.1 gave the system three tones and the portal used two of them: a `canvas-sunk` ground and white cards. The sidebar and the content region were the *same* surface — the nav column had no fill of its own and was separated from the content only by a hairline — so the chrome never read as chrome, and content simply stopped partway down the viewport where the last table ended, with the ground continuing beneath it. Three things changed. The ladder goes to **four rungs** (app background → panel → container → card), which is what a chrome-plus-content layout needs and what three could not express. The operations layout gains **one elevated surface and only one**: the navigation column stays on the background with no container, and the content panel is a bottom-anchored sheet that bleeds past the viewport. And the **portal topbar is gone** — a full-width bar carrying a breadcrumb and three tools, which severed the sidebar from the content it belongs to; all of it moved inside the panel as a sticky header that spans the panel's width alone. Dark's ladder was widened to hold four rungs (see §Dark theme); light's card and hairline values are unchanged, and the public surface, which has no shell, is untouched.
>
> An intermediate pass gave the sidebar a surface of its own and floated both columns inside a rounded shell — a fifth rung, a 20px container radius and a bottom gutter, all since removed. It read as **two documents side by side** rather than one tool with its chrome beside it, and the bottom gutter closed the panel off at the fold, which made a long table look like it ended there. Both are recorded here because they are the obvious first answer to "give the layout more structure", and the fix for that is fewer surfaces, not more.

The same tokens serve all three surfaces. The public site gets slightly more air and the two sanctioned dark moments (long-term card, closing band); the portal and field screens are the dense subset — tables, forms, badges.

## Color

### Roles
- **Lagoon is the action colour — on the public surface.** `primary` resolves to `{colors.brand-deep}` in light and vivid `{colors.brand}` in dark: filled buttons, the selected state, the focus ring. A screen region has at most one filled-primary button. On locally dark surfaces (the promo card, the closing band) the `primary-invert` roles carry the same construction with the polarity swapped.
- **Two accents, one system.** The **customer-facing surface** — the public site and the booking flow — carries the lagoon accent; that is the brand's pop of personality. The **operations surfaces are monochrome**: the portal *and the field screens*, which are one product on different hardware and are never seen by a customer. There `primary` is ink in light and white in dark, the focus ring and selection follow, and nothing is teal. Only the action roles flip (`primary`, `primary-hover`, `ring`, `accent`, `selection`); every structural role and every **semantic status colour is identical everywhere** — status is meaning, not brand, so the checked-in chip keeps its aqua pair on every surface. Implemented as `data-surface="ops"` on `<html>` — the same mechanism as `data-theme`, so overlays portaled into `<body>` inherit it; the frontmatter `themes.ops` block records the values.
- **Text selection is its own role, not a borrowed accent.** `selection` sits a clear step below every ground it has to appear on — teal-tinted on the customer surface, a neutral gray on the operations surface. It is deliberately *not* `accent`: on ops, `accent` is `{colors.canvas-soft}`, which is also the fill of table header strips, pagination footers and inset panels, so a selection dragged across one of them was invisible.
- **Beyond the primary fill, the lagoon hue is text-first.** `{colors.brand-deep}` doubles as the readable brand text: the hero eyebrow, a key price line. Raw `{colors.brand}` outside dark-ground fills is reserved for small graphic moments (the logo dot, the checked-in badge hue) — never bands, never body text (it fails contrast on white).
- **Four surface rungs, and which one a thing takes says what it is.** `background` (`{colors.canvas-sunk}`) is the **app background** — the surface everything sits on, and the only one that is never an object. `surface-panel` (`{colors.canvas}`) is the **content sheet**: the one elevated surface in the operations layout, and the only thing in it that holds a screen. `muted` (`{colors.canvas-soft}`) is the **container**: table header strips, pagination footers, inset panels, tab tracks, hover and selected chips, and the container a section of cards sits in. `card` (`{colors.canvas}`) is the **card** — a table, a form, a stat tile, the chip that answers "where am I". Every boundary between them is drawn with the one `{colors.hairline}` as well as stepped in tone, so the separation survives wherever two rungs of similar value meet.
- **The navigation column is not a surface, and giving it one was a mistake worth recording.** It has no fill, no border, no radius and no shadow: it sits directly on the app background, which is what lets the background read as a ground rather than as a gap between two panels. Wrapping it in a container of its own — the obvious first answer to "the chrome doesn't read as chrome" — produced **two documents side by side**, where a tool is one document with its chrome beside it. The chrome earns its separation by being *unelevated*, not by being a second sheet.
- **The app background's value is bounded from both sides, and it sits at `#f3f3f3`.** It came up from `#efefef` on 2026-08-31: at 239 it read heavy behind a sidebar that has no container of its own, which is a different job from the one it had as a page ground under cards. Two things fix the ceiling. **The step up to the panel must stay the layout's strongest boundary** — it is 0.036 in oklab L against the 0.024 of the container→card step *inside* the panel, so the outer edge still leads at 1.5×; past `#f4f4f4` it stops leading, and the panel stops reading as the one elevated thing. And it **must stay clear of `{colors.canvas-soft}`**, which it meets on every nav hover: the gap is 0.012 now and only 0.006 at `#f5f5f5`, which is no longer a hover. A literal "5% lighter" in any of the usual readings lands at `#fbfbfb` or above, which inverts the ladder — the background would be *lighter* than the container tone.
- **Lifting the ground buys a sharper edge as it spends tone.** The `{colors.hairline}` bounding the panel is a fixed value, so a lighter background puts more distance between the two: the panel's drawn edge went from 0.021 to 0.033 below the ground as the tone step shrank from 0.048 to 0.036. Tone and hairline trade against each other here, which is why the boundary survives the lift instead of weakening with it.
- **Light runs out of headroom at the top of the ladder, and that is by design.** White is the ceiling, so light climbs background → panel and then *alternates*: a container inside the white panel steps back down to `canvas-soft`, and the cards on it return to white. Dark has room above the card and climbs all four monotonically (§Dark theme). This is the same asymmetry the hairlines already carry, and for the same reason — the rule is *a step away from what it sits on*, not *always lighter*, and only one of the two themes can afford to read it as "lighter" all the way up.
- **An object is whichever tone is a step away from what it sits on.** This is why the same component changes fill with its context rather than owning one: a stat tile standing on the ground is a card, and a panel of figures nested inside that card is gray. Reading a fill as belonging permanently to a component is the mistake that put gray tiles on a gray ground.
- `{colors.ink}` carries headings and the dark surfaces (footer, the two public dark moments); it never fills a button.
- Semantic set is **a 10% mix of the mid hue under deep same-hue text**. The chip ground is *derived* — `mix({colors.positive} 10%, {colors.canvas})` and its three siblings — rather than a named pastel, so moving a status hue moves its chip with it; the four `*-tint` tokens that used to name those pastels are gone. It mixes into `canvas` rather than sitting at 10% alpha so one status is one colour on the card, the panel and the ground alike. The saturated mid hues exist for icons, status dots and the destructive button only. Booking states: confirmed = positive, awaiting payment = warning, expired / cancelled / no-show = negative, checked-in = the brand pair. Aqua is never a success indicator; that is `positive`.
- **The chip's text stays `*-deep`, not the mid hue.** A full-saturation label on a 10% ground is the more striking construction and this system cannot have it. Measured on their own chips, the mid hues hold **2.9:1 (positive), 2.9:1 (warning), 3.4:1 (info) and 4.4:1 (negative)** — badge text is 12px, where AA asks 4.5:1, so all four fail and three fail badly. The `*-deep` pairs on the same grounds run 5.6:1 to 6.9:1. Saturation is spent on the ground; contrast is spent on the text.
- **An error line beside a field is not a chip, and takes `negative-text`.** It stands on the page ground with no fill behind it, so it can borrow neither `destructive` (a fill colour, 3.8:1 as text on the dark ground) nor a badge's foreground (`canvas-soft` in dark, which would render an error in white).
- **Identity colour is a third register, and it is neither brand nor status.** Seven tint/deep pairs (`{colors.identity-*}`) worn by avatars only, in the semantic set's tint + deep-text construction and, like it, identical in both themes, running around the wheel with teal — the customer's colour — the one deliberate omission. Each sits clearly off the status hue nearest it, and form does the rest: a face is a circle with two letters, a status is a pill with a word. A person's hue is *derived from their account id*, so it is stable for the life of the account and the set's order can never be changed. These roles do **not** flip on `data-surface="ops"` — identity is not brand, and the portal is where they live. See §Components — Avatars.
- **Stream colour is a fourth register, and it says *which product was sold*.** The three revenue streams of prd.md §1 — short stay, day pass, tenancy — labelled **Type** on screen. It exists because a booking's stream is neither a state nor a person, and colouring it from the semantic set would have said a day pass is something a booking can *turn out to be*. Three `{colors.stream-*}` hues, **mid only and no tints**, identical in both themes and on every surface.
- **The missing tint is the rule, not an omission.** The other two registers are tint/deep pairs because something sits *on* them — a status word, a person's initials. A stream is only ever a **6px dot beside its own label**, so it needs no ground; and having no tint token means a stream badge cannot be built, which is what stops a row carrying two tinted rectangles where only one of them is the outcome. **Form is what separates the registers**, exactly as it does for identity: a status is a chip *containing* a word, a stream is a dot *beside* one, a person is a circle with two letters. Like a status dot, a stream dot never appears without its label.
- Hues sit **beside** the arcs status already spends, never on them. `stream-day-pass` is the deliberate near-miss — orange ≈25° against warning's amber ≈32°, never literally `{colors.warning}` — and the two genuinely do meet, on a day pass awaiting payment. What separates them there is a saturated point against a pale chip four times its size, the same bet `identity-orange` makes. `stream-short-stay` is indigo rather than a blue nearer `{colors.info}`, and in any case the two never share a register: `info` marks a notice panel and is not a tone a booking status can take.
- **The security deposit is not a fifth register, and the request for one is worth recording.** A purple ground under the deposit was proposed (2026-09-05) so staff could tell it from the other gray insets on a booking screen — the identity document, the transfer slip, the accounting pack. Refused, on three grounds that hold generally. A tint that is *always* there is decoration, and a tint has to mean "look at this". Violet is already worn by an identity hue and indigo and fuchsia by two streams, so another purple would be learned against three. And the stage chip already sits on the inset, so a coloured ground would nest one tint inside another and dull the chip that needed reading. Recognition comes from **form**, as it does for every other register: the deposit's mark is the ledger's `Landmark` glyph beside the micro-label *Security deposit*, standing directly over one three-line figure table — Held, Less charges, the line that is returned or owed — identical wherever a deposit appears (`deposit-figures.tsx`). On the Money card the mark heads the inset; on the deposit screen the section title carries it. The chip keeps the colour, because the chip answers the one question colour is for.

### Accessibility
- Content `{colors.ink}` on the card: 19:1, and 17.4:1 on the ground. There is no third text value to measure — the middle rung was removed (§Typography).
- `{colors.mute}`, the one secondary, has to clear AA on all three surface tones because labels appear on all three: **5.3:1 on `canvas`, 4.9:1 on `canvas-soft`, 4.8:1 on the `canvas-sunk` ground.** That third figure is the binding constraint and is what set the value — a lighter gray of the kind these layouts invite (gray-400, ≈2.5:1) fails everywhere and fails worst exactly where labels are densest. Those three remain the whole list: the rung v1.2 added in light is the panel, which is the card tone, so the ladder grew without adding a fourth ground for `{colors.mute}` to clear.
- Status chip text at `caption` scale. Light (`*-deep` on the derived tint): **positive 6.4:1, warning 6.4:1, negative 6.9:1, checked-in 6.0:1, notice 5.6:1.** Dark (a 50% tint of the mid on the deep mixed into the card): **positive 7.4:1, warning 7.4:1, negative 6.3:1, checked-in 8.8:1, notice 6.1:1.**
- `negative-text`, the inline error line, on the page ground: 6.8:1.
- `{colors.brand-deep}` on white: 6.3:1 — the only aqua that may carry text, and as a fill it carries white button labels at the same ratio. Vivid `{colors.brand}` with ink text (dark-theme primary, `primary-invert` on ink): ~8.9:1.
- Identity hues, deep-on-tint at `caption` scale in light: sky 5.9:1, blue 6.6:1, violet 6.7:1, fuchsia 6.5:1, rose 6.2:1, orange 5.9:1, lime 6.3:1. Dark swaps the pair — the tint as text on the deep mixed 65% into the card — and runs 7.8:1 (orange) to 8.5:1 (lime). `identity-orange-deep` is orange-800, deliberately not amber-800, which *is* `{colors.warning-deep}` — an identity hue must never be literally a status token.
- Verify any new pairing before adding it.

## Dark theme

One fixed palette; **light and dark are two role mappings over it** (see `themes` frontmatter). Application code consumes roles (`background`, `card`, `copy`, `border`, `primary`), never raw tokens.

- **Dark climbs all four rungs; light climbs two and then alternates.** Dark: `{colors.ink}` #111111 app background → `{colors.ink-panel}` #161616 panel → `{colors.ink-deep}` #1c1c1c container → `{colors.ink-raised}` #242424 card, each rung 5–8 points above the last and bounded by a hairline. Light: `{colors.canvas-sunk}` → `{colors.canvas}`, then down to `{colors.canvas-soft}` for a container and back to white for the cards on it, because white is the ceiling.
- **Widening dark was not optional, and it was done at the top.** v1.1's dark ladder spanned #111111 to #1c1c1c — about four points of lightness holding three rungs, which cannot hold four: inserting one more would have put adjacent surfaces two points apart, which is not a step anyone can see. Dark could only go down toward black or up past the card, and there is real room above #1c1c1c. So **the card ceiling rose to `{colors.ink-raised}`** and `{colors.ink-deep}` stayed exactly where it was and became the container — which is why `muted` in dark went *lighter* (from a #161616 mix to #1c1c1c) while every mix built on `ink-deep` kept its base value. The chip, notice and avatar mixes moved with the card to `{colors.ink-raised}`, since their construction is "the hue over the surface the chip sits on"; their measured contrasts move by a fraction of a point and all stay well clear of AA.
- **The action colour shifts register, not hue.** Deep teal on the light ground becomes vivid aqua on the dark one — the primary button is always the one saturated solid on the screen, in both themes.
- **Hairlines invert, and only dark keeps two weights.** Light draws every edge in the solid `{colors.hairline}`; dark uses white @ 9% for a bounding edge and 7% for a rule inside it. The asymmetry is deliberate: in light the tone steps do the ranking and a second hairline weight would be a second thing saying it, while in dark the tones sit closer together and the hairline is carrying more, so the two weights still read.
- **Secondary text lifts rather than inverts.** `muted-foreground` is `{colors.mute}` in light and a 50% lightening of it in dark (~8.4:1 on the ink ground), which keeps it a clear step under white without landing on it.
- **A status chip is a hue against itself, and it never reaches outside that hue for its second colour.** Light: a 10% mix of the mid into `canvas` under `*-deep` text. Dark: the *deep* at 30% into the card, under a light 50% tint of the mid. The two are mirrors — pale ground with dark text, dark ground with pale text — and the same rule carries the identity marks and the notice panels. **What changed on 2026-08-31 is dark's text**, which was `canvas-soft`: white-on-saturated is a harsher, louder pairing than a hue on itself, and a badge is metadata, not a button — the chip that most needed to sit quietly was the loudest thing on a dark row. Taking the text from the hue instead also let the ground go darker, which is what stops a row of chips reading as a string of lights on an ink table.
- **Copying light's construction into dark verbatim is the other wrong answer**, and it was tried the same day. A pale mint chip on a `{colors.ink-raised}` card is a bright patch, and four of them on one row is a christmas tree. A chip should sit *in* the surface it is on; only the hue crosses the theme boundary, never the lightness.
- **Mechanism**: `color-scheme` + CSS `light-dark()`. Light is the default; the OS preference is deliberately not followed (amended 2026-08-27) — dark is an explicit choice via `data-theme="dark"` on `<html>`. The Tailwind `dark:` variant keys to `[data-theme="dark"]` only, never `prefers-color-scheme`.

## Typography

**Geist carries every surface** via `next/font`, with **Geist Mono** as the mono face. Hierarchy is size, weight (400/500/600, with 700 reaching only the two display headline sizes) and negative tracking at display sizes.

**Geist replaced Inter on 2026-08-31.** The scale did not move — sizes, weights, line-heights and tracking are the same tokens — only the face did. Inter was the safe reading of "modern product software" and Geist is the specific one: the same neutral grotesk proportions, drawn tighter and with a little more edge at small sizes, which is where a dense screen spends most of its type. It brings **Geist Mono** with it, so `font-mono` — booking references, bank references, one-time passwords — is the same instrument in a monospaced cut rather than whatever the operating system has (Consolas on Windows, Menlo on macOS, which set the same `PV-6845` at two different widths on two staff machines). Both are variable fonts, so every weight the scale asks for is a real one and the figures are tabular. Fraunces is untouched: the customer surface's display face stays exactly where it was, and the rule that brand face and brand colour travel together stands.

**Text has two steps and deliberately nothing between them.** `foreground` (ink) is what a thing *is* — a heading, a table cell, a paragraph, an amount, a menu item. `muted-foreground` (mute) is what is *about* it — a field label, a column header, a timestamp, an idle nav item, a screen's description. `copy` survives as the name for the first step and resolves to `foreground`.

There were three steps until 2026-08-31, and the middle one never earned its place: it sat close enough to `foreground` that the pair did not reliably read as a hierarchy, and close enough to `muted-foreground` that a label and its value were separable only by weight. A screen carrying all three read as slightly-different-gray rather than as a ladder. Two steps say it once and say it clearly. The practical test when reaching for one: *is this the content, or is it the caption on the content?* Numbers in data contexts always set `tabular-nums`; booking references set in Geist Mono (`font-mono`) at body-sm.

**One sanctioned exception: Fraunces as the display face, on the customer surface only.** The public site is the surface that has to invite rather than operate, and it is where the brand shows personality in type. Fraunces is used for public-site display headlines — the hero `h1` and marketing-section `h2`s, i.e. type rendered at `display-md` and above on `(public)` routes. It inherits the display tokens' sizes, line-heights, tracking **and weight**, which means 700 at `display-lg` and `display-xl` and 600 at `display-md` — both cuts are loaded, for the reason given below. Everything else, on every surface — body, buttons, cards, captions, `display-xs` titles, section headings, micro-labels, **the whole portal**, the whole field surface — stays Geist. The failure mode this rule guards against is the alpha's — a loud face used everywhere at huge sizes — not the existence of a display face.

**The portal's `h1` came off Fraunces on 2026-08-31**, having carried it since 2026-08-28 on the reasoning that the brand voice should follow the journey through the portal door. Three things said otherwise, in order of weight. It is **the same order of gesture as the lagoon hue** — a brand face and a brand colour say the same thing in different media — and the operations surfaces already refuse the hue on the grounds that teal is the customer's; refusing one and spending the other was the rule contradicting itself. At **`display-sm` the face is too small to show the character it is chosen for** — Fraunces is drawn to sing at large optical sizes, so the portal was paying the inconsistency in full and collecting little of the benefit. And a **booking reference is the worst thing to set in it**: `PV-6845` reads as a serif page title above a table that renders the identical string in mono, so one token wore two personalities on one screen. What falls out is a cleaner rule than the exception it replaces — **lagoon and Fraunces are the customer surface; monochrome and Geist are operations** — and one line of the type system now matches the colour system exactly.

| Token | Size | Weight | Use |
|---|---|---|---|
| `display-xl` | 44px | 700 | Public hero only (Fraunces). |
| `display-lg` | 34px | 700 | Public section headlines (Fraunces). |
| `display-md` | 28px | 600 | Public sub-sections (Fraunces on public routes). |
| `display-sm` | 22px | 600 | Portal page titles (Geist, like the rest of the surface); key figures. |
| `display-xs` | 15px | 600 | Card titles; a section heading standing *outside* the object it names. |
| `body-lg` | 16px | 400 | Lead paragraphs (public). |
| `body-md` (+strong) | 14px | 400/500 | Default body; form inputs. |
| `body-sm` (+strong) | 13px | 400/500 | Table cells; secondary body; nav links. |
| `caption` | 12px | 500 | **The metadata voice**: fine print, timestamps, badge text. |
| `micro` | 11px | 500 | **The labelling voice**: uppercase, +0.55px tracking. Table headers, stat labels, eyebrows, and a section heading sitting *inside* the object it names. |
| `button-md` | 13px | 500 | Button labels. |

**Weight 700 belongs to the two headline sizes and stops there.** At 34px and up, 600 reads as heavy body rather than as a headline; at `display-sm` and below, 700 reads shouted on a dense screen. Both Geist (variable, so every weight is real) and Fraunces (600 and 700 loaded as static cuts) carry both, because a public headline crosses that boundary at the `sm` breakpoint and a synthesised faux bold smears the stroke contrast a serif is chosen for.

**`display-xs` came down from 17px to 15px** (2026-08-31). A card title sits directly above 12px metadata, and 17-over-12 read as two unrelated registers rather than as a title and its detail; 15/600 against 12/500 is the tighter step the surface actually wants.

**A section heading takes its voice from where it sits, not from what it names.** The system has two, and the test is one question: *is the heading inside the object, or above it?*

- **Inside** — a form's section header within its card, a card that names itself, a column header, a stat label, the result count on a control line — is a **label** on the contents around it, and takes `micro`. It has no surface of its own and does not need one; it is part of the object it sits in.
- **Outside** — a heading on the page ground naming the card or table beneath it, like the dashboard's "Arrivals today" — is a **heading** for an object it does not live in, and takes `display-xs`. At `micro` it would detach: on a white panel a small grey label above a white card reads as floating, and the card below looks untitled.

**A card that names itself has a title line, and two things may share it.** The `micro` label sits at the left; **a hint** — the section's explanation, for a section whose behaviour is not obvious from its contents — is a 14px info glyph beside it opening a tooltip, and **the one action that acts on the section as a whole** ("Add note") sits opposite as a `tertiary` button. The hint is a tooltip rather than a paragraph under the content because the explanation is read once and the section is read every day, and a standing paragraph of fine print on a short section made the section mostly fine print; the glyph is focusable so the text is reachable from the keyboard, and it sits *beside* the heading rather than inside it so the heading's accessible name stays the title. An action on the title line is the record screen's equivalent of the list screen's control-line slot: it is found where a reader looks for it, and the section's body stays the section's content — which is what let the notes composer stop standing open on every booking and become a dialog. At most one of each; a title line with two buttons on it is a toolbar, and belongs on a control line.

Both readings were in use with no rule choosing between them, which is how one screen ends up labelling in two voices. Nothing moved when the rule was written down (2026-08-31) — the screens had already sorted themselves this way — but the next screen now has an answer.

The `micro` token is what makes surfaces read as engineered: everywhere a label names a region of data (column header, form section, stat, metadata key), it is 11px uppercase mute — never a bolded body size. The portal never uses display sizes above `display-sm`. Field screens use the same scale; legibility comes from spacing and touch-target size, not larger type.

## Layout

- **Base unit 4px**; token scale in frontmatter. Public bands pad `{spacing.3xl}` vertically; card interiors are `{spacing.card}` (14px), with `{spacing.xl}` reserved for marketing cards that carry media.
- **Spacing is tight inside a cluster and loose between clusters**, and the two named measures exist to keep that ratio honest: `{spacing.card}` (14px) inside a card, `{spacing.md}` (12px) between sibling cards, `{spacing.gutter}` (28px) between one cluster and the next. Card interiors were 16px against a 12px gap, which is near enough to equal that a row of cards read as one evenly-spaced field rather than as separate objects.
- Public marketing container centres at ~1120px. Portal content is full-width to ~1440px inside the panel.
- **The operations shell is two columns and one surface.** The shell is exactly a viewport tall (`h-dvh`, not `h-screen` — `100vh` runs under a phone's browser chrome and there is no window scroll here to absorb it) and clips. The **navigation column** is 260px, full height, and takes no surface: no fill, no border, no radius, no shadow (§Color). The **content panel** is the remaining column and the only elevated thing in the layout — `surface-panel` with a 1px hairline.
- **The panel is bottom-anchored and bleeds past the viewport.** It takes a `{spacing.sm}` gutter at the top, at the left (between it and the sidebar) and at the right, and **none at the bottom**: its top corners are `{rounded.xl}` and its bottom corners are square and off-screen, so they are never seen. It carries no bottom border for the same reason — a hairline ruled across the foot of the screen would contradict the bleed and close the sheet off at the fold, which makes a long table look like it ends there.
- **Scrolling belongs to the panel, not the window.** The panel owns `overflow-y-auto`, so the sidebar never scrolls away and the panel's header can stick to the top of the *content* rather than to the browser. The panel's outer box keeps `overflow-hidden` so the rounded top corners clip whatever passes under them; the scrolling box is inside it. The content region carries `{spacing.3xl}` of bottom padding, because nothing else stops the last row of a table from sitting flush against the viewport edge at the end of a scroll.
- Below `lg` the gutters and radii drop away and the panel goes edge-to-edge: a rounded corner against the viewport edge reads as a rendering error, and on a phone the gutter is width the content needs. The sidebar becomes a drawer, opened from the panel header.
- Field screens are single-column, mobile-first, thumb-reach ordering.
- **Sections separate with hairlines, not colour.** The public page is a continuous `canvas` surface laid over the ground; a `section-tinted` (`canvas-soft`) band may appear at most once per page for rhythm. The dark moments (long-term card, closing band) are the only other departures.
- **Portal rhythm clusters; it never spreads evenly.** Tight inside a section — a heading sits `{spacing.md}` above the table it names, the way a `micro` group label hugs its menu items — and a full `{spacing.2xl}` between sections. Uniform `{spacing.xl}` gaps everywhere read as a wireframe: when every distance is the same, nothing belongs to anything.

### Breakpoints
| Name | Width | Key changes |
|---|---|---|
| Mobile | < 768px | Everything stacks; grids 1-up. |
| Tablet | 768–1023px | Grids 2-up. |
| Desktop | ≥ 1024px | Portal nav expands; grids full. |

### Control heights & touch targets
Standard control height is **36px** (buttons, inputs, selects) on the customer surface. The **portal** tightens the same controls to **32px** — next to its 30px nav rows, 36px controls read padded — via the `--spacing-control` override on the operations register, so buttons, inputs and tab tracks stay one height. On **field screens** every interactive element is ≥ 48px tall and row-level primary actions render full-width in the `touch` size.

**An icon-only button is one of two sizes, and the question is what it sits beside.** A square that takes its place *in a row of controls* — a `size="icon"` button, a pagination chip, the search and notification buttons in the panel header — is `{spacing.control}` and moves with the surface, because it has to line up with the inputs and buttons next to it. A square that is *chrome on something else* — an overlay's close, a calendar's month arrows, the theme toggle's pips — is `{spacing.control-sm}` **28px**, fixed, because what sizes it is the thing it sits in rather than the surface's control height, and at a full control height it would compete with the content it belongs to. These were five different ad-hoc numbers (24, 26, 28, 32, 34) until 2026-08-31; there are two now, and a third is a sign the question was answered wrong.

## Elevation & Depth

| Level | Role | Light | Dark | Use |
|---|---|---|---|---|
| 0 — App background | `background` | `canvas-sunk` | `ink` | The surface everything sits on, the operations navigation column included. Never an object. |
| 1 — Panel | `surface-panel` + hairline | `canvas` | `ink-panel` | The operations content sheet — the one elevated surface in that layout. |
| 2 — Container | `muted` + hairline | `canvas-soft` | `ink-deep` | Table header strips, pagination footers, inset panels, tab tracks, hover and selected chips, and the container a section of cards sits in. |
| 3 — Card | `card` + hairline | `canvas` | `ink-raised` | Tables, forms, stat tiles, the "where am I" chip — with `shadow-lift` on that chip alone. |
| 4 — Overlay | `card` + hairline + `shadow-overlay` | `canvas` | `ink-raised` | Modals, popovers, menus, drawers, toasts, tooltips — anything that floats. |

**Depth is a step in tone, and the hairline draws the seam.** A card, a table, a panel never carries a shadow: it is a tone away from what it sits on, bounded by the one hairline. That is what makes the surface read as layered rather than as drawn. **A rung is a position, not a colour** — in light, levels 1 and 3 are both white and level 2 sits between them, which is the ladder alternating at its ceiling rather than two rungs collapsing (§Color). The seam is what keeps them legible, so a container and the card on it always carry their hairline even where a tone step alone would have been enough.

**Level 0 is a ground, and a ground is what a thing is *not* elevated onto.** The operations navigation column takes it directly and draws no edge of its own — it has no fill to bound and no shape to describe. The temptation is to give the chrome a surface so that it reads as chrome; the layout reads better when the chrome is the one thing that *isn't* a surface.

**The page's whole shadow budget is `shadow-lift`** — a single `0 1px 2px` at 4% black — and it is spent on one thing: the chip that answers *where am I*, in the sidebar and in the segmented control. It stands in for a hairline rather than adding to one, so the current item is felt to be in front without an edge drawn around it competing with the rules that structure the surface. Dark grounds swallow shade, so there the lift flips to a white-alpha edge ring over deeper black. Nothing else in the page may borrow it.

**`shadow-overlay` survives for things that genuinely float**, recut much quieter to sit in a flatter system. A menu, a select panel, a popover and a tooltip open with no scrim behind them and in the same `canvas` as the card they cover, so tone-layering is unavailable and 4% of shade is invisible at that size — the hairline alone would be carrying the entire claim that the thing is in front. That is the case the shadow exists for, and the only one.

Overlays sit over a `scrim` (ink @ 45% in light; black @ 60% in dark, because dimming an ink ground with ink does nothing) and take `{rounded.xl}` 16px, a hairline and `shadow-overlay`. Three exceptions: **menu panels** — select, dropdown, multi-select and both date pickers — take `{rounded.lg}` 12px, because they open out of a control and have to look like they belong to it (§Components — Overlays); **edge-anchored drawers** drop the radius on the edges they meet, a rounded corner against the viewport edge reading as a rendering error; and **tooltips** take the control radius on the polarity-flip surface, because at caption height a 16px corner reads as a pill.

### Motion
Overlays fade and zoom in at ~150ms; drawers slide (300ms in, 200ms out). Motion stays on `opacity` and `transform`. Every animation is suppressed under `prefers-reduced-motion` — the element appears in its final state rather than moving.

## Components

**Buttons.** `primary` (the action colour: lagoon on the customer surface, ink/white on the operations surfaces — see *Two accents, one system*), `secondary` (panel fill), `tertiary` (card fill, hairline), `ghost`, `destructive`, and `inverted` (the `primary-invert` construction for dark surfaces). Radius `{rounded.md}` 6px; height 36px (portal 32px, field `touch` ≥ 48px); label `button-md` 13px/500. One primary fill per screen region. Focus is a 2px ring in the action colour. Hover is a fill step on the button's own role — `primary-hover`, `secondary-hover`, `muted` under a tertiary or ghost — never a heavier hairline and never a colour borrowed from another role. A primary **create** action leads with a plus glyph — "+ New booking" — never a bare verb-noun label. An **edit form's Save is dirty-gated**: disabled until the draft actually differs from what is saved, so an idle click cannot fire a no-op write or its audit event. Create forms stay enabled — they are never a no-op.

**Cards.** One card idiom: `canvas`, `{rounded.lg}` 12px, 1px hairline, `{spacing.card}` 14px interior, no shadow. `card-inset` is the gray panel — fine print, deposit notes, grouped stats. The overlay components earn their feel from nesting one surface inside another, and a page card with no interior surface at all (no inset, no header or footer strip, no rule) is usually a card that has not been designed yet.

**A gray panel takes its radius and padding from where it sits, not from what it is** — the same rule as a notice, and for the same reason: the radius scale measures *scale*, not component. Nested inside a card it is an inset at `{rounded.md}` with `{spacing.md}`; standing on a white ground it is card-scale at `{rounded.lg}` with `{spacing.card}`, because it fills a card's slot beside real cards, where 6px reads as a control that grew. Nested is the default, and on the operations surfaces it is now the only case (below).

**A gray panel cannot stand on the page ground, because the ground is greyer than it is.** Since the surface recut, `canvas-soft` on `canvas-sunk` is a *lighter* patch of almost the same value — it reads as a smudge rather than as an object. So on the portal and field surfaces the object standing on the ground is the **card**, and gray keeps its real job: nested inside one, where it still reads at a clear step. The rule generalises to *an object is whichever tone is a step away from what it sits on* — which is why a page-scale gray panel is still correct inside a public `canvas` section, and wrong on the portal.

**A stat strip is one tile per figure, and it takes no container.** The tiles are **cards** sitting directly on the ground (they were gray panels until the ground inverted — see above). A card *around* them was a box drawn around four boxes — the outer hairline bounded nothing the tiles were not already bounding, and it opened the screen with a panel of chrome. What the tiles replaced was worse still: four labels adrift on one wide surface split by dividers, which reads as a spreadsheet header rather than four objects. `card-dark` (ink) is the public site's promotional moment, used at most twice per page. There are no tinted feature cards — colour is not a card treatment. Interactive cards signal hover by strengthening the hairline and a 1px lift, never a shadow.

**Inputs.** White, hairline, `{rounded.md}` 6px, `body-md` 14px, height 36px (portal 32px), horizontal padding `{spacing.md}`. Focus: the border strengthens to the action colour plus a faint same-hue halo (`ring`) — decisive, not a glow. Labels are `body-sm-strong` ink. Field-screen inputs use the `touch` size.

**Dropdowns.** One dropdown, two dresses, and both open the same overlay shell. The **form dress** is the default: the trigger *is* an Input — same height, hairline, `{rounded.md}`, `body-md`, same focus treatment — so a closed select and a text field in one form row are indistinguishable until you open one. Its only addition is a 16px mute chevron, which turns over on open. The **filter dress** is the chip described below. Inside, the panel takes the overlay shell and its options are *controls*: `{rounded.md}` 6px, `body-sm`, `muted` fill on focus, a right-aligned check on the chosen one — identical to a menu, because a select panel and a menu are the same object with different jobs. **Selection is a weight shift, never a colour**: the chosen option goes ink at 500. Group headers are `micro`, like every other data-region label. The panel opens at least as wide as its trigger, grows to fit its content, and scales out of the trigger's own corner so the two read as one control. A leading ornament — a status dot, an icon — sits *beside* the option's text, never inside it. **There is no native `<select>` left in the product.** The OS picker was kept for a while on the plain-HTML forms, on the grounds that a staff desktop can live with it; what that actually bought was two dropdowns on one screen opening two different objects, one of them carrying no token from this system. A drawn select submits through a hidden native field, so a `method="get"` form loses nothing by using it.

**Filter rows.** A list screen's filters are a **row of chips above the table**, not a card of labelled fields with an Apply button: a filter *reports* a value where a form field *asks* for one, and it has to be readable from across the row. So the field's name lives inside the control and an unset filter shows only its name; a set one fills with `canvas-soft` — the selected-chip language of the sidebar and the segmented control — steps the name back to mute and puts the value in ink at 500. Filters apply on the click that made them and are **URL state**, so a filtered list can be bookmarked and sent on. A `Clear` ghost closes the chips when anything is set. **A search field leads the row** on every list screen — a glyph where a chip has its name, the same height and hairline — and it is a filter like the rest: URL state (`?q=`), applied on the server, carried by every tile and by the footer, emptied by Clear. It applies on a pause in typing rather than on every keystroke, and on Enter at once; it searches the handful of fields a staff member identifies a record by — reference, guest, phone, unit — as a case-insensitive *contains*, which is the question somebody holding half a reference is asking. The date chip is labelled **Stay date**, and a table's stay column with it.

**The row is the screen's control line**, and it reads left to right as *what is being shown* then *what can be done about it*: chips on the left; on the right, the result count in `micro` mute — the answer to "did that do anything" — and then the screen's create action. The list screen's single primary fill lives **here, not in the page header**: the header carries the title and the sentence explaining the screen, and a filled button beside them competes with both. A header keeps its actions only on screens with no control line.

**A destructive action outside a menu keeps its red, but not as a fill.** `destructive-tertiary` is the `tertiary` chrome carrying destructive *text* — exactly the weight `DropdownMenuItem variant="destructive"` has, so moving an action out of a `…` menu and onto the page does not change how loud it is. The filled `destructive` stays reserved for the confirmation footer, where the irreversible click actually happens: two red fills on one path, the first of which only opens a dialog, is how a warning stops being read. The units board's "Take out of service" is the case.

**A screen with nothing to create may still put an action in that slot, quietly.** The units board has no create action — units arrive through the registry screen, not from the board — but it does need a way *to* that screen, so a `tertiary` button with a settings glyph sits after the count where the primary fill would be. `tertiary` rather than a fill because it is a rare, deliberate errand and not the screen's point; in the control line rather than the header because the rule above does not bend for a button that happens to be quiet, and level with the `h1` it would have been the loudest thing on a screen whose subject is the table. **The deposits ledger has neither** — a deposit is recorded at check-in, and there is nowhere else to go — so its control line is the chips alone, and the slot on the right stays empty rather than holding something to fill it. Its chips are **Stage** and **Staying**: Stage offers the three stages a *held* deposit can be in and not "released", because released deposits are a different set read by a different query — a *view* (`?show=`), reached by the Owed tile or by its address — and a chip mixing "in house" with "released" would be asking for two reads stitched into one list. Staying narrows either set, so it rides along with a change of view.

**A filter may take several answers.** Where "confirmed *and* checked in" is a real question, the chip opens a menu of checkboxes rather than a select — the product's own checkbox, not a lookalike — and **choosing does not close it**, because three answers should cost three clicks and not three trips through the trigger. Nothing selected means *no filter*, so there is no "Any" option to choose: an unset filter already is any. A `Clear <field>` row appears at the foot of the panel only once something is on. The chip names the first answer and counts the rest — "Confirmed +2" — rather than showing a bare count, because the first label is usually enough to recognise the filter you set.

**Date range.** A span of dates is **one control, not two fields**: a chip in the filter dress opening a **two-month calendar**, where the first click sets one end and the second sets the other, in either order. There is no Apply — the second click is the answer — and no way to express a range that ends before it starts, a half-filled pair, or a typo. Two months because the common question ("arriving over the next few weeks") straddles a month boundary; below `md` the second drops away and its arrow moves to the first. Both ends are **inclusive** — the days pointed at are the days meant; the half-open occupancy convention is converted at the query boundary, never in the picker.

**A rail of named spans** sits beside the grid on a `divider` hairline — Today, Tomorrow, Next 7 days, This month, Next month, Last month, weighted forwards because a bookings list is read to answer "who is coming". A preset is a shortcut to the same value the grid produces, never a separate mode: it is matched by value, so hand-picking exactly this month shows "This month" as selected. Selected is the `canvas-soft` chip, like every other "where am I".

**The grid is Monday-first, always six rows, and has no holes in it.** Every cell carries a real day — the spill from the neighbouring months included, muted but fully selectable, and clicking one brings its month into view. Blanks were wrong twice over: a half-empty first row reads as a rendering fault, and a range crossing a month boundary broke into two bands with a gap where the week actually continues. Day cells are **36px** rather than the portal's 32px control: seven of them sit shoulder to shoulder, and at 32px the numerals read squashed. Weeks are separated by a 3px vertical gap and nothing horizontal — the band across a week stays one continuous strip, while stacked weeks stop reading as a solid block. The numeral is optically centred and stays centred — the today mark is taken out of the flow, never stacked under it.

**A day is one of two shades: the month's own, and the spill.** The grid tried three — spill, resting, and emphasised (today, hover, a chosen end) on `mute` → `copy` → `ink` — and the bottom two were indistinguishable in use: `copy` and `mute` are 1.8:1 apart on white, which is not enough for two 14px numerals sitting one cell apart, while the step above them was twice as wide. So the month's own days take `ink` outright and the spill stays `mute`: **3.7:1 between them in light, 3.2:1 in dark**, with both shades still clearing AA. Emphasis does not need a third shade, because none of the emphasised states were relying on it — today has its dot and its weight, a hovered day has the surface, an end mid-pick has its drawn chip, a chosen end is a fill. **Dark takes the spill at 80%** of `muted-foreground`, which there is already lifted toward `{colors.canvas-soft}` and would otherwise land too near white on an ink ground. A day's colour is resolved to **one** class, never layered: a base utility and a `dark:` one for the same property both survive `tailwind-merge` and let source order pick the winner.

Visually the rest is existing language: the band between the ends is `canvas-soft`; the two ends are the action fill (ink on the operations surfaces, never teal), and **both selected treatments pin their own hover** — the row's generic hover colour is not a conflict a class merger resolves, and left unpinned it lands ink text on the ink fill; a selection still in progress shows its far end as a **drawn white chip with a hairline** — pagination's "you are here" — so provisional and committed never look alike; **today is a dot beneath the numeral**, not a colour. A footer bookends the grid on the same hairline, naming the range or, mid-pick, the end already chosen.

**Single date entry** is the same grid in the form dress — the range picker's twin, not a different control. Closed, it is an Input to the pixel: same height, hairline, `{rounded.md}`, `body-md`, same focus treatment, so a date field and a text field in one form row are indistinguishable until you open one. **Its ornament is a calendar glyph, not the select's chevron** — a chevron promises a list, and the two controls sit in the same forms, so the glyph is the one honest place to say which is which. Open, it is the overlay shell around **one** month of the shared grid; a second month would be offering a span this control cannot express. The value reads as a date and not as digits — `12 Sept 2026`, the phrasing the range chip and the booking summary already use — and typing is not offered, because the whole reason the control exists is that a calendar cannot express 31 February, a transposed month, or a day outside the booking window, where a text field can express all three and would need each of them validated and explained.

**`min`/`max` survive as bounds on the grid.** A day outside the window is drawn and not offered — visible, so a reader can see the 3rd exists and is simply not bookable, rather than finding a hole in the week — and a month arrow retires once there is nothing selectable past it. Keyboard motion clamps at the edge instead of stopping dead. The footer carries at most two things, on the range picker's hairline: a **Today** shortcut, offered only when today is inside the window and is not already the answer, and **Clear** on the fields that may be empty. A required field is never clearable, so it always holds a value.

The native `<input type="date">` this replaced was ours only until it was clicked: the closed field carried the input treatment, and then Chrome, Safari and Firefox each drew a different calendar, none of them agreeing with the two-month picker one screen away on the bookings filter.

**The public availability calendar (A1)** is a different component from the range picker above — it carries per-night price and availability — and must be specified here before it is built.

**Portal forms.** A form is one card, never a stack of sibling cards: sections divide with hairline rules and take `micro` headers in mute. Fields size to their content (a two-digit count gets ~150px, not a row). The itemised price sits beside the form in a sticky card — figures `tabular-nums`, total at `display-sm` — carrying the screen's one primary button. Stat readouts render as `micro` label over `display-xs`/`display-sm` figure.

**Status badges.** `{rounded.md}` 6px, `caption` (12px/500), `{spacing.xxs} {spacing.sm}` padding, a derived 10% chip under `*-deep` text. Small and quiet — a badge is metadata, not a button.

**Not a pill** (recut 2026-08-31). The badge was the last rectangle in the product wearing a capsule radius, kept on the reasoning that a fully round end is unmistakably *not* a button. At badge scale it reads the other way round — a capsule is the shape of a small button — so the one component that most needed to look inert looked most like a control. At 6px it shares its geometry with everything else on the row and the tint carries the meaning. **Round things are now only the things that are round**: avatars and status dots.

**A unit's status badges** (added 2026-09-02, with the units board). A unit's state is mostly its occupancy's state, so most of these are the booking tones read through from the other side of the same fact: `held` keeps `warning`, `booked` keeps `positive`, and `occupied` keeps the brand pair `checked_in` carries, because it *is* checked-in seen from the unit. Two are new: `out_of_service` takes `negative` — a unit nobody can be put in is the one state on that board that costs money until somebody fixes it — and `leased_long_term` takes `neutral`, because a lease is a settled arrangement rather than something to act on.

**`available` is `neutral`, and that is the decision worth recording.** Green is the obvious choice and it is wrong. Availability is the *resting state* of a building: forty of forty-eight units are available on an ordinary morning, and forty mint chips is a wall of colour in which the four rows that need attention vanish. Colour is spent on the exceptions, which is the same reason §Color roles forbids decorative status — a tint has to mean "look at this". No fifth tone is introduced either: the set is built as a 10% mix of a mid hue under `*-deep` text, there is no `info` badge pair to reach for, and minting one for a status is exactly what that section refuses. The mapping lives in `unit-status-badge.tsx`, which owns it the way `booking-status-badge.tsx` owns the other — two tables, one palette, and `status-tone.ts` holds the vocabulary they both map into.

**Status dots.** The status hue at icon scale: a 6px dot in the **mid** hue — the icon register the semantic set reserves for exactly this — beside a label naming a state. It is the badge's meaning compressed to a point, for the places a pill would shout: the leading ornament on a filter option, the mark on a `micro` stat label whose figure counts bookings in that state. A dot never appears without its label (a bare dot is a mystery, not metadata), never marks a figure that is a capacity or a sum rather than a state count, and — like every status colour — is identical on the monochrome operations surface, the checked-in aqua included. One component (`StatusDot`), taking its tone from whichever badge module owns that mapping — bookings have one table, units another — while `status-tone.ts` holds the five tones themselves. The dot knows how to draw a tone small and nothing about what any status means.

**Notices.** A sentence the reader needs before acting — what a transfer hold means, what a screen does *not* calculate, what is collected on arrival — in the `info` blue at `{rounded.md}`, with an `Info` mark. It is the badge chips' tint/deep construction at panel scale, and it is **not a card**: cards take no tint, and a notice is a different object. `info` is the fourth status hue and the only one that is never an outcome — the other three report how something turned out, this one says what to know first. It is a **light sky blue** (≈208°, 95% S, 92% L): high chroma at *high* lightness, which is what makes a panel read bright and friendly rather than administrative. Chroma is what stops it looking like another gray; lightness is what stops it looking heavy — an earlier pass darkened the ground to give it presence and got a corporate blue instead. `info-deep` sits at the tint's own hue rather than a navy, so the panel reads as one colour, and holds 5.4 on it. The mark carries no colour of its own: the icon takes `currentColor`.

**A notice takes its radius from where it sits, not from what it is.** The radius scale measures *scale* — 6px controls, 12px cards — so a notice nested inside a card or a dialog is an inset panel at `{rounded.md}` with `{spacing.md}` padding, and one standing on the page ground is card-scale at `{rounded.lg}` with `{spacing.card}`. Both readings fail if you pick one and apply it everywhere: 12px inside a 12px card reads as a mis-drawn edge, and inside a 16px overlay the geometry stops being concentric, while 6px in a page slot beside real cards reads as a control that grew. A notice is the one tinted panel that *can* still stand on the ground, because its fill is a hue rather than a step of gray. Nested is the default, because most notices are. Still kept off cyan deliberately — a cyan panel reads teal on an ink ground, and the operations surfaces do not carry teal; going bluer moved away from that edge, not toward it.

**A notice is not an alert.** Its mark is `aria-hidden` and it carries no ARIA role — the sentence already says everything the mark does. What interrupts a screen reader is the `role="alert"` error line beside the field that failed, and that stays the `negative` pair.

**Callouts.** The notice construction with an outcome hue: a write that was refused, a one-time password that was set. Where a notice says *what to know before acting*, a callout says *what happened* — which is why it takes an outcome hue (`negative`, `positive`) and a notice never does. Same tint-under-deep-text at panel scale, same mark-beside-the-sentence, same placement rule for its radius and padding (`{rounded.md}` `{spacing.md}` nested; `{rounded.lg}` `{spacing.card}` on the page). One component (`Callout`) — it had been hand-rolled on six screens, on two paddings. A callout standing in for a form's rejection carries `role="alert"`; one stating the screen's condition ("choose a unit to see the price") does not. A transient confirmation is a toast, not a callout.

**Error lines.** The message under a field that failed, or under a form that was refused, is `body-sm` in `negative-text` with `role="alert"` — one component (`FieldError`). `negative-text` is the role built for text standing on the ground with no chip behind it, and it is the only candidate that clears AA in both themes: `destructive` is a fill colour (3.8:1 as text on the dark ground), and `negative-deep` is a raw palette token that does not survive the flip. `body-sm` rather than `caption`, because an error is something the reader has to act on, not metadata about the field; the hint line beside it stays `caption` mute so the two voices never merge.

**Gray is still the panel for figures.** The `canvas-soft` inset holds grouped stats and fine print attached to a number — a deposit line, a variance summary. The two were one treatment until the notices took the colour; if a panel is a table of values rather than a sentence that changes what someone does, it stays gray.

**Tables (the portal's signature surface).** A card-fill, hairline-bounded container at `{rounded.lg}` with `overflow-hidden`; header row on `canvas-soft` in `micro` mute — the panel step inside the card, which is where gray reads best; body rows `body-sm` with `divider` rules; cells pad `{spacing.md} {spacing.lg}` vertically tight. Reference and money columns set `tabular-nums`. Row hover is a whisper of `canvas-soft`. This is the payment queue, arrivals list, and every list screen.

**A register holds more than one kind of record, so its columns are what every kind has.** The bookings list carries three revenue streams — the column is headed **Type**, which is the word the staff reading it use; *stream* is prd.md §1's word and stays in the schema and the URL, where `?type=` already means a unit type on the booking form — and only one of them occupies a unit — so the two date columns became one **Dates** cell (`14 → 16 Sept 2026`, with the nights under it in `caption` mute), and **Nights** became **Guests**, which every stream has. What a row cannot answer is an **em dash in mute carrying a `title`** naming why ("Occupies no unit"), never a blank: a blank reads as a rendering fault, and a bare dash is only obvious to whoever wrote the schema. **A record's identity may stack inside one cell** where two columns would be two labels for one thing — the guest's name in ink over their number in `caption` mute — which is what a screen header already does with `meta`, and what keeps a ten-column register from wrapping six of them. Everything that must not break mid-value takes `whitespace-nowrap`; a phone number or a date range split across two lines stops being scannable, which is the only reason the column exists.

**A row that opens a record ends in a chevron.** 16px, mute, `aria-hidden`, in a `w-0` column whose header is `sr-only` — the stretched `TableRowLink` has already announced the row properly, so the glyph is affordance and not data. It follows the row's hover to ink, the way the sidebar's icons follow their item. A visible header over it would claim the arrow is a column of values.

**A stat tile can be the way into what it counts.** Where a strip breaks a list down — bookings per stream — each tile is a link that sets that filter, because someone who reads "6 day passes" wants those six and should not have to find a chip saying the same word. Clicking the current tile *clears* the filter rather than reapplying it, or two of three tiles become one-way doors. It stays a **card on the ground with `card-interactive`** — the 1px lift and strengthening hairline, never a shadow — and the current one keeps that stronger edge instead of taking a fill: a gray tile on the sunken ground reads as sunk, not as selected. The figures are the breakdown of the *filtered* list **minus that filter itself**, so choosing one stream leaves the other two readable. **The strip sits directly under the header, above the control line** — reversed on 2026-09-04, when it sat below the chips on the argument that a summary changing above the control that changed it reads as two things moving. In use the tiles read as the *answer*, not as an effect: they are the figures a reader came for, they belong with the title, and a strip wedged between the chips and the table separated the control from the rows it narrows. So every list screen reads the same way down the page — *what is here* (the strip), *what you are looking at* (the chips), *the rows* — and the deposits ledger, which had always led with its liability figure, is no longer the exception. **A tile that is the whole, not a breakdown — the ledger's "Total held" — is not a link at all**: the unfiltered list is what it counts, so it has nothing to narrow to and is never current. It used to be a link that was always current, which drew the strongest hairline on the screen around a figure nobody had chosen. Each tile takes the **stream** dot for what it counts — a `Stat` dot marks a figure counting records of one kind, and these do, but the kind is a category rather than a state, so it comes from the stream register and never from the semantic one. That is what stops a "day pass" tile borrowing the amber that means a payment is outstanding.

**Matrix tables.** A table whose *rows* are the subjects and whose *columns* are attributes — the roles screen's sixteen permissions across five roles. It is the ordinary table chrome with four additions, and it is the shape to reach for whenever a screen's real question is comparative ("who can verify a payment?"), because a one-at-a-time switcher answers that only by being visited once per column and remembered. **The identifying column is a `<th scope="row">`** (`TableRowHead`) at cell metrics, not header metrics — it sits in the body. **Group headings are a row of their own**: the group's name in `micro` mute on the card fill with the divider above it and none below (`divide-y` rules each row along its bottom, so the label's own bottom rule is suppressed or it reads as a boxed heading). That is `FormSection`'s grammar, deliberately not a second `canvas-soft` strip — the header is the only gray. **Layout is fixed, not auto**: auto layout hands the slack to the widest column and strands every control a hand's width from the label it belongs to, so the columns are declared and the **container takes its width from the table** (`w-fit`) rather than capping at the same number — a `max-w` is a border-box, so capping at the table's width leaves a content box two hairlines narrower than the table and puts a scrollbar under a matrix that fits. `max-w-full` is what makes it scroll when the panel really is too narrow, and there **the identifying column pins** (`Table scrollX`, `sticky left-0`); a pinned cell needs an opaque fill and its own `group-hover` tint, since the row's hover would otherwise pass behind it. **A screen's action aligns with the right edge of the surface it acts on, not the panel's.** On a full-width table the two coincide, which is why the Staff tab's "+ New staff account" never looked like a decision; on a constrained surface they do not, and a Save pinned to the panel edge reads as floating loose of the table it writes. The whole cluster — status line, action, any callout, the table — takes one declared width, so they share an edge by construction rather than by two numbers being kept in step. **Hover is the row alone.** A column highlight was tried and dropped: the row rule plus the pinned name already carry the eye across, and a second axis lighting up on every pointer move is movement the screen does not need.

**A list screen paginates in the URL; a tab paginates in state.** Both use the same footer, and the difference is not cosmetic. The Staff tab holds its page in React state and slices an array it already has — right for a dozen accounts inside a tab that has no URL state at all. The bookings register does the opposite on both counts: it fetches **one page at a time from the database**, because a register grows without bound and an unbounded query is the thing web/performance.md names, and it keeps the page and the rows-per-page in the **URL** beside the filters, because a link that restores someone's filters but drops them on page 1 restores the wrong thing. Page 1 and the default size are written as the *absence* of a param, so an unpaged view and the first page of a paged one are the same URL. **Changing a filter deliberately resets to page 1** — it is the only page guaranteed to exist afterwards — while moving between pages keeps every filter.

**A paginated table needs a total order, not just a sort.** Two rows with an equal sort key may swap between requests, and a row that swaps across a page boundary appears twice or not at all. So the register sorts by creation *and* by reference, and the second key exists only to make the first total. The same pagination is what settles the default sort: it decides what page 1 *is*, so the register leads with the booking taken most recently rather than the earliest arrival — otherwise page 1 is the oldest bookings on record, which after a year of trading is last September. Who is arriving is the dashboard's question.

**The footer's range replaces a count beside the action.** A list that states "24 bookings" next to its create button *and* "1–25 of 47 bookings" in its own footer is the same figure twice, in two registers a hand's width apart, and only one of them is also the control that moves you. The footer wins because it is attached to the thing it counts. Where the count is removed, the section keeps an `aria-label`: a `section` with no accessible name is not a landmark, so dropping the visible heading silently removes a navigation stop.

**Table pagination.** The footer bookends the header: the same `canvas-soft` strip, the same `divider` hairline, *inside* the table's container so one boundary and one radius hold the whole surface. It reads as two clusters. **Left — where you are:** the range in `body-sm` mute ("1–10 of 18 accounts"), which stays even when there is a single page because the count is useful, then a vertical hairline and the optional "Rows per page" select, labelled in the same `body-sm` mute so the whole left cluster reads as one quiet line rather than a shouted `micro` label beside a sentence. A page-number *entry* field is deliberately not offered: the range is the answer to "how much is here", and the chips are the way to move. **Right — how to move:** the page chips, flanked by single-step arrows and, from `sm` up, double-chevron jumps to the first and last page. **Figures here are proportional, not `tabular-nums`** — the tabular rule serves columns that must line up vertically, and nothing in this footer is in a column: the range reads as a sentence, the page numbers are centred in their own chips. The arrows are **drawn controls** — hairline-bounded chips on the card fill, like every other button in the portal — while the numbers are bare, so stepping and jumping never look like the same control; at the ends the arrows fade rather than disappear. **The current page is a card-fill chip with a hairline** — "where am I" as a quiet surface shift, the sidebar's and segmented control's language — and deliberately *without* `shadow-lift`: it already carries a drawn edge, and a chip with both would be saying it twice. Idle pages are mute, hover lifts them to the card fill. An ellipsis only ever stands in for two or more pages, and the control's slot count is constant, so it never changes width as you page. Below `sm` the jumps and the hairline drop out and the two clusters stack.

**Inline pagination.** The footer's language at a quieter register, for a list that lives *inside* a card — a record's history on the booking, deposit and unit screens — where a `canvas-soft` strip would be chrome heavier than the list it moves. Same two clusters: the range in `caption` mute on the left ("11–20 of 143 events"), the pages on the right, flanked by single-step arrows only. Same construction — drawn arrows, bare numbers, the current page a card-fill chip with a hairline — but on the *card* rather than the strip, under the one `divider` hairline the trail's own rows use, so hover steps **down** to `muted` rather than up to the card: an object is whichever tone is a step away from what it sits on. The squares are `control-sm` (28px), not the surface's control height, because they are chrome on the list rather than participants in a row of controls — the calendar's month arrows, not the footer's chips — and the number window has no siblings (five slots, not seven), because a history can sit in a 400px column. **It exists only when there is a second page**: a trail of seven events carries no footer at all, so a record with a short history looks exactly as it would unpaged. There is no rows-per-page and no first/last jump — a register is *worked* at a size, a history is only read. The pages are **links, not buttons**: the page is URL state (`?history=3`, page 1 being the absence of the param, exactly as the list screens write theirs), so moving is navigation, a page number is an address that works before the screen has hydrated, and a pasted link opens on what its sender was looking at. This replaced a "show older" link that grew the list in place: on a record that is never finished the column grew for the life of the building, and a reader could not say where in it they were.

**Empty states.** A list that comes back with nothing keeps the table's place with an **unbounded `muted` panel** — card-scale radius, centred copy, **no hairline** — not a card. The hairline draws things that exist, so an outline around nothing made the emptiest screens the most built-up. The panel is the segmented control's track without its chip — a faint slot waiting for content — and its tertiary action reads as the card chip on that track. One rule of surface grammar follows: **content is drawn, absence is not.** (Worded as "recessed" until the surface recut, when the ground dropped below `muted` and the panel stopped being literally recessed. The construction did not change — the absent hairline was always what carried it.) The empty state answers two different questions depending on why it is empty. **Nothing here yet** names the record type and says where records come from, offering the screen's create action as a `tertiary` button — the filled primary stays on the control line. **Nothing matched** names the filters as the cause and offers the way out, and that escape is worded identically on every screen: a `tertiary` button reading **"Clear filters"**, linking to the screen's own route with no query, under the description "Try a wider date range, or clear the filters to see everything." Not a bare underlined link, and not a per-screen variant naming the field it clears ("Clear the date filter") — a screen with one filter today grows a second one later, and staff who learn the escape on one list should recognise it on the next. The plural holds even where a screen filters on one thing.

**QR block.** White card, centred QR ≥ 200px with default quiet zone, booking reference in `display-sm` beneath, guidance in `body-sm`.

**The operations lockup.** A mark, then "Palm Villa" in `micro` mute over "Operations" at 14px/600 — one component (`PortalBrand`) for the three places it appears: the sidebar's brand block, the mobile drawer's, and the sign-in screen. The wordmark is 14px at 600, and stays pinned there rather than tracking `display-xs`: the lockup is chrome beside a 28px mark, not a heading, so it should not move when the card-title size does. `micro` stays at 11px — the system's floor. The two lines are pulled `xxs` tighter than their line-heights leave them, so they lock up as one object rather than reading as a label and a heading that happen to be stacked. The mark is an ink square at `{rounded.md}` with the ground knocked out of it, inverting with the theme: the operations surfaces carry no teal, and a solid fill reads as a mark rather than a control here, where every chip is a step of neutral. It is placeholder artwork — real artwork replaces the glyph, not the construction.

**There is no portal topbar** (removed 2026-08-31, v1.2). A 56px bar ran the full width of the application carrying a breadcrumb and three tools, and it cost more than it held. It **severed the sidebar from the content**: the nav column and the screen it was navigating sat on opposite sides of a rule that belonged to neither, so the chrome read as two unrelated regions rather than one tool. And it had no surface to be — a bar filled with the app background, sitting above the panel rather than in it, is a rung nobody asked for. Everything it carried moved *inside* the panel, into the panel header.

**Portal panel header.** The panel's own top line: breadcrumb on the left, and on the right the tools that belong to no single screen — search, notifications, theme. `{spacing.panel-header}` tall, `body-sm` mute with chevron separators, the current crumb in ink at 500. Below `lg` it carries the drawer trigger at its left.

It is **the panel's first child, not a bar above it**: it shares the panel's fill and spans the panel's width alone, never the viewport's.

**It spans that width edge to edge** — breadcrumb hard left, tools hard right. It deliberately does *not* take the content region's `max-w`, only its horizontal padding: constraining it centres the bar's contents on a wide monitor and empties both ends, which is the one thing a header must not do. The shared padding still lands the breadcrumb on the `h1`'s left edge at any realistic width.

**It sticks to the panel, not to the window** — `position: sticky; top: 0` inside the panel's scroll container, which is what "the panel owns the scroll" buys (§Layout). The panel's outer box clips, so the header cannot paint square corners over the panel's rounded ones.

**A permanent `{colors.hairline}` runs beneath it, full width, and nothing else does.** No shadow, no blur, no background change, no translucency: the page's whole shadow budget is the 4% lift under the "where am I" chip and nothing else may borrow it (§Elevation). The rule takes `divider` rather than `border` — it divides one surface, it does not bound one.

The hairline was briefly *revealed on scroll* and drawn nowhere at rest, on the reasoning that a header at the top of a page should read as the page's own first line. On the screen it read as a floating line of text with no bar under it, and the separation the header exists to make — chrome above, content below — simply was not there until you scrolled. A header is a bar. It **never carries the page title**, which stays the screen's single `h1` beneath it — a full `{spacing.2xl}` below the hairline. That gap is the *section* measure rather than a margin, and it is deliberately wider than it first looks like it should be: the header is chrome and the `h1` begins the content, so the two belong to different clusters (§Layout). At `{spacing.lg}` the title sat close enough to the rule to read as the bar's second line.

**Anything else that sticks inside the panel has to clear it.** A form's summary card is the case that exists today: it sticks in the same scroll container, so its offset is `{spacing.panel-header}` plus the gap it would otherwise have taken, never a bare `{spacing.xl}`.

**Portal screen header.** The screen's single `h1` at `display-sm` in Geist, and two slots under it that are not interchangeable. **`meta` runs on the title's own line** and carries what identifies *this record* — a booking's status chip and whose it is — because a reference and the state it is in are one thought, read together, and stacking them made a two-line header out of a sentence that fits beside the title. It carries **identity, not data**: the guest's *name* belongs here, their phone number does not. A number somebody rings needs a label and a `tel:`, and on this line it would be unlabelled grey text after a middot, competing with the status chip. Contact details belong in a labelled field in the record's own card. **`description` sits on the line below** and explains *the screen*: what a list holds, what a form is for. **A record screen's first row of cards sits `{spacing.lg}` under the header, one step under the `{spacing.xl}` between sections**: a title over its content is a different relationship from two cards side by side, and with no description line under a record's title the same 24px read as air rather than rhythm. A record screen takes `meta`; a list or form screen takes `description`. **A record screen may take both, for one thing only: a sentence saying why an action this screen would otherwise offer is unavailable** — the deposit that cannot be released because nobody has inspected the unit. That is still about the screen rather than about the record, which is what keeps it out of `meta`, and it belongs in the header rather than loose beneath it for a reason worth stating: the header is `items-end`, so a sentence rendered outside it leaves the actions aligned to the title with a band of white space under them, and the eye reads the buttons as belonging to the reference rather than to the state that governs them. A header keeps its actions only on screens with no control line (see *Filter rows*).

**Portal nav items.** Every item pairs a 16px icon with its label. The active item is a **`canvas` chip carrying `shadow-lift`** at `{rounded.md}` 6px, with ink text at 500 — a quiet surface shift, never a colour; hover is the `canvas-soft` panel step, a clear stop below it.

**The chip's radius is the control radius, not one of its own** (2026-08-31; it was a 10px `rounded.nav` from v1.1 until then). The radius scale measures *scale*, and a 30px chip standing on the ground is control-scale — there is no container it is inset into that would earn it a step up. Ten pixels on a 30px chip is a third of its height, which read as a soft pill beside 32px controls at 6px, and beside the segmented control's chip, which answers the same "where am I" question. The two are one construction and now share one geometry; a radius token that existed for a single component was the sign it had never been argued for.

**The chip inverted with the ground** (2026-08-31). It used to be a `canvas-soft` chip on a white ground; with the sidebar now sitting on `canvas-sunk`, that same chip would be a *darker* patch, which reads as pressed rather than as current. So the current item rises out of the sidebar instead of sinking into it, and takes the lift in place of a hairline — an edge drawn around the current item competes with the rules that structure the surface. This is the same construction as the segmented control, which is the point: one answer to "where am I", built once. Icons render in `mute` and lift to ink with the chip — they follow the item's state, never carry the brand hue, and never appear without a label in the sidebar. **Every item belongs to a labelled group** — there is no ungrouped item, at either end of the list, and no hairline inside the nav: the labels are the structure, and a rule between them would be a second one saying the same thing. **The groups name areas of the work, not permission levels.** A group may hold a single item — Overview and Property both do — where the area is real and will fill; the test is whether the label names something, not how many screens are under it yet. Filing a lone screen into a neighbouring group to avoid a one-item label is the wrong trade when the groups mean different things: Units is a daily operations screen, and moving it under Admin would have said only administrators open it. What belongs to no area at all closes the list under **Others**: Settings lives there, because it is where anyone signed in manages their own account, and Admin would likewise have implied a permission it does not need.

Group headers are `micro` in `mute` at 75%, and always sit **one step below the items they label** — they organise the nav, they do not compete with it. With the text ladder down to two steps, a label and an idle item resolve to the same value, so the separation is carried by the label's own voice — 11px uppercase against 13px sentence case — plus that alpha step, which reads at label scale where a further colour step would have needed a third rung the ladder no longer has.

**Hover is the narrowest step in the nav, and it is carried by more than tone.** With the ground at `#f3f3f3` the `canvas-soft` hover is 0.012 in oklab L above it — half what it was at `#efefef`, and the price of the lighter background. It holds because hover moves the label and its icon from `muted-foreground` to `foreground` at the same time, so the fill is confirming a change the text has already made rather than announcing one alone. If it ever reads too faint, the fix is a hover value of its own rather than moving `canvas-soft`, which is doing a different job inside the panel and would lose contrast against the cards there.

Idle items are `muted-foreground` in **both** themes. This used to be an asymmetry — `copy` in light, `muted-foreground` in dark — and it existed only because those were two different values, one of which sat nearly on top of `foreground` in dark. With one secondary step there is one rule, and it holds on both grounds: idle is mute, current is ink on a lifted chip.

**Overlays (dialogs, popovers, menus).** One shell — hairline, `shadow-overlay`, over the `scrim` — at one of **two scales**, and the question that picks between them is *what does it open out of?*

- A **surface** is its own object, standing over the page: a dialog, a toast, a standalone popover. Fixed width, `{spacing.xl}` padding, `{rounded.xl}` 16px.
- A **menu panel** opens out of a control and belongs to it: the select panel, the dropdown menu, the multi-select panel, and **both date pickers**. It takes `{rounded.lg}` 12px, sizes to its content, and is padded by that content.

**Two reasons, and the second is the one that decides the date pickers** (2026-08-31; all of these were 16px until then). First, concentricity: a menu's items run to within `{spacing.xs}` of its edge, so the panel's corner and the item's corner are the same corner — at 16px an item sat 4px from the straight edge and roughly 8px from the curve, which reads as rows floating in a rounded tub, the *mis-drawn edge* a notice gets when it repeats its card's radius. Second, and more important: **a control's panel has to look like it belongs to that control.** A date field and a select sit in the same form row and the system promises they are indistinguishable until one is opened — a promise that breaks at the moment of opening if one drops a 12px panel and the other a 16px one. The date picker's own contents sit far from its corners and would tolerate either radius; what settles it is the select beside it. Left at 16px it simply looked forgotten.

Strictly, 6px items behind 4px of padding want a 10px panel; 12px is taken instead because the residual 2px is invisible where the original 6px was not, and a fifth step in the radius scale costs more than it buys. **A menu is a card that floats; a dialog is a surface.** A dialog title is `display-xs` in Geist — a modal heading is a section heading, so the display face stays off it. Its footer holds at most one primary fill, like any other screen region. Menu items are *controls* inside that shell: `{rounded.md}` 6px, `body-sm`, 16px icons in mute, `muted` fill on focus. Menu group labels are `micro`, same as every other data-region label.

**Drawers.** The mobile portal nav is a left drawer, 280px, sliding over the scrim, closing on navigation. It fills with the **app background** — the surface the desktop sidebar sits directly on, that column being no surface of its own, so the nav reads identically in both places. Edge-anchored, so no radius. This is the only sanctioned drawer; see Detail screens below for why a record does not open in one.

**Detail screens are routes, not panels.** A record with its own actions — a booking, later a tenancy or a deposit — opens at its own URL, never in a drawer over the list it came from. Three reasons, in order of weight: staff send each other links, and other screens (the arrivals list, the verification queue, the audit trail) need somewhere to point; a record accretes sections as later phases land, and a 480px panel cannot hold what a booking will carry by phase three; and an edit form with availability and a repricing panel needs a screen. A list reaches its detail with a link **stretched across the row** from the identifying cell (`position: relative` on the row, `after:absolute after:inset-0` on the anchor) — the whole row is clickable with no client JavaScript, the list stays a server component, and middle-click, new-tab and keyboard focus all keep working, none of which a click handler gives for free. Overlays stay for interruptions: confirmations, menus, transient forms.

**A payment is the first record deliberately kept out of that rule**, so the rule's boundary is worth writing down. It meets none of the three reasons above — nobody sends a link to a payment, it accretes nothing, and its "form" is a confirmation — and the booking it belongs to already has a URL. The verification queue points at the booking, the payment's full record renders in a section there, and confirming or hand-matching one is a dialog. The test is whether a record is a thing people navigate *to*, not whether it is important.

**Destructive confirmations.** A dialog, not an inline toggle, and it states what will happen in plain sentences rather than asking "are you sure" — what becomes available again, what is kept, what cannot be undone. Where an action is consequential enough to be audited, the dialog collects the reason that goes into the record. Its footer holds the destructive fill as the one primary, with the safe choice as `tertiary` beside it, and the safe choice is worded as the thing itself ("Keep booking"), never "Cancel", which is ambiguous on a screen about cancelling. A confirmation stays open when the write is refused and shows why: the answer belongs at the button that asked the question.

**Tabs — a segmented control, not underlines.** A `muted` track at control height and `{rounded.md}` with `{spacing.xxs}` padding; the active segment is a white card chip at `{rounded.sm}` (concentric inside the track), stretched to the track's full inner height — a chip floating with track above and below it breaks the concentric geometry. No hairline on the chip: it carries `shadow-lift`, the page's **entire shadow budget**, shared only with the sidebar's active item — an edge felt rather than drawn. Dark grounds swallow shade, so in dark the lift flips to light: a 1px white-alpha edge ring with deeper black shade beneath, and the chip's fill (`tab-chip`) lifts a half-step above card (canvas @ 4% over ink-deep) — dark elevation reads through a lighter surface, held short of `secondary`'s full step. Labels `body-sm`, ink and 500 when active. The same principle as the sidebar's active item — *where am I* is a quiet surface shift, never the action colour; here the track supplies the gray, so the active segment lifts out of it in white. No underline tabs, no pill tabs. **Every segmented control is this construction** — the theme toggle included, which had grown its own (a 12px hairline shell, 9px pips, and the action colour marking the current mode) and now wears the tab track with two icon chips.

**Checkboxes.** 16px, `{rounded.sm}` 4px (6px reads as a circle at that size), hairline on the card fill; checked fills with the action colour. Its tick is the one glyph heavier than the 1.5px icon stroke — a 12px mark reversed out of a filled 16px box needs the weight to hold its shape. Small enough that the fill does not count against the one-primary-per-region rule.

**Textareas.** The input treatment at multiple lines — same hairline, radius, type and focus — sized to their content rather than fixed.

**File fields.** A `tertiary` button reading **Choose file** — a real `<label>`, which is the only element that opens a picker without script — with the chosen filename and its size beside it in `body-sm` mute, and *No file chosen* where there is none. The native `<input type="file">` is visually hidden but focusable and keyboard-operable; it is *not* removed from the accessible tree, and it takes its name from the field's label by `aria-labelledby` rather than from a second `<label>`, or the control announces twice. The browser's own file control is the one input in the platform with chrome we cannot touch — it draws a button, a filename and a layout per engine — so it is the one place a native control is replaced rather than restyled. The accepted types are declared explicitly and never as a wildcard: iOS transcodes a HEIC capture to JPEG only when the accept list excludes HEIC, so a wildcard invites a file the server will refuse. Under the control, a `caption` line names the accepted formats and the size ceiling, and says what happens to the file afterwards — a file field that takes somebody's identity document should say it is stored privately and deleted on a schedule at the moment it is handed over, not in a policy page. A refused file is a `FieldError` under the control naming the file, so five chosen photographs and one refusal is a legible outcome rather than a single unattributed message.

**Avatars.** Circular, 32px by default (24px in a table row, whose 32px height a full-size face would set), initials at `caption`/500. The sanctioned exception to "pills are badges only", which concerns rectangles becoming pills, not identity marks. A face appears **wherever a row names a person doing the work** — the staff roster, the cash log's collected-by column, each entry of a booking's history — because that is the whole point of a derived colour: the name you already know is findable before it is read. In a history trail every entry carries the mark so the text keeps one left edge; an event nobody performed (the system's) wears the neutral seedless face.

**A face carries its person's colour, and the colour is derived, not chosen.** The fill is one of seven *identity* hues indexed from the account id, in the same tint + deep-text construction as a status chip. Derived means the same person is the same colour on every screen and in every session, which is the only reason the colour is worth anything: it makes a name you already know findable in a list before you have read it. It follows that **the order of the identity hues is load bearing** — append to the set, never reorder or remove, or every face in the product repaints. Seed on the **account id**, never the name or the email: both are editable, and correcting a typo in someone's surname should not change their colour. An avatar with no seed stays neutral `canvas-soft`, which is what a placeholder standing in for nobody should look like.

**The identity set runs right around the wheel, with one hole in it.** Seven stops — sky, blue, violet, fuchsia, rose, orange, lime — and **no teal**, because teal on a staff surface is the one thing the monochrome ops rule actually forbids: it is the customer's colour. (`sky` used to carry a separate, bluer mid hue for the dark mix, because a cyan one read teal on the ink ground. With the mix gone there is one `sky`, and its tint was never the problem.)

**The other meaningful hues are sat beside, not avoided.** Lime is a yellow-green where positive is mint, rose a pink where negative is red; no identity token is ever literally a status token. **`orange` is the deliberate exception** — it shares its hue with `warning` (amber ≈32°, orange ≈25°) rather than sitting beside it, so there the separation rests entirely on the fill and the form: a peach tint at visibly higher chroma against warning's cream, in a circle rather than a pill. The two do not meet on any screen today; a "verified by" line beside an awaiting-payment chip would be the first, and is the thing to check if it ever reads wrong. Separation is carried by **form** at least as much as hue — an identity mark is a circle with two letters, a status is a pill with a word — and identity fills sit lighter and less chromatic than the status tints, so a face reads as a face. Confining the set to the arc the status hues leave unclaimed was the first attempt and it is the wrong trade: it bought a theoretical safety nobody was at risk from and cost the set its whole point, producing five near-identical blues that could not tell five people apart.

Seven rather than eight for the same reason — stops land ≈35–45° apart, and an eighth (indigo, between blue and violet) crowded three of them into one periwinkle. **A hue that cannot be named at 24px is not in the set.**

**A face is its tint and its deep, with the two swapping roles between themes.** Light is the tint as ground under `*-deep` text; dark is the deep at 65% into the card under the tint as text. No third value and no white — the status chips' construction exactly, which is what keeps the two sets one family. **The seven mid hues retired with the old dark mix** (2026-08-31): they were its only consumer, and dark now mixes the deep, which the pair already had.

**65% where a status chip takes 30%, and that gap is load bearing.** Built at the same percentage the two sets stop being distinguishable — measured, `avatar-orange` and `badge-warning` land **0.009 apart in oklab**, with rose/negative and lime/positive no better, which is the same collision the old 40%-against-26% split existed to prevent. At 65 against 30 the nearest same-family pair is **0.068** apart, so a face reads as the brighter and more chromatic of the two — the same thing the light tints say. Measured tint-on-deep in dark: 7.8:1 (orange) to 8.5:1 (lime).

**Identity is not brand**, so unlike the action roles these do *not* flip on the operations surfaces: the portal is the only place they are used.

Never a **brand** fill — an avatar identifies a person, it is not an accent, and the lagoon hue stays the customer surface's.

**Icons.** One outline family (`lucide`), **1.5px stroke**, 16px in the portal and field surfaces. The stroke is set once in a base rule rather than per call site — there are around forty of them and one missed prop is a visibly different icon. Lucide draws at 2px, which beside 1px hairlines makes icons the loudest thing on a quiet surface; 1.5px puts them in the same register as the rules they sit next to. An icon takes its colour from its item's state — mute by default, lifting to ink with the chip — and never carries the brand hue. The checkbox tick is the single sanctioned exception to the stroke weight.

**Skeletons.** `muted` at the control radius, shaped to match the content arriving, pulsing gently and static under reduced motion. Never a shimmer sweep: that is decoration, and it does not survive the theme flip cleanly.

**Activity bar.** A 2px `muted` track with a solid `muted-foreground` segment travelling across it, spanning the thing it reports on. The state a skeleton does not cover: a record that is **already on screen** while the server rebuilds part of it — the accounting pack being reassembled after a payment is verified. A skeleton stands in for content that has not arrived; a button says "Saving…" while you wait for something you started; this is neither, and before it existed that state was a caption with three dots, which nobody reads as *wait*.

Not a spinner: round is for avatars and status dots, a spinner floats in a box of its own, and a bar that spans the record says *this* is being worked on rather than *something* is loading. It is also not the banned shimmer — the objection to a sweep is that a gradient is decoration and does not survive the theme flip, and this is two flat tokens reporting a state. Under reduced motion the segment goes **full width**, never frozen part-way: a bar stopped at 40% claims a percentage nothing here knows. `aria-hidden` always, with the sentence beside it carrying `aria-live`.

## Do's and Don'ts

### Do
- Layer the four neutral rungs — app background, panel, container, card — and draw every seam between them with the one hairline.
- Keep the operations layout to one elevated surface: navigation directly on the background, and a bottom-anchored content panel that bleeds past the viewport and owns the scroll.
- Make a thing an object by putting it a tone *away* from what it sits on, rather than by giving it a fill it owns everywhere.
- Make every primary action a lagoon fill (`brand-deep` in light, vivid `brand` in dark); keep exactly one per screen region — its scarcity is what makes it striking.
- Elsewhere spend the hue as text and small brand moments (`brand-deep` for text, raw `brand` for graphic dots/logo).
- Label data regions in `micro` uppercase mute — tables, form sections, stats, eyebrows.
- Nest radii rather than repeating one: 6px controls and status chips — the nav's active chip included — 12px cards, 16px overlays and the content panel's top corners. Round is for avatars and dots only.
- Reach for a notice when a sentence changes what someone does next; leave gray for panels of figures.
- Set `tabular-nums` on every number that sits in a column or a total.
- Reach for theme roles (`background`, `muted`, `card`, `foreground`, `muted-foreground`, `border`, `primary`) in application code, never raw palette tokens — a raw `*-tint` or `*-deep` fill does not survive the theme flip.
- Keep text to the two steps: ink for content, mute for what labels it.

### Don't
- Don't fill bands, cards or any surface larger than a button with the lagoon hue — the primary button (and the badge chip) are its only fills.
- Don't fill a button with ink **on the customer surface**; there, ink is text and the dark surfaces, and a black button reads as someone else's brand. The operations surfaces are the deliberate exception — their whole register is monochrome, so ink (white in dark) *is* their primary.
- Don't use aqua as a success state; success is the `positive` pair.
- Don't spend the `info` blue for emphasis, decoration or a bit of colour on a dull screen. It means "know this before you act" — a second blue panel on a screen halves what the first one is worth, and a blue that means nothing is the fastest way to teach staff to stop reading them.
- Don't let Fraunces off the customer surface's display headlines — public `display-md`+ only; never in the portal, never on the field surface, never for body or UI text. And no third family, anywhere.
- Don't build coloured band alternation; sections separate with hairlines on white.
- Don't put a shadow on anything that is not an overlay or the "where am I" chip. Cards, tables and panels are tone-stepped and hairline-bounded; `shadow-overlay` exists only for things that genuinely float, and `shadow-lift` only for the active nav item and the active tab segment. Nothing else borrows either.
- Don't let bolded body text do a label's job; if it names a data region, it is `micro`.
- Don't stand a gray panel on the app background of an operations screen — it is lighter than the background and reads as a smudge. That slot is a card. Inside the white content panel, gray is correct again: it is a step *down* from what it sits on, which is what makes it an object there.
- Don't give the navigation column a surface — no fill, no border, not even a right-hand hairline. Two panels side by side read as two documents; the chrome earns its separation by being the thing that is not elevated.
- Don't close the content panel off at the fold. It is bottom-anchored and bleeds past the viewport: no bottom gutter, no bottom border, square bottom corners.
- Don't reintroduce a bar across the top of the application. The breadcrumb and the screen-agnostic tools live *inside* the panel, spanning the panel's width alone.
- Don't give the panel header anything beyond its one full-width hairline — no shadow, no blur, no fill change, scrolled or not. And don't constrain it to the content's `max-w`: the breadcrumb belongs hard left and the tools hard right.
- Don't stick anything else inside the panel at a bare `{spacing.xl}`; it has to clear `{spacing.panel-header}`.
- Don't inset a sidebar row twice at the same value. One inset per level, chosen so the brand mark, the nav icons and the account avatar share one left edge.
- Don't let any type above `display-sm` into the portal.
- Don't render anything as a pill. Avatars and status dots are the only round things; a badge is a 6px rectangle.
- Don't put white (or `canvas-soft`) text on a status or identity fill in dark. A hue supplies both of its own colours: pale ground with deep text in light, deep ground with a pale tint of the same hue in dark.
- Don't copy a light chip into dark unchanged either. Only the hue crosses the theme boundary; the lightness inverts, or a row of chips becomes a row of lights on an ink table.
- Don't invent a third text value between ink and mute, and don't use mute for content — if it is the thing itself rather than a label on it, it is ink.
- Don't size anything with `max-w-lg` / `w-xl` and friends: the named spacing scale owns those suffixes here, so `max-w-lg` is 16px, not a container width. Widths are explicit (`max-w-[480px]`).
- Don't answer "where am I" with the action colour; it is always a quiet surface shift — a muted chip on the white ground (nav), or a white chip lifted from the muted track (tabs).
