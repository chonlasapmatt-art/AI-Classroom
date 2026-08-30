import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  reporter: 'html',
  use: { baseURL: 'http://127.0.0.1:4173', trace: 'on-first-retry' },
  // This suite asserts what an unconfigured deployment shows, so the build must not inherit a
  // developer's own .env.local — otherwise the gate under test never renders on their machine.
  webServer: {
    command: 'npm run build && npm run preview',
    port: 4173,
    reuseExistingServer: !process.env.CI,
    env: { VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '' }
  },
  projects: [
    { name: 'chromium-board', use: { ...devices['Desktop Chrome'], viewport: { width: 1920, height: 1080 } } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } }
  ]
});
