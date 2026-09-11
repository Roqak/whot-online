import { create } from 'zustand'
import { toast } from 'sonner'
import type { BotLevel, GameEvent, GameSettings, GameView, Suit } from '../types/game'
import { AVATARS } from '../lib/avatars'
import { playSound, setSoundEnabled } from '../lib/sound'
import { ConnectionStatus, GameConnection, socketUrl } from '../net/connection'
import { ClientMessage, LobbyView, Reaction, ServerMessage, normalizeRoomCode } from '../net/protocol'

export interface Profile {
  name: string
  avatar: string
}

interface Session {
  code: string
  playerId: string
  sessionId: string
}

export interface EventBatch {
  seq: number
  events: GameEvent[]
  view: GameView
}

export interface ReactionBubble {
  key: number
  playerId: string
  emoji: Reaction
}

export type HandSort = 'shape' | 'number' | 'none'

interface StoreState {
  status: ConnectionStatus
  profile: Profile
  session: Session | null
  lobby: LobbyView | null
  game: GameView | null
  lastBatch: EventBatch | null
  reactions: ReactionBubble[]
  /** Card sent to the server but not yet confirmed; shown as already played. */
  pendingCardId: string | null
  busy: 'create' | 'join' | 'quick' | null
  formError: string | null
  inviteCode: string | null
  soundOn: boolean
  handSort: HandSort

  setProfile: (profile: Partial<Profile>) => void
  createRoom: (opts?: { quickPlay?: boolean }) => void
  joinRoom: (code: string) => void
  leaveRoom: () => void
  setReady: (ready: boolean) => void
  addBot: (level: BotLevel) => void
  removePlayer: (playerId: string) => void
  updateSettings: (settings: Partial<GameSettings>) => void
  startGame: () => void
  playCard: (cardId: string, requestedShape?: Suit) => void
  drawCard: () => void
  callLastCard: () => void
  catchPlayer: (targetId: string) => void
  nextRound: () => void
  backToLobby: () => void
  react: (emoji: Reaction) => void
  toggleSound: () => void
  cycleHandSort: () => void
  clearFormError: () => void
}

const storage = {
  get<T>(store: Storage | undefined, key: string, fallback: T): T {
    try {
      const raw = store?.getItem(key)
      return raw ? (JSON.parse(raw) as T) : fallback
    } catch {
      return fallback
    }
  },
  set(store: Storage | undefined, key: string, value: unknown) {
    try {
      if (value === null) store?.removeItem(key)
      else store?.setItem(key, JSON.stringify(value))
    } catch {
      // Private mode or storage disabled: settings just won't persist.
    }
  },
}

const local = typeof window !== 'undefined' ? window.localStorage : undefined
// Per tab, so two tabs can sit at the same table.
const tab = typeof window !== 'undefined' ? window.sessionStorage : undefined

function inviteFromUrl(): string | null {
  if (typeof window === 'undefined') return null
  const match = window.location.pathname.match(/^\/r\/([A-Za-z0-9]{4,8})\/?$/)
  const code = match?.[1] ?? new URLSearchParams(window.location.search).get('room')
  return code ? normalizeRoomCode(code) : null
}

function setUrl(path: string) {
  if (typeof window !== 'undefined' && window.location.pathname !== path) {
    window.history.replaceState(null, '', path)
  }
}

let connection: GameConnection | null = null
let quickPlayPending = false
let batchSeq = 0
let reactionSeq = 0

