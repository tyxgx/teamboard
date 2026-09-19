import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default function globalSetup() {
  const backend = path.resolve(__dirname, "../../backend");
  execFileSync("node", ["scripts/e2e-seed.js", path.resolve(__dirname, ".seed.json")], {
    cwd: backend,
    stdio: "inherit",
    env: { ...process.env, JWT_SECRET: process.env.JWT_SECRET ?? "e2e-secret-not-for-prod" },
  });
}
