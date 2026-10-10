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

/** Injects CrazyGames SDK v3 script tag only when building for CrazyGames. */
function crazyGamesSdkPlugin(): Plugin {
  return {
    name: 'crazygames-sdk-inject',
    transformIndexHtml(html) {
      if (process.env.VITE_CRAZYGAMES === '1') {
        return html.replace(
          '</head>',
          '    <script src="https://sdk.crazygames.com/crazygames-sdk-v3.js"></script>\n  </head>',
        )
      }
      return html
    },
  }
}

export default defineConfig({
  // Portals serve the game from a folder they choose, so assets must be relative.
  base: process.env.VITE_LOCAL_ONLY === '1' ? './' : '/',
  plugins: [react(), whotGameServer(), crazyGamesSdkPlugin()],
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
