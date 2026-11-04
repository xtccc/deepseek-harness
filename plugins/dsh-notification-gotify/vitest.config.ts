import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.spec.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      exclude: [
        // Pure type declarations: no runtime code exists to cover.
        'src/types.ts',
        'src/contract.ts',
      ],
    },
  },
})
