import { defineConfig } from '@playwright/test';
import { resolveApiEnvironment } from './api/config/environments';

/**
 * API test suite, kept separate from the browser suite in playwright.config.ts.
 * Run with: npm run test:api
 */

// Load a local, git-ignored .env file if present (see .env.example).
try {
  process.loadEnvFile('.env');
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
}

// Validate configuration up front so a misconfigured run fails before any test starts.
resolveApiEnvironment();

export default defineConfig({
  testDir: './api/tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [['list'], ['html', { outputFolder: 'playwright-report-api', open: 'never' }]],
  outputDir: 'test-results-api',
  projects: [{ name: 'api' }],
});
