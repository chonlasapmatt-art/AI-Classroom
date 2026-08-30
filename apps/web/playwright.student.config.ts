import { defineConfig, devices } from '@playwright/test';

// The public entrances — student, teacher and parent — only exist once the app believes it has a
// cloud to talk to, so this suite builds with placeholder credentials. Nothing here reaches a real
// Supabase project: the point is to prove what each screen asks for and what it says when the answer
// is refused, which is exactly the part that must never regress into asking for an email address.
export default defineConfig({
  testDir: './tests/e2e-student',
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  reporter: [['list']],
  use: { baseURL: 'http://127.0.0.1:4174', trace: 'on-first-retry' },
  webServer: {
    command: 'npm run build && npm run preview -- --port 4174',
    port: 4174,
    reuseExistingServer: !process.env.CI,
    env: {
      VITE_SUPABASE_URL: 'https://e2e-placeholder.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'e2e-placeholder-anon-key'
    }
  },
  projects: [
    { name: 'student-mobile', use: { ...devices['Pixel 7'] } },
    { name: 'student-desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } }
  ]
});
