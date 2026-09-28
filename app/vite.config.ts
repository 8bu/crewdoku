import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
// The workspace root's manifest is the one place a version lives: release-please
// bumps it and nothing else, so every build stamps its `version` in as
// `__APP_VERSION__` — the label in the nav rail's footer, the "What's new"
// panel's cutoff, and `app/scripts/check-whats-new.ts` all read the same string.
import rootManifest from '../package.json' with { type: 'json' }

export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: { __APP_VERSION__: JSON.stringify(rootManifest.version) },
  server: { port: 5173 },
  test: {
    environment: 'jsdom',
  },
})
