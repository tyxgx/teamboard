import { defineConfig, devices } from "@playwright/test";

const JWT_SECRET = process.env.JWT_SECRET ?? "e2e-secret-not-for-prod";
process.env.JWT_SECRET = JWT_SECRET;
const DATABASE_URL =
  process.env.DATABASE_URL ?? "postgresql://uttkarshtyagi@localhost:5432/teamboard_dev";
process.env.DATABASE_URL = DATABASE_URL;

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: false, // tests share one seeded board and assert on live socket events
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 30_000,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: { baseURL: "http://localhost:5173", trace: "retain-on-failure", screenshot: "only-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "npm run dev",
      cwd: "../backend",
      url: "http://localhost:5001/",
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      env: {
        PORT: "5001",
        RTM_ENABLED: "true",
        JWT_SECRET,
        DATABASE_URL,
        FRONTEND_ORIGIN: "http://localhost:5173",
        NODE_ENV: "development",
      },
    },
    {
      command: "npx vite --port 5173 --strictPort",
      url: "http://localhost:5173/",
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      env: {
        VITE_BACKEND_URL: "http://localhost:5001",
        VITE_GOOGLE_CLIENT_ID: "e2e.apps.googleusercontent.com",
        VITE_RTM_ENABLED: "true",
      },
    },
  ],
});
