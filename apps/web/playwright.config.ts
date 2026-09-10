import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  reporter: 'html',
  use: { baseURL: 'http://127.0.0.1:4173', trace: 'on-first-retry' },
  /*
   * The build this suite runs against: no cloud, but Preview Mode on.
   *
   * The two are separate flags and this suite needs both settings. `configuration.spec.ts` asserts
   * what an unconfigured deployment shows a stranger, so the Supabase pair is blanked and must stay
   * blanked — a developer's own .env.local would otherwise mean the gate under test never renders
   * on their machine. `avatarDesigner.spec.ts` drives the customiser through Preview Mode, because
   * that is the only way to reach a signed-in screen with no server and no account.
   *
   * Preview Mode was missing here, and the suite had never once passed in CI because of it. It
   * passed on the machine of anybody who had run `vercel env pull`, since the .env.local that
   * writes leaves VITE_ENABLE_PREVIEW_MODE set — so the flag arrived by accident on a developer's
   * machine and not at all on the runner. `/preview` on a build without it redirects to `/welcome`,
   * which has no "เปลี่ยน Avatar" button, so the click sat there for its full thirty seconds and
   * the failure named a timeout rather than a missing flag.
   *
   * Stating it here is also what stops it depending on a developer's environment in either
   * direction: this is now the same build on every machine.
   */
  webServer: {
    command: 'npm run build && npm run preview',
    port: 4173,
    reuseExistingServer: !process.env.CI,
    env: {
      VITE_SUPABASE_URL: '',
      VITE_SUPABASE_ANON_KEY: '',
      VITE_ENABLE_PREVIEW_MODE: 'true'
    }
  },
  projects: [
    { name: 'chromium-board', use: { ...devices['Desktop Chrome'], viewport: { width: 1920, height: 1080 } } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } }
  ]
});
