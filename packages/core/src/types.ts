export type Sector = "weather";
export type ChainId = "polygon";
export type NormalizedAddress = `0x${string}`;

export type AlertSeverity = "critical" | "high" | "medium" | "low";
export type AlertStatus = "open" | "resolved";
export type AlertEventType =
  | "sector_rotation"
  | "position_surge"
  | "chasing_entry"
  | "drawdown_streak"
  | "high_frequency_reversal";

export type WalletLabelSource = "system" | "user";
export type WalletLabelKind =
  | "wallet_age"
  | "performance"
  | "specialty"
  | "style"
  | "risk"
  | "group"
  | "alias"
  | "confidence"
  | "strategy"
  | "activity_level"
  | "new_wallet_signal"
  | "early_entry_signal"
  | "geo_specialty"
  | "frequency_region"
  | "winrate_region"
  | "payout_region"
  | "trader_archetype"
  | "activity_level"
  | "new_wallet_signal"
  | "early_entry_signal"
  | "market_scope"
  | "resolution_source"
  | "forecast_basis"
  | "timing_window"
  | "edge_style"
  | "weather_driver"
  | "signal_quality";

export type WalletPrimarySignalKind =
  | "geo_specialty"
  | "frequency_region"
  | "winrate_region"
  | "payout_region"
  | "trader_archetype";

export interface WalletPrimarySignal {
  kind: WalletPrimarySignalKind;
  label: string;
  region?: string;
  metricText?: string;
  evidence?: string;
  priority?: number;
}

export type WalletWeatherMarketScope =
  | "single_city_max_temp"
  | "multi_city_temp"
  | "mixed_weather"
  | "unknown";

export type WalletWeatherResolutionSource =
  | "nws_noaa"
  | "jma"
  | "kma"
  | "dwd"
  | "official_other"
  | "unknown";

export type WalletWeatherForecastBasis =
  | "ensemble_guidance"
  | "official_grid"
  | "nowcast"
  | "station_observation"
  | "narrative_only"
  | "unknown";

export type WalletWeatherTimingWindow =
  | "d2_plus"
  | "d1"
  | "intraday"
  | "near_close"
  | "unknown";

export type WalletWeatherEdgeStyle =
  | "upper_tail"
  | "baseline_mean"
  | "range_threshold"
  | "late_reprice"
  | "obs_reaction"
  | "unknown";

export type WalletWeatherDriver =
  | "cloud_cover"
  | "precip_timing"
  | "wind_shift"
  | "humidity_dewpoint"
  | "ridge_heat_dome"
  | "front_passage"
  | "urban_heat"
  | "storm_outflow"
  | "unknown";

export type WalletAiSignalQuality = "high_signal" | "needs_review" | "low_signal";

export interface WalletWeatherSignalDraft {
  marketScope: WalletWeatherMarketScope;
  resolutionSource: WalletWeatherResolutionSource;
  forecastBasis: WalletWeatherForecastBasis;
  timingWindow: WalletWeatherTimingWindow;
  edgeStyle: WalletWeatherEdgeStyle;
  weatherDrivers: WalletWeatherDriver[];
  evidenceQuality: "explicit_numeric" | "source_named" | "qualitative_only" | "insufficient";
}

export type WalletSourceType = "manual" | "ai" | "file" | "system";
export type WalletCurationStatus = "active" | "review_needed" | "deleted";
export type WalletListSort = "updated_desc" | "created_desc" | "name_asc";
export type WalletListStatus = "all" | "active" | "watchlist" | "review_needed" | "deleted";
export type WalletListPanelMode = "inspect" | "edit";
export type WalletBulkAction = "soft_delete" | "watchlist_add" | "watchlist_remove";

export interface WalletStatusBadge {
  id: string;
  text: string;
  tone: "neutral" | "watch" | "danger" | "ai-review";
}

export interface Wallet {
  id: string;
  chain: ChainId;
  address: string;
  normalizedAddress: NormalizedAddress;
  displayName: string;
  alias?: string;
  bio: string;
  firstSeenAt: string;
  strategyFocus: string;
  teamNote?: string;
  watchlisted: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
  sourceType: WalletSourceType;
  curationStatus: WalletCurationStatus;
  lastImportedAt?: string;
  importBatchId?: string;
}

