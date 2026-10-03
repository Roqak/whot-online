import { recordMatchResult } from '../lib/stats'

declare global {
  interface Window {
    Android?: {
      submitWinCount(wins: number): void
      showLeaderboard?(): void
    }
  }
}

export function hasNativeLeaderboard(): boolean {
  return typeof window !== 'undefined' && typeof window.Android?.showLeaderboard === 'function'
}

export function showNativeLeaderboard(): boolean {
  if (hasNativeLeaderboard()) {
    window.Android?.showLeaderboard?.()
    return true
  }
  return false
}

/** Call once per match win. Bumps the win count and submits to Android Play Games if present. */
export function reportMatchWin(): void {
  recordMatchResult({ won: true })
}

