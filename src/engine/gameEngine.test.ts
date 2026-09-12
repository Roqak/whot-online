import { describe, expect, it } from 'vitest'
import {
  CATCH_PENALTY,
  DECK_SIZE,
  applyAction,
  applyTimeout,
  createDeck,
  createMatch,
  legalCards,
  removePlayer,
  seededRng,
  startNextRound,
  toView,
} from './gameEngine'
import { chooseBotMove } from './bot'
import { Card, DEFAULT_SETTINGS, GameSettings, GameState, PickDefence, Shape, Suit, isSpecial } from '../types/game'

const card = (shape: Shape, number: number, id = `${shape}-${number}`): Card => ({ id, shape, number })

const seats = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `Player ${i}`, avatar: 'lion', isBot: false }))

/** Builds a match, then overrides hands, pile and turn for a precise scenario. */
function scenario(opts: {
  hands: Card[][]
  top: Card
  market?: Card[]
  turn?: number
  settings?: Partial<GameSettings>
  state?: Partial<GameState>
}): GameState {
  const base = createMatch(seats(opts.hands.length), { ...DEFAULT_SETTINGS, ...opts.settings }, seededRng(1))
  return {
    ...base,
    players: base.players.map((p, i) => ({ ...p, hand: opts.hands[i] })),
    pile: [opts.top],
    market: opts.market ?? Array.from({ length: 10 }, (_, i) => card('circle', 3, `m${i}`)),
    turnIndex: opts.turn ?? 0,
    ...opts.state,
  }
}

function act(state: GameState, playerId: string, action: Parameters<typeof applyAction>[2]) {
  const result = applyAction(state, playerId, action, seededRng(7))
  if (!result.ok) throw new Error(result.error)
  return result
}

describe('deck', () => {
  it('has 54 unique cards with 5 Whots', () => {
    const deck = createDeck(seededRng(3))
    expect(deck).toHaveLength(DECK_SIZE)
    expect(new Set(deck.map((c) => c.id)).size).toBe(DECK_SIZE)
    expect(deck.filter((c) => c.shape === 'whot')).toHaveLength(5)
    expect(deck.filter((c) => c.shape === 'star')).toHaveLength(7)
  })

  it('deals hands and never opens on a special card', () => {
    for (let seed = 0; seed < 50; seed++) {
      const state = createMatch(seats(4), { ...DEFAULT_SETTINGS, handSize: 6 }, seededRng(seed))
      expect(state.players.every((p) => p.hand.length === 6)).toBe(true)
      expect(isSpecial(state.pile[0])).toBe(false)
      expect(state.market.length + state.pile.length + 24).toBe(DECK_SIZE)
    }
  })
})

describe('playing cards', () => {
  it('accepts matching shape or number and passes the turn', () => {
    const state = scenario({ hands: [[card('circle', 7), card('cross', 3)], [card('star', 4)]], top: card('circle', 4) })
    const { state: next } = act(state, 'p0', { type: 'play', cardId: 'circle-7' })
    expect(next.turnIndex).toBe(1)
    expect(next.pile.at(-1)?.id).toBe('circle-7')
    const byNumber = scenario({ hands: [[card('cross', 4), card('cross', 3)], [card('star', 4)]], top: card('circle', 4) })
    expect(applyAction(byNumber, 'p0', { type: 'play', cardId: 'cross-4' }).ok).toBe(true)
  })

  it('rejects mismatched cards and out-of-turn play', () => {
    const state = scenario({ hands: [[card('cross', 3), card('star', 7)], [card('circle', 7)]], top: card('circle', 4) })
    expect(applyAction(state, 'p0', { type: 'play', cardId: 'cross-3' })).toMatchObject({ ok: false })
    expect(applyAction(state, 'p1', { type: 'play', cardId: 'circle-7' })).toMatchObject({ ok: false })
  })

  it('requires a shape for Whot and enforces the request', () => {
    const state = scenario({
      hands: [[card('whot', 20, 'whot-1'), card('cross', 3)], [card('circle', 4), card('square', 4)]],
      top: card('circle', 4),
    })
    expect(applyAction(state, 'p0', { type: 'play', cardId: 'whot-1' })).toMatchObject({ ok: false })
    const { state: next, events } = act(state, 'p0', { type: 'play', cardId: 'whot-1', requestedShape: 'square' })
    expect(next.requestedShape).toBe('square')
    expect(events).toContainEqual({ type: 'shapeRequested', playerId: 'p0', shape: 'square' })
    expect(legalCards(next, 'p1').map((c) => c.id)).toEqual(['square-4'])
    const after = act(next, 'p1', { type: 'play', cardId: 'square-4' }).state
    expect(after.requestedShape).toBeNull()
  })

  it('Hold On lets the same player go again', () => {
    const state = scenario({ hands: [[card('circle', 1), card('circle', 3)], [card('star', 4)]], top: card('circle', 4) })
    const { state: next, events } = act(state, 'p0', { type: 'play', cardId: 'circle-1' })
    expect(next.turnIndex).toBe(0)
    expect(next.turnId).toBe(state.turnId + 1)
    expect(events.map((e) => e.type)).toContain('holdOn')
  })

  it('Suspension skips the next player', () => {
    const state = scenario({
      hands: [[card('circle', 8), card('circle', 3)], [card('star', 4)], [card('star', 5)]],
      top: card('circle', 4),
    })
    const { state: next, events } = act(state, 'p0', { type: 'play', cardId: 'circle-8' })
    expect(next.turnIndex).toBe(2)
    expect(events).toContainEqual({ type: 'suspended', playerId: 'p0', targetId: 'p1' })
  })

  it('Suspension with two players returns to the player', () => {
    const state = scenario({ hands: [[card('circle', 8), card('circle', 3)], [card('star', 4)]], top: card('circle', 4) })
    expect(act(state, 'p0', { type: 'play', cardId: 'circle-8' }).state.turnIndex).toBe(0)
  })

  it('General Market makes everyone else draw one and the player goes again', () => {
    const state = scenario({
      hands: [[card('circle', 14), card('circle', 3)], [card('star', 4)], [card('star', 5)]],
      top: card('circle', 4),
    })
    const { state: next } = act(state, 'p0', { type: 'play', cardId: 'circle-14' })
    expect(next.players.map((p) => p.hand.length)).toEqual([1, 2, 2])
    expect(next.turnIndex).toBe(0)
  })
})

