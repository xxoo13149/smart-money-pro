import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const currentFile = fileURLToPath(import.meta.url);
const rootDir = path.resolve(path.dirname(currentFile), "..");
const wranglerRunnerPath = path.join(rootDir, "scripts", "wrangler-cli.mjs");
const workerConfigPath = path.join(rootDir, "apps", "worker", "wrangler.toml");
const webConfigPath = path.join(rootDir, "apps", "web", "wrangler.jsonc");
const tempDir = path.join(rootDir, ".tmp");
const tempSeedPath = path.join(tempDir, "smart-money-seed.sql");
const migrationArgPath = "packages/data/migrations/0001-init.sql";
const tempSeedArgPath = ".tmp/smart-money-seed.sql";
const REQUIRED_SCHEMA_TABLES = [
  "wallets",
  "wallet_notes",
  "wallet_user_labels",
  "wallet_watchlist",
  "wallet_audit_logs",
  "wallet_saved_views",
  "wallet_import_batches",
  "extension_invites",
  "extension_sessions",
  "dataset_versions"
];
const REQUIRED_WALLET_COLUMNS = [
  "source_type",
  "curation_status",
  "last_imported_at",
  "import_batch_id",
  "deleted_at",
  "deleted_by",
  "delete_reason"
];

const DEFAULTS = {
  d1Name: "smart-money-prod",
  kvName: "smart-money-cache",
  appSubdomain: "app",
  adminSubdomain: "admin",
  d1Location: "apac",
  inviteCode: "demo-team"
};

const usage = `Usage:
  node scripts/deploy-cloudflare.mjs [options]

Required:
  --domain <example.com>         Root domain managed by Cloudflare

Authentication:
  --api-token <token>            Cloudflare API Token
  --api-key <key> --email <mail> Cloudflare Global API Key plus login email

Optional:
  --account-id <id>              Cloudflare account ID
  --zone-id <id>                 Cloudflare zone ID
  --app-host <host>              Defaults to app.<domain>
  --admin-host <host>            Defaults to admin.<domain>
  --extension-secret <secret>    Worker EXTENSION_TOKEN_SECRET value
  --invite-code <code>           Invite code inserted into D1 after seed
  --gemini-key <key>             Admin app GEMINI_API_KEY secret
  --groq-key <key>               Admin app GROQ_API_KEY secret
  --skip-worker                  Skip worker deploy
  --skip-web                     Skip admin deploy
  --skip-extension               Skip extension release build
  --skip-seed                    Skip D1 migration and seed
  --dry-run                      Resolve resources and rewrite config only
  --help                         Show this message

Environment equivalents:
  CF_API_TOKEN / CLOUDFLARE_API_TOKEN
  CF_API_KEY / CLOUDFLARE_API_KEY / CF_GLOBAL_API_KEY
  CF_EMAIL / CLOUDFLARE_EMAIL
  CF_ACCOUNT_ID / CLOUDFLARE_ACCOUNT_ID
  CF_ZONE_ID / CLOUDFLARE_ZONE_ID
  CF_DOMAIN / CLOUDFLARE_DOMAIN
  CF_APP_HOST / CLOUDFLARE_APP_HOST
  CF_ADMIN_HOST / CLOUDFLARE_ADMIN_HOST
  EXTENSION_TOKEN_SECRET
  EXTENSION_INVITE_CODE
  GEMINI_API_KEY
  GROQ_API_KEY
`;

const parseArgs = (argv) => {
  const options = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      continue;
    }

    const key = token.slice(2);
    if (["help", "dry-run", "skip-worker", "skip-web", "skip-extension", "skip-seed"].includes(key)) {
      options[key] = true;
      continue;
    }

    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`Missing value for --${key}`);
    }

    options[key] = value;
    index += 1;
  }

  return options;
};

const envValue = (...names) => {
  for (const name of names) {
    const value = process.env[name];
    if (value && value.trim()) {
      return value.trim();
    }
  }
  return undefined;
};

