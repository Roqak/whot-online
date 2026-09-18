import type { BotLevel, GameAction, GameEvent, GameSettings, GameView, Suit } from '../types/game'
import { SUITS } from '../types/game'

export const WS_PATH = '/ws'
export const MAX_NAME_LENGTH = 16

// The Android app serves the bundled game from a WebViewAssetLoader virtual
// origin (appassets.androidplatform.net) so its ES modules load, but that
// host isn't reachable by anyone else and has no real server behind it.
// Share links and the game socket both need the real production origin
// instead whenever we're running inside that shell.
const PACKAGED_HOST = 'appassets.androidplatform.net'
const PRODUCTION_ORIGIN = 'https://lastcard.fun'

export function publicOrigin(): string {
  if (typeof window === 'undefined') return PRODUCTION_ORIGIN
  return window.location.host === PACKAGED_HOST ? PRODUCTION_ORIGIN : window.location.origin
}
export const ROOM_CODE_LENGTH = 6
export const REACTIONS = ['👏', '😂', '😱', '🔥', '😤', '🙏'] as const
export type Reaction = (typeof REACTIONS)[number]

export interface LobbyMember {
  id: string
  name: string
  avatar: string
  isBot: boolean
  botLevel?: BotLevel
  ready: boolean
  connected: boolean
}

export interface LobbyView {
  code: string
  hostId: string
  members: LobbyMember[]
  settings: GameSettings
  inGame: boolean
  /** People watching without a seat. */
  watchers: number
}

export type ClientMessage =
  | { t: 'create'; name: string; avatar: string }
  | { t: 'join'; code: string; name: string; avatar: string }
  | { t: 'resume'; code: string; sessionId: string }
  | { t: 'watch'; code: string; name: string }
  | { t: 'leave' }
  | { t: 'ready'; ready: boolean }
  | { t: 'addBot'; level: BotLevel }
  | { t: 'remove'; playerId: string }
  | { t: 'settings'; settings: Partial<GameSettings> }
  | { t: 'start' }
  | { t: 'action'; action: GameAction }
  | { t: 'nextRound' }
  | { t: 'backToLobby' }
  | { t: 'react'; emoji: Reaction; targetId?: string }
  | { t: 'ping' }

export type ErrorCode =
  | 'room_not_found'
  | 'room_full'
  | 'in_progress'
  | 'session_expired'
  | 'invalid'
  | 'forbidden'
  | 'rejected'

export type ServerMessage =
  | { t: 'welcome'; code: string; playerId: string; sessionId: string }
  | { t: 'watching'; code: string }
  | { t: 'lobby'; lobby: LobbyView }
  | { t: 'game'; view: GameView; events: GameEvent[] }
  | { t: 'left'; reason: 'left' | 'kicked' | 'expired' }
  | { t: 'error'; code: ErrorCode; message: string }
  | { t: 'cheer'; from: string; emoji: Reaction; targetId: string | null; spectator: boolean }
  | { t: 'pong' }

const BOT_LEVELS: BotLevel[] = ['easy', 'normal', 'hard']

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null
const isStr = (v: unknown, max = 64): v is string => typeof v === 'string' && v.length <= max

function parseAction(v: unknown): GameAction | null {
  if (!isObj(v)) return null
  switch (v.type) {
    case 'play':
      if (!isStr(v.cardId)) return null
      if (v.requestedShape !== undefined && !SUITS.includes(v.requestedShape as Suit)) return null
      return { type: 'play', cardId: v.cardId, requestedShape: v.requestedShape as Suit | undefined }
    case 'draw':
    case 'lastCard':
      return { type: v.type }
    case 'catch':
      return isStr(v.targetId) ? { type: 'catch', targetId: v.targetId } : null
    default:
      return null
  }
}

/** Validates an untrusted message from a client. Returns null when malformed. */
export function parseClientMessage(raw: unknown): ClientMessage | null {
  if (!isObj(raw) || typeof raw.t !== 'string') return null
  switch (raw.t) {
    case 'create':
      return isStr(raw.name) && isStr(raw.avatar) ? { t: 'create', name: raw.name, avatar: raw.avatar } : null
    case 'join':
      return isStr(raw.code, 12) && isStr(raw.name) && isStr(raw.avatar)
        ? { t: 'join', code: raw.code, name: raw.name, avatar: raw.avatar }
        : null
    case 'resume':
      return isStr(raw.code, 12) && isStr(raw.sessionId)
        ? { t: 'resume', code: raw.code, sessionId: raw.sessionId }
        : null
    case 'watch':
      return isStr(raw.code, 12) && isStr(raw.name) ? { t: 'watch', code: raw.code, name: raw.name } : null
    case 'ready':
      return typeof raw.ready === 'boolean' ? { t: 'ready', ready: raw.ready } : null
    case 'addBot':
      return BOT_LEVELS.includes(raw.level as BotLevel) ? { t: 'addBot', level: raw.level as BotLevel } : null
    case 'remove':
      return isStr(raw.playerId) ? { t: 'remove', playerId: raw.playerId } : null
    case 'settings':
      return isObj(raw.settings) ? { t: 'settings', settings: raw.settings as Partial<GameSettings> } : null
    case 'action': {
      const action = parseAction(raw.action)
      return action ? { t: 'action', action } : null
    }
    case 'react':
      if (!REACTIONS.includes(raw.emoji as Reaction)) return null
      if (raw.targetId !== undefined && !isStr(raw.targetId)) return null
      return { t: 'react', emoji: raw.emoji as Reaction, targetId: raw.targetId as string | undefined }
    case 'leave':
    case 'start':
    case 'nextRound':
    case 'backToLobby':
    case 'ping':
      return { t: raw.t }
    default:
      return null
  }
}

export function cleanName(name: string): string {
  // eslint-disable-next-line no-control-regex
  return name.replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim().slice(0, MAX_NAME_LENGTH)
}

export function normalizeRoomCode(code: string): string {
  return code
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, ROOM_CODE_LENGTH)
}

export function playUrl(code: string): string {
  return `${publicOrigin()}/r/${code}`
}

export function watchUrl(code: string): string {
  return `${publicOrigin()}/w/${code}`
}
