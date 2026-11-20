import { defineConfig } from '@playwright/test';

const executablePath = process.env.PW_CHROMIUM_PATH;

export default defineConfig({
  testDir: 'e2e',
  globalSetup: './e2e/global-setup.ts',
  reporter: 'list',
  webServer: {
    command: 'npx vite --port 5179 --strictPort',
    url: 'http://localhost:5179',
    reuseExistingServer: false,
  },
  use: {
    baseURL: 'http://localhost:5179',
    viewport: { width: 1280, height: 800 },
    launchOptions: executablePath ? { executablePath } : {},
  },
});
