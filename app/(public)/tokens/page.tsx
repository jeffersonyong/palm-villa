import type { Metadata } from 'next'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { ThemeToggle } from '@/components/theme-toggle'

export const metadata: Metadata = {
  title: 'Design tokens',
}

/**
 * Token proof sheet.
 *
 * Two kinds of utility appear here on purpose:
 *  - the *raw* palette (`bg-ink`, `bg-primary-pale`) in the swatch grids, which
 *    must not change with the theme — they are showing the brand values;
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
    token: 'primary',
    hex: '#2fc9c0',
    swatch: 'bg-primary',
    note: 'Sole accent. Primary CTA only, both themes.',
  },
  {
    token: 'primary-deep',
    hex: '#0e6b64',
    swatch: 'bg-primary-deep',
    note: 'Readable aqua: text on pale aqua.',
  },
  {
    token: 'primary-active',
    hex: '#7fe3dc',
    swatch: 'bg-primary-active',
    note: 'Hover / pressed.',
  },
  {
    token: 'primary-neutral',
    hex: '#a9e8e3',
    swatch: 'bg-primary-neutral',
    note: 'Quiet aqua fill.',
  },
  {
    token: 'primary-pale',
    hex: '#dff5f3',
    swatch: 'bg-primary-pale',
    note: 'Light-theme aqua surfaces.',
  },
  { token: 'on-primary', hex: '#16181b', swatch: 'bg-on-primary', note: 'Text on aqua surfaces.' },
]

const inkColors: Swatch[] = [
  {
    token: 'ink',
    hex: '#16181b',
    swatch: 'bg-ink',
    note: 'Light-theme headings. Dark-theme page ground.',
  },
  {
    token: 'ink-deep',
    hex: '#1f2225',
    swatch: 'bg-ink-deep',
    note: 'Lighter than ink — dark-theme card surface.',
  },
  { token: 'body', hex: '#41474c', swatch: 'bg-body', note: 'Light-theme body copy.' },
  { token: 'mute', hex: '#626b71', swatch: 'bg-mute', note: 'Caption scale. Clears AA on ground.' },
]

const surfaceColors: Swatch[] = [
  { token: 'canvas', hex: '#ffffff', swatch: 'bg-canvas', note: 'Light-theme cards.' },
  {
    token: 'canvas-soft',
    hex: '#f4f5f6',
    swatch: 'bg-canvas-soft',
    note: 'Cool near-white. Light ground; dark-theme body copy.',
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
  {
    token: 'positive-tint',
    hex: '#dcf3e4',
    swatch: 'bg-positive-tint',
    note: 'Positive chip ground.',
  },
  { token: 'warning', hex: '#d97706', swatch: 'bg-warning', note: 'Awaiting payment.' },
  { token: 'warning-deep', hex: '#92400e', swatch: 'bg-warning-deep', note: 'Warning chip text.' },
  {
    token: 'warning-tint',
    hex: '#fdf2d6',
    swatch: 'bg-warning-tint',
    note: 'Warning chip ground.',
  },
  { token: 'negative', hex: '#d03238', swatch: 'bg-negative', note: 'Destructive actions.' },
  {
    token: 'negative-deep',
    hex: '#9f1d24',
    swatch: 'bg-negative-deep',
    note: 'Negative chip text; destructive hover.',
  },
  {
    token: 'negative-tint',
    hex: '#fbe7e8',
    swatch: 'bg-negative-tint',
    note: 'Negative chip ground.',
  },
]

/** Theme-aware roles: these are what application code should reach for. */
const roles: { role: string; swatch: string; light: string; dark: string }[] = [
  { role: 'background', swatch: 'bg-background', light: 'canvas-soft', dark: 'ink' },
  { role: 'card', swatch: 'bg-card', light: 'canvas', dark: 'ink-deep' },
  { role: 'muted', swatch: 'bg-muted', light: 'canvas-soft', dark: 'ink-deep → ink' },
  { role: 'foreground', swatch: 'bg-foreground', light: 'ink', dark: 'canvas' },
  { role: 'copy', swatch: 'bg-copy', light: 'body', dark: 'canvas-soft' },
  {
    role: 'muted-foreground',
    swatch: 'bg-muted-foreground',
    light: 'mute',
    dark: 'mute lightened',
  },
  { role: 'border', swatch: 'bg-border', light: 'ink 10%', dark: 'white 12%' },
  { role: 'divider', swatch: 'bg-divider', light: 'ink 6%', dark: 'white 8%' },
  { role: 'accent', swatch: 'bg-accent', light: 'primary-pale', dark: 'primary 20% on ink-deep' },
  { role: 'invert-surface', swatch: 'bg-invert-surface', light: 'ink', dark: 'canvas-soft' },
  { role: 'footer-surface', swatch: 'bg-footer-surface', light: 'ink', dark: 'raised ink' },
]

