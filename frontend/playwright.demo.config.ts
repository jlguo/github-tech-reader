import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: /demo-walkthrough\.spec\.ts/,
  timeout: 180000,
  retries: 0,
  workers: 1,
  fullyParallel: false,
  use: {
    baseURL: "http://localhost:5173",
    viewport: { width: 1280, height: 800 },
    video: {
      mode: "on",
      size: { width: 1280, height: 800 },
    },
    trace: "off",
    screenshot: "off",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: {
          executablePath:
            process.env.CHROME_PATH || "/home/jlguo/.local/bin/google-chrome",
        },
      },
    },
  ],
  webServer: {
    command: "pnpm dev",
    url: "http://localhost:5173",
    reuseExistingServer: true,
  },
  outputDir: "demo-recording",
});
