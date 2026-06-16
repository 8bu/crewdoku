import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import pkg from './package.json' with { type: 'json' } // `with` (import attributes); `assert` is removed in current Node/TS
export default defineConfig({
  plugins: [react()],
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  // The HiGHS solver adapter spawns a Web Worker via `new Worker(new URL(...),
  // { type: 'module' })`. Vite's default worker output is IIFE, which rollup
  // rejects for code-split builds — emit ES-module workers instead.
  worker: { format: 'es' },
})