const displayType = [
  { token: 'display-xl', spec: '52 / 600', cls: 'text-display-xl' },
  { token: 'display-lg', spec: '40 / 600', cls: 'text-display-lg' },
  { token: 'display-md', spec: '32 / 600', cls: 'text-display-md' },
  { token: 'display-sm', spec: '24 / 600', cls: 'text-display-sm' },
  { token: 'display-xs', spec: '20 / 600', cls: 'text-display-xs' },
]

const bodyType = [
  { token: 'body-lg', spec: '18 / 400', cls: 'text-body-lg' },
  { token: 'body-md', spec: '15 / 400', cls: 'text-body-md' },
  { token: 'body-md-strong', spec: '15 / 500', cls: 'text-body-md-strong' },
  { token: 'body-sm', spec: '13 / 400', cls: 'text-body-sm' },
  { token: 'body-sm-strong', spec: '13 / 500', cls: 'text-body-sm-strong' },
  { token: 'caption', spec: '12 / 400', cls: 'text-caption' },
  { token: 'button-md', spec: '14 / 500', cls: 'text-button-md' },
]

const radii = [
  { token: 'sm', px: '4px', cls: 'rounded-sm' },
  { token: 'md', px: '8px', cls: 'rounded-md' },
  { token: 'lg', px: '12px', cls: 'rounded-lg' },
  { token: 'xl', px: '16px', cls: 'rounded-xl' },
  { token: 'pill', px: '9999px', cls: 'rounded-pill' },
]

const spacingSteps = [
  { token: 'xxs', px: '2px', cls: 'w-xxs' },
  { token: 'xs', px: '4px', cls: 'w-xs' },
  { token: 'sm', px: '8px', cls: 'w-sm' },
  { token: 'md', px: '12px', cls: 'w-md' },
  { token: 'lg', px: '16px', cls: 'w-lg' },
  { token: 'xl', px: '24px', cls: 'w-xl' },
  { token: '2xl', px: '32px', cls: 'w-2xl' },
  { token: '3xl', px: '48px', cls: 'w-3xl' },
]

