import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ClientMessage, ServerMessage } from '../src/net/protocol'
import { seededRng } from '../src/engine/gameEngine'
import { Client, RoomManager } from './rooms'

type Msg<T extends ServerMessage['t']> = Extract<ServerMessage, { t: T }>

class FakeClient implements Client {
  messages: ServerMessage[] = []
  send(msg: ServerMessage) {
    this.messages.push(msg)
  }
  last<T extends ServerMessage['t']>(t: T): Msg<T> | undefined {
    return [...this.messages].reverse().find((m): m is Msg<T> => m.t === t)
  }
}

describe('RoomManager', () => {
  let manager: RoomManager

  beforeEach(() => {
    vi.useFakeTimers()
    manager = new RoomManager({ rng: seededRng(42), botDelayMs: [10, 10], roundBreakMs: 1000, offlineTurnMs: 5000 })
  })

  afterEach(() => {
    manager.dispose()
    vi.useRealTimers()
  })

  const send = (client: Client, msg: ClientMessage) => manager.handleMessage(client, msg)

  function hostRoom() {
    const host = new FakeClient()
    send(host, { t: 'create', name: 'Ada', avatar: 'lion' })
    return { host, code: host.last('welcome')!.code }
  }

  it('creates a room and lets friends join by code', () => {
    const { host, code } = hostRoom()
    expect(code).toMatch(/^[A-Z2-9]{6}$/)

    const guest = new FakeClient()
    send(guest, { t: 'join', code: code.toLowerCase(), name: 'ada', avatar: 'fox' })
    const lobby = host.last('lobby')!.lobby
    expect(lobby.members.map((m) => m.name)).toEqual(['Ada', 'ada 2'])
    expect(guest.last('lobby')!.lobby.hostId).toBe(host.last('welcome')!.playerId)
  })

  it('rejects unknown codes and bad names', () => {
    const client = new FakeClient()
    send(client, { t: 'join', code: 'ZZZZZZ', name: 'Bayo', avatar: 'lion' })
    expect(client.last('error')?.code).toBe('room_not_found')
    send(client, { t: 'create', name: '   ', avatar: 'lion' })
    expect(client.last('error')?.code).toBe('invalid')
  })

  it('waits for guests to be ready, then deals private hands', () => {
    const { host, code } = hostRoom()
    const guest = new FakeClient()
    send(guest, { t: 'join', code, name: 'Chidi', avatar: 'owl' })

    send(host, { t: 'start' })
    expect(host.last('error')?.message).toContain('Chidi')

    send(guest, { t: 'ready', ready: true })
    send(host, { t: 'start' })
    const hostView = host.last('game')!.view
    const guestView = guest.last('game')!.view
    expect(hostView.myHand).toHaveLength(5)
    expect(guestView.myHand).toHaveLength(5)
    expect(hostView.myHand).not.toEqual(guestView.myHand)
    expect(hostView.players.every((p) => p.handCount === 5)).toBe(true)
    expect(host.last('lobby')!.lobby.inGame).toBe(true)
  })

  it('refuses to join a game in progress', () => {
    const { host, code } = hostRoom()
    send(host, { t: 'addBot', level: 'easy' })
    send(host, { t: 'start' })
    const late = new FakeClient()
    send(late, { t: 'join', code, name: 'Late', avatar: 'bee' })
    expect(late.last('error')?.code).toBe('in_progress')
  })

  it('bots take their turns and the game keeps moving', () => {
    const { host } = hostRoom()
    send(host, { t: 'settings', settings: { turnSeconds: 0 } })
    send(host, { t: 'addBot', level: 'hard' })
    send(host, { t: 'addBot', level: 'easy' })
    send(host, { t: 'start' })

    const me = host.last('welcome')!.playerId
    let lastTurnId = -1
    for (let i = 0; i < 60; i++) {
      const view = host.last('game')!.view
      if (view.phase !== 'playing') break
      expect(view.turnId).toBeGreaterThanOrEqual(lastTurnId)
      lastTurnId = view.turnId
      if (view.turnPlayerId === me) send(host, { t: 'action', action: { type: 'draw' } })
      else vi.advanceTimersByTime(20)
    }
    expect(lastTurnId).toBeGreaterThan(5)
  })

  it('auto-draws when a player runs out of time', () => {
    const { host, code } = hostRoom()
    const guest = new FakeClient()
    send(guest, { t: 'join', code, name: 'Emeka', avatar: 'owl' })
    send(guest, { t: 'ready', ready: true })
    send(host, { t: 'settings', settings: { turnSeconds: 15 } })
    send(host, { t: 'start' })

    const before = host.last('game')!.view
    expect(before.deadline).toBe(Date.now() + 15_000)
    const onTurn = before.players.find((p) => p.id === before.turnPlayerId)!
    vi.advanceTimersByTime(15_000)
    const after = host.last('game')!
    expect(after.events).toContainEqual({ type: 'drew', playerId: onTurn.id, count: 1, reason: 'timeout' })
    expect(after.view.turnPlayerId).not.toBe(onTurn.id)
  })

  it('lets a disconnected player resume their seat', () => {
    const { host, code } = hostRoom()
    send(host, { t: 'addBot', level: 'normal' })
    send(host, { t: 'start' })
    const { playerId, sessionId } = host.last('welcome')!
    const hand = host.last('game')!.view.myHand

    manager.handleDisconnect(host)
    const back = new FakeClient()
    send(back, { t: 'resume', code, sessionId })
    expect(back.last('welcome')?.playerId).toBe(playerId)
    expect(back.last('game')?.view.myHand.length).toBeGreaterThanOrEqual(hand.length - 1)

    const stranger = new FakeClient()
    send(stranger, { t: 'resume', code, sessionId: 'nope' })
    expect(stranger.last('error')?.code).toBe('session_expired')
  })

  it('passes host to the next human and closes empty rooms', () => {
    const { host, code } = hostRoom()
    const guest = new FakeClient()
    send(guest, { t: 'join', code, name: 'Funmi', avatar: 'bee' })
    send(host, { t: 'leave' })
    expect(host.last('left')?.reason).toBe('left')
    const lobby = guest.last('lobby')!.lobby
    expect(lobby.hostId).toBe(guest.last('welcome')!.playerId)
    send(guest, { t: 'leave' })
    expect(manager.roomCount).toBe(0)
  })

  it('lets the host kick players and drops players who stay away', () => {
    const { host, code } = hostRoom()
    const guest = new FakeClient()
    send(guest, { t: 'join', code, name: 'Kemi', avatar: 'bee' })
    send(host, { t: 'remove', playerId: guest.last('welcome')!.playerId })
    expect(guest.last('left')?.reason).toBe('kicked')

    const other = new FakeClient()
    send(other, { t: 'join', code, name: 'Bayo', avatar: 'owl' })
    manager.handleDisconnect(other)
    vi.advanceTimersByTime(61_000)
    manager.sweep()
    expect(host.last('lobby')!.lobby.members).toHaveLength(1)
  })

  it('only the host changes settings, and values are sanitized', () => {
    const { host, code } = hostRoom()
    const guest = new FakeClient()
    send(guest, { t: 'join', code, name: 'Tunde', avatar: 'fox' })
    send(guest, { t: 'settings', settings: { handSize: 7 } })
    expect(host.last('lobby')!.lobby.settings.handSize).toBe(5)
    send(host, { t: 'settings', settings: { handSize: 99, turnSeconds: 12345 } })
    expect(host.last('lobby')!.lobby.settings).toMatchObject({ handSize: 8, turnSeconds: 30 })
  })

  it('lets spectators watch without ever seeing a hand, and blocks them from playing', () => {
    const { host, code } = hostRoom()
    send(host, { t: 'addBot', level: 'normal' })
    send(host, { t: 'start' })

    const watcher = new FakeClient()
    send(watcher, { t: 'watch', code, name: 'Nosy' })
    expect(watcher.last('watching')?.code).toBe(code)

    const view = watcher.last('game')!.view
    expect(view.myId).toBe('')
    expect(view.myHand).toEqual([])
    expect(view.players.every((p) => p.handCount === 5)).toBe(true)
    for (const card of host.last('game')!.view.myHand) {
      expect(JSON.stringify(view)).not.toContain(card.id)
    }

    send(watcher, { t: 'action', action: { type: 'draw' } })
    expect(watcher.last('error')?.code).toBe('forbidden')
    expect(host.last('lobby')!.lobby.watchers).toBe(1)
  })

  it('passes spectator cheers to the table and forgets them when they leave', () => {
    const { host, code } = hostRoom()
    const watcher = new FakeClient()
    send(watcher, { t: 'watch', code, name: 'Nosy' })
    const target = host.last('welcome')!.playerId

    send(watcher, { t: 'react', emoji: '👏', targetId: target })
    expect(host.last('cheer')).toMatchObject({ from: 'Nosy', emoji: '👏', targetId: target, spectator: true })

    manager.handleDisconnect(watcher)
    expect(host.last('lobby')!.lobby.watchers).toBe(0)
  })

  it('tells spectators when the table closes', () => {
    const { host, code } = hostRoom()
    const watcher = new FakeClient()
    send(watcher, { t: 'watch', code, name: 'Nosy' })
    send(host, { t: 'leave' })
    expect(watcher.last('error')?.code).toBe('room_not_found')
  })
})

