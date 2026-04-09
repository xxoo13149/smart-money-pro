import type { D1Database } from "@cloudflare/workers-types";
import {
  bootstrapSmartMoneyDb,
  getSmartMoneySchemaStatus,
  type SmartMoneySchemaStatus
} from "@weather-smart-money/data";

import { getSmartMoneyBindings, type SmartMoneyBindings } from "./cloudflare-env";
import { getRequestActor } from "./request-actor";

const ACCESS_HEADER_KEYS = [
  "cf-access-authenticated-user-email",
  "x-auth-request-email",
  "x-forwarded-email"
] as const;

const SCHEMA_READY = new Map<string, Promise<void>>();
const SEARCH_REVIEW_THRESHOLD = 1_000;
const SEARCH_DEGRADED_THRESHOLD = 10_000;
const SESSION_WRITE_REVIEW_THRESHOLD = 100;
const SESSION_WRITE_DEGRADED_THRESHOLD = 500;

type AdminRuntimeMode = "cloudflare" | "demo";
type AdminRuntimeStatus = "ok" | "degraded" | "error";
type AdminRuntimeActorSource = "access" | "fallback";
type AdminRuntimeHotspotLevel = "low" | "medium" | "high";

interface AdminRuntimeActorMeta {
  value: string;
  source: AdminRuntimeActorSource;
}

interface AdminRuntimeAuthorityMeta {
  readSource: "d1";
  kvAuthorityRead: false;
  databaseBindingPresent: boolean;
  cacheBindingPresent: boolean;
  databaseReachable: boolean;
}

interface AdminRuntimeEnvelope {
  endpoint: "admin.runtime.health" | "admin.runtime.budget" | "admin.runtime.recovery";
  version: 1;
  checkedAt: string;
  mode: AdminRuntimeMode;
  ok: boolean;
  status: AdminRuntimeStatus;
  actor: AdminRuntimeActorMeta;
  authority: AdminRuntimeAuthorityMeta;
  warnings: string[];
}

interface AdminRuntimeContext {
  checkedAt: string;
  actor: AdminRuntimeActorMeta;
  bindings: SmartMoneyBindings | null;
  db: D1Database | null;
  mode: AdminRuntimeMode;
  requestHost: string | null;
}

export interface AdminRuntimeHealthReport extends AdminRuntimeEnvelope {
  endpoint: "admin.runtime.health";
  runtime: {
    requestHost: string | null;
    adminBaseUrl: string | null;
    publicExtensionBaseUrl: string | null;
    bindings: {
      smartMoneyDb: boolean;
      smartMoneyCache: boolean;
    };
  };
  database: {
    reachable: boolean;
    schemaReady: boolean;
    labelsVersion: number | null;
    schema: null | {
      tableCount: number;
      missingTables: string[];
      missingWalletColumns: string[];
    };
    lastError: string | null;
  };
}

interface BudgetHotspot {
  key: "address_search_scan" | "session_touch_write" | "labels_version_invalidation";
  level: AdminRuntimeHotspotLevel;
  summary: string;
  reason: string;
  liveSignal: Record<string, number>;
}

export interface AdminRuntimeBudgetReport extends AdminRuntimeEnvelope {
  endpoint: "admin.runtime.budget";
  budget: {
    basis: "d1-lightweight-live-read";
    billingMetricsIncluded: false;
    footprint: {
      wallets: {
        total: number;
        active: number;
        deleted: number;
        latestUpdatedAt: string | null;
      };
      extensionInvites: {
        total: number;
        active: number;
        disabled: number;
      };
      extensionSessions: {
        total: number;
        live: number;
        revoked: number;
        latestUpdatedAt: string | null;
      };
      labelsVersion: number | null;
    };
    thresholds: {
      searchReviewWalletCount: number;
      searchDegradedWalletCount: number;
      sessionWriteReviewCount: number;
      sessionWriteDegradedCount: number;
    };
    hotspots: BudgetHotspot[];
  };
}

