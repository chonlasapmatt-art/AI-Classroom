import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import type { PluginOption } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

/**
 * The operations console is a second page, not a route in the customer app.
 *
 * That is what keeps it out of the product a school installs: the Android build takes the customer
 * entry alone, so the console's code is not in the bundle to be found rather than merely hidden
 * behind a menu that is not rendered. A deployment that does not want the console at all sets
 * INCLUDE_PLATFORM_CONSOLE=false and it is not built.
 */
const includePlatformConsole = process.env.INCLUDE_PLATFORM_CONSOLE !== 'false';
const entry = (path: string) => fileURLToPath(new URL(path, import.meta.url));

/**
 * Writes the built version where a running tab can read it.
 *
 * A tab notices that a new service worker is waiting, but the worker never tells it what version is
 * waiting — so the app could say "there is an update" and nothing more. This one small file is the
 * answer: fetched when the prompt appears, compared with the running version, and turned into the
 * difference between "a fix" and "a new version". It is written at build time and carries nothing
 * a school owns.
 *
 * The release notes travel with it for the same reason. The banner offering the update is drawn by
 * the build that is being replaced, so it can only say what the new one contains if the new one
 * ships the answer — and this file is already fetched at exactly that moment.
 */
const releaseNotes = JSON.parse(
  readFileSync(new URL('./src/app/releaseNotes.json', import.meta.url), 'utf8')
) as { notes: unknown[] };

const versionManifest = (): PluginOption => ({
  name: 'app-version-manifest',
  generateBundle(this: { emitFile(file: { type: 'asset'; fileName: string; source: string }): void }) {
    this.emitFile({
      type: 'asset',
      fileName: 'version.json',
      source: JSON.stringify({
        version,
        buildTime: new Date().toISOString(),
        notes: releaseNotes.notes
      })
    });
  }
});

export default defineConfig({
  // Surfaced in the update banner and on the Settings screen.
  define: {
    __APP_VERSION__: JSON.stringify(version),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString())
  },
  plugins: [
    react(),
    versionManifest(),
    VitePWA({
      registerType: 'autoUpdate',
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
        // The console is never served from the cache. It is an operations tool that must show what
        // the server says right now, and a stale shell reporting yesterday's health is worse than
        // no console at all.
        navigateFallbackDenylist: [/^\/platform/],
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        globIgnores: ['platform/**', 'assets/platform-*.js'],
        cleanupOutdatedCaches: true,
        /*
         * The new worker takes over by itself, and this is a correction rather than a preference.
         *
         * Without it a freshly installed worker sits in `waiting` until the running page sends it
         * SKIP_WAITING — which the app only does when somebody presses "อัปเดตตอนนี้". That made one
         * button the single door to every future version, so any fault behind it stranded the device
         * for good: an outbox that never drained refused the press, and a waiting worker that had
         * since been collected made the press do nothing at all. Both were real, both were fixed —
         * and neither fix could reach the devices that were already stuck, because reaching them
         * meant shipping them new JavaScript through the door that was broken.
         *
         * The usual escape, "close every tab and reopen", does not work for the installed app: the
         * waiting worker only activates once no client of the origin is left, and a classroom tablet
         * with the app permanently open never gets there.
         *
         * So the swap no longer needs asking. `skipWaiting` activates the new worker as soon as it
         * has installed; `clientsClaim` puts it in charge of pages that are already open. Nothing
         * reloads — the running page keeps its own JavaScript until the person reloads or navigates,
         * so no lesson is interrupted — but from that moment the next ordinary refresh serves the
         * new build, and the update prompt becomes a convenience rather than the only way through.
         */
        skipWaiting: true,
        clientsClaim: true
      }
    })
  ],
  server: { port: 5173 },
  preview: { port: 4173 },
  build: {
    rollupOptions: {
      input: includePlatformConsole
        ? { main: entry('./index.html'), platform: entry('./platform/index.html') }
        : { main: entry('./index.html') },
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
    /*
     * Five seconds is the default and it is not enough for this suite.
     *
     * The heaviest screens here mount the whole shell against a fixture school — four seconds on an
     * idle machine for one of them — and the suite runs several files at once. Every failure this
     * produced was a timeout on a test that passes on its own, which reports a product bug that is
     * not there and hides the ones that are.
     */
    testTimeout: 20_000,
    hookTimeout: 20_000,
    include: ['tests/unit/**/*.test.{ts,tsx}', 'tests/integration/**/*.test.{ts,tsx}'],
    coverage: { provider: 'v8', reporter: ['text', 'html'], include: ['src/**/*.{ts,tsx}'] }
  }
});
