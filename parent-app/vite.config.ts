import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'
import { defineConfig } from 'vite'

// Two HTML entries so the build produces both the main parent app (index.html served from
// app.pravnya.com) and the AAC-only PWA (aac.html served from aac.pravnya.com). Both ship from the
// same dist/ directory; nginx serves each vhost from the appropriate index.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // Capacitor's live-reload dev server binds 0.0.0.0 so a device/simulator on the same
    // network can reach it -- harmless for plain web dev too.
    host: true,
  },
  build: {
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'index.html'),
        aac: path.resolve(__dirname, 'aac.html'),
      },
    },
  },
})
