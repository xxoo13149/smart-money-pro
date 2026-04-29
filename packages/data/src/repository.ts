import type { D1Database } from "@cloudflare/workers-types";
import {
  getLabelKindPriority,
  getWalletLabelDisplayKey,
  isPrimarySignalLabelKind,
  sortAddressBadges,
  dedupeAddressBadges,
  type AdminExtensionInviteEffectiveStatus,
  type AdminExtensionInviteItem,
  type AdminExtensionOverview,
  type AdminExtensionSessionItem,
  type AdminExtensionSessionStatus,
  normalizeAddress,
  type AddressHoverCard,
  type AddressLabelBadge,
  type AddressSearchResult,
  type AddressSummary,
  type ChainId,
  type NoteAuditLog,
  type Wallet,
  type WalletCurationStatus,
  type WalletFacetCount,
  type WalletFacetSummary,
  type WalletImportBatch,
  type WalletLabel,
  type WalletLabelKind,
  type WalletListResponse,
  type WalletListSort,
  type WalletSavedView,
  type WalletSourceType,
  type WalletStatusBadge,
  type WatchlistEntry
} from "@weather-smart-money/core";

import { extensionSchemaStatements } from "./schema.js";
import type {
  DatasetKey,
  ExtensionInviteRecord,
  ExtensionUserRecord,
  ExtensionSessionRecord,
  WalletDeleteInput,
  WalletImportBatchRecord,
  WalletInput,
  WalletListFilters,
  WalletLabelInput,
  WalletLabelPatchInput,
  WalletPageInput,
  WalletSavedViewRecord,
  WalletUpdate
} from "./types.js";

const DEFAULT_ACTOR = "Team Alpha";
const DEFAULT_CHAIN: ChainId = "polygon";
const ACTIVE_SESSION_WINDOW_MS = 15 * 60 * 1_000;
const MAX_SQL_IN_ITEMS = 80;
const DEFAULT_PAGE_LIMIT = 100;
const MAX_PAGE_LIMIT = 200;
const REQUIRED_SCHEMA_TABLES = [
  "wallets",
  "wallet_notes",
  "wallet_user_labels",
  "wallet_watchlist",
  "wallet_audit_logs",
  "wallet_saved_views",
  "wallet_import_batches",
  "extension_invites",
  "extension_users",
  "extension_sessions",
  "admin_users",
  "admin_sessions",
  "admin_registration_approvals",
  "dataset_versions"
] as const;
const REQUIRED_WALLET_COLUMNS = [
  "id",
  "chain",
  "address",
  "normalized_address",
  "display_name",
  "alias",
  "bio",
  "strategy_focus",
  "team_note",
  "first_seen_at",
  "created_at",
  "updated_at",
  "watchlisted",
  "deleted_at",
  "deleted_by",
  "delete_reason",
  "source_type",
  "curation_status",
  "last_imported_at",
  "import_batch_id"
] as const;

const nowIso = () => new Date().toISOString();
const toTimestamp = (value?: string | null) => (value ? new Date(value).getTime() : 0);

const countHanCharacters = (value: string) =>
  (value.match(/[\u3400-\u9fff]/gu) ?? []).length;

const countSuspiciousLatin1Characters = (value: string) =>
  (value.match(/[\u00C0-\u00FF]/gu) ?? []).length;

const repairPossiblyMojibake = (value: string) => {
  if (!value || countSuspiciousLatin1Characters(value) < 2) {
    return value;
  }

  try {
    const bytes = Uint8Array.from(Array.from(value), (char) => char.charCodeAt(0) & 0xff);
    const repaired = new TextDecoder("utf-8", { fatal: false }).decode(bytes).trim();
    if (!repaired || repaired.includes("\uFFFD")) {
      return value;
    }

    const repairedHan = countHanCharacters(repaired);
    const originalHan = countHanCharacters(value);
    return repairedHan > originalHan ? repaired : value;
  } catch {
    return value;
  }
};

const mapWalletRow = (row: Record<string, unknown>): Wallet => ({
  id: String(row.id),
  chain: String(row.chain) as ChainId,
  address: String(row.address),
  normalizedAddress: String(row.normalized_address) as Wallet["normalizedAddress"],
  displayName: repairPossiblyMojibake(String(row.display_name)),
  alias: row.alias ? repairPossiblyMojibake(String(row.alias)) : undefined,
  bio: row.bio ? repairPossiblyMojibake(String(row.bio)) : "",
  firstSeenAt: String(row.first_seen_at),
  strategyFocus: row.strategy_focus ? repairPossiblyMojibake(String(row.strategy_focus)) : "",
  teamNote: row.team_note ? repairPossiblyMojibake(String(row.team_note)) : undefined,
  watchlisted: Number(row.watchlisted ?? 0) === 1,
  createdAt: String(row.created_at ?? row.first_seen_at),
  updatedAt: String(row.updated_at ?? row.created_at ?? row.first_seen_at),
  deletedAt: row.deleted_at ? String(row.deleted_at) : undefined,
  sourceType: (row.source_type ? String(row.source_type) : "system") as WalletSourceType,
  curationStatus: (
    row.curation_status
      ? String(row.curation_status)
      : row.deleted_at
        ? "deleted"
        : "active"
  ) as WalletCurationStatus,
  lastImportedAt: row.last_imported_at ? String(row.last_imported_at) : undefined,
  importBatchId: row.import_batch_id ? String(row.import_batch_id) : undefined
});

const mapWalletLabelRow = (row: Record<string, unknown>): WalletLabel => ({
  id: String(row.id),
  walletId: String(row.wallet_id),
  name: repairPossiblyMojibake(String(row.name)),
  value: repairPossiblyMojibake(String(row.value)),
  kind: String(row.kind) as WalletLabel["kind"],
  source: String(row.source) as WalletLabel["source"],
  evidence: row.evidence ? repairPossiblyMojibake(String(row.evidence)) : undefined,
  verificationNote: row.verification_note
    ? repairPossiblyMojibake(String(row.verification_note))
    : undefined,
  sourceNote: row.source_note ? repairPossiblyMojibake(String(row.source_note)) : undefined,
  createdAt: String(row.created_at),
  updatedAt: row.updated_at ? String(row.updated_at) : String(row.created_at)
});

const mapAuditLogRow = (row: Record<string, unknown>): NoteAuditLog => ({
  id: String(row.id),
  walletId: String(row.wallet_id),
  action: String(row.action) as NoteAuditLog["action"],
  content: repairPossiblyMojibake(String(row.content)),
  actor: repairPossiblyMojibake(String(row.actor)),
  createdAt: String(row.created_at)
});

const mapWatchlistRow = (row: Record<string, unknown>): WatchlistEntry => ({
  id: String(row.id),
  walletId: String(row.wallet_id),
  note: row.note ? repairPossiblyMojibake(String(row.note)) : undefined,
  createdAt: String(row.created_at)
});

const mapInviteRow = (row: Record<string, unknown>): ExtensionInviteRecord => ({
  code: String(row.code),
  memberLabel: repairPossiblyMojibake(String(row.member_label)),
  status: String(row.status) as ExtensionInviteRecord["status"],
  expiresAt: row.expires_at ? String(row.expires_at) : null,
  createdAt: String(row.created_at),
  updatedAt: String(row.updated_at),
  lastUsedAt: row.last_used_at ? String(row.last_used_at) : null,
  boundUserId: row.bound_user_id ? String(row.bound_user_id) : null,
  boundUserEmail: row.bound_user_email ? String(row.bound_user_email) : null,
  boundAt: row.bound_at ? String(row.bound_at) : null
});

const mapExtensionUserRow = (row: Record<string, unknown>): ExtensionUserRecord => ({
  id: String(row.id),
  email: String(row.email),
  normalizedEmail: String(row.normalized_email),
  passwordHash: String(row.password_hash),
  passwordSalt: String(row.password_salt),
  passwordIterations: Number(row.password_iterations ?? 100_000),
  inviteCode: row.invite_code ? String(row.invite_code) : null,
  memberLabel: row.member_label ? repairPossiblyMojibake(String(row.member_label)) : null,
  boundAt: row.bound_at ? String(row.bound_at) : null,
  createdAt: String(row.created_at),
  updatedAt: String(row.updated_at),
  lastLoginAt: row.last_login_at ? String(row.last_login_at) : null,
  disabledAt: row.disabled_at ? String(row.disabled_at) : null
});

const mapSessionRow = (row: Record<string, unknown>): ExtensionSessionRecord => ({
  id: String(row.id),
  refreshTokenHash: String(row.refresh_token_hash),
  memberLabel: repairPossiblyMojibake(String(row.member_label)),
  inviteCode: String(row.invite_code),
  userId: row.user_id ? String(row.user_id) : null,
  userEmail: row.user_email ? String(row.user_email) : null,
  deviceLabel: row.device_label ? repairPossiblyMojibake(String(row.device_label)) : null,
  extensionVersion: row.extension_version ? String(row.extension_version) : null,
  refreshExpiresAt: String(row.refresh_expires_at),
  lastSeenAt: String(row.last_seen_at),
  createdAt: String(row.created_at),
  updatedAt: String(row.updated_at),
  revokedAt: row.revoked_at ? String(row.revoked_at) : null
});

const mapSavedViewRow = (row: Record<string, unknown>): WalletSavedViewRecord => ({
  id: String(row.id),
  name: repairPossiblyMojibake(String(row.name)),
  scope: String(row.scope ?? "team") as WalletSavedViewRecord["scope"],
  queryJson: String(row.query_json),
  createdAt: String(row.created_at),
  updatedAt: String(row.updated_at)
});

const mapImportBatchRow = (row: Record<string, unknown>): WalletImportBatchRecord => ({
  id: String(row.id),
  sourceType: String(row.source_type) as WalletSourceType,
  sourceName: row.source_name ? String(row.source_name) : null,
  provider: row.provider
    ? (String(row.provider) as WalletImportBatchRecord["provider"])
    : null,
  model: row.model ? String(row.model) : null,
  fallbackUsed: Number(row.fallback_used ?? 0) === 1,
  actor: String(row.actor),
  rowCount: Number(row.row_count ?? 0),
  createdCount: Number(row.created_count ?? 0),
  updatedCount: Number(row.updated_count ?? 0),
  failedCount: Number(row.failed_count ?? 0),
  createdAt: String(row.created_at)
});

const runStatements = async (db: D1Database, statements: readonly string[]) => {
  for (const statement of statements) {
    await db.prepare(statement).run();
  }
};

const listTableNames = async (db: D1Database) => {
  const result = await db
    .prepare(`SELECT name FROM sqlite_master WHERE type = 'table'`)
    .all<Record<string, unknown>>();
  return new Set((result.results ?? []).map((row) => String(row.name)));
};

const listWalletColumnNames = async (db: D1Database) => {
  const result = await db
    .prepare(`PRAGMA table_info(wallets)`)
    .all<Record<string, unknown>>();
  return new Set((result.results ?? []).map((row) => String(row.name)));
};

