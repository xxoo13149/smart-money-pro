interface ExtensionConfig {
  enabled: boolean;
  debugMode: boolean;
  backendBaseUrl: string;
  readOnlyToken: string;
  enabledMarkets: string[];
  refreshIntervalMs: number;
}

interface AddressSummary {
  alias?: string;
  badges: Array<{ id: string; text: string; tone: string }>;
  noteSnippet?: string;
  watchlisted: boolean;
  detailUrl: string;
  updatedAt: string;
  version: string;
}

interface HolderSurfaceHint {
  normalizedAddress: string;
  alias?: string;
  badges: string[];
  watchlisted: boolean;
  detailUrl?: string;
}

interface AnnotatedHolder {
  proxyWallet: string;
  normalizedAddress: string;
  displayName: string;
  outcomeIndex: number;
  amount: number;
  amountByOutcome: Array<{ outcomeIndex: number; amount: number }>;
  summary?: AddressSummary;
}

interface MarketAnnotationResponse {
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
  resolvedBy?: "event_slug" | "market_slug" | "next_data_event" | "error";
  holderSurfaceHints?: HolderSurfaceHint[];
}

interface AddressLookupSummary {
  chain: "polygon";
  address: string;
  normalizedAddress: string;
  alias?: string;
  badges: Array<{ id: string; text: string; tone: string }>;
  noteSnippet?: string;
  watchlisted: boolean;
  detailUrl: string;
  updatedAt: string;
  version: string;
}

type HolderSurfaceKind = "market-main-holders" | "feed-top-holders";
type HolderRowSide = "yes" | "no" | "unknown";
type InlineAnnotationSource = "market_annotations" | "labels_lookup";
type PageRuntimeStatus =
  | "idle"
  | "bootstrap"
  | "wake"
  | "ready"
  | "degraded"
  | "disabled"
  | "signed_out";

interface HolderRowMount {
  row: HTMLElement;
  mountTarget: HTMLElement;
  mainContainer?: HTMLElement | null;
  nameLine?: HTMLElement | null;
}

interface HolderRowSnapshot {
  surfaceKind: HolderSurfaceKind;
  rowKey: string;
  normalizedAddress?: string;
  rawAddress?: string;
  profileHref?: string;
  displayNameText?: string;
  amountText?: string;
  side: HolderRowSide;
  confidence: number;
  mount: HolderRowMount;
}

interface HolderPanelSnapshot {
  panelKey: string;
  titleText: string;
  active: boolean;
  surfaceKind: HolderSurfaceKind;
  confidence: number;
  root: HTMLElement;
  rows: HolderRowSnapshot[];
  fallbackAnchor: HTMLElement;
}

interface ResolvedInlineAnnotation {
  key: string;
  rowKey: string;
  normalizedAddress: string;
  surfaceKind: HolderSurfaceKind;
  source: InlineAnnotationSource;
  aliasText: string;
  primaryBadge?: AddressSummary["badges"][number];
  noteSnippet?: string;
  detailUrl: string;
  summaryVersion: string;
  proxyWallet: string;
  displayName: string;
}

interface PageRuntimeState {
  slug?: string;
  surfaceKind?: HolderSurfaceKind;
  surfaceFound: boolean;
  surfaceActive: boolean;
  fallbackMode: boolean;
  rowsDetected: number;
  rowsAnnotated: number;
  visibleAddressCount: number;
  sourceStatus?: MarketAnnotationResponse["sourceStatus"];
  labelsVersion?: string;
  resolvedBy?: MarketAnnotationResponse["resolvedBy"];
  errorCode?: string;
  language: string;
  runtimeStatus: PageRuntimeStatus;
  runtimeMessage?: string;
  lastStageAt: string;
  lastBootstrapAt?: string;
  lastWakeAt?: string;
  lastReadyAt?: string;
  lastDegradedAt?: string;
  matched: Array<{
    address: string;
    aliasText: string;
    detailUrl: string;
    source: InlineAnnotationSource;
  }>;
}

interface RuntimeHealthEvent {
  extensionVersion: string;
  parserVersion: string;
  at: string;
  marketSlug?: string;
  surfaceKind?: HolderSurfaceKind;
  surfaceFound: boolean;
  rowsDetected: number;
  rowsAnnotated: number;
  errorCode?: string;
  pageLanguage?: string;
  runtimeStatus?: PageRuntimeStatus;
  sourceStatus?: MarketAnnotationResponse["sourceStatus"];
  addresses?: string[];
}

type ContentRuntimeMessage =
  | {
      type: "wsm:refreshAnnotations";
      lifecycle?: "bootstrap" | "wake" | "manual";
      forceVisibleLookup?: boolean;
      forceRevalidate?: boolean;
    }
  | { type: "wsm:ping" };

