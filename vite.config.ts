import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'

import packageJson from './package.json' with { type: 'json' }

// Vite config — https://vitejs.dev/config/
export default defineConfig({
  // Versión de la app (package.json → CHANGELOG.md), disponible como APP_VERSION en src/lib/version.ts
  define: {
    __APP_VERSION__: JSON.stringify(packageJson.version),
  },
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
})
