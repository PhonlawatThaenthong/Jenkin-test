import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  retries: process.env.CI ? 1 : 0,
  use: { baseURL: process.env.BASE_URL ?? 'http://localhost:3000' },
  reporter: [
    ['list'],
    ['junit', { outputFile: 'results/junit.xml' }],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
  ],
});