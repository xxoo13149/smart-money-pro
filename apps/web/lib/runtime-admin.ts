import {
  bootstrapSmartMoneyDb,
  getDatasetVersion,
  getSmartMoneySchemaStatus
} from "@weather-smart-money/data";

import { getSmartMoneyBindings, type SmartMoneyBindings } from "./cloudflare-env";

const ACCESS_HEADER_KEYS = [
  "cf-access-authenticated-user-email",
  "x-auth-request-email",
  "x-forwarded-email"
] as const;

const APP_VERSION = process.env.npm_package_version ?? "0.1.0";

type RuntimeMode = "cloudflare" | "demo";

interface RuntimeContext {
  mode: RuntimeMode;
  bindings: SmartMoneyBindings | null;
}

const countRows = async (bindings: SmartMoneyBindings, sql: string, values: unknown[] = []) => {
  if (!bindings.SMART_MONEY_DB) {
    return 0;
  }

  const row = await bindings.SMART_MONEY_DB.prepare(sql)
    .bind(...values)
    .first<{ count: number }>();

  return Number(row?.count ?? 0);
};

const selectFirstText = async (
  bindings: SmartMoneyBindings,
  sql: string,
  values: unknown[] = []
) => {
  if (!bindings.SMART_MONEY_DB) {
    return null;
  }

  const row = await bindings.SMART_MONEY_DB.prepare(sql)
    .bind(...values)
    .first<Record<string, unknown>>();
  if (!row) {
    return null;
  }

  const firstValue = Object.values(row)[0];
  return typeof firstValue === "string" && firstValue.trim() ? firstValue : null;
};

const getRuntimeContext = async (): Promise<RuntimeContext> => {
  const bindings = await getSmartMoneyBindings();
  if (!bindings?.SMART_MONEY_DB) {
    return {
      mode: "demo",
      bindings: bindings ?? null
    };
  }

  await bootstrapSmartMoneyDb(bindings.SMART_MONEY_DB);
  return {
    mode: "cloudflare",
    bindings
  };
};

const getAccessHeaderEmail = (request: Request) => {
  for (const key of ACCESS_HEADER_KEYS) {
    const value = request.headers.get(key)?.trim();
    if (value) {
      return value;
    }
  }

  return null;
};

export const getRuntimeHealthReport = async (request: Request) => {
  const { mode, bindings } = await getRuntimeContext();
  const accessEmail = getAccessHeaderEmail(request);
  const schema = bindings?.SMART_MONEY_DB
    ? await getSmartMoneySchemaStatus(bindings.SMART_MONEY_DB)
    : null;

  return {
    mode,
    capturedAt: new Date().toISOString(),
    appVersion: APP_VERSION,
    access: {
      protected: Boolean(accessEmail),
      actorEmail: accessEmail,
      checkedHeaders: [...ACCESS_HEADER_KEYS]
    },
    bindings: {
      smartMoneyDb: Boolean(bindings?.SMART_MONEY_DB),
      smartMoneyCache: Boolean(bindings?.SMART_MONEY_CACHE),
      adminBaseUrlConfigured: Boolean(bindings?.ADMIN_BASE_URL?.trim()),
      publicExtensionBaseUrlConfigured: Boolean(bindings?.PUBLIC_EXTENSION_BASE_URL?.trim()),
      geminiConfigured: Boolean(bindings?.GEMINI_API_KEY?.trim()),
      groqConfigured: Boolean(bindings?.GROQ_API_KEY?.trim()),
      walletAiProviderOrder:
        bindings?.WALLET_AI_PROVIDER_ORDER?.split(",").map((item) => item.trim()).filter(Boolean) ?? []
    },
    schema,
    selfChecks: [
      {
        id: "access-header",
        ok: Boolean(accessEmail),
        detail: accessEmail ? "Cloudflare Access header detected." : "No Access identity header on this request."
      },
      {
        id: "smart-money-db",
        ok: Boolean(bindings?.SMART_MONEY_DB),
        detail: bindings?.SMART_MONEY_DB ? "SMART_MONEY_DB binding is available." : "SMART_MONEY_DB binding is missing."
      },
      {
        id: "smart-money-cache",
        ok: Boolean(bindings?.SMART_MONEY_CACHE),
        detail: bindings?.SMART_MONEY_CACHE ? "SMART_MONEY_CACHE binding is available." : "SMART_MONEY_CACHE binding is missing."
      },
      {
        id: "schema-ready",
        ok: Boolean(schema?.isReady),
        detail: schema?.isReady ? "D1 schema is ready." : "D1 schema still has missing tables or columns."
      }
    ]
  };
};

