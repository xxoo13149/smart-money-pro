import {
  ALERT_EVENT_META,
  computeDashboardSummary,
  computeMarketDigests,
  computeWalletMetrics,
  deriveSystemLabels,
  getPrimarySignalPriority,
  getChainAddressKey,
  generateAlertEvents,
  isPrimarySignalLabelKind,
  markets as seedMarkets,
  normalizeAddress,
  noteAuditLogs as seedNoteAuditLogs,
  positionSnapshots as seedPositionSnapshots,
  shortenAddress,
  sortAddressBadges,
  trades as seedTrades,
  walletLabels as seedWalletLabels,
  wallets as seedWallets,
  watchlistEntries as seedWatchlistEntries
} from "@weather-smart-money/core";
import type {
  AddressLabelBadge,
  AddressSummary,
  AlertEvent,
  ChainId,
  Market,
  NoteAuditLog,
  PositionSnapshot,
  Trade,
  Wallet,
  WalletFinderAiInsight,
  WalletLabel,
  WalletLabelKind,
  WalletTableRow,
  WatchlistEntry
} from "@weather-smart-money/core";

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const walletMetaUpdatedAt = new Map<string, string>();

const state = {
  wallets: clone(seedWallets),
  markets: clone(seedMarkets),
  trades: clone(seedTrades),
  positions: clone(seedPositionSnapshots),
  userLabels: clone(seedWalletLabels.filter((label) => label.source === "user")),
  notes: clone(seedNoteAuditLogs),
  watchlist: clone(seedWatchlistEntries),
  alerts: clone(generateAlertEvents(seedWallets, seedTrades, seedPositionSnapshots))
};

