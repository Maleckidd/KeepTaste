// e2e (https://e2e.com) — end-to-end tests, pilot. See docs/e2e.md.
//
// Two targets:
// - `web`: the react-native-web build on its in-memory sql.js database
//   (db/client.web.ts). Every page load starts from a fresh database with the
//   first-launch seed, so each test opens on the same state.
// - `android`: the release APK, already installed on a booted emulator
//   (`npm run e2e:android` installs it). A release build carries its own JS
//   bundle, so no Metro is needed. Data persists on the device between tests —
//   tests that create data use `unique()` names or clear state first.
import type { E2EConfig } from 'e2e';
import { web } from '@e2e-dev/web';
import { mobile } from '@e2e-dev/mobile';

const WEB_PORT = 8083; // 8081 = Metro dev client, 8082 = .claude/launch.json web preview

export default {
  projectId: 'keeptaste',
  tests: 'e2e/**/*.e2e.ts',
  targets: [
    {
      name: 'web',
      // Phone-sized viewport: the app is designed for phones, and the layout
      // (FAB, tab bar, bottom sheets) is what users see on Android.
      engine: web({ viewport: { width: 412, height: 915 }, locale: 'en-US' }),
      app: {
        url: `http://localhost:${WEB_PORT}`,
        command: {
          executable: 'npx',
          args: ['expo', 'start', '--web', '--port', String(WEB_PORT)],
          env: { CI: '1', BROWSER: 'none' },
          reuseExisting: true,
          log: '.e2e/logs/metro.log',
          // A cold Metro web bundle takes a while on first start.
          startupTimeout: 180_000,
        },
      },
    },
    {
      name: 'android',
      engine: mobile({ platform: 'android' }),
      app: { bundleId: 'com.damianmalecki.keeptaste' },
    },
  ],
  // The web target shares one Metro process; the emulator is one device.
  workers: 1,
  // No model yet: the pilot's tests are deterministic. Agent steps need a
  // model configured here (see docs/e2e.md).
} satisfies E2EConfig;
