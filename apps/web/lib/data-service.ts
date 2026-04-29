import {
  ALERT_EVENT_META,
  computeDashboardSummary,
  computeMarketDigests,
  computeWalletMetrics,
  deriveSystemLabels,
  generateAlertEvents,
  getLabelKindPriority,
  getWalletLabelDisplayKey,
  isPrimarySignalLabelKind,
  markets as seedMarkets,
  normalizeAddress,
  positionSnapshots as seedPositions,
  sortAddressBadges,
  trades as seedTrades,
  type AddressLabelBadge,
  type AdminExtensionInviteItem,
  type AdminExtensionOverview,
  type AdminExtensionSessionItem,
  type AlertEvent,
  type Wallet,
  type WalletAdminRow,
  type WalletAiExtractRequest,
  type WalletAiExtractPreviewRow,
  type WalletFacetSummary,
  type WalletImportBatch,
  type WalletImportCommitRequest,
  type WalletImportPreviewRow,
  type WalletLabel,
  type WalletListQuery,
  type WalletListResponse,
  type WalletManualCreateInput,
  type WalletSavedView,
  type WalletSourceType,
  type WalletStatusBadge,
  type WalletTableRow
} from "@weather-smart-money/core";
import {
  bootstrapSmartMoneyDb,
  createExtensionInvite as createPersistedExtensionInvite,
  createWalletImportBatch as createPersistedWalletImportBatch,
  createWalletSavedView as createPersistedWalletSavedView,
  createWallet as createPersistedWallet,
  createWalletLabel as createPersistedWalletLabel,
  replaceSystemLabelsForWallet as replacePersistedSystemLabelsForWallet,
  createWalletNote as createPersistedWalletNote,
  deleteWalletLabel as deletePersistedWalletLabel,
  deleteWalletSavedView as deletePersistedWalletSavedView,
  getExtensionOverview as getPersistedExtensionOverview,
  getSmartMoneySchemaStatus as getPersistedSmartMoneySchemaStatus,
  getWalletImportBatchById as getPersistedWalletImportBatchById,
  getWalletFacetSummary as getPersistedWalletFacetSummary,
  getWalletById as getPersistedWalletById,
  getWalletSavedViewById as getPersistedWalletSavedViewById,
  listExtensionInvites as listPersistedExtensionInvites,
  listExtensionSessions as listPersistedExtensionSessions,
  listWalletImportBatches as listPersistedWalletImportBatches,
  listWalletImportBatchesByIds,
  listWalletPage as listPersistedWalletPage,
  listWalletSavedViews as listPersistedWalletSavedViews,
  listWalletAuditLogsByWalletIds,
  listWalletLabelsByWalletIds,
  listWalletsByImportBatchIds,
  listWallets as listPersistedWallets,
  removeWalletWatchlist as removePersistedWalletWatchlist,
  revokeExtensionSession as revokePersistedExtensionSession,
  setExtensionInviteStatus as setPersistedExtensionInviteStatus,
  softDeleteWallet as softDeletePersistedWallet,
  type WalletDeleteInput,
  type WalletInput,
  type WalletLabelInput,
  type WalletLabelPatchInput,
  type WalletListFilters,
  type WalletUpdate,
  updateWalletImportBatch as updatePersistedWalletImportBatch,
  updateWalletLabel as updatePersistedWalletLabel,
  updateWalletSavedView as updatePersistedWalletSavedView,
  updateWallet as updatePersistedWallet,
  upsertWalletWatchlist as upsertPersistedWalletWatchlist,
  listWatchlistEntriesByWalletIds
} from "@weather-smart-money/data";
import { cache } from "react";

import type { AlertListItem, DashboardData, WalletDetailData } from "./demo-store";
import {
  createUserTag as createDemoUserTag,
  createWallet as createDemoWallet,
  createWalletNote as createDemoWalletNote,
  getDashboardData as getDemoDashboardData,
  getWalletDetail as getDemoWalletDetail,
  listAlerts as listDemoAlerts,
  listWalletRows as listDemoWalletRows,
  removeWatchlistEntry as removeDemoWatchlistEntry,
  softDeleteWallet as softDeleteDemoWallet,
  upsertWatchlistEntry as upsertDemoWatchlistEntry,
  updateWallet as updateDemoWallet
} from "./demo-store";
import { getSmartMoneyBindings, type SmartMoneyBindings } from "./cloudflare-env";
import {
  buildWeatherLabels,
  buildWeatherStrategyFocus,
  extractWalletsWithAi,
  normalizeWeatherSignals
} from "./wallet-ai";
import {
  resolveWalletListQuery,
  sanitizeWalletSavedViewQuery,
  toWalletListDataQuery
} from "./wallets-query";
import {
  parseWalletImportText,
  splitLabelsText,
  type WalletImportPreview
} from "./wallet-import";

interface PersistedAlertContext {
  wallets: Wallet[];
  alertItems: AlertListItem[];
}

interface PersistedWalletContext extends PersistedAlertContext {
  walletRows: WalletTableRow[];
  labelsByWalletId: Map<string, WalletLabel[]>;
}

export interface WalletImportCommitResult {
  createdCount: number;
  updatedCount: number;
  failedRows: Array<{ rowNumber: number; displayName: string; reason: string }>;
  importBatch?: WalletImportBatch;
}

export interface WalletImportBatchSummary {
  batch: WalletImportBatch;
  sourceLabel: string;
  walletCount: number;
  activeCount: number;
  reviewNeededCount: number;
  deletedCount: number;
  watchlistedCount: number;
  officialLabelCount: number;
  aiLabelCount: number;
  promotedLabels: string[];
  workflow: WalletImportWorkflowSummary;
}

export interface WalletImportOverview {
  totalBatches: number;
  finderBatches: number;
  pendingReviewWallets: number;
  importedRows7d: number;
  failedRows7d: number;
  promotedLabels7d: number;
}

export interface WalletImportWorkflowSummary {
  finderCandidates: number;
  structuredRows: number;
  reviewQueue: number;
  approvedWallets: number;
  promotedLabels: number;
}

export interface WalletImportBatchDetail extends WalletImportBatchSummary {
  latestReviewAt?: string;
  reviewActors: string[];
}

export interface WalletImportsPageData {
  overview: WalletImportOverview;
  batches: WalletImportBatchSummary[];
  selectedBatch: WalletImportBatchDetail | null;
  selectedBatchRows: WalletAdminRow[];
}

const demoSavedViews: WalletSavedView[] = [];
const SCHEMA_READY = new Map<string, Promise<void>>();
const MAX_IMPORT_ALIAS_LENGTH = 18;
const MAX_IMPORT_SUMMARY_LENGTH = 84;
const MAX_IMPORT_NOTE_LENGTH = 320;
const MAX_IMPORT_EXCERPT_LENGTH = 320;
const compactImportText = (value: string | null | undefined) =>
  (value ?? "").replace(/\s+/g, " ").trim();

const truncateImportText = (value: string, maxLength: number) =>
  value.length <= maxLength ? value : `${value.slice(0, maxLength - 3).trimEnd()}...`;

const isWalletAiPreviewRow = (
  row: WalletImportPreviewRow
): row is WalletAiExtractPreviewRow => "signalQuality" in row && "weatherSignals" in row;

const normalizeImportLabelDrafts = (labels: WalletImportPreviewRow["labels"]) => {
  const deduped = new Map<string, WalletImportPreviewRow["labels"][number]>();

  labels.forEach((label) => {
    const name = compactImportText(label.name);
    const value = truncateImportText(compactImportText(label.value), 24);
    if (!name || !value) {
      return;
    }

    const kind = label.kind ?? "strategy";
    const key = getWalletLabelDisplayKey(kind, value);
    const nextLabel = {
      ...label,
      kind,
      name,
      value
    };
    const existing = deduped.get(key);
    if (!existing || (label.source ?? "system") === "user") {
      deduped.set(key, nextLabel);
    }
  });

  return Array.from(deduped.values());
};

