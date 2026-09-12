import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { seededRng } from '../engine/gameEngine'
import { LocalTable } from './localTable'
import type { ClientMessage, ServerMessage } from './protocol'

type Msg<T extends ServerMessage['t']> = Extract<ServerMessage, { t: T }>

describe('LocalTable', () => {
  let sent: ServerMessage[]
  let table: LocalTable

  const last = <T extends ServerMessage['t']>(t: T): Msg<T> | undefined =>
    [...sent].reverse().find((m): m is Msg<T> => m.t === t)

  const send = (msg: ClientMessage) => table.handle(msg)

  beforeEach(() => {
    vi.useFakeTimers()
    sent = []
    table = new LocalTable((msg) => sent.push(msg), {
      rng: seededRng(11),
      botDelayMs: [10, 10],
      roundBreakMs: 500,
    })
  })

  afterEach(() => {
    table.dispose()
    vi.useRealTimers()
  })

  const startGame = (bots = 2) => {
    send({ t: 'create', name: 'Akin', avatar: 'lion' })
    for (let i = 0; i < bots; i++) send({ t: 'addBot', level: 'normal' })
    send({ t: 'start' })
  }

  it('seats the player and deals a hand without any server', () => {
    startGame()
    expect(last('welcome')?.playerId).toBe('you')
    const view = last('game')!.view
    expect(view.myHand).toHaveLength(5)
    expect(view.players).toHaveLength(3)
    expect(view.players.filter((p) => p.isBot)).toHaveLength(2)
  })

  it('refuses a second seat at the table and fills up at six', () => {
    send({ t: 'create', name: 'Akin', avatar: 'lion' })
    for (let i = 0; i < 6; i++) send({ t: 'addBot', level: 'easy' })
    expect(last('error')?.code).toBe('room_full')
    expect(last('lobby')!.lobby.members).toHaveLength(6)
  })

  it('will not start alone', () => {
    send({ t: 'create', name: 'Akin', avatar: 'lion' })
    send({ t: 'start' })
    expect(last('error')?.message).toContain('Add a bot')
    expect(last('game')).toBeUndefined()
  })

  it('plays bot turns on a timer and keeps the game moving', () => {
    startGame()
    let turns = 0
    for (let i = 0; i < 40; i++) {
      const view = last('game')!.view
      if (view.phase !== 'playing') break
      if (view.turnPlayerId === 'you') send({ t: 'action', action: { type: 'draw' } })
      else vi.advanceTimersByTime(20)
      turns++
    }
    expect(turns).toBeGreaterThan(5)
    expect(last('game')!.view.turnId).toBeGreaterThan(3)
  })

  it('rejects an illegal move with a reason', () => {
    startGame()
    const view = last('game')!.view
    if (view.turnPlayerId !== 'you') {
      vi.advanceTimersByTime(200)
    }
    send({ t: 'action', action: { type: 'play', cardId: 'not-a-card' } })
    expect(last('error')?.code).toBe('rejected')
  })

  it('honours table settings and starts the next round on its own', () => {
    send({ t: 'create', name: 'Akin', avatar: 'lion' })
    send({ t: 'settings', settings: { handSize: 3, turnSeconds: 0 } })
    send({ t: 'addBot', level: 'hard' })
    send({ t: 'start' })
    expect(last('game')!.view.myHand).toHaveLength(3)

    // Let the bot and the auto-draw timer push the round to an end.
    for (let i = 0; i < 300 && last('game')!.view.phase === 'playing'; i++) {
      const view = last('game')!.view
      if (view.turnPlayerId === 'you') send({ t: 'action', action: { type: 'draw' } })
      else vi.advanceTimersByTime(20)
    }
    const view = last('game')!.view
    expect(['roundOver', 'matchOver']).toContain(view.phase)

    if (view.phase === 'roundOver') {
      vi.advanceTimersByTime(600)
      expect(last('game')!.view.round).toBe(2)
    }
  })

  it('echoes cheers back so the interface behaves the same as online', () => {
    startGame(1)
    send({ t: 'react', emoji: '👏' })
    expect(last('cheer')).toMatchObject({ emoji: '👏', from: 'Akin', spectator: false })
  })

  it('has no room to watch', () => {
    startGame(1)
    send({ t: 'watch', code: 'SOLO', name: 'Nosy' })
    expect(last('error')?.code).toBe('room_not_found')
  })
})
