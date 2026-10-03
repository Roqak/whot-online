import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

export interface LeaderboardRecord {
  name: string
  avatar: string
  wins: number
  matches: number
  lastSeen: number
}

export interface LeaderboardEntry extends LeaderboardRecord {
  rank: number
  winRate: number
}

class LeaderboardStore {
  private records = new Map<string, LeaderboardRecord>()
  private filePath: string
  private saveTimeout: NodeJS.Timeout | null = null

  constructor(filePath?: string) {
    const dir = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.resolve(process.cwd(), 'data')
    this.filePath = filePath ?? path.join(dir, 'leaderboard.json')
    this.load()
  }

  private load() {
    try {
      if (existsSync(this.filePath)) {
        const raw = readFileSync(this.filePath, 'utf-8')
        const data = JSON.parse(raw) as LeaderboardRecord[]
        if (Array.isArray(data)) {
          for (const item of data) {
            if (item && typeof item.name === 'string') {
              this.records.set(this.key(item.name), {
                name: item.name,
                avatar: typeof item.avatar === 'string' ? item.avatar : 'lion',
                wins: Number(item.wins) || 0,
                matches: Number(item.matches) || 0,
                lastSeen: Number(item.lastSeen) || Date.now(),
              })
            }
          }
        }
      }
    } catch (err) {
      console.warn('[leaderboard] Failed to load records from disk:', err)
    }
  }

  private key(name: string): string {
    return name.trim().toLowerCase()
  }

  private scheduleSave() {
    if (this.saveTimeout) return
    this.saveTimeout = setTimeout(() => {
      this.saveTimeout = null
      this.save()
    }, 1000)
  }

  private save() {
    try {
      const dir = path.dirname(this.filePath)
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true })
      }
      const data = Array.from(this.records.values())
      writeFileSync(this.filePath, JSON.stringify(data, null, 2), 'utf-8')
    } catch (err) {
      console.warn('[leaderboard] Failed to save records to disk:', err)
    }
  }

  recordMatch(winner: { name: string; avatar: string }, participants: Array<{ name: string; avatar: string }>) {
    const now = Date.now()
    const winnerKey = this.key(winner.name)

    // Ensure all participants are registered
    for (const p of participants) {
      const k = this.key(p.name)
      if (!k) continue
      const existing = this.records.get(k) ?? {
        name: p.name.trim(),
        avatar: p.avatar,
        wins: 0,
        matches: 0,
        lastSeen: now,
      }
      existing.name = p.name.trim()
      existing.avatar = p.avatar
      existing.matches += 1
      existing.lastSeen = now
      if (k === winnerKey) {
        existing.wins += 1
      }
      this.records.set(k, existing)
    }

    this.scheduleSave()
  }

  getEntries(limit = 50): LeaderboardEntry[] {
    const list = Array.from(this.records.values())
      .filter((r) => r.matches > 0)
      .map((r) => {
        const winRate = r.matches > 0 ? Math.round((r.wins / r.matches) * 100) : 0
        return {
          ...r,
          winRate,
        }
      })
      .sort((a, b) => {
        if (b.wins !== a.wins) return b.wins - a.wins
        if (b.winRate !== a.winRate) return b.winRate - a.winRate
        if (a.matches !== b.matches) return a.matches - b.matches
        return b.lastSeen - a.lastSeen
      })

    return list.slice(0, limit).map((item, idx) => ({
      ...item,
      rank: idx + 1,
    }))
  }
}

export const leaderboard = new LeaderboardStore()