const sanitizeWalletImportRowForCommit = (
  row: WalletImportPreviewRow
): WalletImportPreviewRow | WalletAiExtractPreviewRow => {
  const baseWallet = {
    ...row.wallet,
    address: compactImportText(row.wallet.address),
    displayName: compactImportText(row.wallet.displayName),
    alias: undefined as string | undefined,
    bio: compactImportText(row.wallet.bio) || undefined,
    strategyFocus: compactImportText(row.wallet.strategyFocus) || undefined,
    teamNote: compactImportText(row.wallet.teamNote) || undefined,
    firstSeenAt: compactImportText(row.wallet.firstSeenAt) || undefined
  };

  const sourceExcerpt = compactImportText(row.sourceExcerpt)
    ? truncateImportText(compactImportText(row.sourceExcerpt), MAX_IMPORT_EXCERPT_LENGTH)
    : undefined;
  const fallbackAlias = compactImportText(row.wallet.alias);

  if (fallbackAlias && fallbackAlias.length <= MAX_IMPORT_ALIAS_LENGTH) {
    baseWallet.alias = fallbackAlias;
  }

  if (baseWallet.strategyFocus) {
    baseWallet.strategyFocus = truncateImportText(baseWallet.strategyFocus, MAX_IMPORT_SUMMARY_LENGTH);
  }

  if (baseWallet.teamNote) {
    baseWallet.teamNote = truncateImportText(baseWallet.teamNote, MAX_IMPORT_NOTE_LENGTH);
  }

  if (baseWallet.bio) {
    baseWallet.bio = truncateImportText(baseWallet.bio, 600);
  }

  const baseRow = {
    ...row,
    wallet: baseWallet,
    labels: normalizeImportLabelDrafts(row.labels),
    note: compactImportText(row.note)
      ? truncateImportText(compactImportText(row.note), MAX_IMPORT_NOTE_LENGTH)
      : undefined,
    watchlistNote: compactImportText(row.watchlistNote)
      ? truncateImportText(compactImportText(row.watchlistNote), 120)
      : undefined,
    sourceExcerpt
  };

  if (!isWalletAiPreviewRow(row)) {
    return baseRow;
  }

  const weatherSignals = normalizeWeatherSignals(row.weatherSignals);
  const signalQuality = row.signalQuality;
  const mergedLabels = normalizeImportLabelDrafts([
    ...baseRow.labels,
    ...buildWeatherLabels(weatherSignals, signalQuality)
  ]);

  if (!normalizeAddress(baseWallet.address)) {
    throw new Error("缺少有效地址");
  }

  if (!baseWallet.displayName) {
    throw new Error("缺少显示名");
  }

  return {
    ...baseRow,
    wallet: {
      ...baseRow.wallet,
      alias:
        baseRow.wallet.alias && baseRow.wallet.alias.length <= MAX_IMPORT_ALIAS_LENGTH
          ? baseRow.wallet.alias
          : undefined,
      strategyFocus:
        compactImportText(baseRow.wallet.strategyFocus) ||
        buildWeatherStrategyFocus(weatherSignals, baseRow.wallet.strategyFocus) ||
        undefined
    },
    labels: mergedLabels,
    watchlistNote: compactImportText(baseRow.watchlistNote) ? baseRow.watchlistNote : undefined,
    signalQuality,
    weatherSignals,
    highlightTags: row.highlightTags,
    keyMetrics: row.keyMetrics,
    primarySignals: row.primarySignals
  };
};

const resolveImportCurationStatus = (row: WalletImportPreviewRow): Wallet["curationStatus"] => {
  if (isWalletAiPreviewRow(row)) {
    return "review_needed";
  }

  return row.warnings.length > 0 ? "review_needed" : "active";
};

