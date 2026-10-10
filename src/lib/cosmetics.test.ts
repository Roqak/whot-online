import { beforeEach, describe, expect, it } from 'vitest'
import { BACKS, CLOTHS, isUnlocked, loadStyle, newlyUnlocked, saveStyle } from './cosmetics'
import type { PlayerStats } from './stats'

const stats = (patch: Partial<PlayerStats> = {}): PlayerStats => ({
  matchesPlayed: 0,
  matchesWon: 0,
  currentStreak: 0,
  bestStreak: 0,
  roundsWon: 0,
  lastPlayedAt: null,
  ...patch,
})

class MemoryStorage {
  private data = new Map<string, string>()
  getItem(k: string) { return this.data.get(k) ?? null }
  setItem(k: string, v: string) { this.data.set(k, v) }
  removeItem(k: string) { this.data.delete(k) }
  clear() { this.data.clear() }
}

describe('cosmetics', () => {
  beforeEach(() => {
    ;(globalThis as { localStorage: unknown }).localStorage = new MemoryStorage()
  })

  it('gives everyone the defaults and locks the rest', () => {
    expect(CLOTHS.filter((c) => isUnlocked(c, stats())).map((c) => c.id)).toEqual(['adire'])
    expect(BACKS.filter((b) => isUnlocked(b, stats())).map((b) => b.id)).toEqual(['oxblood'])
  })

  it('announces exactly what a result just earned', () => {
    const before = stats({ matchesPlayed: 4, matchesWon: 2, bestStreak: 2 })
    const after = stats({ matchesPlayed: 5, matchesWon: 3, bestStreak: 3 })
    expect(newlyUnlocked(before, after).map((i) => i.id).sort()).toEqual(['akwete', 'asooke', 'indigo'])
    expect(newlyUnlocked(after, after)).toEqual([])
  })

  it('never restores a saved pick that is unknown or not earned', () => {
    saveStyle({ cloth: 'ankara', back: 'ochre' })
    expect(loadStyle(stats())).toEqual({ cloth: 'adire', back: 'oxblood' })
    expect(loadStyle(stats({ matchesWon: 10, matchesPlayed: 20 }))).toEqual({ cloth: 'ankara', back: 'ochre' })
    localStorage.setItem('whot:style', '{"cloth":"lace","back":7}')
    expect(loadStyle(stats({ matchesWon: 99 }))).toEqual({ cloth: 'adire', back: 'oxblood' })
  })
})
