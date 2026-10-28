import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests against the production build (PLAN.md section 21,
 * Testing). Headless Chromium usually has no working WebGPU, so these run
 * the WebGL2 compatibility path; WebGPU is checked on real devices.
 * Set PW_CHROMIUM_PATH to use a pre-installed browser.
 */
const executablePath = process.env.PW_CHROMIUM_PATH || undefined;

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  fullyParallel: false,
  reporter: [['list']],
  outputDir: 'e2e-results',
  use: {
    baseURL: 'http://localhost:4173',
    launchOptions: { executablePath },
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'phone', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    command: 'pnpm build && pnpm preview --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