export interface AdminRuntimeRecoveryReport extends AdminRuntimeEnvelope {
  endpoint: "admin.runtime.recovery";
  recovery: {
    platform: {
      provider: "cloudflare-d1";
      runtimeBackupVisibility: "none";
      manualVerificationRequired: true;
    };
    readiness: {
      schemaReady: boolean;
      accessHeadersPresent: boolean;
      runtimeOnlyAssessment: true;
      endpoints: Array<"health" | "budget" | "recovery" | "schema">;
    };
    markers: {
      labelsVersion: number | null;
      labelsVersionUpdatedAt: string | null;
      walletsUpdatedAt: string | null;
      lastImportBatchCreatedAt: string | null;
      invitesUpdatedAt: string | null;
      sessionsUpdatedAt: string | null;
    };
    actions: string[];
    limitations: string[];
  };
}

interface RuntimeCountRow {
  wallets_total?: number | string | null;
  wallets_active?: number | string | null;
  wallets_deleted?: number | string | null;
  wallets_updated_at?: string | null;
  invites_total?: number | string | null;
  invites_active?: number | string | null;
  invites_disabled?: number | string | null;
  sessions_total?: number | string | null;
  sessions_live?: number | string | null;
  sessions_revoked?: number | string | null;
  sessions_updated_at?: string | null;
  labels_version?: number | string | null;
}

interface RuntimeRecoveryRow {
  labels_version?: number | string | null;
  labels_version_updated_at?: string | null;
  wallets_updated_at?: string | null;
  last_import_batch_at?: string | null;
  invites_updated_at?: string | null;
  sessions_updated_at?: string | null;
}

const isoNow = () => new Date().toISOString();

const buildScopeKey = (bindings: SmartMoneyBindings) =>
  [bindings.ADMIN_BASE_URL ?? "admin", bindings.PUBLIC_EXTENSION_BASE_URL ?? "app"].join("|");

const hasAccessHeaders = (request: Request) =>
  ACCESS_HEADER_KEYS.some((key) => Boolean(request.headers.get(key)?.trim()));

const getActorMeta = (request: Request): AdminRuntimeActorMeta => ({
  value: getRequestActor(request),
  source: hasAccessHeaders(request) ? "access" : "fallback"
});

const getRequestHost = (request: Request) => {
  try {
    return new URL(request.url).host || null;
  } catch {
    return null;
  }
};

const buildWarnings = (context: AdminRuntimeContext) => {
  const warnings: string[] = [];

  if (context.actor.source === "fallback") {
    warnings.push("Cloudflare Access headers are missing; request actor fell back to Team Alpha.");
  }

  if (!context.bindings?.ADMIN_BASE_URL) {
    warnings.push("ADMIN_BASE_URL is missing.");
  }

  if (!context.bindings?.PUBLIC_EXTENSION_BASE_URL) {
    warnings.push("PUBLIC_EXTENSION_BASE_URL is missing.");
  }

  if (!context.db) {
    warnings.push("SMART_MONEY_DB binding is unavailable; admin runtime is not attached to D1.");
  }

  return warnings;
};

const buildAuthority = (
  bindings: SmartMoneyBindings | null,
  db: D1Database | null
): AdminRuntimeAuthorityMeta => ({
  readSource: "d1",
  kvAuthorityRead: false,
  databaseBindingPresent: Boolean(bindings?.SMART_MONEY_DB),
  cacheBindingPresent: Boolean(bindings?.SMART_MONEY_CACHE),
  databaseReachable: Boolean(db)
});

const createEnvelope = <T extends AdminRuntimeEnvelope["endpoint"]>(
  endpoint: T,
  context: AdminRuntimeContext,
  status: AdminRuntimeStatus,
  warnings: string[]
) => ({
  endpoint,
  version: 1 as const,
  checkedAt: context.checkedAt,
  mode: context.mode,
  ok: status === "ok",
  status,
  actor: context.actor,
  authority: buildAuthority(context.bindings, context.db),
  warnings
});

const ensureRuntimeBindings = async () => {
  const bindings = await getSmartMoneyBindings();
  if (!bindings?.SMART_MONEY_DB) {
    return {
      bindings,
      db: null,
      mode: "demo" as const
    };
  }

  const db = bindings.SMART_MONEY_DB;
  const scopeKey = buildScopeKey(bindings);
  if (!SCHEMA_READY.has(scopeKey)) {
    const ready = (async () => {
      await bootstrapSmartMoneyDb(db);
    })();
    SCHEMA_READY.set(scopeKey, ready);
    ready.catch(() => {
      if (SCHEMA_READY.get(scopeKey) === ready) {
        SCHEMA_READY.delete(scopeKey);
      }
    });
  }

  const ready = SCHEMA_READY.get(scopeKey);
  if (ready) {
    await ready;
  }

  return {
    bindings,
    db,
    mode: "cloudflare" as const
  };
};

