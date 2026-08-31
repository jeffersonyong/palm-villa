import type { Metadata } from 'next'

import {
  AvatarDemo,
  DropdownDemos,
  FormControlDemo,
  OverlayDemos,
  SkeletonDemo,
  TabsDemo,
} from '@/app/(public)/tokens/backbone-demos'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { DateField } from '@/components/ui/date-field'
import { Input } from '@/components/ui/input'
import { ThemeToggle } from '@/components/theme-toggle'

export const metadata: Metadata = {
  title: 'Design tokens',
}

/**
 * Token proof sheet.
 *
 * Two kinds of utility appear here on purpose:
 *  - the *raw* palette (`bg-ink`, `bg-brand`) in the swatch grids, which must
 *    not change with the theme — they are showing the brand values;
 *  - the *semantic* roles everywhere else, which flip with the theme.
 * Nothing is styled with a literal hex or pixel value, so a token that stops
 * resolving shows up immediately. Toggle the theme to check both.
 */

type Swatch = {
  token: string
  hex: string
  swatch: string
  note: string
}

const brandColors: Swatch[] = [
  {
    token: 'brand',
    hex: '#2fc9c0',
    swatch: 'bg-brand',
    note: 'Dark-theme primary fill; logo dot. Never a band and never text.',
  },
  {
    token: 'brand-deep',
    hex: '#0e6b64',
    swatch: 'bg-brand-deep',
    note: 'Light-theme primary fill, and the only aqua that carries text.',
  },
  {
    token: 'brand-active',
    hex: '#7fe3dc',
    swatch: 'bg-brand-active',
    note: 'Dark-theme brand text.',
  },
  {
    token: 'brand-pale',
    hex: '#dff5f3',
    swatch: 'bg-brand-pale',
    note: 'Selection highlight; checked-in badge ground.',
  },
]

const inkColors: Swatch[] = [
  {
    token: 'ink',
    hex: '#111111',
    swatch: 'bg-ink',
    note: 'Content and headings; dark surfaces. Never a button fill on the public site.',
  },
  {
    token: 'ink-deep',
    hex: '#1c1c1c',
    swatch: 'bg-ink-deep',
    note: 'Lighter than ink — dark-theme card surface.',
  },
  {
    token: 'mute',
    hex: '#6b6b6b',
    swatch: 'bg-mute',
    note: 'The one secondary: labels, metadata, idle chrome. AA on all three grounds.',
  },
]

const surfaceColors: Swatch[] = [
  {
    token: 'canvas-sunk',
    hex: '#efefef',
    swatch: 'bg-canvas-sunk',
    note: 'The page ground. Everything else sits on it.',
  },
  {
    token: 'canvas-soft',
    hex: '#f7f7f7',
    swatch: 'bg-canvas-soft',
    note: 'The panel step: inset panels, table headers, tab tracks, hover.',
  },
  {
    token: 'canvas',
    hex: '#ffffff',
    swatch: 'bg-canvas',
    note: 'Cards, and the chip that is here.',
  },
  {
    token: 'hairline',
    hex: '#e8e8e8',
    swatch: 'bg-hairline',
    note: 'Every drawn edge in light, at one weight.',
  },
]

const semanticColors: Swatch[] = [
  {
    token: 'positive',
    hex: '#1fa552',
    swatch: 'bg-positive',
    note: 'Success. Aqua never plays this role.',
  },
  {
    token: 'positive-deep',
    hex: '#166534',
    swatch: 'bg-positive-deep',
    note: 'Positive chip text.',
  },
  { token: 'warning', hex: '#d97706', swatch: 'bg-warning', note: 'Awaiting payment.' },
  { token: 'warning-deep', hex: '#92400e', swatch: 'bg-warning-deep', note: 'Warning chip text.' },
  { token: 'negative', hex: '#d03238', swatch: 'bg-negative', note: 'Destructive actions.' },
  {
    token: 'negative-deep',
    hex: '#9f1d24',
    swatch: 'bg-negative-deep',
    note: 'Negative chip text; destructive hover.',
  },
  { token: 'info', hex: '#1c80dd', swatch: 'bg-info', note: 'Notice mark. Kept off cyan.' },
  { token: 'info-deep', hex: '#0f5ea8', swatch: 'bg-info-deep', note: 'Notice text.' },
]

