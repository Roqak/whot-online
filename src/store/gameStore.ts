import { create } from 'zustand'
import { toast } from 'sonner'
import type { BotLevel, GameEvent, GameSettings, GameView, Suit } from '../types/game'
import { AVATARS } from '../lib/avatars'
import { playSound, setSoundEnabled } from '../lib/sound'
import { ConnectionStatus, GameConnection, socketUrl } from '../net/connection'
import { LocalTable } from '../net/localTable'
import { ClientMessage, LobbyView, Reaction, ServerMessage, normalizeRoomCode } from '../net/protocol'

/**
 * The portal build has no server: the game runs in the browser instead.
 * `?solo=1` turns it on in a normal build for testing.
 */
const LOCAL_ONLY =
  import.meta.env.VITE_LOCAL_ONLY === '1' ||
  (typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('solo'))

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

export interface Cheer {
  key: number
  from: string
  emoji: Reaction
  targetId: string | null
  spectator: boolean
}

export type HandSort = 'shape' | 'number' | 'none'

interface StoreState {
  status: ConnectionStatus
  profile: Profile
  session: Session | null
  /** Room code being watched without a seat. */
  watching: string | null
  lobby: LobbyView | null
  game: GameView | null
  lastBatch: EventBatch | null
  cheers: Cheer[]
  /** Card sent to the server but not yet confirmed; shown as already played. */
  pendingCardId: string | null
  busy: 'create' | 'join' | 'quick' | 'watch' | null
  formError: string | null
  inviteCode: string | null
  soundOn: boolean
  handSort: HandSort
  /** True when there is no server: solo against bots, for portal builds. */
  isLocal: boolean
  /** Solo mode only: bot moves and turn/round timers are frozen. */
  paused: boolean

