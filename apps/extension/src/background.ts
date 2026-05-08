interface ExtensionConfig {
  enabled: boolean;
  debugMode: boolean;
  backendBaseUrl: string;
  readOnlyToken: string;
  enabledMarkets: string[];
  refreshIntervalMs: number;
}

interface ExtensionRuntimeConfig {
  mode: "dev" | "release";
  backendBaseUrl: string;
  adminBaseUrl: string;
  allowBackendOverride: boolean;
  showDebugControls: boolean;
  enabledMarkets: string[];
  extensionVersion: string;
  workbenchPath: string;
  privacyPolicyUrl?: string;
}

interface ExtensionAuthSession {
  userId?: string;
  userEmail?: string;
  inviteCode: string;
  deviceLabel?: string;
  extensionVersion?: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  refreshExpiresAt: string;
  memberLabel: string;
}

interface ExtensionAuthExchangeResponse extends ExtensionAuthSession {}

interface AddressLabelBadge {
  id: string;
  text: string;
  tone: string;
  kind?: string;
  priority?: number;
  detailText?: string;
  metricText?: string;
  isPrimary?: boolean;
}

interface AddressHoverCard {
  officialTags: AddressLabelBadge[];
  officialNoteText?: string;
  aiTags: AddressLabelBadge[];
  aiBriefShortText?: string;
  aiStatsNoteText?: string;
  aiNarrativeNoteText?: string;
  aiDeepNoteText?: string;
}

interface MarketAnnotationResponse {
  market: {
    slug: string;
    conditionId: string;
    title: string;
    outcomes: string[];
  };
  holders: Array<{
    proxyWallet: string;
    normalizedAddress: string;
    displayName: string;
    outcomeIndex: number;
    amount: number;
    amountByOutcome: Array<{ outcomeIndex: number; amount: number }>;
    summary?: {
      alias?: string;
      displayName?: string;
      strategyFocus?: string;
      badges: AddressLabelBadge[];
      hoverBadges?: AddressLabelBadge[];
      statusBadges?: AddressLabelBadge[];
      hoverCard?: AddressHoverCard;
      noteSnippet?: string;
      aiBriefShort?: string;
      aiBriefNote?: string;
      aiDeepNote?: string;
      activityLevel?: string;
      watchlisted: boolean;
      detailUrl: string;
      updatedAt: string;
      version: string;
    };
  }>;
  labelsVersion: string;
  refreshedAt: string;
  sourceStatus: "live" | "stale" | "error";
  matchedSummaryCount?: number;
  resolvedBy?: "event_slug" | "market_slug" | "next_data_event" | "error";
  holderSurfaceHints?: Array<{
    normalizedAddress: string;
    alias?: string;
    badges: string[];
    watchlisted: boolean;
    detailUrl?: string;
  }>;
}

interface CachedMarketEntry {
  etag: string | null;
  expiresAt: number;
  updatedAt: string;
  memberScope: string;
  payload: MarketAnnotationResponse;
}

interface AddressSearchResult {
  chain: "polygon";
  address: string;
  normalizedAddress: string;
  displayName: string;
  alias?: string;
  strategyFocus?: string;
  badges: AddressLabelBadge[];
  hoverBadges?: AddressLabelBadge[];
  statusBadges?: AddressLabelBadge[];
  hoverCard?: AddressHoverCard;
  noteSnippet?: string;
  aiBriefShort?: string;
  aiBriefNote?: string;
  aiDeepNote?: string;
  activityLevel?: string;
  watchlisted: boolean;
  detailUrl: string;
  updatedAt: string;
  version: string;
  bio?: string;
  teamNote?: string;
}

interface AddressLookupSummary {
  chain: "polygon";
  address: string;
  normalizedAddress: string;
  alias?: string;
  displayName?: string;
  strategyFocus?: string;
  badges: AddressLabelBadge[];
  hoverBadges?: AddressLabelBadge[];
  statusBadges?: AddressLabelBadge[];
  hoverCard?: AddressHoverCard;
  noteSnippet?: string;
  aiBriefShort?: string;
  aiBriefNote?: string;
  aiDeepNote?: string;
  activityLevel?: string;
  watchlisted: boolean;
  detailUrl: string;
  updatedAt: string;
  version: string;
}

interface SyncState {
  lastSyncAt?: string;
  lastError?: string;
}

type ExtensionRuntimeStatus =
  | "idle"
  | "bootstrap"
  | "wake"
  | "ready"
  | "degraded"
  | "disabled"
  | "signed_out";

type ExtensionBootstrapState =
  | "cold_start"
  | "hydrating"
  | "ready"
  | "signed_out"
  | "disabled"
  | "degraded"
  | "error";

type ExtensionWakeReason =
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

type ExtensionDegradedReason =
  | "auth_required"
  | "auth_expired"
  | "surface_not_found"
  | "unsupported_surface"
  | "content_script_unavailable"
  | "network_error"
  | "rate_limited"
  | "upstream_error"
  | "unknown";

interface PopupState {
  runtimeConfig: ExtensionRuntimeConfig;
  config: ExtensionConfig;
  auth: {
    status: "connected" | "signed_out" | "expired";
    isAuthenticated: boolean;
    userEmail?: string;
    memberLabel?: string;
    inviteCode?: string;
    expiresAt?: string;
    refreshExpiresAt?: string;
  };
  sync: SyncState;
  runtime: RuntimeCoordinatorState;
}

interface PageSurfaceState {
  slug?: string;
  marketSlug?: string;
  surfaceKind?: "market-main-holders" | "feed-top-holders";
  surfaceFound: boolean;
  surfaceActive: boolean;
  fallbackMode: boolean;
  rowsDetected: number;
  rowsAnnotated: number;
  visibleAddressCount: number;
  sourceStatus?: "live" | "stale" | "error";
  labelsVersion?: string;
  resolvedBy?: "event_slug" | "market_slug" | "next_data_event" | "error";
  errorCode?: string;
  language?: string;
  matched?: Array<{
    address: string;
    aliasText: string;
    detailUrl: string;
    source: "market_annotations" | "labels_lookup";
  }>;
  runtimeStatus?: ExtensionRuntimeStatus;
  runtimeMessage?: string;
  lastStageAt?: string;
  lastBootstrapAt?: string;
  lastWakeAt?: string;
  lastReadyAt?: string;
  lastDegradedAt?: string;
  lastHealthAt?: string;
  healthStatus?: "ok" | "error" | "skipped";
  healthLabelsVersion?: string;
  healthError?: string;
  tabId?: number;
  tabUrl?: string;
  lastUpdatedAt: string;
}

interface BrowserTabLike {
  id?: number;
  url?: string;
  windowId?: number;
}

interface BrowserTabActivatedInfo {
  tabId: number;
}

interface BrowserTabChangeInfo {
  status?: string;
  url?: string;
}

interface RuntimeHealthEvent {
  extensionVersion: string;
  parserVersion: string;
  at: string;
  marketSlug?: string;
  surfaceKind?: "market-main-holders" | "feed-top-holders";
  surfaceFound: boolean;
  rowsDetected: number;
  rowsAnnotated: number;
  errorCode?: string;
  pageLanguage?: string;
  runtimeStatus?: ExtensionRuntimeStatus;
  sourceStatus?: "live" | "stale" | "error";
  addresses?: string[];
}

