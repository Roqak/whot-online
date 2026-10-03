import { describe, expect, it } from 'vitest'
import { leaderboard } from './leaderboard'

describe('server leaderboard', () => {
  it('records match results and ranks players by wins and winrate', () => {
    leaderboard.recordMatch(
      { name: 'PlayerOne', avatar: 'lion' },
      [
        { name: 'PlayerOne', avatar: 'lion' },
        { name: 'PlayerTwo', avatar: 'fox' },
      ],
    )

    leaderboard.recordMatch(
      { name: 'PlayerOne', avatar: 'lion' },
      [
        { name: 'PlayerOne', avatar: 'lion' },
        { name: 'PlayerTwo', avatar: 'fox' },
      ],
    )

    leaderboard.recordMatch(
      { name: 'PlayerTwo', avatar: 'fox' },
      [
        { name: 'PlayerOne', avatar: 'lion' },
        { name: 'PlayerTwo', avatar: 'fox' },
      ],
    )

    const entries = leaderboard.getEntries(10)
    expect(entries.length).toBeGreaterThanOrEqual(2)

    const p1 = entries.find((e) => e.name.toLowerCase() === 'playerone')
    const p2 = entries.find((e) => e.name.toLowerCase() === 'playertwo')

    expect(p1).toBeDefined()
    expect(p2).toBeDefined()
    expect(p1!.wins).toBe(2)
    expect(p1!.matches).toBe(3)
    expect(p2!.wins).toBe(1)
    expect(p2!.matches).toBe(3)
    expect(p1!.rank).toBeLessThan(p2!.rank)
  })
})
