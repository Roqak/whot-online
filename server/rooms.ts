import { randomBytes, randomInt, randomUUID } from 'node:crypto'
import {
  ClientMessage,
  ErrorCode,
  LobbyView,
  Reaction,
  ServerMessage,
  cleanName,
  normalizeRoomCode,
  ROOM_CODE_LENGTH,
} from '../src/net/protocol'
import {
  Rng,
  applyAction,
  applyTimeout,
  createMatch,
  cryptoRng,
  currentPlayer,
  isCatchable,
  removePlayer,
  startNextRound,
  toView,
  MAX_PLAYERS,
  MIN_PLAYERS,
} from '../src/engine/gameEngine'
import { BOT_CATCH, BOT_NAMES, chooseBotMove } from '../src/engine/bot'
import { BOT_AVATAR, isValidAvatar } from '../src/lib/avatars'
import { BotLevel, DEFAULT_SETTINGS, GameEvent, GameSettings, GameState, sanitizeSettings } from '../src/types/game'

export interface Client {
  send(msg: ServerMessage): void
}

interface Member {
  id: string
  name: string
  avatar: string
  isBot: boolean
  botLevel?: BotLevel
  ready: boolean
  sessionId: string
  client: Client | null
  disconnectedAt: number | null
}

type Timer = ReturnType<typeof setTimeout>

interface Watcher {
  id: string
  name: string
}

interface Room {
  code: string
  hostId: string
  members: Member[]
  /** Spectators: they receive the redacted view and can cheer, nothing else. */
  watchers: Map<Client, Watcher>
  settings: GameSettings
  game: GameState | null
  deadline: number | null
  scheduledTurnId: number | null
  turnTimer: Timer | null
  roundTimer: Timer | null
  /** One entry per catchable player; null means no bot decided to catch them this time. */
  catchTimers: Map<string, Timer | null>
  lastReaction: Map<string, number>
}

export interface RoomManagerOptions {
  rng?: Rng
  now?: () => number
  botDelayMs?: [number, number]
  roundBreakMs?: number
  /** How long a disconnected player's turn waits before auto-drawing. */
  offlineTurnMs?: number
  lobbyGraceMs?: number
  gameGraceMs?: number
}

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const REACTION_COOLDOWN_MS = 800

export class RoomManager {
  private rooms = new Map<string, Room>()
  private bindings = new Map<Client, { code: string; memberId: string }>()
  private watching = new Map<Client, string>()
  private rng: Rng
  private now: () => number
  private opts: Required<Omit<RoomManagerOptions, 'rng' | 'now'>>

  constructor(options: RoomManagerOptions = {}) {
    this.rng = options.rng ?? cryptoRng
    this.now = options.now ?? Date.now
    this.opts = {
      // Slow enough that a person can follow who just did what.
      botDelayMs: options.botDelayMs ?? [1300, 2200],
      roundBreakMs: options.roundBreakMs ?? 15_000,
      offlineTurnMs: options.offlineTurnMs ?? 15_000,
      lobbyGraceMs: options.lobbyGraceMs ?? 60_000,
      gameGraceMs: options.gameGraceMs ?? 120_000,
    }
  }

  get roomCount() {
    return this.rooms.size
  }

  getRoom(code: string) {
    return this.rooms.get(code)
  }

