/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  readonly VITE_APP_ENV?: 'development' | 'staging' | 'production';
  readonly VITE_APP_BASE_URL?: string;
  readonly VITE_SYNC_PROTOCOL_VERSION?: string;
}

interface ImportMeta { readonly env: ImportMetaEnv }