const getRuntimeContext = async (request: Request): Promise<AdminRuntimeContext> => {
  const runtime = await ensureRuntimeBindings();

  return {
    checkedAt: isoNow(),
    actor: getActorMeta(request),
    bindings: runtime.bindings,
    db: runtime.db,
    mode: runtime.mode,
    requestHost: getRequestHost(request)
  };
};

const toNumber = (value: unknown) => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
};

const toNullableNumber = (value: unknown) => {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  return toNumber(value);
};

const toNullableString = (value: unknown) =>
  typeof value === "string" && value.trim().length > 0 ? value : null;

const readBudgetSnapshot = async (db: D1Database) =>
  db
    .prepare(
      `SELECT
         (SELECT COUNT(*) FROM wallets) AS wallets_total,
         (SELECT COUNT(*) FROM wallets WHERE deleted_at IS NULL) AS wallets_active,
         (SELECT COUNT(*) FROM wallets WHERE deleted_at IS NOT NULL) AS wallets_deleted,
         (SELECT MAX(updated_at) FROM wallets) AS wallets_updated_at,
         (SELECT COUNT(*) FROM extension_invites) AS invites_total,
         (SELECT COUNT(*) FROM extension_invites WHERE status = 'active') AS invites_active,
         (SELECT COUNT(*) FROM extension_invites WHERE status = 'disabled') AS invites_disabled,
         (SELECT COUNT(*) FROM extension_sessions) AS sessions_total,
         (SELECT COUNT(*) FROM extension_sessions WHERE revoked_at IS NULL) AS sessions_live,
         (SELECT COUNT(*) FROM extension_sessions WHERE revoked_at IS NOT NULL) AS sessions_revoked,
         (SELECT MAX(updated_at) FROM extension_sessions) AS sessions_updated_at,
         (SELECT version FROM dataset_versions WHERE dataset = 'address_labels') AS labels_version`
    )
    .first<RuntimeCountRow>();

const readRecoveryMarkers = async (db: D1Database) =>
  db
    .prepare(
      `SELECT
         (SELECT version FROM dataset_versions WHERE dataset = 'address_labels') AS labels_version,
         (SELECT updated_at FROM dataset_versions WHERE dataset = 'address_labels') AS labels_version_updated_at,
         (SELECT MAX(updated_at) FROM wallets) AS wallets_updated_at,
         (SELECT MAX(created_at) FROM wallet_import_batches) AS last_import_batch_at,
         (SELECT MAX(updated_at) FROM extension_invites) AS invites_updated_at,
         (SELECT MAX(updated_at) FROM extension_sessions) AS sessions_updated_at`
    )
    .first<RuntimeRecoveryRow>();

const getSearchHotspotLevel = (activeWallets: number): AdminRuntimeHotspotLevel => {
  if (activeWallets >= SEARCH_DEGRADED_THRESHOLD) {
    return "high";
  }

  if (activeWallets >= SEARCH_REVIEW_THRESHOLD) {
    return "medium";
  }

  return "low";
};

const getSessionWriteHotspotLevel = (liveSessions: number): AdminRuntimeHotspotLevel => {
  if (liveSessions >= SESSION_WRITE_DEGRADED_THRESHOLD) {
    return "high";
  }

  if (liveSessions >= SESSION_WRITE_REVIEW_THRESHOLD) {
    return "medium";
  }

  return "low";
};

const getInvalidationHotspotLevel = (activeWallets: number): AdminRuntimeHotspotLevel => {
  if (activeWallets >= SEARCH_DEGRADED_THRESHOLD) {
    return "high";
  }

  if (activeWallets >= SEARCH_REVIEW_THRESHOLD) {
    return "medium";
  }

  return "low";
};

const getSchemaSummary = (schema: SmartMoneySchemaStatus) => ({
  tableCount: schema.tables.length,
  missingTables: schema.missingTables,
  missingWalletColumns: schema.missingWalletColumns
});

