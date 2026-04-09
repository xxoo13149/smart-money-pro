import { cp, mkdir, readFile, rm, unlink, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(currentDir, "..");
const publicDir = path.join(appDir, "public");
const distDir = path.join(appDir, "dist");

const buildTarget = (process.env.EXTENSION_BUILD_TARGET ?? "dev").trim() === "release" ? "release" : "dev";
const defaultBackendUrl = "https://app.example.com";
const defaultAdminUrl = "https://admin.example.com";
const backendUrl =
  (
    process.env.EXTENSION_BACKEND_URL?.trim() ||
    process.env.PUBLIC_EXTENSION_BASE_URL?.trim() ||
    defaultBackendUrl
  ).replace(/\/+$/, "");
const adminUrl =
  (
    process.env.EXTENSION_ADMIN_BASE_URL?.trim() ||
    process.env.ADMIN_BASE_URL?.trim() ||
    defaultAdminUrl
  ).replace(/\/+$/, "");
const workbenchPath = process.env.EXTENSION_WORKBENCH_PATH?.trim() || "/wallets";
const privacyPath = process.env.EXTENSION_PRIVACY_PATH?.trim() || "/extension/privacy";

const dedupe = (values) => [...new Set(values.filter(Boolean))];

const replaceTemplateTokens = (template, replacements) =>
  Object.entries(replacements).reduce(
    (content, [token, value]) => content.replaceAll(`__${token}__`, value),
    template
  );

const buildManifest = async () => {
  const templatePath = path.join(publicDir, "manifest.template.json");
  const template = JSON.parse(await readFile(templatePath, "utf8"));
  const pkg = JSON.parse(await readFile(path.join(appDir, "package.json"), "utf8"));
  const backendOrigin = new URL(backendUrl).origin;

  const hostPermissions =
    buildTarget === "release"
      ? dedupe(["https://polymarket.com/*", `${backendOrigin}/*`])
      : dedupe([
          "https://polymarket.com/*",
          `${backendOrigin}/*`,
          "http://localhost/*",
          "https://localhost/*",
          "http://127.0.0.1/*",
          "http://127.0.0.1:3000/*",
          "http://127.0.0.1:3001/*"
        ]);

  const manifest = {
    ...template,
    version: pkg.version,
    host_permissions: hostPermissions,
    optional_host_permissions: buildTarget === "dev" ? ["http://*/*", "https://*/*"] : undefined
  };

  if (!manifest.optional_host_permissions) {
    delete manifest.optional_host_permissions;
  }

  if (buildTarget === "release" && process.env.EXTENSION_UPDATE_URL) {
    manifest.update_url = process.env.EXTENSION_UPDATE_URL;
  }

  await writeFile(path.join(distDir, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8");
};

const buildRuntimeConfig = async () => {
  const templatePath = path.join(publicDir, "runtime-config.template.json");
  const template = await readFile(templatePath, "utf8");
  const pkg = JSON.parse(await readFile(path.join(appDir, "package.json"), "utf8"));
  const privacyPolicyUrl = new URL(privacyPath, `${adminUrl}/`).toString();

  const rendered = replaceTemplateTokens(template, {
    MODE: JSON.stringify(buildTarget),
    BACKEND_BASE_URL: JSON.stringify(backendUrl),
    ADMIN_BASE_URL: JSON.stringify(adminUrl),
    ALLOW_BACKEND_OVERRIDE: JSON.stringify(buildTarget === "dev"),
    SHOW_DEBUG_CONTROLS: JSON.stringify(buildTarget === "dev"),
    EXTENSION_VERSION: JSON.stringify(pkg.version),
    WORKBENCH_PATH: JSON.stringify(workbenchPath),
    PRIVACY_POLICY_URL: JSON.stringify(privacyPolicyUrl)
  });

  const runtimeConfig = JSON.parse(rendered);
  await writeFile(path.join(distDir, "runtime-config.json"), `${JSON.stringify(runtimeConfig, null, 2)}\n`, "utf8");
};

await mkdir(distDir, { recursive: true });
await Promise.all([
  rm(path.join(distDir, "icons"), { recursive: true, force: true }),
  unlink(path.join(distDir, "content.css")).catch(() => {}),
  unlink(path.join(distDir, "popup.css")).catch(() => {}),
  unlink(path.join(distDir, "popup.html")).catch(() => {}),
  unlink(path.join(distDir, "sidepanel.css")).catch(() => {}),
  unlink(path.join(distDir, "sidepanel.html")).catch(() => {}),
  unlink(path.join(distDir, "manifest.json")).catch(() => {}),
  unlink(path.join(distDir, "runtime-config.json")).catch(() => {})
]);
await cp(publicDir, distDir, { recursive: true });
await Promise.all([
  unlink(path.join(distDir, "manifest.template.json")).catch(() => {}),
  unlink(path.join(distDir, "runtime-config.template.json")).catch(() => {})
]);
await buildManifest();
await buildRuntimeConfig();