  handleMessage(client: Client, msg: ClientMessage) {
    switch (msg.t) {
      case 'ping':
        return client.send({ t: 'pong' })
      case 'create':
        return this.create(client, msg.name, msg.avatar)
      case 'join':
        return this.join(client, msg.code, msg.name, msg.avatar)
      case 'resume':
        return this.resume(client, msg.code, msg.sessionId)
      case 'watch':
        return this.watch(client, msg.code, msg.name)
    }

    const watched = this.watchedRoom(client)
    if (watched) {
      const { room, watcher } = watched
      if (msg.t === 'react') {
        return this.cheer(room, {
          key: watcher.id,
          name: watcher.name,
          playerId: null,
          emoji: msg.emoji,
          targetId: msg.targetId,
          spectator: true,
        })
      }
      if (msg.t === 'leave') return this.stopWatching(client)
      return this.error(client, 'forbidden', 'You are watching this table, not playing')
    }

    const ctx = this.context(client)
    if (!ctx) return this.error(client, 'session_expired', 'You are not in a room')
    const { room, member } = ctx
    const isHost = room.hostId === member.id

    switch (msg.t) {
      case 'leave':
        return this.removeMember(room, member, 'left')
      case 'ready':
        if (room.game) return
        member.ready = msg.ready
        return this.broadcastLobby(room)
      case 'addBot':
        if (!isHost) return this.error(client, 'forbidden', 'Only the host can add bots')
        if (room.game) return this.error(client, 'in_progress', 'The game has already started')
        if (room.members.length >= MAX_PLAYERS) return this.error(client, 'room_full', 'The table is full')
        room.members.push(this.makeBot(room, msg.level))
        return this.broadcastLobby(room)
      case 'remove': {
        if (!isHost) return this.error(client, 'forbidden', 'Only the host can remove players')
        const target = room.members.find((m) => m.id === msg.playerId)
        if (!target || target.id === member.id) return
        return this.removeMember(room, target, 'kicked')
      }
      case 'settings':
        if (!isHost || room.game) return
        room.settings = sanitizeSettings(msg.settings, room.settings)
        return this.broadcastLobby(room)
      case 'start':
        return this.start(room, member)
      case 'action': {
        if (!room.game) return this.error(client, 'rejected', 'No game in progress')
        const result = applyAction(room.game, member.id, msg.action, this.rng)
        if (!result.ok) return this.error(client, 'rejected', result.error)
        return this.commit(room, result.state, result.events)
      }
      case 'nextRound':
        if (!isHost || room.game?.phase !== 'roundOver') return
        return this.advanceRound(room)
      case 'backToLobby':
        if (!isHost || room.game?.phase !== 'matchOver') return
        this.clearTimers(room)
        room.game = null
        room.deadline = null
        for (const m of room.members) m.ready = m.isBot
        return this.broadcastLobby(room)
      case 'react':
        return this.cheer(room, {
          key: member.id,
          name: member.name,
          playerId: member.id,
          emoji: msg.emoji,
          targetId: msg.targetId,
          spectator: false,
        })
    }
  }

  handleDisconnect(client: Client) {
    this.stopWatching(client)
    const ctx = this.context(client)
    this.bindings.delete(client)
    if (!ctx) return
    const { room, member } = ctx
    if (member.client !== client) return
    member.client = null
    member.disconnectedAt = this.now()
    this.broadcastLobby(room)
    if (room.game) {
      this.schedule(room, true)
      this.broadcastGame(room, [])
    }
  }

  /** Drops players who stayed disconnected past the grace period. Call periodically. */
  sweep() {
    const now = this.now()
    for (const room of [...this.rooms.values()]) {
      const grace = room.game ? this.opts.gameGraceMs : this.opts.lobbyGraceMs
      for (const member of [...room.members]) {
        if (member.disconnectedAt !== null && now - member.disconnectedAt > grace && this.rooms.has(room.code)) {
          this.removeMember(room, member, 'expired')
        }
      }
    }
  }

  dispose() {
    for (const room of this.rooms.values()) this.clearTimers(room)
    this.rooms.clear()
    this.bindings.clear()
    this.watching.clear()
  }

  // Spectators

  private watch(client: Client, rawCode: string, rawName: string) {
    const room = this.rooms.get(normalizeRoomCode(rawCode))
    if (!room) return this.error(client, 'room_not_found', 'No table with that code')
    this.detach(client)
    this.stopWatching(client)

    room.watchers.set(client, { id: `w_${randomBytes(5).toString('hex')}`, name: cleanName(rawName) || 'Guest' })
    this.watching.set(client, room.code)
    client.send({ t: 'watching', code: room.code })
    client.send({ t: 'lobby', lobby: this.lobbyView(room) })
    if (room.game) client.send({ t: 'game', view: this.spectatorView(room), events: [] })
    this.broadcastLobby(room)
  }

  private stopWatching(client: Client) {
    const code = this.watching.get(client)
    if (!code) return
    this.watching.delete(client)
    const room = this.rooms.get(code)
    if (!room) return
    room.watchers.delete(client)
    this.broadcastLobby(room)
  }

  private watchedRoom(client: Client) {
    const code = this.watching.get(client)
    const room = code ? this.rooms.get(code) : undefined
    const watcher = room?.watchers.get(client)
    return room && watcher ? { room, watcher } : null
  }

  /** The view everyone without a seat gets: counts only, never a hand. */
  private spectatorView(room: Room) {
    return toView(room.game!, '', {
      isConnected: (id) => !!room.members.find((m) => m.id === id)?.client,
      deadline: room.deadline,
    })
  }

  // Lobby