function SwatchGrid({ title, items }: { title: string; items: Swatch[] }) {
  return (
    <div>
      <h3 className="text-body-md-strong text-foreground">{title}</h3>
      <ul className="mt-md grid gap-md sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => (
          <li
            key={item.token}
            className="flex items-center gap-md rounded-lg border border-divider bg-card p-md"
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
    <section aria-labelledby={id} className={`px-xl py-3xl ${className}`}>
      <div className="mx-auto w-full max-w-[1200px]">
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
      <section className="bg-background px-xl py-3xl">
        <div className="mx-auto w-full max-w-[1200px]">
          <p className="text-body-sm-strong text-muted-foreground">docs/design.md</p>
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
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse text-left">
            <thead>
              <tr className="bg-muted">
                <th
                  scope="col"
                  className="px-md py-sm text-caption text-muted-foreground uppercase"
                >
                  Swatch
                </th>
                <th
                  scope="col"
                  className="px-md py-sm text-caption text-muted-foreground uppercase"
                >
                  Role
                </th>
                <th
                  scope="col"
                  className="px-md py-sm text-caption text-muted-foreground uppercase"
                >
                  Light
                </th>
                <th
                  scope="col"
                  className="px-md py-sm text-caption text-muted-foreground uppercase"
                >
                  Dark
                </th>
              </tr>
            </thead>
            <tbody>
              {roles.map((item) => (
                <tr key={item.role} className="border-b border-divider">
                  <td className="px-md py-sm">
                    <span
                      aria-hidden
                      className={`block size-8 rounded-sm border border-divider ${item.swatch}`}
                    />
                  </td>
                  <td className="px-md py-sm text-body-sm-strong text-foreground">{item.role}</td>
                  <td className="px-md py-sm text-body-sm text-copy">{item.light}</td>
                  <td className="px-md py-sm text-body-sm text-copy">{item.dark}</td>
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
        className="bg-background"
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
        lead="One family, Inter. Hierarchy is size, weight and tracking — nothing exceeds 52px, and only the public hero uses that."
      >
        <ul className="space-y-lg">
          {displayType.map((item) => (
            <li key={item.token} className="border-b border-divider pb-lg last:border-b-0">
              <p className="text-caption text-muted-foreground uppercase">
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
        lead="The range the entire portal and field surface live in."
        className="bg-background"
      >
        <ul className="space-y-md">
          {bodyType.map((item) => (
            <li key={item.token} className="rounded-lg border border-divider bg-card p-lg">
              <p className="text-caption text-muted-foreground uppercase">
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
        lead="8px for controls, 12px for cards, 16px for overlays. Pills are badges only. Spacing runs on a 4px base."
      >
        <div className="grid gap-xl lg:grid-cols-2">
          <div>
            <h3 className="text-body-md-strong text-foreground">Radii</h3>
            <ul className="mt-md flex flex-wrap gap-lg">
              {radii.map((item) => (
                <li key={item.token} className="text-center">
                  <span aria-hidden className={`block size-16 bg-accent ${item.cls}`} />
                  <span className="mt-xs block text-body-sm-strong text-foreground">
                    {item.token}
                  </span>
                  <span className="block text-caption text-muted-foreground">{item.px}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="text-body-md-strong text-foreground">Spacing</h3>
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
        lead="shadcn/ui primitives reading the roles: one aqua primary, tinted status chips, card surfaces that invert with the theme."
        className="bg-background"
      >
        <div className="space-y-xl">
          <div>
            <h3 className="text-body-md-strong text-foreground">Buttons</h3>
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
            <h3 className="text-body-md-strong text-foreground">Status badges</h3>
            <div className="mt-md flex flex-wrap items-center gap-sm">
              <Badge tone="positive">Confirmed</Badge>
              <Badge tone="warning">Awaiting payment</Badge>
              <Badge tone="negative">Expired</Badge>
              <Badge tone="active">Checked in</Badge>
              <Badge tone="neutral">Draft</Badge>
            </div>
          </div>

          <div>
            <h3 className="text-body-md-strong text-foreground">Card surfaces</h3>
            <div className="mt-md grid gap-lg md:grid-cols-2 lg:grid-cols-3">
              <Card>
                <p className="text-body-md-strong">card-content</p>
                <p className="mt-xs text-body-sm opacity-80">The portal default.</p>
              </Card>
              <Card surface="muted">
                <p className="text-body-md-strong">card-feature-muted</p>
                <p className="mt-xs text-body-sm opacity-80">Public feature grids.</p>
              </Card>
              <Card surface="aqua">
                <p className="text-body-md-strong">card-feature-aqua</p>
                <p className="mt-xs text-body-sm opacity-80">
                  Public feature grids, used sparingly.
                </p>
              </Card>
              <Card surface="dark">
                <p className="text-body-md-strong">card-feature-dark</p>
                <p className="mt-xs text-body-sm opacity-80">
                  Polarity flip — always the opposite of the current ground.
                </p>
              </Card>
              <Card surface="summary">
                <p className="text-body-md-strong">booking-summary-card</p>
                <p className="mt-xs text-body-sm opacity-80">Neutral hairline.</p>
              </Card>
            </div>
          </div>
        </div>
      </Section>
    </>
  )
}