interface RuntimeCoordinatorState {
  status: ExtensionRuntimeStatus;
  detail?: string;
  tabId?: number;
  tabUrl?: string;
  slug?: string;
  surfaceKind?: PageSurfaceState["surfaceKind"];
  sourceStatus?: PageSurfaceState["sourceStatus"];
  errorCode?: string;
  lastEventAt: string;
  lastBootstrapAt?: string;
  lastWakeAt?: string;
  lastReadyAt?: string;
  lastDegradedAt?: string;
  lastHealthAt?: string;
  lastHealthUploadAt?: string;
  lastHealthUploadError?: string;
  lastLabelsVersion?: string;
}

interface ExtensionHealthRequest {
  slug?: string;
  addresses?: string[];
  wakeReason?: ExtensionWakeReason;
  bootstrapState?: ExtensionBootstrapState;
  degradedReason?: ExtensionDegradedReason;
  lastSuccessfulSlug?: string;
  lastAnnotationSyncAt?: string;
}

interface ExtensionHealthResponse {
  ok: boolean;
  now: string;
  labelsVersion: string;
  errors?: string[];
  runtime?: {
    bootstrapState: ExtensionBootstrapState;
    wakeReason: ExtensionWakeReason;
    degradedReason?: ExtensionDegradedReason;
    lastSuccessfulSlug?: string;
    lastAnnotationSyncAt?: string;
    updatedAt: string;
  };
}

interface ContentScriptCommand {
  type: "wsm:refreshAnnotations" | "wsm:ping";
  lifecycle?: "bootstrap" | "wake" | "manual";
  forceVisibleLookup?: boolean;
  forceRevalidate?: boolean;
}

type BackgroundMessage =
  | { type: "wsm:getPopupState" }
  | {
      type: "wsm:updateConfig";
      patch: Partial<Pick<ExtensionConfig, "enabled" | "debugMode" | "backendBaseUrl">>;
    }
  | {
      type: "wsm:authLogin";
      email: string;
      password: string;
      inviteCode?: string;
      deviceLabel?: string;
    }
  | { type: "wsm:authExchange"; inviteCode: string; deviceLabel?: string }
  | { type: "wsm:logout" }
  | { type: "wsm:getMarketAnnotations"; slug: string; forceRefresh?: boolean }
  | { type: "wsm:getPageSurfaceState" }
  | { type: "wsm:reportPageSurfaceState"; state?: PageSurfaceState; surface?: PageSurfaceState }
  | { type: "wsm:reportHealth"; event: RuntimeHealthEvent }
  | { type: "wsm:lookupAddresses"; addresses: string[] }
  | { type: "wsm:searchAddresses"; query: string; limit?: number }
  | { type: "wsm:refreshActiveTab" }
  | { type: "wsm:openPolymarket" }
  | { type: "wsm:openWorkbench" }
  | {
      type: "wsm:openSidePanel";
      address?: string;
      normalizedAddress?: string;
      displayName?: string;
      source?: "hover" | "inline" | "popup" | "search";
    };

