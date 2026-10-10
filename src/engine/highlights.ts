import { GameEvent, isSpecial } from '../types/game'

/**
 * Match highlights: the banter-worthy moments of a finished match, tallied
 * from the same event stream the table already plays out. Both the online
 * server and the solo table feed one of these, so everyone at a table sees
 * the same highlights.
 */
export type Highlight =
  /** Won the most rounds. value = rounds won. */
  | { kind: 'checkups'; playerId: string; value: number }
  /** The single biggest pick anyone was hit with. value = cards. */
  | { kind: 'pick'; playerId: string; targetId: string; value: number }
  /** Played the most special cards. value = specials played. */
  | { kind: 'specials'; playerId: string; value: number }
  /** Drew the most cards from market. value = cards. */
  | { kind: 'market'; playerId: string; value: number }
  /** Caught the most people forgetting "last card". value = catches. */
  | { kind: 'catches'; playerId: string; value: number }
  /** Quickest round from deal to check-up. value = seconds. */
  | { kind: 'fastest'; playerId: string; value: number }

/** Show at most this many, best first. */
const MAX_HIGHLIGHTS = 4

export class MatchTally {
  private roundWins = new Map<string, number>()
  private specials = new Map<string, number>()
  private drawn = new Map<string, number>()
  private catches = new Map<string, number>()
  private biggestPick: { playerId: string; targetId: string; value: number } | null = null
  private fastest: { playerId: string; value: number } | null = null
  private roundStartedAt: number | null = null

  constructor(private now: () => number = Date.now) {}

  add(events: GameEvent[]) {
    for (const event of events) {
      switch (event.type) {
        case 'roundStarted':
          this.roundStartedAt = this.now()
          break
        case 'played':
          if (isSpecial(event.card)) bump(this.specials, event.playerId)
          break
        case 'drew':
          // Your own trips to market, not cards someone else made you take.
          if (event.reason === 'market' || event.reason === 'timeout') bump(this.drawn, event.playerId, event.count)
          break
        case 'pick':
          if (!this.biggestPick || event.amount > this.biggestPick.value) {
            this.biggestPick = { playerId: event.playerId, targetId: event.targetId, value: event.amount }
          }
          break
        case 'caught':
          bump(this.catches, event.byId)
          break
        case 'roundOver': {
          const { winnerId, reason } = event.result
          bump(this.roundWins, winnerId)
          if (reason === 'checkup' && this.roundStartedAt !== null) {
            const seconds = Math.max(1, Math.round((this.now() - this.roundStartedAt) / 1000))
            if (!this.fastest || seconds < this.fastest.value) this.fastest = { playerId: winnerId, value: seconds }
          }
          this.roundStartedAt = null
          break
        }
      }
    }
  }

  /** The best few, skipping anything too small to be worth a mention. */
  highlights(): Highlight[] {
    const out: Highlight[] = []
    const rounds = sum(this.roundWins)
    const topWins = top(this.roundWins)
    if (rounds > 1 && topWins && topWins.value > 1) out.push({ kind: 'checkups', ...topWins })
    if (this.biggestPick && this.biggestPick.value >= 3) out.push({ kind: 'pick', ...this.biggestPick })
    const topSpecials = top(this.specials)
    if (topSpecials && topSpecials.value >= 3) out.push({ kind: 'specials', ...topSpecials })
    const topCatches = top(this.catches)
    if (topCatches) out.push({ kind: 'catches', ...topCatches })
    // In a one-round match the only check-up is trivially the fastest.
    if (this.fastest && rounds > 1) out.push({ kind: 'fastest', ...this.fastest })
    const topDrawn = top(this.drawn)
    if (topDrawn && topDrawn.value >= 4) out.push({ kind: 'market', ...topDrawn })
    return out.slice(0, MAX_HIGHLIGHTS)
  }
}

function bump(map: Map<string, number>, id: string, by = 1) {
  map.set(id, (map.get(id) ?? 0) + by)
}

function sum(map: Map<string, number>) {
  let total = 0
  for (const v of map.values()) total += v
  return total
}

/** The clear leader; ties go to whoever got there first. */
function top(map: Map<string, number>): { playerId: string; value: number } | null {
  let best: { playerId: string; value: number } | null = null
  for (const [playerId, value] of map) if (!best || value > best.value) best = { playerId, value }
  return best && best.value > 0 ? best : null
}
