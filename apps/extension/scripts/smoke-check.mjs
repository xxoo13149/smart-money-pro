import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(currentDir, "..");
const distDir = path.join(appDir, "dist");
const buildTarget = (process.env.EXTENSION_BUILD_TARGET ?? "dev").trim() === "release" ? "release" : "dev";

const assertModuleScript = async (htmlFile, scriptFile) => {
  const [html, js] = await Promise.all([
    readFile(path.join(distDir, htmlFile), "utf8"),
    readFile(path.join(distDir, scriptFile), "utf8")
  ]);

  const modulePattern = new RegExp(
    `<script\\s+type=["']module["']\\s+src=["']${scriptFile.replace(".", "\\.")}["']\\s*><\\/script>`,
    "i"
  );

  if (!modulePattern.test(html)) {
    throw new Error(`${htmlFile} must load ${scriptFile} with type="module".`);
  }

  if (!js.trim()) {
    throw new Error(`${scriptFile} is empty.`);
  }
};

await assertModuleScript("popup.html", "popup.js");
await assertModuleScript("sidepanel.html", "sidepanel.js");

const readJson = async (fileName) =>
  JSON.parse(await readFile(path.join(distDir, fileName), "utf8"));

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const manifest = await readJson("manifest.json");
const runtimeConfig = await readJson("runtime-config.json");

assert(manifest.manifest_version === 3, "manifest.json must be Manifest V3.");
assert(Array.isArray(manifest.host_permissions), "manifest.json must include host_permissions.");
assert(
  typeof runtimeConfig.backendBaseUrl === "string" && /^https?:\/\//.test(runtimeConfig.backendBaseUrl),
  "runtime-config.json must include backendBaseUrl."
);
assert(
  typeof runtimeConfig.adminBaseUrl === "string" && /^https?:\/\//.test(runtimeConfig.adminBaseUrl),
  "runtime-config.json must include adminBaseUrl."
);
assert(runtimeConfig.extensionVersion === manifest.version, "runtime-config extensionVersion must match manifest version.");

if (buildTarget === "release") {
  const serialized = JSON.stringify({ manifest, runtimeConfig });
  assert(!serialized.includes("localhost"), "release extension cannot reference localhost.");
  assert(!serialized.includes("127.0.0.1"), "release extension cannot reference 127.0.0.1.");
  assert(!serialized.includes("example.com"), "release extension cannot reference example.com.");
  assert(!manifest.optional_host_permissions, "release extension cannot include optional_host_permissions.");
  assert(
    manifest.host_permissions.every((permission) => !/^https?:\/\/\*\/\*/.test(permission)),
    "release extension cannot include wildcard host permissions."
  );
}

console.log("Extension smoke check passed.");