const ensurePersistedBindings = async (): Promise<SmartMoneyBindings | null> => {
  const bindings = await getSmartMoneyBindings();
  if (!bindings?.SMART_MONEY_DB) {
    return bindings;
  }

  const scopeKey = [
    bindings.ADMIN_BASE_URL ?? "admin",
    bindings.PUBLIC_EXTENSION_BASE_URL ?? "app"
  ].join("|");

  if (!SCHEMA_READY.has(scopeKey)) {
    const ready = (async () => {
      await bootstrapSmartMoneyDb(bindings.SMART_MONEY_DB!);
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

  return bindings;
};

const groupByWalletId = <T extends { walletId: string }>(items: T[]) => {
  const map = new Map<string, T[]>();
  items.forEach((item) => {
    const current = map.get(item.walletId) ?? [];
    current.push(item);
    map.set(item.walletId, current);
  });
  return map;
};

const buildOpenAlertCountByWalletId = (alertItems: AlertListItem[]) => {
  const map = new Map<string, number>();
  alertItems.forEach((item) => {
    if (item.alert.status !== "open") {
      return;
    }

    map.set(item.wallet.id, (map.get(item.wallet.id) ?? 0) + 1);
  });
  return map;
};

const buildLatestTradeByWalletId = () => {
  const map = new Map<string, (typeof seedTrades)[number]>();
  seedTrades.forEach((trade) => {
    const current = map.get(trade.walletId);
    if (!current || Date.parse(trade.enteredAt) > Date.parse(current.enteredAt)) {
      map.set(trade.walletId, trade);
    }
  });
  return map;
};

const buildPersistedAlertItems = (wallets: Wallet[]): AlertListItem[] => {
  const alerts = generateAlertEvents(wallets, seedTrades, seedPositions);
  const walletById = new Map(wallets.map((wallet) => [wallet.id, wallet]));

  return alerts
    .map((alert) => {
      const wallet = walletById.get(alert.walletId);
      if (!wallet) {
        return null;
      }

      const market = seedMarkets.find((item) => item.id === alert.marketId);
      return {
        alert,
        wallet,
        market,
        eventLabel: ALERT_EVENT_META[alert.eventType].label,
        eventDescription: ALERT_EVENT_META[alert.eventType].description
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null)
    .sort((left, right) => right.alert.alertScore - left.alert.alertScore);
};

const latestTradeByWalletId = buildLatestTradeByWalletId();

const getWalletSourceShortLabel = (sourceType: WalletSourceType) =>
  sourceType === "manual"
    ? "手动"
    : sourceType === "finder"
      ? "Finder"
      : sourceType === "ai"
        ? "AI"
        : sourceType === "file"
          ? "文件"
          : "系统";

const getWalletSourceLabel = (sourceType: WalletSourceType) =>
  sourceType === "manual"
    ? "手动录入"
    : sourceType === "finder"
      ? "Finder 导入"
      : sourceType === "ai"
        ? "AI 导入"
        : sourceType === "file"
        ? "文件导入"
        : "系统内置";

const isFinderImportBatch = (batch?: WalletImportBatch) =>
  batch?.sourceType === "finder" || batch?.sourceName?.toLowerCase().includes("finder") === true;

const getImportBatchSourceLabel = (batch: WalletImportBatch) =>
  isFinderImportBatch(batch) ? "Finder 导入" : getWalletSourceLabel(batch.sourceType);

const buildWalletAdminSourceMeta = (
  wallet: Wallet,
  importBatch?: WalletImportBatch
): WalletAdminRow["sourceMeta"] => ({
  type: wallet.sourceType,
  label:
    isFinderImportBatch(importBatch)
      ? importBatch?.sourceName
        ? `Finder / ${importBatch.sourceName}`
        : "Finder 导入"
      : getWalletSourceLabel(wallet.sourceType),
  importedAt: wallet.lastImportedAt,
  importBatchId: wallet.importBatchId,
  sourceName: importBatch?.sourceName,
  provider: importBatch?.provider,
  model: importBatch?.model,
  fallbackUsed: importBatch?.fallbackUsed,
  batchCreatedAt: importBatch?.createdAt
});

const buildHighlightBadges = (wallet: Wallet, labels: WalletLabel[]): AddressLabelBadge[] => {
  const preferredLabels = labels.filter(
    (label) =>
      label.kind !== "signal_quality" &&
      label.kind !== "market_scope" &&
      label.kind !== "confidence"
  );

  return sortAddressBadges(
    preferredLabels.map((label, index) => ({
      id: `${wallet.id}-${label.id}-${index}`,
      text: label.value || label.name,
      tone:
        label.source === "user"
          ? "accent"
          : label.kind === "activity_level" && label.value.includes("正常")
            ? "watch"
            : "neutral",
      kind: label.kind,
      priority: getLabelKindPriority(label.kind) + (label.source === "user" ? 2000 : 0),
      detailText: label.name,
      metricText: label.evidence,
      isPrimary: isPrimarySignalLabelKind(label.kind)
    }))
  ).slice(0, 2);
};

const buildSummaryText = (wallet: Wallet) =>
  wallet.strategyFocus || wallet.teamNote || wallet.bio || "待补充摘要";
const buildStatusBadges = (wallet: Wallet): WalletStatusBadge[] => {
  const badges: WalletStatusBadge[] = [];

  if (wallet.watchlisted) {
    badges.push({
      id: `${wallet.id}-watchlisted`,
      text: "Watchlist",
      tone: "watch"
    });
  }

  if (wallet.deletedAt) {
    badges.push({
      id: `${wallet.id}-deleted`,
      text: "已删除",
      tone: "danger"
    });
  } else if (wallet.curationStatus === "review_needed") {
    badges.push({
      id: `${wallet.id}-review`,
      text: "AI 待确认",
      tone: "ai-review"
    });
  }

  badges.push({
    id: `${wallet.id}-${wallet.sourceType}`,
    text: getWalletSourceShortLabel(wallet.sourceType),
    tone: "neutral"
  });

  return badges;
};

const buildWalletAdminSummaryText = (wallet: Wallet) =>
  buildSummaryText(wallet);
const buildWalletAdminStatusBadges = (wallet: Wallet): WalletStatusBadge[] => {
  const badges: WalletStatusBadge[] = [];

  if (wallet.watchlisted) {
    badges.push({
      id: `${wallet.id}-watchlisted`,
      text: "Watchlist",
      tone: "watch"
    });
  }

  if (wallet.deletedAt) {
    badges.push({
      id: `${wallet.id}-deleted`,
      text: "已删除",
      tone: "danger"
    });
  } else if (wallet.curationStatus === "review_needed") {
    badges.push({
      id: `${wallet.id}-review`,
      text: "AI 待确认",
      tone: "ai-review"
    });
  }

  badges.push({
    id: `${wallet.id}-${wallet.sourceType}`,
    text: getWalletSourceShortLabel(wallet.sourceType),
    tone: "neutral"
  });

  return badges;
};

const buildWalletAdminRow = (
  row: WalletTableRow,
  importBatch?: WalletImportBatch
): WalletAdminRow => ({
  wallet: row.wallet,
  labels: row.labels,
  highlights: buildHighlightBadges(row.wallet, row.labels),
  summaryText: buildWalletAdminSummaryText(row.wallet),
  statusBadges: buildWalletAdminStatusBadges(row.wallet),
  sourceMeta: buildWalletAdminSourceMeta(row.wallet, importBatch),
  lastActivityAt: row.wallet.updatedAt
});

const buildPersistedAlertContextUncached = async (
  filters?: WalletListFilters
): Promise<PersistedAlertContext | null> => {
  const bindings = await ensurePersistedBindings();
  if (!bindings?.SMART_MONEY_DB) {
    return null;
  }

  const wallets = await listPersistedWallets(bindings.SMART_MONEY_DB, filters);
  return {
    wallets,
    alertItems: buildPersistedAlertItems(wallets)
  };
};

const getPersistedAlertContext = cache(async () => buildPersistedAlertContextUncached());

const buildPersistedAlertContext = async (
  filters?: WalletListFilters
): Promise<PersistedAlertContext | null> =>
  filters ? buildPersistedAlertContextUncached(filters) : getPersistedAlertContext();

const buildPersistedContextUncached = async (
  filters?: WalletListFilters
): Promise<PersistedWalletContext | null> => {
  const persisted = await buildPersistedAlertContext(filters);
  const bindings = await ensurePersistedBindings();
  if (!persisted || !bindings?.SMART_MONEY_DB) {
    return null;
  }

  const walletIds = persisted.wallets.map((wallet) => wallet.id);
  const userLabelsByWalletId = await listWalletLabelsByWalletIds(bindings.SMART_MONEY_DB, walletIds);
  const allUserLabels = Array.from(userLabelsByWalletId.values()).flat();
  const allLabels = deriveSystemLabels(persisted.wallets, allUserLabels, seedTrades);
  const labelsByWalletId = groupByWalletId(allLabels);
  const openAlertCountByWalletId = buildOpenAlertCountByWalletId(persisted.alertItems);

  const walletRows = persisted.wallets
    .map((wallet) => ({
      wallet,
      metrics: computeWalletMetrics(wallet, seedTrades),
      labels: labelsByWalletId.get(wallet.id) ?? [],
      activeAlertCount: openAlertCountByWalletId.get(wallet.id) ?? 0,
      latestTrade: latestTradeByWalletId.get(wallet.id)
    }))
    .sort((left, right) => {
      if (left.wallet.watchlisted !== right.wallet.watchlisted) {
        return left.wallet.watchlisted ? -1 : 1;
      }
      return right.metrics.totalRealizedPnlUsd - left.metrics.totalRealizedPnlUsd;
    });

  return {
    ...persisted,
    walletRows,
    labelsByWalletId
  };
};

const getPersistedContext = cache(async () => buildPersistedContextUncached());

const buildPersistedContext = async (filters?: WalletListFilters): Promise<PersistedWalletContext | null> =>
  filters ? buildPersistedContextUncached(filters) : getPersistedContext();

const getImportBatchMapForWallets = async (
  db: NonNullable<SmartMoneyBindings["SMART_MONEY_DB"]>,
  wallets: Wallet[]
) => {
  const batchIds = Array.from(
    new Set(wallets.map((wallet) => wallet.importBatchId).filter((value): value is string => Boolean(value)))
  );

  return listWalletImportBatchesByIds(db, batchIds);
};

const mapWalletRowsToAdminRows = (
  walletRows: WalletTableRow[],
  importBatchesById?: Map<string, WalletImportBatch>
): WalletAdminRow[] =>
  walletRows.map((row) =>
    buildWalletAdminRow(
      row,
      row.wallet.importBatchId ? importBatchesById?.get(row.wallet.importBatchId) : undefined
    )
  );

const createManualWalletInput = (payload: WalletManualCreateInput): WalletInput => ({
  address: payload.address,
  displayName: payload.displayName,
  alias: payload.alias?.trim() || undefined,
  bio: "",
  strategyFocus: "",
  teamNote: payload.teamNote?.trim() || undefined,
  sourceType: "manual",
  curationStatus: "active"
});

const createImportWalletPayload = (
  row: WalletImportPreviewRow,
  input: {
    sourceType: WalletSourceType;
    curationStatus: Wallet["curationStatus"];
    importBatchId?: string;
    importedAt: string;
  }
): WalletInput => ({
  address: row.wallet.address,
  displayName: row.wallet.displayName,
  alias: row.wallet.alias,
  bio: row.wallet.bio,
  strategyFocus: row.wallet.strategyFocus,
  teamNote: row.wallet.teamNote,
  firstSeenAt: row.wallet.firstSeenAt,
  sourceType: input.sourceType,
  curationStatus: input.curationStatus,
  importBatchId: input.importBatchId,
  lastImportedAt: input.importedAt
});

const createPreservedImportWalletUpdate = (
  existing: Wallet,
  row: WalletImportPreviewRow,
  input: {
    sourceType: WalletSourceType;
    curationStatus: Wallet["curationStatus"];
    importBatchId?: string;
    importedAt: string;
  }
): WalletUpdate => ({
  address: row.wallet.address || existing.address,
  displayName: existing.displayName || row.wallet.displayName,
  alias: existing.alias ?? row.wallet.alias,
  bio: existing.bio || row.wallet.bio,
  strategyFocus: existing.strategyFocus || row.wallet.strategyFocus,
  teamNote: existing.teamNote ?? row.wallet.teamNote,
  firstSeenAt: existing.firstSeenAt || row.wallet.firstSeenAt,
  sourceType: input.sourceType,
  curationStatus: input.curationStatus,
  lastImportedAt: input.importedAt,
  importBatchId: input.importBatchId
});

const getWalletImportDisplayName = (row: WalletImportPreviewRow) =>
  row.wallet.alias || row.wallet.displayName || row.wallet.address;

const clampLimit = (value?: number) => {
  if (!value || Number.isNaN(value)) {
    return 100;
  }

  return Math.max(1, Math.min(200, Math.trunc(value)));
};

const decodeCursorOffset = (cursor?: string) => {
  const offset = Number.parseInt(cursor ?? "", 10);
  return Number.isFinite(offset) && offset >= 0 ? offset : 0;
};

const buildDemoFacetSummary = (rows: WalletAdminRow[]): WalletFacetSummary => ({
  totalCount: rows.filter((row) => !row.wallet.deletedAt).length,
  activeCount: rows.filter(
    (row) => !row.wallet.deletedAt && row.wallet.curationStatus === "active"
  ).length,
  deletedCount: rows.filter((row) => Boolean(row.wallet.deletedAt)).length,
  watchlistedCount: rows.filter((row) => row.wallet.watchlisted && !row.wallet.deletedAt).length,
  reviewNeededCount: rows.filter(
    (row) => !row.wallet.deletedAt && row.wallet.curationStatus === "review_needed"
  ).length,
  sourceCounts: {
    manual: rows.filter((row) => !row.wallet.deletedAt && row.wallet.sourceType === "manual").length,
    finder: rows.filter((row) => !row.wallet.deletedAt && row.wallet.sourceType === "finder").length,
    ai: rows.filter((row) => !row.wallet.deletedAt && row.wallet.sourceType === "ai").length,
    file: rows.filter((row) => !row.wallet.deletedAt && row.wallet.sourceType === "file").length,
    system: rows.filter((row) => !row.wallet.deletedAt && row.wallet.sourceType === "system").length
  },
  labelCounts: Array.from(
    rows
      .filter((row) => !row.wallet.deletedAt)
      .flatMap((row) => row.highlights.filter((badge) => badge.tone !== "watch").map((badge) => badge.text))
      .reduce((map, label) => {
        map.set(label, (map.get(label) ?? 0) + 1);
        return map;
      }, new Map<string, number>())
  )
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0], "zh-CN"))
    .slice(0, 12)
    .map(([label, count]) => ({ key: label, label, count }))
});

const applyWalletListQuery = (
  rows: WalletAdminRow[],
  query?: WalletListQuery
) => {
  const normalizedQuery = query?.q?.trim().toLowerCase();
  const labels = new Set((query?.labels ?? []).map((item) => item.trim().toLowerCase()).filter(Boolean));
  const filtered = rows.filter((row) => {
    if (!query?.includeDeleted && row.wallet.deletedAt) {
      return false;
    }

    if (query?.status === "deleted") {
      if (!row.wallet.deletedAt) {
        return false;
      }
    } else if (query?.status === "watchlist" && !row.wallet.watchlisted) {
      return false;
    } else if (query?.status === "review_needed" && row.wallet.curationStatus !== "review_needed") {
      return false;
    } else if (query?.status === "active" && row.wallet.curationStatus !== "active") {
      return false;
    }

    if (query?.source && query.source !== "all" && row.wallet.sourceType !== query.source) {
      return false;
    }

    if (query?.batch && row.wallet.importBatchId !== query.batch) {
      return false;
    }

    if (query?.createdAfter && row.wallet.createdAt < query.createdAfter) {
      return false;
    }

    if (query?.createdBefore && row.wallet.createdAt > query.createdBefore) {
      return false;
    }

    if (labels.size > 0) {
      const labelSet = new Set(
        row.labels.map((label) => label.value.trim().toLowerCase()).filter(Boolean)
      );
      for (const label of labels) {
        if (!labelSet.has(label)) {
          return false;
        }
      }
    }

    if (!normalizedQuery) {
      return true;
    }

    return [
      row.wallet.address,
      row.wallet.normalizedAddress,
      row.wallet.displayName,
      row.wallet.alias,
      row.summaryText,
      ...row.highlights.map((badge) => badge.text),
      ...row.labels.map((label) => `${label.name} ${label.value}`)
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .includes(normalizedQuery);
  });

  const sort = query?.sort ?? "updated_desc";
  filtered.sort((left, right) => {
    if (sort === "created_desc") {
      return new Date(right.wallet.createdAt).getTime() - new Date(left.wallet.createdAt).getTime();
    }

    if (sort === "name_asc") {
      return (left.wallet.alias ?? left.wallet.displayName).localeCompare(
        right.wallet.alias ?? right.wallet.displayName,
        "zh-CN"
      );
    }

    return new Date(right.lastActivityAt).getTime() - new Date(left.lastActivityAt).getTime();
  });

  return filtered;
};

export const getDashboardData = async (): Promise<DashboardData> => {
  const persisted = await buildPersistedContext();
  if (!persisted) {
    return getDemoDashboardData();
  }

  return {
    summary: computeDashboardSummary(
      persisted.wallets,
      persisted.alertItems.filter((item) => item.alert.status === "open").length
    ),
    markets: computeMarketDigests(persisted.wallets, seedMarkets, seedTrades),
    walletRows: persisted.walletRows,
    alerts: persisted.alertItems,
    spotlightWallets: persisted.walletRows.slice(0, 3)
  };
};

export const listWalletRows = async (): Promise<WalletTableRow[]> => {
  const persisted = await buildPersistedContext();
  return persisted?.walletRows ?? listDemoWalletRows();
};

export const listWalletAdminRows = async (
  filters?: WalletListFilters
): Promise<WalletAdminRow[]> => {
  const persisted = await buildPersistedContext(filters);
  if (!persisted) {
    return mapWalletRowsToAdminRows(listDemoWalletRows());
  }

  const bindings = await ensurePersistedBindings();
  const importBatchesById = bindings?.SMART_MONEY_DB
    ? await getImportBatchMapForWallets(bindings.SMART_MONEY_DB, persisted.wallets)
    : undefined;

  return mapWalletRowsToAdminRows(persisted.walletRows, importBatchesById);
};

export const listWalletAdminRowsPage = async (
  query?: Partial<WalletListQuery>
): Promise<WalletListResponse> => {
  const bindings = await ensurePersistedBindings();
  if (!bindings?.SMART_MONEY_DB) {
    const allRows = mapWalletRowsToAdminRows(listDemoWalletRows());
    const filtered = applyWalletListQuery(allRows, query);
    const limit = clampLimit(query?.limit);
    const offset = decodeCursorOffset(query?.cursor);
    const items = filtered.slice(offset, offset + limit);
    const nextCursor = offset + items.length < filtered.length ? String(offset + items.length) : undefined;

    return {
      items,
      nextCursor,
      totalCount: filtered.length,
      facetCounts: buildDemoFacetSummary(allRows),
      savedView: query?.view ? demoSavedViews.find((view) => view.id === query.view) ?? null : null,
      pageMeta: {
        limit,
        cursor: query?.cursor,
        returnedCount: items.length,
        sort: query?.sort ?? "updated_desc"
      }
    };
  }

  const savedView = query?.view
    ? await getPersistedWalletSavedViewById(bindings.SMART_MONEY_DB, query.view)
    : null;
  const mergedQuery = toWalletListDataQuery(resolveWalletListQuery(query, savedView?.query));
  const page = await listPersistedWalletPage(bindings.SMART_MONEY_DB, {
    q: mergedQuery.q,
    includeDeleted: mergedQuery.includeDeleted,
    createdAfter: mergedQuery.createdAfter,
    createdBefore: mergedQuery.createdBefore,
    labels: mergedQuery.labels,
    source: mergedQuery.source,
    batch: mergedQuery.batch,
    status: mergedQuery.status,
    sort: mergedQuery.sort,
    limit: mergedQuery.limit,
    cursor: mergedQuery.cursor
  });
  const walletIds = page.wallets.map((wallet) => wallet.id);
  const userLabelsByWalletId = await listWalletLabelsByWalletIds(bindings.SMART_MONEY_DB, walletIds);
  const importBatchesById = await getImportBatchMapForWallets(bindings.SMART_MONEY_DB, page.wallets);
  const allUserLabels = Array.from(userLabelsByWalletId.values()).flat();
  const allLabels = deriveSystemLabels(page.wallets, allUserLabels, seedTrades);
  const labelsByWalletId = groupByWalletId(allLabels);
  const rows = page.wallets.map((wallet) =>
    buildWalletAdminRow(
      {
        wallet,
        metrics: computeWalletMetrics(wallet, seedTrades),
        labels: labelsByWalletId.get(wallet.id) ?? [],
        activeAlertCount: 0
      },
      wallet.importBatchId ? importBatchesById.get(wallet.importBatchId) : undefined
    )
  );

  return {
    items: rows,
    nextCursor: page.nextCursor,
    totalCount: page.totalCount,
    facetCounts: await getPersistedWalletFacetSummary(bindings.SMART_MONEY_DB, {
      q: mergedQuery.q,
      includeDeleted: mergedQuery.includeDeleted,
      createdAfter: mergedQuery.createdAfter,
      createdBefore: mergedQuery.createdBefore,
      labels: mergedQuery.labels,
      source: mergedQuery.source,
      batch: mergedQuery.batch,
      status: mergedQuery.status
    }),
    savedView,
    pageMeta: page.pageMeta
  };
};

export const getWalletFacetSummary = async (query?: WalletListQuery): Promise<WalletFacetSummary> => {
  const bindings = await ensurePersistedBindings();
  if (!bindings?.SMART_MONEY_DB) {
    return buildDemoFacetSummary(mapWalletRowsToAdminRows(listDemoWalletRows()));
  }

  const normalizedQuery = toWalletListDataQuery(query);

  return getPersistedWalletFacetSummary(bindings.SMART_MONEY_DB, {
    q: normalizedQuery.q,
    includeDeleted: normalizedQuery.includeDeleted,
    createdAfter: normalizedQuery.createdAfter,
    createdBefore: normalizedQuery.createdBefore,
    labels: normalizedQuery.labels,
    source: normalizedQuery.source,
    batch: normalizedQuery.batch,
    status: normalizedQuery.status
  });
};

export const listWalletSavedViews = async (): Promise<WalletSavedView[]> => {
  const bindings = await ensurePersistedBindings();
  if (!bindings?.SMART_MONEY_DB) {
    return [...demoSavedViews];
  }

  return listPersistedWalletSavedViews(bindings.SMART_MONEY_DB);
};

const buildWalletImportBatchSummaries = async (
  db: NonNullable<SmartMoneyBindings["SMART_MONEY_DB"]>,
  batches: WalletImportBatch[]
): Promise<WalletImportBatchSummary[]> => {
  const batchIds = batches.map((batch) => batch.id);
  const wallets = await listWalletsByImportBatchIds(db, batchIds);
  const walletsByBatchId = wallets.reduce((map, wallet) => {
    if (!wallet.importBatchId) {
      return map;
    }

    const current = map.get(wallet.importBatchId) ?? [];
    current.push(wallet);
    map.set(wallet.importBatchId, current);
    return map;
  }, new Map<string, Wallet[]>());
  const walletIds = wallets.map((wallet) => wallet.id);
  const labelsByWalletId = await listWalletLabelsByWalletIds(db, walletIds);

  return batches.map((batch) => {
    const batchWallets = walletsByBatchId.get(batch.id) ?? [];
    const labelCounts = new Map<string, number>();
    let officialLabelCount = 0;
    let aiLabelCount = 0;

    batchWallets.forEach((wallet) => {
      const labels = labelsByWalletId.get(wallet.id) ?? [];
      labels.forEach((label) => {
        if (label.source === "user") {
          officialLabelCount += 1;
          const labelValue = label.value || label.name;
          labelCounts.set(labelValue, (labelCounts.get(labelValue) ?? 0) + 1);
        } else {
          aiLabelCount += 1;
        }
      });
    });

    const activeCount = batchWallets.filter((wallet) => wallet.curationStatus === "active" && !wallet.deletedAt)
      .length;
    const reviewNeededCount = batchWallets.filter(
      (wallet) => wallet.curationStatus === "review_needed" && !wallet.deletedAt
    ).length;
    const deletedCount = batchWallets.filter((wallet) => Boolean(wallet.deletedAt)).length;
    const watchlistedCount = batchWallets.filter((wallet) => wallet.watchlisted && !wallet.deletedAt).length;
    const structuredRows = Math.max(0, batch.rowCount - batch.failedCount);

    return {
      batch,
      sourceLabel: getImportBatchSourceLabel(batch),
      walletCount: batchWallets.length,
      activeCount,
      reviewNeededCount,
      deletedCount,
      watchlistedCount,
      officialLabelCount,
      aiLabelCount,
      promotedLabels: Array.from(labelCounts.entries())
        .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0], "zh-CN"))
        .slice(0, 6)
        .map(([label]) => label),
      workflow: {
        finderCandidates: isFinderImportBatch(batch) ? batch.rowCount : 0,
        structuredRows,
        reviewQueue: reviewNeededCount,
        approvedWallets: activeCount,
        promotedLabels: officialLabelCount
      }
    } satisfies WalletImportBatchSummary;
  });
};

