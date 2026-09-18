import type { Card, GameEvent, Suit } from '../../types/game'
import { SPECIAL_NAMES, isSpecial } from '../../types/game'

export type HighlightKind =
  | 'played'
  | 'special'
  | 'pick'
  | 'generalMarket'
  | 'holdOn'
  | 'suspended'
  | 'shape'
  | 'lastCard'
  | 'caught'
  | 'roundStarted'
  | 'roundOver'
  | 'matchOver'

export interface Highlight {
  /** Monotonic id, doubles as the "when" key for one-shot effects. */
  id: number
  kind: HighlightKind
  playerId: string | null
  targetId: string | null
  card: Card | null
  amount: number
  shape: Suit | null
  /** 1 = quiet, 2 = splash, 3 = splash + camera punch + shake. */
  intensity: 1 | 2 | 3
}

export function fromEvents(events: GameEvent[], baseId: number): Highlight[] {
  const out: Highlight[] = []
  for (const event of events) {
    switch (event.type) {
      case 'played': {
        const special = isSpecial(event.card)
        out.push({
          id: ++baseId,
          kind: special ? 'special' : 'played',
          playerId: event.playerId,
          targetId: null,
          card: event.card,
          amount: 0,
          shape: null,
          intensity: event.card.shape === 'whot' ? 3 : special ? 2 : 1,
        })
        break
      }
      case 'pick':
        out.push({
          id: ++baseId,
          kind: 'pick',
          playerId: event.playerId,
          targetId: event.targetId,
          card: null,
          amount: event.amount,
          shape: null,
          intensity: event.amount >= 3 ? 3 : 2,
        })
        break
      case 'generalMarket':
        out.push({
          id: ++baseId,
          kind: 'generalMarket',
          playerId: event.playerId,
          targetId: null,
          card: null,
          amount: 0,
          shape: null,
          intensity: 2,
        })
        break
      case 'suspended':
        out.push({
          id: ++baseId,
          kind: 'suspended',
          playerId: event.playerId,
          targetId: event.targetId,
          card: null,
          amount: 0,
          shape: null,
          intensity: 2,
        })
        break
      case 'shapeRequested':
        out.push({
          id: ++baseId,
          kind: 'shape',
          playerId: event.playerId,
          targetId: null,
          card: null,
          amount: 0,
          shape: event.shape,
          intensity: 1,
        })
        break
      case 'lastCard':
        out.push({
          id: ++baseId,
          kind: 'lastCard',
          playerId: event.playerId,
          targetId: null,
          card: null,
          amount: 0,
          shape: null,
          intensity: 3,
        })
        break
      case 'caught':
        out.push({
          id: ++baseId,
          kind: 'caught',
          playerId: event.byId,
          targetId: event.targetId,
          card: null,
          amount: 0,
          shape: null,
          intensity: 3,
        })
        break
      case 'roundStarted':
        out.push({
          id: ++baseId,
          kind: 'roundStarted',
          playerId: null,
          targetId: null,
          card: null,
          amount: event.round,
          shape: null,
          intensity: 1,
        })
        break
      case 'roundOver':
        out.push({
          id: ++baseId,
          kind: 'roundOver',
          playerId: event.result.winnerId,
          targetId: null,
          card: null,
          amount: 0,
          shape: null,
          intensity: 2,
        })
        break
      case 'matchOver':
        out.push({
          id: ++baseId,
          kind: 'matchOver',
          playerId: event.winnerId,
          targetId: null,
          card: null,
          amount: 0,
          shape: null,
          intensity: 3,
        })
        break
      default:
        break
    }
  }
  return out
}

export function splashFor(h: Highlight): string | null {
  switch (h.kind) {
    case 'pick':
      return `PICK ${h.amount}`
    case 'generalMarket':
      return 'GENERAL MARKET'
    case 'suspended':
      return 'SUSPENDED'
    case 'lastCard':
      return 'LAST CARD'
    case 'caught':
      return 'CAUGHT'
    case 'roundOver':
      return 'CHECK UP'
    case 'matchOver':
      return 'MATCH OVER'
    case 'special':
      return h.card ? (SPECIAL_NAMES[h.card.number] ?? null) : null
    default:
      return null
  }
}

export function splashTone(h: Highlight): 'neutral' | 'good' | 'bad' {
  switch (h.kind) {
    case 'pick':
    case 'caught':
    case 'suspended':
    case 'generalMarket':
      return 'bad'
    case 'lastCard':
    case 'roundOver':
    case 'matchOver':
      return 'good'
    default:
      return 'neutral'
  }
}