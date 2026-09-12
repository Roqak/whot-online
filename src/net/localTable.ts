import { BOT_CATCH, BOT_NAMES, chooseBotMove } from '../engine/bot'
import {
  MAX_PLAYERS,
  MIN_PLAYERS,
  Rng,
  applyAction,
  applyTimeout,
  createMatch,
  cryptoRng,
  currentPlayer,
  isCatchable,
  startNextRound,
  toView,
} from '../engine/gameEngine'
import { BOT_AVATAR } from '../lib/avatars'
import { BotLevel, DEFAULT_SETTINGS, GameEvent, GameSettings, GameState, sanitizeSettings } from '../types/game'
import { ClientMessage, LobbyView, ServerMessage, cleanName } from './protocol'

/**
 * The whole game, in the browser, with no server.
 *
 * It speaks the same message protocol as the real server, so the interface cannot
 * tell the difference. Used for the portal build (which must be backend-free) and
 * as a solo mode. The rules and the bots come from the same modules the server
 * uses, so the two can never drift apart.
 */

const LOCAL_CODE = 'SOLO'
const ME = 'you'

type Timer = ReturnType<typeof setTimeout>

interface Member {
  id: string
  name: string
  avatar: string
  isBot: boolean
  botLevel?: BotLevel
}

export interface LocalTableOptions {
  rng?: Rng
  botDelayMs?: [number, number]
  roundBreakMs?: number
  now?: () => number
}

export class LocalTable {
  private members: Member[] = []
  private settings: GameSettings = { ...DEFAULT_SETTINGS }
  private game: GameState | null = null
  private deadline: number | null = null
  private scheduledTurnId: number | null = null
  private turnTimer: Timer | null = null
  private roundTimer: Timer | null = null
  private catchTimers = new Map<string, Timer | null>()
  private rng: Rng
  private now: () => number
  private botDelayMs: [number, number]
  private roundBreakMs: number

  constructor(
    private emit: (msg: ServerMessage) => void,
    options: LocalTableOptions = {},
  ) {
    this.rng = options.rng ?? cryptoRng
    this.now = options.now ?? Date.now
    this.botDelayMs = options.botDelayMs ?? [1300, 2200]
    this.roundBreakMs = options.roundBreakMs ?? 15_000
  }

  handle(msg: ClientMessage) {
    switch (msg.t) {
      case 'ping':
        return this.emit({ t: 'pong' })
      case 'create':
      case 'join':
        return this.seat(msg.name, msg.avatar)
      case 'watch':
        return this.emit({ t: 'error', code: 'room_not_found', message: 'Watching needs the online game' })
      case 'resume':
        return this.emit({ t: 'error', code: 'session_expired', message: 'No table to rejoin' })
      case 'ready':
        return
      case 'addBot': {
        if (this.game) return this.error('in_progress', 'The game has already started')
        if (this.members.length >= MAX_PLAYERS) return this.error('room_full', 'The table is full')
        this.members.push(this.makeBot(msg.level))
        return this.sendLobby()
      }
      case 'remove': {
        if (this.game || msg.playerId === ME) return
        this.members = this.members.filter((m) => m.id !== msg.playerId)
        return this.sendLobby()
      }
      case 'settings':
        if (this.game) return
        this.settings = sanitizeSettings(msg.settings, this.settings)
        return this.sendLobby()
      case 'start':
        return this.start()
      case 'action': {
        if (!this.game) return this.error('rejected', 'No game in progress')
        const result = applyAction(this.game, ME, msg.action, this.rng)
        if (!result.ok) return this.error('rejected', result.error)
        return this.commit(result.state, result.events)
      }
      case 'nextRound':
        return this.advanceRound()
      case 'backToLobby':
        if (this.game?.phase !== 'matchOver') return
        this.clearTimers()
        this.game = null
        this.deadline = null
        return this.sendLobby()
      case 'react':
        return this.emit({
          t: 'cheer',
          from: this.members.find((m) => m.id === ME)?.name ?? 'You',
          emoji: msg.emoji,
          targetId: msg.targetId ?? null,
          spectator: false,
        })
      case 'leave':
        this.reset()
        return this.emit({ t: 'left', reason: 'left' })
    }
  }

  dispose() {
    this.clearTimers()
  }

  private reset() {
    this.clearTimers()
    this.members = []
    this.settings = { ...DEFAULT_SETTINGS }
    this.game = null
    this.deadline = null
  }

  private seat(rawName: string, avatar: string) {
    const name = cleanName(rawName) || 'You'
    this.reset()
    this.members = [{ id: ME, name, avatar, isBot: false }]
    this.emit({ t: 'welcome', code: LOCAL_CODE, playerId: ME, sessionId: LOCAL_CODE })
    this.sendLobby()
  }

  private start() {
    if (this.game) return
    if (this.members.length < MIN_PLAYERS) return this.error('rejected', 'Add a bot to start')
    this.game = createMatch(this.members, this.settings, this.rng)
    this.sendLobby()
    this.commit(this.game, [{ type: 'roundStarted', round: 1 }])
  }