const ensureWalletColumns = async (db: D1Database) => {
  const result = await db
    .prepare(`PRAGMA table_info(wallets)`)
    .all<Record<string, unknown>>();
  const existingColumns = new Set(
    (result.results ?? []).map((row) => String(row.name))
  );

  const missingColumns = [
    {
      name: "source_type",
      ddl: `ALTER TABLE wallets ADD COLUMN source_type TEXT NOT NULL DEFAULT 'system'`
    },
    {
      name: "curation_status",
      ddl: `ALTER TABLE wallets ADD COLUMN curation_status TEXT NOT NULL DEFAULT 'active'`
    },
    {
      name: "last_imported_at",
      ddl: `ALTER TABLE wallets ADD COLUMN last_imported_at TEXT`
    },
    {
      name: "import_batch_id",
      ddl: `ALTER TABLE wallets ADD COLUMN import_batch_id TEXT`
    },
    {
      name: "deleted_at",
      ddl: `ALTER TABLE wallets ADD COLUMN deleted_at TEXT`
    },
    {
      name: "deleted_by",
      ddl: `ALTER TABLE wallets ADD COLUMN deleted_by TEXT`
    },
    {
      name: "delete_reason",
      ddl: `ALTER TABLE wallets ADD COLUMN delete_reason TEXT`
    }
  ].filter((column) => !existingColumns.has(column.name));

  for (const column of missingColumns) {
    await db.prepare(column.ddl).run();
  }
};

const ensureWalletLabelColumns = async (db: D1Database) => {
  const result = await db
    .prepare(`PRAGMA table_info(wallet_user_labels)`)
    .all<Record<string, unknown>>();
  const existingColumns = new Set((result.results ?? []).map((row) => String(row.name)));

  const missingColumns = [
    {
      name: "verification_note",
      ddl: `ALTER TABLE wallet_user_labels ADD COLUMN verification_note TEXT`
    },
    {
      name: "source_note",
      ddl: `ALTER TABLE wallet_user_labels ADD COLUMN source_note TEXT`
    },
    {
      name: "updated_at",
      ddl: `ALTER TABLE wallet_user_labels ADD COLUMN updated_at TEXT`
    }
  ].filter((column) => !existingColumns.has(column.name));

  for (const column of missingColumns) {
    await db.prepare(column.ddl).run();
  }

  if (missingColumns.some((column) => column.name === "updated_at")) {
    await db
      .prepare(
        `UPDATE wallet_user_labels
         SET updated_at = coalesce(updated_at, created_at)
         WHERE updated_at IS NULL`
      )
      .run();
  }
};

const ensureExtensionColumns = async (db: D1Database) => {
  const inviteColumnsResult = await db.prepare(`PRAGMA table_info(extension_invites)`).all<Record<string, unknown>>();
  const sessionColumnsResult = await db.prepare(`PRAGMA table_info(extension_sessions)`).all<Record<string, unknown>>();

  const inviteColumns = new Set((inviteColumnsResult.results ?? []).map((row) => String(row.name)));
  const sessionColumns = new Set((sessionColumnsResult.results ?? []).map((row) => String(row.name)));

  const inviteMissing = [
    {
      name: "bound_user_id",
      ddl: `ALTER TABLE extension_invites ADD COLUMN bound_user_id TEXT`
    },
    {
      name: "bound_user_email",
      ddl: `ALTER TABLE extension_invites ADD COLUMN bound_user_email TEXT`
    },
    {
      name: "bound_at",
      ddl: `ALTER TABLE extension_invites ADD COLUMN bound_at TEXT`
    }
  ].filter((column) => !inviteColumns.has(column.name));

  const sessionMissing = [
    {
      name: "user_id",
      ddl: `ALTER TABLE extension_sessions ADD COLUMN user_id TEXT`
    },
    {
      name: "user_email",
      ddl: `ALTER TABLE extension_sessions ADD COLUMN user_email TEXT`
    }
  ].filter((column) => !sessionColumns.has(column.name));

  for (const column of [...inviteMissing, ...sessionMissing]) {
    await db.prepare(column.ddl).run();
  }
};

const ensureNormalizedAddress = (value: string) => {
  const normalized = normalizeAddress(value);
  if (!normalized) {
    throw new Error("invalid wallet address");
  }
  return normalized;
};

const escapeLikeInput = (value: string) => value.replace(/[%_]/g, (match) => `\\${match}`);

const buildWalletFilterClauses = (input?: WalletListFilters) => {
  const filters = input ?? {};
  const clauses: string[] = [];
  const values: unknown[] = [];

  if (filters.status === "deleted") {
    clauses.push("deleted_at IS NOT NULL");
  } else if (!filters.includeDeleted) {
    clauses.push("deleted_at IS NULL");
  }

  if (filters.status === "watchlist") {
    clauses.push("watchlisted = 1");
  }

  if (filters.status === "review_needed") {
    clauses.push(`coalesce(curation_status, 'active') = 'review_needed'`);
  }

  if (filters.status === "active") {
    clauses.push(`coalesce(curation_status, 'active') = 'active'`);
  }

  if (filters.source && filters.source !== "all") {
    clauses.push(`coalesce(source_type, 'system') = ?`);
    values.push(filters.source);
  }

  if (filters.batch?.trim()) {
    clauses.push("import_batch_id = ?");
    values.push(filters.batch.trim());
  }

  if (filters.createdAfter) {
    clauses.push("created_at >= ?");
    values.push(filters.createdAfter);
  }

  if (filters.createdBefore) {
    clauses.push("created_at <= ?");
    values.push(filters.createdBefore);
  }

  const query = filters.q?.trim().toLowerCase();
  if (query) {
    const like = `%${escapeLikeInput(query)}%`;
    clauses.push(
      `(
        lower(normalized_address) LIKE ? ESCAPE '\\'
        OR lower(address) LIKE ? ESCAPE '\\'
        OR lower(display_name) LIKE ? ESCAPE '\\'
        OR lower(coalesce(alias, '')) LIKE ? ESCAPE '\\'
        OR lower(coalesce(strategy_focus, '')) LIKE ? ESCAPE '\\'
        OR lower(coalesce(bio, '')) LIKE ? ESCAPE '\\'
        OR lower(coalesce(team_note, '')) LIKE ? ESCAPE '\\'
        OR EXISTS (
          SELECT 1
          FROM wallet_user_labels
          WHERE wallet_user_labels.wallet_id = wallets.id
            AND (
              lower(wallet_user_labels.name) LIKE ? ESCAPE '\\'
              OR lower(wallet_user_labels.value) LIKE ? ESCAPE '\\'
            )
        )
      )`
    );
    values.push(like, like, like, like, like, like, like, like, like);
  }

  const labels = Array.from(
    new Set((filters.labels ?? []).map((value) => value.trim().toLowerCase()).filter(Boolean))
  );
  labels.forEach((label) => {
    clauses.push(
      `EXISTS (
        SELECT 1
        FROM wallet_user_labels
        WHERE wallet_user_labels.wallet_id = wallets.id
          AND lower(wallet_user_labels.value) = ?
      )`
    );
    values.push(label);
  });

  return {
    where: clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "",
    values
  };
};

const buildPlaceholders = (items: readonly unknown[]) => items.map(() => "?").join(", ");
const chunkItems = <T,>(items: readonly T[], size: number) => {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
};

const clampPageLimit = (value?: number) => {
  if (!value || Number.isNaN(value)) {
    return DEFAULT_PAGE_LIMIT;
  }

  return Math.max(1, Math.min(MAX_PAGE_LIMIT, Math.trunc(value)));
};

type WalletPageCursor =
  | {
      v: 1;
      s: "updated_desc";
      u: string;
      c: string;
      i: string;
    }
  | {
      v: 1;
      s: "created_desc";
      c: string;
      u: string;
      i: string;
    }
  | {
      v: 1;
      s: "name_asc";
      n: string;
      u: string;
      i: string;
    };

type WalletSortMeta = {
  sort: WalletListSort;
  orderBy: string;
  buildCursor: (row: Record<string, unknown>) => WalletPageCursor | null;
  buildSeekClause: (cursor: WalletPageCursor | null) => {
    clause: string;
    values: string[];
  };
};

const WALLET_CURSOR_PREFIX = "wsm_wallets_v1.";

const toBase64Url = (value: string) =>
  btoa(String.fromCharCode(...new TextEncoder().encode(value)))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/u, "");

const fromBase64Url = (value: string) => {
  const padded = value.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  return new TextDecoder().decode(Uint8Array.from(binary, (char) => char.charCodeAt(0)));
};

// Opaque cursor stores the last returned row's sort keys so the next page can seek without OFFSET.
const encodeCursor = (cursor: WalletPageCursor) => `${WALLET_CURSOR_PREFIX}${toBase64Url(JSON.stringify(cursor))}`;

const decodeCursor = (cursor?: string | null): WalletPageCursor | null => {
  if (!cursor?.startsWith(WALLET_CURSOR_PREFIX)) {
    return null;
  }

  try {
    const parsed = JSON.parse(fromBase64Url(cursor.slice(WALLET_CURSOR_PREFIX.length))) as unknown;
    if (!parsed || typeof parsed !== "object") {
      return null;
    }

    const payload = parsed as Record<string, unknown>;
    if (payload.v !== 1 || typeof payload.s !== "string" || typeof payload.i !== "string") {
      return null;
    }

    switch (payload.s) {
      case "updated_desc":
        return typeof payload.u === "string" && typeof payload.c === "string"
          ? { v: 1, s: "updated_desc", u: payload.u, c: payload.c, i: payload.i }
          : null;
      case "created_desc":
        return typeof payload.c === "string" && typeof payload.u === "string"
          ? { v: 1, s: "created_desc", c: payload.c, u: payload.u, i: payload.i }
          : null;
      case "name_asc":
        return typeof payload.n === "string" && typeof payload.u === "string"
          ? { v: 1, s: "name_asc", n: payload.n, u: payload.u, i: payload.i }
          : null;
      default:
        return null;
    }
  } catch {
    return null;
  }
};

const combineWhereClauses = (...clauses: Array<string | null | undefined>) => {
  const normalized = clauses
    .map((clause) => clause?.trim())
    .filter((clause): clause is string => Boolean(clause))
    .map((clause) => clause.replace(/^WHERE\s+/iu, ""));

  return normalized.length > 0 ? `WHERE ${normalized.join(" AND ")}` : "";
};

