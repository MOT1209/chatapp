/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of the REST API, including the `/api` prefix. */
  readonly VITE_API_URL: string;
  /** WebSocket endpoint, without an `/api` prefix. */
  readonly VITE_WS_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
