export interface ExtensionConfig {
  enabled: boolean;
  debugMode: boolean;
  backendBaseUrl: string;
  readOnlyToken: string;
  enabledMarkets: string[];
  refreshIntervalMs: number;
}

export interface ExtensionRuntimeConfig {
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

export interface ExtensionAuthSession {
  userId?: string;
  userEmail?: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  refreshExpiresAt: string;
  memberLabel: string;
  inviteCode: string;
  deviceLabel?: string;
  extensionVersion?: string;
}

export interface SyncState {
  lastSyncAt?: string;
  lastError?: string;
}

export type ExtensionRuntimeStatus =
  | "idle"
  | "bootstrap"
  | "wake"
  | "ready"
  | "degraded"
  | "disabled"
  | "signed_out";

export interface RuntimeCoordinatorState {
  status: ExtensionRuntimeStatus;
  detail?: string;
  tabId?: number;
  tabUrl?: string;
  slug?: string;
  surfaceKind?: "market-main-holders" | "feed-top-holders";
  sourceStatus?: "live" | "stale" | "error";
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

export interface PopupViewState {
  runtimeConfig: ExtensionRuntimeConfig;
  config: {
    enabled: boolean;
    debugMode: boolean;
  };
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

export interface PageSurfaceState {
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
  lastUpdatedAt: string;
}

export interface SidePanelFocusTarget {
  address: string;
  normalizedAddress?: string;
  displayName?: string;
  requestedAt: string;
  source: "hover" | "inline" | "popup" | "search";
}

export interface ExtensionStorageChange {
  oldValue?: unknown;
  newValue?: unknown;
}

const DEFAULT_REFRESH_INTERVAL_MS = 180_000;
const MESSAGE_RETRY_DELAYS_MS = [120, 320, 700];
const RETRYABLE_MESSAGE_ERROR = /Receiving end does not exist|message port closed before a response was received|Could not establish connection/i;

export const CONFIG_KEY = "wsm.config";
export const AUTH_SESSION_KEY = "wsm.authSession";
export const SYNC_STATE_KEY = "wsm.syncState";
export const RUNTIME_STATE_KEY = "wsm.runtimeState";
export const PAGE_SURFACE_STATE_KEY = "wsm.pageSurfaceState";
export const SIDEPANEL_FOCUS_KEY = "wsm.sidepanelFocus";

let runtimeConfigPromise: Promise<ExtensionRuntimeConfig> | null = null;

const stripTrailingSlash = (value: string) => value.replace(/\/+$/, "");
const parseTimestamp = (value?: string) => (value ? new Date(value).getTime() : 0);
const isExpired = (value?: string, bufferMs = 0) => Date.now() >= parseTimestamp(value) - bufferMs;

const createDefaultRuntimeConfig = (): ExtensionRuntimeConfig => ({
  mode: "dev",
  backendBaseUrl: "http://localhost:3000",
  adminBaseUrl: "http://localhost:3000",
  allowBackendOverride: true,
  showDebugControls: true,
  enabledMarkets: ["polymarket.com"],
  extensionVersion: chrome.runtime.getManifest().version,
  workbenchPath: "/wallets",
  privacyPolicyUrl: "/extension/privacy"
});

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
      ? stripTrailingSlash(merged.backendBaseUrl?.trim() || runtimeConfig.backendBaseUrl)
      : stripTrailingSlash(runtimeConfig.backendBaseUrl),
    readOnlyToken: runtimeConfig.mode === "dev" ? merged.readOnlyToken?.trim() ?? "" : "",
    enabledMarkets: runtimeConfig.enabledMarkets,
    refreshIntervalMs: Number.isFinite(merged.refreshIntervalMs)
      ? Math.max(30_000, merged.refreshIntervalMs)
      : defaults.refreshIntervalMs
  };
};

export const createDefaultRuntimeState = (): RuntimeCoordinatorState => ({
  status: "idle",
  detail: "Coordinator idle.",
  lastEventAt: new Date().toISOString()
});

const getEffectiveRuntimeState = (
  config: ExtensionConfig,
  session: ExtensionAuthSession | null,
  runtimeState: RuntimeCoordinatorState
): RuntimeCoordinatorState => {
  if (!config.enabled) {
    return {
      ...runtimeState,
      status: "disabled",
      detail: "Runtime disabled from extension settings."
    };
  }

  if (!config.readOnlyToken.trim()) {
    if (!session) {
      return {
        ...runtimeState,
        status: "signed_out",
        detail: "Authentication required."
      };
    }

    if (isExpired(session.refreshExpiresAt)) {
      return {
        ...runtimeState,
        status: "signed_out",
        detail: "Session expired."
      };
    }
  }

  return runtimeState;
};

export const readRuntimeConfig = async (): Promise<ExtensionRuntimeConfig> => {
  if (runtimeConfigPromise) {
    return runtimeConfigPromise;
  }

  runtimeConfigPromise = (async () => {
    const defaults = createDefaultRuntimeConfig();

    try {
      const response = await fetch(chrome.runtime.getURL("runtime-config.json"), {
        cache: "no-store"
      });
      if (!response.ok) {
        throw new Error(`runtime-config.json request failed with ${response.status}`);
      }

      const payload = (await response.json()) as Partial<ExtensionRuntimeConfig>;
      return {
        ...defaults,
        ...payload,
        backendBaseUrl: stripTrailingSlash(payload.backendBaseUrl?.trim() || defaults.backendBaseUrl),
        adminBaseUrl: stripTrailingSlash(
          payload.adminBaseUrl?.trim() || payload.backendBaseUrl?.trim() || defaults.adminBaseUrl
        ),
        enabledMarkets:
          payload.enabledMarkets?.filter((item): item is string => typeof item === "string") ??
          defaults.enabledMarkets,
        extensionVersion: payload.extensionVersion?.trim() || defaults.extensionVersion
      };
    } catch {
      return defaults;
    }
  })();

  return runtimeConfigPromise;
};

export const readStoredPopupState = async (): Promise<PopupViewState> => {
  const runtimeConfig = await readRuntimeConfig();
  const stored = await chrome.storage.local.get([
    CONFIG_KEY,
    AUTH_SESSION_KEY,
    SYNC_STATE_KEY,
    RUNTIME_STATE_KEY
  ]);

  const config = sanitizeConfig(runtimeConfig, stored[CONFIG_KEY] as Partial<ExtensionConfig> | undefined);
  const session = (stored[AUTH_SESSION_KEY] as ExtensionAuthSession | undefined) ?? null;
  const sync = (stored[SYNC_STATE_KEY] as SyncState | undefined) ?? {};
  const runtimeState =
    (stored[RUNTIME_STATE_KEY] as RuntimeCoordinatorState | undefined) ?? createDefaultRuntimeState();
  const expired = Boolean(session) && isExpired(session?.refreshExpiresAt);

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
    runtime: getEffectiveRuntimeState(config, session, runtimeState)
  };
};

