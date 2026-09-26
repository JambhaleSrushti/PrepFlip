import { defineConfig, devices } from '@playwright/test'
import path from 'node:path'

const PORT = 8123

// End-to-end tests against the real app: the built React app served by FastAPI, as in production.
// The server has the test-only /api/test/restart endpoint and a throwaway account (e2e/users.json).
export default defineConfig({
  testDir: 'e2e',
  // Tests restart the one shared server, so they must run one at a time.
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  reporter: 'list',
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run build && uv run --project ../backend prepflip-serve',
    url: `http://127.0.0.1:${PORT}/api/health`,
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      PORT: String(PORT),
      PREPFLIP_USERS_FILE: path.resolve(import.meta.dirname, 'e2e/users.json'),
      PREPFLIP_TEST_ENDPOINTS: '1',
    },
  },
})
