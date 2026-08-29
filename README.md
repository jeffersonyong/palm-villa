# Palm Villa

Booking and operations platform for Palm Villa, Brunei — one Next.js app serving three surfaces
over one database: a public booking site, a staff operations portal, and mobile field screens.

`docs/` is the source of truth. Read [CLAUDE.md](CLAUDE.md) for the documentation map before
building anything; [docs/architecture.md](docs/architecture.md) is normative for engineering
decisions and [docs/design.md](docs/design.md) for the token set.

## Status

**Walking skeleton.** Route groups, design tokens (light and dark), shadcn/ui and the Supabase
clients are wired. There is no schema, no auth, no booking, pricing or payment logic yet.

## Getting started

```bash
npm install
cp .env.example .env.local   # fill in the Supabase values
npm run db:start             # local Supabase stack (Docker)
npm run db:reset             # apply migrations + seed
npm run db:bootstrap-admin   # create the first Admin (set BOOTSTRAP_ADMIN_* in .env.local first)
npm run dev
```

The app runs at http://localhost:3000. The portal and field surfaces require a staff sign-in at
`/login`; the bootstrap script creates the first Admin account, and every further account is
created from **Portal → Settings → Roles & staff**. Staff accounts are provisioned with a
temporary password shared out-of-band — there are no auth emails (architecture.md §3).

| Route | Surface |
| --- | --- |
| `/` | Public booking site |
| `/tokens` | Token proof sheet — the type scale and colour roles from `design.md` |
| `/portal` | Operations portal (desktop) |
| `/field` | Field screens (mobile web) |

## Scripts

| Script | Does |
| --- | --- |
| `npm run dev` | Dev server |
| `npm run build` | Production build |
| `npm run start` | Serve the production build |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint (`lint:fix` to autofix) |
| `npm run format` | Prettier write (`format:check` to verify) |
| `npm run test` | Vitest — unit + integration (needs the local stack up) |
| `npm run test:unit` | The fast pure-function subset |
| `npm run db:start` / `db:stop` | Local Supabase stack |
| `npm run db:reset` | Apply every migration, then the seed |
| `npm run db:bootstrap-admin` | Create the first Admin from `BOOTSTRAP_ADMIN_*` env vars |

## Layout

```
app/
  (public)/   # customer-facing — full expressive range of the design system
  (portal)/   # staff desktop — the quiet subset, never above display-sm
  (field)/    # mobile web — single column, ≥48px touch targets
  globals.css # design.md tokens as Tailwind theme + shadcn semantic layer
components/ui/# shadcn/ui primitives, re-skinned to the tokens
lib/
  env.ts      # env access, validated at the boundary
  supabase/   # server client (all data access) and browser client (auth only)
  utils.ts    # cn()
```

## Theming

Light and dark are two role mappings over one fixed palette
([docs/design.md](docs/design.md) §Dark theme). The mechanism is `color-scheme` plus CSS
`light-dark()`, so the OS preference works with no JavaScript; the in-app control flips
`data-theme` on `<html>` to override it. No theming dependency.

Application code should use **roles**, not raw palette tokens:

| Use | Not |
| --- | --- |
| `bg-background` `bg-card` `bg-muted` | `bg-canvas-soft` `bg-canvas` |
| `text-foreground` `text-copy` `text-muted-foreground` | `text-ink` `text-body` `text-mute` |
| `border-border` (hairline) `border-divider` (table rule) | `border-ink` `border-canvas-soft` |

A raw token is correct only where the value must *not* respond to the theme — the swatch grids on
`/tokens` are the one such place.

Two rules carried from `architecture.md` that this skeleton already encodes:

- **All database access is server-side.** `lib/supabase/client.ts` exists for auth session handling
  only; anything that queries a table from the browser is a bug.
- **Nothing hardcodes a hex, type size or radius.** `app/globals.css` is the single transcription of
  `design.md`; everything else uses the generated utilities.

## Stack

Next.js 16 (App Router, Turbopack) · React 19 · Tailwind CSS v4 · shadcn/ui · Supabase
(`ap-southeast-1`) · TypeScript · deployed on Vercel.