describe('voice chat signalling', () => {
  let manager: RoomManager
  const iceServers = [{ urls: 'turn:turn.example:3478', username: 'u', credential: 'c' }]

  beforeEach(() => {
    manager = new RoomManager({ rng: seededRng(7), iceServers: async () => iceServers })
  })
  afterEach(() => manager.dispose())

  const send = (client: Client, msg: ClientMessage) => manager.handleMessage(client, msg)
  const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

  async function table() {
    const host = new FakeClient()
    send(host, { t: 'create', name: 'Ada', avatar: 'lion' })
    const code = host.last('welcome')!.code
    const guest = new FakeClient()
    send(guest, { t: 'join', code, name: 'Bayo', avatar: 'fox' })
    const watcher = new FakeClient()
    send(watcher, { t: 'watch', code, name: 'Tola' })
    return { host, guest, watcher, hostId: host.last('welcome')!.playerId, guestId: guest.last('welcome')!.playerId }
  }

  it('sends ICE servers before announcing a player in voice', async () => {
    const { host, guest, hostId } = await table()
    send(host, { t: 'voice', on: true })
    await flush()
    const iceIndex = host.messages.findIndex((m) => m.t === 'ice')
    const lobbyIndex = host.messages.findIndex((m) => m.t === 'lobby' && m.lobby.members.find((x) => x.id === hostId)?.inVoice)
    expect(host.last('ice')!.iceServers).toEqual(iceServers)
    expect(iceIndex).toBeGreaterThan(-1)
    expect(lobbyIndex).toBeGreaterThan(iceIndex)
    expect(guest.last('lobby')!.lobby.members.find((m) => m.id === hostId)!.inVoice).toBe(true)
  })

  it('relays call setup only between two players who are both in voice', async () => {
    const { host, guest, watcher, hostId, guestId } = await table()
    const offer = { type: 'offer' as const, sdp: 'v=0 fake' }

    send(host, { t: 'voice', on: true })
    await flush()
    send(host, { t: 'rtc', to: guestId, description: offer })
    expect(guest.last('rtc')).toBeUndefined()

    send(guest, { t: 'voice', on: true })
    await flush()
    send(host, { t: 'rtc', to: guestId, description: offer })
    expect(guest.last('rtc')).toEqual({ t: 'rtc', from: hostId, description: offer })
    expect(watcher.last('rtc')).toBeUndefined()

    // Spectators can't take part in voice.
    send(watcher, { t: 'voice', on: true })
    expect(watcher.last('error')?.code).toBe('forbidden')
  })

  it('drops a player from voice when they leave voice or disconnect', async () => {
    const { host, guest, hostId, guestId } = await table()
    send(host, { t: 'voice', on: true })
    send(guest, { t: 'voice', on: true })
    await flush()
    send(guest, { t: 'voice', on: false })
    expect(host.last('lobby')!.lobby.members.find((m) => m.id === guestId)!.inVoice).toBe(false)

    manager.handleDisconnect(host)
    expect(guest.last('lobby')!.lobby.members.find((m) => m.id === hostId)!.inVoice).toBe(false)
  })

  it('ignores a voice join that finishes after the player has left', async () => {
    const { host, guest, guestId } = await table()
    send(guest, { t: 'voice', on: true })
    send(guest, { t: 'leave' })
    await flush()
    expect(guest.last('ice')).toBeUndefined()
    expect(host.last('lobby')!.lobby.members.some((m) => m.id === guestId)).toBe(false)
  })
})