  private commit(state: GameState, events: GameEvent[]) {
    this.game = state
    this.schedule()
    this.sendGame(events)
  }

  private schedule() {
    const game = this.game
    if (!game) return this.clearTimers()

    if (game.phase === 'playing') {
      if (this.scheduledTurnId !== game.turnId) {
        this.clearTurnTimer()
        this.scheduledTurnId = game.turnId
        const player = currentPlayer(game)
        const turnId = game.turnId
        if (player.isBot) {
          const [min, max] = this.botDelayMs
          this.turnTimer = setTimeout(() => this.runBot(player.id, turnId), min + this.rng() * (max - min))
        } else if (game.settings.turnSeconds > 0) {
          const ms = game.settings.turnSeconds * 1000
          this.deadline = this.now() + ms
          this.turnTimer = setTimeout(() => this.timeout(player.id, turnId), ms)
        }
      }
    } else {
      this.clearTurnTimer()
      this.scheduledTurnId = null
      if (game.phase === 'roundOver' && !this.roundTimer) {
        this.deadline = this.now() + this.roundBreakMs
        this.roundTimer = setTimeout(() => this.advanceRound(), this.roundBreakMs)
      }
    }
    this.scheduleCatches()
  }

  private scheduleCatches() {
    const game = this.game
    const catchable = game?.phase === 'playing' ? game.players.filter(isCatchable) : []
    const ids = new Set(catchable.map((p) => p.id))
    for (const [id, timer] of this.catchTimers) {
      if (!ids.has(id)) {
        if (timer) clearTimeout(timer)
        this.catchTimers.delete(id)
      }
    }
    if (!game) return

    for (const target of catchable) {
      if (this.catchTimers.has(target.id)) continue
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
      this.catchTimers.set(
        target.id,
        catcher
          ? setTimeout(() => {
              this.catchTimers.set(target.id, null)
              if (!this.game) return
              const result = applyAction(this.game, catcher.botId, { type: 'catch', targetId: target.id }, this.rng)
              if (result.ok) this.commit(result.state, result.events)
            }, catcher.delay)
          : null,
      )
    }
  }

  private runBot(botId: string, turnId: number) {
    this.turnTimer = null
    let state = this.game
    if (!state || state.phase !== 'playing' || state.turnId !== turnId) return
    const events: GameEvent[] = []
    for (const action of chooseBotMove(state, botId, this.rng)) {
      const result = applyAction(state, botId, action, this.rng)
      if (!result.ok) break
      state = result.state
      events.push(...result.events)
    }
    if (events.length === 0 || state.turnId === turnId) {
      const result = applyTimeout(state, botId, this.rng)
      if (result.ok) {
        state = result.state
        events.push(...result.events)
      }
    }
    this.commit(state, events)
  }

  private timeout(playerId: string, turnId: number) {
    this.turnTimer = null
    if (!this.game || this.game.turnId !== turnId) return
    const result = applyTimeout(this.game, playerId, this.rng)
    if (result.ok) this.commit(result.state, result.events)
  }

  private advanceRound() {
    if (this.roundTimer) clearTimeout(this.roundTimer)
    this.roundTimer = null
    if (this.game?.phase !== 'roundOver') return
    this.deadline = null
    const { state, events } = startNextRound(this.game, this.rng)
    this.commit(state, events)
  }

  private clearTurnTimer() {
    if (this.turnTimer) clearTimeout(this.turnTimer)
    this.turnTimer = null
    this.deadline = null
  }

  private clearTimers() {
    this.clearTurnTimer()
    if (this.roundTimer) clearTimeout(this.roundTimer)
    this.roundTimer = null
    this.scheduledTurnId = null
    for (const timer of this.catchTimers.values()) if (timer) clearTimeout(timer)
    this.catchTimers.clear()
  }

  private sendGame(events: GameEvent[]) {
    if (!this.game) return
    this.emit({
      t: 'game',
      view: toView(this.game, ME, { isConnected: () => true, deadline: this.deadline }),
      events,
    })
  }

  private sendLobby() {
    const lobby: LobbyView = {
      code: LOCAL_CODE,
      hostId: ME,
      settings: this.settings,
      inGame: !!this.game,
      watchers: 0,
      members: this.members.map((m) => ({
        id: m.id,
        name: m.name,
        avatar: m.avatar,
        isBot: m.isBot,
        botLevel: m.botLevel,
        ready: true,
        connected: true,
      })),
    }
    this.emit({ t: 'lobby', lobby })
  }

  private error(code: 'rejected' | 'in_progress' | 'room_full', message: string) {
    this.emit({ t: 'error', code, message })
  }

  private makeBot(level: BotLevel): Member {
    const taken = new Set(this.members.map((m) => m.name))
    const name = BOT_NAMES.find((n) => !taken.has(n)) ?? `Bot ${this.members.length}`
    return { id: `bot-${this.members.length}-${name}`, name, avatar: BOT_AVATAR, isBot: true, botLevel: level }
  }
}