export const useGameStore = create<StoreState>((set, get) => {
  const send = (msg: ClientMessage) => {
    if (!connection) {
      connection = new GameConnection(socketUrl(), {
        onMessage: handleMessage,
        onStatus: (status) => set({ status }),
        onOpen: () => {
          const { session } = get()
          if (session) connection!.send({ t: 'resume', code: session.code, sessionId: session.sessionId })
        },
      })
    }
    connection.send(msg)
  }

  const clearRoom = () => {
    storage.set(tab, 'whot:session', null)
    set({ session: null, lobby: null, game: null, lastBatch: null, pendingCardId: null, busy: null })
    setUrl('/')
  }

  function handleMessage(msg: ServerMessage) {
    switch (msg.t) {
      case 'welcome': {
        const session = { code: msg.code, playerId: msg.playerId, sessionId: msg.sessionId }
        storage.set(tab, 'whot:session', session)
        set({ session, busy: null, formError: null, inviteCode: null })
        setUrl(`/r/${msg.code}`)
        if (quickPlayPending) {
          quickPlayPending = false
          send({ t: 'addBot', level: 'normal' })
          send({ t: 'addBot', level: 'normal' })
          send({ t: 'start' })
        }
        break
      }
      case 'lobby':
        set((s) => ({
          lobby: msg.lobby,
          game: msg.lobby.inGame ? s.game : null,
          pendingCardId: msg.lobby.inGame ? s.pendingCardId : null,
        }))
        break
      case 'game':
        set({
          game: msg.view,
          pendingCardId: null,
          lastBatch: { seq: ++batchSeq, events: msg.events, view: msg.view },
        })
        break
      case 'left':
        clearRoom()
        if (msg.reason === 'kicked') toast('The host removed you from the room')
        if (msg.reason === 'expired') toast('You were away too long and lost your seat')
        break
      case 'error':
        if (msg.code === 'session_expired') {
          const hadRoom = !!get().lobby
          clearRoom()
          if (hadRoom) toast('That game has ended')
          break
        }
        if (get().busy) {
          quickPlayPending = false
          set({ busy: null, formError: msg.message })
          break
        }
        set({ pendingCardId: null })
        playSound('error')
        toast.error(msg.message, { id: 'server-error' })
        break
      case 'reaction': {
        const bubble = { key: ++reactionSeq, playerId: msg.playerId, emoji: msg.emoji }
        set((s) => ({ reactions: [...s.reactions.slice(-8), bubble] }))
        setTimeout(() => set((s) => ({ reactions: s.reactions.filter((r) => r.key !== bubble.key) })), 2600)
        break
      }
      case 'pong':
        break
    }
  }

  const session = storage.get<Session | null>(tab, 'whot:session', null)
  const soundOn = storage.get(local, 'whot:sound', true)
  setSoundEnabled(soundOn)
  if (session) queueMicrotask(() => send({ t: 'ping' }))

  const randomAvatar = AVATARS[Math.floor(Math.random() * AVATARS.length)].id

  return {
    status: 'idle',
    profile: storage.get(local, 'whot:profile', { name: '', avatar: randomAvatar }),
    session,
    lobby: null,
    game: null,
    lastBatch: null,
    reactions: [],
    pendingCardId: null,
    busy: null,
    formError: null,
    inviteCode: inviteFromUrl(),
    soundOn,
    handSort: storage.get<HandSort>(local, 'whot:sort', 'shape'),

    setProfile: (patch) => {
      const profile = { ...get().profile, ...patch }
      storage.set(local, 'whot:profile', profile)
      set({ profile, formError: null })
    },

    createRoom: (opts) => {
      const { profile } = get()
      quickPlayPending = !!opts?.quickPlay
      set({ busy: opts?.quickPlay ? 'quick' : 'create', formError: null })
      send({ t: 'create', name: profile.name, avatar: profile.avatar })
    },

    joinRoom: (code) => {
      const { profile } = get()
      set({ busy: 'join', formError: null })
      send({ t: 'join', code: normalizeRoomCode(code), name: profile.name, avatar: profile.avatar })
    },

    leaveRoom: () => {
      if (get().session) send({ t: 'leave' })
      clearRoom()
    },

    setReady: (ready) => send({ t: 'ready', ready }),
    addBot: (level) => send({ t: 'addBot', level }),
    removePlayer: (playerId) => send({ t: 'remove', playerId }),
    updateSettings: (settings) => send({ t: 'settings', settings }),
    startGame: () => send({ t: 'start' }),

    playCard: (cardId, requestedShape) => {
      if (get().pendingCardId) return
      set({ pendingCardId: cardId })
      send({ t: 'action', action: { type: 'play', cardId, requestedShape } })
    },
    drawCard: () => send({ t: 'action', action: { type: 'draw' } }),
    callLastCard: () => send({ t: 'action', action: { type: 'lastCard' } }),
    catchPlayer: (targetId) => send({ t: 'action', action: { type: 'catch', targetId } }),
    nextRound: () => send({ t: 'nextRound' }),
    backToLobby: () => send({ t: 'backToLobby' }),
    react: (emoji) => send({ t: 'react', emoji }),

    toggleSound: () => {
      const soundOn = !get().soundOn
      setSoundEnabled(soundOn)
      storage.set(local, 'whot:sound', soundOn)
      set({ soundOn })
    },

    cycleHandSort: () => {
      const order: HandSort[] = ['shape', 'number', 'none']
      const handSort = order[(order.indexOf(get().handSort) + 1) % order.length]
      storage.set(local, 'whot:sort', handSort)
      set({ handSort })
    },

    clearFormError: () => set({ formError: null }),
  }
})