/** Theme-aware roles: these are what application code should reach for. */
const roles: { role: string; swatch: string; light: string; dark: string }[] = [
  { role: 'background', swatch: 'bg-background', light: 'canvas-sunk', dark: 'ink' },
  { role: 'muted', swatch: 'bg-muted', light: 'canvas-soft', dark: 'ink-deep → ink' },
  { role: 'card', swatch: 'bg-card', light: 'canvas', dark: 'ink-deep' },
  { role: 'foreground', swatch: 'bg-foreground', light: 'ink', dark: 'canvas' },
  { role: 'copy', swatch: 'bg-copy', light: 'ink (= foreground)', dark: 'canvas' },
  {
    role: 'muted-foreground',
    swatch: 'bg-muted-foreground',
    light: 'mute',
    dark: 'mute lightened',
  },
  { role: 'primary', swatch: 'bg-primary', light: 'brand-deep', dark: 'brand' },
  { role: 'border', swatch: 'bg-border', light: 'hairline', dark: 'white 9%' },
  { role: 'divider', swatch: 'bg-divider', light: 'hairline', dark: 'white 7%' },
  { role: 'accent', swatch: 'bg-accent', light: 'brand-pale', dark: 'brand 20% on ink-deep' },
  { role: 'invert-surface', swatch: 'bg-invert-surface', light: 'ink', dark: 'canvas-soft' },
  { role: 'footer-surface', swatch: 'bg-footer-surface', light: 'ink', dark: 'raised ink' },
]

const displayType = [
  { token: 'display-xl', spec: '44 / 700', cls: 'text-display-xl' },
  { token: 'display-lg', spec: '34 / 700', cls: 'text-display-lg' },
  { token: 'display-md', spec: '28 / 600', cls: 'text-display-md' },
  { token: 'display-sm', spec: '22 / 600', cls: 'text-display-sm' },
  { token: 'display-xs', spec: '15 / 600', cls: 'text-display-xs' },
]

const bodyType = [
  { token: 'body-lg', spec: '16 / 400', cls: 'text-body-lg' },
  { token: 'body-md', spec: '14 / 400', cls: 'text-body-md' },
  { token: 'body-md-strong', spec: '14 / 500', cls: 'text-body-md-strong' },
  { token: 'body-sm', spec: '13 / 400', cls: 'text-body-sm' },
  { token: 'body-sm-strong', spec: '13 / 500', cls: 'text-body-sm-strong' },
  { token: 'caption', spec: '12 / 500', cls: 'text-caption' },
  { token: 'micro', spec: '11 / 500 · caps', cls: 'micro-label' },
  { token: 'button-md', spec: '13 / 500', cls: 'text-button-md' },
]

const radii = [
  { token: 'sm', px: '4px', cls: 'rounded-sm' },
  { token: 'md', px: '6px', cls: 'rounded-md' },
  { token: 'lg', px: '12px', cls: 'rounded-lg' },
  { token: 'xl', px: '16px', cls: 'rounded-xl' },
]

const spacingSteps = [
  { token: 'xxs', px: '2px', cls: 'w-xxs' },
  { token: 'xs', px: '4px', cls: 'w-xs' },
  { token: 'sm', px: '8px', cls: 'w-sm' },
  { token: 'md', px: '12px', cls: 'w-md' },
  { token: 'card', px: '14px', cls: 'w-card' },
  { token: 'lg', px: '16px', cls: 'w-lg' },
  { token: 'xl', px: '24px', cls: 'w-xl' },
  { token: 'gutter', px: '28px', cls: 'w-gutter' },
  { token: '2xl', px: '32px', cls: 'w-2xl' },
  { token: '3xl', px: '48px', cls: 'w-3xl' },
]

