/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** statically defined in vite.config.ts; false when MINISYSTEM_DISABLE_DEVTOOLS is set */
  readonly MINISYSTEM_DEVTOOLS?: boolean
}
