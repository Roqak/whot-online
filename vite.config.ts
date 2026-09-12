import type { Server } from 'node:http'
import path from 'node:path'
import type { Plugin } from 'vite'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { attachGameServer } from './server/attach'

/** Runs the real game server inside the dev server, so `npm run dev` is the whole app. */
function whotGameServer(): Plugin {
  return {
    name: 'whot-game-server',
    apply: 'serve',
    configureServer(server) {
      if (server.httpServer) attachGameServer(server.httpServer as Server)
    },
  }
}

export default defineConfig({
  // Portals serve the game from a folder they choose, so assets must be relative.
  base: process.env.VITE_LOCAL_ONLY === '1' ? './' : '/',
  plugins: [react(), whotGameServer()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  server: {
    host: true,
  },
  build: {
    target: 'es2020',
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'server/**/*.test.ts'],
  },
})