export interface Market {
  id: string;
  slug: string;
  title: string;
  sector: Sector;
  location: string;
  category: string;
  openAt: string;
  closeAt: string;
  resolutionSource: string;
  peakVolumeAt: string;
  status: "open" | "closed" | "resolved";
}

export interface Trade {
  id: string;
  walletId: string;
  marketId: string;
  side: "yes" | "no";
  outcome: "win" | "loss" | "pending";
  price: number;
  averagePrice1h: number;
  sizeUsd: number;
  realizedPnlUsd: number;
  enteredAt: string;
  exitedAt?: string;
  marketPeakAt: string;
  sector: Sector;
}

export interface PositionSnapshot {
  id: string;
  walletId: string;
  marketId: string;
  capturedAt: string;
  exposureUsd: number;
  avgEntryPrice: number;
  unrealizedPnlUsd: number;
  side: "yes" | "no";
}

export interface WalletLabel {
  id: string;
  walletId: string;
  kind: WalletLabelKind;
  source: WalletLabelSource;
  name: string;
  value: string;
  evidence?: string;
  verificationNote?: string;
  sourceNote?: string;
  score?: number;
  createdAt: string;
  updatedAt?: string;
}

export interface WatchlistEntry {
  id: string;
  walletId: string;
  createdAt: string;
  note?: string;
}

export interface NoteAuditLog {
  id: string;
  walletId: string;
  action:
    | "create_wallet"
    | "update_wallet"
    | "delete_wallet"
    | "create_note"
    | "create_user_tag"
    | "toggle_watchlist"
    | "resolve_alert";
  content: string;
  createdAt: string;
  actor: string;
}

export interface AlertEvent {
  id: string;
  walletId: string;
  marketId: string;
  sector: Sector;
  eventType: AlertEventType;
  severity: AlertSeverity;
  status: AlertStatus;
  side: "yes" | "no";
  sizeDeltaUsd: number;
  priceDeviationPct: number;
  historicalWinRate: number;
  alertScore: number;
  evidence: string;
  occurredAt: string;
  dedupeKey: string;
}

export interface WalletMetrics {
  walletId: string;
  tradeWindow: number;
  weatherWinRate: number;
  averageEntryLeadMinutes: number;
  avgRiskReward: number;
  totalRealizedPnlUsd: number;
  weatherTradeShare: number;
  stableCurveScore: number;
  last30Trades: Trade[];
}

export interface DashboardSummary {
  activeWeatherMarkets: number;
  trackedWallets: number;
  openAlerts: number;
  watchlistedWallets: number;
  averageWeatherWinRate: number;
}

export interface SectorMarketDigest {
  marketId: string;
  title: string;
  location: string;
  status: Market["status"];
  notableWallets: string[];
  netTrackedFlowUsd: number;
}

export interface WalletTableRow {
  wallet: Wallet;
  metrics: WalletMetrics;
  labels: WalletLabel[];
  activeAlertCount: number;
  latestTrade?: Trade;
}

export interface AddressLabelBadge {
  id: string;
  text: string;
  tone: "accent" | "neutral" | "watch" | "alert" | "danger" | "ai-review";
  kind?: WalletLabelKind;
  priority?: number;
  detailText?: string;
  metricText?: string;
  isPrimary?: boolean;
}

export interface AddressHoverCard {
  officialTags: AddressLabelBadge[];
  officialNoteText?: string;
  aiTags: AddressLabelBadge[];
  aiStatsNoteText?: string;
}

export interface AddressSummary {
  chain: ChainId;
  address: string;
  normalizedAddress: NormalizedAddress;
  alias?: string;
  displayName?: string;
  strategyFocus?: string;
  badges: AddressLabelBadge[];
  hoverBadges?: AddressLabelBadge[];
  statusBadges?: AddressLabelBadge[];
  hoverCard?: AddressHoverCard;
  noteSnippet?: string;
  watchlisted: boolean;
  detailUrl: string;
  updatedAt: string;
  version: string;
}

export interface AddressSearchResult extends AddressSummary {
  displayName: string;
  bio?: string;
  strategyFocus?: string;
  teamNote?: string;
  hoverBadges?: AddressLabelBadge[];
  statusBadges?: AddressLabelBadge[];
}

export interface WalletImportLabelDraft {
  name: string;
  value: string;
  kind: WalletLabelKind;
  evidence?: string;
  source?: WalletLabelSource;
  verificationNote?: string;
  sourceNote?: string;
}

