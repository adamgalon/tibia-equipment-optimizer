import { defineConfig, devices } from '@playwright/test';

// Smoke tests against the production build (`npm run build` first); they never call the third-party price API.
export default defineConfig({
  testDir: 'e2e',
  testMatch: '*.e2e.ts',
  retries: process.env.CI ? 1 : 0,
  use: { baseURL: 'http://localhost:4173/' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'phone', use: { ...devices['Pixel 7'] } },
  ],
  webServer: { command: 'npx vite preview --port 4173 --strictPort', url: 'http://localhost:4173/', reuseExistingServer: !process.env.CI },
});
