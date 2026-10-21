import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // Capacitor's live-reload dev server binds 0.0.0.0 so a device/simulator on the same
    // network can reach it -- harmless for plain web dev too.
    host: true,
  },
})
