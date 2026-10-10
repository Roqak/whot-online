import { setSoundEnabled } from './sound'

export const isCrazyGames =
  import.meta.env.VITE_CRAZYGAMES === '1' ||
  (typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('crazygames'))

let initialized = false

let userProfileCallback: ((name: string) => void) | null = null

export function registerCrazyGamesProfileHandler(handler: (name: string) => void): void {
  userProfileCallback = handler
}

/**
 * Initializes the CrazyGames SDK v3 if running in a CrazyGames build/environment.
 * Safe to call anywhere; no-ops if not in a CrazyGames build.
 */
export async function initCrazyGames(): Promise<void> {
  if (!isCrazyGames || typeof window === 'undefined') return
  if (initialized) return

  // Wait briefly for the SDK script to be available on window
  const waitForSdk = async (retries = 25): Promise<boolean> => {
    if (window.CrazyGames?.SDK) return true
    if (retries <= 0) return false
    await new Promise((resolve) => setTimeout(resolve, 80))
    return waitForSdk(retries - 1)
  }

  const hasSdk = await waitForSdk()
  const sdk = window.CrazyGames?.SDK
  if (!hasSdk || !sdk) {
    console.warn('[CrazyGames] SDK script not detected on window')
    return
  }

  try {
    await sdk.init()
    initialized = true
    console.log('[CrazyGames] SDK initialized successfully')

    // Mark loading stopped so CrazyGames knows the game UI is ready
    sdk.game?.loadingStop()

    // Sync sound settings with platform preferences
    const settings = sdk.game?.settings
    if (settings) {
      if (typeof settings.muteAudio === 'boolean') {
        setSoundEnabled(!settings.muteAudio)
      }
      sdk.game?.addSettingsChangeListener?.((updated) => {
        if (typeof updated?.muteAudio === 'boolean') {
          setSoundEnabled(!updated.muteAudio)
        }
      })
    }

    // Try fetching the logged-in CrazyGames user profile
    if (sdk.user?.isUserAccountAvailable) {
      try {
        const user = await sdk.user.getUser()
        if (user?.username && userProfileCallback) {
          userProfileCallback(user.username)
        }
      } catch {
        // User not logged in or lookup rejected: harmless fallback
      }
    }
  } catch (err) {
    console.warn('[CrazyGames] Error during SDK initialization:', err)
  }
}

/** Tells CrazyGames gameplay has begun or resumed. */
export function crazyGameplayStart(): void {
  if (!isCrazyGames || typeof window === 'undefined') return
  try {
    window.CrazyGames?.SDK?.game?.gameplayStart()
  } catch (err) {
    console.warn('[CrazyGames] gameplayStart error:', err)
  }
}

/** Tells CrazyGames gameplay has paused or returned to menus. */
export function crazyGameplayStop(): void {
  if (!isCrazyGames || typeof window === 'undefined') return
  try {
    window.CrazyGames?.SDK?.game?.gameplayStop()
  } catch (err) {
    console.warn('[CrazyGames] gameplayStop error:', err)
  }
}

/** Triggers CrazyGames native celebratory confetti (e.g. on round/match win). */
export function crazyHappyTime(): void {
  if (!isCrazyGames || typeof window === 'undefined') return
  try {
    window.CrazyGames?.SDK?.game?.happytime()
  } catch (err) {
    console.warn('[CrazyGames] happytime error:', err)
  }
}

/** Requests a CrazyGames ad (interstitial or rewarded). */
export async function crazyRequestAd(
  type: 'midgame' | 'rewarded' = 'midgame',
  callbacks?: {
    beforeCustomAd?: () => void
    adStarted?: () => void
    adFinished?: () => void
    adError?: (error: unknown) => void
  },
): Promise<void> {
  if (!isCrazyGames || typeof window === 'undefined') return
  const adModule = window.CrazyGames?.SDK?.ad
  if (!adModule) return

  try {
    await adModule.requestAd(type, callbacks)
  } catch (err) {
    console.warn('[CrazyGames] requestAd error:', err)
    callbacks?.adError?.(err)
  }
}
