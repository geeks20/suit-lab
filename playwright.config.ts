import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 3217);

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 45_000,
  fullyParallel: true,
  use: { baseURL: `http://localhost:${PORT}`, trace: "retain-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
    { name: "mobile", use: { ...devices["Desktop Chrome"], viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true } },
  ],
  webServer: {
    // Isolated: embedded database + local storage in a throwaway dir, mock provider, no Neon, no FASHN.
    command: `rm -rf .data/e2e && npm run build && npx next start -p ${PORT}`,
    env: {
      DATABASE_URL: "",
      DATA_DIR: ".data/e2e",
      STORAGE_PROVIDER: "local",
      VIRTUAL_TRYON_PROVIDER: "mock",
      FASHN_API_KEY: "",
      SUITLAB_ALLOW_LOCAL: "1",
      GENERATION_USER_HOURLY_LIMIT: "1000",
      PROFILE_USER_HOURLY_LIMIT: "1000",
    },
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
  },
});