(() => {
const CONFIG_KEY = "wsm.config";
const AUTH_SESSION_KEY = "wsm.authSession";
const SYNC_STATE_KEY = "wsm.syncState";
const RUNTIME_STATE_KEY = "wsm.runtimeState";
const PAGE_SURFACE_STATE_KEY = "wsm.pageSurfaceState";
const SIDEPANEL_FOCUS_KEY = "wsm.sidepanelFocus";
const MARKET_CACHE_PREFIX = "wsm.marketCache.";
const ACCESS_TOKEN_REFRESH_BUFFER_MS = 60_000;
const DEFAULT_REFRESH_INTERVAL_MS = 180_000;
const MARKET_CACHE_TTL_MS = 45_000;
const ADDRESS_PATTERN = /0x[a-fA-F0-9]{40}/;
const DEFAULT_RUNTIME_CONFIG: ExtensionRuntimeConfig = {
  mode: "dev",
  backendBaseUrl: "http://localhost:3000",
  adminBaseUrl: "http://localhost:3000",
  allowBackendOverride: true,
  showDebugControls: true,
  enabledMarkets: ["polymarket.com"],
  extensionVersion: chrome.runtime.getManifest().version,
  workbenchPath: "/wallets",
  privacyPolicyUrl: "/extension/privacy"
};

const memoryCache = new Map<string, CachedMarketEntry>();
const pendingContentScriptEnsures = new Map<number, Promise<boolean>>();
const pendingTabRefreshes = new Map<string, Promise<{ skipped?: true; injected?: boolean }>>();
let runtimeConfigPromise: Promise<ExtensionRuntimeConfig> | null = null;
let pageSurfaceState: PageSurfaceState | null = null;

const createDefaultRuntimeState = (): RuntimeCoordinatorState => ({
  status: "idle",
  detail: "Coordinator idle.",
  lastEventAt: new Date().toISOString()
});

const mergeRuntimeState = (
  current: RuntimeCoordinatorState,
  patch: Partial<RuntimeCoordinatorState>
): RuntimeCoordinatorState => {
  const lastEventAt = patch.lastEventAt ?? new Date().toISOString();
  const next: RuntimeCoordinatorState = {
    ...current,
    ...patch,
    lastEventAt
  };

  if (patch.status === "bootstrap" && !patch.lastBootstrapAt) {
    next.lastBootstrapAt = lastEventAt;
  }
  if (patch.status === "wake" && !patch.lastWakeAt) {
    next.lastWakeAt = lastEventAt;
  }
  if (patch.status === "ready" && !patch.lastReadyAt) {
    next.lastReadyAt = lastEventAt;
  }
  if (patch.status === "degraded" && !patch.lastDegradedAt) {
    next.lastDegradedAt = lastEventAt;
  }

  return next;
};

const stripTrailingSlash = (value: string) => value.replace(/\/+$/, "");
const toIsoNow = () => new Date().toISOString();
const parseTimestamp = (value?: string) => (value ? new Date(value).getTime() : 0);
const isExpired = (value?: string, bufferMs = 0) => Date.now() >= parseTimestamp(value) - bufferMs;
const normalizeAddress = (value: string) => {
  const match = value.match(ADDRESS_PATTERN)?.[0];
  return match ? match.toLowerCase() : null;
};
const isMessagingError = (error: unknown) =>
  error instanceof Error &&
  /Receiving end does not exist|Could not establish connection/i.test(error.message);
const isTransientTabError = (error: unknown) =>
  error instanceof Error &&
  /No tab with id|The tab was closed|Tabs cannot be edited right now|Frame with ID 0 was removed|Cannot access contents of url/i.test(
    error.message
  );

const mapRuntimeStatusToBootstrapState = (
  status: ExtensionRuntimeStatus | undefined
): ExtensionBootstrapState => {
  switch (status) {
    case "bootstrap":
    case "wake":
    case "idle":
      return "hydrating";
    case "ready":
      return "ready";
    case "signed_out":
      return "signed_out";
    case "disabled":
      return "disabled";
    case "degraded":
      return "degraded";
    default:
      return "cold_start";
  }
};

const inferWakeReason = (status: ExtensionRuntimeStatus | undefined): ExtensionWakeReason => {
  switch (status) {
    case "bootstrap":
      return "startup";
    case "wake":
      return "tab_activated";
    case "ready":
      return "route_change";
    case "degraded":
      return "message";
    default:
      return "unknown";
  }
};

const inferDegradedReason = (
  status: ExtensionRuntimeStatus | undefined,
  errorCode?: string,
  detail?: string
): ExtensionDegradedReason | undefined => {
  const normalizedError = errorCode?.trim().toLowerCase();
  if (status === "signed_out") {
    return "auth_required";
  }

  if (!normalizedError && status !== "degraded") {
    return undefined;
  }

  if (isSurfaceWaitingError(normalizedError)) {
    return undefined;
  }

  if (normalizedError === "panel_missing" || normalizedError === "slug_missing") {
    return "surface_not_found";
  }

  if (normalizedError === "panel_inactive") {
    return "unsupported_surface";
  }

  if (normalizedError === "refresh_failed" || detail?.toLowerCase().includes("fetch")) {
    return "network_error";
  }

  if (detail?.toLowerCase().includes("expired")) {
    return "auth_expired";
  }

  return "unknown";
};

const readRuntimeConfig = async (): Promise<ExtensionRuntimeConfig> => {
  if (runtimeConfigPromise) {
    return runtimeConfigPromise;
  }

  runtimeConfigPromise = (async () => {
    try {
      const response = await fetch(chrome.runtime.getURL("runtime-config.json"), {
        cache: "no-store"
      });
      if (!response.ok) {
        throw new Error(`runtime-config.json request failed with ${response.status}`);
      }

      const payload = (await response.json()) as Partial<ExtensionRuntimeConfig>;
      return {
        ...DEFAULT_RUNTIME_CONFIG,
        ...payload,
        backendBaseUrl: payload.backendBaseUrl?.trim() || DEFAULT_RUNTIME_CONFIG.backendBaseUrl,
        adminBaseUrl:
          payload.adminBaseUrl?.trim() ||
          payload.backendBaseUrl?.trim() ||
          DEFAULT_RUNTIME_CONFIG.adminBaseUrl,
        enabledMarkets:
          payload.enabledMarkets?.filter((item): item is string => typeof item === "string") ??
          DEFAULT_RUNTIME_CONFIG.enabledMarkets,
        extensionVersion:
          payload.extensionVersion?.trim() || chrome.runtime.getManifest().version
      };
    } catch {
      return DEFAULT_RUNTIME_CONFIG;
    }
  })();

  return runtimeConfigPromise;
};

const createDefaultConfig = (runtimeConfig: ExtensionRuntimeConfig): ExtensionConfig => ({
  enabled: true,
  debugMode: runtimeConfig.mode === "dev",
  backendBaseUrl: runtimeConfig.backendBaseUrl,
  readOnlyToken: "",
  enabledMarkets: runtimeConfig.enabledMarkets,
  refreshIntervalMs: DEFAULT_REFRESH_INTERVAL_MS
});

const sanitizeConfig = (
  runtimeConfig: ExtensionRuntimeConfig,
  rawConfig?: Partial<ExtensionConfig> | null
): ExtensionConfig => {
  const defaults = createDefaultConfig(runtimeConfig);
  const merged = {
    ...defaults,
    ...(rawConfig ?? {})
  };

  return {
    enabled: merged.enabled,
    debugMode: merged.debugMode,
    backendBaseUrl: runtimeConfig.allowBackendOverride
      ? merged.backendBaseUrl?.trim() || runtimeConfig.backendBaseUrl
      : runtimeConfig.backendBaseUrl,
    readOnlyToken: runtimeConfig.mode === "dev" ? merged.readOnlyToken?.trim() ?? "" : "",
    enabledMarkets: runtimeConfig.enabledMarkets,
    refreshIntervalMs: Number.isFinite(merged.refreshIntervalMs)
      ? Math.max(30_000, merged.refreshIntervalMs)
      : defaults.refreshIntervalMs
  };
};

const readConfig = async (): Promise<ExtensionConfig> => {
  const runtimeConfig = await readRuntimeConfig();
  const stored = await chrome.storage.local.get(CONFIG_KEY);
  return sanitizeConfig(runtimeConfig, stored?.[CONFIG_KEY] as Partial<ExtensionConfig> | undefined);
};

const writeConfig = async (patch?: Partial<ExtensionConfig>) => {
  const runtimeConfig = await readRuntimeConfig();
  const stored = await chrome.storage.local.get(CONFIG_KEY);
  const nextConfig = sanitizeConfig(runtimeConfig, {
    ...(stored?.[CONFIG_KEY] as Partial<ExtensionConfig> | undefined),
    ...(patch ?? {})
  });

  await chrome.storage.local.set({
    [CONFIG_KEY]: nextConfig
  });

  return nextConfig;
};

const ensureDefaultConfig = async () => {
  const stored = await chrome.storage.local.get(CONFIG_KEY);
  if (!stored?.[CONFIG_KEY]) {
    await writeConfig();
  }
};

const readAuthSession = async (): Promise<ExtensionAuthSession | null> => {
  const stored = await chrome.storage.local.get(AUTH_SESSION_KEY);
  return (stored?.[AUTH_SESSION_KEY] as ExtensionAuthSession | undefined) ?? null;
};

const writeAuthSession = async (session: ExtensionAuthSession) => {
  await chrome.storage.local.set({
    [AUTH_SESSION_KEY]: session
  });
};

const clearAuthSession = async () => {
  await chrome.storage.local.remove(AUTH_SESSION_KEY);
};

const readSyncState = async (): Promise<SyncState> => {
  const stored = await chrome.storage.local.get(SYNC_STATE_KEY);
  return (stored?.[SYNC_STATE_KEY] as SyncState | undefined) ?? {};
};

const writeSyncState = async (patch: SyncState) => {
  const current = await readSyncState();
  await chrome.storage.local.set({
    [SYNC_STATE_KEY]: {
      ...current,
      ...patch
    }
  });
};

const readRuntimeState = async (): Promise<RuntimeCoordinatorState> => {
  const stored = await chrome.storage.local.get(RUNTIME_STATE_KEY);
  return (stored?.[RUNTIME_STATE_KEY] as RuntimeCoordinatorState | undefined) ?? createDefaultRuntimeState();
};

const writeRuntimeState = async (patch: Partial<RuntimeCoordinatorState>) => {
  const current = await readRuntimeState();
  const next = mergeRuntimeState(current, patch);
  await chrome.storage.local.set({
    [RUNTIME_STATE_KEY]: next
  });
  return next;
};

const clearRuntimeState = async (status: ExtensionRuntimeStatus, detail: string) =>
  writeRuntimeState({
    status,
    detail,
    tabId: undefined,
    tabUrl: undefined,
    slug: undefined,
    surfaceKind: undefined,
    sourceStatus: undefined,
    errorCode: undefined,
    lastBootstrapAt: undefined,
    lastWakeAt: undefined,
    lastReadyAt: undefined,
    lastDegradedAt: undefined
  });

const readPageSurfaceState = async (): Promise<PageSurfaceState | null> => {
  if (pageSurfaceState) {
    return pageSurfaceState;
  }

  const stored = await chrome.storage.local.get(PAGE_SURFACE_STATE_KEY);
  pageSurfaceState = (stored?.[PAGE_SURFACE_STATE_KEY] as PageSurfaceState | undefined) ?? null;
  return pageSurfaceState;
};

const writePageSurfaceState = async (state: PageSurfaceState | null) => {
  pageSurfaceState = state;
  if (!state) {
    await chrome.storage.local.remove(PAGE_SURFACE_STATE_KEY);
    return null;
  }

  await chrome.storage.local.set({
    [PAGE_SURFACE_STATE_KEY]: state
  });
  return state;
};

const captureSurfaceState = async (surface: PageSurfaceState) => {
  const current = await readPageSurfaceState();
  const next: PageSurfaceState = {
    ...(current ?? {}),
    ...surface,
    lastUpdatedAt: surface.lastUpdatedAt || new Date().toISOString()
  };
  await writePageSurfaceState(next);
  return next;
};

const getMemberScope = (session: ExtensionAuthSession | null, config: ExtensionConfig) => {
  if (session?.memberLabel?.trim()) {
    return session.memberLabel.trim();
  }

  if (config.readOnlyToken.trim()) {
    return "legacy-token";
  }

  return "anonymous";
};

const getCacheKey = (memberScope: string, slug: string) => `${MARKET_CACHE_PREFIX}${memberScope}.${slug}`;

const readCachedEntry = async (memberScope: string, slug: string): Promise<CachedMarketEntry | null> => {
  const cacheKey = getCacheKey(memberScope, slug);
  const inMemory = memoryCache.get(cacheKey);
  if (inMemory) {
    return inMemory;
  }

  const stored = await chrome.storage.local.get(cacheKey);
  const entry = stored?.[cacheKey] as CachedMarketEntry | undefined;
  if (!entry) {
    return null;
  }

  memoryCache.set(cacheKey, entry);
  return entry;
};

const writeCachedEntry = async (memberScope: string, slug: string, entry: CachedMarketEntry) => {
  const cacheKey = getCacheKey(memberScope, slug);
  memoryCache.set(cacheKey, entry);
  await chrome.storage.local.set({ [cacheKey]: entry });
  await writeSyncState({ lastSyncAt: entry.updatedAt });
};

const clearMarketCaches = async () => {
  memoryCache.clear();
  const stored = await chrome.storage.local.get(null);
  const keys = Object.keys(stored).filter((key) => key.startsWith(MARKET_CACHE_PREFIX));
  if (keys.length > 0) {
    await chrome.storage.local.remove(keys);
  }
};

const getEffectiveBackendBaseUrl = (runtimeConfig: ExtensionRuntimeConfig, config: ExtensionConfig) =>
  stripTrailingSlash(
    runtimeConfig.allowBackendOverride ? config.backendBaseUrl || runtimeConfig.backendBaseUrl : runtimeConfig.backendBaseUrl
  );

const buildApiUrl = (backendBaseUrl: string, pathname: string, query?: Record<string, string>) => {
  const url = new URL(pathname, backendBaseUrl);
  Object.entries(query ?? {}).forEach(([key, value]) => {
    url.searchParams.set(key, value);
  });
  return url.toString();
};

const isSurfaceWaitingError = (errorCode?: string) => {
  const normalized = errorCode?.trim().toLowerCase();
  return normalized === "panel_missing" || normalized === "panel_inactive" || normalized === "slug_missing";
};

const describeSurfaceRuntime = (state: PageSurfaceState) => {
  if (state.runtimeMessage?.trim()) {
    return state.runtimeMessage.trim();
  }
  if (state.errorCode === "panel_missing") {
    return "Waiting for the holders surface to appear.";
  }
  if (state.errorCode === "panel_inactive") {
    return "Open the holders panel to start annotations.";
  }
  if (state.errorCode === "slug_missing") {
    return "Open a market page to start annotations.";
  }
  if (state.errorCode?.trim()) {
    return state.errorCode.trim();
  }
  if (state.fallbackMode) {
    return "Running with fallback rendering.";
  }
  if (state.rowsAnnotated > 0) {
    return "Inline annotations active.";
  }
  return "Page runtime updated.";
};

const deriveRuntimeStatusFromSurface = (state: PageSurfaceState): ExtensionRuntimeStatus => {
  if (state.runtimeStatus) {
    return state.runtimeStatus;
  }
  if (isSurfaceWaitingError(state.errorCode)) {
    return "wake";
  }
  if (state.errorCode || state.fallbackMode || state.sourceStatus === "stale" || state.sourceStatus === "error") {
    return "degraded";
  }
  return "ready";
};

const deriveRuntimeStatusFromHealthEvent = (event: RuntimeHealthEvent): ExtensionRuntimeStatus =>
  event.runtimeStatus ?? (event.errorCode ? "degraded" : "ready");

const syncRuntimeStateFromSurface = async (state: PageSurfaceState) => {
  const status = deriveRuntimeStatusFromSurface(state);
  return writeRuntimeState({
    status,
    detail: describeSurfaceRuntime(state),
    tabId: state.tabId,
    tabUrl: state.tabUrl,
    slug: state.slug ?? state.marketSlug,
    surfaceKind: state.surfaceKind,
    sourceStatus: state.sourceStatus,
    errorCode: state.errorCode,
    lastEventAt: state.lastStageAt ?? state.lastUpdatedAt,
    lastBootstrapAt: state.lastBootstrapAt,
    lastWakeAt: state.lastWakeAt,
    lastReadyAt: state.lastReadyAt,
    lastDegradedAt: state.lastDegradedAt,
    lastHealthUploadError: undefined
  });
};

const createDeviceLabel = () => {
  const manifest = chrome.runtime.getManifest();
  const browserName = navigator.userAgent.includes("Edg/") ? "Edge" : "Chrome";
  return `${browserName} ${manifest.version}`;
};

const readAuthorizedHeader = async (forceRefresh = false) => {
  const config = await readConfig();
  if (config.readOnlyToken.trim()) {
    return {
      headerValue: `Bearer ${config.readOnlyToken.trim()}`,
      config,
      session: null as ExtensionAuthSession | null
    };
  }

  const session = await ensureActiveSession(forceRefresh);
  return {
    headerValue: `Bearer ${session.accessToken}`,
    config,
    session
  };
};

const requestJson = async <T,>(
  pathname: string,
  options?: {
    method?: "GET" | "POST";
    body?: unknown;
    headers?: Record<string, string>;
    ifNoneMatch?: string | null;
    auth?: "required" | "optional" | "none";
    forceRefresh?: boolean;
    query?: Record<string, string>;
  }
) => {
  const runtimeConfig = await readRuntimeConfig();
  const config = await readConfig();
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...(options?.headers ?? {})
  };
  let session: ExtensionAuthSession | null = null;

  if (options?.ifNoneMatch) {
    headers["If-None-Match"] = options.ifNoneMatch;
  }

  if (options?.auth !== "none") {
    if (config.readOnlyToken.trim()) {
      headers.Authorization = `Bearer ${config.readOnlyToken.trim()}`;
    } else if (options?.auth === "required" || options?.auth === "optional") {
      try {
        const authorized = await readAuthorizedHeader(options?.forceRefresh);
        headers.Authorization = authorized.headerValue;
        session = authorized.session;
      } catch (error) {
        if (options?.auth === "required") {
          throw error;
        }
      }
    }
  }

  if (options?.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(
    buildApiUrl(getEffectiveBackendBaseUrl(runtimeConfig, config), pathname, options?.query),
    {
      method: options?.method ?? "GET",
      headers,
      body: options?.body !== undefined ? JSON.stringify(options.body) : undefined,
      cache: "no-store"
    }
  );

  if (response.status === 204) {
    return {
      response,
      payload: undefined as T | undefined,
      session
    };
  }

  if (response.status === 304) {
    return {
      response,
      payload: undefined as T | undefined,
      session
    };
  }

  const payloadText = await response.text();
  const payload = payloadText ? (JSON.parse(payloadText) as T) : undefined;

  return {
    response,
    payload,
    session
  };
};

const uploadRuntimeHealth = async (event: RuntimeHealthEvent) => {
  const config = await readConfig();
  const session = await readAuthSession();
  const runtime = await readRuntimeState();
  const lastSync = await readSyncState();
  const runtimeStatus = event.runtimeStatus ?? runtime.status;
  const lastSuccessfulSlug =
    runtime.slug?.trim() ||
    (event.errorCode ? undefined : event.marketSlug?.trim()) ||
    undefined;
  const bootstrapState = mapRuntimeStatusToBootstrapState(runtimeStatus);
  const wakeReason = inferWakeReason(runtimeStatus);
  const degradedReason = inferDegradedReason(
    runtimeStatus,
    event.errorCode,
    runtime.detail
  );
  if (!config.enabled) {
    return {
      status: "skipped" as const,
      at: toIsoNow(),
      error: "Extension disabled."
    };
  }

  if (!config.readOnlyToken.trim() && !session) {
    return {
      status: "skipped" as const,
      at: toIsoNow(),
      error: "Authentication required."
    };
  }

  try {
    const { response, payload } = await requestJson<ExtensionHealthResponse>("/api/extension/health", {
      method: "POST",
      auth: "required",
      body: {
        slug: event.marketSlug,
        addresses: event.addresses,
        wakeReason,
        bootstrapState,
        degradedReason,
        lastSuccessfulSlug,
        lastAnnotationSyncAt: lastSync.lastSyncAt
      } satisfies ExtensionHealthRequest
    });

    if (!response.ok || !payload) {
      throw new Error(
        (payload as { error?: string } | undefined)?.error ?? `Health request failed with ${response.status}`
      );
    }

    return {
      status: payload.errors?.length ? ("error" as const) : ("ok" as const),
      at: payload.now,
      labelsVersion: payload.labelsVersion,
      error: payload.errors?.join(" | ")
    };
  } catch (error) {
    return {
      status: "error" as const,
      at: toIsoNow(),
      error: error instanceof Error ? error.message : "Health upload failed."
    };
  }
};

const exchangeInviteCode = async (inviteCode: string, deviceLabel?: string) => {
  const runtimeConfig = await readRuntimeConfig();
  const { response, payload } = await requestJson<ExtensionAuthExchangeResponse>(
    "/api/extension/auth/exchange",
    {
      method: "POST",
      auth: "none",
      body: {
        inviteCode,
        deviceLabel: deviceLabel?.trim() || createDeviceLabel(),
        extensionVersion: runtimeConfig.extensionVersion
      }
    }
  );

  if (!response.ok || !payload) {
    throw new Error((payload as { error?: string } | undefined)?.error ?? `Request failed with ${response.status}`);
  }

  await writeAuthSession(payload);
  await clearMarketCaches();
  await writeSyncState({
    lastError: undefined
  });
  return payload;
};

const loginWithAccount = async (input: {
  email: string;
  password: string;
  inviteCode?: string;
  deviceLabel?: string;
}) => {
  const runtimeConfig = await readRuntimeConfig();
  const { response, payload } = await requestJson<ExtensionAuthExchangeResponse>(
    "/api/extension/auth/login",
    {
      method: "POST",
      auth: "none",
      body: {
        email: input.email.trim(),
        password: input.password,
        inviteCode: input.inviteCode?.trim() || undefined,
        deviceLabel: input.deviceLabel?.trim() || createDeviceLabel(),
        extensionVersion: runtimeConfig.extensionVersion
      }
    }
  );

  if (!response.ok || !payload) {
    throw new Error((payload as { error?: string } | undefined)?.error ?? `Request failed with ${response.status}`);
  }

  await writeAuthSession(payload);
  await clearMarketCaches();
  await writeSyncState({
    lastError: undefined
  });
  return payload;
};

const refreshAuthSession = async (currentSession: ExtensionAuthSession) => {
  const { response, payload } = await requestJson<ExtensionAuthExchangeResponse>(
    "/api/extension/auth/refresh",
    {
      method: "POST",
      auth: "none",
      body: {
        refreshToken: currentSession.refreshToken
      }
    }
  );

  if (!response.ok || !payload) {
    await clearAuthSession();
    await clearMarketCaches();
    throw new Error((payload as { error?: string } | undefined)?.error ?? "Session refresh failed.");
  }

  await writeAuthSession(payload);
  return payload;
};

const ensureActiveSession = async (forceRefresh = false): Promise<ExtensionAuthSession> => {
  const session = await readAuthSession();
  if (!session) {
    throw new Error("Authentication required.");
  }

  if (isExpired(session.refreshExpiresAt)) {
    await clearAuthSession();
    await clearMarketCaches();
    throw new Error("Session expired. Please sign in again.");
  }

  if (!forceRefresh && !isExpired(session.expiresAt, ACCESS_TOKEN_REFRESH_BUFFER_MS)) {
    return session;
  }

  return refreshAuthSession(session);
};

const logout = async () => {
  const session = await readAuthSession();

  if (session) {
    try {
      await requestJson("/api/extension/auth/logout", {
        method: "POST",
        auth: "none",
        body: {
          refreshToken: session.refreshToken
        }
      });
    } catch {
      // Best effort logout; local cleanup still happens.
    }
  }

  await clearAuthSession();
  await clearMarketCaches();
  await writeSyncState({
    lastError: undefined
  });
};

const fetchMarketAnnotations = async (slug: string, forceRefresh = false): Promise<{
  payload: MarketAnnotationResponse;
  cacheStatus: "live" | "stale";
}> => {
  const config = await readConfig();
  if (!config.enabled) {
    throw new Error("Extension is disabled.");
  }

  const memberScope = getMemberScope(await readAuthSession(), config);
  const cached = await readCachedEntry(memberScope, slug);
  const now = Date.now();
  if (!forceRefresh && cached && cached.expiresAt > now) {
    return {
      payload: cached.payload,
      cacheStatus: "live"
    };
  }

  const performRequest = async (forceRefresh = false) => {
    const { response, payload, session } = await requestJson<MarketAnnotationResponse>(
      "/api/extension/market-annotations",
      {
        auth: "required",
        forceRefresh,
        query: {
          slug
        },
        ifNoneMatch: cached?.etag
      }
    );

    if (response.status === 304 && cached) {
      const refreshed: CachedMarketEntry = {
        ...cached,
        expiresAt: now + MARKET_CACHE_TTL_MS,
        updatedAt: toIsoNow()
      };
      await writeCachedEntry(memberScope, slug, refreshed);
      return {
        payload: refreshed.payload,
        cacheStatus: "live" as const
      };
    }

    if (response.status === 401 && !forceRefresh) {
      await ensureActiveSession(true);
      return performRequest(true);
    }

    if (!response.ok || !payload) {
      throw new Error((payload as { error?: string } | undefined)?.error ?? `Request failed with ${response.status}`);
    }

    const scope = getMemberScope(session, config);
    const entry: CachedMarketEntry = {
      etag: response.headers.get("etag"),
      expiresAt: now + MARKET_CACHE_TTL_MS,
      updatedAt: toIsoNow(),
      memberScope: scope,
      payload
    };

    await writeCachedEntry(scope, slug, entry);
    await writeSyncState({
      lastSyncAt: toIsoNow(),
      lastError: undefined
    });
    return {
      payload,
      cacheStatus: "live" as const
    };
  };

  try {
    return await performRequest();
  } catch (error) {
    await writeSyncState({
      lastError: error instanceof Error ? error.message : "Failed to refresh annotations."
    });
    if (cached) {
      return {
        payload: {
          ...cached.payload,
          refreshedAt: toIsoNow(),
          sourceStatus: "stale"
        },
        cacheStatus: "stale"
      };
    }

    throw error;
  }
};

const lookupAddresses = async (addresses: string[]) => {
  const normalizedAddresses = Array.from(
    new Set(addresses.map((value) => normalizeAddress(value)).filter((value): value is string => Boolean(value)))
  );

  if (normalizedAddresses.length === 0) {
    return [] as AddressLookupSummary[];
  }

  const { response, payload } = await requestJson<{ items: AddressLookupSummary[]; version: string }>(
    "/api/extension/labels/lookup",
    {
      method: "POST",
      auth: "required",
      body: {
        chain: "polygon",
        addresses: normalizedAddresses
      }
    }
  );

  if (!response.ok || !payload) {
    throw new Error((payload as { error?: string } | undefined)?.error ?? "Address lookup failed.");
  }

  return payload.items;
};

const searchAddresses = async (query: string, limit = 12) => {
  const trimmed = query.trim();
  if (!trimmed) {
    return [] as AddressSearchResult[];
  }

  const { response, payload } = await requestJson<{ items: AddressSearchResult[]; version: string }>(
    "/api/extension/search",
    {
      auth: "required",
      query: {
        q: trimmed,
        limit: String(limit)
      }
    }
  );

  if (!response.ok || !payload) {
    throw new Error((payload as { error?: string } | undefined)?.error ?? "Search failed.");
  }

  return payload.items;
};

const isEnabledTab = async (tab: { url?: string | undefined }) => {
  if (!tab.url) {
    return false;
  }

  try {
    const { hostname } = new URL(tab.url);
    const config = await readConfig();
    return config.enabledMarkets.some((host) => hostname === host || hostname.endsWith(`.${host}`));
  } catch {
    return false;
  }
};

const getSupportedTabs = async () => {
  const tabs = await chrome.tabs.query({});
  const supportedTabs = [];

  for (const tab of tabs) {
    if (typeof tab.id !== "number") {
      continue;
    }

    if (await isEnabledTab(tab)) {
      supportedTabs.push(tab);
    }
  }

  return supportedTabs;
};

const ensureContentScriptReady = async (tabId: number) => {
  const pending = pendingContentScriptEnsures.get(tabId);
  if (pending) {
    return pending;
  }

  const task = (async () => {
    try {
      const response = await chrome.tabs.sendMessage(tabId, {
        type: "wsm:ping"
      } satisfies ContentScriptCommand);
      if (response?.ok) {
        return false;
      }
    } catch (error) {
      if (!isMessagingError(error)) {
        throw error;
      }
    }

    await chrome.scripting
      .insertCSS({
        target: { tabId },
        files: ["content.css"]
      })
      .catch(() => {});

    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["content-script.js"]
    });

    return true;
  })();

  pendingContentScriptEnsures.set(tabId, task);

  try {
    return await task;
  } finally {
    pendingContentScriptEnsures.delete(tabId);
  }
};

