import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      // Only the code the suite is meant to cover. Layout, the error boundary
      // and the shadcn primitives are thin wrappers exercised end to end.
      include: ['app/lib/**', 'app/hooks/**', 'app/components/**'],
      exclude: ['app/components/settings-modal.tsx', 'app/components/export-menu.tsx'],
      // Set just below the current figures so an unrelated change cannot
      // silently erode coverage.
      thresholds: {
        statements: 70,
        branches: 80,
        functions: 85,
        lines: 70,
      },
    },
  },
})
