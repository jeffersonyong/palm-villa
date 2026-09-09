import { normaliseOrigin } from './domain/origin'

/**
 * Environment access, validated at the boundary.
 *
 * Next.js inlines `process.env.NEXT_PUBLIC_*` at build time only for literal
 * property access, so each variable is read literally here rather than through
 * a dynamic key.
 */
function required(name: string, value: string | undefined): string {
  if (!value || value.trim() === '') {
    throw new Error(
      `Missing environment variable ${name}. Copy .env.example to .env.local and fill it in.`,
    )
  }

  return value
}

export const env = {
  get supabaseUrl(): string {
    return required('NEXT_PUBLIC_SUPABASE_URL', process.env.NEXT_PUBLIC_SUPABASE_URL)
  },
  get supabaseAnonKey(): string {
    return required('NEXT_PUBLIC_SUPABASE_ANON_KEY', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
  },
  /**
   * Server-only. Bypasses RLS, so it is never prefixed `NEXT_PUBLIC_` and never
   * reaches a client component — see lib/supabase/data.ts for why the query
   * layer uses it and what keeps that safe.
   */
  get supabaseServiceRoleKey(): string {
    return required('SUPABASE_SERVICE_ROLE_KEY', process.env.SUPABASE_SERVICE_ROLE_KEY)
  },
  /**
   * The shared secret on the nightly retention job's route (capability G4).
   *
   * That route is outside the session gate — `proxy.ts` matches `/portal` and
   * `/field`, and a cron caller has no cookies — so this string is the whole of
   * its authorisation. Vercel sends it as `Authorization: Bearer` on a
   * scheduled invocation; locally it is whatever `.env.local` says.
   *
   * Read through `required`, like the rest: a deployment with no secret set
   * should fail loudly at the first request rather than quietly leave a
   * deletion endpoint open.
   */
  get cronSecret(): string {
    return required('CRON_SECRET', process.env.CRON_SECRET)
  },
  /**
   * Where this deployment lives, for the link a confirmation email carries
   * (capability A8).
   *
   * **Configuration, never the request's `Host` header.** The public booking
   * form is reachable by anybody, so an email whose link came from a header
   * would be one an attacker points elsewhere with a single crafted POST — see
   * lib/domain/origin.ts, which owns the reasoning and the parsing.
   *
   * `VERCEL_URL` is the fallback rather than the source: it is the
   * per-deployment URL, it changes on every deploy and it sits behind
   * Deployment Protection, so it is right for a preview and wrong for
   * production. Production sets `SITE_ORIGIN` explicitly — to the Vercel
   * domain today, and to the client's the day one is chosen (architecture.md
   * §13). That is the one place a domain move has to be applied.
   */
  get siteOrigin(): string {
    const configured = process.env.SITE_ORIGIN?.trim()
    const raw =
      configured && configured !== ''
        ? configured
        : process.env.VERCEL_URL
          ? `https://${process.env.VERCEL_URL}`
          : undefined

    const origin = normaliseOrigin(required('SITE_ORIGIN', raw))

    if (origin === null) {
      throw new Error(
        'SITE_ORIGIN is not an origin. It must be a scheme and a host with no path — for example https://palmvilla.bn or http://localhost:3000.',
      )
    }

    return origin
  },
  /**
   * The `From` on every customer email — a display name and an address at a
   * domain verified in Resend (capability A8, [N42](../docs/open-questions.md)).
   *
   * Read through `required` because it is only ever read on the send path: if
   * a key is configured and this is not, the deployment means to send and
   * cannot, which should fail rather than guess a sender.
   */
  get emailFrom(): string {
    return required('EMAIL_FROM', process.env.EMAIL_FROM)
  },
  /**
   * The Resend key, or null when this deployment does not send.
   *
   * **The one getter here that does not fail loudly, deliberately.** Not
   * sending is a supported configuration rather than a broken one: Resend
   * delivers only to the account owner until a domain is verified, and no
   * client domain has been chosen — so local development, preview deployments
   * and production-before-the-domain all run with this unset, and a booking
   * must not fail because a deployment cannot email anybody. Nothing is written
   * to a booking's history in that case: not sending is one fact about the
   * environment rather than several hundred facts about bookings — see
   * lib/db/booking-emails.ts, which owns that reasoning.
   */
  get resendApiKey(): string | null {
    const key = process.env.RESEND_API_KEY?.trim()

    return key === undefined || key === '' ? null : key
  },
}