export interface WalletImportWalletDraft {
  address: string;
  displayName: string;
  alias?: string;
  bio?: string;
  strategyFocus?: string;
  teamNote?: string;
  firstSeenAt?: string;
}

export interface WalletImportPreviewRow {
  rowNumber: number;
  wallet: WalletImportWalletDraft;
  labels: WalletImportLabelDraft[];
  note?: string;
  watchlistNote?: string;
  sourceExcerpt?: string;
  warnings: string[];
  errors: string[];
}

export type WalletAiConfidence = "high" | "medium" | "low" | "unknown";

export interface WalletAiProviderMeta {
  provider: "gemini" | "groq" | "none";
  model: string;
  fallbackUsed: boolean;
  succeededAt?: string;
}

export interface WalletAiExtractRequest {
  text: string;
  sourceName?: string;
}

export interface WalletAiExtractPreviewRow extends WalletImportPreviewRow {
  confidence: WalletAiConfidence;
  signalQuality: WalletAiSignalQuality;
  weatherSignals: WalletWeatherSignalDraft;
  highlightTags: string[];
  keyMetrics: string[];
  primarySignals: WalletPrimarySignal[];
  providerMeta?: WalletAiProviderMeta;
}

export interface WalletImportCommitRequest {
  rows: WalletImportPreviewRow[];
  mode?: "file" | "text" | "ai";
  sourceName?: string;
}

export interface WalletManualCreateInput {
  address: string;
  displayName: string;
  alias?: string;
  labelsText?: string;
  teamNote?: string;
}

export interface WalletAdminRow {
  wallet: Wallet;
  labels: WalletLabel[];
  highlights: AddressLabelBadge[];
  summaryText: string;
  statusBadges: WalletStatusBadge[];
  sourceMeta: {
    type: WalletSourceType;
    label: string;
    importedAt?: string;
    importBatchId?: string;
  };
  lastActivityAt: string;
}

export interface WalletListQuery {
  q?: string;
  view?: string;
  status?: WalletListStatus;
  source?: WalletSourceType | "all";
  labels?: string[];
  sort?: WalletListSort;
  cursor?: string;
  limit?: number;
  includeDeleted?: boolean;
  createdBefore?: string;
  createdAfter?: string;
  selected?: string;
  panel?: WalletListPanelMode;
}

export interface WalletSavedViewQuery
  extends Omit<WalletListQuery, "view" | "cursor" | "selected" | "panel"> {}

export interface WalletFacetCount {
  key: string;
  label: string;
  count: number;
}

export interface WalletFacetSummary {
  totalCount: number;
  activeCount: number;
  deletedCount: number;
  watchlistedCount: number;
  reviewNeededCount: number;
  sourceCounts: Record<WalletSourceType, number>;
  labelCounts: WalletFacetCount[];
}

export interface WalletSavedView {
  id: string;
  name: string;
  scope: "team";
  query: WalletSavedViewQuery;
  createdAt: string;
  updatedAt: string;
}

export interface WalletBulkRequest {
  action: WalletBulkAction;
  walletIds: string[];
  reason?: string | null;
  note?: string | null;
}

export interface WalletBulkResponse {
  action: WalletBulkAction;
  requestedCount: number;
  successCount: number;
  successIds: string[];
  failed: Array<{ walletId: string; error: string }>;
}

export interface WalletImportBatch {
  id: string;
  sourceType: WalletSourceType;
  sourceName?: string;
  provider?: WalletAiProviderMeta["provider"];
  model?: string;
  fallbackUsed: boolean;
  actor: string;
  rowCount: number;
  createdCount: number;
  updatedCount: number;
  failedCount: number;
  createdAt: string;
}

export interface WalletListResponse {
  items: WalletAdminRow[];
  nextCursor?: string;
  totalCount: number;
  facetCounts: WalletFacetSummary;
  savedView?: WalletSavedView | null;
  pageMeta: {
    limit: number;
    cursor?: string;
    returnedCount: number;
    sort: WalletListSort;
  };
}

export type HolderSurfaceKind =
  | "market-main-holders"
  | "feed-top-holders"
  | "unsupported";

export type HolderRowSide = "yes" | "no" | "unknown";

