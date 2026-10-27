/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** URL base del backend. Por defecto http://localhost:8080 */
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
