import type { PlayerStats } from './stats'

/**
 * Table cloths and card backs, earned by playing. They're personal: they
 * change how your own table looks, so they live on this device and need no
 * server. Cloths are drawn from Nigerian textiles and kept dark, so the
 * cream cards and the labels on the table stay easy to read.
 */

export type ClothId = 'adire' | 'asooke' | 'ankara' | 'akwete'
export type BackId = 'oxblood' | 'indigo' | 'forest' | 'ochre'

interface Unlock {
  /** "Win 10 matches" */
  label: string
  /** Progress toward it: [now, goal]. */
  progress: (s: PlayerStats) => [number, number]
}

export interface Cosmetic<Id extends string> {
  id: Id
  name: string
  blurb: string
  unlock: Unlock | null
}

const played = (goal: number): Unlock => ({ label: `Play ${goal} matches`, progress: (s) => [s.matchesPlayed, goal] })
const won = (goal: number): Unlock => ({ label: `Win ${goal} matches`, progress: (s) => [s.matchesWon, goal] })
const streak = (goal: number): Unlock => ({ label: `Win ${goal} in a row`, progress: (s) => [s.bestStreak, goal] })
const checkups = (goal: number): Unlock => ({ label: `Check up ${goal} times`, progress: (s) => [s.roundsWon, goal] })

export const CLOTHS: Cosmetic<ClothId>[] = [
  { id: 'adire', name: 'Adire', blurb: 'Indigo, resist-dyed', unlock: null },
  { id: 'asooke', name: 'Aso-oke', blurb: 'Hand-woven stripes', unlock: played(5) },
  { id: 'ankara', name: 'Ankara', blurb: 'Bold wax print', unlock: won(10) },
  { id: 'akwete', name: 'Akwete', blurb: 'Woven diamonds', unlock: streak(3) },
]

export const BACKS: Cosmetic<BackId>[] = [
  { id: 'oxblood', name: 'Oxblood', blurb: 'The classic', unlock: null },
  { id: 'indigo', name: 'Indigo', blurb: 'Dyed deep', unlock: won(3) },
  { id: 'forest', name: 'Forest', blurb: 'Green as the flag', unlock: checkups(15) },
  { id: 'ochre', name: 'Ochre', blurb: 'Red earth', unlock: played(20) },
]

export function isUnlocked(item: Cosmetic<string>, stats: PlayerStats): boolean {
  if (!item.unlock) return true
  const [now, goal] = item.unlock.progress(stats)
  return now >= goal
}

/** Everything unlocked by `after` that wasn't by `before`: for the "you earned it" toast. */
export function newlyUnlocked(before: PlayerStats, after: PlayerStats): Cosmetic<string>[] {
  return [...CLOTHS, ...BACKS].filter((item) => !isUnlocked(item, before) && isUnlocked(item, after))
}

export interface Style {
  cloth: ClothId
  back: BackId
}

const KEY = 'whot:style'
export const DEFAULT_STYLE: Style = { cloth: 'adire', back: 'oxblood' }

/** The saved style, falling back to the default for anything unknown or no longer unlocked. */
export function loadStyle(stats: PlayerStats): Style {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<Style> | null
    const cloth = CLOTHS.find((c) => c.id === raw?.cloth)
    const back = BACKS.find((b) => b.id === raw?.back)
    return {
      cloth: cloth && isUnlocked(cloth, stats) ? cloth.id : DEFAULT_STYLE.cloth,
      back: back && isUnlocked(back, stats) ? back.id : DEFAULT_STYLE.back,
    }
  } catch {
    return { ...DEFAULT_STYLE }
  }
}

export function saveStyle(style: Style) {
  try {
    localStorage.setItem(KEY, JSON.stringify(style))
  } catch {
    // Not remembered; the choice still applies for this visit.
  }
}

/** Cloth and back are CSS themes keyed off attributes on <html>; see index.css. */
export function applyStyle(style: Style) {
  const root = document.documentElement
  root.dataset.cloth = style.cloth
  root.dataset.back = style.back
}
