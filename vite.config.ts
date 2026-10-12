import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

// The hot-reload socket is only reachable from the dev server; packaged builds
// must not keep that allowance in their Content-Security-Policy.
const productionCsp = (): Plugin => ({
  name: 'production-csp',
  apply: 'build',
  transformIndexHtml: (html) => html.replace(' ws://127.0.0.1:5173', ''),
})

export default defineConfig({
  plugins: [react(), productionCsp()],
  base: './',
  server: { port: 5173, strictPort: true },
})