const maskSecret = (value) => {
  if (!value) {
    return "(missing)";
  }
  if (value.length <= 8) {
    return "********";
  }
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
};

const printStep = (message) => {
  process.stdout.write(`\n==> ${message}\n`);
};

const buildAuth = (options) => {
  const apiToken = options["api-token"] ?? envValue("CF_API_TOKEN", "CLOUDFLARE_API_TOKEN");
  if (apiToken) {
    return {
      mode: "token",
      headers: {
        Authorization: `Bearer ${apiToken}`,
        "Content-Type": "application/json"
      },
      commandEnv: {
        CLOUDFLARE_API_TOKEN: apiToken
      }
    };
  }

  const apiKey =
    options["api-key"] ?? envValue("CF_API_KEY", "CLOUDFLARE_API_KEY", "CF_GLOBAL_API_KEY");
  const email = options.email ?? envValue("CF_EMAIL", "CLOUDFLARE_EMAIL");
  if (apiKey && !email) {
    throw new Error("Detected Global API Key but no Cloudflare login email. Provide --email or CLOUDFLARE_EMAIL.");
  }
  if (apiKey && email) {
    return {
      mode: "global-key",
      headers: {
        "X-Auth-Key": apiKey,
        "X-Auth-Email": email,
        "Content-Type": "application/json"
      },
      commandEnv: {
        CLOUDFLARE_API_KEY: apiKey,
        CLOUDFLARE_EMAIL: email
      }
    };
  }

  throw new Error("Missing Cloudflare credentials. Provide --api-token or --api-key plus --email.");
};

const buildCfUrl = (pathname, query = {}) => {
  const url = new URL(`https://api.cloudflare.com/client/v4${pathname}`);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && `${value}`.length > 0) {
      url.searchParams.set(key, `${value}`);
    }
  }
  return url;
};

const getErrorText = async (response) => {
  try {
    const data = await response.json();
    return JSON.stringify(data);
  } catch {
    return response.text();
  }
};

const cfRequest = async (auth, pathname, options = {}) => {
  const url = buildCfUrl(pathname, options.query);
  const response = await fetch(url, {
    method: options.method ?? "GET",
    headers: auth.headers,
    body: options.body ? JSON.stringify(options.body) : undefined
  });

  if (!response.ok) {
    throw new Error(`Cloudflare API ${response.status} for ${pathname}: ${await getErrorText(response)}`);
  }

  const payload = await response.json();
  if (!payload.success) {
    throw new Error(`Cloudflare API error for ${pathname}: ${JSON.stringify(payload.errors ?? payload)}`);
  }

  return payload.result;
};

const resolveZoneAndAccount = async (auth, options) => {
  const configuredDomain = options.domain ?? envValue("CF_DOMAIN", "CLOUDFLARE_DOMAIN");
  const configuredAccountId = options["account-id"] ?? envValue("CF_ACCOUNT_ID", "CLOUDFLARE_ACCOUNT_ID");
  const configuredZoneId = options["zone-id"] ?? envValue("CF_ZONE_ID", "CLOUDFLARE_ZONE_ID");

  if (configuredZoneId) {
    const zone = await cfRequest(auth, `/zones/${configuredZoneId}`);
    return {
      accountId: configuredAccountId ?? zone.account?.id,
      zoneId: zone.id,
      domain: configuredDomain ?? zone.name
    };
  }

  if (configuredDomain) {
    const zones = await cfRequest(auth, "/zones", {
      query: {
        name: configuredDomain,
        per_page: "50"
      }
    });

    const matches = zones.filter((item) => item.name === configuredDomain);
    if (matches.length === 1) {
      return {
        accountId: configuredAccountId ?? matches[0].account?.id,
        zoneId: matches[0].id,
        domain: matches[0].name
      };
    }

    if (matches.length > 1) {
      throw new Error(
        `Multiple zones matched ${configuredDomain}. Provide --zone-id. Matched zones: ${matches
          .map((item) => item.id)
          .join(", ")}`
      );
    }
  }

  const accounts = await cfRequest(auth, "/accounts", {
    query: {
      per_page: "50"
    }
  });

  if (accounts.length !== 1) {
    throw new Error(
      "Could not infer Cloudflare account automatically. Provide --domain or --account-id."
    );
  }

  const accountId = configuredAccountId ?? accounts[0].id;
  const zones = await cfRequest(auth, "/zones", {
    query: {
      per_page: "50",
      "account.id": accountId
    }
  });

  if (zones.length !== 1) {
    throw new Error("Could not infer zone automatically. Provide --domain or --zone-id.");
  }

  return {
    accountId,
    zoneId: zones[0].id,
    domain: zones[0].name
  };
};

