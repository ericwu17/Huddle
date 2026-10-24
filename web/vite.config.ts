import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

// One page: index.html is the React app. Vite's SPA fallback serves it for
// every path (/start, /join/ABCD, /g/...), like the rewrite in vercel.json.

const previewHost = process.env.HUDDLE_PREVIEW_HOST?.trim()
if (previewHost && !/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i.test(previewHost)) {
  throw new Error('HUDDLE_PREVIEW_HOST must be one exact hostname without a URL, port or wildcard.')
}
const allowedHosts = previewHost ? [previewHost] : []

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // NEXT_PUBLIC_ so the app reads the same names as the repo's .env.example.
  envPrefix: ['VITE_', 'NEXT_PUBLIC_'],
  // src/places.ts imports ../data/places.fake.json, outside this folder.
  server: { allowedHosts, fs: { allow: ['..'] } },
  preview: { allowedHosts },
})
