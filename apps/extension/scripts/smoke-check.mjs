import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(currentDir, "..");
const distDir = path.join(appDir, "dist");

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

console.log("Extension smoke check passed.");