const sendContentScriptCommand = async (tabId: number, command: ContentScriptCommand) => {
  try {
    return await chrome.tabs.sendMessage(tabId, command);
  } catch (error) {
    if (!isMessagingError(error)) {
      throw error;
    }

    await ensureContentScriptReady(tabId);
    return chrome.tabs.sendMessage(tabId, command);
  }
};

const coordinateTabRuntime = async (
  tabId: number,
  options?: {
    tab?: BrowserTabLike | null;
    lifecycle?: "bootstrap" | "wake" | "manual";
    forceVisibleLookup?: boolean;
    forceRevalidate?: boolean;
  }
) => {
  const resolvedTab =
    options?.tab ??
    (await chrome.tabs.get(tabId).catch((error: unknown) => {
      if (isTransientTabError(error)) {
        return null;
      }
      throw error;
    })) ??
    null;

  if (!resolvedTab || !(await isEnabledTab(resolvedTab))) {
    return {
      supported: false
    };
  }

  const lifecycle = options?.lifecycle ?? "wake";
  const status = lifecycle === "bootstrap" ? "bootstrap" : "wake";
  await writeRuntimeState({
    status,
    detail: lifecycle === "bootstrap" ? "Bootstrapping Polymarket runtime." : "Waking Polymarket runtime.",
    tabId,
    tabUrl: resolvedTab.url,
    lastEventAt: toIsoNow()
  });

  const injected = await ensureContentScriptReady(tabId);
  if (!injected) {
    await sendContentScriptCommand(tabId, {
      type: "wsm:refreshAnnotations",
      lifecycle,
      forceVisibleLookup: options?.forceVisibleLookup ?? true,
      forceRevalidate: options?.forceRevalidate ?? lifecycle !== "wake"
    });
  }

  return {
    supported: true,
    injected
  };
};

