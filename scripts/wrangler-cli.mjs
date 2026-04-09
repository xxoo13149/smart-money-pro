import { existsSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const currentFile = fileURLToPath(import.meta.url);
const rootDir = path.resolve(path.dirname(currentFile), "..");
const wranglerCliPath = path.join(rootDir, "node_modules", "wrangler", "wrangler-dist", "cli.js");

if (!existsSync(wranglerCliPath)) {
  process.stderr.write(`Wrangler CLI not found at ${wranglerCliPath}\n`);
  process.exit(1);
}

const args = process.argv.slice(2);
const configIndex = args.findIndex((arg) => arg === "-c" || arg === "--config");
const configPath =
  configIndex >= 0 && args[configIndex + 1]
    ? path.resolve(process.cwd(), args[configIndex + 1])
    : null;

const env = {
  ...process.env
};

if (configPath?.includes(`${path.sep}apps${path.sep}web${path.sep}`)) {
  env.OPEN_NEXT_DEPLOY ??= "true";
}

const result = spawnSync(process.execPath, [wranglerCliPath, ...args], {
  cwd: process.cwd(),
  env,
  stdio: "inherit"
});

process.exit(result.status ?? 1);