describe('pick two and pick three', () => {
  const pickState = (pickDefence: PickDefence) =>
    scenario({
      hands: [
        [card('circle', 2), card('circle', 3)],
        [card('star', 2), card('square', 5), card('circle', 11)],
        [card('cross', 7), card('cross', 10)],
      ],
      top: card('circle', 4),
      settings: { pickDefence },
    })

  it('forces the next player to draw and clears the pick', () => {
    let state = act(pickState('none'), 'p0', { type: 'play', cardId: 'circle-2' }).state
    expect(state.pendingPick).toEqual({ amount: 2, number: 2 })
    expect(state.turnIndex).toBe(1)
    expect(legalCards(state, 'p1')).toEqual([])
    const { state: next, events } = act(state, 'p1', { type: 'draw' })
    state = next
    expect(state.players[1].hand).toHaveLength(5)
    expect(state.pendingPick).toBeNull()
    expect(state.turnIndex).toBe(2)
    expect(events).toContainEqual({ type: 'drew', playerId: 'p1', count: 2, reason: 'pick' })
  })

  it('stacks the total when the table plays it that way', () => {
    let state = act(pickState('stack'), 'p0', { type: 'play', cardId: 'circle-2' }).state
    expect(legalCards(state, 'p1').map((c) => c.id)).toEqual(['star-2'])
    state = act(state, 'p1', { type: 'play', cardId: 'star-2' }).state
    expect(state.pendingPick).toEqual({ amount: 4, number: 2 })
    expect(state.turnIndex).toBe(2)
    state = act(state, 'p2', { type: 'draw' }).state
    expect(state.players[2].hand).toHaveLength(6)
  })

  it('passes the same penalty on without growing it', () => {
    let state = act(pickState('pass'), 'p0', { type: 'play', cardId: 'circle-2' }).state
    expect(state.pendingPick).toEqual({ amount: 2, number: 2 })
    state = act(state, 'p1', { type: 'play', cardId: 'star-2' }).state
    expect(state.pendingPick).toEqual({ amount: 2, number: 2 })
    state = act(state, 'p2', { type: 'draw' }).state
    expect(state.players[2].hand).toHaveLength(4)
  })

  it('a Pick Three answered with a 5 doubles only when stacking', () => {
    const hands = [[card('circle', 5), card('circle', 3)], [card('star', 5), card('cross', 7)], [card('cross', 10)]]
    const stacked = act(
      scenario({ hands, top: card('circle', 4), settings: { pickDefence: 'stack' } }),
      'p0',
      { type: 'play', cardId: 'circle-5' },
    ).state
    expect(act(stacked, 'p1', { type: 'play', cardId: 'star-5' }).state.pendingPick?.amount).toBe(6)

    const passed = act(
      scenario({ hands, top: card('circle', 4), settings: { pickDefence: 'pass' } }),
      'p0',
      { type: 'play', cardId: 'circle-5' },
    ).state
    expect(act(passed, 'p1', { type: 'play', cardId: 'star-5' }).state.pendingPick?.amount).toBe(3)
  })

  it('a finishing pick card still lands before the count', () => {
    const state = scenario({
      hands: [[card('circle', 5)], [card('star', 4)]],
      top: card('circle', 4),
      settings: { targetScore: 100 },
    })
    const { state: next } = act(state, 'p0', { type: 'play', cardId: 'circle-5' })
    expect(next.phase).toBe('roundOver')
    expect(next.players[1].hand).toHaveLength(4)
    expect(next.lastRound?.winnerId).toBe('p0')
  })
})