const refreshTabAnnotations = async (
  tabId: number,
  options?: {
    lifecycle?: "bootstrap" | "wake" | "manual";
    forceVisibleLookup?: boolean;
    forceRevalidate?: boolean;
  }
) => {
  const lifecycle = options?.lifecycle ?? "manual";
  const refreshKey = [
    tabId,
    lifecycle,
    options?.forceVisibleLookup ? "visible" : "normal",
    options?.forceRevalidate ? "revalidate" : "cached"
  ].join(":");
  const pending = pendingTabRefreshes.get(refreshKey);
  if (pending) {
    return pending;
  }

  const task = (async () => {
    const result = await coordinateTabRuntime(tabId, {
      lifecycle,
      forceVisibleLookup: options?.forceVisibleLookup ?? true,
      forceRevalidate: options?.forceRevalidate ?? true
    });

    if (!result.supported) {
      return {
        skipped: true as const
      };
    }

    return {
      injected: result.injected
    };
  })();

  pendingTabRefreshes.set(refreshKey, task);

  try {
    return await task;
  } finally {
    pendingTabRefreshes.delete(refreshKey);
  }
};

const refreshSupportedTabs = async () => {
  const tabs = await getSupportedTabs();
  await Promise.allSettled(
    tabs.map((tab) =>
      refreshTabAnnotations(tab.id as number, {
        lifecycle: "manual",
        forceVisibleLookup: true,
        forceRevalidate: true
      })
    )
  );
};

