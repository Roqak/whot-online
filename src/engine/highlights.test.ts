import { describe, expect, it } from 'vitest'
import { MatchTally } from './highlights'
import { describeHighlight } from '../lib/highlights'
import type { Card, GameEvent, RoundResult } from '../types/game'

const card = (shape: Card['shape'], number: number): Card => ({ id: `${shape}-${number}-${Math.random()}`, shape, number })
const round = (winnerId: string, reason: RoundResult['reason'] = 'checkup'): GameEvent => ({
  type: 'roundOver',
  result: { round: 1, winnerId, reason, hands: [], eliminatedIds: [] },
})

describe('MatchTally', () => {
  it('finds the standout moments of a match', () => {
    let t = 0
    const tally = new MatchTally(() => t)
    tally.add([{ type: 'roundStarted', round: 1 }])
    tally.add([
      { type: 'played', playerId: 'ada', card: card('circle', 2) },
      { type: 'pick', playerId: 'ada', targetId: 'bayo', amount: 2 },
      { type: 'played', playerId: 'ada', card: card('star', 14) },
      { type: 'played', playerId: 'ada', card: card('cross', 1) },
      { type: 'pick', playerId: 'tunde', targetId: 'bayo', amount: 6 },
      { type: 'drew', playerId: 'bayo', count: 6, reason: 'pick' },
      { type: 'drew', playerId: 'tunde', count: 3, reason: 'market' },
      { type: 'drew', playerId: 'tunde', count: 2, reason: 'market' },
      { type: 'caught', byId: 'bayo', targetId: 'ada' },
    ])
    t = 42_000
    tally.add([round('ada'), { type: 'roundStarted', round: 2 }])
    t = 142_000
    tally.add([round('ada')])

    expect(tally.highlights()).toEqual([
      { kind: 'checkups', playerId: 'ada', value: 2 },
      { kind: 'pick', playerId: 'tunde', targetId: 'bayo', value: 6 },
      { kind: 'specials', playerId: 'ada', value: 3 },
      { kind: 'catches', playerId: 'bayo', value: 1 },
    ])
  })

  it('skips moments too small to mention', () => {
    const tally = new MatchTally(() => 0)
    tally.add([{ type: 'roundStarted', round: 1 }, { type: 'pick', playerId: 'a', targetId: 'b', amount: 2 }, round('a', 'tender')])
    expect(tally.highlights()).toEqual([])
  })

  it('times the fastest check-up, ignoring rounds won on tender', () => {
    let t = 0
    const tally = new MatchTally(() => t)
    tally.add([{ type: 'roundStarted', round: 1 }])
    t = 30_000
    tally.add([round('a', 'tender'), { type: 'roundStarted', round: 2 }])
    t = 95_000
    tally.add([round('b')])
    expect(tally.highlights()).toContainEqual({ kind: 'fastest', playerId: 'b', value: 65 })
  })

  it('leaves out "fastest" when the match was a single round', () => {
    let t = 0
    const tally = new MatchTally(() => t)
    tally.add([{ type: 'roundStarted', round: 1 }])
    t = 50_000
    tally.add([round('a')])
    expect(tally.highlights().some((h) => h.kind === 'fastest')).toBe(false)
  })
})

describe('describeHighlight', () => {
  const name = (id: string) => ({ me: 'You', b: 'Bayo', t: 'Tunde' })[id] ?? 'Someone'
  it('reads naturally for you and for others', () => {
    expect(describeHighlight({ kind: 'pick', playerId: 't', targetId: 'me', value: 6 }, name).detail).toBe('Tunde made you pick 6')
    expect(describeHighlight({ kind: 'fastest', playerId: 'me', value: 65 }, name).detail).toBe('You were out in 1:05')
    expect(describeHighlight({ kind: 'fastest', playerId: 'b', value: 42 }, name).detail).toBe('Bayo was out in 0:42')
  })
})
