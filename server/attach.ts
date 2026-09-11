import type { Server } from 'node:http'
import { WebSocketServer, WebSocket } from 'ws'
import { WS_PATH, parseClientMessage } from '../src/net/protocol'
import { Client, RoomManager } from './rooms'

const MAX_PAYLOAD_BYTES = 16 * 1024
const HEARTBEAT_MS = 30_000
const SWEEP_MS = 15_000
const RATE_BURST = 30
const RATE_PER_SECOND = 15

/** Mounts the Whot game server on an existing HTTP server at WS_PATH. */
export function attachGameServer(server: Server, manager = new RoomManager()) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_PAYLOAD_BYTES })
  const alive = new WeakSet<WebSocket>()

  server.on('upgrade', (req, socket, head) => {
    const { pathname } = new URL(req.url ?? '/', 'http://localhost')
    // Other upgrade requests (like Vite's HMR socket) are left to their own handlers.
    if (pathname !== WS_PATH) return
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req))
  })

  wss.on('connection', (ws: WebSocket) => {
    alive.add(ws)
    ws.on('pong', () => alive.add(ws))

    const client: Client = {
      send(msg) {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg))
      },
    }

    let tokens = RATE_BURST
    let lastRefill = Date.now()

    ws.on('message', (data, isBinary) => {
      const now = Date.now()
      tokens = Math.min(RATE_BURST, tokens + ((now - lastRefill) / 1000) * RATE_PER_SECOND)
      lastRefill = now
      if (tokens < 1) return
      tokens -= 1

      if (isBinary) return
      let parsed: unknown
      try {
        parsed = JSON.parse(data.toString())
      } catch {
        return client.send({ t: 'error', code: 'invalid', message: 'Malformed message' })
      }
      const msg = parseClientMessage(parsed)
      if (!msg) return client.send({ t: 'error', code: 'invalid', message: 'Unknown message' })
      try {
        manager.handleMessage(client, msg)
      } catch (err) {
        console.error('[whot] message handler failed', err)
        client.send({ t: 'error', code: 'rejected', message: 'Something went wrong. Try again.' })
      }
    })

    ws.on('close', () => manager.handleDisconnect(client))
    ws.on('error', () => ws.terminate())
  })

  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if (!alive.has(ws)) {
        ws.terminate()
        continue
      }
      alive.delete(ws)
      ws.ping()
    }
  }, HEARTBEAT_MS)
  const sweep = setInterval(() => manager.sweep(), SWEEP_MS)

  server.on('close', () => {
    clearInterval(heartbeat)
    clearInterval(sweep)
    manager.dispose()
    wss.close()
  })

  return { wss, manager }
}
