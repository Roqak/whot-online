import { ClientMessage, ServerMessage, WS_PATH, publicOrigin } from './protocol'

export type ConnectionStatus = 'idle' | 'connecting' | 'open' | 'reconnecting'

interface Handlers {
  onMessage: (msg: ServerMessage) => void
  onStatus: (status: ConnectionStatus) => void
  /** Runs as soon as the socket opens, before queued messages are flushed. */
  onOpen: () => void
}

const HEARTBEAT_MS = 25_000
const MAX_BACKOFF_MS = 8_000

export function socketUrl(): string {
  const origin = new URL(publicOrigin())
  const protocol = origin.protocol === 'https:' ? 'wss' : 'ws'
  return `${protocol}://${origin.host}${WS_PATH}`
}

/** A WebSocket that reconnects with backoff and queues messages while offline. */
export class GameConnection {
  private ws: WebSocket | null = null
  private queue: ClientMessage[] = []
  private attempt = 0
  private running = false
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private heartbeat: ReturnType<typeof setInterval> | null = null

  constructor(
    private url: string,
    private handlers: Handlers,
  ) {
    window.addEventListener('online', this.wake)
    document.addEventListener('visibilitychange', this.wake)
  }

  start() {
    this.running = true
    if (!this.ws) this.connect()
  }

  stop() {
    this.running = false
    this.queue = []
    this.clearTimers()
    const ws = this.ws
    this.ws = null
    ws?.close()
    this.handlers.onStatus('idle')
  }

  send(msg: ClientMessage) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg))
    } else {
      this.queue.push(msg)
      this.start()
    }
  }

  private wake = () => {
    if (!this.running || document.visibilityState === 'hidden') return
    if (!this.ws && this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
      this.connect()
    }
  }

  private connect() {
    this.handlers.onStatus(this.attempt === 0 ? 'connecting' : 'reconnecting')
    const ws = new WebSocket(this.url)
    this.ws = ws

    ws.onopen = () => {
      this.attempt = 0
      this.handlers.onStatus('open')
      this.handlers.onOpen()
      const pending = this.queue
      this.queue = []
      for (const msg of pending) ws.send(JSON.stringify(msg))
      this.heartbeat = setInterval(() => this.send({ t: 'ping' }), HEARTBEAT_MS)
    }

    ws.onmessage = (event) => {
      try {
        this.handlers.onMessage(JSON.parse(event.data as string) as ServerMessage)
      } catch (err) {
        console.error('[whot] bad server message', err)
      }
    }

    ws.onclose = () => {
      if (this.ws !== ws) return
      this.ws = null
      this.clearTimers()
      if (!this.running) return
      this.attempt++
      this.handlers.onStatus('reconnecting')
      const delay = Math.min(MAX_BACKOFF_MS, 500 * 2 ** (this.attempt - 1)) * (0.8 + Math.random() * 0.4)
      this.reconnectTimer = setTimeout(() => {
        this.reconnectTimer = null
        this.connect()
      }, delay)
    }
  }

  private clearTimers() {
    if (this.heartbeat) clearInterval(this.heartbeat)
    this.heartbeat = null
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.reconnectTimer = null
  }
}
