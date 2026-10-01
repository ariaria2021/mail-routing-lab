import { defineConfig } from 'vitest/config'

export default defineConfig({
  base: '/mail-routing-lab/',
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts'],
  },
})