  private create(client: Client, rawName: string, avatar: string) {
    const name = cleanName(rawName)
    if (!name) return this.error(client, 'invalid', 'Enter a nickname')
    if (!isValidAvatar(avatar)) return this.error(client, 'invalid', 'Pick an avatar')
    this.detach(client)

    const host = this.makeHuman(name, avatar, client)
    const room: Room = {
      code: this.uniqueCode(),
      hostId: host.id,
      members: [host],
      settings: { ...DEFAULT_SETTINGS },
      game: null,
      watchers: new Map(),
      deadline: null,
      scheduledTurnId: null,
      turnTimer: null,
      roundTimer: null,
      catchTimers: new Map(),
      lastReaction: new Map(),
    }
    this.rooms.set(room.code, room)
    this.bind(client, room, host)
    this.broadcastLobby(room)
  }

  private join(client: Client, rawCode: string, rawName: string, avatar: string) {
    const name = cleanName(rawName)
    if (!name) return this.error(client, 'invalid', 'Enter a nickname')
    if (!isValidAvatar(avatar)) return this.error(client, 'invalid', 'Pick an avatar')
    const room = this.rooms.get(normalizeRoomCode(rawCode))
    if (!room) return this.error(client, 'room_not_found', 'No room with that code. Check it and try again.')
    if (room.game) return this.error(client, 'in_progress', 'That game has already started')
    if (room.members.length >= MAX_PLAYERS) return this.error(client, 'room_full', 'That table is full')
    this.detach(client)

    const member = this.makeHuman(this.uniqueName(room, name), avatar, client)
    room.members.push(member)
    this.bind(client, room, member)
    this.broadcastLobby(room)
  }

  private resume(client: Client, rawCode: string, sessionId: string) {
    const room = this.rooms.get(normalizeRoomCode(rawCode))
    const member = room?.members.find((m) => !m.isBot && m.sessionId === sessionId)
    if (!room || !member) return this.error(client, 'session_expired', 'That game has ended')

    if (member.client && member.client !== client) this.bindings.delete(member.client)
    this.detach(client)
    member.client = client
    member.disconnectedAt = null
    this.bind(client, room, member)
    this.broadcastLobby(room)
    if (room.game) {
      this.schedule(room, true)
      this.broadcastGame(room, [])
    }
  }

  private start(room: Room, member: Member) {
    const client = member.client!
    if (room.hostId !== member.id) return this.error(client, 'forbidden', 'Only the host can start')
    if (room.game) return
    if (room.members.length < MIN_PLAYERS) {
      return this.error(client, 'rejected', 'Add a bot or invite a friend to start')
    }
    const waiting = room.members.filter((m) => !m.isBot && m.id !== room.hostId && !m.ready)
    if (waiting.length > 0) {
      return this.error(client, 'rejected', `Waiting for ${waiting.map((m) => m.name).join(', ')} to get ready`)
    }
    room.game = createMatch(
      room.members.map(({ id, name, avatar, isBot, botLevel }) => ({ id, name, avatar, isBot, botLevel })),
      room.settings,
      this.rng,
    )
    this.broadcastLobby(room)
    this.commit(room, room.game, [{ type: 'roundStarted', round: 1 }])
  }

  private removeMember(room: Room, member: Member, reason: 'left' | 'kicked' | 'expired') {
    room.members = room.members.filter((m) => m.id !== member.id)
    if (member.client) {
      member.client.send({ t: 'left', reason })
      this.bindings.delete(member.client)
      member.client = null
    }

    if (!room.members.some((m) => !m.isBot)) {
      this.clearTimers(room)
      for (const watcher of room.watchers.keys()) {
        watcher.send({ t: 'error', code: 'room_not_found', message: 'The table closed' })
        this.watching.delete(watcher)
      }
      room.watchers.clear()
      this.rooms.delete(room.code)
      return
    }
    if (room.hostId === member.id) {
      room.hostId = (room.members.find((m) => !m.isBot && m.client) ?? room.members.find((m) => !m.isBot))!.id
    }
    if (room.game) {
      const { state, events } = removePlayer(room.game, member.id)
      this.commit(room, state, events)
    }
    this.broadcastLobby(room)
  }