const primeSupportedTabs = async () => {
  const tabs = await getSupportedTabs();
  await Promise.allSettled(
    tabs.map((tab) =>
      coordinateTabRuntime(tab.id as number, {
        tab,
        lifecycle: "bootstrap",
        forceVisibleLookup: true,
        forceRevalidate: false
      })
    )
  );
};

const primeTabIfSupported = async (tabId: number, tab?: BrowserTabLike) => {
  const resolvedTab =
    tab ??
    (await chrome.tabs.get(tabId).catch((error: unknown) => {
      if (isTransientTabError(error)) {
        return null;
      }
      throw error;
    })) ??
    null;

  if (!resolvedTab || !(await isEnabledTab(resolvedTab))) {
    return;
  }

  try {
    await coordinateTabRuntime(tabId, {
      tab: resolvedTab,
      lifecycle: "wake",
      forceVisibleLookup: true,
      forceRevalidate: false
    });
  } catch (error) {
    if (!isTransientTabError(error) && !isMessagingError(error)) {
      throw error;
    }
  }
};

const refreshActiveTab = async () => {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (tab?.id && (await isEnabledTab(tab))) {
    return refreshTabAnnotations(tab.id, {
      lifecycle: "manual",
      forceVisibleLookup: true,
      forceRevalidate: true
    });
  }

  await refreshSupportedTabs();
  return {
    refreshedAllSupportedTabs: true
  };
};

