import { create } from 'zustand'

export type GameScreen = 'landing' | 'lobby' | 'game'

export interface Player {
  id: string
  name: string
  avatarSeed: string
  cardCount: number
  isHost: boolean
  isReady: boolean
  isBot: boolean
  score: number
  isCurrentTurn: boolean
}

export interface GameState {
  screen: GameScreen
  roomCode: string | null
  playerName: string
  playerAvatar: string
  isHost: boolean
  players: Player[]
  gameStarted: boolean
  
  // Actions
  setScreen: (screen: GameScreen) => void
  setRoomCode: (code: string | null) => void
  setPlayerName: (name: string) => void
  setPlayerAvatar: (avatar: string) => void
  setIsHost: (isHost: boolean) => void
  setPlayers: (players: Player[] | ((prev: Player[]) => Player[])) => void
  setGameStarted: (started: boolean) => void
  createRoom: (name: string, avatar: string) => void
  joinRoom: (code: string, name: string, avatar: string) => void
  leaveRoom: () => void
  addBot: (difficulty: 'easy' | 'normal' | 'hard') => void
  removeBot: (playerId: string) => void
  kickPlayer: (playerId: string) => void
  toggleReady: () => void
  startGame: () => void
  updatePlayerCardCount: (playerId: string, count: number) => void
}

const generateRoomCode = (): string => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)]
  }
  return code
}

export const useGameStore = create<GameState>((set, get) => ({
  screen: 'landing',
  roomCode: null,
  playerName: '',
  playerAvatar: '',
  isHost: false,
  players: [],
  gameStarted: false,

  setScreen: (screen) => set({ screen }),
  setRoomCode: (code) => set({ roomCode: code }),
  setPlayerName: (name) => set({ playerName: name }),
  setPlayerAvatar: (avatar) => set({ playerAvatar: avatar }),
  setIsHost: (isHost) => set({ isHost }),
  setPlayers: (players) => set((state) => ({
    players: typeof players === 'function' ? players(state.players) : players
  })),
  setGameStarted: (started) => set({ gameStarted: started }),

  createRoom: (name, avatar) => {
    const code = generateRoomCode()
    const playerId = `player_${Date.now()}`
    const hostPlayer: Player = {
      id: playerId,
      name,
      avatarSeed: avatar,
      cardCount: 0,
      isHost: true,
      isReady: false,
      isBot: false,
      score: 0,
      isCurrentTurn: false,
    }
    set({
      screen: 'lobby',
      roomCode: code,
      playerName: name,
      playerAvatar: avatar,
      isHost: true,
      players: [hostPlayer],
      gameStarted: false,
    })
  },

  joinRoom: (code, name, avatar) => {
    const playerId = `player_${Date.now()}`
    const newPlayer: Player = {
      id: playerId,
      name,
      avatarSeed: avatar,
      cardCount: 0,
      isHost: false,
      isReady: false,
      isBot: false,
      score: 0,
      isCurrentTurn: false,
    }
    set({
      screen: 'lobby',
      roomCode: code,
      playerName: name,
      playerAvatar: avatar,
      isHost: false,
      players: [newPlayer],
      gameStarted: false,
    })
  },

  leaveRoom: () => set({
    screen: 'landing',
    roomCode: null,
    isHost: false,
    players: [],
    gameStarted: false,
  }),

  addBot: (_difficulty) => {
    const { players } = get()
    if (players.length >= 6) return
    const botNames = ['Bot Tunde', 'Bot Ada', 'Bot Chidi', 'Bot Ngozi', 'Bot Emeka']
    const botName = botNames[players.filter(p => p.isBot).length]
    const botId = `bot_${Date.now()}`
    const botPlayer: Player = {
      id: botId,
      name: botName,
      avatarSeed: 'Bot',
      cardCount: 0,
      isHost: false,
      isReady: true,
      isBot: true,
      score: 0,
      isCurrentTurn: false,
    }
    set((state) => ({
      players: [...state.players, botPlayer]
    }))
  },

  removeBot: (playerId) => {
    set((state) => ({
      players: state.players.filter(p => p.id !== playerId)
    }))
  },

  kickPlayer: (playerId) => {
    set((state) => ({
      players: state.players.filter(p => p.id !== playerId)
    }))
  },

  toggleReady: () => {
    set((state) => ({
      players: state.players.map(p =>
        p.name === state.playerName ? { ...p, isReady: !p.isReady } : p
      )
    }))
  },

  startGame: () => {
    set({ screen: 'game', gameStarted: true })
  },

  updatePlayerCardCount: (playerId, count) => {
    set((state) => ({
      players: state.players.map(p =>
        p.id === playerId ? { ...p, cardCount: count } : p
      )
    }))
  },
}))
