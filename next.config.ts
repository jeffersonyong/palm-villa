import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  typedRoutes: true,
  // `next dev` otherwise appends a managed block to CLAUDE.md on every start.
  // CLAUDE.md is a hand-authored normative doc here (see its "Documentation
  // practices" section), so the tool does not get to edit it.
  agentRules: false,
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
}

export default nextConfig
