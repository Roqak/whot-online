/**
 * Bridge to the Android shell's Play Games Services integration.
 * `window.Android` only exists inside the WebView-wrapped app
 * (see android/.../MainActivity.java addJavascriptInterface); it's
 * undefined on the web build, so every call here is a no-op there.
 */
declare global {
  interface Window {
    Android?: {
      submitWinCount(wins: number): void
    }
  }
}

const WIN_COUNT_KEY = 'whot.wins'

function readWinCount(): number {
  if (typeof window === 'undefined') return 0
  const raw = window.localStorage.getItem(WIN_COUNT_KEY)
  const n = raw ? parseInt(raw, 10) : 0
  return Number.isFinite(n) ? n : 0
}

/** Call once per match win. Bumps the local win count and, inside the Android app, submits it to the leaderboard. */
export function reportMatchWin(): void {
  if (typeof window === 'undefined') return
  const wins = readWinCount() + 1
  window.localStorage.setItem(WIN_COUNT_KEY, String(wins))
  window.Android?.submitWinCount(wins)
}
