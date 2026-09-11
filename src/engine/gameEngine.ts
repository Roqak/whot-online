import { Card, Shape, GameEngineState, GamePhase, PlayerState } from '../types/game'

// Card IDs for a standard 54-card Whot deck
const SHAPES: Shape[] = ['circle', 'triangle', 'cross', 'square', 'star']

const SHAPE_NUMBERS: Record<Shape, number[]> = {
  circle: [1, 2, 3, 4, 5, 7, 8, 10, 11, 12, 13, 14],
  triangle: [1, 2, 3, 4, 5, 7, 8, 10, 11, 12, 13, 14],
  cross: [1, 2, 3, 5, 7, 10, 11, 13, 14],
  square: [1, 2, 3, 5, 7, 10, 11, 13, 14],
  star: [1, 2, 3, 4, 5, 7, 8],
  whot: [],
}

let _seed = Date.now()
function seededRandom(): number {
  _seed = (_seed * 16807 + 0) % 2147483647
  return (_seed - 1) / 2147483646
}

function shuffle<T>(array: T[]): T[] {
  const arr = [...array]
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(seededRandom() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

export function createDeck(): Card[] {
  const cards: Card[] = []
  let id = 0

  for (const shape of SHAPES) {
    for (const number of SHAPE_NUMBERS[shape]) {
      cards.push({ id: `card_${id++}`, shape, number })
    }
  }

  // Add 5 Whot cards
  for (let i = 0; i < 5; i++) {
    cards.push({ id: `card_${id++}`, shape: 'whot', number: 20 })
  }

  return shuffle(cards)
}

export function dealCards(deck: Card[], playerCount: number, cardsPerPlayer: number = 5): {
  hands: Card[][]
  remaining: Card[]
  topCard: Card
} {
  const hands: Card[][] = []
  const workingDeck = [...deck]

  for (let i = 0; i < playerCount; i++) {
    const hand: Card[] = []
    for (let j = 0; j < cardsPerPlayer; j++) {
      const card = workingDeck.pop()
      if (!card) break
      hand.push(card)
    }
    hands.push(hand)
  }

  // Get top card for pile (skip specials if needed)
  let topCard = workingDeck.pop()
  const specialNumbers = [1, 2, 5, 8, 14, 20]
  while (topCard && specialNumbers.includes(topCard.number) && workingDeck.length > 0) {
    workingDeck.unshift(topCard)
    topCard = workingDeck.pop()
  }
  if (!topCard) topCard = { id: `card_fallback_${Date.now()}`, shape: 'circle', number: 1 }

  return { hands, remaining: workingDeck, topCard }
}

export function createInitialState(playerNames: string[]): GameEngineState {
  const deck = createDeck()
  const { hands, remaining, topCard } = dealCards(deck, playerNames.length)

  const players: PlayerState[] = playerNames.map((name, i) => ({
    id: `p${i}`,
    name,
    hand: hands[i],
    score: 0,
    eliminated: false,
    announcedLastCard: false,
  }))

  return {
    phase: 'playing',
    players,
    market: remaining,
    pile: [topCard],
    currentPlayerIndex: 0,
    requestedShape: null,
    pendingPick: null,
    round: 1,
  }
}

export function getTopCard(state: GameEngineState): Card | null {
  return state.pile.length > 0 ? state.pile[state.pile.length - 1] : null
}

export function getCurrentPlayer(state: GameEngineState): PlayerState {
  return state.players[state.currentPlayerIndex]
}

export function playCard(state: GameEngineState, cardIds: string[], requestedShape?: Shape): GameEngineState {
  const player = getCurrentPlayer(state)
  const cards = player.hand.filter(c => cardIds.includes(c.id))
  
  if (cards.length === 0) return state

  const newHand = player.hand.filter(c => !cardIds.includes(c.id))
  const newPile = [...state.pile, ...cards]
  const topCard = cards[cards.length - 1]

  // Reset requested shape unless Whot was just played
  let newRequestedShape: Shape | null = null
  if (topCard.shape === 'whot' && requestedShape) {
    newRequestedShape = requestedShape
  }

  // Handle special card effects
  let nextPlayerIndex = (state.currentPlayerIndex + 1) % state.players.length
  let pendingPick = state.pendingPick

  if (topCard.number === 1 && !newRequestedShape) {
    // Hold On - same player plays again
    nextPlayerIndex = state.currentPlayerIndex
  } else if (topCard.number === 8 && !newRequestedShape) {
    // Suspension - skip next player
    nextPlayerIndex = (state.currentPlayerIndex + 2) % state.players.length
  } else if (topCard.number === 2 && !newRequestedShape) {
    // Pick Two
    pendingPick = { amount: (pendingPick?.amount || 0) + 2, kind: 2 }
  } else if (topCard.number === 5 && !newRequestedShape) {
    // Pick Three
    pendingPick = { amount: (pendingPick?.amount || 0) + 3, kind: 3 }
  } else if (topCard.number === 14 && !newRequestedShape) {
    // General Market - everyone else draws 1, player goes again
    // Simplified: just go again for now
    nextPlayerIndex = state.currentPlayerIndex
  }

  const newPhase: GamePhase = newHand.length === 0 ? 'roundOver' : state.phase

  const newPlayers = state.players.map((p, i) =>
    i === state.currentPlayerIndex
      ? { ...p, hand: newHand, announcedLastCard: false }
      : p
  )

  return {
    ...state,
    phase: newPhase,
    players: newPlayers,
    pile: newPile,
    currentPlayerIndex: nextPlayerIndex,
    requestedShape: newRequestedShape,
    pendingPick: pendingPick,
  }
}

export function drawCard(state: GameEngineState): GameEngineState {
  if (state.market.length === 0) {
    // Reshuffle pile into market
    const topCard = state.pile[state.pile.length - 1]
    const newMarket = shuffle(state.pile.slice(0, -1))
    const newPile = [topCard]
    
    if (newMarket.length === 0) {
      // No cards left - round over
      return { ...state, phase: 'roundOver' }
    }

    const card = newMarket.pop()!
    const newPlayers = state.players.map((p, i) =>
      i === state.currentPlayerIndex
        ? { ...p, hand: [...p.hand, card] }
        : p
    )

    return {
      ...state,
      players: newPlayers,
      market: newMarket,
      pile: newPile,
      currentPlayerIndex: (state.currentPlayerIndex + 1) % state.players.length,
    }
  }

  const card = state.market[state.market.length - 1]
  const newMarket = state.market.slice(0, -1)
  const newPlayers = state.players.map((p, i) =>
    i === state.currentPlayerIndex
      ? { ...p, hand: [...p.hand, card] }
      : p
  )

  return {
    ...state,
    players: newPlayers,
    market: newMarket,
    currentPlayerIndex: (state.currentPlayerIndex + 1) % state.players.length,
  }
}

export function announceLastCard(state: GameEngineState): GameEngineState {
  const newPlayers = state.players.map((p, i) =>
    i === state.currentPlayerIndex
      ? { ...p, announcedLastCard: true }
      : p
  )
  return { ...state, players: newPlayers }
}

export function checkLastCard(state: GameEngineState, targetPlayerId: string): GameEngineState {
  const targetIndex = state.players.findIndex(p => p.id === targetPlayerId)
  if (targetIndex === -1) return state
  
  const target = state.players[targetIndex]
  if (target.hand.length !== 1 || target.announcedLastCard) return state

  // Draw 2 penalty cards
  const penaltyCards: Card[] = []
  let newMarket = [...state.market]
  for (let i = 0; i < 2 && newMarket.length > 0; i++) {
    penaltyCards.push(newMarket.pop()!)
  }

  const newPlayers = state.players.map((p, i) =>
    i === targetIndex
      ? { ...p, hand: [...p.hand, ...penaltyCards] }
      : p
  )

  return { ...state, players: newPlayers, market: newMarket }
}

export function calculateHandScore(hand: Card[]): number {
  return hand.reduce((sum, card) => {
    if (card.shape === 'whot') return sum + 20
    if (card.shape === 'star') return sum + card.number * 2
    return sum + card.number
  }, 0)
}
