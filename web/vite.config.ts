import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // NEXT_PUBLIC_ so the app reads the same names as the repo's .env.example.
  envPrefix: ['VITE_', 'NEXT_PUBLIC_'],
  // src/places.ts imports ../data/places.fake.json, outside this folder.
  server: { fs: { allow: ['..'] } },
})
