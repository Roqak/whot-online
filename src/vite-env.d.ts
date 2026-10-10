/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Set for the portal build: the game runs entirely in the browser, with no server. */
  readonly VITE_LOCAL_ONLY?: string
  /** Set for the CrazyGames portal build: wires CrazyGames SDK and compliance behaviors. */
  readonly VITE_CRAZYGAMES?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

interface CrazyGamesUser {
  username: string
  profilePictureUrl: string
}

interface CrazyGamesSettings {
  muteAudio?: boolean
  disableChat?: boolean
}

interface Window {
  /** Set by the boot script in index.html: retry a failed load with backoff, or show the failure. */
  __bootRetry?: (message?: string) => void
  CrazyGames?: {
    SDK: {
      init: () => Promise<void>
      environment?: 'local' | 'crazygames' | 'disabled'
      game?: {
        loadingStart: () => void
        loadingStop: () => void
        gameplayStart: () => void
        gameplayStop: () => void
        happytime: () => void
        settings?: CrazyGamesSettings
        addSettingsChangeListener?: (listener: (settings: CrazyGamesSettings) => void) => void
        removeSettingsChangeListener?: (listener: (settings: CrazyGamesSettings) => void) => void
      }
      user?: {
        isUserAccountAvailable: boolean
        getUser: () => Promise<CrazyGamesUser | null>
      }
      ad?: {
        requestAd: (
          type: 'midgame' | 'rewarded',
          callbacks?: {
            beforeCustomAd?: () => void
            adStarted?: () => void
            adFinished?: () => void
            adError?: (error: unknown) => void
          },
        ) => Promise<void>
      }
    }
  }
}
