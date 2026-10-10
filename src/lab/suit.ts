import type { Shape } from '../types/game'

/** Suit ink as a CSS colour, for rings, shadows and badges. */
export function suitColor(shape: Shape): string {
  return shape === 'whot' ? 'var(--riso-ink)' : `var(--riso-${shape})`
}