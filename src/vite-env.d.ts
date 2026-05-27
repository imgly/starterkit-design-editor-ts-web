/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_AI_API_KEY?: string;
  readonly VITE_AI_GATEWAY_URL?: string;
  readonly VITE_CESDK_LICENSE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
