import type { NextConfig } from 'next'

/**
 * Where the site's photographs are served from (capability F7).
 *
 * Read straight from the environment and never allowed to throw: this file is
 * loaded without the `@/` alias, so lib/env.ts — which throws on a missing
 * variable by design — is not reachable here, and a config that crashed would
 * take the whole build down over a missing photo host. With no Supabase URL the
 * list is empty, the optimiser refuses every photograph, and the landing page
 * still renders its placeholders.
 */
function storageOrigin(value: string | undefined): URL | null {
  if (!value) {
    return null
  }

  try {
    return new URL(value)
  } catch {
    return null
  }
}

const supabase = storageOrigin(process.env.NEXT_PUBLIC_SUPABASE_URL)

/** The local Supabase stack's addresses. Production's `*.supabase.co` is none of these. */
const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]'])

const nextConfig: NextConfig = {
  reactStrictMode: true,
  typedRoutes: true,
  // `next dev` otherwise appends a managed block to CLAUDE.md on every start.
  // CLAUDE.md is a hand-authored normative doc here (see its "Documentation
  // practices" section), so the tool does not get to edit it.
  agentRules: false,
  images: {
    /**
     * The public `site-images` bucket and nothing else. The optimiser fetches
     * from exactly this path on exactly this host, so it cannot be pointed at a
     * private bucket, or at anywhere else on the internet, through a crafted
     * `/_next/image` URL.
     */
    remotePatterns: supabase
      ? [
          {
            protocol: supabase.protocol === 'http:' ? 'http' : 'https',
            hostname: supabase.hostname,
            port: supabase.port,
            pathname: '/storage/v1/object/public/site-images/**',
            search: '',
          },
        ]
      : [],
    /**
     * The local Supabase stack answers on a loopback address, which Next 16
     * refuses to optimise from by default — anywhere else, a loopback source is
     * a path into a private network. Allowed only when the photo host itself is
     * loopback: true for `npm run dev` against the local stack, false in every
     * deployed environment.
     */
    dangerouslyAllowLocalIP: supabase !== null && LOOPBACK_HOSTS.has(supabase.hostname),
    /**
     * A day, matching the Cache-Control every photograph is uploaded with
     * (lib/db/site-images.ts). Keys are never reused, so this never delays a
     * new photograph; it bounds how long a removed one can still be fetched.
     */
    minimumCacheTTL: 86400,
  },
  experimental: {
    serverActions: {
      /**
       * A document arrives as a file in a server action's FormData, and the
       * default here is 1 MB — smaller than a photograph of an IC.
       *
       * 5 MB rather than something generous, and the ceiling that actually
       * governs is MAX_DOCUMENT_BYTES at 4 MiB (lib/domain/document.ts). Vercel
       * caps a function's request body at 4.5 MB in front of the function, so a
       * larger figure here would be a limit that passes locally and fails in
       * production. This is the headroom for the multipart envelope around a
       * 4 MiB file, not a second policy.
       */
      bodySizeLimit: '5mb',
    },
  },
  /**
   * Response headers, on every route.
   *
   * Four of them, each one a default this application never wants to depart
   * from — and until now the application sent none at all, leaving each to
   * whatever the browser assumed.
   *
   * **Deliberately not a Content-Security-Policy.** A real one here needs a
   * nonce for the theme script in app/layout.tsx, which runs inline and
   * before paint by design, and a nonce means every response becomes
   * uncacheable unless the policy is generated per request in the proxy.
   * That is a change worth making on its own, with its own testing, rather
   * than smuggled in beside four static lines.
   *
   * **Deliberately not HSTS.** Vercel serves it for its own domains already,
   * and a second one from here would be a duplicate header with a max-age
   * this repository would then own. It becomes ours to set the day a custom
   * domain is chosen (architecture.md §13).
   */
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          // A browser that sniffs its way to a different type than the one
          // declared is the vector that turns served content into executed
          // content. This covers the responses this application sends. It does
          // NOT reach a file Storage serves from its own origin — the signed
          // document URL this app redirects to, or a public site photograph —
          // and for those the control is the upload path: the type is decided
          // from the file's own magic numbers rather than the uploader's claim,
          // and the object is stored with that type.
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          // Nothing in this product is framed and nothing frames anything: the
          // print route is a full page that calls window.print(). So the whole
          // of clickjacking is answered by refusing to be embedded at all,
          // which matters most for the portal, where one misread click
          // verifies a payment.
          { key: 'X-Frame-Options', value: 'DENY' },
          // The customer's booking page carries its access token in the path,
          // and that token is the whole of its authorisation. Sending a full
          // referrer would hand it to every origin the page ever links out to.
          // This sends the origin alone across origins and nothing at all
          // downgrading to http.
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          // None of the three is ever called: there is no getUserMedia and no
          // geolocation anywhere in the app. This does not touch the "Take
          // Photo" option in a file picker — a guest photographing their IC
          // goes through the operating system's own camera, not through a
          // permission this policy governs — so the A7 upload flow is
          // unaffected. What it removes is the reach an injected script would
          // otherwise have.
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
        ],
      },
    ]
  },
}

export default nextConfig