describe('market', () => {
  it('draws one and passes the turn', () => {
    const state = scenario({ hands: [[card('cross', 3)], [card('star', 4)]], top: card('circle', 4) })
    const { state: next } = act(state, 'p0', { type: 'draw' })
    expect(next.players[0].hand).toHaveLength(2)
    expect(next.turnIndex).toBe(1)
  })

  it('reshuffles the pile when the market runs out', () => {
    const state = scenario({
      hands: [[card('cross', 3), card('cross', 7)], [card('star', 4)]],
      top: card('circle', 4),
      market: [],
      state: { pile: [card('square', 10), card('square', 11), card('circle', 4)] },
    })
    const { state: next, events } = act(state, 'p0', { type: 'draw' })
    expect(events.map((e) => e.type)).toContain('reshuffled')
    expect(next.pile.map((c) => c.id)).toEqual(['circle-4'])
    expect(next.market).toHaveLength(1)
  })

  it('ends the round by count when nothing is left to draw', () => {
    const state = scenario({
      hands: [[card('cross', 13), card('cross', 7)], [card('star', 4)], [card('square', 3)]],
      top: card('circle', 4),
      market: [],
    })
    const { state: next } = act(state, 'p0', { type: 'draw' })
    expect(next.phase).toBe('roundOver')
    expect(next.lastRound).toMatchObject({ reason: 'tender', winnerId: 'p2' })
  })

  it('times out into a market draw', () => {
    const state = scenario({ hands: [[card('cross', 3)], [card('star', 4)]], top: card('circle', 4) })
    const result = applyTimeout(state, 'p0', seededRng(1))
    expect(result.ok && result.events).toContainEqual({ type: 'drew', playerId: 'p0', count: 1, reason: 'timeout' })
  })
})

describe('last card', () => {
  const twoCards = () =>
    scenario({ hands: [[card('circle', 7), card('circle', 3)], [card('star', 4), card('star', 5)]], top: card('circle', 4) })

  it('a player who forgets can be caught for a penalty', () => {
    const state = act(twoCards(), 'p0', { type: 'play', cardId: 'circle-7' }).state
    const { state: next, events } = act(state, 'p1', { type: 'catch', targetId: 'p0' })
    expect(next.players[0].hand).toHaveLength(1 + CATCH_PENALTY)
    expect(events[0]).toEqual({ type: 'caught', byId: 'p1', targetId: 'p0' })
    expect(applyAction(next, 'p1', { type: 'catch', targetId: 'p0' }).ok).toBe(false)
  })

  it('announcing protects the player', () => {
    let state = act(twoCards(), 'p0', { type: 'lastCard' }).state
    state = act(state, 'p0', { type: 'play', cardId: 'circle-7' }).state
    expect(applyAction(state, 'p1', { type: 'catch', targetId: 'p0' }).ok).toBe(false)
  })

  it('cannot be called with more than two cards, and resets after drawing', () => {
    const three = scenario({ hands: [[card('circle', 7), card('circle', 3), card('cross', 3)], [card('star', 4)]], top: card('circle', 4) })
    expect(applyAction(three, 'p0', { type: 'lastCard' }).ok).toBe(false)
    let state = act(twoCards(), 'p0', { type: 'lastCard' }).state
    state = act(state, 'p0', { type: 'draw' }).state
    expect(state.players[0].announcedLastCard).toBe(false)
  })
})

