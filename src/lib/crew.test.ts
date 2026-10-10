import { beforeEach, describe, expect, it } from 'vitest'
import { joinNames, loadCrew, recordCrew } from './crew'

class MemoryStorage {
  private data = new Map<string, string>()
  getItem(k: string) { return this.data.get(k) ?? null }
  setItem(k: string, v: string) { this.data.set(k, v) }
  removeItem(k: string) { this.data.delete(k) }
  clear() { this.data.clear() }
}

describe('crew', () => {
  beforeEach(() => {
    ;(globalThis as { localStorage: unknown }).localStorage = new MemoryStorage()
  })

  it('counts games together by name, most recent first', () => {
    recordCrew([{ name: 'Tunde', avatar: 'fox' }, { name: 'Bayo', avatar: 'owl' }], 1)
    recordCrew([{ name: 'tunde', avatar: 'lion' }], 2)
    expect(loadCrew()).toEqual([
      { name: 'tunde', avatar: 'lion', games: 2, lastPlayed: 2 },
      { name: 'Bayo', avatar: 'owl', games: 1, lastPlayed: 1 },
    ])
  })

  it('keeps only the twelve most recent people', () => {
    for (let i = 0; i < 15; i++) recordCrew([{ name: `P${i}`, avatar: 'fox' }], i)
    const crew = loadCrew()
    expect(crew).toHaveLength(12)
    expect(crew[0].name).toBe('P14')
    expect(crew.some((c) => c.name === 'P2')).toBe(false)
  })

  it('survives junk in storage', () => {
    localStorage.setItem('whot:crew', '{oops')
    expect(loadCrew()).toEqual([])
  })

  it('joins names the way people say them', () => {
    expect(joinNames(['Tunde'])).toBe('Tunde')
    expect(joinNames(['Tunde', 'Bayo'])).toBe('Tunde and Bayo')
    expect(joinNames(['Tunde', 'Bayo', 'Chidi'])).toBe('Tunde, Bayo and Chidi')
  })
})
