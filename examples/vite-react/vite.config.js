import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// /api goes to the Express example (examples/express), which holds the key.
export default defineConfig({
  plugins: [react()],
  server: { proxy: { '/api': 'http://localhost:3001' } },
})
