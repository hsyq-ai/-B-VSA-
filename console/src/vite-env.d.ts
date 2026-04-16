/// <reference types="vite/client" />

declare module "*.less" {
  const classes: { [key: string]: string };
  export default classes;
}

interface ImportMetaEnv {
  readonly VITE_ENABLE_PARTY_LOCAL_FALLBACK?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface PyWebViewAPI {
  open_external_link: (url: string) => void;
}

declare global {
  interface Window {
    pywebview?: {
      api: PyWebViewAPI;
    };
  }
}

export {};
