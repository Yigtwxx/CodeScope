import type { NextConfig } from 'next'
import { fileURLToPath } from 'node:url'

const nextConfig: NextConfig = {
  // Lint and type errors intentionally fail the build. Suppressing them here is
  // how this codebase accumulated errors that never surfaced in CI.
  reactStrictMode: true,

  // Emit a self-contained server bundle so the Docker runtime stage does not
  // need node_modules. Harmless for `next dev` and `next start`.
  output: 'standalone',

  // Pin the workspace root; Turbopack otherwise walks up and picks a lockfile
  // outside the project.
  turbopack: {
    root: fileURLToPath(new URL('.', import.meta.url)),
  },
}

export default nextConfig