const openWorkbench = async () => {
  const runtimeConfig = await readRuntimeConfig();
  const url = new URL(runtimeConfig.workbenchPath, `${stripTrailingSlash(runtimeConfig.adminBaseUrl)}/`);
  await chrome.tabs.create({ url: url.toString() });
};

const openOrFocusPolymarket = async () => {
  const tabs = (await chrome.tabs.query({})) as BrowserTabLike[];
  const existingTab = tabs.find((tab: BrowserTabLike) => {
    if (!tab.url) {
      return false;
    }

    try {
      return new URL(tab.url).hostname === "polymarket.com";
    } catch {
      return false;
    }
  });

  if (existingTab?.id) {
    await chrome.tabs.update(existingTab.id, { active: true });
    if (typeof existingTab.windowId === "number") {
      await chrome.windows.update(existingTab.windowId, { focused: true });
    }
    await coordinateTabRuntime(existingTab.id, {
      tab: existingTab,
      lifecycle: "wake",
      forceVisibleLookup: true,
      forceRevalidate: false
    });
    return;
  }

  const createdTab = await chrome.tabs.create({ url: "https://polymarket.com" });
  if (typeof createdTab.id === "number") {
    await coordinateTabRuntime(createdTab.id, {
      tab: createdTab,
      lifecycle: "bootstrap",
      forceVisibleLookup: true,
      forceRevalidate: false
    });
  }
};

const openSidePanel = async (focus?: {
  address?: string;
  normalizedAddress?: string;
  displayName?: string;
  source?: "hover" | "inline" | "popup" | "search";
}) => {
  const focusAddress = (focus?.normalizedAddress || focus?.address || "").trim();
  const focusPayload = focusAddress
    ? {
        [SIDEPANEL_FOCUS_KEY]: {
          address: focus?.address || focusAddress,
          normalizedAddress: focusAddress,
          displayName: focus?.displayName,
          requestedAt: new Date().toISOString(),
          source: focus?.source ?? "inline"
        }
      }
    : null;

  if (!chrome.sidePanel?.open) {
    await openWorkbench();
    return;
  }

  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (tab?.id) {
    await chrome.sidePanel.setOptions({
      tabId: tab.id,
      path: "sidepanel.html",
      enabled: true
    });

    try {
      await chrome.sidePanel.open({ tabId: tab.id });
      if (focusPayload) {
        await chrome.storage.local.set(focusPayload);
      }
      return;
    } catch (error) {
      if (typeof tab.windowId !== "number") {
        throw error;
      }
      await chrome.sidePanel.open({ windowId: tab.windowId });
      if (focusPayload) {
        await chrome.storage.local.set(focusPayload);
      }
      return;
    }
  }

  const currentWindow = await chrome.windows.getCurrent();
  if (typeof currentWindow.id === "number") {
    await chrome.sidePanel.open({ windowId: currentWindow.id });
    if (focusPayload) {
      await chrome.storage.local.set(focusPayload);
    }
    return;
  }

  throw new Error("Unable to locate the current browser window.");
};

const canCoordinateRuntime = (config: ExtensionConfig, session: ExtensionAuthSession | null) =>
  config.enabled && (Boolean(config.readOnlyToken.trim()) || Boolean(session && !isExpired(session.refreshExpiresAt)));

const getEffectiveRuntimeState = async (
  config: ExtensionConfig,
  session: ExtensionAuthSession | null
): Promise<RuntimeCoordinatorState> => {
  const runtime = await readRuntimeState();
  if (!config.enabled) {
    return {
      ...runtime,
      status: "disabled",
      detail: "Runtime disabled from extension settings."
    };
  }

  if (!config.readOnlyToken.trim()) {
    if (!session) {
      return {
        ...runtime,
        status: "signed_out",
        detail: "Authentication required."
      };
    }

    if (isExpired(session.refreshExpiresAt)) {
      return {
        ...runtime,
        status: "signed_out",
        detail: "Session expired."
      };
    }
  }

  return runtime;
};

const buildPopupState = async (): Promise<PopupState> => {
  const runtimeConfig = await readRuntimeConfig();
  const config = await readConfig();
  const session = await readAuthSession();
  const sync = await readSyncState();
  const expired = Boolean(session) && isExpired(session?.refreshExpiresAt);
  const runtime = await getEffectiveRuntimeState(config, session);

  return {
    runtimeConfig,
    config,
    auth: {
      status: !session ? "signed_out" : expired ? "expired" : "connected",
      isAuthenticated: Boolean(session) && !expired,
      userEmail: session?.userEmail,
      memberLabel: session?.memberLabel,
      inviteCode: session?.inviteCode,
      expiresAt: session?.expiresAt,
      refreshExpiresAt: session?.refreshExpiresAt
    },
    sync,
    runtime
  };
};