const ensureKvNamespace = async (auth, accountId, title) => {
  const namespaces = await cfRequest(auth, `/accounts/${accountId}/storage/kv/namespaces`, {
    query: {
      page: "1",
      per_page: "100"
    }
  });

  const existing = namespaces.find((item) => item.title === title);
  if (existing) {
    return {
      id: existing.id,
      created: false
    };
  }

  const created = await cfRequest(auth, `/accounts/${accountId}/storage/kv/namespaces`, {
    method: "POST",
    body: {
      title
    }
  });

  return {
    id: created.id,
    created: true
  };
};

const quoteForCmd = (value) => {
  if (!/[\s"]/u.test(value)) {
    return value;
  }
  return `"${value.replace(/"/g, '\\"')}"`;
};

const runCommand = (command, args, options = {}) => {
  const baseOptions = {
    cwd: options.cwd ?? rootDir,
    env: {
      ...process.env,
      ...(options.env ?? {})
    },
    encoding: "utf8",
    stdio: options.capture ? "pipe" : "pipe",
    input: options.input
  };

  const result =
    process.platform === "win32"
      ? spawnSync(
          "cmd.exe",
          ["/d", "/s", "/c", `${quoteForCmd(command)} ${args.map((arg) => quoteForCmd(arg)).join(" ")}`],
          baseOptions
        )
      : spawnSync(command, args, baseOptions);

  if (result.stdout) {
    process.stdout.write(result.stdout);
  }
  if (result.stderr) {
    process.stderr.write(result.stderr);
  }

  if (result.status !== 0) {
    throw new Error(`Command failed: ${command} ${args.join(" ")}`);
  }

  return result.stdout?.trim() ?? "";
};

const runNodeScript = (scriptPath, args, options = {}) => {
  const result = spawnSync(process.execPath, [scriptPath, ...args], {
    cwd: options.cwd ?? rootDir,
    env: {
      ...process.env,
      ...(options.env ?? {})
    },
    encoding: "utf8",
    stdio: options.capture ? "pipe" : "pipe",
    input: options.input
  });

  if (result.stdout) {
    process.stdout.write(result.stdout);
  }
  if (result.stderr) {
    process.stderr.write(result.stderr);
  }

  if (result.status !== 0) {
    throw new Error(`Command failed: ${process.execPath} ${scriptPath} ${args.join(" ")}`);
  }

  return result.stdout?.trim() ?? "";
};

const runWrangler = (args, options = {}) =>
  runNodeScript(wranglerRunnerPath, args, options);

const ensureD1Database = async (commandEnv, name, location) => {
  const listOutput = runWrangler(["d1", "list", "--json"], {
    env: commandEnv,
    capture: true
  });

  const list = JSON.parse(listOutput || "[]");
  const existing = list.find((item) => item.name === name);
  if (existing) {
    return {
      id: existing.uuid,
      created: false
    };
  }

  runWrangler(["d1", "create", name, "--location", location], {
    env: commandEnv
  });

  const refreshedOutput = runWrangler(["d1", "list", "--json"], {
    env: commandEnv,
    capture: true
  });
  const refreshed = JSON.parse(refreshedOutput || "[]");
  const created = refreshed.find((item) => item.name === name);
  if (!created) {
    throw new Error(`D1 database ${name} was created but could not be found in list output.`);
  }

  return {
    id: created.uuid,
    created: true
  };
};

const renderWorkerConfig = ({
  adminUrl,
  appUrl,
  kvId,
  d1Id,
  appHost,
  approvalOwnerEmail,
  approvalSenderEmail,
  approvalSenderName,
  approvalCodeTtlMinutes,
  approvalResendCooldownSeconds
}) => `name = "smart-money-edge"
main = "src/index.ts"
compatibility_date = "2026-04-07"
routes = [{ pattern = "${appHost}", custom_domain = true }]

[vars]
ADMIN_BASE_URL = "${adminUrl}"
ADMIN_APPROVAL_OWNER_EMAIL = "${approvalOwnerEmail}"
ADMIN_APPROVAL_SENDER_EMAIL = "${approvalSenderEmail}"
ADMIN_APPROVAL_SENDER_NAME = "${approvalSenderName}"
ADMIN_APPROVAL_CODE_TTL_MINUTES = "${approvalCodeTtlMinutes}"
ADMIN_APPROVAL_RESEND_COOLDOWN_SECONDS = "${approvalResendCooldownSeconds}"
PUBLIC_EXTENSION_BASE_URL = "${appUrl}"
POLYMARKET_GAMMA_URL = "https://gamma-api.polymarket.com"
POLYMARKET_DATA_URL = "https://data-api.polymarket.com"

[[send_email]]
name = "ADMIN_APPROVAL_EMAIL"
destination_address = "${approvalOwnerEmail}"
allowed_sender_addresses = ["${approvalSenderEmail}"]

[[kv_namespaces]]
binding = "SMART_MONEY_CACHE"
id = "${kvId}"
preview_id = "${kvId}"

[[d1_databases]]
binding = "SMART_MONEY_DB"
database_name = "${DEFAULTS.d1Name}"
database_id = "${d1Id}"
`;

const renderWebConfig = ({
  adminUrl,
  appUrl,
  kvId,
  d1Id,
  adminHost,
  approvalOwnerEmail,
  approvalSenderEmail,
  approvalSenderName,
  approvalCodeTtlMinutes,
  approvalResendCooldownSeconds
}) =>
  `${JSON.stringify(
    {
      $schema: "../../node_modules/wrangler/config-schema.json",
      name: "smart-money-admin",
      main: ".open-next/worker.js",
      compatibility_date: "2026-04-07",
      compatibility_flags: ["nodejs_compat"],
      assets: {
        binding: "ASSETS",
        directory: ".open-next/assets"
      },
      vars: {
        ADMIN_BASE_URL: adminUrl,
        ADMIN_APPROVAL_OWNER_EMAIL: approvalOwnerEmail,
        ADMIN_APPROVAL_SENDER_EMAIL: approvalSenderEmail,
        ADMIN_APPROVAL_SENDER_NAME: approvalSenderName,
        ADMIN_APPROVAL_CODE_TTL_MINUTES: approvalCodeTtlMinutes,
        ADMIN_APPROVAL_RESEND_COOLDOWN_SECONDS: approvalResendCooldownSeconds,
        PUBLIC_EXTENSION_BASE_URL: appUrl,
        POLYMARKET_GAMMA_URL: "https://gamma-api.polymarket.com",
        POLYMARKET_DATA_URL: "https://data-api.polymarket.com"
      },
      kv_namespaces: [
        {
          binding: "SMART_MONEY_CACHE",
          id: kvId,
          preview_id: kvId
        }
      ],
      d1_databases: [
        {
          binding: "SMART_MONEY_DB",
          database_name: DEFAULTS.d1Name,
          database_id: d1Id
        }
      ],
      routes: [
        {
          pattern: adminHost,
          custom_domain: true
        }
      ]
    },
    null,
    2
  )}\n`;

const upsertInviteSql = (inviteCode) => `
INSERT OR REPLACE INTO extension_invites (
  code,
  member_label,
  status,
  expires_at,
  created_at,
  updated_at
) VALUES (
  '${inviteCode.replace(/'/g, "''")}',
  'Team Alpha',
  'active',
  NULL,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
);
`;

const normalizeSeedSql = (value) =>
  value
    .split(/\r?\n/u)
    .filter((line) => !/^\s*(BEGIN TRANSACTION;|COMMIT;)\s*$/u.test(line))
    .join("\n")
    .trim();

const parseD1Json = (value) => {
  const payload = JSON.parse(value || "[]");
  return Array.isArray(payload) ? payload : [];
};

const verifyD1Schema = (commandEnv) => {
  const tableOutput = runWrangler(
    [
      "d1",
      "execute",
      DEFAULTS.d1Name,
      "--remote",
      "--yes",
      "--json",
      "--command",
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;"
    ],
    {
      env: commandEnv,
      capture: true
    }
  );
  const walletColumnsOutput = runWrangler(
    [
      "d1",
      "execute",
      DEFAULTS.d1Name,
      "--remote",
      "--yes",
      "--json",
      "--command",
      "PRAGMA table_info(wallets);"
    ],
    {
      env: commandEnv,
      capture: true
    }
  );

  const tables = new Set(
    parseD1Json(tableOutput)
      .flatMap((entry) => entry.results ?? [])
      .map((row) => row.name)
      .filter(Boolean)
  );
  const walletColumns = new Set(
    parseD1Json(walletColumnsOutput)
      .flatMap((entry) => entry.results ?? [])
      .map((row) => row.name)
      .filter(Boolean)
  );

  const missingTables = REQUIRED_SCHEMA_TABLES.filter((table) => !tables.has(table));
  const missingWalletColumns = REQUIRED_WALLET_COLUMNS.filter((column) => !walletColumns.has(column));
  if (missingTables.length > 0 || missingWalletColumns.length > 0) {
    throw new Error(
      `Remote D1 schema verification failed. Missing tables: ${missingTables.join(", ") || "(none)"}; missing wallet columns: ${missingWalletColumns.join(", ") || "(none)"}`
    );
  }

  return {
    tables: Array.from(tables).sort(),
    walletColumns: Array.from(walletColumns).sort()
  };
};

const verifyHttp = async (url, options = {}) => {
  const response = await fetch(url, {
    method: options.method ?? "GET",
    headers: options.headers,
    redirect: "manual"
  });

  if ((options.acceptedStatuses ?? [200]).includes(response.status)) {
    return {
      status: response.status,
      protected: false
    };
  }

  if (options.allowProtected && [302, 401, 403].includes(response.status)) {
    return {
      status: response.status,
      protected: true
    };
  }

  const body = await response.text().catch(() => "");
  throw new Error(
    `HTTP verification failed for ${url}: ${response.status} ${body.slice(0, 240)}`
  );
};

const main = async () => {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(`${usage}\n`);
    return;
  }

  const auth = buildAuth(options);
  const zone = await resolveZoneAndAccount(auth, options);
  const appHost = (options["app-host"] ?? envValue("CF_APP_HOST", "CLOUDFLARE_APP_HOST") ?? `${DEFAULTS.appSubdomain}.${zone.domain}`).trim();
  const adminHost = (
    options["admin-host"] ??
    envValue("CF_ADMIN_HOST", "CLOUDFLARE_ADMIN_HOST") ??
    `${DEFAULTS.adminSubdomain}.${zone.domain}`
  ).trim();
  const appUrl = `https://${appHost}`;
  const adminUrl = `https://${adminHost}`;
  const approvalOwnerEmail =
    envValue("ADMIN_APPROVAL_OWNER_EMAIL") ?? "owner@example.com";
  const approvalSenderEmail =
    envValue("ADMIN_APPROVAL_SENDER_EMAIL") ?? `noreply@${zone.domain}`;
  const approvalSenderName =
    envValue("ADMIN_APPROVAL_SENDER_NAME") ?? "Smart Money Admin";
  const approvalCodeTtlMinutes =
    envValue("ADMIN_APPROVAL_CODE_TTL_MINUTES") ?? "10";
  const approvalResendCooldownSeconds =
    envValue("ADMIN_APPROVAL_RESEND_COOLDOWN_SECONDS") ?? "60";

  printStep("Cloudflare authentication");
  process.stdout.write(`Auth mode: ${auth.mode}\n`);
  process.stdout.write(`Account: ${zone.accountId}\n`);
  process.stdout.write(`Zone: ${zone.zoneId}\n`);
  process.stdout.write(`Domain: ${zone.domain}\n`);

  printStep("Ensuring remote resources");
  const kv = await ensureKvNamespace(auth, zone.accountId, DEFAULTS.kvName);
  const d1 = await ensureD1Database(
    {
      ...auth.commandEnv,
      CLOUDFLARE_ACCOUNT_ID: zone.accountId
    },
    DEFAULTS.d1Name,
    DEFAULTS.d1Location
  );
  process.stdout.write(`KV: ${kv.id} ${kv.created ? "(created)" : "(existing)"}\n`);
  process.stdout.write(`D1: ${d1.id} ${d1.created ? "(created)" : "(existing)"}\n`);

  printStep("Writing Wrangler configuration");
  await writeFile(
    workerConfigPath,
    renderWorkerConfig({
      adminUrl,
      appUrl,
      kvId: kv.id,
      d1Id: d1.id,
      appHost,
      approvalOwnerEmail,
      approvalSenderEmail,
      approvalSenderName,
      approvalCodeTtlMinutes,
      approvalResendCooldownSeconds
    }),
    "utf8"
  );
  await writeFile(
    webConfigPath,
    renderWebConfig({
      adminUrl,
      appUrl,
      kvId: kv.id,
      d1Id: d1.id,
      adminHost,
      approvalOwnerEmail,
      approvalSenderEmail,
      approvalSenderName,
      approvalCodeTtlMinutes,
      approvalResendCooldownSeconds
    }),
    "utf8"
  );

  if (options["dry-run"]) {
    printStep("Dry run complete");
    process.stdout.write(`Worker config: ${workerConfigPath}\n`);
    process.stdout.write(`Web config: ${webConfigPath}\n`);
    return;
  }

  const extensionSecret =
    options["extension-secret"] ??
    envValue("EXTENSION_TOKEN_SECRET", "CF_EXTENSION_SECRET") ??
    randomBytes(32).toString("hex");
  const inviteCode = options["invite-code"] ?? envValue("EXTENSION_INVITE_CODE") ?? DEFAULTS.inviteCode;
  const geminiApiKey = options["gemini-key"] ?? envValue("GEMINI_API_KEY");
  const groqApiKey = options["groq-key"] ?? envValue("GROQ_API_KEY");

  const commandEnv = {
    ...auth.commandEnv,
    CLOUDFLARE_ACCOUNT_ID: zone.accountId
  };

  printStep("Setting worker secret");
  process.stdout.write(`EXTENSION_TOKEN_SECRET: ${maskSecret(extensionSecret)}\n`);
  runWrangler(["secret", "put", "EXTENSION_TOKEN_SECRET", "--config", "apps/worker/wrangler.toml"], {
    env: commandEnv,
    input: `${extensionSecret}\n`
  });

  if (!options["skip-seed"]) {
    printStep("Running D1 migration");
    runWrangler(
      [
        "d1",
        "execute",
        DEFAULTS.d1Name,
        "--remote",
        "--yes",
        "--file",
        migrationArgPath,
        "--config",
        "apps/worker/wrangler.toml"
      ],
      {
        env: commandEnv
      }
    );

    printStep("Generating seed SQL");
    await mkdir(tempDir, { recursive: true });
    const seedSql = normalizeSeedSql(
      runCommand("npm", ["run", "seed", "-w", "packages/data"], {
        env: commandEnv,
        capture: true
      })
    );
    await writeFile(tempSeedPath, `${seedSql}\n${upsertInviteSql(inviteCode)}`, "utf8");

    printStep("Applying seed SQL");
    runWrangler(
      [
        "d1",
        "execute",
        DEFAULTS.d1Name,
        "--remote",
        "--yes",
        "--file",
        tempSeedArgPath,
        "--config",
        "apps/worker/wrangler.toml"
      ],
      {
        env: commandEnv
      }
    );
  }

  if (!options["skip-worker"]) {
    printStep("Deploying public extension worker");
    runWrangler(["deploy", "--config", "apps/worker/wrangler.toml"], {
      env: commandEnv
    });
  }

  if (!options["skip-web"]) {
    if (geminiApiKey) {
      printStep("Setting admin app Gemini secret");
      runWrangler(["secret", "put", "GEMINI_API_KEY", "--config", "apps/web/wrangler.jsonc"], {
        env: commandEnv,
        input: `${geminiApiKey}\n`
      });
    }

    if (groqApiKey) {
      printStep("Setting admin app Groq secret");
      runWrangler(["secret", "put", "GROQ_API_KEY", "--config", "apps/web/wrangler.jsonc"], {
        env: commandEnv,
        input: `${groqApiKey}\n`
      });
    }

    printStep("Deploying admin app");
    runCommand("npm", ["run", "build:cloudflare", "-w", "apps/web"], {
      env: commandEnv
    });
    runWrangler(["deploy", "-c", "apps/web/wrangler.jsonc"], {
      env: commandEnv
    });
  }

  if (!options["skip-extension"]) {
    printStep("Building extension release package");
    runCommand("npm", ["run", "build:release", "-w", "apps/extension"], {
      env: {
        ...commandEnv,
        EXTENSION_BACKEND_URL: appUrl,
        EXTENSION_ADMIN_BASE_URL: adminUrl
      }
    });
  }

  printStep("Verifying remote D1 schema");
  const schema = verifyD1Schema(commandEnv);
  process.stdout.write(`Tables: ${schema.tables.join(", ")}\n`);

  printStep("Verifying public API");
  const publicApiStatus = await verifyHttp(`${appUrl}/api/extension/search?q=deploy-smoke`, {
    acceptedStatuses: [401]
  });
  process.stdout.write(`Public API auth check: ${publicApiStatus.status}\n`);

  printStep("Verifying admin endpoints");
  const adminSchemaStatus = await verifyHttp(`${adminUrl}/api/admin/runtime/schema`, {
    acceptedStatuses: [200],
    allowProtected: true
  });
  process.stdout.write(
    `Admin schema endpoint: ${adminSchemaStatus.status}${adminSchemaStatus.protected ? " (protected by Access)" : ""}\n`
  );
  if (!adminSchemaStatus.protected) {
    const walletsApiStatus = await verifyHttp(`${adminUrl}/api/wallets`, {
      acceptedStatuses: [200],
      allowProtected: true
    });
    const walletsPageStatus = await verifyHttp(`${adminUrl}/wallets`, {
      acceptedStatuses: [200],
      allowProtected: true
    });
    process.stdout.write(`Admin wallets API: ${walletsApiStatus.status}\n`);
    process.stdout.write(`Admin wallets page: ${walletsPageStatus.status}\n`);
  }

  printStep("Completed");
  process.stdout.write(`Public API: ${appUrl}\n`);
  process.stdout.write(`Admin app: ${adminUrl}\n`);
  process.stdout.write(`Invite code: ${inviteCode}\n`);
  process.stdout.write(`Extension build: ${path.join(rootDir, "apps", "extension", "dist")}\n`);
};

main().catch((error) => {
  process.stderr.write(`\nDeployment failed: ${error.message}\n`);
  process.exitCode = 1;
});