  private cheer(
    room: Room,
    opts: { key: string; name: string; playerId: string | null; emoji: Reaction; targetId?: string; spectator: boolean },
  ) {
    const now = this.now()
    if (now - (room.lastReaction.get(opts.key) ?? 0) < REACTION_COOLDOWN_MS) return
    room.lastReaction.set(opts.key, now)
    const known =
      opts.targetId &&
      (room.members.some((m) => m.id === opts.targetId) || room.game?.players.some((p) => p.id === opts.targetId))
    this.broadcast(room, {
      t: 'cheer',
      from: opts.name,
      emoji: opts.emoji,
      targetId: known ? opts.targetId! : null,
      spectator: opts.spectator,
    })
  }

  // Game loop

  private commit(room: Room, state: GameState, events: GameEvent[]) {
    room.game = state
    this.schedule(room)
    this.broadcastGame(room, events)
  }

  private schedule(room: Room, force = false) {
    const game = room.game
    if (!game) return this.clearTimers(room)

    if (game.phase === 'playing') {
      if (force || room.scheduledTurnId !== game.turnId) {
        this.clearTurnTimers(room)
        room.scheduledTurnId = game.turnId
        const player = currentPlayer(game)
        const turnId = game.turnId
        if (player.isBot) {
          const [min, max] = this.opts.botDelayMs
          room.turnTimer = setTimeout(() => this.runBot(room, player.id, turnId), min + this.rng() * (max - min))
        } else {
          const online = !!room.members.find((m) => m.id === player.id)?.client
          const limits = [
            game.settings.turnSeconds > 0 ? game.settings.turnSeconds * 1000 : Infinity,
            online ? Infinity : this.opts.offlineTurnMs,
          ]
          const ms = Math.min(...limits)
          if (Number.isFinite(ms)) {
            room.deadline = this.now() + ms
            room.turnTimer = setTimeout(() => this.timeout(room, player.id, turnId), ms)
          }
        }
      }
    } else {
      this.clearTurnTimers(room)
      room.scheduledTurnId = null
      if (game.phase === 'roundOver' && !room.roundTimer) {
        room.deadline = this.now() + this.opts.roundBreakMs
        room.roundTimer = setTimeout(() => this.advanceRound(room), this.opts.roundBreakMs)
      }
    }
    this.scheduleCatches(room)
  }

  private scheduleCatches(room: Room) {
    const game = room.game
    const catchable = game?.phase === 'playing' ? game.players.filter(isCatchable) : []
    const ids = new Set(catchable.map((p) => p.id))
    for (const [id, timer] of room.catchTimers) {
      if (!ids.has(id)) {
        if (timer) clearTimeout(timer)
        room.catchTimers.delete(id)
      }
    }
    if (!game) return

    for (const target of catchable) {
      if (room.catchTimers.has(target.id)) continue
      let fastest: { botId: string; delay: number } | null = null
      for (const bot of game.players) {
        if (!bot.isBot || bot.eliminated || bot.id === target.id) continue
        const profile = BOT_CATCH[bot.botLevel ?? 'normal']
        if (this.rng() >= profile.chance) continue
        const [min, max] = profile.delayMs
        const delay = min + this.rng() * (max - min)
        if (!fastest || delay < fastest.delay) fastest = { botId: bot.id, delay }
      }
      const catcher = fastest
      room.catchTimers.set(
        target.id,
        catcher
          ? setTimeout(() => {
              room.catchTimers.set(target.id, null)
              if (!room.game) return
              const result = applyAction(room.game, catcher.botId, { type: 'catch', targetId: target.id }, this.rng)
              if (result.ok) this.commit(room, result.state, result.events)
            }, catcher.delay)
          : null,
      )
    }
  }

  private runBot(room: Room, botId: string, turnId: number) {
    room.turnTimer = null
    let state = room.game
    if (!state || state.phase !== 'playing' || state.turnId !== turnId) return
    const events: GameEvent[] = []
    for (const action of chooseBotMove(state, botId, this.rng)) {
      const result = applyAction(state, botId, action, this.rng)
      if (!result.ok) break
      state = result.state
      events.push(...result.events)
    }
    if (events.length === 0 || state.turnId === turnId) {
      // A bot must always move on; fall back to market if its choice was rejected.
      const result = applyTimeout(state, botId, this.rng)
      if (result.ok) {
        state = result.state
        events.push(...result.events)
      }
    }
    this.commit(room, state, events)
  }

  private timeout(room: Room, playerId: string, turnId: number) {
    room.turnTimer = null
    if (!room.game || room.game.turnId !== turnId) return
    const result = applyTimeout(room.game, playerId, this.rng)
    if (result.ok) this.commit(room, result.state, result.events)
  }