const buildWalletImportBatchDetail = async (
  db: NonNullable<SmartMoneyBindings["SMART_MONEY_DB"]>,
  summary: WalletImportBatchSummary
): Promise<WalletImportBatchDetail> => {
  const wallets = await listWalletsByImportBatchIds(db, [summary.batch.id]);
  const auditLogsByWalletId = await listWalletAuditLogsByWalletIds(
    db,
    wallets.map((wallet) => wallet.id)
  );
  const reviewLogs = Array.from(auditLogsByWalletId.values())
    .flat()
    .filter((log) =>
      ["create_user_tag", "update_wallet", "create_note", "resolve_alert"].includes(log.action)
    )
    .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));

  return {
    ...summary,
    latestReviewAt: reviewLogs[0]?.createdAt,
    reviewActors: Array.from(new Set(reviewLogs.map((log) => log.actor).filter(Boolean))).slice(0, 8)
  };
};

export const getWalletImportsPageData = async (
  selectedBatchId?: string
): Promise<WalletImportsPageData> => {
  const bindings = await ensurePersistedBindings();
  if (!bindings?.SMART_MONEY_DB) {
    return {
      overview: {
        totalBatches: 0,
        finderBatches: 0,
        pendingReviewWallets: 0,
        importedRows7d: 0,
        failedRows7d: 0,
        promotedLabels7d: 0
      },
      batches: [],
      selectedBatch: null,
      selectedBatchRows: []
    };
  }

  const requestedBatchId = selectedBatchId?.trim();
  const [recentBatches, selectedBatchRecord, reviewFacet] = await Promise.all([
    listPersistedWalletImportBatches(bindings.SMART_MONEY_DB, { limit: 18 }),
    requestedBatchId
      ? getPersistedWalletImportBatchById(bindings.SMART_MONEY_DB, requestedBatchId)
      : Promise.resolve(null),
    getPersistedWalletFacetSummary(bindings.SMART_MONEY_DB, { status: "review_needed" })
  ]);
  const batchList = [...recentBatches];
  if (selectedBatchRecord && !batchList.some((batch) => batch.id === selectedBatchRecord.id)) {
    batchList.unshift(selectedBatchRecord);
  }

  const summaries = await buildWalletImportBatchSummaries(bindings.SMART_MONEY_DB, batchList);
  const selectedSummary =
    requestedBatchId
      ? summaries.find((summary) => summary.batch.id === selectedBatchRecord?.id) ?? null
      : summaries.find((summary) => isFinderImportBatch(summary.batch)) ?? summaries[0] ?? null;
  const selectedBatch = selectedSummary
    ? await buildWalletImportBatchDetail(bindings.SMART_MONEY_DB, selectedSummary)
    : null;
  const selectedBatchPage = selectedBatch
    ? await listWalletAdminRowsPage({
        batch: selectedBatch.batch.id,
        limit: 12,
        sort: "updated_desc",
        includeDeleted: true
      })
    : null;

  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1_000;
  const recentWindowSummaries = summaries.filter(
    (summary) => Date.parse(summary.batch.createdAt) >= sevenDaysAgo
  );

  return {
    overview: {
      totalBatches: summaries.length,
      finderBatches: summaries.filter((summary) => isFinderImportBatch(summary.batch)).length,
      pendingReviewWallets: reviewFacet.reviewNeededCount,
      importedRows7d: recentWindowSummaries.reduce((total, summary) => total + summary.batch.rowCount, 0),
      failedRows7d: recentWindowSummaries.reduce(
        (total, summary) => total + summary.batch.failedCount,
        0
      ),
      promotedLabels7d: recentWindowSummaries.reduce(
        (total, summary) => total + summary.officialLabelCount,
        0
      )
    },
    batches: summaries,
    selectedBatch,
    selectedBatchRows: selectedBatchPage?.items ?? []
  };
};

