import { publicOrigin } from '../net/protocol'

export interface PlayerStats {
  matchesPlayed: number
  matchesWon: number
  currentStreak: number
  bestStreak: number
  roundsWon: number
  lastPlayedAt: number | null
}

export interface LeaderboardEntry {
  rank: number
  name: string
  avatar: string
  wins: number
  matches: number
  winRate: number
  lastSeen: number
}

const STATS_KEY = 'whot.stats'
const WIN_COUNT_KEY = 'whot.wins'

const DEFAULT_STATS: PlayerStats = {
  matchesPlayed: 0,
  matchesWon: 0,
  currentStreak: 0,
  bestStreak: 0,
  roundsWon: 0,
  lastPlayedAt: null,
}

export function getPlayerStats(): PlayerStats {
  if (typeof window === 'undefined') return { ...DEFAULT_STATS }
  try {
    const raw = window.localStorage.getItem(STATS_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<PlayerStats>
      return {
        matchesPlayed: Number(parsed.matchesPlayed) || 0,
        matchesWon: Number(parsed.matchesWon) || 0,
        currentStreak: Number(parsed.currentStreak) || 0,
        bestStreak: Number(parsed.bestStreak) || 0,
        roundsWon: Number(parsed.roundsWon) || 0,
        lastPlayedAt: parsed.lastPlayedAt ?? null,
      }
    }

    // Migrate from legacy single win counter if present
    const legacyWinsRaw = window.localStorage.getItem(WIN_COUNT_KEY)
    const legacyWins = legacyWinsRaw ? parseInt(legacyWinsRaw, 10) : 0
    if (Number.isFinite(legacyWins) && legacyWins > 0) {
      const migrated: PlayerStats = {
        matchesPlayed: legacyWins,
        matchesWon: legacyWins,
        currentStreak: legacyWins,
        bestStreak: legacyWins,
        roundsWon: legacyWins,
        lastPlayedAt: Date.now(),
      }
      window.localStorage.setItem(STATS_KEY, JSON.stringify(migrated))
      return migrated
    }
  } catch {
    // Local storage disabled or private browsing
  }
  return { ...DEFAULT_STATS }
}

export function recordMatchResult({ won }: { won: boolean }): PlayerStats {
  if (typeof window === 'undefined') return { ...DEFAULT_STATS }
  const stats = getPlayerStats()
  stats.matchesPlayed += 1
  if (won) {
    stats.matchesWon += 1
    stats.currentStreak += 1
    stats.bestStreak = Math.max(stats.bestStreak, stats.currentStreak)
  } else {
    stats.currentStreak = 0
  }
  stats.lastPlayedAt = Date.now()

  try {
    window.localStorage.setItem(STATS_KEY, JSON.stringify(stats))
    window.localStorage.setItem(WIN_COUNT_KEY, String(stats.matchesWon))
  } catch {
    // Ignore storage errors
  }

  // Submit to Android Play Games Services if inside WebView
  window.Android?.submitWinCount(stats.matchesWon)

  return stats
}

export function recordRoundWin(): void {
  if (typeof window === 'undefined') return
  const stats = getPlayerStats()
  stats.roundsWon += 1
  try {
    window.localStorage.setItem(STATS_KEY, JSON.stringify(stats))
  } catch {
    // Ignore storage errors
  }
}

export async function fetchGlobalLeaderboard(): Promise<LeaderboardEntry[]> {
  try {
    const origin = publicOrigin()
    const res = await fetch(`${origin}/api/leaderboard`, {
      headers: { Accept: 'application/json' },
    })
    if (!res.ok) return []
    const data = (await res.json()) as { ok: boolean; entries: LeaderboardEntry[] }
    return Array.isArray(data?.entries) ? data.entries : []
  } catch {
    return []
  }
}