export const getRuntimeBudgetReport = async () => {
  const { mode, bindings } = await getRuntimeContext();
  const datasetVersion = bindings?.SMART_MONEY_DB
    ? await getDatasetVersion(bindings.SMART_MONEY_DB, "address_labels")
    : 0;

  const [
    totalWallets,
    activeWallets,
    deletedWallets,
    reviewWallets,
    watchlistedWallets,
    totalInvites,
    totalSessions
  ] = bindings?.SMART_MONEY_DB
    ? await Promise.all([
        countRows(bindings, "SELECT COUNT(*) as count FROM wallets"),
        countRows(bindings, "SELECT COUNT(*) as count FROM wallets WHERE deleted_at IS NULL"),
        countRows(bindings, "SELECT COUNT(*) as count FROM wallets WHERE deleted_at IS NOT NULL"),
        countRows(
          bindings,
          "SELECT COUNT(*) as count FROM wallets WHERE deleted_at IS NULL AND coalesce(curation_status, 'active') = 'review_needed'"
        ),
        countRows(bindings, "SELECT COUNT(*) as count FROM wallets WHERE deleted_at IS NULL AND watchlisted = 1"),
        countRows(bindings, "SELECT COUNT(*) as count FROM extension_invites"),
        countRows(bindings, "SELECT COUNT(*) as count FROM extension_sessions")
      ])
    : [0, 0, 0, 0, 0, 0, 0];

  return {
    mode,
    capturedAt: new Date().toISOString(),
    labelsVersion: datasetVersion,
    cachePolicy: {
      marketAnnotations: {
        edgeTtlSeconds: 60,
        kvTtlSeconds: 60,
        staleTtlSeconds: 300,
        requestCoalescing: true
      },
      labelsLookup: {
        kvTtlSeconds: 900,
        visibleRowsOnly: true
      },
      extensionRefresh: {
        minIntervalMs: 180_000,
        activeTabOnly: true
      }
    },
    approximateDataset: {
      wallets: {
        total: totalWallets,
        active: activeWallets,
        deleted: deletedWallets,
        reviewNeeded: reviewWallets,
        watchlisted: watchlistedWallets
      },
      extension: {
        invites: totalInvites,
        sessions: totalSessions
      }
    },
    budgetNotes: [
      "Workers isolate memory target: 128 MB.",
      "Admin reads use D1 directly; KV and Cache API stay non-authoritative.",
      "D1 list browsing should stay on keyset cursor semantics to avoid OFFSET row-read growth.",
      "Health events are intended to be sampled and state-change driven, not high-frequency telemetry."
    ]
  };
};

export const getRuntimeRecoveryReport = async () => {
  const { mode, bindings } = await getRuntimeContext();
  const datasetVersion = bindings?.SMART_MONEY_DB
    ? await getDatasetVersion(bindings.SMART_MONEY_DB, "address_labels")
    : 0;
  const [latestAuditAt, latestImportAt] = bindings?.SMART_MONEY_DB
    ? await Promise.all([
        selectFirstText(
          bindings,
          "SELECT created_at FROM wallet_audit_logs ORDER BY created_at DESC LIMIT 1"
        ),
        selectFirstText(
          bindings,
          "SELECT created_at FROM wallet_import_batches ORDER BY created_at DESC LIMIT 1"
        )
      ])
    : [null, null];

  return {
    mode,
    capturedAt: new Date().toISOString(),
    datasetVersion,
    timeTravel: {
      available: Boolean(bindings?.SMART_MONEY_DB),
      provider: "Cloudflare D1 Time Travel",
      note: "Use D1 Time Travel for recent recovery windows before falling back to logical export/import."
    },
    logicalExport: {
      configured: false,
      lastSuccessfulAt: null,
      note: "R2 logical snapshot automation is not wired in yet; use manual export runbook for now."
    },
    recentActivity: {
      latestAuditAt,
      latestImportAt
    },
    recoverySop: [
      "Confirm the affected dataset version and latest audit log timestamp.",
      "Use D1 Time Travel first for recent recovery scenarios.",
      "If Time Travel is insufficient, run the logical export/import recovery workflow and re-verify dataset_versions.address_labels.",
      "After restore, invalidate extension-facing caches by bumping dataset_versions.address_labels."
    ]
  };
};
