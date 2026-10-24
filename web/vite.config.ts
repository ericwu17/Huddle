import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, type Connect, type Plugin } from 'vite'

// Two pages: index.html is the landing page at "/", app.html is the React app.
// Every other page path (/start, /join/ABCD, /g/...) is the app, like the
// rewrite in vercel.json.
const toApp: Connect.NextHandleFunction = (req, _res, next) => {
  const path = (req.url ?? '/').split('?')[0]
  const isPage = req.method === 'GET' && path !== '/' && path !== '/index.html' && !path.includes('.')
  const isVite = path.startsWith('/@') || path.startsWith('/node_modules/') || path.startsWith('/src/')
  if (isPage && !isVite) req.url = '/app.html' + (req.url!.slice(path.length) || '')
  next()
}

const appFallback = (): Plugin => ({
  name: 'huddle-app-fallback',
  configureServer: (server) => void server.middlewares.use(toApp),
  configurePreviewServer: (server) => void server.middlewares.use(toApp),
})

// https://vite.dev/config/
export default defineConfig({
  plugins: [appFallback(), react(), tailwindcss()],
  // NEXT_PUBLIC_ so the app reads the same names as the repo's .env.example.
  envPrefix: ['VITE_', 'NEXT_PUBLIC_'],
  // src/places.ts imports ../data/places.fake.json, outside this folder.
  server: { fs: { allow: ['..'] } },
  build: { rollupOptions: { input: { landing: 'index.html', app: 'app.html' } } },
})
