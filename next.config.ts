import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  typedRoutes: true,
  // `next dev` otherwise appends a managed block to CLAUDE.md on every start.
  // CLAUDE.md is a hand-authored normative doc here (see its "Documentation
  // practices" section), so the tool does not get to edit it.
  agentRules: false,
}

export default nextConfig
