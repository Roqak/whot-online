/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Set for the portal build: the game runs entirely in the browser, with no server. */
  readonly VITE_LOCAL_ONLY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
