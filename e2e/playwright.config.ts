import { defineConfig } from '@playwright/test';
import { readFileSync } from 'node:fs';

// Deploy base path (e.g. "/undernote") — same single source astro.config uses.
// Falls back to "" so `playwright test --list` works before setup-rich ran.
let base = '';
try {
  const m = readFileSync('./.sandbox/rich/config/site.yaml', 'utf8').match(/^base_url:\s*"?([^"\s]+)"?/m);
  if (m) base = new URL(m[1]).pathname.replace(/\/+$/, '');
} catch {}

export default defineConfig({
  testDir: './tests',
  timeout: 300_000,
  fullyParallel: false,
  workers: 2,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  projects: [
    { name: 'build', testMatch: /build\..*\.spec\.ts/ },
    {
      name: 'browser',
      testMatch: /browser\..*\.spec\.ts/,
      use: { browserName: 'chromium', baseURL: 'http://127.0.0.1:4180' },
    },
  ],
  webServer: {
    // Own static server: astro preview daemonizes (Astro 7) and Playwright
    // sees the parent exit. process.execPath because the spawned shell has no
    // `node` on PATH (known local issue — see 08-impl-notes W5.0 §5); QUOTED
    // because a default Windows install puts it under "C:\Program Files\…"
    // and the spawning shell splits the unquoted path at the space.
    command: `"${process.execPath}" lib/static-server.mjs 4180`,
    url: `http://127.0.0.1:4180${base}/`,
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
