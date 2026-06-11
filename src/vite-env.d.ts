/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** statically defined in vite.config.ts; true when MINISYSTEM_DISABLE_DEVTOOLS is set */
  readonly VITE_DEVTOOLS_DISABLED?: boolean
}