export const createWalletSavedView = async (input: {
  name: string;
  query: WalletSavedView["query"];
}) => {
  const sanitizedQuery = sanitizeWalletSavedViewQuery(input.query);
  const bindings = await ensurePersistedBindings();
  if (!bindings?.SMART_MONEY_DB) {
    const record: WalletSavedView = {
      id: crypto.randomUUID(),
      name: input.name.trim(),
      scope: "team",
      query: sanitizedQuery,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    demoSavedViews.unshift(record);
    return record;
  }

  return createPersistedWalletSavedView(bindings.SMART_MONEY_DB, {
    ...input,
    query: sanitizedQuery
  });
};

export const updateWalletSavedView = async (
  viewId: string,
  input: {
    name?: string;
    query?: WalletSavedView["query"];
  }
) => {
  const sanitizedQuery = input.query ? sanitizeWalletSavedViewQuery(input.query) : undefined;
  const bindings = await ensurePersistedBindings();
  if (!bindings?.SMART_MONEY_DB) {
    const existingView = demoSavedViews.find((view) => view.id === viewId);
    if (!existingView) {
      return null;
    }
    const next: WalletSavedView = {
      ...existingView,
      name: input.name?.trim() || existingView.name,
      query: sanitizedQuery ?? existingView.query,
      updatedAt: new Date().toISOString()
    };
    const index = demoSavedViews.findIndex((view) => view.id === viewId);
    demoSavedViews.splice(index, 1, next);
    return next;
  }

  return updatePersistedWalletSavedView(bindings.SMART_MONEY_DB, viewId, {
    ...input,
    query: sanitizedQuery
  });
};

export const deleteWalletSavedView = async (viewId: string) => {
  const bindings = await ensurePersistedBindings();
  if (!bindings?.SMART_MONEY_DB) {
    const index = demoSavedViews.findIndex((view) => view.id === viewId);
    if (index >= 0) {
      demoSavedViews.splice(index, 1);
    }
    return;
  }

  await deletePersistedWalletSavedView(bindings.SMART_MONEY_DB, viewId);
};

export const getWalletDetail = async (walletId: string): Promise<WalletDetailData | undefined> => {
  const bindings = await ensurePersistedBindings();
  const db = bindings?.SMART_MONEY_DB;

  if (!db) {
    return getDemoWalletDetail(walletId);
  }

  const wallet = await getPersistedWalletById(db, walletId, { includeDeleted: true });
  if (!wallet) {
    return undefined;
  }

  const [userLabelsByWalletId, auditLogsByWalletId, watchlistByWalletId] = await Promise.all([
    listWalletLabelsByWalletIds(db, [walletId]),
    listWalletAuditLogsByWalletIds(db, [walletId]),
    listWatchlistEntriesByWalletIds(db, [walletId])
  ]);

  const labels = deriveSystemLabels([wallet], userLabelsByWalletId.get(walletId) ?? [], seedTrades);
  const notes = auditLogsByWalletId.get(walletId) ?? [];
  const watchlistEntry = watchlistByWalletId.get(walletId);
  const alertItems = buildPersistedAlertItems([wallet]).filter((item) => item.wallet.id === walletId);

  return {
    wallet,
    metrics: computeWalletMetrics(wallet, seedTrades),
    labels,
    trades: seedTrades
      .filter((trade) => trade.walletId === walletId)
      .sort(
        (left, right) =>
          new Date(right.enteredAt).getTime() - new Date(left.enteredAt).getTime()
      ),
    positions: seedPositions
      .filter((position) => position.walletId === walletId)
      .sort(
        (left, right) =>
          new Date(right.capturedAt).getTime() - new Date(left.capturedAt).getTime()
      ),
    notes,
    alerts: alertItems,
    watchlistEntry
  };
};

export const getAlertItems = async (
  status: "open" | "resolved" | "all" = "all"
): Promise<AlertListItem[]> => {
  const persisted = await buildPersistedAlertContext();
  if (!persisted) {
    return listDemoAlerts(status);
  }

  return persisted.alertItems.filter((item) => (status === "all" ? true : item.alert.status === status));
};

export const getAlerts = async () => (await getAlertItems("all")).map((item) => item.alert);

export const getWalletList = async () => {
  const persisted = await buildPersistedContext();
  if (!persisted) {
    const alertItems = await getAlertItems("all");

    return (await listWalletRows()).map((row) => ({
      ...row,
      alerts: alertItems.filter((item) => item.wallet.id === row.wallet.id).map((item) => item.alert)
    }));
  }

  return persisted.walletRows.map((row) => ({
    ...row,
    alerts: persisted.alertItems
      .filter((item) => item.wallet.id === row.wallet.id)
      .map((item) => item.alert)
  }));
};

export const createWallet = async (payload: WalletInput, actor?: string) => {
  const bindings = await ensurePersistedBindings();
  if (!bindings?.SMART_MONEY_DB) {
    return createDemoWallet(payload);
  }

  return createPersistedWallet(bindings.SMART_MONEY_DB, payload, actor);
};

export const createManualWallet = async (payload: WalletManualCreateInput, actor?: string) => {
  const wallet = await createWallet(createManualWalletInput(payload), actor);
  if (!wallet) {
    throw new Error("wallet create failed");
  }

  for (const labelValue of splitLabelsText(payload.labelsText ?? "")) {
    await createUserTag(wallet.id, {
      name: "标签",
      value: labelValue,
      kind: "group"
    }, actor);
  }

  return wallet;
};

export const updateWallet = async (walletId: string, payload: WalletUpdate, actor?: string) => {
  const bindings = await ensurePersistedBindings();
  if (!bindings?.SMART_MONEY_DB) {
    return updateDemoWallet(walletId, payload);
  }

  return updatePersistedWallet(bindings.SMART_MONEY_DB, walletId, payload, actor);
};

export const deleteWallet = async (walletId: string, payload?: WalletDeleteInput) => {
  const bindings = await ensurePersistedBindings();
  if (!bindings?.SMART_MONEY_DB) {
    return softDeleteDemoWallet(walletId, payload);
  }

  return softDeletePersistedWallet(bindings.SMART_MONEY_DB, walletId, payload);
};

export const createWalletNote = async (walletId: string, content: string, actor?: string) => {
  const bindings = await ensurePersistedBindings();
  if (!bindings?.SMART_MONEY_DB) {
    return createDemoWalletNote(walletId, content, actor);
  }

  const wallet = await getPersistedWalletById(bindings.SMART_MONEY_DB, walletId, {
    includeDeleted: true
  });
  if (!wallet) {
    return undefined;
  }

  return createPersistedWalletNote(bindings.SMART_MONEY_DB, walletId, content, actor);
};

export const createUserTag = async (walletId: string, payload: WalletLabelInput, actor?: string) => {
  const bindings = await ensurePersistedBindings();
  if (!bindings?.SMART_MONEY_DB) {
    return createDemoUserTag(walletId, payload);
  }

  const wallet = await getPersistedWalletById(bindings.SMART_MONEY_DB, walletId, {
    includeDeleted: true
  });
  if (!wallet) {
    return undefined;
  }

  return createPersistedWalletLabel(bindings.SMART_MONEY_DB, walletId, payload, actor);
};

export const updateUserTag = async (
  walletId: string,
  tagId: string,
  payload: WalletLabelPatchInput,
  actor?: string
) => {
  const bindings = await ensurePersistedBindings();
  if (!bindings?.SMART_MONEY_DB) {
    return undefined;
  }

  const wallet = await getPersistedWalletById(bindings.SMART_MONEY_DB, walletId, {
    includeDeleted: true
  });
  if (!wallet) {
    return undefined;
  }

  return updatePersistedWalletLabel(bindings.SMART_MONEY_DB, walletId, tagId, payload, actor);
};

export const deleteUserTag = async (walletId: string, tagId: string, actor?: string) => {
  const bindings = await ensurePersistedBindings();
  if (!bindings?.SMART_MONEY_DB) {
    return undefined;
  }

  const wallet = await getPersistedWalletById(bindings.SMART_MONEY_DB, walletId, {
    includeDeleted: true
  });
  if (!wallet) {
    return undefined;
  }

  return deletePersistedWalletLabel(bindings.SMART_MONEY_DB, walletId, tagId, actor);
};

export type WalletReviewAction =
  | "promote_ai_to_official"
  | "edit_and_promote_ai_label"
  | "dismiss_ai_label"
  | "complete_wallet_review";

export interface WalletReviewActionInput {
  action: WalletReviewAction;
  labelId?: string;
  name?: string;
  value?: string;
  kind?: WalletLabel["kind"];
  evidence?: string;
  verificationNote?: string;
  sourceNote?: string;
}

const normalizeReviewField = (value: string | undefined) => {
  if (value === undefined) {
    return undefined;
  }

  const trimmed = compactImportText(value);
  return trimmed || undefined;
};

export const applyWalletReviewAction = async (
  walletId: string,
  input: WalletReviewActionInput,
  actor = "Team Alpha"
) => {
  const bindings = await ensurePersistedBindings();
  if (!bindings?.SMART_MONEY_DB) {
    throw new Error("review actions require persisted database");
  }

  const wallet = await getPersistedWalletById(bindings.SMART_MONEY_DB, walletId, {
    includeDeleted: true
  });
  if (!wallet) {
    return undefined;
  }

  const storedLabels = (await listWalletLabelsByWalletIds(bindings.SMART_MONEY_DB, [walletId])).get(walletId) ?? [];

  if (input.action === "complete_wallet_review") {
    await updatePersistedWallet(
      bindings.SMART_MONEY_DB,
      walletId,
      { curationStatus: "active" },
      actor
    );
    return getWalletDetail(walletId);
  }

  if (!input.labelId) {
    throw new Error("labelId is required");
  }

  const targetLabel = storedLabels.find((label) => label.id === input.labelId);
  if (!targetLabel) {
    throw new Error("tag not found");
  }

  if (targetLabel.source === "user") {
    throw new Error("only AI/system labels can enter review actions");
  }

  const nextName = normalizeReviewField(input.name) ?? targetLabel.name;
  const nextValue = normalizeReviewField(input.value) ?? targetLabel.value;
  const nextKind = input.kind ?? targetLabel.kind;
  const nextEvidence = normalizeReviewField(input.evidence) ?? targetLabel.evidence;
  const nextVerificationNote =
    normalizeReviewField(input.verificationNote) ?? targetLabel.verificationNote;
  const nextSourceNote = normalizeReviewField(input.sourceNote) ?? targetLabel.sourceNote;
  const dedupeKey = getWalletLabelDisplayKey(nextKind, nextValue);

  if (input.action === "dismiss_ai_label") {
    const duplicates = storedLabels.filter(
      (label) =>
        label.source !== "user" &&
        getWalletLabelDisplayKey(label.kind, label.value || label.name) ===
          getWalletLabelDisplayKey(targetLabel.kind, targetLabel.value || targetLabel.name)
    );
    for (const label of duplicates) {
      await deletePersistedWalletLabel(bindings.SMART_MONEY_DB, walletId, label.id, actor);
    }
    return getWalletDetail(walletId);
  }

  const existingOfficial = storedLabels.find(
    (label) =>
      label.source === "user" &&
      getWalletLabelDisplayKey(label.kind, label.value || label.name) === dedupeKey
  );

  if (existingOfficial) {
    await updatePersistedWalletLabel(
      bindings.SMART_MONEY_DB,
      walletId,
      existingOfficial.id,
      {
        name: nextName,
        value: nextValue,
        kind: nextKind,
        source: "user",
        evidence: nextEvidence,
        verificationNote: nextVerificationNote,
        sourceNote: nextSourceNote
      },
      actor
    );
  } else {
    await createPersistedWalletLabel(
      bindings.SMART_MONEY_DB,
      walletId,
      {
        name: nextName,
        value: nextValue,
        kind: nextKind,
        source: "user",
        evidence: nextEvidence,
        verificationNote: nextVerificationNote,
        sourceNote: nextSourceNote
      },
      actor
    );
  }

  const duplicateAiLabels = storedLabels.filter(
    (label) =>
      label.source !== "user" &&
      (label.id === targetLabel.id ||
        getWalletLabelDisplayKey(label.kind, label.value || label.name) === dedupeKey)
  );
  for (const label of duplicateAiLabels) {
    await deletePersistedWalletLabel(bindings.SMART_MONEY_DB, walletId, label.id, actor);
  }

  return getWalletDetail(walletId);
};

export const upsertWatchlistEntry = async (walletId: string, note?: string, actor?: string) => {
  const bindings = await ensurePersistedBindings();
  if (!bindings?.SMART_MONEY_DB) {
    return upsertDemoWatchlistEntry(walletId, note);
  }

  const wallet = await getPersistedWalletById(bindings.SMART_MONEY_DB, walletId, {
    includeDeleted: true
  });
  if (!wallet) {
    return undefined;
  }

  return upsertPersistedWalletWatchlist(bindings.SMART_MONEY_DB, walletId, note, actor);
};

export const removeWatchlistEntry = async (walletId: string, actor?: string) => {
  const bindings = await ensurePersistedBindings();
  if (!bindings?.SMART_MONEY_DB) {
    return removeDemoWatchlistEntry(walletId);
  }

  return removePersistedWalletWatchlist(bindings.SMART_MONEY_DB, walletId, actor);
};

export const previewWalletImportText = async (
  text: string,
  sourceName = "wallets.txt"
): Promise<WalletImportPreview> => parseWalletImportText(sourceName, text);

export const previewWalletImportAi = async (input: WalletAiExtractRequest) =>
  extractWalletsWithAi(input);

export const commitWalletImport = async (
  request: WalletImportCommitRequest,
  actor = "Team Alpha"
): Promise<WalletImportCommitResult> => {
  const importedAt = new Date().toISOString();
  const providerMeta =
    request.mode === "ai"
      ? request.rows
          .map((row) => ("providerMeta" in row ? row.providerMeta : undefined))
          .find((meta): meta is NonNullable<WalletAiExtractPreviewRow["providerMeta"]> => Boolean(meta))
      : undefined;
  const sourceType: WalletSourceType =
    request.sourceType ?? (request.mode === "ai" ? "ai" : "file");

  const bindings = await ensurePersistedBindings();
  const importBatch = bindings?.SMART_MONEY_DB
    ? await createPersistedWalletImportBatch(bindings.SMART_MONEY_DB, {
        sourceType,
        sourceName: request.sourceName ?? null,
        provider: providerMeta?.provider ?? null,
        model: providerMeta?.model ?? null,
        fallbackUsed: providerMeta?.fallbackUsed ?? false,
        actor,
        rowCount: request.rows.length,
        createdCount: 0,
        updatedCount: 0,
        failedCount: 0
      })
    : ({
        id: crypto.randomUUID(),
        sourceType,
        sourceName: request.sourceName,
        provider: providerMeta?.provider,
        model: providerMeta?.model,
        fallbackUsed: providerMeta?.fallbackUsed ?? false,
        actor,
        rowCount: request.rows.length,
        createdCount: 0,
        updatedCount: 0,
        failedCount: 0,
        createdAt: importedAt
      } satisfies WalletImportBatch);

  const existingRows = await listWalletAdminRows({ includeDeleted: true });
  const existingByAddress = new Map(
    existingRows.map(
      (row) => [normalizeAddress(row.wallet.address) ?? row.wallet.normalizedAddress, row.wallet] as const
    )
  );
  const existingLabelsByAddress = new Map(
    existingRows.map(
      (row) => [normalizeAddress(row.wallet.address) ?? row.wallet.normalizedAddress, row.labels] as const
    )
  );

  let createdCount = 0;
  let updatedCount = 0;
  const failedRows: Array<{ rowNumber: number; displayName: string; reason: string }> = [];

  for (const row of request.rows) {
    if (row.errors.length > 0) {
      failedRows.push({
        rowNumber: row.rowNumber,
        displayName: getWalletImportDisplayName(row),
        reason: row.errors.join(" / ")
      });
      continue;
    }

    try {
      const commitRow = sanitizeWalletImportRowForCommit(row);
      const normalizedAddress = normalizeAddress(commitRow.wallet.address);
      const existing = normalizedAddress ? existingByAddress.get(normalizedAddress) : undefined;
      const curationStatus = resolveImportCurationStatus(commitRow);

      const wallet =
        existing && !existing.deletedAt
          ? await updateWallet(
              existing.id,
              request.preserveExistingManualFields
                ? createPreservedImportWalletUpdate(existing, commitRow, {
                    sourceType,
                    curationStatus,
                    importBatchId: importBatch.id,
                    importedAt
                  })
                : {
                    address: commitRow.wallet.address,
                    displayName: commitRow.wallet.displayName,
                    alias: commitRow.wallet.alias,
                    bio: commitRow.wallet.bio,
                    strategyFocus: commitRow.wallet.strategyFocus,
                    teamNote: commitRow.wallet.teamNote,
                    firstSeenAt: commitRow.wallet.firstSeenAt,
                    sourceType,
                    curationStatus,
                    lastImportedAt: importedAt,
                    importBatchId: importBatch.id
                  },
              actor
            )
          : await createWallet(
              createImportWalletPayload(commitRow, {
                sourceType,
                curationStatus,
                importBatchId: importBatch.id,
                importedAt
              }),
              actor
            );

      if (!wallet) {
        throw new Error("wallet write failed");
      }

      if (existing && !existing.deletedAt) {
        updatedCount += 1;
      } else {
        createdCount += 1;
      }

      let preservedLabels = normalizedAddress
        ? (existingLabelsByAddress.get(normalizedAddress) ?? [])
        : [];

      if (request.mode === "ai" && bindings?.SMART_MONEY_DB) {
        await replacePersistedSystemLabelsForWallet(bindings.SMART_MONEY_DB, wallet.id);
        preservedLabels =
          (await listWalletLabelsByWalletIds(bindings.SMART_MONEY_DB, [wallet.id])).get(wallet.id) ?? [];
      }

      const officialLabelKeys = new Set(
        preservedLabels
          .filter((label) => label.source === "user")
          .map((label) => getWalletLabelDisplayKey(label.kind, label.value || label.name))
      );
      const insertedLabelKeys = new Set<string>();
      const writtenImportLabels: WalletLabel[] = [];
      for (const label of commitRow.labels) {
        const labelKind = label.kind ?? "strategy";
        const labelValue = label.value?.trim() || "";
        if (!labelValue) {
          continue;
        }

        const labelKey = getWalletLabelDisplayKey(labelKind, labelValue);
        if (insertedLabelKeys.has(labelKey) || officialLabelKeys.has(labelKey)) {
          continue;
        }

        insertedLabelKeys.add(labelKey);
        await createUserTag(
          wallet.id,
          {
            name: label.name,
            value: labelValue,
            kind: labelKind,
            source: request.mode === "ai" ? "system" : (label.source ?? "user"),
            evidence:
              label.evidence ||
              (isWalletAiPreviewRow(commitRow) ? commitRow.sourceExcerpt : undefined),
            verificationNote: label.verificationNote,
            sourceNote: label.sourceNote
          },
          actor
        );
        writtenImportLabels.push({
          id: `${wallet.id}-import-${writtenImportLabels.length}`,
          walletId: wallet.id,
          kind: labelKind,
          source: request.mode === "ai" ? "system" : (label.source ?? "user"),
          name: label.name,
          value: labelValue,
          evidence:
            label.evidence ||
            (isWalletAiPreviewRow(commitRow) ? commitRow.sourceExcerpt : undefined),
          verificationNote: label.verificationNote,
          sourceNote: label.sourceNote,
          createdAt: importedAt,
          updatedAt: importedAt
        });
      }

      if (commitRow.note?.trim()) {
        await createWalletNote(wallet.id, commitRow.note.trim(), actor);
      }

      if (commitRow.watchlistNote?.trim()) {
        await upsertWatchlistEntry(wallet.id, commitRow.watchlistNote.trim(), actor);
      }

      existingByAddress.set(wallet.normalizedAddress, wallet);
      existingLabelsByAddress.set(wallet.normalizedAddress, [
        ...preservedLabels.filter((label) => label.source === "user"),
        ...writtenImportLabels
      ]);
    } catch (error) {
      failedRows.push({
        rowNumber: row.rowNumber,
        displayName: getWalletImportDisplayName(row),
        reason: error instanceof Error ? error.message : "unknown import error"
      });
    }
  }

  const finalizedBatch =
    bindings?.SMART_MONEY_DB
      ? await updatePersistedWalletImportBatch(bindings.SMART_MONEY_DB, importBatch.id, {
          createdCount,
          updatedCount,
          failedCount: failedRows.length
        })
      : {
          ...importBatch,
          createdCount,
          updatedCount,
          failedCount: failedRows.length
        };

  return {
    createdCount,
    updatedCount,
    failedRows,
    importBatch: finalizedBatch ?? importBatch
  };
};

const requireSmartMoneyDb = async () => {
  const bindings = await ensurePersistedBindings();
  if (!bindings?.SMART_MONEY_DB) {
    throw new Error("smart money database bindings are unavailable");
  }

  return bindings.SMART_MONEY_DB;
};

export const getSmartMoneySchemaStatusReport = async () => {
  const bindings = await ensurePersistedBindings();
  if (!bindings?.SMART_MONEY_DB) {
    return {
      mode: "demo" as const,
      schema: null
    };
  }

  return {
    mode: "cloudflare" as const,
    schema: await getPersistedSmartMoneySchemaStatus(bindings.SMART_MONEY_DB)
  };
};

export const getAdminExtensionOverview = async (): Promise<AdminExtensionOverview> => {
  const db = await requireSmartMoneyDb();
  return getPersistedExtensionOverview(db);
};

export const listAdminExtensionInvites = async (): Promise<AdminExtensionInviteItem[]> => {
  const db = await requireSmartMoneyDb();
  return listPersistedExtensionInvites(db);
};

export const createAdminExtensionInvite = async (input: {
  memberLabel: string;
  expiresAt?: string | null;
}) => {
  const db = await requireSmartMoneyDb();
  const created = await createPersistedExtensionInvite(db, input);
  const invites = await listPersistedExtensionInvites(db);
  return invites.find((invite) => invite.code === created.code) ?? null;
};

export const updateAdminExtensionInviteStatus = async (
  code: string,
  status: "active" | "disabled"
) => {
  const db = await requireSmartMoneyDb();
  const updated = await setPersistedExtensionInviteStatus(db, code, status);
  if (!updated) {
    return null;
  }

  const invites = await listPersistedExtensionInvites(db);
  return invites.find((invite) => invite.code === code) ?? null;
};

export const listAdminExtensionSessions = async (input?: {
  query?: string;
  status?: AdminExtensionSessionItem["status"] | "all";
}): Promise<AdminExtensionSessionItem[]> => {
  const db = await requireSmartMoneyDb();
  return listPersistedExtensionSessions(db, input);
};

export const revokeAdminExtensionSession = async (sessionId: string) => {
  const db = await requireSmartMoneyDb();
  await revokePersistedExtensionSession(db, sessionId);
  const sessions = await listPersistedExtensionSessions(db, { status: "all" });
  return sessions.find((session) => session.id === sessionId) ?? null;
};


