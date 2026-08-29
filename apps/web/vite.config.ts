import { readFileSync } from 'node:fs';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

export default defineConfig({
  // Surfaced in the update banner and on the Settings screen.
  define: {
    __APP_VERSION__: JSON.stringify(version),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString())
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      // The app asks before reloading, so a lesson is never interrupted by an automatic swap.
      includeAssets: ['icons/icon.svg'],
      manifest: {
        name: 'AI Smart Classroom',
        short_name: 'Smart Class',
        description: 'ระบบบริหารห้องเรียนอัจฉริยะแบบ Local-first',
        lang: 'th',
        start_url: '/',
        display: 'standalone',
        background_color: '#f5f6fb',
        theme_color: '#5b3df5',
        icons: [
          { src: '/icons/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }
        ]
      },
      workbox: {
        navigateFallback: '/index.html',
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        cleanupOutdatedCaches: true
      }
    })
  ],
  server: { port: 5173 },
  preview: { port: 4173 },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          cloud: ['@supabase/supabase-js'],
          localdb: ['dexie', 'dexie-react-hooks']
        }
      }
    }
  },
  test: {
    environment: 'jsdom',
    setupFiles: './tests/setup.ts',
    include: ['tests/unit/**/*.test.{ts,tsx}', 'tests/integration/**/*.test.{ts,tsx}'],
    coverage: { provider: 'v8', reporter: ['text', 'html'], include: ['src/**/*.{ts,tsx}'] }
  }
});
