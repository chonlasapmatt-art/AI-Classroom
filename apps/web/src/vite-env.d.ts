/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/react" />
/// <reference types="vite-plugin-pwa/client" />

/** Injected at build time from apps/web/package.json. */
declare const __APP_VERSION__: string;
declare const __BUILD_TIME__: string;

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  readonly VITE_APP_ENV?: 'development' | 'staging' | 'production';
  readonly VITE_APP_BASE_URL?: string;
  readonly VITE_SYNC_PROTOCOL_VERSION?: string;
  /** Enables the development Preview Mode entry point in a non-development build. */
  readonly VITE_ENABLE_PREVIEW_MODE?: string;
}

interface ImportMeta { readonly env: ImportMetaEnv }