(() => {
  const runtimeWindow = window as Window & typeof globalThis & {
    __WSM_CONTENT_SCRIPT_READY__?: boolean;
  };

  if (runtimeWindow.__WSM_CONTENT_SCRIPT_READY__) {
    return;
  }

  runtimeWindow.__WSM_CONTENT_SCRIPT_READY__ = true;

  const CONFIG_KEY = "wsm.config";
  const AUTH_SESSION_KEY = "wsm.authSession";
  const ADDRESS_PATTERN = /0x[a-fA-F0-9]{40}/;
  const PROFILE_PATH_PATTERN = /\/profile\/(0x[a-fA-F0-9]{40})/i;
  const ROOT_CLASS = "wsm-annotation-root";
  const ROW_CLASS = "wsm-annotation-row";
  const HOLDER_ROW_CLASS = "wsm-holder-row-target";
  const HOLDER_MAIN_CLASS = "wsm-holder-main-target";
  const HOLDER_META_CLASS = "wsm-holder-meta-target";
  const FALLBACK_CLASS = "wsm-fallback-shell";
  const PARSER_VERSION = "surface-adapter-v1";
  const REFRESH_TTL_MS = 90_000;
  const DIRECT_LOOKUP_TTL_MS = 60_000;
  const BADGE_PRIORITY: Record<string, number> = {
    alert: 4,
    watch: 3,
    accent: 2,
    neutral: 1
  };
  const DEFAULT_CONFIG: ExtensionConfig = {
    enabled: true,
    debugMode: false,
    backendBaseUrl: "http://localhost:3000",
    readOnlyToken: "",
    enabledMarkets: ["polymarket.com"],
    refreshIntervalMs: 180_000
  };
  const FEED_TOP_HOLDERS_TITLES = ["Top Holders", "顶级持仓者"];
  const FEED_COMMENTS_TITLES = ["Comments", "评论"];
  const FEED_ACTIVITY_TITLES = ["Activity", "活动"];
  const MAIN_YES_TITLES = ["Yes holders", "Yes Holders", "Yes 持仓者"];
  const MAIN_NO_TITLES = ["No holders", "No Holders", "No 持仓者"];
  const HOLDER_KEYWORDS = [
    ...FEED_TOP_HOLDERS_TITLES,
    ...MAIN_YES_TITLES,
    ...MAIN_NO_TITLES,
    "holders",
    "持仓者",
    "shares",
    "份额"
  ];

  const TITLE_SELECTOR = "button,div,span,p,h2,h3,h4";
  const FEED_TOP_HOLDERS_LABELS = ["Top Holders", "顶级持仓者"];
  const FEED_COMMENTS_LABELS = ["Comments", "评论"];
  const FEED_ACTIVITY_LABELS = ["Activity", "活动"];
  const MAIN_YES_LABELS = ["Yes holders", "Yes Holders", "Yes 持仓者"];
  const MAIN_NO_LABELS = ["No holders", "No Holders", "No 持仓者"];
  const HOLDER_SURFACE_KEYWORDS = [
    ...FEED_TOP_HOLDERS_LABELS,
    ...MAIN_YES_LABELS,
    ...MAIN_NO_LABELS,
    "holders",
    "持仓者",
    "shares",
    "份额"
  ];
  const SHARES_LABEL_PATTERN = /\bshares?\b|份额/i;

  let currentConfig: ExtensionConfig = DEFAULT_CONFIG;
  let currentSlug: string | null = null;
  let currentPayload: MarketAnnotationResponse | null = null;
  let refreshTimer: number | null = null;
  let renderTimer: number | null = null;
  let renderGeneration = 0;
  let refreshGeneration = 0;
  let lastRenderAt = 0;
  let forceLookupRefresh = false;
  let lookupCacheKey = "";
  let lookupCacheAt = 0;
  let lookupCache = new Map<string, AddressLookupSummary>();
  let observedSurfaceRoot: HTMLElement | null = null;
  let surfaceObserver: MutationObserver | null = null;
  let discoveryObserver: MutationObserver | null = null;
  let resizeObserver: ResizeObserver | null = null;
  let lastPublishedStateKey = "";
  let lastHealthKey = "";
  let currentRuntimeStatus: PageRuntimeStatus = "bootstrap";
  let currentRuntimeMessage = "Bootstrapping page runtime.";
  let lastStageAt = new Date().toISOString();
  let lastBootstrapAt = lastStageAt;
  let lastWakeAt: string | undefined;
  let lastReadyAt: string | undefined;
  let lastDegradedAt: string | undefined;

  const mountedAnnotations = new Map<
    string,
    {
      node: HTMLElement;
      row: HTMLElement;
      mountTarget: HTMLElement;
      mainContainer?: HTMLElement | null;
    }
  >();
  let mountedFallbackNode: HTMLElement | null = null;

  const setDebugState = (key: string, value: string) => {
    document.documentElement.dataset[`wsm${key}`] = value;
  };

  const markRuntimeStatus = (status: PageRuntimeStatus, message?: string) => {
    const now = new Date().toISOString();
    currentRuntimeStatus = status;
    currentRuntimeMessage = message ?? currentRuntimeMessage;
    lastStageAt = now;

    if (status === "bootstrap") {
      lastBootstrapAt = now;
    } else if (status === "wake") {
      lastWakeAt = now;
    } else if (status === "ready") {
      lastReadyAt = now;
    } else if (status === "degraded") {
      lastDegradedAt = now;
    }

    setDebugState("Runtime", status);
  };

  const buildPageState = (
    overrides: Omit<
      PageRuntimeState,
      "runtimeStatus" | "runtimeMessage" | "lastStageAt" | "lastBootstrapAt" | "lastWakeAt" | "lastReadyAt" | "lastDegradedAt"
    > &
      Partial<
        Pick<
          PageRuntimeState,
          "runtimeStatus" | "runtimeMessage" | "lastStageAt" | "lastBootstrapAt" | "lastWakeAt" | "lastReadyAt" | "lastDegradedAt"
        >
      >
  ): PageRuntimeState => ({
    runtimeStatus: overrides.runtimeStatus ?? currentRuntimeStatus,
    runtimeMessage: overrides.runtimeMessage ?? currentRuntimeMessage,
    lastStageAt: overrides.lastStageAt ?? lastStageAt,
    lastBootstrapAt: overrides.lastBootstrapAt ?? lastBootstrapAt,
    lastWakeAt: overrides.lastWakeAt ?? lastWakeAt,
    lastReadyAt: overrides.lastReadyAt ?? lastReadyAt,
    lastDegradedAt: overrides.lastDegradedAt ?? lastDegradedAt,
    ...overrides
  });

  const compactText = (value: string | null | undefined) => (value ?? "").replace(/\s+/g, " ").trim();

  const truncateText = (value: string | null | undefined, maxLength: number) => {
    const text = compactText(value);
    if (!text) {
      return "";
    }
    return text.length <= maxLength ? text : `${text.slice(0, maxLength - 1)}...`;
  };

  const normalizeAddress = (value: string) => {
    const match = value.match(ADDRESS_PATTERN)?.[0];
    return match ? match.toLowerCase() : null;
  };

  const shortenAddress = (value: string, start = 6, end = 4) =>
    value.length <= start + end + 3 ? value : `${value.slice(0, start)}...${value.slice(-end)}`;

  const isVisible = (element: Element | null): element is HTMLElement =>
    Boolean(element && element instanceof HTMLElement && element.getClientRects().length > 0);

  const getElementClassName = (element?: Element | null) =>
    typeof element?.className === "string" ? element.className : "";

  const hasAnyTitle = (text: string, titles: string[]) =>
    titles.some((title) => text === title || text.includes(title));

  const hasExactTitle = (text: string, titles: string[]) => titles.some((title) => text === title);

  const getVisibleChildren = (element: HTMLElement) =>
    Array.from(element.children).filter(
      (child): child is HTMLElement => child instanceof HTMLElement && isVisible(child)
    );

  const matchesAmountText = (value: string) => {
    const text = compactText(value);
    if (!text || text.length > 40 || !/\d/.test(text)) {
      return false;
    }
    return /[$¢%]|shares?|contracts?|holders?|份额|股|k|m|b/i.test(text) || /^[\d,.]+$/.test(text);
  };

  const containsCommentMetadata = (value: string) => {
    const text = compactText(value);
    return (
      /\bago\b/i.test(text) ||
      /\d+\s*(?:d|h|min|minutes?|hours?|days?)\b/i.test(text) ||
      /\d+\s*(?:天|小时|分钟|秒)/.test(text) ||
      text.includes("Replies") ||
      text.includes("回复")
    );
  };

  const looksLikeAmountText = (value: string) => {
    const text = compactText(value);
    if (!text || text.length > 40 || !/\d/.test(text)) {
      return false;
    }
    return /[$€¥%]|shares?|contracts?|holders?|份额|股|份|k|m|b/i.test(text) || /^[\d,.]+$/.test(text);
  };

  const containsCommentMeta = (value: string) => {
    const text = compactText(value);
    return (
      /\bago\b/i.test(text) ||
      /\d+\s*(?:d|h|min|minutes?|hours?|days?)\b/i.test(text) ||
      /\d+\s*(?:天|小时|分钟|秒)/.test(text) ||
      text.includes("Replies") ||
      text.includes("回复")
    );
  };

  const logDebug = (...args: unknown[]) => {
    if (currentConfig.debugMode) {
      console.debug("[wsm-extension]", ...args);
    }
  };

  const findAncestor = (
    start: HTMLElement | null,
    stopAt: HTMLElement | null,
    predicate: (element: HTMLElement) => boolean
  ) => {
    let current = start;
    while (current) {
      if (predicate(current)) {
        return current;
      }
      if (stopAt && current === stopAt) {
        break;
      }
      current = current.parentElement;
    }
    return null;
  };

  const buildDomPath = (element: HTMLElement, stopAt: HTMLElement | null) => {
    const parts: string[] = [];
    let current: HTMLElement | null = element;

    while (current && current !== stopAt) {
      const parent: HTMLElement | null = current.parentElement;
      if (!parent) {
        break;
      }
      parts.unshift(String(Array.from(parent.children).indexOf(current)));
      current = parent;
    }

    return parts.join(".");
  };

  const findCommonAncestor = (left: HTMLElement, right: HTMLElement) => {
    const chain = new Set<HTMLElement>();
    let current: HTMLElement | null = left;

    while (current) {
      chain.add(current);
      current = current.parentElement;
    }

    current = right;
    while (current) {
      if (chain.has(current)) {
        return current;
      }
      current = current.parentElement;
    }

    return null;
  };

  const resolveProfileAddress = (anchor: HTMLAnchorElement) => {
    const href = anchor.getAttribute("href") ?? anchor.href ?? "";
    const matched = href.match(PROFILE_PATH_PATTERN)?.[1];
    return matched ? matched.toLowerCase() : null;
  };

  const collectVisibleProfileAnchors = (root: ParentNode) =>
    Array.from(root.querySelectorAll<HTMLAnchorElement>('a[href*="/profile/"]')).filter(
      (anchor) => !anchor.closest(`.${ROOT_CLASS}`) && isVisible(anchor)
    );

  const countUniqueProfileAddresses = (element: ParentNode) =>
    new Set(
      collectVisibleProfileAnchors(element)
        .map((anchor) => resolveProfileAddress(anchor))
        .filter((address): address is string => Boolean(address))
    ).size;

  const scoreProfileAnchor = (anchor: HTMLAnchorElement) => {
    let score = 0;
    const text = compactText(anchor.textContent);
    if (text.length > 0) {
      score += 120;
    }
    if (anchor.querySelector("span")) {
      score += 18;
    }
    if (findAncestor(anchor.parentElement, null, (element) => getElementClassName(element).includes("ml-4"))) {
      score += 24;
    }
    if (anchor.querySelector("img")) {
      score += 8;
    }
    return score;
  };

  const resolveSlugFromPath = () => {
    const segments = location.pathname
      .split("/")
      .map((segment) => segment.trim())
      .filter(Boolean);
    const eventIndex = segments.indexOf("event");
    return eventIndex >= 0 ? segments.at(-1) ?? null : null;
  };

  const resolveSlugFromNextData = () => {
    const script = document.querySelector<HTMLScriptElement>("#__NEXT_DATA__");
    if (!script?.textContent) {
      return null;
    }

    try {
      const payload = JSON.parse(script.textContent) as {
        query?: { slug?: string[] | string };
        props?: { pageProps?: { mslug?: string } };
      };
      const querySlug = payload.query?.slug;
      if (typeof querySlug === "string") {
        return querySlug;
      }
      if (Array.isArray(querySlug) && querySlug.length > 0) {
        return querySlug[querySlug.length - 1] ?? null;
      }
      return payload.props?.pageProps?.mslug ?? null;
    } catch {
      return null;
    }
  };

  const resolveCurrentMarketSlug = () => resolveSlugFromPath() ?? resolveSlugFromNextData();

  const getConfig = async (): Promise<ExtensionConfig> => {
    const stored = await chrome.storage.local.get(CONFIG_KEY);
    return {
      ...DEFAULT_CONFIG,
      ...(stored?.[CONFIG_KEY] ?? {})
    } as ExtensionConfig;
  };

  const isHostEnabled = (config: ExtensionConfig) =>
    config.enabledMarkets.some((host) => location.hostname === host || location.hostname.endsWith(`.${host}`));

  const sendBackgroundMessage = async <T = unknown>(message: unknown): Promise<T> =>
    new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(message, (response: { ok?: boolean; error?: string; payload?: T } | T) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
          return;
        }

        if (typeof response === "object" && response && "ok" in response && response.ok === false) {
          reject(new Error((response as { error?: string }).error ?? "unknown"));
          return;
        }

        if (typeof response === "object" && response && "payload" in response) {
          resolve((response as { payload?: T }).payload as T);
          return;
        }

        resolve(response as T);
      });
    });

  const requestAnnotations = async (slug: string, forceRefresh = false) =>
    sendBackgroundMessage<MarketAnnotationResponse>({
      type: "wsm:getMarketAnnotations",
      slug,
      forceRefresh
    });

  const requestAddressLookup = async (addresses: string[]) =>
    sendBackgroundMessage<AddressLookupSummary[]>({
      type: "wsm:lookupAddresses",
      addresses
    });

  const publishPageState = async (state: PageRuntimeState) => {
    const serialized = JSON.stringify(state);
    if (serialized === lastPublishedStateKey) {
      return;
    }

    lastPublishedStateKey = serialized;
    setDebugState("Surface", state.surfaceKind ?? "none");
    setDebugState("Rows", String(state.rowsDetected));
    setDebugState("Rendered", String(state.rowsAnnotated));
    setDebugState("Fallback", state.fallbackMode ? "1" : "0");
    setDebugState("Error", state.errorCode ?? "");
    setDebugState("Runtime", state.runtimeStatus);

    try {
      await sendBackgroundMessage({
        type: "wsm:reportPageSurfaceState",
        state
      });
    } catch {
      // Backward compatible with older background builds.
    }
  };

  const reportHealth = async (
    errorCode: string | undefined,
    state: Pick<
      PageRuntimeState,
      "slug" | "surfaceKind" | "surfaceFound" | "rowsDetected" | "rowsAnnotated" | "sourceStatus" | "runtimeStatus"
    >,
    addresses?: string[]
  ) => {
    const event: RuntimeHealthEvent = {
      extensionVersion: chrome.runtime.getManifest().version,
      parserVersion: PARSER_VERSION,
      at: new Date().toISOString(),
      marketSlug: state.slug,
      surfaceKind: state.surfaceKind,
      surfaceFound: state.surfaceFound,
      rowsDetected: state.rowsDetected,
      rowsAnnotated: state.rowsAnnotated,
      errorCode,
      pageLanguage: document.documentElement.lang || navigator.language,
      runtimeStatus: state.runtimeStatus,
      sourceStatus: state.sourceStatus,
      addresses
    };
    const serialized = JSON.stringify({
      marketSlug: event.marketSlug,
      surfaceKind: event.surfaceKind,
      surfaceFound: event.surfaceFound,
      rowsDetected: event.rowsDetected,
      rowsAnnotated: event.rowsAnnotated,
      errorCode: event.errorCode,
      runtimeStatus: event.runtimeStatus,
      sourceStatus: event.sourceStatus,
      addresses: event.addresses
    });

    if (serialized === lastHealthKey) {
      return;
    }

    lastHealthKey = serialized;
    try {
      await sendBackgroundMessage({
        type: "wsm:reportHealth",
        event
      });
    } catch {
      // Ignore when background does not support health forwarding yet.
    }
  };

  const uniqueElements = <T extends HTMLElement>(elements: Array<T | null | undefined>) => {
    const seen = new Set<T>();
    return elements.filter((element): element is T => {
      if (!element || seen.has(element)) {
        return false;
      }
      seen.add(element);
      return true;
    });
  };
  type HolderColumnSnapshot = {
    side: Exclude<HolderRowSide, "unknown">;
    titleNode: HTMLElement;
    header: HTMLElement;
    columnRoot: HTMLElement;
    listRoot: HTMLElement;
  };

  type StructuredSurfaceCandidate = {
    root: HTMLElement;
    columns: HolderColumnSnapshot[];
    rows: HolderRowSnapshot[];
    fallbackAnchor: HTMLElement;
    confidence: number;
  };

  const findVisibleTitleElements = (titles: string[], scope: ParentNode = document) =>
    Array.from(scope.querySelectorAll<HTMLElement>(TITLE_SELECTOR)).filter((element) => {
      if (!isVisible(element)) {
        return false;
      }
      const text = compactText(element.textContent);
      return text.length > 0 && text.length <= 24 && hasExactTitle(text, titles);
    });

  const hasTabText = (button: HTMLButtonElement, texts: string[]) => {
    const text = compactText(button.textContent);
    return texts.some((label) => text === label || text.includes(label));
  };

  const findFeedTabStrip = () =>
    Array.from(document.querySelectorAll<HTMLElement>("div")).find((element) => {
      if (!isVisible(element)) {
        return false;
      }
      const buttons = Array.from(element.querySelectorAll<HTMLButtonElement>("button")).filter((button) =>
        isVisible(button)
      );
      return (
        buttons.length >= 3 &&
        buttons.some((button) => hasTabText(button, FEED_COMMENTS_LABELS)) &&
        buttons.some((button) => hasTabText(button, FEED_TOP_HOLDERS_LABELS)) &&
        buttons.some((button) => hasTabText(button, FEED_ACTIVITY_LABELS))
      );
    }) ?? null;

  const findTopHoldersTabButton = () => {
    const strip = findFeedTabStrip();
    if (!strip) {
      return null;
    }
    return (
      Array.from(strip.querySelectorAll<HTMLButtonElement>("button")).find((button) =>
        isVisible(button) && hasTabText(button, FEED_TOP_HOLDERS_LABELS)
      ) ?? null
    );
  };

  const isTopHoldersTabActive = (button: HTMLButtonElement | null) => {
    if (!button) {
      return false;
    }
    const className = getElementClassName(button);
    if (className.includes("text-text-secondary")) {
      return false;
    }
    return className.includes("text-text") || button.getAttribute("aria-selected") === "true";
  };

  const collectNextVisibleSiblings = (element: HTMLElement | null) => {
    const siblings: HTMLElement[] = [];
    let current = element?.nextElementSibling;
    while (current instanceof HTMLElement) {
      if (isVisible(current)) {
        siblings.push(current);
      }
      current = current.nextElementSibling;
    }
    return siblings;
  };

  const isFeedPanelCandidate = (element: HTMLElement | null) => {
    if (!element || !isVisible(element) || element.querySelector("article.comment")) {
      return false;
    }

    const text = compactText(element.textContent);
    const profileCount = countUniqueProfileAddresses(element);
    if (!text || profileCount < 2 || text.length > 3200) {
      return false;
    }

    if (hasAnyTitle(text, MAIN_YES_LABELS) && hasAnyTitle(text, MAIN_NO_LABELS)) {
      return true;
    }

    const lowerText = text.toLowerCase();
    return HOLDER_SURFACE_KEYWORDS.some((keyword) => lowerText.includes(keyword.toLowerCase()));
  };

  const findFeedTopHoldersPanel = (button: HTMLButtonElement | null) => {
    if (!button) {
      return null;
    }
    const strip = findFeedTabStrip();
    if (!strip) {
      return null;
    }

    const candidates = uniqueElements([
      strip,
      strip.parentElement instanceof HTMLElement ? strip.parentElement : null,
      strip.parentElement?.parentElement instanceof HTMLElement ? strip.parentElement.parentElement : null,
      button.closest<HTMLElement>("#comments"),
      button.closest<HTMLElement>("section")
    ]);

    const scoredCandidates: Array<{ element: HTMLElement; score: number }> = [];

    for (const candidate of candidates) {
      collectNextVisibleSiblings(candidate)
        .filter((sibling) => isFeedPanelCandidate(sibling))
        .forEach((element, index) => {
          scoredCandidates.push({
            element,
            score: countUniqueProfileAddresses(element) * 10 - index
          });
        });

      Array.from(candidate.querySelectorAll<HTMLElement>("div,section"))
        .filter((element) => element !== candidate && isFeedPanelCandidate(element))
        .forEach((element) => {
          scoredCandidates.push({
            element,
            score: countUniqueProfileAddresses(element) * 10 - compactText(element.textContent).length / 260
          });
        });
    }

    return scoredCandidates.sort((left, right) => right.score - left.score)[0]?.element ?? null;
  };

  const resolveColumnHeader = (
    titleNode: HTMLElement,
    ownTitles: string[],
    otherTitles: string[],
    boundary: HTMLElement | null
  ) =>
    findAncestor(titleNode, boundary, (element) => {
      if (!isVisible(element)) {
        return false;
      }
      const text = compactText(element.textContent);
      return (
        text.length > 0 &&
        text.length <= 48 &&
        hasAnyTitle(text, ownTitles) &&
        !hasAnyTitle(text, otherTitles) &&
        SHARES_LABEL_PATTERN.test(text)
      );
    });

  const resolveColumnListRoot = (columnRoot: HTMLElement, header: HTMLElement) => {
    const children = getVisibleChildren(columnRoot);
    const headerIndex = children.findIndex((child) => child === header || child.contains(header));
    const directListRoot =
      (headerIndex >= 0
        ? children
            .slice(headerIndex + 1)
            .find((child) => countUniqueProfileAddresses(child) >= 1 && !child.querySelector("article.comment"))
        : null) ?? null;

    if (directListRoot) {
      return directListRoot;
    }

    return (
      Array.from(columnRoot.querySelectorAll<HTMLElement>("div,section"))
        .filter((element) => isVisible(element) && !element.querySelector("article.comment"))
        .sort((left, right) => countUniqueProfileAddresses(right) - countUniqueProfileAddresses(left))[0] ?? null
    );
  };

  const resolveHolderColumn = (
    titleNode: HTMLElement,
    side: Exclude<HolderRowSide, "unknown">,
    boundary: HTMLElement | null
  ): HolderColumnSnapshot | null => {
    const ownTitles = side === "yes" ? MAIN_YES_LABELS : MAIN_NO_LABELS;
    const otherTitles = side === "yes" ? MAIN_NO_LABELS : MAIN_YES_LABELS;
    const header = resolveColumnHeader(titleNode, ownTitles, otherTitles, boundary);

    if (!header) {
      return null;
    }

    const columnRoot = findAncestor(header, boundary, (element) => {
      if (!isVisible(element) || element.classList.contains(ROOT_CLASS) || element.closest("article.comment")) {
        return false;
      }

      const text = compactText(element.textContent);
      if (!text || text.length > 2400 || !hasAnyTitle(text, ownTitles) || hasAnyTitle(text, otherTitles)) {
        return false;
      }

      return Boolean(resolveColumnListRoot(element, header));
    });

    if (!columnRoot) {
      return null;
    }

    const listRoot = resolveColumnListRoot(columnRoot, header);
    if (!listRoot || countUniqueProfileAddresses(listRoot) < 1) {
      return null;
    }

    return {
      side,
      titleNode,
      header,
      columnRoot,
      listRoot
    };
  };

  const resolveStructuredSurfaceRoot = (
    yesColumn: HolderColumnSnapshot,
    noColumn: HolderColumnSnapshot,
    boundary: HTMLElement | null
  ) => {
    const sharedRoot = findCommonAncestor(yesColumn.columnRoot, noColumn.columnRoot);
    if (!sharedRoot || !isVisible(sharedRoot) || sharedRoot.closest("article.comment")) {
      return null;
    }

    const sharedText = compactText(sharedRoot.textContent);
    if (
      !sharedText ||
      sharedText.length > 3000 ||
      !hasAnyTitle(sharedText, MAIN_YES_LABELS) ||
      !hasAnyTitle(sharedText, MAIN_NO_LABELS)
    ) {
      return null;
    }

    let root = sharedRoot;
    const parent = sharedRoot.parentElement;
    if (parent && isVisible(parent)) {
      const parentText = compactText(parent.textContent);
      const parentProfileCount = countUniqueProfileAddresses(parent);
      const sharedProfileCount = countUniqueProfileAddresses(sharedRoot);
      const hasLocalControls = getVisibleChildren(parent).some(
        (child) =>
          child !== sharedRoot &&
          (child.querySelector('button[aria-haspopup="menu"]') ||
            child.querySelector('button[id^="radix-"]'))
      );

      if (
        hasLocalControls &&
        parentText.length > 0 &&
        parentText.length <= 3400 &&
        parentProfileCount <= sharedProfileCount + 1
      ) {
        root = parent;
      }
    }

    if (boundary && !boundary.contains(root)) {
      return null;
    }

    return root;
  };

  const isSurfaceLinkedToFeedStrip = (root: HTMLElement, strip: HTMLElement | null) => {
    if (!strip) {
      return false;
    }

    let current: HTMLElement | null = root;
    while (current) {
      if (current === strip || current.contains(strip) || strip.contains(current)) {
        return true;
      }

      let previous: Element | null = current.previousElementSibling;
      while (previous instanceof HTMLElement) {
        if (
          previous === strip ||
          previous.contains(strip) ||
          previous.id === "comments" ||
          previous.querySelector("#comments")
        ) {
          return true;
        }
        previous = previous.previousElementSibling;
      }

      current = current.parentElement;
    }

    return false;
  };

  const buildStructuredSurfaceCandidate = (
    scopeRoot: ParentNode,
    surfaceKind: HolderSurfaceKind,
    options?: { excludeFeedStrip?: boolean }
  ): StructuredSurfaceCandidate | null => {
    const scopeElement = scopeRoot instanceof HTMLElement ? scopeRoot : null;
    const strip = findFeedTabStrip();
    const yesNodes = findVisibleTitleElements(MAIN_YES_LABELS, scopeRoot);
    const noNodes = findVisibleTitleElements(MAIN_NO_LABELS, scopeRoot);
    const candidates: StructuredSurfaceCandidate[] = [];
    const seen = new Set<string>();

    yesNodes.forEach((yesNode) => {
      const yesColumn = resolveHolderColumn(yesNode, "yes", scopeElement);
      if (!yesColumn) {
        return;
      }

      noNodes.forEach((noNode) => {
        const noColumn = resolveHolderColumn(noNode, "no", scopeElement);
        if (!noColumn || yesColumn.columnRoot === noColumn.columnRoot) {
          return;
        }

        const root = resolveStructuredSurfaceRoot(yesColumn, noColumn, scopeElement);
        if (!root) {
          return;
        }

        if (options?.excludeFeedStrip && isSurfaceLinkedToFeedStrip(root, strip)) {
          return;
        }

        const rows = [
          ...extractHolderRowsFromColumn(yesColumn, surfaceKind),
          ...extractHolderRowsFromColumn(noColumn, surfaceKind)
        ].sort((left, right) => right.confidence - left.confidence);

        if (rows.length < 2) {
          return;
        }

        const key = [
          buildDomPath(root, document.body),
          buildDomPath(yesColumn.columnRoot, root),
          buildDomPath(noColumn.columnRoot, root)
        ].join("|");
        if (seen.has(key)) {
          return;
        }
        seen.add(key);

        const confidence = Math.min(
          0.99,
          0.55 +
            Math.min(0.2, rows.length * 0.015) +
            Math.min(0.12, countUniqueProfileAddresses(root) * 0.01) +
            (scopeElement ? 0.08 : 0)
        );

        candidates.push({
          root,
          columns: [yesColumn, noColumn],
          rows,
          fallbackAnchor: root,
          confidence
        });
      });
    });

    return candidates.sort((left, right) => right.confidence - left.confidence)[0] ?? null;
  };

  const isHolderRowContainer = (element: HTMLElement) => {
    if (!isVisible(element) || element.classList.contains(ROOT_CLASS) || element.closest("article.comment")) {
      return false;
    }
    if (countUniqueProfileAddresses(element) !== 1) {
      return false;
    }

    const text = compactText(element.textContent);
    if (!text || text.length > 180 || containsCommentMetadata(text)) {
      return false;
    }

    const visibleChildren = getVisibleChildren(element);
    const hasNumericSide = visibleChildren.some((child) => matchesAmountText(child.textContent ?? ""));
    const className = getElementClassName(element);

    return (
      (hasNumericSide && visibleChildren.length >= 2) ||
      className.includes("border-b") ||
      className.includes("justify-between") ||
      className.includes("h-[44px]")
    );
  };

  const findRowContainerFromProfileAnchor = (anchor: HTMLAnchorElement, root: HTMLElement) =>
    findAncestor(anchor.parentElement, root, isHolderRowContainer) ?? (isHolderRowContainer(root) ? root : null);

  const findBestTextAnchorInRow = (row: HTMLElement, address: string) =>
    Array.from(row.querySelectorAll<HTMLAnchorElement>('a[href*="/profile/"]'))
      .filter((anchor) => resolveProfileAddress(anchor) === address)
      .sort((left, right) => scoreProfileAnchor(right) - scoreProfileAnchor(left))[0] ?? null;

  const findNameLineContainer = (anchor: HTMLAnchorElement, row: HTMLElement) =>
    findAncestor(anchor.parentElement, row, (element) => {
      const text = compactText(element.textContent);
      const className = getElementClassName(element);
      return (
        text.length > 0 &&
        text.length <= 72 &&
        countUniqueProfileAddresses(element) === 1 &&
        (className.includes("gap-1") || className.includes("items-center") || className.includes("gap-2"))
      );
    });

  const findMetaContainerInsideRow = (row: HTMLElement, address: string): HolderRowMount => {
    const textAnchor = findBestTextAnchorInRow(row, address);
    const nameLine = textAnchor ? findNameLineContainer(textAnchor, row) : null;

    if (nameLine?.parentElement instanceof HTMLElement && nameLine.parentElement !== row) {
      return {
        row,
        nameLine,
        mountTarget: nameLine.parentElement,
        mainContainer:
          nameLine.parentElement.parentElement instanceof HTMLElement ? nameLine.parentElement.parentElement : null
      };
    }

    const ml4Container = Array.from(row.querySelectorAll<HTMLElement>("div")).find(
      (element) =>
        getElementClassName(element).includes("ml-4") &&
        Array.from(element.querySelectorAll<HTMLAnchorElement>('a[href*="/profile/"]')).some(
          (anchor) => resolveProfileAddress(anchor) === address
        )
    );

    if (ml4Container) {
      return {
        row,
        nameLine: nameLine ?? (ml4Container.firstElementChild as HTMLElement | null),
        mountTarget: ml4Container,
        mainContainer: ml4Container.parentElement instanceof HTMLElement ? ml4Container.parentElement : null
      };
    }

    return {
      row,
      nameLine,
      mountTarget: row,
      mainContainer: row.firstElementChild instanceof HTMLElement ? row.firstElementChild : null
    };
  };

  const findAmountTextInRow = (row: HTMLElement, address: string) => {
    const candidates = Array.from(row.querySelectorAll<HTMLElement>("span,div,p"))
      .filter((element) => isVisible(element))
      .map((element) => compactText(element.textContent))
      .filter((text) => text && !text.includes(address) && matchesAmountText(text));

    return candidates.sort((left, right) => right.length - left.length)[0];
  };

  const inferRowSide = (row: HTMLElement, root: HTMLElement): HolderRowSide => {
    let current: HTMLElement | null = row;
    while (current && current !== root) {
      const nearbyText = compactText(current.textContent);
      if (hasAnyTitle(nearbyText, MAIN_YES_LABELS) && !hasAnyTitle(nearbyText, MAIN_NO_LABELS)) {
        return "yes";
      }
      if (hasAnyTitle(nearbyText, MAIN_NO_LABELS) && !hasAnyTitle(nearbyText, MAIN_YES_LABELS)) {
        return "no";
      }
      const previousSibling = current.previousElementSibling;
      if (previousSibling instanceof HTMLElement) {
        const siblingText = compactText(previousSibling.textContent);
        if (hasAnyTitle(siblingText, MAIN_YES_LABELS)) {
          return "yes";
        }
        if (hasAnyTitle(siblingText, MAIN_NO_LABELS)) {
          return "no";
        }
      }
      current = current.parentElement;
    }
    return "unknown";
  };

  const buildRowSnapshot = (
    anchor: HTMLAnchorElement,
    rowScopeRoot: HTMLElement,
    surfaceKind: HolderSurfaceKind,
    options?: {
      side?: HolderRowSide;
      rowKeyPrefix?: string;
    }
  ): HolderRowSnapshot | null => {
    const normalizedAddress = resolveProfileAddress(anchor) ?? normalizeAddress(anchor.textContent ?? "");
    if (!normalizedAddress) {
      return null;
    }

    const row = findRowContainerFromProfileAnchor(anchor, rowScopeRoot);
    if (!row) {
      return null;
    }

    const mount = findMetaContainerInsideRow(row, normalizedAddress);
    const amountText = findAmountTextInRow(row, normalizedAddress);
    const displayNameText = compactText(anchor.textContent);
    const confidence =
      (normalizedAddress ? 0.58 : 0) +
      (amountText ? 0.22 : 0) +
      (displayNameText ? 0.12 : 0) +
      (mount.nameLine ? 0.08 : 0);
    const rowPath = buildDomPath(row, rowScopeRoot) || "row";
    const rowKeyPrefix = options?.rowKeyPrefix ?? buildDomPath(rowScopeRoot, document.body);

    return {
      surfaceKind,
      rowKey: `${surfaceKind}:${rowKeyPrefix}:${options?.side ?? "unknown"}:${rowPath}:${normalizedAddress}`,
      normalizedAddress,
      rawAddress: normalizedAddress,
      profileHref: anchor.getAttribute("href") ?? anchor.href ?? undefined,
      displayNameText,
      amountText,
      side: options?.side ?? inferRowSide(row, rowScopeRoot),
      confidence,
      mount
    };
  };

  const extractHolderRows = (root: HTMLElement, surfaceKind: HolderSurfaceKind) => {
    const bestByKey = new Map<string, HolderRowSnapshot>();
    collectVisibleProfileAnchors(root).forEach((anchor) => {
      const snapshot = buildRowSnapshot(anchor, root, surfaceKind);
      if (!snapshot) {
        return;
      }
      const current = bestByKey.get(snapshot.rowKey);
      if (!current || snapshot.confidence > current.confidence) {
        bestByKey.set(snapshot.rowKey, snapshot);
      }
    });
    return [...bestByKey.values()].sort((left, right) => right.confidence - left.confidence);
  };

  const extractHolderRowsFromColumn = (column: HolderColumnSnapshot, surfaceKind: HolderSurfaceKind) => {
    const bestByKey = new Map<string, HolderRowSnapshot>();
    const rowKeyPrefix = buildDomPath(column.columnRoot, document.body);

    collectVisibleProfileAnchors(column.listRoot).forEach((anchor) => {
      const snapshot = buildRowSnapshot(anchor, column.listRoot, surfaceKind, {
        side: column.side,
        rowKeyPrefix
      });
      if (!snapshot) {
        return;
      }
      const current = bestByKey.get(snapshot.rowKey);
      if (!current || snapshot.confidence > current.confidence) {
        bestByKey.set(snapshot.rowKey, snapshot);
      }
    });

    return [...bestByKey.values()].sort((left, right) => right.confidence - left.confidence);
  };

  const findMainSurfaceFallbackAnchor = (root: HTMLElement) => {
    const titleNode = findVisibleTitleElements([...MAIN_YES_LABELS, ...MAIN_NO_LABELS]).find((element) =>
      root.contains(element)
    );
    return titleNode?.parentElement instanceof HTMLElement ? titleNode.parentElement : root;
  };

  const detectMarketMainSurface = (): HolderPanelSnapshot | null => {
    const selected = buildStructuredSurfaceCandidate(document.body, "market-main-holders", {
      excludeFeedStrip: true
    });

    if (!selected) {
      return null;
    }

    return {
      panelKey: `main:${buildDomPath(selected.root, document.body)}`,
      titleText: "Main Holders",
      active: true,
      surfaceKind: "market-main-holders",
      confidence: selected.confidence,
      root: selected.root,
      rows: selected.rows,
      fallbackAnchor: findMainSurfaceFallbackAnchor(selected.root)
    };
  };

  const detectFeedTopHoldersSurface = (): HolderPanelSnapshot | null => {
    const button = findTopHoldersTabButton();
    if (!button) {
      return null;
    }

    const strip = findFeedTabStrip();
    const commentsSection = button.closest<HTMLElement>("#comments");
    const panel = findFeedTopHoldersPanel(button);
    const fallbackScope = uniqueElements([
      commentsSection?.nextElementSibling instanceof HTMLElement ? commentsSection.nextElementSibling : null,
      commentsSection?.parentElement?.nextElementSibling instanceof HTMLElement
        ? commentsSection.parentElement.nextElementSibling
        : null,
      strip?.parentElement?.nextElementSibling instanceof HTMLElement ? strip.parentElement.nextElementSibling : null,
      strip?.parentElement?.parentElement?.nextElementSibling instanceof HTMLElement
        ? strip.parentElement.parentElement.nextElementSibling
        : null
    ])[0] ?? null;
    const structured =
      (panel ? buildStructuredSurfaceCandidate(panel, "feed-top-holders") : null) ??
      (fallbackScope ? buildStructuredSurfaceCandidate(fallbackScope, "feed-top-holders") : null);
    const active = Boolean(panel || structured) || isTopHoldersTabActive(button);
    const root =
      structured?.root ??
      panel ??
      button.closest<HTMLElement>("section") ??
      button.parentElement?.parentElement ??
      button.parentElement ??
      button;

    return {
      panelKey: `feed:${buildDomPath(root, document.body)}`,
      titleText: compactText(button.textContent) || "Top Holders",
      active,
      surfaceKind: "feed-top-holders",
      confidence: structured ? structured.confidence : active && panel ? 0.86 : 0.52,
      root,
      rows: structured?.rows ?? (panel ? extractHolderRows(panel, "feed-top-holders") : []),
      fallbackAnchor: structured?.fallbackAnchor ?? panel ?? root
    };
  };

  const detectHolderSurface = () => detectMarketMainSurface() ?? detectFeedTopHoldersSurface();

  const loadLookupSummaryMap = async (addresses: string[]) => {
    const uniqueAddresses = Array.from(new Set(addresses.filter(Boolean))).sort();
    if (uniqueAddresses.length === 0) {
      return new Map<string, AddressLookupSummary>();
    }

    const cacheKey = uniqueAddresses.join("|");
    const canReuse = !forceLookupRefresh && cacheKey === lookupCacheKey && Date.now() - lookupCacheAt < DIRECT_LOOKUP_TTL_MS;
    if (canReuse) {
      return lookupCache;
    }

    const summaries = await requestAddressLookup(uniqueAddresses);
    lookupCache = new Map(summaries.map((summary) => [summary.normalizedAddress, summary] as const));
    lookupCacheKey = cacheKey;
    lookupCacheAt = Date.now();
    return lookupCache;
  };

  const selectPrimaryBadge = (summary: AddressSummary, aliasText: string, holderDisplayName: string) =>
    summary.badges
      .filter((badge) => {
        const normalizedBadge = compactText(badge.text).toLowerCase();
        return (
          normalizedBadge.length > 0 &&
          normalizedBadge !== compactText(aliasText).toLowerCase() &&
          normalizedBadge !== compactText(holderDisplayName).toLowerCase()
        );
      })
      .sort((left, right) => {
        const toneDiff = (BADGE_PRIORITY[right.tone] ?? 0) - (BADGE_PRIORITY[left.tone] ?? 0);
        if (toneDiff !== 0) {
          return toneDiff;
        }
        return left.text.length - right.text.length;
      })[0];

  const buildResolvedAnnotation = (
    row: HolderRowSnapshot,
    summary: AddressSummary,
    holder: Pick<AnnotatedHolder, "proxyWallet" | "displayName">,
    source: InlineAnnotationSource
  ): ResolvedInlineAnnotation => {
    const aliasText = summary.alias?.trim() || row.displayNameText || holder.displayName || shortenAddress(holder.proxyWallet);
    return {
      key: `${row.rowKey}:${row.normalizedAddress}`,
      rowKey: row.rowKey,
      normalizedAddress: row.normalizedAddress ?? "",
      surfaceKind: row.surfaceKind,
      source,
      aliasText: truncateText(aliasText, 22),
      primaryBadge: selectPrimaryBadge(summary, aliasText, holder.displayName),
      noteSnippet: truncateText(summary.noteSnippet, 48),
      detailUrl: summary.detailUrl,
      summaryVersion: summary.version,
      proxyWallet: holder.proxyWallet,
      displayName: holder.displayName
    };
  };

  const resolvePanelAnnotations = async (
    panel: HolderPanelSnapshot,
    payload: MarketAnnotationResponse,
    generation: number
  ) => {
    const payloadByAddress = new Map(
      payload.holders
        .filter((holder) => holder.summary)
        .map((holder) => [holder.normalizedAddress, holder] as const)
    );
    const visibleAddresses = Array.from(
      new Set(panel.rows.map((row) => row.normalizedAddress).filter((address): address is string => Boolean(address)))
    );
    const resolved = new Map<string, ResolvedInlineAnnotation>();

    panel.rows.forEach((row) => {
      if (!row.normalizedAddress) {
        return;
      }
      const holder = payloadByAddress.get(row.normalizedAddress);
      if (!holder?.summary) {
        return;
      }
      resolved.set(
        `${row.rowKey}:${row.normalizedAddress}`,
        buildResolvedAnnotation(row, holder.summary, holder, "market_annotations")
      );
    });

    const missingVisibleAddresses = visibleAddresses.filter((address) => !payloadByAddress.has(address));
    if (missingVisibleAddresses.length > 0) {
      try {
        const lookupByAddress = await loadLookupSummaryMap(missingVisibleAddresses);
        if (generation !== renderGeneration) {
          return null;
        }

        panel.rows.forEach((row) => {
          if (!row.normalizedAddress || payloadByAddress.has(row.normalizedAddress)) {
            return;
          }
          const summary = lookupByAddress.get(row.normalizedAddress);
          if (!summary) {
            return;
          }
          resolved.set(
            `${row.rowKey}:${row.normalizedAddress}`,
            buildResolvedAnnotation(
              row,
              summary,
              {
                proxyWallet: summary.address,
                displayName: row.displayNameText || shortenAddress(summary.address)
              },
              "labels_lookup"
            )
          );
        });
      } catch (error) {
        logDebug("visible address lookup failed", error);
        await reportHealth("lookup_failed", {
          slug: currentSlug ?? undefined,
          surfaceKind: panel.surfaceKind,
          surfaceFound: true,
          rowsDetected: panel.rows.length,
          rowsAnnotated: resolved.size,
          sourceStatus: currentPayload?.sourceStatus,
          runtimeStatus: currentRuntimeStatus
        }, missingVisibleAddresses);
      }
    }

    return {
      annotations: [...resolved.values()],
      visibleAddressCount: visibleAddresses.length
    };
  };

  const ensureMountClasses = (mount: HolderRowMount) => {
    mount.row.classList.add(HOLDER_ROW_CLASS);
    mount.mainContainer?.classList.add(HOLDER_MAIN_CLASS);
    mount.mountTarget.classList.add(HOLDER_META_CLASS);
  };

  const cleanupMountClasses = (entry: {
    row: HTMLElement;
    mountTarget: HTMLElement;
    mainContainer?: HTMLElement | null;
  }) => {
    if (!entry.row.querySelector(`.${ROOT_CLASS}`)) {
      entry.row.classList.remove(HOLDER_ROW_CLASS);
      delete entry.row.dataset.wsmRowAddress;
      delete entry.row.dataset.wsmRowSide;
      delete entry.row.dataset.wsmRowSurface;
    }
    if (!entry.mountTarget.querySelector(`.${ROOT_CLASS}`)) {
      entry.mountTarget.classList.remove(HOLDER_META_CLASS);
    }
    if (entry.mainContainer && !entry.mainContainer.querySelector(`.${ROOT_CLASS}`)) {
      entry.mainContainer.classList.remove(HOLDER_MAIN_CLASS);
    }
  };

  const removeMountedAnnotation = (key: string) => {
    const entry = mountedAnnotations.get(key);
    if (!entry) {
      return;
    }
    entry.node.remove();
    mountedAnnotations.delete(key);
    cleanupMountClasses(entry);
  };

  const clearMountedFallback = () => {
    mountedFallbackNode?.remove();
    mountedFallbackNode = null;
  };

  const clearAnnotations = () => {
    [...mountedAnnotations.keys()].forEach((key) => removeMountedAnnotation(key));
    clearMountedFallback();
    setDebugState("Rendered", "0");
  };

  const invalidatePendingRender = () => {
    renderGeneration += 1;
    if (renderTimer) {
      window.clearTimeout(renderTimer);
      renderTimer = null;
    }
  };

  const createBadgeNode = (
    badge: AddressSummary["badges"][number],
    detailUrl?: string
  ) => {
    if (detailUrl) {
      const link = document.createElement("a");
      link.className = `wsm-chip wsm-chip--${badge.tone || "neutral"}`;
      link.href = detailUrl;
      link.target = "_blank";
      link.rel = "noreferrer";
      link.textContent = truncateText(badge.text, 18);
      return link;
    }
    const span = document.createElement("span");
    span.className = `wsm-chip wsm-chip--${badge.tone || "neutral"}`;
    span.textContent = truncateText(badge.text, 18);
    return span;
  };

  const buildAnnotationNode = (annotation: ResolvedInlineAnnotation) => {
    const row = document.createElement("div");
    row.className = `${ROOT_CLASS} ${ROW_CLASS}`;
    row.dataset.annotationKey = annotation.key;
    row.dataset.address = annotation.normalizedAddress;
    row.dataset.surfaceKind = annotation.surfaceKind;
    row.dataset.source = annotation.source;
    row.dataset.version = annotation.summaryVersion;

    const aliasLink = document.createElement("a");
    aliasLink.className = "wsm-alias";
    aliasLink.href = annotation.detailUrl;
    aliasLink.target = "_blank";
    aliasLink.rel = "noreferrer";
    aliasLink.textContent = annotation.aliasText;
    aliasLink.title = annotation.noteSnippet
      ? `${annotation.proxyWallet}\n${annotation.noteSnippet}`
      : annotation.proxyWallet;
    row.append(aliasLink);

    if (annotation.primaryBadge) {
      row.append(createBadgeNode(annotation.primaryBadge, annotation.detailUrl));
    } else if (annotation.noteSnippet) {
      const note = document.createElement("span");
      note.className = "wsm-note";
      note.textContent = truncateText(annotation.noteSnippet, 24);
      row.append(note);
    }

    return row;
  };

  const upsertMountedAnnotation = (row: HolderRowSnapshot, annotation: ResolvedInlineAnnotation) => {
    const existing = mountedAnnotations.get(annotation.key);
    if (
      existing &&
      existing.row === row.mount.row &&
      existing.mountTarget === row.mount.mountTarget &&
      existing.node.isConnected &&
      existing.node.dataset.version === annotation.summaryVersion
    ) {
      return;
    }

    if (existing) {
      removeMountedAnnotation(annotation.key);
    }

    ensureMountClasses(row.mount);
    row.mount.row.dataset.wsmRowAddress = row.normalizedAddress ?? "";
    row.mount.row.dataset.wsmRowSide = row.side;
    row.mount.row.dataset.wsmRowSurface = row.surfaceKind;
    const node = buildAnnotationNode(annotation);
    if (row.mount.nameLine) {
      row.mount.nameLine.insertAdjacentElement("afterend", node);
    } else {
      row.mount.mountTarget.append(node);
    }

    mountedAnnotations.set(annotation.key, {
      node,
      row: row.mount.row,
      mountTarget: row.mount.mountTarget,
      mainContainer: row.mount.mainContainer
    });
  };

  const renderFallbackList = (
    panel: HolderPanelSnapshot,
    payload: MarketAnnotationResponse,
    annotations: ResolvedInlineAnnotation[]
  ) => {
    clearMountedFallback();
    const items = payload.holders.filter((holder) => holder.summary).slice(0, 6);
    if (items.length === 0) {
      return false;
    }

    const shell = document.createElement("div");
    shell.className = `${ROOT_CLASS} ${FALLBACK_CLASS}`;
    shell.dataset.surfaceKind = panel.surfaceKind;

    const title = document.createElement("div");
    title.className = "wsm-fallback-title";
    title.textContent = "Smart labels";
    shell.append(title);

    const list = document.createElement("div");
    list.className = "wsm-fallback-list";

    items.forEach((holder) => {
      if (!holder.summary) {
        return;
      }

      const item = document.createElement("a");
      item.className = "wsm-fallback-item";
      item.href = holder.summary.detailUrl;
      item.target = "_blank";
      item.rel = "noreferrer";

      const alias = document.createElement("span");
      alias.className = "wsm-fallback-alias";
      alias.textContent = holder.summary.alias?.trim() || holder.displayName || shortenAddress(holder.proxyWallet);
      item.append(alias);

      const badge = selectPrimaryBadge(holder.summary, alias.textContent ?? "", holder.displayName);
      if (badge) {
        item.append(createBadgeNode(badge));
      }

      list.append(item);
    });

    shell.append(list);
    panel.fallbackAnchor.append(shell);
    mountedFallbackNode = shell;
    return annotations.length === 0;
  };

  const reconcileInlineAnnotations = (
    panel: HolderPanelSnapshot,
    payload: MarketAnnotationResponse,
    annotations: ResolvedInlineAnnotation[],
    visibleAddressCount: number
  ) => {
    const rowsByKey = new Map(panel.rows.map((row) => [row.rowKey, row] as const));
    const nextKeys = new Set(annotations.map((annotation) => annotation.key));

    [...mountedAnnotations.keys()].forEach((key) => {
      const entry = mountedAnnotations.get(key);
      if (!entry || !nextKeys.has(key) || !entry.row.isConnected || !entry.mountTarget.isConnected) {
        removeMountedAnnotation(key);
      }
    });

    annotations.forEach((annotation) => {
      const row = rowsByKey.get(annotation.rowKey);
      if (row) {
        upsertMountedAnnotation(row, annotation);
      }
    });

    const shouldRenderFallback =
      Boolean(payload.matchedSummaryCount) && annotations.length === 0 && visibleAddressCount === 0;
    if (shouldRenderFallback) {
      renderFallbackList(panel, payload, annotations);
    } else {
      clearMountedFallback();
    }

    setDebugState("Rendered", String(annotations.length));
    setDebugState("VisibleHits", String(new Set(annotations.map((annotation) => annotation.normalizedAddress)).size));
    return shouldRenderFallback;
  };

  const queueRender = (options?: { forceVisibleLookup?: boolean }) => {
    if (options?.forceVisibleLookup) {
      forceLookupRefresh = true;
    }
    invalidatePendingRender();
    renderTimer = window.setTimeout(() => {
      void renderAnnotations();
    }, 80);
  };

  const syncSurfaceObserver = (root: HTMLElement | null) => {
    if (observedSurfaceRoot === root) {
      return;
    }
    surfaceObserver?.disconnect();
    surfaceObserver = null;
    observedSurfaceRoot = root;

    if (!root) {
      return;
    }

    surfaceObserver = new MutationObserver((mutations) => {
      const hasExternalMutation = mutations.some((mutation) =>
        [...mutation.addedNodes, ...mutation.removedNodes].some((node) => !(node instanceof HTMLElement) || !node.closest(`.${ROOT_CLASS}`))
      );
      if (hasExternalMutation) {
        queueRender();
      }
    });

    surfaceObserver.observe(root, {
      childList: true,
      subtree: true
    });
  };

  const ensureDiscoveryObserver = () => {
    if (discoveryObserver || !document.body) {
      return;
    }

    discoveryObserver = new MutationObserver((mutations) => {
      const hasExternalMutation = mutations.some((mutation) =>
        [...mutation.addedNodes, ...mutation.removedNodes].some((node) => !(node instanceof HTMLElement) || !node.closest(`.${ROOT_CLASS}`))
      );
      if (hasExternalMutation) {
        queueRender();
      }
    });

    discoveryObserver.observe(document.body, {
      childList: true,
      subtree: true
    });
  };

  const ensureResizeObserver = () => {
    if (resizeObserver) {
      return;
    }
    resizeObserver = new ResizeObserver(() => {
      if (currentConfig.enabled && document.visibilityState === "visible") {
        queueRender();
      }
    });
    resizeObserver.observe(document.documentElement);
  };

  const renderAnnotations = async () => {
    const generation = ++renderGeneration;

    if (!currentConfig.enabled) {
      clearAnnotations();
      setDebugState("Panel", "disabled");
      markRuntimeStatus("disabled", "Runtime disabled from extension settings.");
      await publishPageState(buildPageState({
        slug: currentSlug ?? undefined,
        surfaceFound: false,
        surfaceActive: false,
        fallbackMode: false,
        rowsDetected: 0,
        rowsAnnotated: 0,
        visibleAddressCount: 0,
        errorCode: "disabled",
        language: document.documentElement.lang || navigator.language,
        matched: []
      }));
      return;
    }

    const panel = detectHolderSurface();
    syncSurfaceObserver(panel?.root ?? null);

    if (!panel) {
      clearAnnotations();
      setDebugState("Panel", "missing");
      setDebugState("PanelKind", "none");
      markRuntimeStatus("degraded", "Holder surface not found.");
      await publishPageState(buildPageState({
        slug: currentSlug ?? undefined,
        surfaceFound: false,
        surfaceActive: false,
        fallbackMode: false,
        rowsDetected: 0,
        rowsAnnotated: 0,
        visibleAddressCount: 0,
        sourceStatus: currentPayload?.sourceStatus,
        labelsVersion: currentPayload?.labelsVersion,
        resolvedBy: currentPayload?.resolvedBy,
        errorCode: "panel_missing",
        language: document.documentElement.lang || navigator.language,
        matched: []
      }));
      await reportHealth("panel_missing", {
        slug: currentSlug ?? undefined,
        surfaceKind: undefined,
        surfaceFound: false,
        rowsDetected: 0,
        rowsAnnotated: 0,
        sourceStatus: currentPayload?.sourceStatus,
        runtimeStatus: currentRuntimeStatus
      });
      return;
    }

    if (!panel.active) {
      clearAnnotations();
      setDebugState("Panel", "inactive");
      setDebugState("PanelKind", panel.surfaceKind);
      markRuntimeStatus("degraded", "Holder surface is inactive.");
      await publishPageState(buildPageState({
        slug: currentSlug ?? undefined,
        surfaceKind: panel.surfaceKind,
        surfaceFound: true,
        surfaceActive: false,
        fallbackMode: false,
        rowsDetected: panel.rows.length,
        rowsAnnotated: 0,
        visibleAddressCount: 0,
        sourceStatus: currentPayload?.sourceStatus,
        labelsVersion: currentPayload?.labelsVersion,
        resolvedBy: currentPayload?.resolvedBy,
        errorCode: "panel_inactive",
        language: document.documentElement.lang || navigator.language,
        matched: []
      }));
      await reportHealth("panel_inactive", {
        slug: currentSlug ?? undefined,
        surfaceKind: panel.surfaceKind,
        surfaceFound: true,
        rowsDetected: panel.rows.length,
        rowsAnnotated: 0,
        sourceStatus: currentPayload?.sourceStatus,
        runtimeStatus: currentRuntimeStatus
      });
      return;
    }

    const payload = currentPayload;
    if (!payload) {
      clearAnnotations();
      return;
    }

    const resolved = await resolvePanelAnnotations(panel, payload, generation);
    if (!resolved || generation !== renderGeneration) {
      return;
    }

    const fallbackMode = reconcileInlineAnnotations(panel, payload, resolved.annotations, resolved.visibleAddressCount);
    const nextRuntimeStatus =
      payload.sourceStatus === "stale" || payload.sourceStatus === "error" || fallbackMode ? "degraded" : "ready";
    markRuntimeStatus(
      nextRuntimeStatus,
      fallbackMode
        ? "Rendered fallback holder list."
        : payload.sourceStatus === "stale"
          ? "Rendered stale holder annotations."
          : resolved.annotations.length > 0
            ? "Inline holder annotations active."
            : "No visible holder matches."
    );
    const state: PageRuntimeState = buildPageState({
      slug: payload.market.slug,
      surfaceKind: panel.surfaceKind,
      surfaceFound: true,
      surfaceActive: true,
      fallbackMode,
      rowsDetected: panel.rows.length,
      rowsAnnotated: resolved.annotations.length,
      visibleAddressCount: resolved.visibleAddressCount,
      sourceStatus: payload.sourceStatus,
      labelsVersion: payload.labelsVersion,
      resolvedBy: payload.resolvedBy,
      errorCode: resolved.annotations.length > 0 ? undefined : payload.matchedSummaryCount ? "fallback_list" : undefined,
      language: document.documentElement.lang || navigator.language,
      matched: resolved.annotations.slice(0, 12).map((annotation) => ({
        address: annotation.normalizedAddress,
        aliasText: annotation.aliasText,
        detailUrl: annotation.detailUrl,
        source: annotation.source
      }))
    });

    setDebugState("Panel", "active");
    setDebugState("PanelKind", panel.surfaceKind);
    setDebugState("SummaryHits", String(payload.matchedSummaryCount ?? 0));
    await publishPageState(state);
    await reportHealth(undefined, {
      slug: payload.market.slug,
      surfaceKind: panel.surfaceKind,
      surfaceFound: true,
      rowsDetected: panel.rows.length,
      rowsAnnotated: resolved.annotations.length,
      sourceStatus: payload.sourceStatus,
      runtimeStatus: state.runtimeStatus
    }, resolved.annotations.map((annotation) => annotation.normalizedAddress));

    lastRenderAt = Date.now();
    forceLookupRefresh = false;
  };

  const shouldForceRefresh = () => Date.now() - lastRenderAt > REFRESH_TTL_MS;

  const startRefreshLoop = () => {
    if (refreshTimer) {
      window.clearInterval(refreshTimer);
    }
    if (!currentSlug || !currentConfig.enabled) {
      return;
    }
    refreshTimer = window.setInterval(() => {
      void refreshAnnotations({ lifecycle: "wake" });
    }, currentConfig.refreshIntervalMs);
  };

  const refreshAnnotations = async (options?: {
    lifecycle?: "bootstrap" | "wake" | "manual";
    forceVisibleLookup?: boolean;
    forceRevalidate?: boolean;
  }) => {
    invalidatePendingRender();
    const refreshId = ++refreshGeneration;
    currentConfig = await getConfig();
    setDebugState("Boot", "1");
    const lifecycle = options?.lifecycle ?? (currentPayload ? "wake" : "bootstrap");
    markRuntimeStatus(
      lifecycle === "bootstrap" ? "bootstrap" : "wake",
      lifecycle === "bootstrap" ? "Bootstrapping page runtime." : "Refreshing page runtime."
    );

    if (!currentConfig.enabled || !isHostEnabled(currentConfig)) {
      clearAnnotations();
      markRuntimeStatus("disabled", "Runtime disabled or host not enabled.");
      return;
    }

    const slug = resolveCurrentMarketSlug();
    currentSlug = slug;
    setDebugState("Slug", slug ?? "missing");

    if (!slug) {
      clearAnnotations();
      markRuntimeStatus("degraded", "Market slug missing.");
      await publishPageState(buildPageState({
        surfaceFound: false,
        surfaceActive: false,
        fallbackMode: false,
        rowsDetected: 0,
        rowsAnnotated: 0,
        visibleAddressCount: 0,
        errorCode: "slug_missing",
        language: document.documentElement.lang || navigator.language,
        matched: []
      }));
      await reportHealth("slug_missing", {
        slug: undefined,
        surfaceKind: undefined,
        surfaceFound: false,
        rowsDetected: 0,
        rowsAnnotated: 0,
        sourceStatus: undefined,
        runtimeStatus: currentRuntimeStatus
      });
      return;
    }

    await publishPageState(
      buildPageState({
        slug,
        surfaceFound: false,
        surfaceActive: false,
        fallbackMode: false,
        rowsDetected: 0,
        rowsAnnotated: 0,
        visibleAddressCount: 0,
        sourceStatus: currentPayload?.sourceStatus,
        labelsVersion: currentPayload?.labelsVersion,
        resolvedBy: currentPayload?.resolvedBy,
        language: document.documentElement.lang || navigator.language,
        matched: []
      })
    );

    try {
      currentPayload = await requestAnnotations(slug, options?.forceRevalidate);
      if (refreshId !== refreshGeneration) {
        return;
      }
      setDebugState("Payload", String(currentPayload.holders.length));
      queueRender(options);
    } catch (error) {
      if (refreshId !== refreshGeneration) {
        return;
      }
      currentPayload = {
        market: {
          slug,
          conditionId: "",
          title: slug,
          outcomes: []
        },
        holders: [],
        labelsVersion: "unavailable",
        refreshedAt: new Date().toISOString(),
        sourceStatus: "error",
        matchedSummaryCount: 0,
        resolvedBy: "error"
      };
      logDebug("failed to fetch market annotations", error);
      markRuntimeStatus("degraded", "Failed to refresh holder annotations.");
      await reportHealth("refresh_failed", {
        slug,
        surfaceKind: undefined,
        surfaceFound: false,
        rowsDetected: 0,
        rowsAnnotated: 0,
        sourceStatus: "error",
        runtimeStatus: currentRuntimeStatus
      });
      queueRender(options);
    } finally {
      if (refreshId === refreshGeneration) {
        startRefreshLoop();
      }
    }
  };

  const handleLifecycleRefresh = (event?: PageTransitionEvent | { persisted?: boolean }) => {
    if (document.visibilityState !== "visible" && !(event?.persisted ?? false)) {
      return;
    }
    const nextSlug = resolveCurrentMarketSlug();
    if (nextSlug && nextSlug !== currentSlug) {
      clearAnnotations();
      void refreshAnnotations({ lifecycle: "bootstrap" });
      return;
    }
    if (!currentPayload && nextSlug) {
      void refreshAnnotations({ lifecycle: "bootstrap" });
      return;
    }
    if (shouldForceRefresh()) {
      void refreshAnnotations({ lifecycle: "wake" });
      return;
    }
    queueRender();
  };

  const handleStorageChange = (changes: Record<string, { newValue?: unknown }>) => {
    const configChanged = Boolean(changes[CONFIG_KEY]);
    const authChanged = Boolean(changes[AUTH_SESSION_KEY]);

    if (!configChanged && !authChanged) {
      return;
    }

    void getConfig().then((config) => {
      currentConfig = config;
      if (!config.enabled) {
        clearAnnotations();
        markRuntimeStatus("disabled", "Runtime disabled from extension settings.");
        return;
      }

      forceLookupRefresh = true;
      void refreshAnnotations({
        lifecycle: authChanged ? "bootstrap" : "wake",
        forceVisibleLookup: authChanged || configChanged,
        forceRevalidate: authChanged || configChanged
      });
    });
  };

  const installLocationObserver = () => {
    const dispatch = () => window.dispatchEvent(new Event("wsm-locationchange"));

    const wrap = (method: "pushState" | "replaceState") => {
      const original = history[method];
      history[method] = function patched(
        this: History,
        ...args: [data: unknown, unused: string, url?: string | URL | null | undefined]
      ) {
        const result = original.apply(this, args);
        dispatch();
        return result;
      };
    };

    wrap("pushState");
    wrap("replaceState");
    window.addEventListener("popstate", dispatch);
    window.addEventListener("hashchange", dispatch);
    window.addEventListener("pageshow", handleLifecycleRefresh);
    document.addEventListener("visibilitychange", () => handleLifecycleRefresh());
    window.addEventListener("focus", () => handleLifecycleRefresh());
    document.addEventListener(
      "scroll",
      () => {
        if (currentConfig.enabled && document.visibilityState === "visible" && currentPayload) {
          queueRender();
        }
      },
      {
        capture: true,
        passive: true
      }
    );
  };

  void (async () => {
    currentConfig = await getConfig();
    setDebugState("Boot", "starting");
    if (!isHostEnabled(currentConfig)) {
      return;
    }

    chrome.storage.onChanged.addListener(handleStorageChange);
    chrome.runtime.onMessage.addListener(
      (message: ContentRuntimeMessage, _sender: unknown, sendResponse: (value: unknown) => void) => {
        if (message?.type === "wsm:ping") {
          sendResponse({ ok: true });
          return false;
        }

        if (message?.type !== "wsm:refreshAnnotations") {
          return false;
        }
        void refreshAnnotations({
          lifecycle: message.lifecycle ?? "wake",
          forceVisibleLookup: message.forceVisibleLookup ?? true,
          forceRevalidate: message.forceRevalidate ?? true
        })
          .then(() => sendResponse({ ok: true }))
          .catch((error) =>
            sendResponse({
              ok: false,
              error: error instanceof Error ? error.message : "Failed to refresh annotations."
            })
          );
        return true;
      }
    );

    installLocationObserver();
    ensureDiscoveryObserver();
    ensureResizeObserver();
    window.addEventListener("wsm-locationchange", () => {
      invalidatePendingRender();
      clearAnnotations();
      void refreshAnnotations({ lifecycle: "bootstrap" });
    });

    await refreshAnnotations({ lifecycle: "bootstrap" });
  })();
})();
