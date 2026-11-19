// End-to-end tests on the static web export (SPEC.md §2: the web build is a
// test harness, not a product platform). It runs on an in-memory sql.js
// database (db/client.web.ts), so every page load starts from a fresh install
// with the first-launch seed — tests are independent by construction.
// Native behaviour (file system, sharing, image picker, notifications) is
// out of reach here and verified on-device; see docs/TESTING.md.
//
//   npm run e2e:build   # expo export -p web → dist/
//   npm run e2e         # serve dist/ and run the specs
import { defineConfig, devices } from '@playwright/test';

const PORT = 8090;

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    // The app is designed for phones; this is the layout Android users see.
    ...devices['Pixel 7'],
    locale: 'en-US',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'web-chromium', use: { browserName: 'chromium' } }],
  webServer: {
    command: `node e2e/support/serve.mjs dist ${PORT}`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
