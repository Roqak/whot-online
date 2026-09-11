import type { Card, Shape } from '../types/game'
import type { HandSort } from '../store/gameStore'

const SHAPE_ORDER: Shape[] = ['circle', 'triangle', 'cross', 'square', 'star', 'whot']

export function sortHand(cards: Card[], mode: HandSort): Card[] {
  if (mode === 'none') return cards
  const sorted = [...cards]
  if (mode === 'shape') {
    sorted.sort((a, b) => SHAPE_ORDER.indexOf(a.shape) - SHAPE_ORDER.indexOf(b.shape) || a.number - b.number)
  } else {
    sorted.sort((a, b) => a.number - b.number || SHAPE_ORDER.indexOf(a.shape) - SHAPE_ORDER.indexOf(b.shape))
  }
  return sorted
}

/** Stable pseudo-random tilt so a card always sits the same way on the pile. */
export function cardTilt(id: string): { rotate: number; x: number; y: number } {
  let hash = 0
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) % 1000
  return {
    rotate: (hash % 21) - 10,
    x: ((hash >> 2) % 13) - 6,
    y: ((hash >> 4) % 11) - 5,
  }
}
