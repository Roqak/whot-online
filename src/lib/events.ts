import type { GameEvent } from '../types/game'
import { SHAPE_NAMES, cardLabel } from '../types/game'

export type EventTone = 'neutral' | 'good' | 'bad'

export interface EventLine {
  text: string
  tone: EventTone
}

interface Options {
  nameOf: (id: string) => string
  /** The viewer's own player id, or null when watching. */
  myId: string | null
  /** Spectators want the play-by-play; players only want what they can miss. */
  verbose?: boolean
}

/** Turns a game event into one line of commentary, or null when it needs no words. */
export function describeEvent(event: GameEvent, { nameOf, myId, verbose }: Options): EventLine | null {
  const who = (id: string) => (id === myId ? 'You' : nameOf(id))
  const mine = (id: string) => id === myId

  switch (event.type) {
    case 'played':
      return verbose ? { text: `${who(event.playerId)} played ${cardLabel(event.card)}`, tone: 'neutral' } : null
    case 'shapeRequested':
      return { text: `${who(event.playerId)} asks for ${SHAPE_NAMES[event.shape]}`, tone: 'neutral' }
    case 'holdOn':
      return { text: `${who(event.playerId)} holds on`, tone: 'neutral' }
    case 'suspended':
      return { text: `${mine(event.targetId) ? 'You are' : `${nameOf(event.targetId)} is`} suspended`, tone: 'bad' }
    case 'pick':
      return {
        text: mine(event.targetId) ? `Pick ${event.amount}!` : `${nameOf(event.targetId)} picks ${event.amount}`,
        tone: mine(event.targetId) ? 'bad' : 'neutral',
      }
    case 'generalMarket':
      return { text: 'General market: everybody picks one', tone: 'bad' }
    case 'drew':
      if (event.reason === 'timeout') return { text: `${who(event.playerId)} ran out of time`, tone: 'neutral' }
      if (verbose && event.reason === 'market') return { text: `${who(event.playerId)} went to market`, tone: 'neutral' }
      return null
    case 'lastCard':
      return { text: `${who(event.playerId)}: last card!`, tone: 'good' }
    case 'caught':
      return {
        text: `${who(event.byId)} caught ${mine(event.targetId) ? 'you' : nameOf(event.targetId)}`,
        tone: mine(event.targetId) ? 'bad' : 'good',
      }
    case 'reshuffled':
      return { text: 'Market reshuffled', tone: 'neutral' }
    case 'playerLeft':
      return { text: `${nameOf(event.playerId)} left the table`, tone: 'neutral' }
    case 'roundStarted':
      return { text: `Round ${event.round}`, tone: 'neutral' }
    case 'roundOver':
      return { text: `${who(event.result.winnerId)} checks up`, tone: mine(event.result.winnerId) ? 'good' : 'neutral' }
    case 'matchOver':
      return { text: `${who(event.winnerId)} wins the match`, tone: mine(event.winnerId) ? 'good' : 'neutral' }
    default:
      return null
  }
}
