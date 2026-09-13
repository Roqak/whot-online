import { isSoundEnabled, setSoundEnabled } from './sound'

/**
 * HTML5 Game Portal SDK integration (CrazyGames, Poki, GameDistribution).
 *
 * Provides a vendor-agnostic interface for game loading, gameplay lifecycle,
 * audio muting during commercial breaks, and rewarded ads.
 */

declare global {
  interface Window {
    CrazyGames?: {
      SDK: {
        init: () => Promise<void>
        environment: 'local' | 'crazygames' | 'disabled'
        game: {
          loadingStart: () => void
          loadingStop: () => void
          gameplayStart: () => void
          gameplayStop: () => void
          happytime: () => void
        }
        ad: {
          requestAd: (
            type: 'midgame' | 'rewarded',
            callbacks?: {
              adStarted?: () => void
              adFinished?: () => void
              adError?: (error: unknown) => void
            },
          ) => Promise<void>
          hasAdblock: () => Promise<boolean>
        }
        audio?: {
          addAudioListener: (callback: (audioState: boolean | { muted: boolean }) => void) => void
        }
      }
    }
    PokiSDK?: {
      init: () => Promise<void>
      gameLoadingStart: () => void
      gameLoadingFinished: () => void
      gameplayStart: () => void
      gameplayStop: () => void
      commercialBreak: (onStart?: () => void) => Promise<void>
      rewardedBreak: (onStart?: () => void) => Promise<boolean>
    }
  }
}

export type PortalType = 'crazygames' | 'poki' | 'mock' | 'none'

interface PortalState {
  initialized: boolean
  provider: PortalType
  isAdActive: boolean
  lastAdTimestamp: number
  adblockDetected: boolean
}

const state: PortalState = {
  initialized: false,
  provider: 'none',
  isAdActive: false,
  lastAdTimestamp: 0,
  adblockDetected: false,
}

// Minimum seconds between midroll / commercial break ads (CrazyGames guideline is ~90-120s)
const MIN_AD_INTERVAL_MS = 90_000

function isPortalMode(): boolean {
  if (typeof window === 'undefined') return false
  const params = new URLSearchParams(window.location.search)
  return (
    import.meta.env.VITE_LOCAL_ONLY === '1' ||
    params.has('solo') ||
    params.has('crazygames') ||
    params.has('poki')
  )
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve()
      return
    }
    const script = document.createElement('script')
    script.src = src
    script.async = true
    script.onload = () => resolve()
    script.onerror = (err) => reject(err)
    document.head.appendChild(script)
  })
}

/**
 * Initializes the appropriate portal SDK if running in portal/solo mode.
 */
export async function initPortalSDK(): Promise<PortalType> {
  if (state.initialized || typeof window === 'undefined') return state.provider
  if (!isPortalMode()) {
    state.provider = 'none'
    state.initialized = true
    return 'none'
  }

  const params = new URLSearchParams(window.location.search)
  const forceMock = params.get('mockAds') === '1'

  if (forceMock) {
    console.info('[PortalSDK] Initialized mock ad provider')
    state.provider = 'mock'
    state.initialized = true
    return 'mock'
  }

  // Check if PokiSDK is already on the page (Poki injects it in their iframe)
  if (window.PokiSDK) {
    try {
      await window.PokiSDK.init()
      state.provider = 'poki'
      state.initialized = true
      window.PokiSDK.gameLoadingFinished()
      console.info('[PortalSDK] PokiSDK initialized')
      return 'poki'
    } catch (err) {
      console.warn('[PortalSDK] Failed to init PokiSDK:', err)
    }
  }

  // Default to CrazyGames SDK v3 for the portal build
  try {
    await loadScript('https://sdk.crazygames.com/crazygames-sdk-v3.js')
    if (window.CrazyGames?.SDK) {
      await window.CrazyGames.SDK.init()
      state.provider = 'crazygames'
      state.initialized = true
      try {
        state.adblockDetected = await window.CrazyGames.SDK.ad.hasAdblock()
      } catch {
        // Ignore adblock check error
      }
      if (window.CrazyGames.SDK.audio?.addAudioListener) {
        window.CrazyGames.SDK.audio.addAudioListener((audioState) => {
          const isMuted = typeof audioState === 'boolean' ? audioState : !!audioState?.muted
          setSoundEnabled(!isMuted)
        })
      }
      window.CrazyGames.SDK.game.loadingStop()
      console.info('[PortalSDK] CrazyGames SDK initialized (environment:', window.CrazyGames.SDK.environment, ')')
      return 'crazygames'
    }
  } catch (err) {
    console.warn('[PortalSDK] CrazyGames SDK load failed (possibly offline or testing locally):', err)
  }

  state.provider = 'mock'
  state.initialized = true
  return 'mock'
}

