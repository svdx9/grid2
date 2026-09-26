import { defineConfig } from "@playwright/test"

const appDir = process.env.EVAL_APP_DIR
if (!appDir) throw new Error("EVAL_APP_DIR must point at the app under test")
const port = Number(process.env.EVAL_PORT ?? 5199)

export default defineConfig({
  testDir: ".",
  timeout: 30_000,
  workers: 1,
  reporter: [["list"], ["json", { outputFile: process.env.EVAL_REPORT ?? "report.json" }]],
  use: {
    baseURL: `http://localhost:${port}`,
    viewport: { width: 1400, height: 900 },
    permissions: ["clipboard-read", "clipboard-write"],
    launchOptions: process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : undefined,
  },
  webServer: {
    command: `npx vite --port ${port} --strictPort`,
    cwd: appDir,
    url: `http://localhost:${port}`,
    reuseExistingServer: false,
    timeout: 60_000,
  },
})
