import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/Entitlements-Reform/',
  test: {
    include: ['tests/**/*.test.ts'],
    // Shared CI runners intermittently exceed Vitest's 5s default for
    // long-horizon entitlement computations; preserve assertions with headroom.
    testTimeout: 30_000,
  },
})