export interface HolderRowSnapshot {
  surfaceKind: HolderSurfaceKind;
  rowKey: string;
  normalizedAddress?: NormalizedAddress;
  rawAddress?: string;
  profileHref?: string;
  displayNameText?: string;
  amountText?: string;
  side: HolderRowSide;
  confidence: number;
}

export interface HolderPanelSnapshot {
  panelKey: string;
  marketSlug?: string;
  titleText: string;
  active: boolean;
  surfaceKind: HolderSurfaceKind;
  confidence: number;
  rows: HolderRowSnapshot[];
}

export type InlineAnnotationSource = "market_annotations" | "labels_lookup";

export type InlineAnnotationRenderMode = "inline" | "fallback_list";

export type ExtensionBootstrapState =
  | "cold_start"
  | "hydrating"
  | "ready"
  | "signed_out"
  | "disabled"
  | "degraded"
  | "error";

export type ExtensionWakeReason =
  | "install"
  | "startup"
  | "message"
  | "tab_activated"
  | "tab_updated"
  | "route_change"
  | "pageshow"
  | "visibility_change"
  | "manual_refresh"
  | "open_polymarket"
  | "unknown";

export type ExtensionDegradedReason =
  | "auth_required"
  | "auth_expired"
  | "surface_not_found"
  | "unsupported_surface"
  | "content_script_unavailable"
  | "network_error"
  | "rate_limited"
  | "upstream_error"
  | "unknown";

export interface ResolvedInlineAnnotation {
  rowKey: string;
  normalizedAddress: NormalizedAddress;
  surfaceKind: HolderSurfaceKind;
  source: InlineAnnotationSource;
  renderMode: InlineAnnotationRenderMode;
  aliasText: string;
  displayName?: string;
  strategyFocus?: string;
  primaryBadge?: AddressLabelBadge;
  hoverBadges?: AddressLabelBadge[];
  statusBadges?: AddressLabelBadge[];
  hoverCard?: AddressHoverCard;
  noteSnippet?: string;
  detailUrl: string;
  summaryVersion: string;
}

export interface ExtensionHealthSnapshot {
  bootstrapState: ExtensionBootstrapState;
  wakeReason: ExtensionWakeReason;
  degradedReason?: ExtensionDegradedReason;
  lastSuccessfulSlug?: string;
  lastAnnotationSyncAt?: string;
  updatedAt: string;
}

export interface ExtensionHealthEvent {
  extensionVersion: string;
  parserVersion: string;
  at: string;
  wakeReason?: ExtensionWakeReason;
  bootstrapState?: ExtensionBootstrapState;
  degradedReason?: ExtensionDegradedReason;
  lastSuccessfulSlug?: string;
  lastAnnotationSyncAt?: string;
  marketSlug?: string;
  surfaceKind?: HolderSurfaceKind;
  surfaceFound: boolean;
  rowsDetected: number;
  rowsAnnotated: number;
  errorCode?: string;
  pageLanguage?: string;
}

export interface PolymarketTokenHolder {
  proxyWallet: string;
  bio: string;
  asset: string;
  pseudonym: string;
  amount: number;
  displayUsernamePublic: boolean;
  outcomeIndex: number;
  name: string;
  profileImage: string;
  profileImageOptimized: string;
  verified: boolean;
}

export interface PolymarketTokenHoldersGroup {
  token: string;
  holders: PolymarketTokenHolder[];
}

export interface AnnotatedHolderAmount {
  outcomeIndex: number;
  amount: number;
}

export interface AnnotatedHolder {
  proxyWallet: string;
  normalizedAddress: NormalizedAddress;
  displayName: string;
  outcomeIndex: number;
  amount: number;
  amountByOutcome: AnnotatedHolderAmount[];
  summary?: AddressSummary;
}

export type MarketAnnotationResolvedBy =
  | "event_slug"
  | "market_slug"
  | "next_data_event"
  | "error";

export interface HolderSurfaceHint {
  normalizedAddress: NormalizedAddress;
  alias?: string;
  badges: string[];
  watchlisted: boolean;
  detailUrl?: string;
}

export interface MarketAnnotationResponse {
  market: {
    slug: string;
    conditionId: string;
    title: string;
    outcomes: string[];
  };
  holders: AnnotatedHolder[];
  labelsVersion: string;
  refreshedAt: string;
  sourceStatus: "live" | "stale" | "error";
  matchedSummaryCount?: number;
  resolvedBy?: MarketAnnotationResolvedBy;
  holderSurfaceHints?: HolderSurfaceHint[];
}