export const getAdminRuntimeHealthReport = async (
  request: Request
): Promise<AdminRuntimeHealthReport> => {
  const context = await getRuntimeContext(request);
  const warnings = buildWarnings(context);

  if (!context.db) {
    return {
      ...createEnvelope("admin.runtime.health", context, "degraded", warnings),
      runtime: {
        requestHost: context.requestHost,
        adminBaseUrl: context.bindings?.ADMIN_BASE_URL ?? null,
        publicExtensionBaseUrl: context.bindings?.PUBLIC_EXTENSION_BASE_URL ?? null,
        bindings: {
          smartMoneyDb: false,
          smartMoneyCache: Boolean(context.bindings?.SMART_MONEY_CACHE)
        }
      },
      database: {
        reachable: false,
        schemaReady: false,
        labelsVersion: null,
        schema: null,
        lastError: "smart money database bindings are unavailable"
      }
    };
  }

  try {
    const schema = await getSmartMoneySchemaStatus(context.db);
    if (!schema.isReady) {
      warnings.push("Smart money schema is not ready.");
    }

    const status = warnings.length > 0 || !schema.isReady ? "degraded" : "ok";
    return {
      ...createEnvelope("admin.runtime.health", context, status, warnings),
      runtime: {
        requestHost: context.requestHost,
        adminBaseUrl: context.bindings?.ADMIN_BASE_URL ?? null,
        publicExtensionBaseUrl: context.bindings?.PUBLIC_EXTENSION_BASE_URL ?? null,
        bindings: {
          smartMoneyDb: true,
          smartMoneyCache: Boolean(context.bindings?.SMART_MONEY_CACHE)
        }
      },
      database: {
        reachable: true,
        schemaReady: schema.isReady,
        labelsVersion: schema.datasetVersion,
        schema: getSchemaSummary(schema),
        lastError: null
      }
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "runtime health check failed";
    warnings.push(`D1 check failed: ${message}`);

    return {
      ...createEnvelope("admin.runtime.health", context, "error", warnings),
      runtime: {
        requestHost: context.requestHost,
        adminBaseUrl: context.bindings?.ADMIN_BASE_URL ?? null,
        publicExtensionBaseUrl: context.bindings?.PUBLIC_EXTENSION_BASE_URL ?? null,
        bindings: {
          smartMoneyDb: true,
          smartMoneyCache: Boolean(context.bindings?.SMART_MONEY_CACHE)
        }
      },
      database: {
        reachable: false,
        schemaReady: false,
        labelsVersion: null,
        schema: null,
        lastError: message
      }
    };
  }
};

export const getAdminRuntimeBudgetReport = async (
  request: Request
): Promise<AdminRuntimeBudgetReport> => {
  const context = await getRuntimeContext(request);
  const warnings = buildWarnings(context);

  if (!context.db) {
    return {
      ...createEnvelope("admin.runtime.budget", context, "degraded", warnings),
      budget: {
        basis: "d1-lightweight-live-read",
        billingMetricsIncluded: false,
        footprint: {
          wallets: {
            total: 0,
            active: 0,
            deleted: 0,
            latestUpdatedAt: null
          },
          extensionInvites: {
            total: 0,
            active: 0,
            disabled: 0
          },
          extensionSessions: {
            total: 0,
            live: 0,
            revoked: 0,
            latestUpdatedAt: null
          },
          labelsVersion: null
        },
        thresholds: {
          searchReviewWalletCount: SEARCH_REVIEW_THRESHOLD,
          searchDegradedWalletCount: SEARCH_DEGRADED_THRESHOLD,
          sessionWriteReviewCount: SESSION_WRITE_REVIEW_THRESHOLD,
          sessionWriteDegradedCount: SESSION_WRITE_DEGRADED_THRESHOLD
        },
        hotspots: []
      }
    };
  }

  try {
    const snapshot = await readBudgetSnapshot(context.db);
    const activeWallets = toNumber(snapshot?.wallets_active);
    const liveSessions = toNumber(snapshot?.sessions_live);

    const hotspots: BudgetHotspot[] = [
      {
        key: "address_search_scan",
        level: getSearchHotspotLevel(activeWallets),
        summary: "Extension search load still scales with D1 LIKE and EXISTS scanning.",
        reason: "The public worker search path reads wallets and labels directly from D1 on cache misses.",
        liveSignal: {
          activeWallets
        }
      },
      {
        key: "session_touch_write",
        level: getSessionWriteHotspotLevel(liveSessions),
        summary: "Authenticated extension traffic still writes back to extension_sessions.",
        reason: "The public worker updates last_seen_at in D1 for each authenticated request.",
        liveSignal: {
          liveSessions
        }
      },
      {
        key: "labels_version_invalidation",
        level: getInvalidationHotspotLevel(activeWallets),
        summary: "A single labels version still invalidates broad cached extension reads.",
        reason: "address_labels remains the shared version bus for lookup, search and market annotation cache keys.",
        liveSignal: {
          activeWallets,
          labelsVersion: toNumber(snapshot?.labels_version)
        }
      }
    ];

    if (activeWallets >= SEARCH_REVIEW_THRESHOLD) {
      warnings.push("Active wallets have crossed the search review threshold.");
    }

    if (liveSessions >= SESSION_WRITE_REVIEW_THRESHOLD) {
      warnings.push("Live extension sessions have crossed the session write review threshold.");
    }

    const status =
      activeWallets >= SEARCH_DEGRADED_THRESHOLD || liveSessions >= SESSION_WRITE_DEGRADED_THRESHOLD
        ? "degraded"
        : warnings.length > 0
          ? "degraded"
          : "ok";

    return {
      ...createEnvelope("admin.runtime.budget", context, status, warnings),
      budget: {
        basis: "d1-lightweight-live-read",
        billingMetricsIncluded: false,
        footprint: {
          wallets: {
            total: toNumber(snapshot?.wallets_total),
            active: activeWallets,
            deleted: toNumber(snapshot?.wallets_deleted),
            latestUpdatedAt: toNullableString(snapshot?.wallets_updated_at)
          },
          extensionInvites: {
            total: toNumber(snapshot?.invites_total),
            active: toNumber(snapshot?.invites_active),
            disabled: toNumber(snapshot?.invites_disabled)
          },
          extensionSessions: {
            total: toNumber(snapshot?.sessions_total),
            live: liveSessions,
            revoked: toNumber(snapshot?.sessions_revoked),
            latestUpdatedAt: toNullableString(snapshot?.sessions_updated_at)
          },
          labelsVersion: toNullableNumber(snapshot?.labels_version)
        },
        thresholds: {
          searchReviewWalletCount: SEARCH_REVIEW_THRESHOLD,
          searchDegradedWalletCount: SEARCH_DEGRADED_THRESHOLD,
          sessionWriteReviewCount: SESSION_WRITE_REVIEW_THRESHOLD,
          sessionWriteDegradedCount: SESSION_WRITE_DEGRADED_THRESHOLD
        },
        hotspots
      }
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "runtime budget check failed";
    warnings.push(`D1 budget snapshot failed: ${message}`);

    return {
      ...createEnvelope("admin.runtime.budget", context, "error", warnings),
      budget: {
        basis: "d1-lightweight-live-read",
        billingMetricsIncluded: false,
        footprint: {
          wallets: {
            total: 0,
            active: 0,
            deleted: 0,
            latestUpdatedAt: null
          },
          extensionInvites: {
            total: 0,
            active: 0,
            disabled: 0
          },
          extensionSessions: {
            total: 0,
            live: 0,
            revoked: 0,
            latestUpdatedAt: null
          },
          labelsVersion: null
        },
        thresholds: {
          searchReviewWalletCount: SEARCH_REVIEW_THRESHOLD,
          searchDegradedWalletCount: SEARCH_DEGRADED_THRESHOLD,
          sessionWriteReviewCount: SESSION_WRITE_REVIEW_THRESHOLD,
          sessionWriteDegradedCount: SESSION_WRITE_DEGRADED_THRESHOLD
        },
        hotspots: []
      }
    };
  }
};

export const getAdminRuntimeRecoveryReport = async (
  request: Request
): Promise<AdminRuntimeRecoveryReport> => {
  const context = await getRuntimeContext(request);
  const warnings = buildWarnings(context);

  if (!context.db) {
    return {
      ...createEnvelope("admin.runtime.recovery", context, "degraded", warnings),
      recovery: {
        platform: {
          provider: "cloudflare-d1",
          runtimeBackupVisibility: "none",
          manualVerificationRequired: true
        },
        readiness: {
          schemaReady: false,
          accessHeadersPresent: context.actor.source === "access",
          runtimeOnlyAssessment: true,
          endpoints: ["health", "budget", "recovery", "schema"]
        },
        markers: {
          labelsVersion: null,
          labelsVersionUpdatedAt: null,
          walletsUpdatedAt: null,
          lastImportBatchCreatedAt: null,
          invitesUpdatedAt: null,
          sessionsUpdatedAt: null
        },
        actions: [
          "Attach the admin runtime to SMART_MONEY_DB before treating this environment as recoverable.",
          "Verify D1 Time Travel or export coverage outside the admin runtime.",
          "Keep admin host protection behind Cloudflare Access."
        ],
        limitations: [
          "This endpoint does not enumerate Cloudflare backups or exports.",
          "Recovery posture is inferred from runtime bindings and lightweight D1 reads only."
        ]
      }
    };
  }

  try {
    const [schema, markers] = await Promise.all([
      getSmartMoneySchemaStatus(context.db),
      readRecoveryMarkers(context.db)
    ]);

    if (!schema.isReady) {
      warnings.push("Smart money schema is not ready for recovery workflows.");
    }

    if (context.actor.source !== "access") {
      warnings.push("Recovery checks are running without Cloudflare Access identity headers.");
    }

    const status = warnings.length > 0 || !schema.isReady ? "degraded" : "ok";

    return {
      ...createEnvelope("admin.runtime.recovery", context, status, warnings),
      recovery: {
        platform: {
          provider: "cloudflare-d1",
          runtimeBackupVisibility: "none",
          manualVerificationRequired: true
        },
        readiness: {
          schemaReady: schema.isReady,
          accessHeadersPresent: context.actor.source === "access",
          runtimeOnlyAssessment: true,
          endpoints: ["health", "budget", "recovery", "schema"]
        },
        markers: {
          labelsVersion: toNullableNumber(markers?.labels_version),
          labelsVersionUpdatedAt: toNullableString(markers?.labels_version_updated_at),
          walletsUpdatedAt: toNullableString(markers?.wallets_updated_at),
          lastImportBatchCreatedAt: toNullableString(markers?.last_import_batch_at),
          invitesUpdatedAt: toNullableString(markers?.invites_updated_at),
          sessionsUpdatedAt: toNullableString(markers?.sessions_updated_at)
        },
        actions: [
          "Verify D1 Time Travel or export coverage from Cloudflare before any restore drill.",
          "Use /api/admin/runtime/schema and /api/admin/runtime/health after restore to confirm schema readiness.",
          "Re-run admin access verification after recovery so request actor no longer falls back."
        ],
        limitations: [
          "This endpoint cannot inspect Cloudflare backup inventory from inside the admin runtime.",
          "Recovery posture does not include KV because admin authority reads remain D1-only."
        ]
      }
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "runtime recovery check failed";
    warnings.push(`Recovery readiness check failed: ${message}`);

    return {
      ...createEnvelope("admin.runtime.recovery", context, "error", warnings),
      recovery: {
        platform: {
          provider: "cloudflare-d1",
          runtimeBackupVisibility: "none",
          manualVerificationRequired: true
        },
        readiness: {
          schemaReady: false,
          accessHeadersPresent: context.actor.source === "access",
          runtimeOnlyAssessment: true,
          endpoints: ["health", "budget", "recovery", "schema"]
        },
        markers: {
          labelsVersion: null,
          labelsVersionUpdatedAt: null,
          walletsUpdatedAt: null,
          lastImportBatchCreatedAt: null,
          invitesUpdatedAt: null,
          sessionsUpdatedAt: null
        },
        actions: [
          "Repair D1 reachability before running any recovery drill.",
          "Validate Cloudflare backup coverage outside the admin runtime.",
          "Confirm admin host Access protection before using recovery actions."
        ],
        limitations: [
          "This endpoint cannot inspect Cloudflare backup inventory from inside the admin runtime.",
          "Recovery posture is unavailable while D1 reads are failing."
        ]
      }
    };
  }
};
