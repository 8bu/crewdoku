import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@':          path.resolve(__dirname, './src'),
      '@data':      path.resolve(__dirname, './src/data'),
      '@store':     path.resolve(__dirname, './src/store'),
      '@components':path.resolve(__dirname, './src/components'),
      '@features':  path.resolve(__dirname, './src/features'),
    },
  },
})
