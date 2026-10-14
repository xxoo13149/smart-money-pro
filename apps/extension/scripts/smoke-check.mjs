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

// Regression lock for the city panel silently never rendering.
//
// sendBackgroundMessage() already unwraps the background `{ ok, payload }`
// envelope and resolves with `payload` itself. The city panel used to gate on
// `result.ok` / `result.payload` anyway, so every market page resolved to
// render(null) and the panel was invisible everywhere. Static checks in this
// file never exercised the message round-trip, so it shipped; assert the
// compiled call site directly so the double unwrap cannot come back.
const contentScript = await readFile(path.join(distDir, "content-script.js"), "utf8");

assert(contentScript.includes("wsm:getCityWinRate"), "content-script.js must request city win rate.");
assert(
  contentScript.includes("mountCityWinRatePanel"),
  "content-script.js must mount the city win rate panel."
);
assert(
  !/result\?\.ok\s*\?\s*result\.payload/.test(contentScript),
  "content-script.js must not double-unwrap the background response envelope for city win rate."
);
assert(
  !/^\s*import\s/m.test(contentScript),
  "content-script.js runs as a classic script and must not contain top-level ES imports."
);

// The city panel originally declared top-level `ROOT_CLASS`, which collided
// with the annotation renderer's `ROOT_CLASS` inside the IIFE. That threw
// "Identifier 'ROOT_CLASS' has already been declared" at parse time, so the
// ENTIRE content script died before annotating anything. tsc and node --check
// both pass on it (redeclaration in a shared module scope is only fatal in the
// browser), so assert the declaration is unique instead of trusting the build.
const rootClassDeclarations = contentScript.match(/^\s*const ROOT_CLASS\s*=/gm) ?? [];
assert(
  rootClassDeclarations.length <= 1,
  `content-script.js declares ROOT_CLASS ${rootClassDeclarations.length} times; ` +
    "a second declaration aborts the whole content script in the browser."
);
assert(
  contentScript.includes('const CITY_PANEL_ROOT_CLASS = "wsm-city-panel"'),
  "content-script.js must keep the city panel root class on its own CITY_PANEL_* name."
);

// The real invariant: background.ts re-injects content-script.js via
// chrome.scripting.executeScript whenever the wsm:ping handshake fails, so the
// same classic script routinely runs twice in one frame. Two classic scripts
// share the frame's global lexical scope, so ANY top-level let/const/class/function
// redeclaration throws at parse time — before the __WSM_CONTENT_SCRIPT_READY__
// runtime guard can help — and takes the whole content script down. tsc and
// node --check both accept this, so assert zero top-level declarations instead
// of trusting the build. Everything must live inside an IIFE.
const topLevelDeclarations = contentScript.match(
  /^(?:const|let|var|class|function|async function)\s+[A-Za-z_$]/gm
) ?? [];
assert(
  topLevelDeclarations.length === 0,
  "content-script.js declares identifiers at top level; a second injection into the " +
    `same frame will throw "already been declared". Found: ${topLevelDeclarations.join(", ")}`
);

// The annotation failure path must not clear the city panel. fetchCityWinRate
// resolves from the local cache almost instantly, so the panel renders, and then
// the annotation request 401s and used to wipe it again — leaving the panel
// invisible on every page. The city panel is driven only by its own request and
// by the route-change reset, so assert the catch arm never renders null.
const annotationCatchArm = contentScript.match(
  /catch\s*\((?:error|err|e)\)\s*\{\s*cityWinRatePanel\.render\(null\)/
);
assert(
  !annotationCatchArm,
  "content-script.js clears the city panel inside the annotation catch; a failed " +
    "annotation request erases the already-rendered city win rate."
);
assert(
  contentScript.includes("cityWinRatePanel.render(payload ?? null)"),
  "content-script.js must render the city win rate payload returned by background."
);

console.log("Extension smoke check passed.");
