import { beforeEach, describe, expect, it } from 'vitest'
import { getPlayerStats, recordMatchResult, recordRoundWin } from './stats'

class MockStorage implements Storage {
  private store = new Map<string, string>()
  get length() {
    return this.store.size
  }
  clear() {
    this.store.clear()
  }
  getItem(key: string) {
    return this.store.get(key) ?? null
  }
  setItem(key: string, value: string) {
    this.store.set(key, value)
  }
  removeItem(key: string) {
    this.store.delete(key)
  }
  key(index: number) {
    return Array.from(this.store.keys())[index] ?? null
  }
}

describe('stats', () => {
  beforeEach(() => {
    const mockStorage = new MockStorage()
    // @ts-expect-error test mock
    globalThis.window = {
      localStorage: mockStorage,
    }
  })

  it('starts with default stats when empty', () => {
    const s = getPlayerStats()
    expect(s.matchesPlayed).toBe(0)
    expect(s.matchesWon).toBe(0)
    expect(s.currentStreak).toBe(0)
    expect(s.bestStreak).toBe(0)
    expect(s.roundsWon).toBe(0)
  })

  it('increments matches, wins, and streaks on a win', () => {
    recordMatchResult({ won: true })
    const s1 = getPlayerStats()
    expect(s1.matchesPlayed).toBe(1)
    expect(s1.matchesWon).toBe(1)
    expect(s1.currentStreak).toBe(1)
    expect(s1.bestStreak).toBe(1)

    recordMatchResult({ won: true })
    const s2 = getPlayerStats()
    expect(s2.matchesPlayed).toBe(2)
    expect(s2.matchesWon).toBe(2)
    expect(s2.currentStreak).toBe(2)
    expect(s2.bestStreak).toBe(2)
  })

  it('resets current streak on loss while preserving best streak', () => {
    recordMatchResult({ won: true })
    recordMatchResult({ won: true })
    recordMatchResult({ won: false })

    const s = getPlayerStats()
    expect(s.matchesPlayed).toBe(3)
    expect(s.matchesWon).toBe(2)
    expect(s.currentStreak).toBe(0)
    expect(s.bestStreak).toBe(2)
  })

  it('increments check-up count on round win', () => {
    recordRoundWin()
    recordRoundWin()
    const s = getPlayerStats()
    expect(s.roundsWon).toBe(2)
  })
})
