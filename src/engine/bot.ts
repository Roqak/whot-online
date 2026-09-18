import {
  BotLevel,
  Card,
  GameAction,
  GameState,
  Suit,
  SUITS,
  HOLD_ON,
  PICK_TWO,
  PICK_THREE,
  SUSPENSION,
  GENERAL_MARKET,
  canPlayCard,
  cardPoints,
} from '../types/game'
import { Rng, cryptoRng, nextActiveIndex, playContext } from './gameEngine'

export const BOT_NAMES = ['Tunde', 'Ada', 'Chidi', 'Ngozi', 'Emeka', 'Funmi', 'Bayo', 'Kemi']

/** How quickly and reliably each bot level notices a player who forgot to call last card. */
export const BOT_CATCH: Record<BotLevel, { chance: number; delayMs: [number, number] }> = {
  easy: { chance: 0.3, delayMs: [3500, 6000] },
  normal: { chance: 0.65, delayMs: [2200, 4000] },
  hard: { chance: 0.95, delayMs: [1200, 2200] },
  expert: { chance: 1, delayMs: [600, 1200] },
}

const REMEMBER_LAST_CARD: Record<BotLevel, number> = { easy: 0.6, normal: 0.9, hard: 1, expert: 1 }

/**
 * Picks the bot's move for its turn. May return a "last card" call before the play.
 */
export function chooseBotMove(state: GameState, playerId: string, rng: Rng = cryptoRng): GameAction[] {
  const meIndex = state.players.findIndex((p) => p.id === playerId)
  const me = state.players[meIndex]
  const level: BotLevel = me.botLevel ?? 'normal'
  const ctx = playContext(state)
  const legal = me.hand.filter((c) => canPlayCard(c, ctx))
  if (legal.length === 0) return [{ type: 'draw' }]

  const card = level === 'easy' ? legal[Math.floor(rng() * legal.length)] : bestCard(state, meIndex, legal, level, rng)
  const rest = me.hand.filter((c) => c.id !== card.id)
  const actions: GameAction[] = []

  if (rest.length === 1 && !me.announcedLastCard && rng() < REMEMBER_LAST_CARD[level]) {
    actions.push({ type: 'lastCard' })
  }
  actions.push({
    type: 'play',
    cardId: card.id,
    requestedShape: card.shape === 'whot' ? chooseShape(rest, level, rng) : undefined,
  })
  return actions
}

function bestCard(state: GameState, meIndex: number, legal: Card[], level: BotLevel, rng: Rng): Card {
  const me = state.players[meIndex]
  const next = state.players[nextActiveIndex(state.players, meIndex)]
  const nextIsClose = next.hand.length <= 2
  const suitCounts = countSuits(me.hand)

  let best = legal[0]
  let bestScore = -Infinity
  for (const card of legal) {
    // Expert sheds point-heavy cards faster: a round ending on a tender or a
    // catch costs less when the hand's already lighter.
    let score = cardPoints(card) * (level === 'expert' ? 0.55 : 0.4)
    if (card.shape === 'whot') {
      // Save the Whot unless it's the only way out.
      score -= level === 'expert' ? 34 : level === 'hard' ? 30 : 18
    } else {
      if (card.number === HOLD_ON || card.number === GENERAL_MARKET) score += me.hand.length > 1 ? 12 : 0
      if (card.number === PICK_TWO || card.number === PICK_THREE) score += 8 + (nextIsClose ? 20 : 0)
      if (card.number === SUSPENSION) score += 6 + (nextIsClose ? 14 : 0)
      if (level === 'hard') score += (suitCounts[card.shape] - 1) * 3
      // Expert manages its hand's shape spread more aggressively than hard.
      if (level === 'expert') score += (suitCounts[card.shape] - 1) * 5
    }
    score += rng() * 2
    if (score > bestScore) {
      bestScore = score
      best = card
    }
  }
  return best
}

function countSuits(hand: Card[]): Record<Suit, number> {
  const counts: Record<Suit, number> = { circle: 0, triangle: 0, cross: 0, square: 0, star: 0 }
  for (const c of hand) if (c.shape !== 'whot') counts[c.shape]++
  return counts
}

function chooseShape(hand: Card[], level: BotLevel, rng: Rng): Suit {
  const counts = countSuits(hand)
  const held = SUITS.filter((s) => counts[s] > 0)
  if (level === 'easy' || held.length === 0) {
    const pool = held.length > 0 && rng() < 0.5 ? held : SUITS
    return pool[Math.floor(rng() * pool.length)]
  }
  return held.reduce((a, b) => (counts[b] > counts[a] ? b : a))
}
