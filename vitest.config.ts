import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // Next.js resolves the `server-only` marker package specially at build
      // time; it isn't an installed dependency. Vitest needs a real module to
      // resolve to, so point it at a no-op stub. See that file for details.
      'server-only': fileURLToPath(new URL('./src/test/stubs/server-only.ts', import.meta.url)),
    },
  },
})
