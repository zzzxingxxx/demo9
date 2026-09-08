import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/browser",
  timeout: 120000,
  expect: { timeout: 15000 },
  workers: 1,
  use: {
    baseURL: process.env.WORKBENCH_URL || "http://127.0.0.1:5173",
    headless: true,
    actionTimeout: 15000,
    channel:
      process.env.PLAYWRIGHT_CHANNEL ||
      (process.platform === "win32" ? "msedge" : undefined),
    viewport: { width: 1440, height: 1000 },
    screenshot: "only-on-failure",
    trace: "retain-on-failure"
  },
  reporter: "list"
});
