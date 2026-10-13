import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const currentFile = fileURLToPath(import.meta.url);
const rootDir = path.resolve(path.dirname(currentFile), "..");

const normalizeSql = (value) =>
  value
    .replace(/--.*$/gm, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

const extractTableNames = (sql) => {
  const names = new Set();
  const pattern = /create\s+table\s+if\s+not\s+exists\s+([a-zA-Z0-9_]+)/gi;
  let match;
  while ((match = pattern.exec(sql))) {
    names.add(match[1]);
  }
  return names;
};

const readText = (relativePath) => readFile(path.join(rootDir, relativePath), "utf8");

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const auditSchema = async () => {
  const [schemaSource, migrationSql] = await Promise.all([
    readText("packages/data/src/schema.ts"),
    readText("packages/data/migrations/0001-init.sql")
  ]);
  const schemaTables = extractTableNames(schemaSource);
  const migrationTables = extractTableNames(migrationSql);
  const missingInMigration = [...schemaTables].filter((name) => !migrationTables.has(name));

  assert(
    missingInMigration.length === 0,
    `Migration 0001 is missing tables from schema.ts: ${missingInMigration.join(", ")}`
  );

  const normalizedMigration = normalizeSql(migrationSql);
  for (const required of [
    "idx_wallet_finder_ai_run",
    "idx_wallet_finder_ai_updated",
    "idx_admin_sessions_expires",
    "idx_extension_sessions_refresh_exp"
  ]) {
    assert(
      normalizedMigration.includes(required.toLowerCase()),
      `Migration 0001 is missing required index ${required}`
    );
  }
};

const auditCloudflareConfig = async () => {
  const [webConfigRaw, workerConfigRaw] = await Promise.all([
    readText("apps/web/wrangler.jsonc"),
    readText("apps/worker/wrangler.toml")
  ]);
  const webConfig = JSON.parse(webConfigRaw);

  const webVars = webConfig.vars ?? {};
  for (const key of ["ADMIN_BASE_URL", "PUBLIC_EXTENSION_BASE_URL"]) {
    const workerMatch = workerConfigRaw.match(new RegExp(`^${key}\\s*=\\s*"([^"]+)"`, "m"));
    assert(workerMatch, `Worker config is missing ${key}`);
    assert(
      webVars[key] === workerMatch[1],
      `Cloudflare config mismatch for ${key}: web=${webVars[key]} worker=${workerMatch[1]}`
    );
  }

  const webD1 = webConfig.d1_databases?.[0];
  const webKv = webConfig.kv_namespaces?.[0];
  const workerD1Match = workerConfigRaw.match(/database_id\s*=\s*"([^"]+)"/);
  const workerKvMatch = workerConfigRaw.match(/^\s*id\s*=\s*"([^"]+)"/m);

  assert(webD1?.database_id && workerD1Match?.[1], "Missing D1 database IDs in Wrangler config");
  assert(webKv?.id && workerKvMatch?.[1], "Missing KV namespace IDs in Wrangler config");
  assert(
    webD1.database_id === workerD1Match[1],
    `D1 database_id mismatch: web=${webD1.database_id} worker=${workerD1Match[1]}`
  );
  assert(
    webKv.id === workerKvMatch[1],
    `KV namespace id mismatch: web=${webKv.id} worker=${workerKvMatch[1]}`
  );
};

await auditSchema();
await auditCloudflareConfig();
console.log("Project audit passed.");