  setProfile: (profile: Partial<Profile>) => void
  createRoom: (opts?: { quickPlay?: boolean }) => void
  joinRoom: (code: string) => void
  watchRoom: (code: string) => void
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
  cheer: (emoji: Reaction, targetId?: string) => void
  pauseGame: () => void
  resumeGame: () => void
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

function codeFromPath(prefix: 'r' | 'w'): string | null {
  if (typeof window === 'undefined') return null
  const match = window.location.pathname.match(new RegExp(`^/${prefix}/([A-Za-z0-9]{4,8})/?$`))
  const code = match?.[1] ?? (prefix === 'r' ? new URLSearchParams(window.location.search).get('room') : null)
  return code ? normalizeRoomCode(code) : null
}

function setUrl(path: string) {
  // A portal serves the game from an iframe: leave the address bar alone.
  if (LOCAL_ONLY) return
  if (typeof window !== 'undefined' && window.location.pathname !== path) {
    window.history.replaceState(null, '', path)
  }
}

let connection: GameConnection | null = null
let localTable: LocalTable | null = null
let quickPlayPending = false
let batchSeq = 0
let cheerSeq = 0

export const useGameStore = create<StoreState>((set, get) => {
  const send = (msg: ClientMessage) => {
    if (LOCAL_ONLY) {
      if (!localTable) {
        localTable = new LocalTable(handleMessage)
        set({ status: 'open' })
      }
      localTable.handle(msg)
      return
    }
    if (!connection) {
      connection = new GameConnection(socketUrl(), {
        onMessage: handleMessage,
        onStatus: (status) => set({ status }),
        onOpen: () => {
          const { session, watching, profile } = get()
          if (watching) connection!.send({ t: 'watch', code: watching, name: profile.name || 'Guest' })
          else if (session) connection!.send({ t: 'resume', code: session.code, sessionId: session.sessionId })
        },
      })
    }
    connection.send(msg)
  }

  const clearRoom = () => {
    storage.set(tab, 'whot:session', null)
    storage.set(tab, 'whot:watching', null)
    set({
      session: null,
      watching: null,
      lobby: null,
      game: null,
      lastBatch: null,
      pendingCardId: null,
      busy: null,
      cheers: [],
    })
    setUrl('/')
  }

  function handleMessage(msg: ServerMessage) {
    switch (msg.t) {
      case 'welcome': {
        const session = { code: msg.code, playerId: msg.playerId, sessionId: msg.sessionId }
        storage.set(tab, 'whot:session', session)
        storage.set(tab, 'whot:watching', null)
        set({ session, watching: null, busy: null, formError: null, inviteCode: null })
        setUrl(`/r/${msg.code}`)
        if (quickPlayPending) {
          quickPlayPending = false
          send({ t: 'addBot', level: 'normal' })
          send({ t: 'addBot', level: 'normal' })
          send({ t: 'start' })
        }
        break
      }
      case 'watching':
        storage.set(tab, 'whot:watching', msg.code)
        storage.set(tab, 'whot:session', null)
        set({ watching: msg.code, session: null, busy: null, formError: null })
        setUrl(`/w/${msg.code}`)
        break
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
        if (msg.code === 'session_expired' || (msg.code === 'room_not_found' && get().watching)) {
          const hadRoom = !!get().lobby
          clearRoom()
          if (hadRoom) toast(msg.code === 'room_not_found' ? 'That table closed' : 'That game has ended')
          break
        }
        if (get().busy) {
          quickPlayPending = false
          set({ busy: null, formError: msg.message, watching: null })
          break
        }
        set({ pendingCardId: null })
        playSound('error')
        toast.error(msg.message, { id: 'server-error' })
        break
      case 'cheer': {
        const cheer: Cheer = {
          key: ++cheerSeq,
          from: msg.from,
          emoji: msg.emoji,
          targetId: msg.targetId,
          spectator: msg.spectator,
        }
        set((s) => ({ cheers: [...s.cheers.slice(-8), cheer] }))
        setTimeout(() => set((s) => ({ cheers: s.cheers.filter((c) => c.key !== cheer.key) })), 2600)
        break
      }
      case 'pong':
        break
    }
  }

  const session = LOCAL_ONLY ? null : storage.get<Session | null>(tab, 'whot:session', null)
  const watchCode = LOCAL_ONLY ? null : (codeFromPath('w') ?? storage.get<string | null>(tab, 'whot:watching', null))
  const soundOn = storage.get(local, 'whot:sound', true)
  setSoundEnabled(soundOn)

  const randomAvatar = AVATARS[Math.floor(Math.random() * AVATARS.length)].id
  const profile = storage.get(local, 'whot:profile', { name: '', avatar: randomAvatar })

  if (watchCode) {
    queueMicrotask(() => send({ t: 'watch', code: watchCode, name: profile.name || 'Guest' }))
  } else if (session) {
    queueMicrotask(() => send({ t: 'ping' }))
  }

  return {
    status: 'idle',
    profile,
    session,
    watching: watchCode,
    lobby: null,
    game: null,
    lastBatch: null,
    cheers: [],
    pendingCardId: null,
    busy: watchCode ? 'watch' : null,
    formError: null,
    inviteCode: codeFromPath('r'),
    soundOn,
    handSort: storage.get<HandSort>(local, 'whot:sort', 'shape'),
    isLocal: LOCAL_ONLY,
    paused: false,

    setProfile: (patch) => {
      const next = { ...get().profile, ...patch }
      storage.set(local, 'whot:profile', next)
      set({ profile: next, formError: null })
    },

    createRoom: (opts) => {
      quickPlayPending = !!opts?.quickPlay
      set({ busy: opts?.quickPlay ? 'quick' : 'create', formError: null })
      send({ t: 'create', name: get().profile.name, avatar: get().profile.avatar })
    },

    joinRoom: (code) => {
      set({ busy: 'join', formError: null })
      send({ t: 'join', code: normalizeRoomCode(code), name: get().profile.name, avatar: get().profile.avatar })
    },

    watchRoom: (code) => {
      const clean = normalizeRoomCode(code)
      set({ busy: 'watch', formError: null, watching: clean })
      send({ t: 'watch', code: clean, name: get().profile.name || 'Guest' })
    },

    leaveRoom: () => {
      if (get().session || get().watching) send({ t: 'leave' })
      // Android's WebView can stop painting the entire page once the 3D
      // table's WebGL context is torn down on unmount — a GPU-compositor
      // wedge, not a JS error, so nothing throws and nothing is left to
      // recover from client-side. Only reachable inside the app
      // (`window.Android` only exists there) and only when a game (so a
      // <Canvas>) was actually mounted; a full reload sidesteps it since
      // there's no game state left to preserve once we're leaving anyway.
      if (typeof window !== 'undefined' && window.Android && get().game) {
        window.location.reload()
        return
      }
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
    cheer: (emoji, targetId) => send({ t: 'react', emoji, targetId }),

    // Only solo (LocalTable) games can pause: there's no other player whose
    // clock it would unfairly stop. Bypasses `send`/ClientMessage since the
    // server protocol has no pause concept.
    pauseGame: () => {
      if (!LOCAL_ONLY || !localTable) return
      localTable.pause()
      set({ paused: true })
    },
    resumeGame: () => {
      if (!LOCAL_ONLY || !localTable) return
      localTable.resume()
      set({ paused: false })
    },

    toggleSound: () => {
      const next = !get().soundOn
      setSoundEnabled(next)
      storage.set(local, 'whot:sound', next)
      set({ soundOn: next })
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