describe('run it back (rematch)', () => {
  let manager: RoomManager
  beforeEach(() => {
    vi.useFakeTimers()
    manager = new RoomManager({ rng: seededRng(3), botDelayMs: [10, 10] })
  })
  afterEach(() => {
    manager.dispose()
    vi.useRealTimers()
  })
  const send = (client: Client, msg: ClientMessage) => manager.handleMessage(client, msg)

  function finishedMatch() {
    const host = new FakeClient()
    send(host, { t: 'create', name: 'Ada', avatar: 'lion' })
    const code = host.last('welcome')!.code
    const guest = new FakeClient()
    send(guest, { t: 'join', code, name: 'Bayo', avatar: 'fox' })
    send(host, { t: 'addBot', level: 'easy' })
    send(guest, { t: 'ready', ready: true })
    send(host, { t: 'start' })
    const room = manager.getRoom(code)!
    room.game = { ...room.game!, phase: 'matchOver' }
    return { host, guest, room }
  }

  it('deals the same table again once every person votes', () => {
    const { host, guest, room } = finishedMatch()
    const before = room.game
    send(host, { t: 'rematch', on: true })
    expect(room.game).toBe(before)
    expect(guest.last('lobby')!.lobby.members.find((m) => m.name === 'Ada')!.rematch).toBe(true)

    send(guest, { t: 'rematch', on: true })
    expect(room.game).not.toBe(before)
    expect(room.game!.phase).toBe('playing')
    expect(room.game!.players.map((p) => p.name)).toEqual(['Ada', 'Bayo', 'Tunde'])
    expect(host.last('lobby')!.lobby.members.every((m) => !m.rematch)).toBe(true)
  })

  it('lets a vote be taken back', () => {
    const { host, guest, room } = finishedMatch()
    send(host, { t: 'rematch', on: true })
    send(host, { t: 'rematch', on: false })
    send(guest, { t: 'rematch', on: true })
    expect(room.game!.phase).toBe('matchOver')
  })

  it("doesn't wait for someone who left or dropped", () => {
    const { host, guest, room } = finishedMatch()
    send(host, { t: 'rematch', on: true })
    manager.handleDisconnect(guest)
    expect(room.game!.phase).toBe('playing')
  })

  it('ignores votes while a match is still going', () => {
    const { host, guest, room } = finishedMatch()
    room.game = { ...room.game!, phase: 'playing' }
    send(host, { t: 'rematch', on: true })
    send(guest, { t: 'rematch', on: true })
    expect(host.last('lobby')!.lobby.members.every((m) => !m.rematch)).toBe(true)
  })
})