const resolveWalletSort = (sort?: WalletListSort): WalletSortMeta => {
  switch (sort) {
    case "created_desc":
      return {
        sort: "created_desc" as const,
        orderBy: "created_at DESC, updated_at DESC, id DESC",
        buildCursor: (row) => {
          const createdAt = row.created_at;
          const updatedAt = row.updated_at;
          const id = row.id;
          return typeof createdAt === "string" && typeof updatedAt === "string" && typeof id === "string"
            ? { v: 1, s: "created_desc", c: createdAt, u: updatedAt, i: id }
            : null;
        },
        buildSeekClause: (cursor) => {
          if (!cursor || cursor.s !== "created_desc") {
            return { clause: "", values: [] };
          }

          return {
            clause:
              "(created_at < ? OR (created_at = ? AND updated_at < ?) OR (created_at = ? AND updated_at = ? AND id < ?))",
            values: [cursor.c, cursor.c, cursor.u, cursor.c, cursor.u, cursor.i]
          };
        }
      };
    case "name_asc":
      return {
        sort: "name_asc" as const,
        orderBy: "lower(coalesce(alias, display_name)) ASC, updated_at DESC, id DESC",
        buildCursor: (row) => {
          const nameKey = row.__wallet_name_sort;
          const updatedAt = row.updated_at;
          const id = row.id;
          return typeof nameKey === "string" && typeof updatedAt === "string" && typeof id === "string"
            ? { v: 1, s: "name_asc", n: nameKey, u: updatedAt, i: id }
            : null;
        },
        buildSeekClause: (cursor) => {
          if (!cursor || cursor.s !== "name_asc") {
            return { clause: "", values: [] };
          }

          return {
            clause:
              "(lower(coalesce(alias, display_name)) > ? OR (lower(coalesce(alias, display_name)) = ? AND updated_at < ?) OR (lower(coalesce(alias, display_name)) = ? AND updated_at = ? AND id < ?))",
            values: [cursor.n, cursor.n, cursor.u, cursor.n, cursor.u, cursor.i]
          };
        }
      };
    case "updated_desc":
    default:
      return {
        sort: "updated_desc" as const,
        orderBy: "updated_at DESC, created_at DESC, id DESC",
        buildCursor: (row) => {
          const updatedAt = row.updated_at;
          const createdAt = row.created_at;
          const id = row.id;
          return typeof updatedAt === "string" && typeof createdAt === "string" && typeof id === "string"
            ? { v: 1, s: "updated_desc", u: updatedAt, c: createdAt, i: id }
            : null;
        },
        buildSeekClause: (cursor) => {
          if (!cursor || cursor.s !== "updated_desc") {
            return { clause: "", values: [] };
          }

          return {
            clause:
              "(updated_at < ? OR (updated_at = ? AND created_at < ?) OR (updated_at = ? AND created_at = ? AND id < ?))",
            values: [cursor.u, cursor.u, cursor.c, cursor.u, cursor.c, cursor.i]
          };
        }
      };
  }
};

const toWalletSavedView = (record: WalletSavedViewRecord): WalletSavedView => ({
  id: record.id,
  name: record.name,
  scope: "team",
  query: JSON.parse(record.queryJson) as WalletSavedView["query"],
  createdAt: record.createdAt,
  updatedAt: record.updatedAt
});

const toWalletImportBatch = (record: WalletImportBatchRecord): WalletImportBatch => ({
  id: record.id,
  sourceType: record.sourceType,
  sourceName: record.sourceName ?? undefined,
  provider: record.provider as WalletImportBatch["provider"],
  model: record.model ?? undefined,
  fallbackUsed: record.fallbackUsed,
  actor: record.actor,
  rowCount: record.rowCount,
  createdCount: record.createdCount,
  updatedCount: record.updatedCount,
  failedCount: record.failedCount,
  createdAt: record.createdAt
});

const createInviteSuffix = (length = 8) => {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
};

const createInviteCode = () => {
  const date = nowIso().slice(0, 10).replace(/-/g, "");
  return `luka-${date}-${createInviteSuffix()}`;
};

export const getAdminExtensionSessionStatus = (
  session: Pick<ExtensionSessionRecord, "lastSeenAt" | "refreshExpiresAt" | "revokedAt">,
  now = Date.now()
): AdminExtensionSessionStatus => {
  if (session.revokedAt) {
    return "revoked";
  }

  if (toTimestamp(session.refreshExpiresAt) <= now) {
    return "expired";
  }

  return now - toTimestamp(session.lastSeenAt) <= ACTIVE_SESSION_WINDOW_MS ? "active" : "idle";
};

export const getAdminExtensionInviteEffectiveStatus = (
  invite: Pick<ExtensionInviteRecord, "status" | "expiresAt">,
  now = Date.now()
): AdminExtensionInviteEffectiveStatus => {
  if (invite.status !== "active") {
    return "disabled";
  }

  if (invite.expiresAt && toTimestamp(invite.expiresAt) <= now) {
    return "expired";
  }

  return "active";
};

const touchWallet = async (
  db: D1Database,
  walletId: string,
  patch?: {
    teamNote?: string | null;
    watchlisted?: boolean;
  }
) => {
  const fields = ["updated_at = ?"];
  const values: unknown[] = [nowIso()];

  if (patch?.teamNote !== undefined) {
    fields.push("team_note = ?");
    values.push(patch.teamNote);
  }

  if (patch?.watchlisted !== undefined) {
    fields.push("watchlisted = ?");
    values.push(patch.watchlisted ? 1 : 0);
  }

  values.push(walletId);

  await db
    .prepare(`UPDATE wallets SET ${fields.join(", ")} WHERE id = ?`)
    .bind(...values)
    .run();
};