describe('rounds and scoring', () => {
  it('scores leftover hands, eliminates at the target and crowns the last player', () => {
    const state = scenario({
      hands: [[card('circle', 7)], [card('star', 7), card('whot', 20, 'whot-1')], [card('cross', 3)]],
      top: card('circle', 4),
      settings: { targetScore: 30 },
    })
    const { state: next, events } = act(state, 'p0', { type: 'play', cardId: 'circle-7' })
    expect(next.phase).toBe('roundOver')
    expect(next.lastRound?.hands.map((h) => h.points)).toEqual([0, 34, 3])
    expect(next.lastRound?.eliminatedIds).toEqual(['p1'])
    expect(events.map((e) => e.type)).toContain('roundOver')

    const { state: round2 } = startNextRound(next, seededRng(2))
    expect(round2.round).toBe(2)
    expect(round2.phase).toBe('playing')
    expect(round2.players[1].hand).toHaveLength(0)
    expect(round2.players[round2.turnIndex].eliminated).toBe(false)
  })

  it('single-round matches end immediately', () => {
    const state = scenario({ hands: [[card('circle', 7)], [card('star', 4)]], top: card('circle', 4), settings: { targetScore: 0 } })
    const { state: next } = act(state, 'p0', { type: 'play', cardId: 'circle-7' })
    expect(next.phase).toBe('matchOver')
    expect(next.matchWinnerId).toBe('p0')
  })

  it('a leaving player hands the win to the last one standing', () => {
    const state = scenario({ hands: [[card('circle', 7)], [card('star', 4)]], top: card('circle', 4) })
    const { state: next, events } = removePlayer(state, 'p0')
    expect(next.phase).toBe('matchOver')
    expect(next.matchWinnerId).toBe('p1')
    expect(events.map((e) => e.type)).toEqual(['playerLeft', 'matchOver'])
  })

  it('a leaving player on turn passes the turn on', () => {
    const state = scenario({ hands: [[card('circle', 7)], [card('star', 4)], [card('cross', 4)]], top: card('circle', 4) })
    const { state: next } = removePlayer(state, 'p0')
    expect(next.turnIndex).toBe(1)
    expect(next.players[0]).toMatchObject({ left: true, eliminated: true, hand: [] })
  })
})

describe('views', () => {
  it('only reveals the viewer’s own hand', () => {
    const state = createMatch(seats(3), DEFAULT_SETTINGS, seededRng(9))
    const view = toView(state, 'p1', { isConnected: () => true, deadline: null })
    expect(view.myHand).toEqual(state.players[1].hand)
    expect(JSON.stringify(view)).not.toContain(state.players[0].hand[0].id)
    expect(view.players[0].handCount).toBe(DEFAULT_SETTINGS.handSize)
  })
})

describe('bot simulation', () => {
  it('plays full matches without illegal moves', () => {
    const levels = ['easy', 'normal', 'hard'] as const
    for (let seed = 0; seed < 40; seed++) {
      const rng = seededRng(seed)
      let state = createMatch(
        Array.from({ length: 2 + (seed % 5) }, (_, i) => ({
          id: `b${i}`,
          name: `Bot ${i}`,
          avatar: 'robot',
          isBot: true,
          botLevel: levels[(seed + i) % 3],
        })),
        { ...DEFAULT_SETTINGS, pickDefence: (['stack', 'pass', 'none'] as const)[seed % 3], targetScore: 50 },
        rng,
      )
      let steps = 0
      while (state.phase !== 'matchOver' && steps++ < 20_000) {
        if (state.phase === 'roundOver') {
          state = startNextRound(state, rng).state
          continue
        }
        const bot = state.players[state.turnIndex]
        for (const action of chooseBotMove(state, bot.id, rng)) {
          const result = applyAction(state, bot.id, action, rng)
          if (!result.ok) throw new Error(`seed ${seed}: ${result.error}`)
          state = result.state
        }
        const cardsInPlay = state.market.length + state.pile.length + state.players.reduce((n, p) => n + p.hand.length, 0)
        expect(cardsInPlay).toBe(DECK_SIZE)
      }
      expect(state.phase).toBe('matchOver')
      expect(state.matchWinnerId).toBeTruthy()
    }
  })

  it('bots request a shape they hold', () => {
    const state = scenario({
      hands: [[card('whot', 20, 'whot-1'), card('square', 3), card('square', 7)], [card('star', 4)]],
      top: card('circle', 3),
      state: {},
    })
    state.players[0] = { ...state.players[0], isBot: true, botLevel: 'hard' }
    const [move] = chooseBotMove(state, 'p0', seededRng(4)).filter((a) => a.type === 'play')
    if (move.type !== 'play') throw new Error('expected play')
    expect(move.cardId).not.toBe('whot-1')
    const onlyWhot = { ...state, pile: [card('triangle', 9)] }
    const [whotMove] = chooseBotMove(onlyWhot, 'p0', seededRng(4))
    expect(whotMove).toMatchObject({ type: 'play', cardId: 'whot-1', requestedShape: 'square' satisfies Suit })
  })
})
