import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
import path from "node:path";
import { fileURLToPath } from "node:url";

initOpenNextCloudflareForDev();

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(currentDir, "../..");

/** @type {import("next").NextConfig} */
const nextConfig = {
  webpack(config) {
    config.resolve.alias = {
      ...(config.resolve.alias ?? {}),
      "@weather-smart-money/core": path.join(packageRoot, "packages/core/dist/index.js"),
      "@weather-smart-money/data": path.join(packageRoot, "packages/data/dist/index.js")
    };
    return config;
  }
};

export default nextConfig;