const createAuditLog = async (
  db: D1Database,
  walletId: string,
  action: NoteAuditLog["action"],
  content: string,
  actor = DEFAULT_ACTOR
) => {
  const createdAt = nowIso();
  const log: NoteAuditLog = {
    id: crypto.randomUUID(),
    walletId,
    action,
    content,
    actor,
    createdAt
  };

  await db
    .prepare(
      `INSERT INTO wallet_audit_logs (id, wallet_id, action, content, actor, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .bind(log.id, log.walletId, log.action, log.content, log.actor, log.createdAt)
    .run();

  return log;
};

const LABEL_DISPLAY_MAX = 18;
const LABEL_METRIC_MAX = 56;
const HOVER_NOTE_MAX = 88;
const HOVER_NOTE_LIMIT = 3;

const compactLabelText = (value?: string | null) =>
  repairPossiblyMojibake(value ?? "").replace(/\s+/g, " ").trim();

const clampLabelText = (value: string, maxLength: number) =>
  value.length <= maxLength ? value : `${value.slice(0, maxLength - 1).trimEnd()}...`;

const getLabelDisplayText = (label: WalletLabel) => {
  const preferred = compactLabelText(label.value) || compactLabelText(label.name);
  return preferred ? clampLabelText(preferred, LABEL_DISPLAY_MAX) : "";
};

const getLabelMetricText = (label: WalletLabel) => {
  const metric = compactLabelText(label.evidence) || compactLabelText(label.sourceNote);
  return metric ? clampLabelText(metric, LABEL_METRIC_MAX) : undefined;
};

const getLabelTone = (label: WalletLabel): AddressLabelBadge["tone"] => {
  if (label.source === "user") {
    return "accent";
  }

  if (label.kind === "activity_level") {
    return compactLabelText(label.value).includes("正常") ? "watch" : "neutral";
  }

  if (label.kind === "signal_quality") {
    return "ai-review";
  }

  return "neutral";
};

const getLabelSortPriority = (label: WalletLabel) =>
  getLabelKindPriority(label.kind) +
  (label.source === "user" ? 2000 : 0) +
  ((label.verificationNote || label.sourceNote) && label.source === "user" ? 120 : 0);

const shouldIncludeSummaryLabel = (kind: WalletLabelKind) =>
  kind !== "signal_quality" && kind !== "market_scope" && kind !== "confidence";

const toLabelBadge = (label: WalletLabel): AddressLabelBadge => {
  const displayText = getLabelDisplayText(label);
  return {
    id: label.id,
    text: displayText,
    tone: getLabelTone(label),
    kind: label.kind,
    priority: getLabelSortPriority(label),
    detailText: compactLabelText(label.name) || displayText,
    metricText: getLabelMetricText(label),
    isPrimary: isPrimarySignalLabelKind(label.kind)
  };
};

type DisplayLabelEntry = {
  label: WalletLabel;
  badge: AddressLabelBadge;
  dedupeKey: string;
  updatedAt: number;
};

const compareDisplayLabelEntries = (left: DisplayLabelEntry, right: DisplayLabelEntry) =>
  (right.badge.priority ?? 0) - (left.badge.priority ?? 0) ||
  right.updatedAt - left.updatedAt ||
  left.badge.text.localeCompare(right.badge.text, "zh-CN");

const createDisplayLabelEntries = (labels: WalletLabel[]) => {
  const deduped = new Map<string, DisplayLabelEntry>();

  labels
    .filter((label) => shouldIncludeSummaryLabel(label.kind))
    .forEach((label) => {
      const badge = toLabelBadge(label);
      if (!badge.text) {
        return;
      }

      const entry: DisplayLabelEntry = {
        label,
        badge,
        dedupeKey: getWalletLabelDisplayKey(label.kind, badge.text),
        updatedAt: toTimestamp(label.updatedAt ?? label.createdAt)
      };
      const existing = deduped.get(entry.dedupeKey);
      if (!existing || compareDisplayLabelEntries(entry, existing) < 0) {
        deduped.set(entry.dedupeKey, entry);
      }
    });

  return Array.from(deduped.values()).sort(compareDisplayLabelEntries);
};

const createSummaryBadges = (labels: WalletLabel[]) =>
  dedupeAddressBadges(createDisplayLabelEntries(labels).map((entry) => entry.badge)).slice(0, 2);

const createHoverBadges = (labels: WalletLabel[]) =>
  dedupeAddressBadges(createDisplayLabelEntries(labels).map((entry) => entry.badge)).slice(0, 6);

const joinUniqueLabelTexts = (items: string[], maxItems = HOVER_NOTE_LIMIT) => {
  const values = Array.from(
    new Set(
      items
        .map((item) => compactLabelText(item))
        .filter(Boolean)
        .map((item) => clampLabelText(item, HOVER_NOTE_MAX))
    )
  ).slice(0, maxItems);

  return values.length > 0 ? values.join(" | ") : undefined;
};

const buildAiMetricNote = (entry: DisplayLabelEntry) => {
  const metric = entry.badge.metricText;
  return metric ? clampLabelText(`${entry.badge.text}: ${metric}`, HOVER_NOTE_MAX) : entry.badge.text;
};

const createAddressHoverCard = (labels: WalletLabel[]): AddressHoverCard | undefined => {
  const displayEntries = createDisplayLabelEntries(labels);
  const officialEntries = displayEntries.filter((entry) => entry.label.source === "user");
  const aiEntries = displayEntries.filter((entry) => entry.label.source !== "user");

  const officialTags = officialEntries.map((entry) => entry.badge).slice(0, 6);
  const aiTags = aiEntries.map((entry) => entry.badge).slice(0, 6);

  const officialNoteText = joinUniqueLabelTexts(
    officialEntries.flatMap((entry) => [entry.label.verificationNote ?? "", entry.label.sourceNote ?? ""])
  );

  const aiStatsNoteText = joinUniqueLabelTexts(aiEntries.map(buildAiMetricNote));

  if (officialTags.length === 0 && aiTags.length === 0 && !officialNoteText && !aiStatsNoteText) {
    return undefined;
  }

  return {
    officialTags,
    officialNoteText,
    aiTags,
    aiStatsNoteText
  };
};

const createStatusBadges = (wallet: Wallet): AddressLabelBadge[] => {
  const badges: AddressLabelBadge[] = [];

  if (wallet.watchlisted) {
    badges.push({
      id: `${wallet.id}-watchlist`,
      text: "Watchlist",
      tone: "watch",
      priority: 40
    });
  }

  if (wallet.deletedAt) {
    badges.push({
      id: `${wallet.id}-deleted`,
      text: "已删除",
      tone: "danger",
      priority: 60
    });
  } else if (wallet.curationStatus === "review_needed") {
    badges.push({
      id: `${wallet.id}-review`,
      text: "待复核",
      tone: "ai-review",
      priority: 35
    });
  }

  return sortAddressBadges(badges);
};

export const runMigrations = async (db: D1Database) => {
  const [walletTableStatement, ...remainingStatements] = extensionSchemaStatements;
  await runStatements(db, [walletTableStatement]);
  await ensureWalletColumns(db);
  await runStatements(db, remainingStatements);
  await ensureWalletLabelColumns(db);
  await ensureExtensionColumns(db);
};

export interface SmartMoneySchemaStatus {
  tables: string[];
  walletColumns: string[];
  missingTables: string[];
  missingWalletColumns: string[];
  datasetVersion: number;
  isReady: boolean;
}

export const getSmartMoneySchemaStatus = async (
  db: D1Database
): Promise<SmartMoneySchemaStatus> => {
  const [tableNames, walletColumns, datasetVersion] = await Promise.all([
    listTableNames(db),
    listWalletColumnNames(db),
    getDatasetVersion(db, "address_labels")
  ]);

  const tables = Array.from(tableNames).sort();
  const columns = Array.from(walletColumns).sort();
  const missingTables = REQUIRED_SCHEMA_TABLES.filter((table) => !tableNames.has(table));
  const missingWalletColumns = REQUIRED_WALLET_COLUMNS.filter((column) => !walletColumns.has(column));

  return {
    tables,
    walletColumns: columns,
    missingTables: [...missingTables],
    missingWalletColumns: [...missingWalletColumns],
    datasetVersion,
    isReady: missingTables.length === 0 && missingWalletColumns.length === 0
  };
};

export const bootstrapSmartMoneyDb = async (db: D1Database) => {
  await runMigrations(db);
  await ensureDatasetVersion(db, "address_labels");
  const status = await getSmartMoneySchemaStatus(db);
  if (!status.isReady) {
    const parts = [
      status.missingTables.length > 0
        ? `missing tables: ${status.missingTables.join(", ")}`
        : null,
      status.missingWalletColumns.length > 0
        ? `missing wallet columns: ${status.missingWalletColumns.join(", ")}`
        : null
    ].filter(Boolean);
    throw new Error(`smart money schema bootstrap incomplete (${parts.join("; ")})`);
  }
  return status;
};

export const ensureDatasetVersion = async (db: D1Database, dataset: DatasetKey) => {
  await db
    .prepare(
      `INSERT INTO dataset_versions (dataset, version, updated_at)
       VALUES (?, 1, ?)
       ON CONFLICT(dataset) DO NOTHING`
    )
    .bind(dataset, nowIso())
    .run();
};

export const getDatasetVersion = async (db: D1Database, dataset: DatasetKey) => {
  await ensureDatasetVersion(db, dataset);
  const row = await db
    .prepare(`SELECT version FROM dataset_versions WHERE dataset = ?`)
    .bind(dataset)
    .first<{ version: number }>();

  return typeof row?.version === "number" ? row.version : 1;
};

export const incrementDatasetVersion = async (db: D1Database, dataset: DatasetKey) => {
  await ensureDatasetVersion(db, dataset);
  await db
    .prepare(
      `UPDATE dataset_versions
       SET version = version + 1, updated_at = ?
       WHERE dataset = ?`
    )
    .bind(nowIso(), dataset)
    .run();
  return getDatasetVersion(db, dataset);
};

export const listWallets = async (db: D1Database, input?: WalletListFilters) => {
  const { where, values } = buildWalletFilterClauses(input);
  const result = await db
    .prepare(
      `SELECT * FROM wallets
       ${where}
       ORDER BY watchlisted DESC, updated_at DESC, created_at DESC`
    )
    .bind(...values)
    .all<Record<string, unknown>>();

  return (result.results ?? []).map(mapWalletRow);
};

const countWallets = async (db: D1Database, filters?: WalletListFilters) => {
  const { where, values } = buildWalletFilterClauses(filters);
  const row = await db
    .prepare(
      `SELECT COUNT(*) as count
       FROM wallets
       ${where}`
    )
    .bind(...values)
    .first<{ count: number }>();

  return Number(row?.count ?? 0);
};

export const listWalletPage = async (
  db: D1Database,
  input?: WalletPageInput
): Promise<{
  wallets: Wallet[];
  totalCount: number;
  nextCursor?: string;
  pageMeta: WalletListResponse["pageMeta"];
}> => {
  const limit = clampPageLimit(input?.limit);
  const cursor = decodeCursor(input?.cursor);
  const sortMeta = resolveWalletSort(input?.sort);
  const filters: WalletListFilters = {
    q: input?.q,
    includeDeleted: input?.includeDeleted,
    createdAfter: input?.createdAfter,
    createdBefore: input?.createdBefore,
    labels: input?.labels,
    source: input?.source,
    batch: input?.batch,
    status: input?.status
  };
  const { where, values } = buildWalletFilterClauses(filters);
  const seek = sortMeta.buildSeekClause(cursor);
  const combinedWhere = combineWhereClauses(where, seek.clause);
  const [result, totalCount] = await Promise.all([
    db
      .prepare(
        `SELECT wallets.*, lower(coalesce(alias, display_name)) AS __wallet_name_sort
         FROM wallets
         ${combinedWhere}
         ORDER BY ${sortMeta.orderBy}
         LIMIT ?`
      )
      .bind(...values, ...seek.values, limit + 1)
      .all<Record<string, unknown>>(),
    countWallets(db, filters)
  ]);

  const pageRows = result.results ?? [];
  const hasNextPage = pageRows.length > limit;
  const visibleRows = hasNextPage ? pageRows.slice(0, limit) : pageRows;
  const wallets = visibleRows.map(mapWalletRow);
  const lastVisibleRow = visibleRows.at(-1);
  const nextCursorPayload = hasNextPage && lastVisibleRow ? sortMeta.buildCursor(lastVisibleRow) : null;
  return {
    wallets,
    totalCount,
    nextCursor: nextCursorPayload ? encodeCursor(nextCursorPayload) : undefined,
    pageMeta: {
      limit,
      cursor: input?.cursor,
      returnedCount: wallets.length,
      sort: sortMeta.sort
    }
  };
};

export const getWalletFacetSummary = async (
  db: D1Database,
  filters?: WalletListFilters
): Promise<WalletFacetSummary> => {
  const baseFilters: WalletListFilters = {
    q: filters?.q,
    source: filters?.source,
    batch: filters?.batch,
    labels: filters?.labels,
    createdAfter: filters?.createdAfter,
    createdBefore: filters?.createdBefore
  };
  const [totalCount, activeCount, deletedCount, watchlistedCount, reviewNeededCount] =
    await Promise.all([
      countWallets(db, { ...baseFilters }),
      countWallets(db, { ...baseFilters, status: "active" }),
      countWallets(db, { ...baseFilters, status: "deleted", includeDeleted: true }),
      countWallets(db, { ...baseFilters, status: "watchlist" }),
      countWallets(db, { ...baseFilters, status: "review_needed" })
    ]);

  const sourceCounts: Record<WalletSourceType, number> = {
    manual: 0,
    finder: 0,
    ai: 0,
    file: 0,
    system: 0
  };

  const sourceRows = await db
    .prepare(
      `SELECT coalesce(source_type, 'system') as source_type, COUNT(*) as count
       FROM wallets
       WHERE deleted_at IS NULL
       GROUP BY coalesce(source_type, 'system')`
    )
    .all<Record<string, unknown>>();

  (sourceRows.results ?? []).forEach((row) => {
    const key = String(row.source_type) as WalletSourceType;
    if (key in sourceCounts) {
      sourceCounts[key] = Number(row.count ?? 0);
    }
  });

  const labelRowsResult = await db
    .prepare(
      `SELECT wallet_user_labels.value as label_value, COUNT(*) as count
       FROM wallet_user_labels
       INNER JOIN wallets ON wallets.id = wallet_user_labels.wallet_id
       WHERE wallets.deleted_at IS NULL
       GROUP BY wallet_user_labels.value
       ORDER BY count DESC, wallet_user_labels.value ASC
       LIMIT 12`
    )
    .all<Record<string, unknown>>();

  const labelCounts = (labelRowsResult.results ?? []).map(
    (row) =>
      ({
        key: String(row.label_value),
        label: String(row.label_value),
        count: Number(row.count ?? 0)
      }) satisfies WalletFacetCount
  );

  return {
    totalCount,
    activeCount,
    deletedCount,
    watchlistedCount,
    reviewNeededCount,
    sourceCounts,
    labelCounts
  };
};

export const getWalletById = async (
  db: D1Database,
  walletId: string,
  input?: Pick<WalletListFilters, "includeDeleted">
) => {
  const clauses = ["id = ?"];
  const values: unknown[] = [walletId];

  if (!input?.includeDeleted) {
    clauses.push("deleted_at IS NULL");
  }

  const row = await db
    .prepare(`SELECT * FROM wallets WHERE ${clauses.join(" AND ")}`)
    .bind(...values)
    .first<Record<string, unknown>>();

  return row ? mapWalletRow(row) : null;
};

export const getWalletByNormalizedAddress = async (
  db: D1Database,
  input: {
    normalizedAddress: string;
    chain?: ChainId;
    includeDeleted?: boolean;
  }
) => {
  const clauses = ["chain = ?", "normalized_address = ?"];
  const values: unknown[] = [input.chain ?? DEFAULT_CHAIN, input.normalizedAddress];

  if (!input.includeDeleted) {
    clauses.push("deleted_at IS NULL");
  }

  const row = await db
    .prepare(`SELECT * FROM wallets WHERE ${clauses.join(" AND ")} LIMIT 1`)
    .bind(...values)
    .first<Record<string, unknown>>();

  return row ? mapWalletRow(row) : null;
};

export const createWallet = async (db: D1Database, input: WalletInput, actor = DEFAULT_ACTOR) => {
  const normalizedAddress = ensureNormalizedAddress(input.address);
  const existingWallet = await getWalletByNormalizedAddress(db, {
    chain: input.chain ?? DEFAULT_CHAIN,
    normalizedAddress,
    includeDeleted: true
  });

  if (existingWallet && !existingWallet.deletedAt) {
    throw new Error("wallet already exists");
  }

  const timestamp = nowIso();
  const wallet: Wallet = {
    id: existingWallet?.id ?? crypto.randomUUID(),
    chain: input.chain ?? DEFAULT_CHAIN,
    address: input.address.trim(),
    normalizedAddress,
    displayName: input.displayName.trim(),
    alias: input.alias?.trim() || undefined,
    bio: input.bio?.trim() ?? "",
    strategyFocus: input.strategyFocus?.trim() ?? "",
    teamNote: input.teamNote?.trim() || undefined,
    firstSeenAt: input.firstSeenAt?.trim() || nowIso(),
    watchlisted: existingWallet?.watchlisted ?? false,
    createdAt: existingWallet?.createdAt ?? timestamp,
    updatedAt: timestamp,
    deletedAt: undefined,
    sourceType: input.sourceType ?? existingWallet?.sourceType ?? "system",
    curationStatus: input.curationStatus ?? "active",
    lastImportedAt: input.lastImportedAt?.trim() || existingWallet?.lastImportedAt,
    importBatchId: input.importBatchId?.trim() || existingWallet?.importBatchId
  };

  if (existingWallet?.deletedAt) {
    await db
      .prepare(
        `UPDATE wallets
         SET chain = ?,
             address = ?,
             normalized_address = ?,
             display_name = ?,
             alias = ?,
             bio = ?,
             strategy_focus = ?,
             team_note = ?,
             first_seen_at = ?,
             source_type = ?,
             curation_status = ?,
             last_imported_at = ?,
             import_batch_id = ?,
             updated_at = ?,
             deleted_at = NULL,
             deleted_by = NULL,
             delete_reason = NULL
         WHERE id = ?`
      )
      .bind(
        wallet.chain,
        wallet.address,
        wallet.normalizedAddress,
        wallet.displayName,
        wallet.alias ?? null,
        wallet.bio,
        wallet.strategyFocus,
        wallet.teamNote ?? null,
        wallet.firstSeenAt,
        wallet.sourceType,
        wallet.curationStatus,
        wallet.lastImportedAt ?? null,
        wallet.importBatchId ?? null,
        timestamp,
        wallet.id
      )
      .run();

    await createAuditLog(db, wallet.id, "update_wallet", `重新录入地址 ${wallet.displayName}`, actor);
  } else {
    await db
      .prepare(
        `INSERT INTO wallets (
          id,
          chain,
          address,
          normalized_address,
          display_name,
          alias,
          bio,
          strategy_focus,
          team_note,
          first_seen_at,
          source_type,
          curation_status,
          last_imported_at,
          import_batch_id,
          created_at,
          updated_at,
          watchlisted
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`
      )
      .bind(
        wallet.id,
        wallet.chain,
        wallet.address,
        wallet.normalizedAddress,
        wallet.displayName,
        wallet.alias ?? null,
        wallet.bio,
        wallet.strategyFocus,
        wallet.teamNote ?? null,
        wallet.firstSeenAt,
        wallet.sourceType,
        wallet.curationStatus,
        wallet.lastImportedAt ?? null,
        wallet.importBatchId ?? null,
        wallet.createdAt,
        wallet.updatedAt
      )
      .run();

    await createAuditLog(db, wallet.id, "create_wallet", `新增地址 ${wallet.displayName}`, actor);
  }

  await incrementDatasetVersion(db, "address_labels");
  return (await getWalletById(db, wallet.id, { includeDeleted: true })) ?? wallet;
};

export const updateWallet = async (
  db: D1Database,
  walletId: string,
  payload: WalletUpdate,
  actor = DEFAULT_ACTOR
) => {
  const existingWallet = await getWalletById(db, walletId, { includeDeleted: true });
  if (!existingWallet) {
    return null;
  }

  const fields: string[] = [];
  const values: unknown[] = [];
  const changeSummaries: string[] = [];

  if (payload.address !== undefined) {
    const normalizedAddress = ensureNormalizedAddress(payload.address);
    fields.push("address = ?", "normalized_address = ?");
    values.push(payload.address.trim(), normalizedAddress);
    changeSummaries.push("更新地址");
  }

  if (payload.displayName !== undefined) {
    fields.push("display_name = ?");
    values.push(payload.displayName.trim());
    changeSummaries.push("更新显示名");
  }

  if (payload.alias !== undefined) {
    fields.push("alias = ?");
    values.push(payload.alias?.trim() || null);
    changeSummaries.push("更新别名");
  }

  if (payload.bio !== undefined) {
    fields.push("bio = ?");
    values.push(payload.bio?.trim() || null);
    changeSummaries.push("更新简介");
  }

  if (payload.strategyFocus !== undefined) {
    fields.push("strategy_focus = ?");
    values.push(payload.strategyFocus?.trim() || null);
    changeSummaries.push("更新策略重点");
  }

  if (payload.teamNote !== undefined) {
    fields.push("team_note = ?");
    values.push(payload.teamNote?.trim() || null);
    changeSummaries.push("更新团队备注");
  }

  if (payload.firstSeenAt !== undefined) {
    fields.push("first_seen_at = ?");
    values.push(payload.firstSeenAt.trim());
    changeSummaries.push("更新首次发现时间");
  }

  if (payload.sourceType !== undefined) {
    fields.push("source_type = ?");
    values.push(payload.sourceType);
    changeSummaries.push("更新来源");
  }

  if (payload.curationStatus !== undefined) {
    fields.push("curation_status = ?");
    values.push(payload.curationStatus);
    changeSummaries.push("更新整理状态");
  }

  if (payload.lastImportedAt !== undefined) {
    fields.push("last_imported_at = ?");
    values.push(payload.lastImportedAt?.trim() || null);
  }

  if (payload.importBatchId !== undefined) {
    fields.push("import_batch_id = ?");
    values.push(payload.importBatchId?.trim() || null);
  }

  if (fields.length === 0) {
    return existingWallet;
  }

  fields.push("updated_at = ?");
  values.push(nowIso(), walletId);

  await db
    .prepare(`UPDATE wallets SET ${fields.join(", ")} WHERE id = ?`)
    .bind(...values)
    .run();

  await createAuditLog(
    db,
    walletId,
    "update_wallet",
    changeSummaries.join(" / ") || "更新地址信息",
    actor
  );
  await incrementDatasetVersion(db, "address_labels");
  return getWalletById(db, walletId, { includeDeleted: true });
};

export const softDeleteWallet = async (
  db: D1Database,
  walletId: string,
  input?: WalletDeleteInput
) => {
  const existingWallet = await getWalletById(db, walletId, { includeDeleted: true });
  if (!existingWallet) {
    return null;
  }

  if (existingWallet.deletedAt) {
    return existingWallet;
  }

  const deletedAt = nowIso();
  const actor = input?.actor?.trim() || DEFAULT_ACTOR;
  const reason = input?.reason?.trim() || null;

  await db
    .prepare(
      `UPDATE wallets
       SET deleted_at = ?,
           deleted_by = ?,
           delete_reason = ?,
           curation_status = 'deleted',
           updated_at = ?
       WHERE id = ?`
    )
    .bind(deletedAt, actor, reason, deletedAt, walletId)
    .run();

  await createAuditLog(
    db,
    walletId,
    "delete_wallet",
    reason ? `删除地址: ${reason}` : `删除地址 ${existingWallet.displayName}`,
    actor
  );
  await incrementDatasetVersion(db, "address_labels");
  return getWalletById(db, walletId, { includeDeleted: true });
};

export const listWalletLabelsByWalletIds = async (db: D1Database, walletIds: string[]) => {
  if (walletIds.length === 0) {
    return new Map<string, WalletLabel[]>();
  }

  const rows = (
    await Promise.all(
      chunkItems(walletIds, MAX_SQL_IN_ITEMS).map(async (chunk) => {
        const result = await db
          .prepare(
            `SELECT * FROM wallet_user_labels
             WHERE wallet_id IN (${buildPlaceholders(chunk)})
             ORDER BY coalesce(updated_at, created_at) DESC, created_at DESC`
          )
          .bind(...chunk)
          .all<Record<string, unknown>>();

        return result.results ?? [];
      })
    )
  ).flat();

  const result = new Map<string, WalletLabel[]>();
  rows.forEach((row) => {
    const label = mapWalletLabelRow(row);
    const current = result.get(label.walletId) ?? [];
    current.push(label);
    result.set(label.walletId, current);
  });
  return result;
};

export const listWalletAuditLogsByWalletIds = async (db: D1Database, walletIds: string[]) => {
  if (walletIds.length === 0) {
    return new Map<string, NoteAuditLog[]>();
  }

  const rows = (
    await Promise.all(
      chunkItems(walletIds, MAX_SQL_IN_ITEMS).map(async (chunk) => {
        const result = await db
          .prepare(
            `SELECT * FROM wallet_audit_logs
             WHERE wallet_id IN (${buildPlaceholders(chunk)})
             ORDER BY created_at DESC`
          )
          .bind(...chunk)
          .all<Record<string, unknown>>();

        return result.results ?? [];
      })
    )
  ).flat();

  const result = new Map<string, NoteAuditLog[]>();
  rows.forEach((row) => {
    const auditLog = mapAuditLogRow(row);
    const current = result.get(auditLog.walletId) ?? [];
    current.push(auditLog);
    result.set(auditLog.walletId, current);
  });
  return result;
};

export const listWalletNotesByWalletIds = async (db: D1Database, walletIds: string[]) => {
  if (walletIds.length === 0) {
    return new Map<string, { id: string; content: string; actor: string; createdAt: string }[]>();
  }

  const rows = (
    await Promise.all(
      chunkItems(walletIds, MAX_SQL_IN_ITEMS).map(async (chunk) => {
        const result = await db
          .prepare(
            `SELECT * FROM wallet_notes
             WHERE wallet_id IN (${buildPlaceholders(chunk)})
             ORDER BY created_at DESC`
          )
          .bind(...chunk)
          .all<Record<string, unknown>>();

        return result.results ?? [];
      })
    )
  ).flat();

  const result = new Map<string, { id: string; content: string; actor: string; createdAt: string }[]>();
  rows.forEach((row) => {
    const walletId = String(row.wallet_id);
    const current = result.get(walletId) ?? [];
    current.push({
      id: String(row.id),
      content: String(row.content),
      actor: String(row.actor),
      createdAt: String(row.created_at)
    });
    result.set(walletId, current);
  });
  return result;
};

export const listWatchlistEntriesByWalletIds = async (db: D1Database, walletIds: string[]) => {
  if (walletIds.length === 0) {
    return new Map<string, WatchlistEntry>();
  }

  const rows = (
    await Promise.all(
      chunkItems(walletIds, MAX_SQL_IN_ITEMS).map(async (chunk) => {
        const result = await db
          .prepare(
            `SELECT * FROM wallet_watchlist
             WHERE wallet_id IN (${buildPlaceholders(chunk)})`
          )
          .bind(...chunk)
          .all<Record<string, unknown>>();

        return result.results ?? [];
      })
    )
  ).flat();

  const result = new Map<string, WatchlistEntry>();
  rows.forEach((row) => {
    const entry = mapWatchlistRow(row);
    result.set(entry.walletId, entry);
  });
  return result;
};

export const createWalletNote = async (
  db: D1Database,
  walletId: string,
  content: string,
  actor = DEFAULT_ACTOR
) => {
  const existingWallet = await getWalletById(db, walletId);
  if (!existingWallet) {
    return undefined;
  }

  const note = {
    id: crypto.randomUUID(),
    walletId,
    content: content.trim(),
    actor,
    createdAt: nowIso()
  };

  await db
    .prepare(
      `INSERT INTO wallet_notes (id, wallet_id, content, actor, created_at)
       VALUES (?, ?, ?, ?, ?)`
    )
    .bind(note.id, note.walletId, note.content, note.actor, note.createdAt)
    .run();

  await touchWallet(db, walletId, { teamNote: note.content });
  await createAuditLog(db, walletId, "create_note", note.content, actor);
  await incrementDatasetVersion(db, "address_labels");

  return note;
};

export const createWalletLabel = async (
  db: D1Database,
  walletId: string,
  input: WalletLabelInput,
  actor = DEFAULT_ACTOR
) => {
  const existingWallet = await getWalletById(db, walletId);
  if (!existingWallet) {
    return undefined;
  }

  const label: WalletLabel = {
    id: crypto.randomUUID(),
    walletId,
    name: input.name.trim(),
    value: input.value.trim(),
    kind: input.kind ?? "strategy",
    source: input.source ?? "user",
    evidence: input.evidence?.trim() || undefined,
    verificationNote: input.verificationNote?.trim() || undefined,
    sourceNote: input.sourceNote?.trim() || undefined,
    createdAt: nowIso(),
    updatedAt: nowIso()
  };

  if (label.source === "system") {
    const existingUserRow = await db
      .prepare(
        `SELECT * FROM wallet_user_labels
         WHERE wallet_id = ?
           AND source = 'user'
           AND kind = ?
           AND lower(value) = lower(?)`
      )
      .bind(walletId, label.kind, label.value.toLowerCase())
      .first<Record<string, unknown>>();

    if (existingUserRow) {
      return mapWalletLabelRow(existingUserRow);
    }
  }

  await db
    .prepare(
      `INSERT INTO wallet_user_labels (
        id,
        wallet_id,
        name,
        value,
        kind,
        source,
        evidence,
        verification_note,
        source_note,
        created_at,
        updated_at
      )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      label.id,
      label.walletId,
      label.name,
      label.value,
      label.kind,
      label.source,
      label.evidence ?? null,
      label.verificationNote ?? null,
      label.sourceNote ?? null,
      label.createdAt,
      label.updatedAt
    )
    .run();

  await touchWallet(db, walletId);
  await createAuditLog(db, walletId, "create_user_tag", `${label.name}: ${label.value}`, actor);
  await incrementDatasetVersion(db, "address_labels");

  return label;
};

export const replaceSystemLabelsForWallet = async (
  db: D1Database,
  walletId: string
) => {
  await db
    .prepare(
      `DELETE FROM wallet_user_labels
       WHERE wallet_id = ?
         AND source = 'system'`
    )
    .bind(walletId)
    .run();

  await incrementDatasetVersion(db, "address_labels");
};

export const updateWalletLabel = async (
  db: D1Database,
  walletId: string,
  labelId: string,
  input: WalletLabelPatchInput,
  actor = DEFAULT_ACTOR
) => {
  const existingWallet = await getWalletById(db, walletId, { includeDeleted: true });
  if (!existingWallet) {
    return undefined;
  }

  const existingRow = await db
    .prepare(`SELECT * FROM wallet_user_labels WHERE id = ? AND wallet_id = ?`)
    .bind(labelId, walletId)
    .first<Record<string, unknown>>();
  if (!existingRow) {
    return null;
  }

  const existingLabel = mapWalletLabelRow(existingRow);
  const updatedAt = nowIso();
  const nextName = input.name === undefined ? existingLabel.name : input.name.trim();
  const nextValue = input.value === undefined ? existingLabel.value : input.value.trim();
  const nextKind = input.kind ?? existingLabel.kind;
  const nextSource = input.source ?? existingLabel.source;
  const nextEvidence =
    input.evidence === undefined
      ? existingLabel.evidence
      : input.evidence.trim() || undefined;
  const nextVerificationNote =
    input.verificationNote === undefined
      ? existingLabel.verificationNote
      : input.verificationNote.trim() || undefined;
  const nextSourceNote =
    input.sourceNote === undefined
      ? existingLabel.sourceNote
      : input.sourceNote.trim() || undefined;

  await db
    .prepare(
      `UPDATE wallet_user_labels
       SET name = ?,
           value = ?,
           kind = ?,
           source = ?,
           evidence = ?,
           verification_note = ?,
           source_note = ?,
           updated_at = ?
       WHERE id = ? AND wallet_id = ?`
    )
    .bind(
      nextName,
      nextValue,
      nextKind,
      nextSource,
      nextEvidence ?? null,
      nextVerificationNote ?? null,
      nextSourceNote ?? null,
      updatedAt,
      labelId,
      walletId
    )
    .run();

  await touchWallet(db, walletId);
  await createAuditLog(db, walletId, "create_user_tag", `更新标签: ${nextName}: ${nextValue}`, actor);
  await incrementDatasetVersion(db, "address_labels");

  const row = await db
    .prepare(`SELECT * FROM wallet_user_labels WHERE id = ? AND wallet_id = ?`)
    .bind(labelId, walletId)
    .first<Record<string, unknown>>();
  return row ? mapWalletLabelRow(row) : null;
};

export const deleteWalletLabel = async (
  db: D1Database,
  walletId: string,
  labelId: string,
  actor = DEFAULT_ACTOR
) => {
  const existingWallet = await getWalletById(db, walletId, { includeDeleted: true });
  if (!existingWallet) {
    return undefined;
  }

  const existingRow = await db
    .prepare(`SELECT * FROM wallet_user_labels WHERE id = ? AND wallet_id = ?`)
    .bind(labelId, walletId)
    .first<Record<string, unknown>>();
  if (!existingRow) {
    return null;
  }

  const existingLabel = mapWalletLabelRow(existingRow);
  await db
    .prepare(`DELETE FROM wallet_user_labels WHERE id = ? AND wallet_id = ?`)
    .bind(labelId, walletId)
    .run();

  await touchWallet(db, walletId);
  await createAuditLog(
    db,
    walletId,
    "create_user_tag",
    `删除标签: ${existingLabel.name}: ${existingLabel.value}`,
    actor
  );
  await incrementDatasetVersion(db, "address_labels");
  return { id: labelId };
};

export const upsertWalletWatchlist = async (
  db: D1Database,
  walletId: string,
  note?: string,
  actor = DEFAULT_ACTOR
) => {
  const existingWallet = await getWalletById(db, walletId);
  if (!existingWallet) {
    return undefined;
  }

  const existing = await db
    .prepare(`SELECT * FROM wallet_watchlist WHERE wallet_id = ?`)
    .bind(walletId)
    .first<Record<string, unknown>>();

  const entry = existing
    ? {
        id: String(existing.id),
        walletId,
        note: note?.trim() || (existing.note ? String(existing.note) : undefined),
        createdAt: String(existing.created_at)
      }
    : {
        id: crypto.randomUUID(),
        walletId,
        note: note?.trim() || undefined,
        createdAt: nowIso()
      };

  const updatedAt = nowIso();

  if (existing) {
    await db
      .prepare(
        `UPDATE wallet_watchlist
         SET note = ?, updated_at = ?
         WHERE wallet_id = ?`
      )
      .bind(entry.note ?? null, updatedAt, walletId)
      .run();
  } else {
    await db
      .prepare(
        `INSERT INTO wallet_watchlist (id, wallet_id, note, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)`
      )
      .bind(entry.id, walletId, entry.note ?? null, entry.createdAt, updatedAt)
      .run();
  }

  await touchWallet(db, walletId, { watchlisted: true });
  await createAuditLog(
    db,
    walletId,
    "toggle_watchlist",
    entry.note ? `加入 watchlist: ${entry.note}` : "加入 watchlist",
    actor
  );
  await incrementDatasetVersion(db, "address_labels");

  return {
    ...entry
  } satisfies WatchlistEntry;
};

export const removeWalletWatchlist = async (
  db: D1Database,
  walletId: string,
  actor = DEFAULT_ACTOR
) => {
  const existingWallet = await getWalletById(db, walletId);
  if (!existingWallet) {
    return undefined;
  }

  await db.prepare(`DELETE FROM wallet_watchlist WHERE wallet_id = ?`).bind(walletId).run();
  await touchWallet(db, walletId, { watchlisted: false });
  await createAuditLog(db, walletId, "toggle_watchlist", "移出 watchlist", actor);
  await incrementDatasetVersion(db, "address_labels");

  return getWalletById(db, walletId, { includeDeleted: true });
};

export const listWalletSavedViews = async (db: D1Database) => {
  const result = await db
    .prepare(
      `SELECT * FROM wallet_saved_views
       ORDER BY updated_at DESC, created_at DESC`
    )
    .all<Record<string, unknown>>();

  return (result.results ?? []).map((row) => toWalletSavedView(mapSavedViewRow(row)));
};

export const getWalletSavedViewById = async (db: D1Database, viewId: string) => {
  const row = await db
    .prepare(`SELECT * FROM wallet_saved_views WHERE id = ?`)
    .bind(viewId)
    .first<Record<string, unknown>>();

  return row ? toWalletSavedView(mapSavedViewRow(row)) : null;
};

export const createWalletSavedView = async (
  db: D1Database,
  input: {
    name: string;
    query: WalletSavedView["query"];
  }
) => {
  const record: WalletSavedViewRecord = {
    id: crypto.randomUUID(),
    name: input.name.trim(),
    scope: "team",
    queryJson: JSON.stringify(input.query),
    createdAt: nowIso(),
    updatedAt: nowIso()
  };

  await db
    .prepare(
      `INSERT INTO wallet_saved_views (id, name, scope, query_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .bind(
      record.id,
      record.name,
      record.scope,
      record.queryJson,
      record.createdAt,
      record.updatedAt
    )
    .run();

  return toWalletSavedView(record);
};

export const updateWalletSavedView = async (
  db: D1Database,
  viewId: string,
  input: {
    name?: string;
    query?: WalletSavedView["query"];
  }
) => {
  const existing = await getWalletSavedViewById(db, viewId);
  if (!existing) {
    return null;
  }

  const updatedAt = nowIso();
  await db
    .prepare(
      `UPDATE wallet_saved_views
       SET name = ?, query_json = ?, updated_at = ?
       WHERE id = ?`
    )
    .bind(
      input.name?.trim() || existing.name,
      JSON.stringify(input.query ?? existing.query),
      updatedAt,
      viewId
    )
    .run();

  return getWalletSavedViewById(db, viewId);
};

export const deleteWalletSavedView = async (db: D1Database, viewId: string) => {
  await db.prepare(`DELETE FROM wallet_saved_views WHERE id = ?`).bind(viewId).run();
};

export const createWalletImportBatch = async (
  db: D1Database,
  input: Omit<WalletImportBatchRecord, "id" | "createdAt">
) => {
  const record: WalletImportBatchRecord = {
    id: crypto.randomUUID(),
    createdAt: nowIso(),
    ...input
  };

  await db
    .prepare(
      `INSERT INTO wallet_import_batches (
        id,
        source_type,
        source_name,
        provider,
        model,
        fallback_used,
        actor,
        row_count,
        created_count,
        updated_count,
        failed_count,
        created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      record.id,
      record.sourceType,
      record.sourceName ?? null,
      record.provider ?? null,
      record.model ?? null,
      record.fallbackUsed ? 1 : 0,
      record.actor,
      record.rowCount,
      record.createdCount,
      record.updatedCount,
      record.failedCount,
      record.createdAt
    )
    .run();

  return toWalletImportBatch(record);
};

export const updateWalletImportBatch = async (
  db: D1Database,
  batchId: string,
  input: {
    createdCount: number;
    updatedCount: number;
    failedCount: number;
  }
) => {
  await db
    .prepare(
      `UPDATE wallet_import_batches
       SET created_count = ?, updated_count = ?, failed_count = ?
       WHERE id = ?`
    )
    .bind(input.createdCount, input.updatedCount, input.failedCount, batchId)
    .run();

  const row = await db
    .prepare(`SELECT * FROM wallet_import_batches WHERE id = ?`)
    .bind(batchId)
    .first<Record<string, unknown>>();

  return row ? toWalletImportBatch(mapImportBatchRow(row)) : null;
};

export const getWalletImportBatchById = async (db: D1Database, batchId: string) => {
  const row = await db
    .prepare(`SELECT * FROM wallet_import_batches WHERE id = ?`)
    .bind(batchId)
    .first<Record<string, unknown>>();

  return row ? toWalletImportBatch(mapImportBatchRow(row)) : null;
};

export const listWalletImportBatches = async (
  db: D1Database,
  input?: {
    limit?: number;
  }
) => {
  const limit = Math.max(1, Math.min(100, Math.trunc(input?.limit ?? 20)));
  const result = await db
    .prepare(
      `SELECT *
       FROM wallet_import_batches
       ORDER BY created_at DESC
       LIMIT ?`
    )
    .bind(limit)
    .all<Record<string, unknown>>();

  return (result.results ?? []).map((row) => toWalletImportBatch(mapImportBatchRow(row)));
};

export const listWalletImportBatchesByIds = async (db: D1Database, batchIds: string[]) => {
  if (batchIds.length === 0) {
    return new Map<string, WalletImportBatch>();
  }

  const rows = (
    await Promise.all(
      chunkItems(batchIds, MAX_SQL_IN_ITEMS).map(async (chunk) => {
        const result = await db
          .prepare(
            `SELECT *
             FROM wallet_import_batches
             WHERE id IN (${buildPlaceholders(chunk)})`
          )
          .bind(...chunk)
          .all<Record<string, unknown>>();

        return result.results ?? [];
      })
    )
  ).flat();

  return rows.reduce((map, row) => {
    const batch = toWalletImportBatch(mapImportBatchRow(row));
    map.set(batch.id, batch);
    return map;
  }, new Map<string, WalletImportBatch>());
};

export const listWalletsByImportBatchIds = async (db: D1Database, batchIds: string[]) => {
  if (batchIds.length === 0) {
    return [];
  }

  const rows = (
    await Promise.all(
      chunkItems(batchIds, MAX_SQL_IN_ITEMS).map(async (chunk) => {
        const result = await db
          .prepare(
            `SELECT *
             FROM wallets
             WHERE import_batch_id IN (${buildPlaceholders(chunk)})
             ORDER BY updated_at DESC, created_at DESC`
          )
          .bind(...chunk)
          .all<Record<string, unknown>>();

        return result.results ?? [];
      })
    )
  ).flat();

  return rows.map(mapWalletRow);
};

export const getExtensionUserByNormalizedEmail = async (db: D1Database, normalizedEmail: string) => {
  const row = await db
    .prepare(`SELECT * FROM extension_users WHERE normalized_email = ?`)
    .bind(normalizedEmail.trim().toLowerCase())
    .first<Record<string, unknown>>();

  return row ? mapExtensionUserRow(row) : null;
};

export const getExtensionUserByInviteCode = async (db: D1Database, inviteCode: string) => {
  const row = await db
    .prepare(`SELECT * FROM extension_users WHERE invite_code = ?`)
    .bind(inviteCode)
    .first<Record<string, unknown>>();

  return row ? mapExtensionUserRow(row) : null;
};

export const createExtensionUser = async (
  db: D1Database,
  input: {
    email: string;
    normalizedEmail: string;
    passwordHash: string;
    passwordSalt: string;
    passwordIterations: number;
    inviteCode: string;
    memberLabel: string;
  }
) => {
  const timestamp = nowIso();
  const user: ExtensionUserRecord = {
    id: crypto.randomUUID(),
    email: input.email,
    normalizedEmail: input.normalizedEmail,
    passwordHash: input.passwordHash,
    passwordSalt: input.passwordSalt,
    passwordIterations: input.passwordIterations,
    inviteCode: input.inviteCode,
    memberLabel: input.memberLabel,
    boundAt: timestamp,
    createdAt: timestamp,
    updatedAt: timestamp,
    lastLoginAt: timestamp,
    disabledAt: null
  };

  await db
    .prepare(
      `INSERT INTO extension_users (
        id,
        email,
        normalized_email,
        password_hash,
        password_salt,
        password_iterations,
        invite_code,
        member_label,
        bound_at,
        created_at,
        updated_at,
        last_login_at,
        disabled_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`
    )
    .bind(
      user.id,
      user.email,
      user.normalizedEmail,
      user.passwordHash,
      user.passwordSalt,
      user.passwordIterations,
      user.inviteCode,
      user.memberLabel,
      user.boundAt,
      user.createdAt,
      user.updatedAt,
      user.lastLoginAt
    )
    .run();

  return user;
};

export const bindExtensionUserInvite = async (
  db: D1Database,
  userId: string,
  input: {
    inviteCode: string;
    memberLabel: string;
  }
) => {
  const timestamp = nowIso();
  await db
    .prepare(
      `UPDATE extension_users
       SET invite_code = ?,
           member_label = ?,
           bound_at = coalesce(bound_at, ?),
           updated_at = ?
       WHERE id = ?`
    )
    .bind(input.inviteCode, input.memberLabel, timestamp, timestamp, userId)
    .run();

  const row = await db
    .prepare(`SELECT * FROM extension_users WHERE id = ?`)
    .bind(userId)
    .first<Record<string, unknown>>();

  return row ? mapExtensionUserRow(row) : null;
};

export const setExtensionInviteBinding = async (
  db: D1Database,
  code: string,
  input: {
    userId: string;
    userEmail: string;
    boundAt?: string;
  }
) => {
  const timestamp = input.boundAt ?? nowIso();
  await db
    .prepare(
      `UPDATE extension_invites
       SET bound_user_id = ?,
           bound_user_email = ?,
           bound_at = coalesce(bound_at, ?),
           updated_at = ?
       WHERE code = ?`
    )
    .bind(input.userId, input.userEmail, timestamp, timestamp, code)
    .run();

  return getExtensionInvite(db, code);
};

export const updateExtensionUserLogin = async (db: D1Database, userId: string) => {
  const timestamp = nowIso();
  await db
    .prepare(
      `UPDATE extension_users
       SET updated_at = ?,
           last_login_at = ?
       WHERE id = ?`
    )
    .bind(timestamp, timestamp, userId)
    .run();

  const row = await db
    .prepare(`SELECT * FROM extension_users WHERE id = ?`)
    .bind(userId)
    .first<Record<string, unknown>>();

  return row ? mapExtensionUserRow(row) : null;
};

export const getExtensionInvite = async (db: D1Database, code: string) => {
  const row = await db
    .prepare(`SELECT * FROM extension_invites WHERE code = ?`)
    .bind(code)
    .first<Record<string, unknown>>();

  return row ? mapInviteRow(row) : null;
};

export const upsertExtensionInvite = async (
  db: D1Database,
  code: string,
  memberLabel: string,
  expiresAt?: string | null
) => {
  const timestamp = nowIso();
  await db
    .prepare(
      `INSERT INTO extension_invites (code, member_label, status, expires_at, created_at, updated_at)
       VALUES (?, ?, 'active', ?, ?, ?)
       ON CONFLICT(code) DO UPDATE SET
         member_label = excluded.member_label,
         expires_at = excluded.expires_at,
         updated_at = excluded.updated_at`
    )
    .bind(code, memberLabel, expiresAt ?? null, timestamp, timestamp)
    .run();

  return getExtensionInvite(db, code);
};

export const createExtensionInvite = async (
  db: D1Database,
  input: {
    memberLabel: string;
    expiresAt?: string | null;
  }
) => {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = createInviteCode();
    const existing = await getExtensionInvite(db, code);
    if (existing) {
      continue;
    }

    const created = await upsertExtensionInvite(db, code, input.memberLabel.trim(), input.expiresAt);
    if (created) {
      return created;
    }
  }

  throw new Error("failed to generate unique invite code");
};

export const setExtensionInviteStatus = async (
  db: D1Database,
  code: string,
  status: ExtensionInviteRecord["status"]
) => {
  const timestamp = nowIso();
  await db
    .prepare(`UPDATE extension_invites SET status = ?, updated_at = ? WHERE code = ?`)
    .bind(status, timestamp, code)
    .run();

  return getExtensionInvite(db, code);
};

export const markExtensionInviteUsed = async (db: D1Database, code: string) => {
  await db
    .prepare(`UPDATE extension_invites SET last_used_at = ?, updated_at = ? WHERE code = ?`)
    .bind(nowIso(), nowIso(), code)
    .run();
};

export const createExtensionSession = async (
  db: D1Database,
  input: {
    refreshTokenHash: string;
    memberLabel: string;
    inviteCode: string;
    userId?: string | null;
    userEmail?: string | null;
    refreshExpiresAt: string;
    deviceLabel?: string;
    extensionVersion?: string;
  }
) => {
  const session: ExtensionSessionRecord = {
    id: crypto.randomUUID(),
    refreshTokenHash: input.refreshTokenHash,
    memberLabel: input.memberLabel,
    inviteCode: input.inviteCode,
    userId: input.userId?.trim() || null,
    userEmail: input.userEmail?.trim().toLowerCase() || null,
    deviceLabel: input.deviceLabel?.trim() || null,
    extensionVersion: input.extensionVersion?.trim() || null,
    refreshExpiresAt: input.refreshExpiresAt,
    lastSeenAt: nowIso(),
    createdAt: nowIso(),
    updatedAt: nowIso(),
    revokedAt: null
  };

  await db
    .prepare(
      `INSERT INTO extension_sessions (
        id,
        refresh_token_hash,
        member_label,
        invite_code,
        user_id,
        user_email,
        device_label,
        extension_version,
        refresh_expires_at,
        last_seen_at,
        created_at,
        updated_at,
        revoked_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`
    )
    .bind(
      session.id,
      session.refreshTokenHash,
      session.memberLabel,
      session.inviteCode,
      session.userId ?? null,
      session.userEmail ?? null,
      session.deviceLabel ?? null,
      session.extensionVersion ?? null,
      session.refreshExpiresAt,
      session.lastSeenAt,
      session.createdAt,
      session.updatedAt
    )
    .run();

  return session;
};

export const getExtensionSessionById = async (db: D1Database, sessionId: string) => {
  const row = await db
    .prepare(`SELECT * FROM extension_sessions WHERE id = ?`)
    .bind(sessionId)
    .first<Record<string, unknown>>();

  return row ? mapSessionRow(row) : null;
};

export const getExtensionSessionByRefreshHash = async (db: D1Database, refreshTokenHash: string) => {
  const row = await db
    .prepare(`SELECT * FROM extension_sessions WHERE refresh_token_hash = ?`)
    .bind(refreshTokenHash)
    .first<Record<string, unknown>>();

  return row ? mapSessionRow(row) : null;
};

export const touchExtensionSession = async (db: D1Database, sessionId: string) => {
  const timestamp = nowIso();
  await db
    .prepare(`UPDATE extension_sessions SET last_seen_at = ?, updated_at = ? WHERE id = ?`)
    .bind(timestamp, timestamp, sessionId)
    .run();
};

export const revokeExtensionSession = async (db: D1Database, sessionId: string) => {
  const timestamp = nowIso();
  await db
    .prepare(`UPDATE extension_sessions SET revoked_at = ?, updated_at = ? WHERE id = ?`)
    .bind(timestamp, timestamp, sessionId)
    .run();
};

export const revokeExtensionSessionByRefreshHash = async (db: D1Database, refreshTokenHash: string) => {
  const timestamp = nowIso();
  await db
    .prepare(
      `UPDATE extension_sessions
       SET revoked_at = ?, updated_at = ?
       WHERE refresh_token_hash = ?`
    )
    .bind(timestamp, timestamp, refreshTokenHash)
    .run();
};

export const listExtensionSessions = async (
  db: D1Database,
  input?: {
    query?: string;
    status?: AdminExtensionSessionStatus | "all";
  }
) => {
  const rows = await db
    .prepare(`SELECT * FROM extension_sessions ORDER BY last_seen_at DESC, created_at DESC`)
    .all<Record<string, unknown>>();

  const now = Date.now();
  const query = input?.query?.trim().toLowerCase();
  const status = input?.status ?? "all";

  return (rows.results ?? [])
    .map(mapSessionRow)
    .map((session) => ({
      id: session.id,
      inviteCode: session.inviteCode,
      memberLabel: session.memberLabel,
      userId: session.userId,
      userEmail: session.userEmail,
      deviceLabel: session.deviceLabel,
      extensionVersion: session.extensionVersion,
      createdAt: session.createdAt,
      lastSeenAt: session.lastSeenAt,
      refreshExpiresAt: session.refreshExpiresAt,
      revokedAt: session.revokedAt,
      status: getAdminExtensionSessionStatus(session, now)
    }))
    .filter((session) => {
      if (status !== "all" && session.status !== status) {
        return false;
      }

      if (!query) {
        return true;
      }

      return [
        session.id,
        session.inviteCode,
        session.memberLabel,
        session.userEmail,
        session.deviceLabel,
        session.extensionVersion
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(query);
    });
};

export const listExtensionInvites = async (db: D1Database) => {
  const [inviteRows, sessions] = await Promise.all([
    db
      .prepare(`SELECT * FROM extension_invites ORDER BY updated_at DESC, created_at DESC`)
      .all<Record<string, unknown>>(),
    listExtensionSessions(db, { status: "all" })
  ]);

  const sessionsByInvite = new Map<string, AdminExtensionSessionItem[]>();
  sessions.forEach((session) => {
    const current = sessionsByInvite.get(session.inviteCode) ?? [];
    current.push(session);
    sessionsByInvite.set(session.inviteCode, current);
  });

  const now = Date.now();
  return (inviteRows.results ?? []).map((row) => {
    const invite = mapInviteRow(row);
    const inviteSessions = sessionsByInvite.get(invite.code) ?? [];
    const latestSessionAt =
      inviteSessions.length > 0
        ? inviteSessions
            .map((session) => toTimestamp(session.lastSeenAt || session.createdAt))
            .sort((left, right) => right - left)[0]
        : 0;

    return {
      code: invite.code,
      memberLabel: invite.memberLabel,
      status: invite.status,
      effectiveStatus: getAdminExtensionInviteEffectiveStatus(invite, now),
      createdAt: invite.createdAt,
      updatedAt: invite.updatedAt,
      expiresAt: invite.expiresAt,
      lastUsedAt: invite.lastUsedAt,
      boundUserId: invite.boundUserId,
      boundUserEmail: invite.boundUserEmail,
      boundAt: invite.boundAt,
      sessionCount: inviteSessions.length,
      activeSessionCount: inviteSessions.filter((session) => session.status === "active").length,
      latestSessionAt: latestSessionAt ? new Date(latestSessionAt).toISOString() : null
    };
  });
};

export const getExtensionOverview = async (db: D1Database): Promise<AdminExtensionOverview> => {
  const [invites, sessions] = await Promise.all([
    listExtensionInvites(db),
    listExtensionSessions(db, { status: "all" })
  ]);

  return {
    totalInvites: invites.length,
    activeInvites: invites.filter((invite) => invite.effectiveStatus === "active").length,
    disabledInvites: invites.filter((invite) => invite.effectiveStatus === "disabled").length,
    expiredInvites: invites.filter((invite) => invite.effectiveStatus === "expired").length,
    activeSessions: sessions.filter((session) => session.status === "active").length,
    idleSessions: sessions.filter((session) => session.status === "idle").length,
    expiredSessions: sessions.filter((session) => session.status === "expired").length,
    revokedSessions: sessions.filter((session) => session.status === "revoked").length
  };
};

export const listAddressSummaries = async (
  db: D1Database,
  input: {
    chain?: ChainId;
    normalizedAddresses: string[];
    adminBaseUrl: string;
  }
) => {
  const normalizedAddresses = Array.from(new Set(input.normalizedAddresses));
  if (normalizedAddresses.length === 0) {
    return [] as AddressSummary[];
  }

  const chain = input.chain ?? DEFAULT_CHAIN;
  const walletRows = (
    await Promise.all(
      chunkItems(normalizedAddresses, MAX_SQL_IN_ITEMS).map(async (chunk) => {
        const result = await db
          .prepare(
            `SELECT * FROM wallets
             WHERE chain = ?
               AND deleted_at IS NULL
               AND normalized_address IN (${buildPlaceholders(chunk)})`
          )
          .bind(chain, ...chunk)
          .all<Record<string, unknown>>();

        return result.results ?? [];
      })
    )
  ).flat();
  const wallets = walletRows.map(mapWalletRow);
  if (wallets.length === 0) {
    return [] as AddressSummary[];
  }

  const walletIds = wallets.map((wallet) => wallet.id);
  const [labelsByWalletId, notesByWalletId, version] = await Promise.all([
    listWalletLabelsByWalletIds(db, walletIds),
    listWalletNotesByWalletIds(db, walletIds),
    getDatasetVersion(db, "address_labels")
  ]);

  const walletRowByAddress = new Map(
    walletRows.map((row) => [String(row.normalized_address), row] as const)
  );
  const walletByAddress = new Map(wallets.map((wallet) => [wallet.normalizedAddress, wallet] as const));

  return normalizedAddresses
    .map((normalizedAddress) => {
      const wallet = walletByAddress.get(normalizedAddress as Wallet["normalizedAddress"]);
      if (!wallet) {
        return null;
      }

      const labels = labelsByWalletId.get(wallet.id) ?? [];
      const latestNote = notesByWalletId.get(wallet.id)?.[0];
      const walletRow = walletRowByAddress.get(normalizedAddress);
      const updatedAt = walletRow?.updated_at ? String(walletRow.updated_at) : wallet.updatedAt;

      return {
        chain: wallet.chain,
        address: wallet.address,
        normalizedAddress: wallet.normalizedAddress,
        alias: wallet.alias ?? wallet.displayName,
        displayName: wallet.displayName,
        strategyFocus: wallet.strategyFocus || undefined,
        badges: createSummaryBadges(labels),
        hoverBadges: createHoverBadges(labels),
        statusBadges: createStatusBadges(wallet),
        hoverCard: createAddressHoverCard(labels),
        noteSnippet: latestNote?.content ?? wallet.teamNote,
        watchlisted: wallet.watchlisted,
        detailUrl: `${input.adminBaseUrl.replace(/\/$/, "")}/wallets/${wallet.id}`,
        updatedAt,
        version: `v${version}:${wallet.id}:${updatedAt}`
      } satisfies AddressSummary;
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);
};

export const searchAddressSummaries = async (
  db: D1Database,
  input: {
    query: string;
    chain?: ChainId;
    adminBaseUrl: string;
    limit?: number;
  }
) => {
  const query = input.query.trim().toLowerCase();
  if (!query) {
    return [] as AddressSearchResult[];
  }

  const chain = input.chain ?? DEFAULT_CHAIN;
  const limit = Math.max(1, Math.min(25, input.limit ?? 12));
  const queryLike = `%${query}%`;

  const walletRowsResult = await db
    .prepare(
      `SELECT *
       FROM wallets
       WHERE chain = ?
         AND deleted_at IS NULL
         AND (
           lower(normalized_address) LIKE ?
           OR lower(address) LIKE ?
           OR lower(display_name) LIKE ?
           OR lower(coalesce(alias, '')) LIKE ?
           OR lower(coalesce(strategy_focus, '')) LIKE ?
           OR lower(coalesce(bio, '')) LIKE ?
           OR lower(coalesce(team_note, '')) LIKE ?
           OR EXISTS (
             SELECT 1
             FROM wallet_user_labels
             WHERE wallet_user_labels.wallet_id = wallets.id
               AND (
                 lower(wallet_user_labels.name) LIKE ?
                 OR lower(wallet_user_labels.value) LIKE ?
               )
           )
         )
       ORDER BY watchlisted DESC, updated_at DESC, created_at DESC
       LIMIT ${limit}`
    )
    .bind(
      chain,
      queryLike,
      queryLike,
      queryLike,
      queryLike,
      queryLike,
      queryLike,
      queryLike,
      queryLike,
      queryLike
    )
    .all<Record<string, unknown>>();

  const walletRows = walletRowsResult.results ?? [];
  const wallets = walletRows.map(mapWalletRow);
  if (wallets.length === 0) {
    return [] as AddressSearchResult[];
  }

  const walletIds = wallets.map((wallet) => wallet.id);
  const [labelsByWalletId, notesByWalletId, version] = await Promise.all([
    listWalletLabelsByWalletIds(db, walletIds),
    listWalletNotesByWalletIds(db, walletIds),
    getDatasetVersion(db, "address_labels")
  ]);

  return wallets.map((wallet, index) => {
    const labels = labelsByWalletId.get(wallet.id) ?? [];
    const latestNote = notesByWalletId.get(wallet.id)?.[0];
    const walletRow = walletRows[index];
    const updatedAt = walletRow?.updated_at ? String(walletRow.updated_at) : wallet.updatedAt;

    return {
      chain: wallet.chain,
      address: wallet.address,
      normalizedAddress: wallet.normalizedAddress,
      displayName: wallet.displayName,
      alias: wallet.alias ?? wallet.displayName,
      strategyFocus: wallet.strategyFocus || undefined,
      badges: createSummaryBadges(labels),
      hoverBadges: createHoverBadges(labels),
      statusBadges: createStatusBadges(wallet),
      hoverCard: createAddressHoverCard(labels),
      noteSnippet: latestNote?.content ?? wallet.teamNote,
      watchlisted: wallet.watchlisted,
      detailUrl: `${input.adminBaseUrl.replace(/\/$/, "")}/wallets/${wallet.id}`,
      updatedAt,
      version: `v${version}:${wallet.id}:${updatedAt}`,
      bio: wallet.bio || undefined,
      teamNote: wallet.teamNote || undefined
    } satisfies AddressSearchResult;
  });
};