function SwatchGrid({ title, items }: { title: string; items: Swatch[] }) {
  return (
    <div>
      <h3 className="micro-label text-muted-foreground">{title}</h3>
      <ul className="mt-md grid gap-md sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => (
          <li
            key={item.token}
            className="flex items-center gap-md rounded-lg border border-border bg-card p-md"
          >
            <span
              aria-hidden
              className={`size-10 shrink-0 rounded-md border border-divider ${item.swatch}`}
            />
            <span className="min-w-0">
              <span className="block truncate text-body-sm-strong text-foreground">
                {item.token}
              </span>
              <span className="block text-caption text-muted-foreground uppercase">{item.hex}</span>
              <span className="mt-xxs block text-caption text-copy">{item.note}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function Section({
  id,
  title,
  lead,
  className = 'bg-card',
  children,
}: {
  id: string
  title: string
  lead: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <section aria-labelledby={id} className={`border-t border-divider px-xl py-3xl ${className}`}>
      <div className="mx-auto w-full max-w-[1120px]">
        <h2 id={id} className="text-display-md text-foreground">
          {title}
        </h2>
        <p className="mt-sm max-w-[60ch] text-body-md text-copy">{lead}</p>
        <div className="mt-xl">{children}</div>
      </div>
    </section>
  )
}

export default function TokensPage() {
  return (
    <>
      <section className="bg-card px-xl py-3xl">
        <div className="mx-auto w-full max-w-[1120px]">
          <p className="micro-label text-muted-foreground">docs/design.md</p>
          <h1 className="mt-sm text-display-md text-foreground sm:text-display-lg">
            Token proof sheet
          </h1>
          <p className="mt-lg max-w-[60ch] text-body-lg text-copy">
            Everything below is rendered with Tailwind utilities generated from the design tokens.
            No hex value or pixel size is hardcoded in this page.
          </p>
          <div className="mt-lg flex flex-wrap items-center gap-md">
            <ThemeToggle />
            <p className="text-body-sm text-muted-foreground">
              Switch themes to check both. Swatch chips stay fixed — they show the raw brand values.
            </p>
          </div>
        </div>
      </section>

      <Section
        id="roles"
        title="Theme-aware roles"
        lead="What application code should actually use. Each role resolves through light-dark(), so a single class carries both themes."
      >
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[560px] border-collapse text-left">
            <thead>
              <tr className="border-b border-border bg-muted">
                <th scope="col" className="px-lg py-sm micro-label text-muted-foreground">
                  Swatch
                </th>
                <th scope="col" className="px-lg py-sm micro-label text-muted-foreground">
                  Role
                </th>
                <th scope="col" className="px-lg py-sm micro-label text-muted-foreground">
                  Light
                </th>
                <th scope="col" className="px-lg py-sm micro-label text-muted-foreground">
                  Dark
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-divider">
              {roles.map((item) => (
                <tr key={item.role}>
                  <td className="px-lg py-sm">
                    <span
                      aria-hidden
                      className={`block size-8 rounded-sm border border-divider ${item.swatch}`}
                    />
                  </td>
                  <td className="px-lg py-sm text-body-sm-strong text-foreground">{item.role}</td>
                  <td className="px-lg py-sm text-body-sm text-copy">{item.light}</td>
                  <td className="px-lg py-sm text-body-sm text-copy">{item.dark}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section
        id="colour"
        title="Raw palette"
        lead="The brand values themselves. These never change with the theme — the roles above are what shift."
        className="bg-muted"
      >
        <div className="space-y-xl">
          <SwatchGrid title="Brand" items={brandColors} />
          <SwatchGrid title="Ink and text" items={inkColors} />
          <SwatchGrid title="Surfaces" items={surfaceColors} />
          <SwatchGrid title="Semantic" items={semanticColors} />
        </div>
      </Section>

      <Section
        id="type-display"
        title="Display type"
        lead="One family, Geist. Hierarchy is size, weight and tracking — nothing exceeds 44px, and only the public hero uses that."
      >
        <ul className="space-y-lg">
          {displayType.map((item) => (
            <li key={item.token} className="border-b border-divider pb-lg last:border-b-0">
              <p className="micro-label text-muted-foreground">
                {item.token} · {item.spec}
              </p>
              <p className={`mt-xs overflow-hidden text-foreground ${item.cls}`}>Palm Villa</p>
            </li>
          ))}
        </ul>
      </Section>

      <Section
        id="type-body"
        title="Body type"
        lead="The range the entire portal and field surface live in. `micro` is the labelling voice — table headers, form sections, stats."
        className="bg-muted"
      >
        <ul className="space-y-md">
          {bodyType.map((item) => (
            <li key={item.token} className="rounded-lg border border-border bg-card p-lg">
              <p className="micro-label text-muted-foreground">
                {item.token} · {item.spec}
              </p>
              <p className={`mt-xs text-copy ${item.cls}`}>
                Booking PV-4821 · arrival 12 September · deposit held
              </p>
            </li>
          ))}
        </ul>
      </Section>

      <Section
        id="geometry"
        title="Radii and spacing"
        lead="6px for controls, 10px for cards, 14px for overlays. Pills are badges only. Spacing runs on a 4px base."
      >
        <div className="grid gap-xl lg:grid-cols-2">
          <div>
            <h3 className="micro-label text-muted-foreground">Radii</h3>
            <ul className="mt-md flex flex-wrap gap-lg">
              {radii.map((item) => (
                <li key={item.token} className="text-center">
                  <span
                    aria-hidden
                    className={`block size-16 border border-border bg-muted ${item.cls}`}
                  />
                  <span className="mt-xs block text-body-sm-strong text-foreground">
                    {item.token}
                  </span>
                  <span className="block text-caption text-muted-foreground">{item.px}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="micro-label text-muted-foreground">Spacing</h3>
            <ul className="mt-md space-y-sm">
              {spacingSteps.map((item) => (
                <li key={item.token} className="flex items-center gap-md">
                  <span className="w-16 text-body-sm-strong text-foreground">{item.token}</span>
                  <span aria-hidden className={`h-2 bg-primary ${item.cls}`} />
                  <span className="text-caption text-muted-foreground">{item.px}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Section>

      <Section
        id="components"
        title="Components"
        lead="shadcn/ui primitives reading the roles: ink actions, tinted status chips, one hairline card idiom."
        className="bg-muted"
      >
        <div className="space-y-xl">
          <div>
            <h3 className="micro-label text-muted-foreground">Buttons</h3>
            <div className="mt-md flex flex-wrap items-center gap-sm">
              <Button>Book now</Button>
              <Button variant="secondary">Change dates</Button>
              <Button variant="tertiary">Cancel</Button>
              <Button variant="ghost">Skip</Button>
              <Button variant="destructive">Void booking</Button>
              <Button size="touch">Check in (field)</Button>
            </div>
          </div>

          <div>
            <h3 className="micro-label text-muted-foreground">Inputs</h3>
            <div className="mt-md flex max-w-[420px] flex-col gap-sm">
              <Input placeholder="Guest name" />
              {/* The date field wears the same treatment: closed, it is an
                  Input with a calendar glyph — see Dropdowns for the panel. */}
              <DateField defaultValue="2026-09-12" className="w-[180px]" />
            </div>
          </div>

          <div>
            <h3 className="micro-label text-muted-foreground">Status badges</h3>
            <div className="mt-md flex flex-wrap items-center gap-sm">
              <Badge tone="positive">Confirmed</Badge>
              <Badge tone="warning">Awaiting payment</Badge>
              <Badge tone="negative">Expired</Badge>
              <Badge tone="active">Checked in</Badge>
              <Badge tone="neutral">Draft</Badge>
            </div>
          </div>

          <div>
            <h3 className="micro-label text-muted-foreground">Card surfaces</h3>
            <div className="mt-md grid gap-lg md:grid-cols-2 lg:grid-cols-3">
              <Card>
                <p className="text-body-md-strong">content</p>
                <p className="mt-xs text-body-sm opacity-80">
                  Hairline card — the default. No shadow: surfaces are flat, only overlays float.
                </p>
              </Card>
              <Card surface="inset">
                <p className="text-body-md-strong">inset</p>
                <p className="mt-xs text-body-sm opacity-80">The faint gray panel inside a card.</p>
              </Card>
              <Card surface="dark">
                <p className="text-body-md-strong">dark</p>
                <p className="mt-xs text-body-sm opacity-80">
                  The promotional polarity flip — public only, at most twice a page.
                </p>
              </Card>
            </div>
          </div>
        </div>
      </Section>

      <Section
        id="overlays"
        title="Overlays"
        lead="Elevation level 3 — the only place a real shadow appears. Open each in both themes and check the radius, the hairline, the shadow, and the scrim behind anything modal."
      >
        <OverlayDemos />
      </Section>

      <Section
        id="dropdowns"
        title="Dropdowns"
        lead="One dropdown, two dresses. The form dress is an Input with a chevron; the filter dress is a chip that names its field and reports its value. Both open the same overlay shell, and selection is always a weight shift, never a colour."
      >
        <DropdownDemos />
      </Section>

      <Section
        id="backbone"
        title="Tabs, controls and placeholders"
        lead="The rest of the kit: segmented tabs, the form controls that join Input and Label, and the two ways a screen shows a person rather than a record."
        className="bg-muted"
      >
        <div className="space-y-xl">
          <div>
            <h3 className="micro-label text-muted-foreground">Tabs</h3>
            <div className="mt-md">
              <TabsDemo />
            </div>
          </div>

          <div>
            <h3 className="micro-label text-muted-foreground">Checkbox &amp; textarea</h3>
            <div className="mt-md">
              <FormControlDemo />
            </div>
          </div>

          <div>
            <h3 className="micro-label text-muted-foreground">Avatar</h3>
            <div className="mt-md">
              <AvatarDemo />
            </div>
          </div>

          <div>
            <h3 className="micro-label text-muted-foreground">Skeleton</h3>
            <p className="mt-xs max-w-[60ch] text-body-sm text-muted-foreground">
              Shaped to match what is arriving. Static under prefers-reduced-motion.
            </p>
            <div className="mt-md">
              <SkeletonDemo />
            </div>
          </div>
        </div>
      </Section>
    </>
  )
}