export const readStoredPageSurfaceState = async (): Promise<PageSurfaceState | null> => {
  const stored = await chrome.storage.local.get(PAGE_SURFACE_STATE_KEY);
  return (stored[PAGE_SURFACE_STATE_KEY] as PageSurfaceState | undefined) ?? null;
};

const sendMessageOnce = <T,>(message: unknown): Promise<T> =>
  new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response: { ok?: boolean; error?: string; payload?: T }) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }

      if (response?.ok === false) {
        reject(new Error(response.error ?? "unknown"));
        return;
      }

      resolve((response as { payload?: T }).payload ?? (response as T));
    });
  });

const shouldRetryMessageError = (error: unknown) =>
  error instanceof Error && RETRYABLE_MESSAGE_ERROR.test(error.message);

const wait = async (ms: number) =>
  new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });

export const sendExtensionMessage = async <T,>(message: unknown): Promise<T> => {
  let attempt = 0;
  let lastError: unknown = null;

  while (attempt <= MESSAGE_RETRY_DELAYS_MS.length) {
    try {
      return await sendMessageOnce<T>(message);
    } catch (error) {
      lastError = error;
      if (!shouldRetryMessageError(error) || attempt === MESSAGE_RETRY_DELAYS_MS.length) {
        throw error;
      }

      await wait(MESSAGE_RETRY_DELAYS_MS[attempt] ?? 0);
      attempt += 1;
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Extension message failed.");
};

export const hasRelevantStorageChange = (
  changes: Record<string, ExtensionStorageChange>,
  areaName: string
) =>
  areaName === "local" &&
  [CONFIG_KEY, AUTH_SESSION_KEY, SYNC_STATE_KEY, RUNTIME_STATE_KEY, PAGE_SURFACE_STATE_KEY].some(
    (key) => key in changes
  );