  private advanceRound(room: Room) {
    if (room.roundTimer) clearTimeout(room.roundTimer)
    room.roundTimer = null
    if (!room.game || room.game.phase !== 'roundOver') return
    room.deadline = null
    const { state, events } = startNextRound(room.game, this.rng)
    this.commit(room, state, events)
  }

  private clearTurnTimers(room: Room) {
    if (room.turnTimer) clearTimeout(room.turnTimer)
    room.turnTimer = null
    room.deadline = null
  }

  private clearTimers(room: Room) {
    this.clearTurnTimers(room)
    if (room.roundTimer) clearTimeout(room.roundTimer)
    room.roundTimer = null
    room.scheduledTurnId = null
    for (const timer of room.catchTimers.values()) if (timer) clearTimeout(timer)
    room.catchTimers.clear()
  }

  // Messaging

  private broadcast(room: Room, msg: ServerMessage) {
    for (const m of room.members) m.client?.send(msg)
    for (const watcher of room.watchers.keys()) watcher.send(msg)
  }

  private broadcastLobby(room: Room) {
    this.broadcast(room, { t: 'lobby', lobby: this.lobbyView(room) })
  }

  private broadcastGame(room: Room, events: GameEvent[]) {
    const game = room.game
    if (!game) return
    const isConnected = (id: string) => !!room.members.find((m) => m.id === id)?.client
    for (const m of room.members) {
      m.client?.send({ t: 'game', view: toView(game, m.id, { isConnected, deadline: room.deadline }), events })
    }
    if (room.watchers.size > 0) {
      const view = this.spectatorView(room)
      for (const watcher of room.watchers.keys()) watcher.send({ t: 'game', view, events })
    }
  }

  private lobbyView(room: Room): LobbyView {
    return {
      code: room.code,
      hostId: room.hostId,
      settings: room.settings,
      inGame: !!room.game,
      watchers: room.watchers.size,
      members: room.members.map((m) => ({
        id: m.id,
        name: m.name,
        avatar: m.avatar,
        isBot: m.isBot,
        botLevel: m.botLevel,
        ready: m.isBot || m.id === room.hostId || m.ready,
        connected: m.isBot || !!m.client,
      })),
    }
  }

  private error(client: Client, code: ErrorCode, message: string) {
    client.send({ t: 'error', code, message })
  }

  // Helpers

  private context(client: Client) {
    const binding = this.bindings.get(client)
    if (!binding) return null
    const room = this.rooms.get(binding.code)
    const member = room?.members.find((m) => m.id === binding.memberId)
    return room && member ? { room, member } : null
  }

  private bind(client: Client, room: Room, member: Member) {
    this.bindings.set(client, { code: room.code, memberId: member.id })
    client.send({ t: 'welcome', code: room.code, playerId: member.id, sessionId: member.sessionId })
  }

  /** A client starting a new room or join leaves whatever room it was in. */
  private detach(client: Client) {
    const ctx = this.context(client)
    if (ctx) this.removeMember(ctx.room, ctx.member, 'left')
  }

  private makeHuman(name: string, avatar: string, client: Client): Member {
    return {
      id: `p_${randomBytes(6).toString('hex')}`,
      name,
      avatar,
      isBot: false,
      ready: false,
      sessionId: randomUUID(),
      client,
      disconnectedAt: null,
    }
  }

  private makeBot(room: Room, level: BotLevel): Member {
    const taken = new Set(room.members.map((m) => m.name))
    const name = BOT_NAMES.find((n) => !taken.has(n)) ?? `Bot ${room.members.length + 1}`
    return {
      id: `b_${randomBytes(6).toString('hex')}`,
      name,
      avatar: BOT_AVATAR,
      isBot: true,
      botLevel: level,
      ready: true,
      sessionId: '',
      client: null,
      disconnectedAt: null,
    }
  }

  private uniqueName(room: Room, name: string): string {
    const taken = new Set(room.members.map((m) => m.name.toLowerCase()))
    if (!taken.has(name.toLowerCase())) return name
    for (let i = 2; ; i++) {
      const candidate = `${name.slice(0, 13)} ${i}`
      if (!taken.has(candidate.toLowerCase())) return candidate
    }
  }

  private uniqueCode(): string {
    for (;;) {
      let code = ''
      for (let i = 0; i < ROOM_CODE_LENGTH; i++) code += CODE_CHARS[randomInt(CODE_CHARS.length)]
      if (!this.rooms.has(code)) return code
    }
  }
}