const handleMessage = async (message: BackgroundMessage, sender?: { tab?: BrowserTabLike }) => {
  switch (message.type) {
    case "wsm:getPopupState":
      return {
        ok: true,
        payload: await buildPopupState()
      };
    case "wsm:updateConfig":
      {
        const nextConfig = await writeConfig(message.patch);
        const session = await readAuthSession();
        if (!nextConfig.enabled) {
          await writePageSurfaceState(null);
          await clearRuntimeState("disabled", "Runtime disabled from extension settings.");
        } else if (!canCoordinateRuntime(nextConfig, session)) {
          await clearRuntimeState("signed_out", "Authentication required.");
        } else {
          await writeRuntimeState({
            status: "bootstrap",
            detail: "Config updated. Coordinating open Polymarket tabs."
          });
          await refreshSupportedTabs();
        }
      }
      return {
        ok: true,
        payload: {
          state: await buildPopupState()
        }
      };
    case "wsm:authLogin":
      {
        const session = await loginWithAccount({
          email: message.email,
          password: message.password,
          inviteCode: message.inviteCode,
          deviceLabel: message.deviceLabel
        });
        await writePageSurfaceState(null);
        await writeRuntimeState({
          status: "bootstrap",
          detail: "Account authenticated. Coordinating open Polymarket tabs.",
          errorCode: undefined,
          lastHealthUploadError: undefined
        });
        await refreshSupportedTabs();
        return {
          ok: true,
          payload: {
            session,
            state: await buildPopupState()
          }
        };
      }
    case "wsm:authExchange":
      {
        const session = await exchangeInviteCode(message.inviteCode, message.deviceLabel);
        await writePageSurfaceState(null);
        await writeRuntimeState({
          status: "bootstrap",
          detail: "Session connected. Coordinating open Polymarket tabs.",
          errorCode: undefined,
          lastHealthUploadError: undefined
        });
        await refreshSupportedTabs();
        return {
        ok: true,
        payload: {
          session,
          state: await buildPopupState()
        }
      };
      }
    case "wsm:logout":
      await logout();
      await writePageSurfaceState(null);
      await clearRuntimeState("signed_out", "Authentication required.");
      return {
        ok: true,
        payload: {
          state: await buildPopupState()
        }
      };
    case "wsm:getMarketAnnotations": {
      const result = await fetchMarketAnnotations(message.slug, message.forceRefresh);
      return {
        ok: true,
        ...result
      };
    }
    case "wsm:getPageSurfaceState":
      return {
        ok: true,
        payload: await readPageSurfaceState()
      };
    case "wsm:reportPageSurfaceState":
      {
        const state = await captureSurfaceState({
          ...(message.state ?? message.surface ?? {
            surfaceFound: false,
            surfaceActive: false,
            fallbackMode: false,
            rowsDetected: 0,
            rowsAnnotated: 0,
            visibleAddressCount: 0,
            lastUpdatedAt: toIsoNow()
          }),
          tabId: sender?.tab?.id,
          tabUrl: sender?.tab?.url
        });
        await syncRuntimeStateFromSurface(state);
      }
      return {
        ok: true
      };
    case "wsm:reportHealth":
      {
        const result = await uploadRuntimeHealth(message.event);
        const currentSurface = await readPageSurfaceState();
        const runtimeStatus = deriveRuntimeStatusFromHealthEvent(message.event);
        if (currentSurface) {
          await writePageSurfaceState({
            ...currentSurface,
            lastHealthAt: result.at,
            healthStatus: result.status,
            healthLabelsVersion: result.labelsVersion,
            healthError: result.error
          });
        }
        await writeRuntimeState({
          status: runtimeStatus,
          detail: result.error ?? currentSurface?.runtimeMessage ?? message.event.errorCode ?? "Health report updated.",
          slug: message.event.marketSlug,
          surfaceKind: message.event.surfaceKind,
          sourceStatus: message.event.sourceStatus,
          errorCode: message.event.errorCode,
          lastEventAt: message.event.at,
          lastHealthAt: message.event.at,
          lastHealthUploadAt: result.at,
          lastHealthUploadError: result.status === "ok" ? undefined : result.error,
          lastLabelsVersion: result.labelsVersion
        });
      }
      return {
        ok: true
      };
    case "wsm:lookupAddresses":
      return {
        ok: true,
        payload: await lookupAddresses(message.addresses)
      };
    case "wsm:searchAddresses":
      return {
        ok: true,
        payload: await searchAddresses(message.query, message.limit)
      };
    case "wsm:refreshActiveTab":
      return {
        ok: true,
        payload: await refreshActiveTab()
      };
    case "wsm:openPolymarket":
      await openOrFocusPolymarket();
      return {
        ok: true
      };
    case "wsm:openWorkbench":
      await openWorkbench();
      return {
        ok: true
      };
    case "wsm:openSidePanel":
      await openSidePanel({
        address: message.address,
        normalizedAddress: message.normalizedAddress,
        displayName: message.displayName,
        source: message.source
      });
      return {
        ok: true
      };
    default:
      return {
        ok: false,
        error: "Unknown extension message."
      };
  }
};

const initializeRuntime = async () => {
  await ensureDefaultConfig();
  await readPageSurfaceState();
  const config = await readConfig();
  const session = await readAuthSession();
  if (!config.enabled) {
    await clearRuntimeState("disabled", "Runtime disabled from extension settings.");
  } else if (!config.readOnlyToken.trim() && !session) {
    await clearRuntimeState("signed_out", "Authentication required.");
  } else {
    await writeRuntimeState({
      status: "bootstrap",
      detail: "Background coordinator online."
    });
  }
  await chrome.sidePanel?.setOptions?.({
    path: "sidepanel.html",
    enabled: true
  });
  if (canCoordinateRuntime(config, session)) {
    await primeSupportedTabs();
  }
};

chrome.runtime.onInstalled.addListener(() => {
  void initializeRuntime().catch(() => {});
});

chrome.runtime.onStartup?.addListener(() => {
  void initializeRuntime().catch(() => {});
});

chrome.tabs.onActivated.addListener(({ tabId }: BrowserTabActivatedInfo) => {
  void primeTabIfSupported(tabId).catch(() => {});
});

chrome.tabs.onUpdated.addListener((tabId: number, changeInfo: BrowserTabChangeInfo, tab: BrowserTabLike) => {
  if (changeInfo.status !== "complete" && typeof changeInfo.url !== "string") {
    return;
  }

  void primeTabIfSupported(tabId, tab).catch(() => {});
});

chrome.runtime.onMessage.addListener(
  (
    message: BackgroundMessage,
    sender: { tab?: BrowserTabLike },
    sendResponse: (value: unknown) => void
  ) => {
    void handleMessage(message, sender)
      .then((result) => {
        sendResponse(result);
      })
      .catch((error) => {
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : "Unknown extension error."
        });
      });

    return true;
  }
);

void initializeRuntime().catch(() => {});
})();
