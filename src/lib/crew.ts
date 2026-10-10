/**
 * Your crew: people you've played online with, remembered on this device.
 * There are no accounts, so people are known by name; a friend who renames
 * shows up as someone new, which is fine for a "play again" shortcut.
 */
export interface CrewMate {
  name: string
  avatar: string
  /** Matches played together. */
  games: number
  lastPlayed: number
}

const KEY = 'whot:crew'
const MAX_CREW = 12

export function loadCrew(): CrewMate[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '[]') as unknown
    if (!Array.isArray(raw)) return []
    return raw
      .filter(
        (c): c is CrewMate =>
          !!c && typeof c.name === 'string' && typeof c.avatar === 'string' && typeof c.games === 'number' && typeof c.lastPlayed === 'number',
      )
      .sort((a, b) => b.lastPlayed - a.lastPlayed)
  } catch {
    return []
  }
}

/** Adds one game together with each of these people; most recent first, oldest dropped. */
export function recordCrew(people: { name: string; avatar: string }[], now = Date.now()): CrewMate[] {
  const crew = loadCrew()
  for (const person of people) {
    const existing = crew.find((c) => c.name.toLowerCase() === person.name.toLowerCase())
    if (existing) {
      existing.games += 1
      existing.lastPlayed = now
      existing.avatar = person.avatar
      existing.name = person.name
    } else {
      crew.push({ name: person.name, avatar: person.avatar, games: 1, lastPlayed: now })
    }
  }
  const next = crew.sort((a, b) => b.lastPlayed - a.lastPlayed).slice(0, MAX_CREW)
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    // Private mode or full storage: the crew just isn't remembered.
  }
  return next
}

export function isCrewMate(crew: CrewMate[], name: string): boolean {
  return crew.some((c) => c.name.toLowerCase() === name.toLowerCase())
}

/** "Tunde", "Tunde and Bayo", "Tunde, Bayo and Chidi". */
export function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? ''
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}