const nowIso = () => new Date().toISOString();
const createId = (prefix: string) => `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
const buildDetailUrl = (baseUrl: string | undefined, walletId: string) =>
  baseUrl ? `${baseUrl.replace(/\/$/, "")}/wallets/${walletId}` : `/wallets/${walletId}`;
const getActiveWallets = () => state.wallets.filter((wallet) => !wallet.deletedAt);

export interface AlertListItem {
  alert: AlertEvent;
  wallet: Wallet;
  market?: Market;
  eventLabel: string;
  eventDescription: string;
}

export interface WalletDetailData {
  wallet: Wallet;
  metrics: ReturnType<typeof computeWalletMetrics>;
  labels: WalletLabel[];
  finderAi?: WalletFinderAiInsight;
  trades: Trade[];
  positions: PositionSnapshot[];
  notes: NoteAuditLog[];
  alerts: AlertListItem[];
  watchlistEntry?: WatchlistEntry;
}

export interface DashboardData {
  summary: ReturnType<typeof computeDashboardSummary>;
  markets: ReturnType<typeof computeMarketDigests>;
  walletRows: WalletTableRow[];
  alerts: AlertListItem[];
  spotlightWallets: WalletTableRow[];
}

const refreshAlerts = () => {
  state.alerts = clone(generateAlertEvents(getActiveWallets(), state.trades, state.positions));
};

export const getAllLabels = () => deriveSystemLabels(getActiveWallets(), state.userLabels, state.trades);

const getWalletUpdatedAt = (walletId: string) => {
  const wallet = state.wallets.find((item) => item.id === walletId);
  const timestamps = [
    walletMetaUpdatedAt.get(walletId),
    wallet?.updatedAt,
    ...state.notes.filter((note) => note.walletId === walletId).map((note) => note.createdAt),
    ...state.userLabels
      .filter((label) => label.walletId === walletId)
      .map((label) => label.createdAt),
    ...state.watchlist
      .filter((entry) => entry.walletId === walletId)
      .map((entry) => entry.createdAt)
  ].filter((value): value is string => Boolean(value));

  return timestamps.sort((left, right) => new Date(right).getTime() - new Date(left).getTime())[0] ??
    "2026-04-05T00:00:00.000Z";
};

const toBadge = (
  walletId: string,
  text: string,
  tone: AddressLabelBadge["tone"],
  suffix: string
): AddressLabelBadge => ({
  id: `${walletId}-${suffix}`,
  text,
  tone
});

const toLabelBadge = (wallet: Wallet, label: WalletLabel, suffix: string): AddressLabelBadge =>
  ({
    id: `${wallet.id}-${suffix}`,
    text: label.value.length <= 18 ? label.value : label.name,
    tone: label.source === "user" ? "accent" : "neutral",
    kind: label.kind,
    priority: getPrimarySignalPriority(label.kind),
    detailText: label.name,
    metricText: label.evidence,
    isPrimary: isPrimarySignalLabelKind(label.kind)
  }) satisfies AddressLabelBadge;

const shouldIncludeSummaryLabel = (kind: WalletLabelKind) =>
  kind !== "signal_quality" && kind !== "market_scope" && kind !== "confidence";

const buildStatusBadges = (wallet: Wallet, activeAlertCount: number) => {
  const badges: AddressLabelBadge[] = [];

  if (wallet.watchlisted) {
    badges.push(toBadge(wallet.id, "Watchlist", "watch", "watchlist"));
  }

  if (wallet.deletedAt) {
    badges.push(toBadge(wallet.id, "已删除", "danger", "deleted"));
  } else if (wallet.curationStatus === "review_needed") {
    badges.push(toBadge(wallet.id, "待补充", "neutral", "review"));
  }

  if (activeAlertCount > 0) {
    badges.push(toBadge(wallet.id, `${activeAlertCount} 信号`, "neutral", "signals"));
  }

  return sortAddressBadges(badges);
};

const buildSummaryBadges = (
  wallet: Wallet,
  labels: WalletLabel[],
  activeAlertCount: number
) => {
  return sortAddressBadges(
    labels
      .filter((label) => shouldIncludeSummaryLabel(label.kind))
      .map((label, index) => toLabelBadge(wallet, label, `label-${index}`))
  ).slice(0, 2);
};

const buildHoverBadges = (wallet: Wallet, labels: WalletLabel[]) =>
  sortAddressBadges(
    labels
      .filter((label) => shouldIncludeSummaryLabel(label.kind))
      .map((label, index) => toLabelBadge(wallet, label, `hover-${index}`))
  ).slice(0, 6);

const buildAddressSummaryForWallet = (
  wallet: Wallet,
  labels: WalletLabel[],
  baseUrl?: string
): AddressSummary => {
  const latestNote = state.notes
    .filter((note) => note.walletId === wallet.id)
    .sort(
      (left, right) =>
        new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
    )[0];
  const activeAlertCount = state.alerts.filter(
    (alert) => alert.walletId === wallet.id && alert.status === "open"
  ).length;
  const updatedAt = getWalletUpdatedAt(wallet.id);

  return {
    chain: wallet.chain,
    address: wallet.address,
    normalizedAddress: wallet.normalizedAddress,
    alias: wallet.alias ?? wallet.displayName,
    displayName: wallet.displayName,
    strategyFocus: wallet.strategyFocus || undefined,
    badges: buildSummaryBadges(wallet, labels, activeAlertCount),
    hoverBadges: buildHoverBadges(wallet, labels),
    statusBadges: buildStatusBadges(wallet, activeAlertCount),
    noteSnippet: latestNote?.content ?? wallet.teamNote,
    watchlisted: wallet.watchlisted,
    detailUrl: buildDetailUrl(baseUrl, wallet.id),
    updatedAt,
    version: `${wallet.id}:${updatedAt}`
  };
};

export const lookupAddressSummaries = (
  addresses: string[],
  options?: { chain?: ChainId; baseUrl?: string }
) => {
  const chain = options?.chain ?? "polygon";
  const labels = getAllLabels();
  const requested = new Set(
    addresses
      .map((address) => getChainAddressKey(chain, address))
      .filter((address): address is string => Boolean(address))
  );

  return getActiveWallets()
    .filter((wallet) => requested.has(`${wallet.chain}:${wallet.normalizedAddress}`))
    .map((wallet) =>
      buildAddressSummaryForWallet(
        wallet,
        labels.filter((label) => label.walletId === wallet.id),
        options?.baseUrl
      )
    )
    .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime());
};

export const getAddressSummaryByAddress = (
  address: string,
  options?: { chain?: ChainId; baseUrl?: string }
) => lookupAddressSummaries([address], options)[0];

export const getKnownAddresses = (chain: ChainId = "polygon") =>
  getActiveWallets()
    .filter((wallet) => wallet.chain === chain)
    .map((wallet) => ({
      address: wallet.address,
      normalizedAddress: normalizeAddress(wallet.address) ?? wallet.normalizedAddress,
      alias: wallet.alias ?? wallet.displayName,
      preview: shortenAddress(wallet.address)
    }));

export const listMarkets = (sector: "weather" = "weather") =>
  state.markets.filter((market) => market.sector === sector);

export const listWalletRows = (): WalletTableRow[] => {
  const labels = getAllLabels();

  return getActiveWallets()
    .map((wallet) => {
      const metrics = computeWalletMetrics(wallet, state.trades);
      const walletTrades = state.trades
        .filter((trade) => trade.walletId === wallet.id)
        .sort(
          (left, right) =>
            new Date(right.enteredAt).getTime() - new Date(left.enteredAt).getTime()
        );

      return {
        wallet,
        metrics,
        labels: labels.filter((label) => label.walletId === wallet.id),
        activeAlertCount: state.alerts.filter(
          (alert) => alert.walletId === wallet.id && alert.status === "open"
        ).length,
        latestTrade: walletTrades[0]
      };
    })
    .sort((left, right) => {
      if (left.wallet.watchlisted !== right.wallet.watchlisted) {
        return left.wallet.watchlisted ? -1 : 1;
      }
      return right.metrics.totalRealizedPnlUsd - left.metrics.totalRealizedPnlUsd;
    });
};

export const listAlerts = (status: "open" | "resolved" | "all" = "all"): AlertListItem[] =>
  state.alerts
    .filter((alert) => (status === "all" ? true : alert.status === status))
    .map((alert) => {
      const wallet = getActiveWallets().find((item) => item.id === alert.walletId);
      if (!wallet) {
        return null;
      }
      const market = state.markets.find((item) => item.id === alert.marketId);
      return {
        alert,
        wallet,
        market,
        eventLabel: ALERT_EVENT_META[alert.eventType].label,
        eventDescription: ALERT_EVENT_META[alert.eventType].description
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .sort((left, right) => right.alert.alertScore - left.alert.alertScore);

export const getDashboardData = (): DashboardData => {
  const walletRows = listWalletRows();
  const alerts = listAlerts("open");

  return {
    summary: computeDashboardSummary(getActiveWallets(), alerts.length),
    markets: computeMarketDigests(getActiveWallets(), state.markets, state.trades),
    walletRows,
    alerts,
    spotlightWallets: walletRows.slice(0, 3)
  };
};

export const getWalletDetail = (walletId: string): WalletDetailData | undefined => {
  const wallet = state.wallets.find((item) => item.id === walletId);
  if (!wallet) {
    return undefined;
  }

  return {
    wallet,
    metrics: computeWalletMetrics(wallet, state.trades),
    labels: getAllLabels().filter((label) => label.walletId === walletId),
    trades: state.trades
      .filter((trade) => trade.walletId === walletId)
      .sort(
        (left, right) =>
          new Date(right.enteredAt).getTime() - new Date(left.enteredAt).getTime()
      ),
    positions: state.positions
      .filter((position) => position.walletId === walletId)
      .sort(
        (left, right) =>
          new Date(right.capturedAt).getTime() - new Date(left.capturedAt).getTime()
      ),
    notes: state.notes
      .filter((note) => note.walletId === walletId)
      .sort(
        (left, right) =>
          new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
      ),
    alerts: listAlerts("all").filter((item) => item.wallet.id === walletId),
    watchlistEntry: state.watchlist.find((item) => item.walletId === walletId)
  };
};

export const getWalletMetrics = (walletId: string, tradeWindow = 30) => {
  const wallet = state.wallets.find((item) => item.id === walletId);
  if (!wallet) {
    return undefined;
  }

  return computeWalletMetrics(wallet, state.trades, tradeWindow);
};

export const createWalletNote = (
  walletId: string,
  content: string,
  actor = "Team Alpha"
) => {
  const wallet = state.wallets.find((item) => item.id === walletId);
  if (!wallet) {
    return undefined;
  }

  const note: NoteAuditLog = {
    id: createId("audit"),
    walletId,
    action: "create_note",
    content,
    createdAt: nowIso(),
    actor
  };

  state.notes.unshift(note);
  wallet.teamNote = content;
  wallet.updatedAt = note.createdAt;
  walletMetaUpdatedAt.set(walletId, note.createdAt);
  return note;
};

export const createWallet = (payload: {
  address: string;
  displayName: string;
  alias?: string;
  bio?: string;
  strategyFocus?: string;
  teamNote?: string;
  firstSeenAt?: string;
  sourceType?: Wallet["sourceType"];
  curationStatus?: Wallet["curationStatus"];
  lastImportedAt?: string;
  importBatchId?: string;
}) => {
  const normalizedAddress = normalizeAddress(payload.address);
  if (!normalizedAddress) {
    throw new Error("invalid wallet address");
  }

  const existingWallet = state.wallets.find(
    (wallet) => wallet.normalizedAddress === normalizedAddress
  );
  if (existingWallet && !existingWallet.deletedAt) {
    throw new Error("wallet already exists");
  }

  if (existingWallet?.deletedAt) {
    const updatedAt = nowIso();
    existingWallet.address = payload.address.trim();
    existingWallet.displayName = payload.displayName.trim();
    existingWallet.alias = payload.alias?.trim() || undefined;
    existingWallet.bio = payload.bio?.trim() ?? "";
    existingWallet.strategyFocus = payload.strategyFocus?.trim() ?? "";
    existingWallet.teamNote = payload.teamNote?.trim() || undefined;
    existingWallet.firstSeenAt = payload.firstSeenAt?.trim() || existingWallet.firstSeenAt;
    existingWallet.deletedAt = undefined;
    existingWallet.sourceType = payload.sourceType ?? existingWallet.sourceType;
    existingWallet.curationStatus = payload.curationStatus ?? "active";
    existingWallet.lastImportedAt = payload.lastImportedAt ?? existingWallet.lastImportedAt;
    existingWallet.importBatchId = payload.importBatchId ?? existingWallet.importBatchId;
    existingWallet.updatedAt = updatedAt;
    walletMetaUpdatedAt.set(existingWallet.id, updatedAt);
    state.notes.unshift({
      id: createId("audit"),
      walletId: existingWallet.id,
      action: "update_wallet",
      content: `重新录入地址 ${existingWallet.displayName}`,
      createdAt: updatedAt,
      actor: "Team Alpha"
    });
    refreshAlerts();
    return existingWallet;
  }

  const wallet: Wallet = {
    id: createId("wallet"),
    chain: "polygon",
    address: payload.address.trim(),
    normalizedAddress,
    displayName: payload.displayName.trim(),
    alias: payload.alias?.trim() || undefined,
    bio: payload.bio?.trim() ?? "",
    strategyFocus: payload.strategyFocus?.trim() ?? "",
    teamNote: payload.teamNote?.trim() || undefined,
    firstSeenAt: payload.firstSeenAt?.trim() || nowIso(),
    watchlisted: false,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    deletedAt: undefined,
    sourceType: payload.sourceType ?? "manual",
    curationStatus: payload.curationStatus ?? "active",
    lastImportedAt: payload.lastImportedAt,
    importBatchId: payload.importBatchId
  };

  state.wallets.unshift(wallet);
  const createdAt = wallet.createdAt;
  walletMetaUpdatedAt.set(wallet.id, createdAt);
  state.notes.unshift({
    id: createId("audit"),
    walletId: wallet.id,
    action: "create_wallet",
    content: `新增地址 ${wallet.displayName}`,
    createdAt,
    actor: "Team Alpha"
  });
  refreshAlerts();
  return wallet;
};

export const updateWallet = (
  walletId: string,
  payload: {
    address?: string;
    displayName?: string;
    alias?: string | null;
    bio?: string | null;
    strategyFocus?: string | null;
    teamNote?: string | null;
    firstSeenAt?: string;
  }
) => {
  const wallet = state.wallets.find((item) => item.id === walletId);
  if (!wallet) {
    return undefined;
  }

  if (payload.address !== undefined) {
    const normalizedAddress = normalizeAddress(payload.address);
    if (!normalizedAddress) {
      throw new Error("invalid wallet address");
    }
    wallet.address = payload.address.trim();
    wallet.normalizedAddress = normalizedAddress;
  }

  if (payload.displayName !== undefined) {
    wallet.displayName = payload.displayName.trim();
  }
  if (payload.alias !== undefined) {
    wallet.alias = payload.alias?.trim() || undefined;
  }
  if (payload.bio !== undefined) {
    wallet.bio = payload.bio?.trim() ?? "";
  }
  if (payload.strategyFocus !== undefined) {
    wallet.strategyFocus = payload.strategyFocus?.trim() ?? "";
  }
  if (payload.teamNote !== undefined) {
    wallet.teamNote = payload.teamNote?.trim() || undefined;
  }
  if (payload.firstSeenAt !== undefined) {
    wallet.firstSeenAt = payload.firstSeenAt.trim();
  }

  const updatedAt = nowIso();
  wallet.updatedAt = updatedAt;
  walletMetaUpdatedAt.set(walletId, updatedAt);
  state.notes.unshift({
    id: createId("audit"),
    walletId,
    action: "update_wallet",
    content: "更新地址资料",
    createdAt: updatedAt,
    actor: "Team Alpha"
  });
  refreshAlerts();
  return wallet;
};

export const createUserTag = (
  walletId: string,
  payload: {
    name: string;
    value: string;
    kind?: WalletLabelKind;
    evidence?: string;
  }
) => {
  const wallet = state.wallets.find((item) => item.id === walletId);
  if (!wallet) {
    return undefined;
  }

  const tag: WalletLabel = {
    id: createId("label"),
    walletId,
    kind: payload.kind ?? "strategy",
    source: "user",
    name: payload.name,
    value: payload.value,
    evidence: payload.evidence,
    createdAt: nowIso()
  };

  state.userLabels.unshift(tag);
  wallet.updatedAt = tag.createdAt;
  walletMetaUpdatedAt.set(walletId, tag.createdAt);
  state.notes.unshift({
    id: createId("audit"),
    walletId,
    action: "create_user_tag",
    content: `${payload.name}: ${payload.value}`,
    createdAt: nowIso(),
    actor: "Team Alpha"
  });

  return tag;
};

export const upsertWatchlistEntry = (walletId: string, note?: string) => {
  const wallet = state.wallets.find((item) => item.id === walletId);
  if (!wallet) {
    return undefined;
  }

  const updatedAt = nowIso();
  wallet.watchlisted = true;
  wallet.updatedAt = updatedAt;
  walletMetaUpdatedAt.set(walletId, updatedAt);
  const existing = state.watchlist.find((item) => item.walletId === walletId);
  if (existing) {
    existing.note = note ?? existing.note;
    return existing;
  }

  const entry: WatchlistEntry = {
    id: createId("watch"),
    walletId,
    createdAt: updatedAt,
    note
  };

  state.watchlist.unshift(entry);
  state.notes.unshift({
    id: createId("audit"),
    walletId,
    action: "toggle_watchlist",
    content: note ? `加入 watchlist: ${note}` : "加入 watchlist",
    createdAt: updatedAt,
    actor: "Team Alpha"
  });
  return entry;
};

export const removeWatchlistEntry = (walletId: string) => {
  const wallet = state.wallets.find((item) => item.id === walletId);
  if (!wallet) {
    return undefined;
  }

  wallet.watchlisted = false;
  const updatedAt = nowIso();
  wallet.updatedAt = updatedAt;
  walletMetaUpdatedAt.set(walletId, updatedAt);
  const index = state.watchlist.findIndex((item) => item.walletId === walletId);
  if (index >= 0) {
    state.watchlist.splice(index, 1);
  }
  state.notes.unshift({
    id: createId("audit"),
    walletId,
    action: "toggle_watchlist",
    content: "移出 watchlist",
    createdAt: updatedAt,
    actor: "Team Alpha"
  });

  return wallet;
};

export const softDeleteWallet = (
  walletId: string,
  input?: {
    actor?: string;
    reason?: string | null;
  }
) => {
  const wallet = state.wallets.find((item) => item.id === walletId);
  if (!wallet) {
    return undefined;
  }

  if (wallet.deletedAt) {
    return wallet;
  }

  const deletedAt = nowIso();
  wallet.deletedAt = deletedAt;
  wallet.updatedAt = deletedAt;
  walletMetaUpdatedAt.set(walletId, deletedAt);
  state.notes.unshift({
    id: createId("audit"),
    walletId,
    action: "delete_wallet",
    content: input?.reason?.trim()
      ? `删除地址: ${input.reason.trim()}`
      : `删除地址 ${wallet.displayName}`,
    createdAt: deletedAt,
    actor: input?.actor?.trim() || "Team Alpha"
  });
  refreshAlerts();
  return wallet;
};

export const resolveAlert = (alertId: string, actor = "Team Alpha") => {
  const alert = state.alerts.find((item) => item.id === alertId);
  if (!alert) {
    return undefined;
  }

  alert.status = "resolved";
  state.notes.unshift({
    id: createId("audit"),
    walletId: alert.walletId,
    action: "resolve_alert",
    content: `处理信号 ${alert.eventType}`,
    createdAt: nowIso(),
    actor
  });

  return alert;
};

export const getRawState = () => state;
export const refreshDerivedState = () => refreshAlerts();