/**
 * Notifies the portal when gameplay starts (round / match dealing).
 */
export function portalGameplayStart() {
  if (!state.initialized) return
  if (state.provider === 'crazygames' && window.CrazyGames?.SDK) {
    window.CrazyGames.SDK.game.gameplayStart()
  } else if (state.provider === 'poki' && window.PokiSDK) {
    window.PokiSDK.gameplayStart()
  }
}

/**
 * Notifies the portal when gameplay stops (game over / paused / returning to lobby).
 */
export function portalGameplayStop() {
  if (!state.initialized) return
  if (state.provider === 'crazygames' && window.CrazyGames?.SDK) {
    window.CrazyGames.SDK.game.gameplayStop()
  } else if (state.provider === 'poki' && window.PokiSDK) {
    window.PokiSDK.gameplayStop()
  }
}

/**
 * Notifies the portal of an exciting player accomplishment (checkup, round win, match victory).
 */
export function portalHappyTime() {
  if (!state.initialized) return
  if (state.provider === 'crazygames' && window.CrazyGames?.SDK) {
    window.CrazyGames.SDK.game.happytime()
  }
}

/**
 * Requests a commercial break / midgame ad if cooldown has elapsed.
 * Automatically silences game audio during the ad and restores it afterwards.
 *
 * @param force If true, bypasses the minimum time interval check.
 * @returns boolean indicating whether an ad break actually ran.
 */
export async function requestMidroll(force = false): Promise<boolean> {
  if (!isPortalMode() || state.isAdActive) return false

  const now = Date.now()
  if (!force && now - state.lastAdTimestamp < MIN_AD_INTERVAL_MS) {
    return false
  }

  const previousSoundOn = isSoundEnabled()
  state.isAdActive = true

  const cleanup = () => {
    state.isAdActive = false
    state.lastAdTimestamp = Date.now()
    setSoundEnabled(previousSoundOn)
  }

  try {
    if (state.provider === 'crazygames' && window.CrazyGames?.SDK) {
      return await new Promise<boolean>((resolve) => {
        window.CrazyGames!.SDK.ad.requestAd('midgame', {
          adStarted: () => {
            setSoundEnabled(false)
          },
          adFinished: () => {
            cleanup()
            resolve(true)
          },
          adError: (err) => {
            console.warn('[PortalSDK] CrazyGames midgame ad error:', err)
            cleanup()
            resolve(false)
          },
        })
      })
    }

    if (state.provider === 'poki' && window.PokiSDK) {
      setSoundEnabled(false)
      await window.PokiSDK.commercialBreak()
      cleanup()
      return true
    }

    if (state.provider === 'mock') {
      console.info('[PortalSDK] (Mock) Showing midgame ad break for 2s...')
      setSoundEnabled(false)
      await new Promise((r) => setTimeout(r, 2000))
      cleanup()
      return true
    }

    cleanup()
    return false
  } catch (err) {
    console.warn('[PortalSDK] requestMidroll exception:', err)
    cleanup()
    return false
  }
}

/**
 * Requests a rewarded ad break. Calls onReward() only if the player completed the ad.
 */
export async function requestRewarded(onReward: () => void): Promise<boolean> {
  if (!isPortalMode() || state.isAdActive) return false

  const previousSoundOn = isSoundEnabled()
  state.isAdActive = true

  const cleanup = () => {
    state.isAdActive = false
    setSoundEnabled(previousSoundOn)
  }

  try {
    if (state.provider === 'crazygames' && window.CrazyGames?.SDK) {
      return await new Promise<boolean>((resolve) => {
        let rewarded = false
        window.CrazyGames!.SDK.ad.requestAd('rewarded', {
          adStarted: () => {
            setSoundEnabled(false)
          },
          adFinished: () => {
            rewarded = true
            cleanup()
            onReward()
            resolve(true)
          },
          adError: (err) => {
            console.warn('[PortalSDK] CrazyGames rewarded ad error:', err)
            cleanup()
            resolve(rewarded)
          },
        })
      })
    }

    if (state.provider === 'poki' && window.PokiSDK) {
      setSoundEnabled(false)
      const success = await window.PokiSDK.rewardedBreak()
      cleanup()
      if (success) {
        onReward()
        return true
      }
      return false
    }

    if (state.provider === 'mock') {
      console.info('[PortalSDK] (Mock) Showing rewarded ad for 2s...')
      setSoundEnabled(false)
      await new Promise((r) => setTimeout(r, 2000))
      cleanup()
      onReward()
      return true
    }

    cleanup()
    return false
  } catch (err) {
    console.warn('[PortalSDK] requestRewarded exception:', err)
    cleanup()
    return false
  }
}

export function isAdActive(): boolean {
  return state.isAdActive
}

export function hasAdblock(): boolean {
  return state.adblockDetected
}