export type AdminExtensionInviteStatus = "active" | "disabled";
export type AdminExtensionInviteEffectiveStatus = "active" | "disabled" | "expired";
export type AdminExtensionSessionStatus = "active" | "idle" | "expired" | "revoked";

export interface AdminExtensionOverview {
  totalInvites: number;
  activeInvites: number;
  disabledInvites: number;
  expiredInvites: number;
  activeSessions: number;
  idleSessions: number;
  expiredSessions: number;
  revokedSessions: number;
}

export interface AdminExtensionInviteItem {
  code: string;
  memberLabel: string;
  status: AdminExtensionInviteStatus;
  effectiveStatus: AdminExtensionInviteEffectiveStatus;
  createdAt: string;
  updatedAt: string;
  expiresAt?: string | null;
  lastUsedAt?: string | null;
  boundUserId?: string | null;
  boundUserEmail?: string | null;
  boundAt?: string | null;
  sessionCount: number;
  activeSessionCount: number;
  latestSessionAt?: string | null;
}

export interface AdminExtensionSessionItem {
  id: string;
  inviteCode: string;
  memberLabel: string;
  userId?: string | null;
  userEmail?: string | null;
  deviceLabel?: string | null;
  extensionVersion?: string | null;
  createdAt: string;
  lastSeenAt: string;
  refreshExpiresAt: string;
  revokedAt?: string | null;
  status: AdminExtensionSessionStatus;
}

export type ExtensionRuntimeMode = "dev" | "release";

export interface ExtensionRuntimeConfig {
  mode: ExtensionRuntimeMode;
  backendBaseUrl: string;
  adminBaseUrl: string;
  allowBackendOverride: boolean;
  showDebugControls: boolean;
  enabledMarkets: string[];
  extensionVersion: string;
  workbenchPath: string;
  privacyPolicyUrl?: string;
}

export interface ExtensionAuthSession {
  userId?: string;
  userEmail?: string;
  memberLabel: string;
  inviteCode: string;
  deviceLabel?: string;
  extensionVersion?: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  refreshExpiresAt: string;
}

export interface ExtensionAuthExchangeRequest {
  inviteCode: string;
  deviceLabel?: string;
  extensionVersion?: string;
}

export interface ExtensionAuthLoginRequest {
  email: string;
  password: string;
  inviteCode?: string;
  deviceLabel?: string;
  extensionVersion?: string;
}

export interface ExtensionAuthRegisterRequest extends ExtensionAuthLoginRequest {
  inviteCode: string;
}

export interface ExtensionAuthExchangeResponse {
  userId?: string;
  userEmail?: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  refreshExpiresAt: string;
  memberLabel: string;
  inviteCode: string;
}

export interface ExtensionAuthRefreshRequest {
  refreshToken: string;
}

export interface ExtensionAuthRefreshResponse extends ExtensionAuthExchangeResponse {}

export interface ExtensionAuthLogoutRequest {
  refreshToken: string;
}

export interface ExtensionHealthRequest {
  slug?: string;
  addresses?: string[];
  wakeReason?: ExtensionWakeReason;
  bootstrapState?: ExtensionBootstrapState;
  degradedReason?: ExtensionDegradedReason;
  lastSuccessfulSlug?: string;
  lastAnnotationSyncAt?: string;
}

export interface ExtensionHealthResponse {
  ok: boolean;
  now: string;
  labelsVersion: string;
  runtime?: ExtensionHealthSnapshot;
  auth: {
    memberLabel: string;
    sessionId: string;
    deviceLabel?: string | null;
    extensionVersion?: string | null;
    refreshExpiresAt: string;
  };
  market?: {
    requestedSlug: string;
    marketSlug: string;
    conditionId: string;
    sourceStatus: MarketAnnotationResponse["sourceStatus"];
    resolvedBy?: MarketAnnotationResolvedBy;
    holderCount: number;
    matchedSummaryCount: number;
    holderSurfaceHints?: HolderSurfaceHint[];
  };
  lookup?: {
    requestedCount: number;
    matchedCount: number;
    version: string;
  };
  errors?: string[];
}
