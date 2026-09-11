export type Shape = 'circle' | 'triangle' | 'cross' | 'square' | 'star' | 'whot'

export interface Card {
  id: string
  shape: Shape
  number: number
}

export type GamePhase = 'dealing' | 'playing' | 'roundOver' | 'matchOver'

export interface PlayerState {
  id: string
  name: string
  hand: Card[]
  score: number
  eliminated: boolean
  announcedLastCard: boolean
}

export interface GameEngineState {
  phase: GamePhase
  players: PlayerState[]
  market: Card[]
  pile: Card[]
  currentPlayerIndex: number
  requestedShape: Shape | null
  pendingPick: { amount: number; kind: 2 | 3 } | null
  round: number
}

export const SHAPE_COLORS: Record<Shape, string> = {
  circle: '#e74c3c',
  triangle: '#f39c12',
  cross: '#3498db',
  square: '#2ecc71',
  star: '#9b59b6',
  whot: '#f1c40f',
}

export const SHAPE_NAMES: Record<Shape, string> = {
  circle: 'Circle',
  triangle: 'Triangle',
  cross: 'Cross',
  square: 'Square',
  star: 'Star',
  whot: 'Whot',
}

export const SPECIAL_CARD_NAMES: Record<number, string> = {
  1: 'Hold On',
  2: 'Pick Two',
  5: 'Pick Three',
  8: 'Suspension',
  14: 'General Market',
  20: 'Whot',
}

export function getCardLabel(card: Card): string {
  if (card.shape === 'whot') return 'Whot'
  const specialName = SPECIAL_CARD_NAMES[card.number]
  if (specialName) return `${card.number} ${specialName}`
  return `${card.number} ${SHAPE_NAMES[card.shape]}`
}

export function getCardShortLabel(card: Card): string {
  if (card.shape === 'whot') return 'W'
  return `${card.number}`
}

export function canPlayCard(card: Card, topCard: Card | null, requestedShape: Shape | null): boolean {
  if (!topCard) return true
  if (card.shape === 'whot') return true
  if (requestedShape) return card.shape === requestedShape
  return card.shape === topCard.shape || card.number === topCard.number
}
