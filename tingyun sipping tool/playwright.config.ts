import { defineConfig } from "@playwright/test"

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 900_000,
  fullyParallel: false,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:3002",
    acceptDownloads: true,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  webServer: [
    {
      command: "bash ./scripts/start-backend-test.sh",
      cwd: ".",
      url: "http://127.0.0.1:8014/health",
      timeout: 120_000,
      reuseExistingServer: false,
    },
    {
      command: "bash ./scripts/start-frontend-test.sh",
      cwd: ".",
      url: "http://127.0.0.1:3002",
      timeout: 120_000,
      reuseExistingServer: false,
    },
  ],
})
