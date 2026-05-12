interface ExtensionConfig {
  enabled: boolean;
  debugMode: boolean;
  backendBaseUrl: string;
  readOnlyToken: string;
  enabledMarkets: string[];
  refreshIntervalMs: number;
}

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

interface AddressSummary {
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

interface ContentMarketAnnotationResponse {
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
  mountKey: string;
  normalizedAddress: string;
  surfaceKind: HolderSurfaceKind;
  source: InlineAnnotationSource;
  aliasText: string;
  primaryBadge?: AddressSummary["badges"][number];
  secondaryBadges: AddressSummary["badges"];
  statusBadges: NonNullable<AddressSummary["statusBadges"]>;
  hoverCard?: AddressHoverCard;
  summaryText?: string;
  noteSnippet?: string;
  activityLevel?: string;
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
  sourceStatus?: ContentMarketAnnotationResponse["sourceStatus"];
  labelsVersion?: string;
  resolvedBy?: ContentMarketAnnotationResponse["resolvedBy"];
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
  sourceStatus?: ContentMarketAnnotationResponse["sourceStatus"];
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
  const RENDER_DEBOUNCE_MS = 80;
  const ROUTE_REFRESH_DEBOUNCE_MS = 140;
  const TRANSIENT_CLEAR_GRACE_MS = 900;
  const CONTENT_INSTANCE_ID = `wsm-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
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
  const FEED_POSITIONS_TITLES = ["Positions", "持仓"];
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
  const FEED_POSITIONS_LABELS = ["Positions", "持仓"];
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
  let currentPayload: ContentMarketAnnotationResponse | null = null;
  let refreshTimer: number | null = null;
  let renderTimer: number | null = null;
  let routeRefreshTimer: number | null = null;
  let transientClearTimer: number | null = null;
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
      trigger?: HTMLButtonElement;
      annotation: ResolvedInlineAnnotation;
      row: HTMLElement;
      mountTarget: HTMLElement;
      mainContainer?: HTMLElement | null;
    }
  >();
  const fallbackHoverAnnotations = new Map<string, ResolvedInlineAnnotation>();
  let hoverOverlayManager: HoverOverlayManager | null = null;
  let drawerOverlayManager: DrawerOverlayManager | null = null;
  let interactionAbortController: AbortController | null = null;
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

  const normalizeBadgeText = (value: string | null | undefined) => compactText(value).toLowerCase();

  const normalizeActivityText = (value: string | null | undefined) => compactText(value).toLowerCase();

  const isActivityLevelText = (value: string | null | undefined) => {
    const normalized = normalizeActivityText(value);
    return normalized === "正常" || normalized === "低活跃" || normalized === "活跃";
  };

  const isSystemOnlyBadge = (badge: AddressLabelBadge) => {
    const text = compactText(badge.text);
    const normalized = normalizeBadgeText(text);
    return (
      compactText(badge.kind).toLowerCase() === "activity_level" ||
      badge.tone === "ai-review" ||
      normalized === "待复核" ||
      normalized === "ai 待确认" ||
      normalized === "ai待确认" ||
      isActivityLevelText(text)
    );
  };

  const getActivityLevelFromSummary = (summary: AddressSummary) =>
    summary.activityLevel ||
    [...(summary.hoverBadges ?? []), ...(summary.badges ?? [])].find((badge) => {
      const kind = compactText(badge.kind).toLowerCase();
      return kind === "activity_level" || isActivityLevelText(badge.text);
    })?.text;

  const getAliasActivityTone = (activityLevel?: string) => {
    const normalized = normalizeActivityText(activityLevel);
    if (normalized === "正常" || normalized === "活跃") {
      return "active";
    }
    if (normalized === "低活跃") {
      return "quiet";
    }
    return undefined;
  };

  const INLINE_BADGE_KIND_PRIORITY: Record<string, number> = {
    payout_region: 900,
    winrate_region: 820,
    frequency_region: 740,
    geo_specialty: 660,
    trader_archetype: 580,
    new_wallet_signal: 420,
    early_entry_signal: 340,
    activity_level: 80
  };

  const INLINE_BADGE_TONE_PRIORITY: Record<string, number> = {
    accent: 2400,
    watch: 120,
    alert: 80,
    danger: 60,
    "ai-review": 20,
    neutral: 0
  };

  let elementIdentitySeed = 0;
  const elementIdentityMap = new WeakMap<HTMLElement, number>();

  const getElementIdentity = (element: HTMLElement | null | undefined) => {
    if (!element) {
      return "0";
    }

    const current = elementIdentityMap.get(element);
    if (current) {
      return String(current);
    }

    elementIdentitySeed += 1;
    elementIdentityMap.set(element, elementIdentitySeed);
    return String(elementIdentitySeed);
  };

  const toDisplayBadge = <T extends AddressLabelBadge>(badge: T): T => {
    const text = compactText(badge.text);
    const kind = compactText(badge.kind).toLowerCase();
    const normalizedText = normalizeBadgeText(text);
    if (kind === "activity_level" || normalizedText === "正常" || normalizedText === "低活跃") {
      const tone = normalizedText === "正常" ? "watch" : "neutral";
      if (badge.tone === tone) {
        return badge;
      }
      return { ...badge, tone } as T;
    }
    return badge;
  };

  const inferBadgeDedupeKind = (badge: AddressLabelBadge) => {
    const text = compactText(badge.text).replace(/高爆击/gu, "高暴击");
    const normalized = normalizeBadgeText(text);
    if (normalized === "正常" || normalized === "低活跃") {
      return "activity_level";
    }
    if (normalized === "提前埋伏") {
      return "early_entry_signal";
    }
    if (normalized === "新钱包" || normalized === "隐藏高手新钱包") {
      return "new_wallet_signal";
    }
    if (/^高频/u.test(text)) {
      return "frequency_region";
    }
    if (/^高暴击/u.test(text)) {
      return "payout_region";
    }
    if (/^高胜率/u.test(text)) {
      return "winrate_region";
    }
    if (/彩票型|拆分型|流动型/u.test(text)) {
      return "trader_archetype";
    }
    return compactText(badge.kind).toLowerCase() || "unknown";
  };

  const makeBadgeKey = (badge: AddressLabelBadge) => {
    const kind = inferBadgeDedupeKind(badge);
    return `${kind}:${normalizeBadgeText(badge.text).replace(/高爆击/gu, "高暴击")}`;
  };

  const getInlineBadgePriority = (badge: AddressLabelBadge) => {
    const kind = compactText(badge.kind).toLowerCase();
    return (
      (badge.priority ?? 0) +
      (INLINE_BADGE_KIND_PRIORITY[kind] ?? 0) +
      (INLINE_BADGE_TONE_PRIORITY[badge.tone] ?? 0) +
      (badge.isPrimary ? 180 : 0) +
      (kind === "activity_level" ? -900 : 0)
    );
  };

  const compareInlineBadges = (left: AddressLabelBadge, right: AddressLabelBadge) =>
    getInlineBadgePriority(right) - getInlineBadgePriority(left) ||
    left.text.localeCompare(right.text, "zh-CN");

  const dedupeBadges = <T extends AddressLabelBadge>(badges: T[]) => {
    const seen = new Set<string>();
    const unique: T[] = [];
    badges.forEach((badge) => {
      const normalized = normalizeBadgeText(badge.text);
      if (!normalized || isSystemOnlyBadge(badge)) {
        return;
      }
      const key = makeBadgeKey(badge);
      if (seen.has(key)) {
        return;
      }
      seen.add(key);
      unique.push(toDisplayBadge(badge));
    });
    return unique;
  };

  const isAliasDuplicateBadge = (badge: AddressLabelBadge, aliasText: string, holderDisplayName: string) => {
    const normalizedBadge = normalizeBadgeText(badge.text);
    if (!normalizedBadge) {
      return true;
    }
    return (
      normalizedBadge === normalizeBadgeText(aliasText) ||
      normalizedBadge === normalizeBadgeText(holderDisplayName)
    );
  };

  const getStableKeyPart = (value: string | null | undefined) =>
    compactText(value).toLowerCase().slice(0, 96);

  const getRowMountKey = (row: HolderRowSnapshot) =>
    [
      row.surfaceKind,
      row.side,
      row.normalizedAddress ?? "",
      getStableKeyPart(row.profileHref ?? row.rawAddress),
      getStableKeyPart(row.amountText),
      getStableKeyPart(row.displayNameText),
      row.normalizedAddress
        ? ""
        : [
            getElementIdentity(row.mount.row),
            getElementIdentity(row.mount.mountTarget),
            getElementIdentity(row.mount.nameLine ?? null)
          ].join(".")
    ].join(":");

  const getAnnotationRenderSignature = (annotation: ResolvedInlineAnnotation) =>
    [
      annotation.aliasText,
      annotation.activityLevel ?? "",
      annotation.noteSnippet ?? "",
      annotation.summaryText ?? "",
      annotation.detailUrl,
      annotation.hoverCard?.officialNoteText ?? "",
      annotation.hoverCard?.aiBriefShortText ?? "",
      annotation.hoverCard?.aiStatsNoteText ?? "",
      annotation.hoverCard?.aiNarrativeNoteText ?? "",
      annotation.hoverCard?.aiDeepNoteText ?? "",
      annotation.primaryBadge ? makeBadgeKey(annotation.primaryBadge) : "",
      ...annotation.secondaryBadges.map((badge) => makeBadgeKey(badge)),
      ...annotation.statusBadges.map((badge) => makeBadgeKey(badge)),
      ...(annotation.hoverCard?.officialTags ?? []).map((badge) => makeBadgeKey(badge)),
      ...(annotation.hoverCard?.aiTags ?? []).map((badge) => makeBadgeKey(badge))
    ].join("|");

  const dedupeHolderRowsByMount = (rows: HolderRowSnapshot[]) => {
    const bestByKey = new Map<string, HolderRowSnapshot>();

    rows.forEach((row) => {
      const mountKey = getRowMountKey(row);
      const current = bestByKey.get(mountKey);
      if (!current || row.confidence > current.confidence) {
        bestByKey.set(mountKey, row);
      }
    });

    return [...bestByKey.values()].sort((left, right) => right.confidence - left.confidence);
  };

  const getTextWithoutInjectedAnnotations = (element: HTMLElement) => {
    const clone = element.cloneNode(true);
    if (!(clone instanceof HTMLElement)) {
      return compactText(element.textContent);
    }

    clone
      .querySelectorAll(`.${ROOT_CLASS}, [data-wsmx-hover-trigger='1']`)
      .forEach((node) => node.remove());
    return compactText(clone.textContent);
  };

  const truncateText = (value: string | null | undefined, maxLength: number) => {
    const text = compactText(value);
    if (!text) {
      return "";
    }
    return text.length <= maxLength ? text : `${text.slice(0, maxLength - 1)}...`;
  };

  class HoverOverlayManager {
    private readonly closeDelayMs = 300;
    private activeKey: string | null = null;
    private activeTrigger: HTMLElement | null = null;
    private host: HTMLDivElement | null = null;
    private shadowRoot: ShadowRoot | null = null;
    private cardElement: HTMLDivElement | null = null;
    private closeTimer: number | null = null;
    private rafId: number | null = null;

    constructor(
      private readonly getAnnotation: (key: string) => ResolvedInlineAnnotation | undefined
    ) {}

    private ensureHost() {
      if (this.host && this.shadowRoot) {
        return;
      }

      this.host = document.createElement("div");
      this.host.className = "wsmx-overlay-host";
      this.host.style.position = "fixed";
      this.host.style.left = "0";
      this.host.style.top = "0";
      this.host.style.width = "0";
      this.host.style.height = "0";
      this.host.style.zIndex = "2147483647";

      const shadow = this.host.attachShadow({ mode: "open" });
      const style = document.createElement("style");
      style.textContent = `
.wsmx-layer{position:fixed;inset:0;pointer-events:none;z-index:2147483647}
.wsmx-card{position:absolute;width:min(376px,calc(100vw - 16px));max-height:min(460px,calc(100vh - 16px));padding:10px 11px;border-radius:10px;border:1px solid rgba(147,163,184,.24);background:linear-gradient(180deg,rgba(12,18,27,.98),rgba(7,11,18,.98));box-shadow:0 18px 36px rgba(0,0,0,.42),0 0 0 1px rgba(15,23,42,.22);color:#e8f0fb;pointer-events:auto;font-family:Inter,"PingFang SC","Microsoft YaHei",system-ui,sans-serif;line-height:1.42;display:flex;flex-direction:column;overflow:hidden;transform:translateY(0);animation:wsmxFadeIn .14s ease}
.wsmx-header{display:grid;gap:2px;margin-bottom:8px;flex:0 0 auto}
.wsmx-title{font-size:12px;font-weight:700;color:#f8fbff}
.wsmx-subtitle{font-size:10px;color:rgba(209,220,234,.7)}
.wsmx-summary{font-size:11px;color:rgba(231,239,247,.88);margin-bottom:9px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.wsmx-body{display:grid;gap:8px;flex:1 1 auto;min-height:0;overflow:auto;padding-right:2px}
.wsmx-footer{display:flex;justify-content:space-between;gap:8px;align-items:center;margin-top:8px;padding-top:8px;border-top:1px solid rgba(148,163,184,.15);flex:0 0 auto}
.wsmx-section{display:grid;gap:6px;padding-top:7px;margin-top:7px;border-top:1px solid rgba(148,163,184,.15)}
.wsmx-section:first-of-type{border-top:none;padding-top:0;margin-top:0}
.wsmx-section-title{font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:rgba(204,216,230,.7)}
.wsmx-tag-list{display:flex;flex-wrap:wrap;gap:6px}
.wsmx-tag{display:inline-flex;align-items:center;gap:6px;padding:3px 8px;border-radius:999px;font-size:10px;border:1px solid transparent;max-width:236px}
.wsmx-tag--accent{color:#bed1ff;background:rgba(112,159,255,.15);border-color:rgba(112,159,255,.28)}
.wsmx-tag--neutral,.wsmx-tag--ai-review{color:rgba(231,239,247,.9);background:rgba(231,239,247,.08);border-color:rgba(231,239,247,.13)}
.wsmx-tag--watch{color:#f3d781;background:rgba(243,215,129,.14);border-color:rgba(243,215,129,.2)}
.wsmx-tag--alert,.wsmx-tag--danger{color:#ffcab9;background:rgba(243,125,107,.13);border-color:rgba(243,125,107,.24)}
.wsmx-note{font-size:11px;color:rgba(215,227,239,.78);word-break:break-word}
.wsmx-note--hint{color:#c7d8ff}
.wsmx-action{appearance:none;border:1px solid rgba(130,245,206,.28);border-radius:999px;background:rgba(130,245,206,.1);color:#bfffe9;font-size:10px;font-weight:700;padding:5px 9px;white-space:nowrap;cursor:pointer;transition:background-color .12s ease,border-color .12s ease,transform .12s ease}
.wsmx-action:hover,.wsmx-action:focus-visible{background:rgba(130,245,206,.16);border-color:rgba(130,245,206,.42);outline:none;transform:translateY(-1px)}
@keyframes wsmxFadeIn{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:translateY(0)}}
      `;
      shadow.append(style);

      const layer = document.createElement("div");
      layer.className = "wsmx-layer";
      shadow.append(layer);

      document.body.append(this.host);
      this.shadowRoot = shadow;
    }

    private getLayer() {
      if (!this.shadowRoot) {
        return null;
      }
      return this.shadowRoot.querySelector<HTMLDivElement>(".wsmx-layer");
    }

    private clearCloseTimer() {
      if (this.closeTimer) {
        window.clearTimeout(this.closeTimer);
        this.closeTimer = null;
      }
    }

    private cancelRaf() {
      if (this.rafId) {
        window.cancelAnimationFrame(this.rafId);
        this.rafId = null;
      }
    }

    private toneClass(tone?: string) {
      switch (tone) {
        case "accent":
        case "watch":
        case "alert":
        case "danger":
        case "ai-review":
          return tone;
        default:
          return "neutral";
      }
    }

    private createTagNode(badge: AddressLabelBadge) {
      const tag = document.createElement("span");
      tag.className = `wsmx-tag wsmx-tag--${this.toneClass(badge.tone)}`;
      tag.textContent = truncateText(badge.text, 28);
      return tag;
    }

    private appendTagsSection(
      container: HTMLElement,
      titleText: string,
      tags: AddressLabelBadge[],
      fallbackTagText: string
    ) {
      const section = document.createElement("section");
      section.className = "wsmx-section";

      const title = document.createElement("div");
      title.className = "wsmx-section-title";
      title.textContent = titleText;
      section.append(title);

      const tagList = document.createElement("div");
      tagList.className = "wsmx-tag-list";
      if (tags.length > 0) {
        tags.forEach((badge) => tagList.append(this.createTagNode(badge)));
      } else {
        const emptyTag = document.createElement("span");
        emptyTag.className = "wsmx-tag wsmx-tag--neutral";
        emptyTag.textContent = fallbackTagText;
        tagList.append(emptyTag);
      }
      section.append(tagList);

      container.append(section);
    }

    private appendNoteSection(
      container: HTMLElement,
      titleText: string,
      noteText: string,
      fallbackNoteText: string,
      maxLength = 160
    ) {
      const section = document.createElement("section");
      section.className = "wsmx-section";

      const title = document.createElement("div");
      title.className = "wsmx-section-title";
      title.textContent = titleText;
      section.append(title);

      const note = document.createElement("div");
      note.className = "wsmx-note";
      note.textContent = truncateText(noteText || fallbackNoteText, maxLength);
      section.append(note);

      container.append(section);
    }

    private buildCard(annotation: ResolvedInlineAnnotation) {
      const card = document.createElement("div");
      card.className = "wsmx-card";
      card.setAttribute("role", "dialog");
      card.setAttribute("aria-label", `${annotation.aliasText} 标签详情`);
      card.dataset.wsmxHoverCard = "1";

      const header = document.createElement("div");
      header.className = "wsmx-header";
      const title = document.createElement("div");
      title.className = "wsmx-title";
      title.textContent = annotation.aliasText;
      header.append(title);
      if (annotation.displayName && annotation.displayName !== annotation.aliasText) {
        const subtitle = document.createElement("div");
        subtitle.className = "wsmx-subtitle";
        subtitle.textContent = truncateText(annotation.displayName, 32);
        header.append(subtitle);
      }
      card.append(header);

      if (annotation.summaryText) {
        const summary = document.createElement("div");
        summary.className = "wsmx-summary";
        summary.textContent = truncateText(annotation.summaryText, 110);
        card.append(summary);
      }

      const body = document.createElement("div");
      body.className = "wsmx-body";

      const officialFallback = annotation.secondaryBadges.filter(
        (badge) => badge.tone === "accent" || badge.kind === "official"
      );
      const officialTags = dedupeBadges(
        annotation.hoverCard?.officialTags?.length ? annotation.hoverCard.officialTags : officialFallback
      );
      const officialKeys = new Set(officialTags.map((badge) => makeBadgeKey(badge)));
      const aiSource = annotation.hoverCard?.aiTags?.length
        ? annotation.hoverCard.aiTags
        : annotation.secondaryBadges.filter((badge) => badge.tone !== "watch" && badge.tone !== "danger");
      const aiTags = dedupeBadges(aiSource)
        .filter((badge) => !officialKeys.has(makeBadgeKey(badge)))
        .slice(0, 4);
      const officialNoteText = annotation.hoverCard?.officialNoteText ?? "";
      const aiBriefShortText = annotation.hoverCard?.aiBriefShortText ?? "";
      const aiNarrativeNoteText = annotation.hoverCard?.aiNarrativeNoteText ?? "";
      const aiStatsNoteText = annotation.hoverCard?.aiStatsNoteText ?? "";
      const aiDeepNoteText = annotation.hoverCard?.aiDeepNoteText ?? "";

      if (officialTags.length > 0) {
        this.appendTagsSection(body, "官方标签", officialTags.slice(0, 4), "暂无官方标签");
      }
      if (officialNoteText) {
        this.appendNoteSection(body, "官方标签备注说明", officialNoteText, "暂无官方标签备注说明", 120);
      }
      if (aiTags.length > 0) {
        this.appendTagsSection(body, "AI 标签", aiTags, "暂无 AI 标签");
      }
      if (aiBriefShortText) {
        this.appendNoteSection(body, "AI 结论", aiBriefShortText, "暂无结论", 96);
      }
      if (aiNarrativeNoteText || aiStatsNoteText) {
        this.appendNoteSection(
          body,
          "摘要说明",
          truncateText(aiNarrativeNoteText || aiStatsNoteText, 240),
          "暂无摘要说明",
          220
        );
      }
      if (aiDeepNoteText) {
        this.appendNoteSection(body, "深度解读", "已同步，可展开阅读完整内容。", "暂无深度解读", 88);
      }
      card.append(body);

      const deepHint = document.createElement("span");
      deepHint.className = "wsmx-note wsmx-note--hint";
      deepHint.textContent = aiDeepNoteText ? "有深度解读" : "快速判断";
      const footer = document.createElement("div");
      footer.className = "wsmx-footer";
      footer.append(deepHint);
      const detailButton = document.createElement("button");
      detailButton.type = "button";
      detailButton.className = "wsmx-action";
      detailButton.textContent = "展开阅读";
      detailButton.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        openAnnotationReader(annotation, event.currentTarget instanceof HTMLElement ? event.currentTarget : null);
      });
      footer.append(detailButton);
      card.append(footer);

      return card;
    }

    private resolvePosition(triggerRect: DOMRect, cardRect: DOMRect) {
      const gap = 10;
      let left = triggerRect.right + gap;
      let top = triggerRect.bottom + gap;

      if (left + cardRect.width > window.innerWidth - 8) {
        left = triggerRect.left - cardRect.width - gap;
      }
      if (top + cardRect.height > window.innerHeight - 8) {
        top = triggerRect.top - cardRect.height - gap;
      }

      left = Math.max(8, Math.min(left, window.innerWidth - cardRect.width - 8));
      top = Math.max(8, Math.min(top, window.innerHeight - cardRect.height - 8));
      return { left, top };
    }

    private renderAtTrigger(trigger: HTMLElement) {
      if (!this.cardElement) {
        return;
      }
      const triggerRect = trigger.getBoundingClientRect();
      const cardRect = this.cardElement.getBoundingClientRect();
      const position = this.resolvePosition(triggerRect, cardRect);
      this.cardElement.style.left = `${Math.round(position.left)}px`;
      this.cardElement.style.top = `${Math.round(position.top)}px`;
    }

    private queueReposition() {
      if (!this.activeTrigger || !this.cardElement) {
        return;
      }
      if (this.rafId) {
        return;
      }
      this.rafId = window.requestAnimationFrame(() => {
        this.rafId = null;
        if (this.activeTrigger && this.cardElement) {
          this.renderAtTrigger(this.activeTrigger);
        }
      });
    }

    private setTriggerExpanded(trigger: HTMLElement | null, expanded: boolean) {
      if (!trigger || !(trigger instanceof HTMLButtonElement)) {
        return;
      }
      trigger.setAttribute("aria-expanded", expanded ? "true" : "false");
    }

    private resetTriggerAria() {
      this.setTriggerExpanded(this.activeTrigger, false);
    }

    isInsideInteractiveRegion(target: EventTarget | null) {
      if (!(target instanceof Node)) {
        return false;
      }
      if (this.activeTrigger?.contains(target)) {
        return true;
      }
      if (this.host && (target === this.host || this.host.contains(target))) {
        return true;
      }
      return this.cardElement?.contains(target) ?? false;
    }

    open(key: string, trigger: HTMLElement) {
      const annotation = this.getAnnotation(key);
      if (!annotation) {
        return;
      }
      if (!trigger.isConnected) {
        this.close();
        return;
      }

      this.clearCloseTimer();
      if (this.activeKey === key && this.activeTrigger === trigger && this.cardElement) {
        this.renderAtTrigger(trigger);
        this.queueReposition();
        return;
      }
      if (this.activeKey !== key) {
        this.resetTriggerAria();
      }

      this.ensureHost();
      const layer = this.getLayer();
      if (!layer) {
        return;
      }

      this.activeKey = key;
      this.activeTrigger = trigger;
      this.setTriggerExpanded(trigger, true);

      layer.textContent = "";
      const card = this.buildCard(annotation);
      card.addEventListener("pointerenter", () => this.clearCloseTimer());
      card.addEventListener("pointerleave", (event) => {
        if (this.isInsideInteractiveRegion((event as PointerEvent).relatedTarget)) {
          return;
        }
        this.scheduleClose();
      });
      card.addEventListener("focusin", () => this.clearCloseTimer());
      card.addEventListener("focusout", (event) => {
        if (this.isInsideInteractiveRegion((event as FocusEvent).relatedTarget)) {
          return;
        }
        this.scheduleClose();
      });
      layer.append(card);
      this.cardElement = card;
      this.renderAtTrigger(trigger);
      this.queueReposition();
    }

    scheduleClose() {
      this.clearCloseTimer();
      this.closeTimer = window.setTimeout(() => {
        this.close();
      }, this.closeDelayMs);
    }

    close() {
      this.clearCloseTimer();
      this.cancelRaf();
      this.resetTriggerAria();
      this.activeKey = null;
      this.activeTrigger = null;
      this.cardElement = null;
      const layer = this.getLayer();
      if (layer) {
        layer.textContent = "";
      }
    }

    onViewportChange = () => {
      if (this.activeTrigger && !this.activeTrigger.isConnected) {
        this.close();
        return;
      }
      this.queueReposition();
    };

    getActiveTrigger() {
      return this.activeTrigger;
    }

    getActiveKey() {
      return this.activeKey;
    }

    destroy() {
      this.close();
      this.cancelRaf();
      if (this.host) {
        this.host.remove();
      }
      this.host = null;
      this.shadowRoot = null;
    }
  }

  class DrawerOverlayManager {
    private host: HTMLDivElement | null = null;
    private shadowRoot: ShadowRoot | null = null;
    private returnFocus: HTMLElement | null = null;

    private ensureHost() {
      if (this.host && this.shadowRoot) {
        return;
      }

      this.host = document.createElement("div");
      this.host.className = "wsmx-drawer-host";
      this.host.style.position = "fixed";
      this.host.style.inset = "0";
      this.host.style.zIndex = "2147483647";
      this.host.style.pointerEvents = "none";

      const shadow = this.host.attachShadow({ mode: "open" });
      const style = document.createElement("style");
      style.textContent = `
.wsmx-reader-layer{position:fixed;inset:0;pointer-events:none;font-family:Inter,"PingFang SC","Microsoft YaHei",system-ui,sans-serif;z-index:2147483647}
.wsmx-reader-backdrop{position:absolute;inset:0;background:rgba(3,7,18,.32);pointer-events:auto;animation:wsmxReaderFade .12s ease}
.wsmx-reader{position:absolute;top:12px;right:12px;bottom:12px;width:min(430px,calc(100vw - 24px));display:flex;flex-direction:column;border:1px solid rgba(148,163,184,.24);border-radius:12px;background:linear-gradient(180deg,rgba(12,18,27,.98),rgba(7,11,18,.99));box-shadow:0 24px 60px rgba(0,0,0,.48);color:#e8f0fb;pointer-events:auto;overflow:hidden;animation:wsmxReaderIn .16s ease}
.wsmx-reader-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:14px 14px 10px;border-bottom:1px solid rgba(148,163,184,.14)}
.wsmx-reader-title{font-size:13px;font-weight:750;line-height:1.3;color:#f8fbff}
.wsmx-reader-address{margin-top:4px;font-size:10px;color:rgba(209,220,234,.66);word-break:break-all}
.wsmx-reader-close{width:28px;height:28px;border-radius:999px;border:1px solid rgba(231,239,247,.12);background:rgba(231,239,247,.06);color:#e8f0fb;font-size:18px;line-height:1;cursor:pointer}
.wsmx-reader-body{display:grid;gap:12px;padding:12px 14px 16px;overflow:auto;min-height:0}
.wsmx-reader-brief{border-left:3px solid rgba(130,245,206,.75);border-radius:9px;background:rgba(130,245,206,.08);padding:9px 10px;font-size:12px;line-height:1.65;color:#f4fffb}
.wsmx-reader-section{display:grid;gap:7px}
.wsmx-reader-section-title{font-size:10px;font-weight:750;letter-spacing:.08em;text-transform:uppercase;color:rgba(204,216,230,.68)}
.wsmx-reader-tags{display:flex;flex-wrap:wrap;gap:6px}
.wsmx-reader-tag{display:inline-flex;align-items:center;max-width:100%;padding:4px 8px;border-radius:999px;border:1px solid transparent;font-size:10px;line-height:1.2}
.wsmx-reader-tag--accent{color:#bed1ff;background:rgba(112,159,255,.15);border-color:rgba(112,159,255,.28)}
.wsmx-reader-tag--neutral{color:rgba(231,239,247,.86);background:rgba(231,239,247,.08);border-color:rgba(231,239,247,.13)}
.wsmx-reader-tag--ai-review{color:#d7ddff;background:rgba(129,140,248,.13);border-color:rgba(129,140,248,.22)}
.wsmx-reader-tag--watch{color:#f3d781;background:rgba(243,215,129,.14);border-color:rgba(243,215,129,.22)}
.wsmx-reader-tag--alert,.wsmx-reader-tag--danger{color:#ffcab9;background:rgba(243,125,107,.13);border-color:rgba(243,125,107,.24)}
.wsmx-reader-text{font-size:12px;line-height:1.7;color:rgba(224,235,247,.86);white-space:pre-wrap;word-break:break-word}
.wsmx-reader-details{border:1px solid rgba(148,163,184,.14);border-radius:10px;background:rgba(231,239,247,.035);overflow:hidden}
.wsmx-reader-details summary{padding:10px 11px;cursor:pointer;font-size:12px;font-weight:750;color:#edf5ff}
.wsmx-reader-details-text{padding:0 11px 12px}
@media (max-width:560px){.wsmx-reader{top:8px;right:8px;bottom:8px;width:calc(100vw - 16px)}}
@keyframes wsmxReaderFade{from{opacity:0}to{opacity:1}}
@keyframes wsmxReaderIn{from{opacity:0;transform:translateX(18px)}to{opacity:1;transform:translateX(0)}}
      `;
      shadow.append(style);

      const layer = document.createElement("div");
      layer.className = "wsmx-reader-layer";
      shadow.append(layer);

      document.body.append(this.host);
      this.shadowRoot = shadow;
    }

    private getLayer() {
      return this.shadowRoot?.querySelector<HTMLDivElement>(".wsmx-reader-layer") ?? null;
    }

    private toneClass(tone?: string) {
      switch (tone) {
        case "accent":
        case "watch":
        case "alert":
        case "danger":
        case "ai-review":
          return tone;
        default:
          return "neutral";
      }
    }

    private createTagNode(badge: AddressLabelBadge) {
      const tag = document.createElement("span");
      tag.className = `wsmx-reader-tag wsmx-reader-tag--${this.toneClass(badge.tone)}`;
      tag.textContent = truncateText(badge.text, 30);
      tag.title = badge.detailText || badge.metricText || badge.text;
      return tag;
    }

    private appendTagSection(container: HTMLElement, titleText: string, badges: AddressLabelBadge[]) {
      if (badges.length === 0) {
        return;
      }
      const section = document.createElement("section");
      section.className = "wsmx-reader-section";
      const title = document.createElement("div");
      title.className = "wsmx-reader-section-title";
      title.textContent = titleText;
      const tags = document.createElement("div");
      tags.className = "wsmx-reader-tags";
      dedupeBadges(badges).forEach((badge) => tags.append(this.createTagNode(badge)));
      section.append(title, tags);
      container.append(section);
    }

    private appendTextSection(container: HTMLElement, titleText: string, textValue: string) {
      if (!compactText(textValue)) {
        return;
      }
      const details = document.createElement("details");
      details.className = "wsmx-reader-details";
      const summary = document.createElement("summary");
      summary.textContent = titleText;
      const textNode = document.createElement("div");
      textNode.className = "wsmx-reader-text wsmx-reader-details-text";
      textNode.textContent = textValue;
      details.append(summary, textNode);
      container.append(details);
    }

    open(annotation: ResolvedInlineAnnotation, returnFocus?: HTMLElement | null) {
      this.ensureHost();
      this.returnFocus =
        returnFocus ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
      const layer = this.getLayer();
      if (!layer) {
        return;
      }
      layer.textContent = "";

      const backdrop = document.createElement("button");
      backdrop.type = "button";
      backdrop.className = "wsmx-reader-backdrop";
      backdrop.setAttribute("aria-label", "关闭 AI 解读");
      backdrop.addEventListener("click", () => this.close());

      const drawer = document.createElement("aside");
      drawer.className = "wsmx-reader";
      drawer.setAttribute("role", "dialog");
      drawer.setAttribute("aria-label", `${annotation.aliasText} AI 解读`);

      const head = document.createElement("div");
      head.className = "wsmx-reader-head";
      const titleWrap = document.createElement("div");
      const title = document.createElement("div");
      title.className = "wsmx-reader-title";
      title.textContent = annotation.aliasText;
      const address = document.createElement("div");
      address.className = "wsmx-reader-address";
      address.textContent = annotation.normalizedAddress || annotation.proxyWallet;
      titleWrap.append(title, address);
      const closeButton = document.createElement("button");
      closeButton.type = "button";
      closeButton.className = "wsmx-reader-close";
      closeButton.setAttribute("aria-label", "关闭 AI 解读");
      closeButton.textContent = "×";
      closeButton.addEventListener("click", () => this.close());
      head.append(titleWrap, closeButton);

      const body = document.createElement("div");
      body.className = "wsmx-reader-body";
      const brief = document.createElement("div");
      brief.className = "wsmx-reader-brief";
      brief.textContent =
        annotation.hoverCard?.aiBriefShortText || annotation.summaryText || annotation.noteSnippet || "暂无 AI 结论。";
      body.append(brief);

      const officialTags = dedupeBadges([
        ...(annotation.hoverCard?.officialTags ?? []),
        ...getVisibleAnnotationBadges(annotation).filter((badge) => badge.tone === "accent")
      ]);
      const officialKeys = new Set(officialTags.map((badge) => makeBadgeKey(badge)));
      const aiTags = dedupeBadges([
        ...(annotation.hoverCard?.aiTags ?? []),
        ...getVisibleAnnotationBadges(annotation).filter((badge) => badge.tone !== "accent")
      ]).filter((badge) => !officialKeys.has(makeBadgeKey(badge)));
      this.appendTagSection(body, "结构化标签", officialTags.length ? officialTags : getVisibleAnnotationBadges(annotation));
      this.appendTagSection(body, "AI 标签", aiTags);

      this.appendTextSection(
        body,
        "摘要说明",
        annotation.hoverCard?.aiNarrativeNoteText || annotation.hoverCard?.aiStatsNoteText || annotation.noteSnippet || ""
      );
      this.appendTextSection(body, "深度解读", annotation.hoverCard?.aiDeepNoteText || "");

      drawer.append(head, body);
      drawer.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          this.close();
        }
      });
      layer.append(backdrop, drawer);
      closeButton.focus();
    }

    close() {
      const layer = this.getLayer();
      if (layer) {
        layer.textContent = "";
      }
      const focusTarget = this.returnFocus;
      this.returnFocus = null;
      if (focusTarget?.isConnected) {
        focusTarget.focus();
      }
    }

    destroy() {
      this.close();
      this.host?.remove();
      this.host = null;
      this.shadowRoot = null;
    }
  }

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

  const collectProfileAnchors = (root: ParentNode) =>
    Array.from(root.querySelectorAll<HTMLAnchorElement>('a[href*="/profile/"]')).filter(
      (anchor) => !anchor.closest(`.${ROOT_CLASS}`)
    );

  const countUniqueProfileAddresses = (element: ParentNode) =>
    new Set(
      collectVisibleProfileAnchors(element)
        .map((anchor) => resolveProfileAddress(anchor))
        .filter((address): address is string => Boolean(address))
    ).size;

  const countAllProfileAddresses = (element: ParentNode) =>
    new Set(
      collectProfileAnchors(element)
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
    sendBackgroundMessage<ContentMarketAnnotationResponse>({
      type: "wsm:getMarketAnnotations",
      slug,
      forceRefresh
    });

  const requestAddressLookup = async (addresses: string[]) =>
    sendBackgroundMessage<AddressLookupSummary[]>({
      type: "wsm:lookupAddresses",
      addresses
    });

  const openAnnotationReader = (annotation: ResolvedInlineAnnotation, returnFocus?: HTMLElement | null) => {
    const address = annotation.normalizedAddress || annotation.proxyWallet;
    if (!address) {
      return;
    }

    hoverOverlayManager?.close();
    drawerOverlayManager?.open(annotation, returnFocus);
  };

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

  const getFeedStripButtons = (element: HTMLElement) => {
    const directButtons = Array.from(element.querySelectorAll<HTMLButtonElement>(":scope > button")).filter((button) =>
      isVisible(button)
    );
    if (directButtons.length >= 3) {
      return directButtons;
    }

    return Array.from(element.querySelectorAll<HTMLButtonElement>(":scope > * > button")).filter((button) =>
      isVisible(button)
    );
  };

  const findFeedTabStrip = () =>
    Array.from(document.querySelectorAll<HTMLElement>("div")).find((element) => {
      if (!isVisible(element)) {
        return false;
      }
      const buttons = getFeedStripButtons(element);
      const matchedCount = [
        buttons.some((button) => hasTabText(button, FEED_COMMENTS_LABELS)),
        buttons.some((button) => hasTabText(button, FEED_TOP_HOLDERS_LABELS)),
        buttons.some((button) => hasTabText(button, FEED_POSITIONS_LABELS)),
        buttons.some((button) => hasTabText(button, FEED_ACTIVITY_LABELS))
      ].filter(Boolean).length;
      return buttons.length >= 3 && buttons.length <= 6 && matchedCount >= 3;
    }) ?? null;

  const findTopHoldersTabButton = () => {
    const strip = findFeedTabStrip();
    if (!strip) {
      return null;
    }
    return (
      getFeedStripButtons(strip).find((button) =>
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
    const allProfileCount = countAllProfileAddresses(element);
    if (!text || Math.max(profileCount, allProfileCount) < 2 || text.length > 4200) {
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

  const collectFeedPanelCandidates = (strip: HTMLElement | null) => {
    if (!strip) {
      return [];
    }

    const stripRect = strip.getBoundingClientRect();
    const stripTop = stripRect.top + window.scrollY;
    const stripBottom = stripRect.bottom + window.scrollY;
    const candidateElements = new Set<HTMLElement>();

    const pushVisibleSiblings = (element: HTMLElement | null) => {
      let current = element?.nextElementSibling;
      while (current instanceof HTMLElement) {
        if (isVisible(current)) {
          candidateElements.add(current);
        }
        current = current.nextElementSibling;
      }
    };

    pushVisibleSiblings(strip);
    pushVisibleSiblings(strip.parentElement instanceof HTMLElement ? strip.parentElement : null);
    pushVisibleSiblings(strip.parentElement?.parentElement instanceof HTMLElement ? strip.parentElement.parentElement : null);
    pushVisibleSiblings(
      strip.parentElement?.parentElement?.parentElement instanceof HTMLElement
        ? strip.parentElement.parentElement.parentElement
        : null
    );

    [...candidateElements].forEach((element) => {
      Array.from(element.querySelectorAll<HTMLElement>("div, section, article"))
        .filter((child) => child !== element && isVisible(child))
        .forEach((child) => candidateElements.add(child));
    });

    Array.from(document.querySelectorAll<HTMLElement>("div, section, article"))
      .filter((element) => isVisible(element))
      .forEach((element) => {
        if (element.contains(strip) || strip.contains(element)) {
          return;
        }

        const rect = element.getBoundingClientRect();
        const top = rect.top + window.scrollY;
        if (top < stripTop - 40 || top > stripBottom + 1600) {
          return;
        }

        if (element.querySelector('a[href*="/profile/"]')) {
          candidateElements.add(element);
        }
      });

    return [...candidateElements]
      .map((element) => {
        const profileCount = countUniqueProfileAddresses(element);
        const allProfileCount = countAllProfileAddresses(element);
        const rowCount = extractHolderRows(element, "feed-top-holders").length;
        const commentArticleCount = element.querySelectorAll("article.comment").length;
        const className = getElementClassName(element);
        const text = compactText(element.textContent);
        let score = rowCount * 40 + profileCount * 16 + allProfileCount * 6;
        score -= commentArticleCount * 300;
        score -= element.querySelectorAll("button").length * 4;
        score -= Math.max(0, Math.round(element.getBoundingClientRect().height) - 900) / 8;
        if (
          hasAnyTitle(text, FEED_COMMENTS_LABELS) ||
          hasAnyTitle(text, FEED_POSITIONS_LABELS) ||
          hasAnyTitle(text, FEED_ACTIVITY_LABELS)
        ) {
          score -= 80;
        }
        if (className.includes("overflow-x-auto")) {
          score -= 40;
        }
        return { element, score, rowCount, profileCount, allProfileCount };
      })
      .filter((candidate) => Math.max(candidate.profileCount, candidate.allProfileCount) >= 2 || candidate.rowCount >= 2)
      .sort((left, right) => right.score - left.score);
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

        const rows = dedupeHolderRowsByMount([
          ...extractHolderRowsFromColumn(yesColumn, surfaceKind),
          ...extractHolderRowsFromColumn(noColumn, surfaceKind)
        ]);

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
      const text = getTextWithoutInjectedAnnotations(element);
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
    return dedupeHolderRowsByMount([...bestByKey.values()]);
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

    return dedupeHolderRowsByMount([...bestByKey.values()]);
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
    const strip = findFeedTabStrip();
    const panelCandidates = collectFeedPanelCandidates(strip);
    const candidatePanel = panelCandidates[0]?.element ?? null;
    if (!button && !strip && !candidatePanel) {
      return null;
    }

    const commentsSection = button?.closest<HTMLElement>("#comments") ?? strip?.closest<HTMLElement>("#comments") ?? null;
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
      (candidatePanel ? buildStructuredSurfaceCandidate(candidatePanel, "feed-top-holders") : null) ??
      (fallbackScope ? buildStructuredSurfaceCandidate(fallbackScope, "feed-top-holders") : null);
    const active = Boolean(panel || candidatePanel || structured) || isTopHoldersTabActive(button);
    const root =
      structured?.root ??
      panel ??
      candidatePanel ??
      button?.closest<HTMLElement>("section") ??
      button?.parentElement?.parentElement ??
      button?.parentElement ??
      strip ??
      button;

    if (!root) {
      return null;
    }

    return {
      panelKey: `feed:${buildDomPath(root, document.body)}`,
      titleText: compactText(button?.textContent) || "Top Holders",
      active,
      surfaceKind: "feed-top-holders",
      confidence: structured ? structured.confidence : active && (panel || candidatePanel) ? 0.86 : 0.52,
      root,
      rows:
        structured?.rows ??
        (panel ? extractHolderRows(panel, "feed-top-holders") : candidatePanel ? extractHolderRows(candidatePanel, "feed-top-holders") : []),
      fallbackAnchor: structured?.fallbackAnchor ?? panel ?? candidatePanel ?? root
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

  const getInlineBadgeSource = (summary: AddressSummary) =>
    dedupeBadges(summary.badges?.length ? summary.badges : (summary.hoverBadges ?? []));

  const selectPrimaryBadge = (summary: AddressSummary, aliasText: string, holderDisplayName: string) =>
    getInlineBadgeSource(summary)
      .filter((badge) => !isAliasDuplicateBadge(badge, aliasText, holderDisplayName))
      .sort(compareInlineBadges)[0];

  const selectSecondaryBadges = (
    summary: AddressSummary,
    primaryBadge?: AddressSummary["badges"][number],
    aliasText?: string,
    holderDisplayName?: string
  ) =>
    getInlineBadgeSource(summary)
      .filter((badge) => badge.id !== primaryBadge?.id)
      .filter((badge) =>
        aliasText && holderDisplayName ? !isAliasDuplicateBadge(badge, aliasText, holderDisplayName) : true
      )
      .sort(compareInlineBadges)
      .slice(0, 2);

  const hasHoverPayload = (annotation: ResolvedInlineAnnotation) =>
    Boolean(annotation.summaryText) ||
    annotation.secondaryBadges.length > 0 ||
    annotation.statusBadges.length > 0 ||
    Boolean(annotation.hoverCard?.officialTags?.length) ||
    Boolean(annotation.hoverCard?.aiTags?.length) ||
    Boolean(annotation.hoverCard?.officialNoteText) ||
    Boolean(annotation.hoverCard?.aiBriefShortText) ||
    Boolean(annotation.hoverCard?.aiNarrativeNoteText) ||
    Boolean(annotation.hoverCard?.aiDeepNoteText) ||
    Boolean(annotation.hoverCard?.aiStatsNoteText);

  const buildResolvedAnnotation = (
    row: HolderRowSnapshot,
    summary: AddressSummary,
    holder: Pick<AnnotatedHolder, "proxyWallet" | "displayName">,
    source: InlineAnnotationSource
  ): ResolvedInlineAnnotation => {
    const aliasText = summary.alias?.trim() || row.displayNameText || holder.displayName || shortenAddress(holder.proxyWallet);
    const primaryBadge = selectPrimaryBadge(summary, aliasText, holder.displayName);
    const mountKey = getRowMountKey(row);
    return {
      key: mountKey,
      rowKey: row.rowKey,
      mountKey,
      normalizedAddress: row.normalizedAddress ?? "",
      surfaceKind: row.surfaceKind,
      source,
      aliasText: truncateText(aliasText, 22),
      primaryBadge,
      secondaryBadges: selectSecondaryBadges(summary, primaryBadge, aliasText, holder.displayName),
      statusBadges: summary.statusBadges ?? [],
      hoverCard: summary.hoverCard,
      summaryText: truncateText(summary.aiBriefShort ?? summary.strategyFocus ?? summary.noteSnippet, 96) || undefined,
      noteSnippet: truncateText(summary.noteSnippet, 48),
      activityLevel: getActivityLevelFromSummary(summary),
      detailUrl: summary.detailUrl,
      summaryVersion: summary.version,
      proxyWallet: holder.proxyWallet,
      displayName: summary.displayName || holder.displayName
    };
  };

  const buildFallbackAnnotation = (
    panel: HolderPanelSnapshot,
    holder: AnnotatedHolder,
    summary: AddressSummary
  ): ResolvedInlineAnnotation => {
    const aliasText =
      summary.alias?.trim() || summary.displayName || holder.displayName || shortenAddress(holder.proxyWallet);
    const primaryBadge = selectPrimaryBadge(summary, aliasText, holder.displayName);
    return {
      key: `fallback:${holder.normalizedAddress}`,
      rowKey: `fallback:${holder.normalizedAddress}`,
      mountKey: `fallback:${holder.normalizedAddress}`,
      normalizedAddress: holder.normalizedAddress,
      surfaceKind: panel.surfaceKind,
      source: "market_annotations",
      aliasText: truncateText(aliasText, 22),
      primaryBadge,
      secondaryBadges: selectSecondaryBadges(summary, primaryBadge, aliasText, holder.displayName),
      statusBadges: summary.statusBadges ?? [],
      hoverCard: summary.hoverCard,
      summaryText: truncateText(summary.aiBriefShort ?? summary.strategyFocus ?? summary.noteSnippet, 96) || undefined,
      noteSnippet: truncateText(summary.noteSnippet, 48),
      activityLevel: getActivityLevelFromSummary(summary),
      detailUrl: summary.detailUrl,
      summaryVersion: summary.version,
      proxyWallet: holder.proxyWallet,
      displayName: summary.displayName || holder.displayName
    };
  };

  const resolvePanelAnnotations = async (
    panel: HolderPanelSnapshot,
  payload: ContentMarketAnnotationResponse,
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
      const annotation = buildResolvedAnnotation(row, holder.summary, holder, "market_annotations");
      if (!resolved.has(annotation.mountKey)) {
        resolved.set(annotation.mountKey, annotation);
      }
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
          const annotation = buildResolvedAnnotation(
            row,
            summary,
            {
              proxyWallet: summary.address,
              displayName: row.displayNameText || shortenAddress(summary.address)
            },
            "labels_lookup"
          );
          if (!resolved.has(annotation.mountKey)) {
            resolved.set(annotation.mountKey, annotation);
          }
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

  const findMountedAnnotationKeyByNode = (node: HTMLElement) =>
    [...mountedAnnotations.entries()].find(([, entry]) => entry.node === node)?.[0];

  const removeAnnotationDomNode = (node: HTMLElement) => {
    const mountedKey = findMountedAnnotationKeyByNode(node);
    if (mountedKey) {
      removeMountedAnnotation(mountedKey);
      return;
    }

    const annotationKey = node.dataset.annotationKey?.trim();
    if (annotationKey && hoverOverlayManager?.getActiveKey() === annotationKey) {
      hoverOverlayManager.close();
    }
    node.remove();
  };

  const isOwnedAnnotationNode = (node: HTMLElement) => {
    const owner = node.dataset.wsmOwner?.trim();
    return !owner || owner === CONTENT_INSTANCE_ID;
  };

  const getOwnedAnnotationNodes = () =>
    Array.from(document.querySelectorAll<HTMLElement>(`.${ROOT_CLASS}`)).filter(isOwnedAnnotationNode);

  const hasMountedAnnotationDom = () => mountedAnnotations.size > 0 || Boolean(mountedFallbackNode);

  const markAnnotationsStale = () => {
    getOwnedAnnotationNodes().forEach((node) => {
      node.dataset.wsmState = "stale";
    });
  };

  const markAnnotationsFresh = () => {
    getOwnedAnnotationNodes().forEach((node) => {
      delete node.dataset.wsmState;
    });
  };

  const cancelTransientClear = () => {
    if (!transientClearTimer) {
      return;
    }
    window.clearTimeout(transientClearTimer);
    transientClearTimer = null;
  };

  const scheduleTransientClear = () => {
    if (!hasMountedAnnotationDom()) {
      return;
    }

    markAnnotationsStale();
    if (transientClearTimer) {
      return;
    }

    transientClearTimer = window.setTimeout(() => {
      transientClearTimer = null;
      clearAnnotations();
    }, TRANSIENT_CLEAR_GRACE_MS);
  };

  const pruneConflictingAnnotationDomNodes = (
    row: HolderRowSnapshot,
    annotation: ResolvedInlineAnnotation,
    keepNode?: HTMLElement
  ) => {
    const scopes = Array.from(
      new Set(
        [row.mount.row, row.mount.mountTarget, row.mount.mainContainer].filter(
          (element): element is HTMLElement => Boolean(element)
        )
      )
    );
    const nodes = Array.from(
      new Set(scopes.flatMap((scope) => Array.from(scope.querySelectorAll<HTMLElement>(`.${ROOT_CLASS}`))))
    ).filter((node) => isOwnedAnnotationNode(node) && !node.classList.contains(FALLBACK_CLASS));

    nodes.forEach((node) => {
      if (node === keepNode) {
        return;
      }

      const nodeAddress = node.dataset.address?.trim();
      const nodeKey = node.dataset.annotationKey?.trim();
      const sameAddress = !nodeAddress || nodeAddress === annotation.normalizedAddress;
      const sameKey = nodeKey === annotation.key;
      if (sameAddress || sameKey) {
        removeAnnotationDomNode(node);
      }
    });
  };

  const removeAllAnnotationDomNodes = () => {
    getOwnedAnnotationNodes().forEach((node) => removeAnnotationDomNode(node));
  };

  const removeMountedAnnotation = (key: string) => {
    const entry = mountedAnnotations.get(key);
    if (!entry) {
      return;
    }
    if (hoverOverlayManager?.getActiveKey() === key) {
      hoverOverlayManager.close();
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
    cancelTransientClear();
    [...mountedAnnotations.keys()].forEach((key) => removeMountedAnnotation(key));
    fallbackHoverAnnotations.clear();
    clearMountedFallback();
    removeAllAnnotationDomNodes();
    setDebugState("Rendered", "0");
  };

  const invalidatePendingRender = () => {
    renderGeneration += 1;
    if (renderTimer) {
      window.clearTimeout(renderTimer);
      renderTimer = null;
    }
  };

  const getVisibleAnnotationBadges = (annotation: ResolvedInlineAnnotation) =>
    dedupeBadges([
      ...(annotation.primaryBadge ? [annotation.primaryBadge] : []),
      ...annotation.secondaryBadges,
      ...annotation.statusBadges.filter((badge) => !isSystemOnlyBadge(badge))
    ]);

  const prepareHoverTrigger = (element: HTMLElement, annotation: ResolvedInlineAnnotation) => {
    element.setAttribute("aria-haspopup", "dialog");
    element.setAttribute("aria-expanded", "false");
    element.dataset.wsmxHoverTrigger = "1";
    element.dataset.wsmxHoverKey = annotation.key;
  };

  const createChipNode = (
    badge: AddressSummary["badges"][number],
    annotation: ResolvedInlineAnnotation
  ): HTMLButtonElement => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `wsm-chip wsm-chip--${badge.tone || "neutral"}`;
    button.textContent = truncateText(badge.text, 18);
    button.title = badge.detailText || badge.metricText || badge.text;
    prepareHoverTrigger(button, annotation);
    return button;
  };

  const createMoreChipNode = (hiddenCount: number, annotation: ResolvedInlineAnnotation) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "wsm-chip wsm-chip--more";
    button.textContent = `+${hiddenCount}`;
    button.title = "查看更多标签";
    prepareHoverTrigger(button, annotation);
    return button;
  };

  const buildAnnotationNode = (annotation: ResolvedInlineAnnotation) => {
    const row = document.createElement("div");
    row.className = `${ROOT_CLASS} ${ROW_CLASS}`;
    row.dataset.annotationKey = annotation.key;
    row.dataset.wsmOwner = CONTENT_INSTANCE_ID;
    row.dataset.address = annotation.normalizedAddress;
    row.dataset.surfaceKind = annotation.surfaceKind;
    row.dataset.source = annotation.source;
    row.dataset.version = annotation.summaryVersion;
    row.dataset.renderSignature = getAnnotationRenderSignature(annotation);

    const aliasButton = document.createElement("button");
    aliasButton.type = "button";
    aliasButton.className = "wsm-alias";
    const aliasTone = getAliasActivityTone(annotation.activityLevel);
    if (aliasTone) {
      aliasButton.classList.add(`wsm-alias--${aliasTone}`);
    }
    aliasButton.textContent = annotation.aliasText;
    aliasButton.title = annotation.activityLevel ? `查看钱包解读 · ${annotation.activityLevel}` : "查看钱包解读";
    prepareHoverTrigger(aliasButton, annotation);
    aliasButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      openAnnotationReader(annotation, event.currentTarget instanceof HTMLElement ? event.currentTarget : null);
    });
    row.append(aliasButton);

    let trigger: HTMLButtonElement | undefined = aliasButton;
    const visibleBadges = getVisibleAnnotationBadges(annotation);
    if (visibleBadges.length > 0) {
      const chipList = document.createElement("div");
      chipList.className = "wsm-chip-list";
      const maxInlineBadges = 3;
      visibleBadges.slice(0, maxInlineBadges).forEach((badge, index) => {
        const chip = createChipNode(badge, annotation);
        if (index === 0) {
          trigger = chip;
        }
        chipList.append(chip);
      });
      if (visibleBadges.length > maxInlineBadges) {
        chipList.append(createMoreChipNode(visibleBadges.length - maxInlineBadges, annotation));
      }
      row.append(chipList);
    }

    if (annotation.noteSnippet && visibleBadges.length === 0 && !hasHoverPayload(annotation)) {
      const note = document.createElement("span");
      note.className = "wsm-note";
      note.textContent = truncateText(annotation.noteSnippet, 24);
      row.append(note);
    }

    return { node: row, trigger };
  };

  const upsertMountedAnnotation = (row: HolderRowSnapshot, annotation: ResolvedInlineAnnotation) => {
    const existing = mountedAnnotations.get(annotation.key);
    pruneConflictingAnnotationDomNodes(row, annotation, existing?.node);
    const sameMount =
      existing &&
      existing.row === row.mount.row &&
      existing.mountTarget === row.mount.mountTarget &&
      existing.node.isConnected;
    if (
      sameMount &&
      existing.node.dataset.renderSignature === getAnnotationRenderSignature(annotation)
    ) {
      existing.node.dataset.version = annotation.summaryVersion;
      existing.node.dataset.source = annotation.source;
      existing.annotation = annotation;
      delete existing.node.dataset.wsmState;
      return;
    }

    if (sameMount) {
      ensureMountClasses(row.mount);
      row.mount.row.dataset.wsmRowAddress = row.normalizedAddress ?? "";
      row.mount.row.dataset.wsmRowSide = row.side;
      row.mount.row.dataset.wsmRowSurface = row.surfaceKind;
      const built = buildAnnotationNode(annotation);
      if (hoverOverlayManager?.getActiveKey() === annotation.key) {
        hoverOverlayManager.close();
      }
      existing.node.replaceWith(built.node);
      mountedAnnotations.set(annotation.key, {
        node: built.node,
        trigger: built.trigger,
        annotation,
        row: row.mount.row,
        mountTarget: row.mount.mountTarget,
        mainContainer: row.mount.mainContainer
      });
      return;
    }

    if (existing) {
      removeMountedAnnotation(annotation.key);
    }

    [...mountedAnnotations.entries()].forEach(([key, entry]) => {
      if (key === annotation.key) {
        return;
      }

      if (entry.annotation.mountKey === annotation.mountKey) {
        removeMountedAnnotation(key);
      }
    });

    ensureMountClasses(row.mount);
    row.mount.row.dataset.wsmRowAddress = row.normalizedAddress ?? "";
    row.mount.row.dataset.wsmRowSide = row.side;
    row.mount.row.dataset.wsmRowSurface = row.surfaceKind;
    const built = buildAnnotationNode(annotation);
    if (row.mount.nameLine) {
      row.mount.nameLine.insertAdjacentElement("afterend", built.node);
    } else {
      row.mount.mountTarget.append(built.node);
    }

    mountedAnnotations.set(annotation.key, {
      node: built.node,
      trigger: built.trigger,
      annotation,
      row: row.mount.row,
      mountTarget: row.mount.mountTarget,
      mainContainer: row.mount.mainContainer
    });
  };

  const renderFallbackList = (
    panel: HolderPanelSnapshot,
  payload: ContentMarketAnnotationResponse,
    annotations: ResolvedInlineAnnotation[]
  ) => {
    clearMountedFallback();
    fallbackHoverAnnotations.clear();
    const items = payload.holders.filter((holder) => holder.summary).slice(0, 6);
    if (items.length === 0) {
      return false;
    }

    const shell = document.createElement("div");
    shell.className = `${ROOT_CLASS} ${FALLBACK_CLASS}`;
    shell.dataset.wsmOwner = CONTENT_INSTANCE_ID;
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

      const item = document.createElement("div");
      item.className = "wsm-fallback-item";

      const fallbackAnnotation = buildFallbackAnnotation(panel, holder, holder.summary);
      fallbackHoverAnnotations.set(fallbackAnnotation.key, fallbackAnnotation);

      const alias = document.createElement("button");
      alias.type = "button";
      alias.className = "wsm-fallback-alias";
      alias.textContent = holder.summary.alias?.trim() || holder.displayName || shortenAddress(holder.proxyWallet);
      alias.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        openAnnotationReader(fallbackAnnotation, event.currentTarget instanceof HTMLElement ? event.currentTarget : null);
      });
      item.append(alias);

      const visibleBadges = getVisibleAnnotationBadges(fallbackAnnotation);
      if (visibleBadges.length > 0) {
        const chipList = document.createElement("div");
        chipList.className = "wsm-chip-list";
        visibleBadges.slice(0, 4).forEach((badge) => {
          chipList.append(createChipNode(badge, fallbackAnnotation));
        });
        if (visibleBadges.length > 4) {
          chipList.append(createMoreChipNode(visibleBadges.length - 4, fallbackAnnotation));
        }
        item.append(chipList);
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
  payload: ContentMarketAnnotationResponse,
    annotations: ResolvedInlineAnnotation[],
    visibleAddressCount: number
  ) => {
    cancelTransientClear();
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
    markAnnotationsFresh();
    return shouldRenderFallback;
  };

  const queueRender = (options?: { forceVisibleLookup?: boolean }) => {
    if (options?.forceVisibleLookup) {
      forceLookupRefresh = true;
    }
    invalidatePendingRender();
    renderTimer = window.setTimeout(() => {
      void renderAnnotations();
    }, RENDER_DEBOUNCE_MS);
  };

  const getClosestAnnotationRoot = (node: Node) => {
    if (!(node instanceof HTMLElement)) {
      return null;
    }

    if (node.classList.contains(ROOT_CLASS)) {
      return node;
    }

    return node.closest<HTMLElement>(`.${ROOT_CLASS}`);
  };

  const isCurrentInstanceAnnotationNode = (node: Node) =>
    getClosestAnnotationRoot(node)?.dataset.wsmOwner === CONTENT_INSTANCE_ID;

  const hasExternalMutationNodes = (mutations: MutationRecord[]) =>
    mutations.some((mutation) =>
      [...mutation.addedNodes, ...mutation.removedNodes].some((node) => !isCurrentInstanceAnnotationNode(node))
    );

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
      if (hasExternalMutationNodes(mutations)) {
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
      if (hasExternalMutationNodes(mutations)) {
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
      scheduleTransientClear();
      setDebugState("Panel", "missing");
      setDebugState("PanelKind", "none");
      markRuntimeStatus("wake", "Waiting for the holders surface to appear.");
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
      scheduleTransientClear();
      setDebugState("Panel", "inactive");
      setDebugState("PanelKind", panel.surfaceKind);
      markRuntimeStatus("wake", "Open the holders panel to start annotations.");
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
      scheduleTransientClear();
      return;
    }

    const pageSlug = resolveCurrentMarketSlug();
    if (pageSlug && payload.market.slug !== pageSlug) {
      scheduleTransientClear();
      setDebugState("Panel", "pending");
      setDebugState("PanelKind", panel.surfaceKind);
      markRuntimeStatus("wake", "Refreshing page runtime.");
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
    if (routeRefreshTimer) {
      window.clearTimeout(routeRefreshTimer);
      routeRefreshTimer = null;
    }
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
      scheduleTransientClear();
      markRuntimeStatus("wake", "Open a market page to start annotations.");
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

  const scheduleRouteRefresh = () => {
    invalidatePendingRender();
    if (hasMountedAnnotationDom()) {
      scheduleTransientClear();
    } else {
      markAnnotationsStale();
    }
    if (routeRefreshTimer) {
      window.clearTimeout(routeRefreshTimer);
    }
    routeRefreshTimer = window.setTimeout(() => {
      routeRefreshTimer = null;
      void refreshAnnotations({ lifecycle: "bootstrap" });
    }, ROUTE_REFRESH_DEBOUNCE_MS);
  };

  const handleLifecycleRefresh = (event?: PageTransitionEvent | { persisted?: boolean }) => {
    if (document.visibilityState !== "visible" && !(event?.persisted ?? false)) {
      return;
    }
    const nextSlug = resolveCurrentMarketSlug();
    if (nextSlug && nextSlug !== currentSlug) {
      scheduleRouteRefresh();
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

  const resolveHoverTarget = (
    target: EventTarget | null
  ): { trigger: HTMLElement; key: string } | null => {
    if (!(target instanceof Element)) {
      return null;
    }

    const explicitTrigger = target.closest<HTMLElement>("[data-wsmx-hover-trigger='1']");
    const explicitKey = explicitTrigger?.dataset.wsmxHoverKey?.trim();
    if (explicitTrigger && explicitKey) {
      return { trigger: explicitTrigger, key: explicitKey };
    }

    const legacyChip = target.closest<HTMLElement>(".wsm-chip, .wsm-note");
    const annotationRoot = legacyChip?.closest<HTMLElement>(`.${ROOT_CLASS}[data-annotation-key]`);
    const fallbackKey = annotationRoot?.dataset.annotationKey?.trim();
    if (legacyChip && fallbackKey) {
      return { trigger: legacyChip, key: fallbackKey };
    }

    return null;
  };

  const installHoverInteractionHandlers = () => {
    interactionAbortController?.abort();
    const controller = new AbortController();
    interactionAbortController = controller;
    const signal = controller.signal;

    document.addEventListener(
      "pointerover",
      (event) => {
        const hoverTarget = resolveHoverTarget(event.target);
        if (!hoverTarget || !hoverOverlayManager) {
          return;
        }
        if (!hoverTarget.key) {
          return;
        }
        hoverOverlayManager.open(hoverTarget.key, hoverTarget.trigger);
      },
      { signal }
    );

    document.addEventListener(
      "pointerout",
      (event) => {
        if (!hoverOverlayManager) {
          return;
        }
        const hoverTarget = resolveHoverTarget(event.target);
        if (!hoverTarget) {
          return;
        }
        if (hoverOverlayManager.isInsideInteractiveRegion(event.relatedTarget)) {
          return;
        }
        hoverOverlayManager.scheduleClose();
      },
      { signal }
    );

    document.addEventListener(
      "pointercancel",
      (event) => {
        if (!hoverOverlayManager) {
          return;
        }
        const hoverTarget = resolveHoverTarget(event.target);
        if (!hoverTarget) {
          return;
        }
        if (hoverOverlayManager.isInsideInteractiveRegion(event.relatedTarget)) {
          return;
        }
        hoverOverlayManager.scheduleClose();
      },
      { signal }
    );

    document.addEventListener(
      "focusin",
      (event) => {
        const hoverTarget = resolveHoverTarget(event.target);
        if (!hoverTarget || !hoverOverlayManager) {
          return;
        }
        if (!hoverTarget.key) {
          return;
        }
        hoverOverlayManager.open(hoverTarget.key, hoverTarget.trigger);
      },
      { signal }
    );

    document.addEventListener(
      "focusout",
      (event) => {
        if (!hoverOverlayManager) {
          return;
        }
        const hoverTarget = resolveHoverTarget(event.target);
        if (!hoverTarget) {
          return;
        }
        if (hoverOverlayManager.isInsideInteractiveRegion(event.relatedTarget)) {
          return;
        }
        hoverOverlayManager.scheduleClose();
      },
      { signal }
    );

    document.addEventListener(
      "keydown",
      (event) => {
        if (!hoverOverlayManager) {
          return;
        }
        if (event.key === "Escape" && hoverOverlayManager.getActiveKey()) {
          const trigger = hoverOverlayManager.getActiveTrigger();
          hoverOverlayManager.close();
          trigger?.focus();
          return;
        }

        if (event.key === "Enter" || event.key === " ") {
          const hoverTarget = resolveHoverTarget(event.target);
          if (!hoverTarget || !hoverTarget.key) {
            return;
          }
          event.preventDefault();
          hoverOverlayManager.open(hoverTarget.key, hoverTarget.trigger);
        }
      },
      { signal }
    );

    document.addEventListener(
      "pointerdown",
      (event) => {
        const hoverTarget = resolveHoverTarget(event.target);
        if (hoverTarget && hoverOverlayManager) {
          if (!hoverTarget.key) {
            return;
          }
          if (hoverOverlayManager.getActiveKey() === hoverTarget.key) {
            hoverOverlayManager.close();
            return;
          }
          hoverOverlayManager.open(hoverTarget.key, hoverTarget.trigger);
          return;
        }

        if (!hoverOverlayManager?.getActiveKey()) {
          return;
        }
        if (hoverOverlayManager.isInsideInteractiveRegion(event.target)) {
          return;
        }
        hoverOverlayManager.close();
      },
      { signal }
    );

    window.addEventListener(
      "resize",
      () => hoverOverlayManager?.onViewportChange(),
      { passive: true, signal }
    );
    document.addEventListener(
      "visibilitychange",
      () => handleLifecycleRefresh(),
      { signal }
    );
    window.addEventListener(
      "focus",
      () => handleLifecycleRefresh(),
      { signal }
    );
    document.addEventListener(
      "scroll",
      () => {
        hoverOverlayManager?.onViewportChange();
        if (currentConfig.enabled && document.visibilityState === "visible" && currentPayload) {
          queueRender();
        }
      },
      {
        capture: true,
        passive: true,
        signal
      }
    );
    window.addEventListener(
      "pagehide",
      (event) => {
        hoverOverlayManager?.close();
        if ((event as PageTransitionEvent).persisted) {
          return;
        }
        if (routeRefreshTimer) {
          window.clearTimeout(routeRefreshTimer);
          routeRefreshTimer = null;
        }
        cancelTransientClear();
        interactionAbortController?.abort();
        interactionAbortController = null;
        hoverOverlayManager?.destroy();
        hoverOverlayManager = null;
        drawerOverlayManager?.destroy();
        drawerOverlayManager = null;
        surfaceObserver?.disconnect();
        surfaceObserver = null;
        discoveryObserver?.disconnect();
        discoveryObserver = null;
        resizeObserver?.disconnect();
        resizeObserver = null;
      },
      { signal }
    );
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
  };

  void (async () => {
    document.documentElement.dataset.wsmContentInstance = CONTENT_INSTANCE_ID;
    currentConfig = await getConfig();
    setDebugState("Boot", "starting");
    if (!isHostEnabled(currentConfig)) {
      return;
    }

    hoverOverlayManager = new HoverOverlayManager(
      (key) => mountedAnnotations.get(key)?.annotation ?? fallbackHoverAnnotations.get(key)
    );
    drawerOverlayManager = new DrawerOverlayManager();
    installHoverInteractionHandlers();

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
      scheduleRouteRefresh();
    });

    await refreshAnnotations({ lifecycle: "bootstrap" });
  })();
})();
