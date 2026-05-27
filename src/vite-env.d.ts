/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_IMGLY_AI_PROXY_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
