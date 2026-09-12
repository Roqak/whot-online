import {
  Card,
  GameAction,
  GameEvent,
  GamePlayer,
  GameSettings,
  GameState,
  GameView,
  BotLevel,
  DrawReason,
  PlayContext,
  Suit,
  SUITS,
  SHAPE_NAMES,
  HOLD_ON,
  PICK_TWO,
  PICK_THREE,
  SUSPENSION,
  GENERAL_MARKET,
  WHOT,
  canPlayCard,
  handPoints,
  isSpecial,
} from '../types/game'

export type Rng = () => number

export const cryptoRng: Rng = () => {
  const buf = new Uint32Array(1)
  globalThis.crypto.getRandomValues(buf)
  return buf[0] / 0x1_0000_0000
}

/** Deterministic mulberry32 generator for tests and replays. */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 0x1_0000_0000
  }
}

export function shuffle<T>(items: T[], rng: Rng): T[] {
  const arr = [...items]
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

const SUIT_NUMBERS: Record<Suit, number[]> = {
  circle: [1, 2, 3, 4, 5, 7, 8, 10, 11, 12, 13, 14],
  triangle: [1, 2, 3, 4, 5, 7, 8, 10, 11, 12, 13, 14],
  cross: [1, 2, 3, 5, 7, 10, 11, 13, 14],
  square: [1, 2, 3, 5, 7, 10, 11, 13, 14],
  star: [1, 2, 3, 4, 5, 7, 8],
}

export const WHOT_CARD_COUNT = 5
export const DECK_SIZE = 54
export const MIN_PLAYERS = 2
export const MAX_PLAYERS = 6
export const CATCH_PENALTY = 2

export function createDeck(rng: Rng = cryptoRng): Card[] {
  const cards: Card[] = []
  for (const shape of SUITS) {
    for (const number of SUIT_NUMBERS[shape]) {
      cards.push({ id: `${shape}-${number}`, shape, number })
    }
  }
  for (let i = 1; i <= WHOT_CARD_COUNT; i++) {
    cards.push({ id: `whot-${i}`, shape: 'whot', number: WHOT })
  }
  return shuffle(cards, rng)
}

export interface Seat {
  id: string
  name: string
  avatar: string
  isBot: boolean
  botLevel?: BotLevel
}

export type ActionResult =
  | { ok: true; state: GameState; events: GameEvent[] }
  | { ok: false; error: string }

const fail = (error: string): ActionResult => ({ ok: false, error })

export function createMatch(seats: Seat[], settings: GameSettings, rng: Rng = cryptoRng): GameState {
  if (seats.length < MIN_PLAYERS || seats.length > MAX_PLAYERS) {
    throw new Error(`Whot needs ${MIN_PLAYERS}-${MAX_PLAYERS} players`)
  }
  const players: GamePlayer[] = seats.map((seat) => ({
    ...seat,
    hand: [],
    score: 0,
    eliminated: false,
    left: false,
    announcedLastCard: false,
  }))
  const base: GameState = {
    phase: 'playing',
    players,
    market: [],
    pile: [],
    turnIndex: 0,
    turnId: 0,
    starterIndex: 0,
    requestedShape: null,
    pendingPick: null,
    round: 0,
    settings,
    lastRound: null,
    matchWinnerId: null,
  }
  return dealRound(base, Math.floor(rng() * players.length), 1, rng)
}

function dealRound(state: GameState, starterIndex: number, round: number, rng: Rng): GameState {
  const deck = createDeck(rng)
  const players = state.players.map((p) => ({
    ...p,
    hand: p.eliminated ? [] : deck.splice(0, state.settings.handSize),
    announcedLastCard: false,
  }))
  // The opening card is never a special card.
  const topIndex = deck.findIndex((c) => !isSpecial(c))
  const [top] = deck.splice(topIndex, 1)
  return {
    ...state,
    phase: 'playing',
    players,
    market: deck,
    pile: [top],
    turnIndex: starterIndex,
    starterIndex,
    turnId: state.turnId + 1,
    requestedShape: null,
    pendingPick: null,
    round,
    matchWinnerId: null,
  }
}

export function startNextRound(state: GameState, rng: Rng = cryptoRng): { state: GameState; events: GameEvent[] } {
  if (state.phase !== 'roundOver') return { state, events: [] }
  const starter = nextActiveIndex(state.players, state.starterIndex)
  const next = dealRound(state, starter, state.round + 1, rng)
  return { state: next, events: [{ type: 'roundStarted', round: next.round }] }
}

export function nextActiveIndex(players: GamePlayer[], from: number, steps = 1): number {
  let i = from
  let moved = 0
  for (let guard = 0; guard < players.length * (steps + 1); guard++) {
    i = (i + 1) % players.length
    if (!players[i].eliminated && ++moved === steps) return i
  }
  return from
}

export function getTopCard(state: Pick<GameState, 'pile'>): Card | null {
  return state.pile.length > 0 ? state.pile[state.pile.length - 1] : null
}

export function currentPlayer(state: GameState): GamePlayer {
  return state.players[state.turnIndex]
}

export function playContext(state: GameState): PlayContext {
  return {
    topCard: getTopCard(state),
    requestedShape: state.requestedShape,
    pendingPick: state.pendingPick,
    pickDefence: state.settings.pickDefence,
  }
}

export function legalCards(state: GameState, playerId: string): Card[] {
  if (state.phase !== 'playing') return []
  const player = currentPlayer(state)
  if (player.id !== playerId) return []
  const ctx = playContext(state)
  return player.hand.filter((c) => canPlayCard(c, ctx))
}

/** A player with one card who has not called "last card" can be caught. */
export function isCatchable(player: GamePlayer): boolean {
  return !player.eliminated && player.hand.length === 1 && !player.announcedLastCard
}

export function applyAction(state: GameState, playerId: string, action: GameAction, rng: Rng = cryptoRng): ActionResult {
  if (state.phase !== 'playing') return fail('The round is over')
  const s = structuredClone(state)
  const events: GameEvent[] = []
  const playerIndex = s.players.findIndex((p) => p.id === playerId)
  if (playerIndex === -1) return fail('You are not in this game')
  const player = s.players[playerIndex]
  if (player.eliminated) return fail('You are out of this match')

  switch (action.type) {
    case 'lastCard': {
      if (player.hand.length > 2) return fail('Call last card when you are down to two cards or fewer')
      if (player.announcedLastCard) return fail('You already called last card')
      player.announcedLastCard = true
      events.push({ type: 'lastCard', playerId })
      return { ok: true, state: s, events }
    }
    case 'catch': {
      const target = s.players.find((p) => p.id === action.targetId)
      if (!target || target.id === playerId) return fail('No one to catch')
      if (!isCatchable(target)) return fail(`${target.name} is safe`)
      events.push({ type: 'caught', byId: playerId, targetId: target.id })
      giveCards(s, target, CATCH_PENALTY, 'penalty', rng, events)
      return { ok: true, state: s, events }
    }
    case 'draw':
      if (s.turnIndex !== playerIndex) return fail('Wait for your turn')
      drawForTurn(s, playerIndex, 'market', rng, events)
      return { ok: true, state: s, events }
    case 'play':
      if (s.turnIndex !== playerIndex) return fail('Wait for your turn')
      return playCard(s, playerIndex, action, rng, events)
    default:
      return fail('Unknown action')
  }
}

/** Auto-move for a player whose turn timer ran out: they go to market. */
export function applyTimeout(state: GameState, playerId: string, rng: Rng = cryptoRng): ActionResult {
  if (state.phase !== 'playing') return fail('The round is over')
  const s = structuredClone(state)
  const playerIndex = s.players.findIndex((p) => p.id === playerId)
  if (playerIndex === -1 || s.turnIndex !== playerIndex) return fail('Not their turn')
  const events: GameEvent[] = []
  drawForTurn(s, playerIndex, 'timeout', rng, events)
  return { ok: true, state: s, events }
}

function drawForTurn(s: GameState, playerIndex: number, reason: DrawReason, rng: Rng, events: GameEvent[]) {
  const player = s.players[playerIndex]
  if (s.pendingPick) {
    const { amount } = s.pendingPick
    s.pendingPick = null
    giveCards(s, player, amount, 'pick', rng, events)
    advanceTurn(s, 1)
    return
  }
  if (s.market.length === 0 && s.pile.length <= 1) {
    // Nothing left to draw anywhere: count cards ("tender").
    endRound(s, 'tender', null, events)
    return
  }
  giveCards(s, player, 1, reason, rng, events)
  advanceTurn(s, 1)
}

function playCard(
  s: GameState,
  playerIndex: number,
  action: Extract<GameAction, { type: 'play' }>,
  rng: Rng,
  events: GameEvent[],
): ActionResult {
  const player = s.players[playerIndex]
  const cardIndex = player.hand.findIndex((c) => c.id === action.cardId)
  if (cardIndex === -1) return fail('That card is not in your hand')
  const card = player.hand[cardIndex]

  if (!canPlayCard(card, playContext(s))) {
    if (s.pendingPick) {
      return fail(
        s.settings.pickDefence === 'none'
          ? `Go to market for ${s.pendingPick.amount}`
          : `Defend with a ${s.pendingPick.number} or go to market for ${s.pendingPick.amount}`,
      )
    }
    if (s.requestedShape) return fail(`Play a ${SHAPE_NAMES[s.requestedShape]} or a Whot`)
    return fail('Match the shape or number, or play a Whot')
  }
  if (card.shape === 'whot' && (!action.requestedShape || !SUITS.includes(action.requestedShape))) {
    return fail('Pick a shape to request')
  }

  player.hand.splice(cardIndex, 1)
  s.pile.push(card)
  s.requestedShape = null
  events.push({ type: 'played', playerId: player.id, card })
  const finished = player.hand.length === 0

  if (card.shape === 'whot') {
    s.requestedShape = action.requestedShape!
    events.push({ type: 'shapeRequested', playerId: player.id, shape: action.requestedShape! })
    if (finished) endRound(s, 'checkup', playerIndex, events)
    else advanceTurn(s, 1)
  } else if (card.number === HOLD_ON) {
    events.push({ type: 'holdOn', playerId: player.id })
    if (finished) endRound(s, 'checkup', playerIndex, events)
    else s.turnId++
  } else if (card.number === SUSPENSION) {
    const target = s.players[nextActiveIndex(s.players, playerIndex)]
    events.push({ type: 'suspended', playerId: player.id, targetId: target.id })
    if (finished) endRound(s, 'checkup', playerIndex, events)
    else advanceTurn(s, 2)
  } else if (card.number === PICK_TWO || card.number === PICK_THREE) {
    const add = card.number === PICK_TWO ? 2 : 3
    // Stacking grows the running total; passing it on sends the same penalty along.
    const amount = s.settings.pickDefence === 'stack' ? (s.pendingPick?.amount ?? 0) + add : add
    const target = s.players[nextActiveIndex(s.players, playerIndex)]
    events.push({ type: 'pick', playerId: player.id, targetId: target.id, amount })
    if (finished) {
      // The pick still lands before the count.
      s.pendingPick = null
      giveCards(s, target, amount, 'finalPick', rng, events)
      endRound(s, 'checkup', playerIndex, events)
    } else {
      s.pendingPick = { amount, number: card.number }
      advanceTurn(s, 1)
    }
  } else if (card.number === GENERAL_MARKET) {
    events.push({ type: 'generalMarket', playerId: player.id })
    for (let i = 1; i < s.players.length; i++) {
      const other = s.players[(playerIndex + i) % s.players.length]
      if (!other.eliminated) giveCards(s, other, 1, 'generalMarket', rng, events)
    }
    if (finished) endRound(s, 'checkup', playerIndex, events)
    else s.turnId++
  } else if (finished) {
    endRound(s, 'checkup', playerIndex, events)
  } else {
    advanceTurn(s, 1)
  }

  return { ok: true, state: s, events }
}

function takeFromMarket(s: GameState, count: number, rng: Rng, events: GameEvent[]): Card[] {
  const taken: Card[] = []
  while (taken.length < count) {
    if (s.market.length === 0) {
      if (s.pile.length <= 1) break
      const top = s.pile.pop()!
      s.market = shuffle(s.pile, rng)
      s.pile = [top]
      events.push({ type: 'reshuffled' })
    }
    taken.push(s.market.pop()!)
  }
  return taken
}

function giveCards(s: GameState, player: GamePlayer, count: number, reason: DrawReason, rng: Rng, events: GameEvent[]) {
  const cards = takeFromMarket(s, count, rng, events)
  player.hand.push(...cards)
  if (player.hand.length > 2) player.announcedLastCard = false
  if (cards.length > 0) events.push({ type: 'drew', playerId: player.id, count: cards.length, reason })
  return cards.length
}

function advanceTurn(s: GameState, steps: number) {
  s.turnIndex = nextActiveIndex(s.players, s.turnIndex, steps)
  s.turnId++
}

function endRound(s: GameState, reason: 'checkup' | 'tender', winnerIndex: number | null, events: GameEvent[]) {
  const active = s.players.filter((p) => !p.eliminated)
  const winner =
    winnerIndex !== null
      ? s.players[winnerIndex]
      : [...active].sort(
          (a, b) =>
            handPoints(a.hand) - handPoints(b.hand) ||
            a.hand.length - b.hand.length ||
            seatDistance(s, a) - seatDistance(s, b),
        )[0]

  const hands = active.map((p) => ({
    playerId: p.id,
    cards: [...p.hand],
    points: p.id === winner.id ? 0 : handPoints(p.hand),
  }))

  const eliminatedIds: string[] = []
  if (s.settings.targetScore > 0) {
    for (const h of hands) {
      const p = s.players.find((pl) => pl.id === h.playerId)!
      p.score += h.points
      if (p.id !== winner.id && p.score >= s.settings.targetScore) {
        p.eliminated = true
        eliminatedIds.push(p.id)
      }
    }
  }

  s.lastRound = { round: s.round, winnerId: winner.id, reason, hands, eliminatedIds }
  s.pendingPick = null
  s.requestedShape = null
  events.push({ type: 'roundOver', result: s.lastRound })

  const remaining = s.players.filter((p) => !p.eliminated)
  if (s.settings.targetScore === 0 || remaining.length <= 1) {
    s.phase = 'matchOver'
    s.matchWinnerId = s.settings.targetScore === 0 ? winner.id : (remaining[0]?.id ?? winner.id)
    events.push({ type: 'matchOver', winnerId: s.matchWinnerId })
  } else {
    s.phase = 'roundOver'
  }
}

function seatDistance(s: GameState, p: GamePlayer): number {
  const idx = s.players.indexOf(p)
  return (idx - s.turnIndex + s.players.length) % s.players.length
}

/** A player leaves mid-match: their cards go back under the market and play continues without them. */
export function removePlayer(state: GameState, playerId: string): { state: GameState; events: GameEvent[] } {
  const idx = state.players.findIndex((p) => p.id === playerId)
  if (idx === -1 || state.players[idx].left) return { state, events: [] }
  const s = structuredClone(state)
  const events: GameEvent[] = [{ type: 'playerLeft', playerId }]
  const player = s.players[idx]
  const wasActive = !player.eliminated
  s.market.unshift(...player.hand)
  player.hand = []
  player.left = true
  player.eliminated = true
  player.announcedLastCard = false

  if (s.phase === 'matchOver' || !wasActive) return { state: s, events }

  const remaining = s.players.filter((p) => !p.eliminated)
  if (remaining.length <= 1) {
    s.phase = 'matchOver'
    s.pendingPick = null
    s.matchWinnerId = remaining[0]?.id ?? null
    if (s.matchWinnerId) events.push({ type: 'matchOver', winnerId: s.matchWinnerId })
    return { state: s, events }
  }
  if (s.phase === 'playing' && s.turnIndex === idx) {
    s.pendingPick = null
    advanceTurn(s, 1)
  }
  if (s.starterIndex === idx) s.starterIndex = nextActiveIndex(s.players, idx)
  return { state: s, events }
}

const PILE_VIEW_SIZE = 6

export function toView(
  state: GameState,
  viewerId: string,
  opts: { isConnected: (id: string) => boolean; deadline: number | null },
): GameView {
  const me = state.players.find((p) => p.id === viewerId)
  return {
    myId: viewerId,
    phase: state.phase,
    players: state.players.map((p) => ({
      id: p.id,
      name: p.name,
      avatar: p.avatar,
      isBot: p.isBot,
      botLevel: p.botLevel,
      handCount: p.hand.length,
      score: p.score,
      eliminated: p.eliminated,
      left: p.left,
      announcedLastCard: p.announcedLastCard,
      connected: p.isBot || opts.isConnected(p.id),
    })),
    myHand: me ? me.hand : [],
    pile: state.pile.slice(-PILE_VIEW_SIZE),
    pileCount: state.pile.length,
    marketCount: state.market.length,
    turnPlayerId: currentPlayer(state).id,
    turnId: state.turnId,
    requestedShape: state.requestedShape,
    pendingPick: state.pendingPick,
    round: state.round,
    settings: state.settings,
    lastRound: state.lastRound,
    matchWinnerId: state.matchWinnerId,
    deadline: opts.deadline,
  }
}
