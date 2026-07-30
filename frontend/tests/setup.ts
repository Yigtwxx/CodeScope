import '@testing-library/jest-dom/vitest'
import { afterEach, vi } from 'vitest'
import { cleanup } from '@testing-library/react'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  // Stubs installed with vi.stubGlobal outlive restoreAllMocks.
  vi.unstubAllGlobals()
  window.localStorage.clear()
})
