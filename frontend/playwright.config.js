import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  use: { baseURL: 'http://127.0.0.1:4173', trace: 'on-first-retry' },
  webServer: { command: 'node scripts/e2e-server.mjs', url: 'http://127.0.0.1:4173', reuseExistingServer: false, timeout: 30_000 },
});
