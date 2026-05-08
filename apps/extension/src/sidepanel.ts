import {
  SIDEPANEL_FOCUS_KEY,
  type SidePanelFocusTarget,
  type ExtensionStorageChange,
  type PageSurfaceState,
  type PopupViewState,
  hasRelevantStorageChange,
  readStoredPageSurfaceState,
  readStoredPopupState,
  sendExtensionMessage
} from "./ui-state.js";

interface AddressSearchResult {
  address: string;
  normalizedAddress: string;
  displayName: string;
  alias?: string;
  badges: AddressBadge[];
  hoverBadges?: AddressBadge[];
  statusBadges?: AddressBadge[];
  hoverCard?: {
    officialTags: AddressBadge[];
    officialNoteText?: string;
    aiTags: AddressBadge[];
    aiBriefShortText?: string;
    aiStatsNoteText?: string;
    aiNarrativeNoteText?: string;
    aiDeepNoteText?: string;
  };
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
  strategyFocus?: string;
  teamNote?: string;
}

interface AddressBadge {
  id: string;
  text: string;
  tone: string;
  kind?: string;
  priority?: number;
  detailText?: string;
  metricText?: string;
  isPrimary?: boolean;
}

const healthPill = document.querySelector<HTMLElement>("#health-pill");
const memberLabel = document.querySelector<HTMLElement>("#member-label");
const syncLabel = document.querySelector<HTMLElement>("#sync-label");
const toggleEnabledInput = document.querySelector<HTMLInputElement>("#toggle-enabled");
const refreshButton = document.querySelector<HTMLButtonElement>("#refresh-button");
const searchInput = document.querySelector<HTMLInputElement>("#search-input");
const resultsMeta = document.querySelector<HTMLElement>("#results-meta");
const resultsList = document.querySelector<HTMLElement>("#results-list");
const resultDetail = document.querySelector<HTMLElement>("#result-detail");
const resultDetailInner = document.querySelector<HTMLElement>("#result-detail-inner");
const openWorkbenchButton = document.querySelector<HTMLButtonElement>("#open-workbench-button");
const openPolymarketButton = document.querySelector<HTMLButtonElement>("#open-polymarket-button");
const sidepanelCard = document.querySelector<HTMLElement>(".sidepanel-card");

let searchTimer: number | null = null;
let surfaceRefreshTimer: number | null = null;
let lastHandledFocusToken: string | null = null;

const compactText = (value: string | null | undefined) => (value ?? "").replace(/\s+/g, " ").trim();

const truncateText = (value: string | null | undefined, maxLength: number) => {
  const text = compactText(value);
  if (!text) {
    return "";
  }

  return text.length <= maxLength ? text : `${text.slice(0, maxLength - 1)}...`;
};

const clearNode = (node: HTMLElement | null | undefined) => {
  node?.replaceChildren();
};

const createSafeExternalLink = (href: string | undefined, text: string) => {
  const link = document.createElement("a");
  link.className = "result-link";
  link.target = "_blank";
  link.rel = "noreferrer";
  link.textContent = text;

  if (!href) {
    link.hidden = true;
    return link;
  }

  try {
    const url = new URL(href);
    if (url.protocol === "http:" || url.protocol === "https:") {
      link.href = url.href;
    } else {
      link.hidden = true;
    }
  } catch {
    link.hidden = true;
  }

  return link;
};

const inferBadgeDedupeKind = (badge: AddressBadge) => {
  const text = compactText(badge.text).replace(/高爆击/g, "高暴击");
  if (text === "正常" || text === "低活跃") {
    return "activity_level";
  }
  if (text === "提前埋伏") {
    return "early_entry_signal";
  }
  if (text === "新钱包" || text === "隐藏高手新钱包") {
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

const makeBadgeKey = (badge: AddressBadge) =>
  `${inferBadgeDedupeKind(badge)}:${compactText(badge.text).toLowerCase().replace(/高爆击/g, "高暴击")}`;

const normalizeBadgeText = (value: string | null | undefined) => compactText(value).toLowerCase();

const isActivityLevelText = (value: string | null | undefined) => {
  const normalized = normalizeBadgeText(value);
  return normalized === "正常" || normalized === "低活跃" || normalized === "活跃";
};

const isSystemOnlyBadge = (badge: AddressBadge) => {
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

const dedupeBadges = (badges: AddressBadge[]) => {
  const seen = new Set<string>();
  const unique: AddressBadge[] = [];
  badges.forEach((badge) => {
    const text = compactText(badge.text);
    if (!text || isSystemOnlyBadge(badge)) {
      return;
    }
    const key = makeBadgeKey(badge);
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    unique.push({ ...badge, text });
  });
  return unique;
};

const createBadgeNode = (badge: AddressBadge) => {
  const badgeNode = document.createElement("span");
  badgeNode.className = `badge badge--${badge.tone || "neutral"}`;
  badgeNode.textContent = badge.text;
  badgeNode.title = badge.detailText || badge.metricText || badge.text;
  return badgeNode;
};

const createBadgeGroup = (titleText: string, badges: AddressBadge[], emptyText?: string) => {
  const group = document.createElement("section");
  group.className = "badge-group";

  const title = document.createElement("div");
  title.className = "badge-group-title";
  title.textContent = titleText;
  group.append(title);

  const cluster = document.createElement("div");
  cluster.className = "badge-cluster";
  const visibleBadges = dedupeBadges(badges);
  if (visibleBadges.length > 0) {
    visibleBadges.forEach((badge) => cluster.append(createBadgeNode(badge)));
  } else if (emptyText) {
    const empty = document.createElement("span");
    empty.className = "badge-empty";
    empty.textContent = emptyText;
    cluster.append(empty);
  }
  group.append(cluster);
  return group;
};

const getDetailBadgeGroups = (item: AddressSearchResult) => {
  const officialTags = dedupeBadges(item.hoverCard?.officialTags ?? []);
  const officialKeys = new Set(officialTags.map((badge) => makeBadgeKey(badge)));
  const aiTags = dedupeBadges(item.hoverCard?.aiTags ?? []).filter((badge) => !officialKeys.has(makeBadgeKey(badge)));
  const aiKeys = new Set(aiTags.map((badge) => makeBadgeKey(badge)));
  const statusTags = dedupeBadges(item.statusBadges ?? []);
  const statusKeys = new Set(statusTags.map((badge) => makeBadgeKey(badge)));
  const libraryTags = dedupeBadges([...(item.hoverBadges ?? []), ...(item.badges ?? [])]).filter((badge) => {
    const key = makeBadgeKey(badge);
    return !officialKeys.has(key) && !aiKeys.has(key) && !statusKeys.has(key);
  });

  return {
    officialTags: officialTags.length ? officialTags : libraryTags.slice(0, 4),
    aiTags,
    statusTags,
    libraryTags: officialTags.length ? libraryTags : libraryTags.slice(4)
  };
};

const setActiveResultRow = (row: HTMLElement | null) => {
  if (!resultsList) {
    return;
  }

  resultsList.querySelectorAll<HTMLElement>("[data-active='1']").forEach((item) => {
    item.dataset.active = "0";
  });

  if (row) {
    row.dataset.active = "1";
  }
};

const setHealth = (text: string, tone: "neutral" | "success" | "error") => {
  if (!healthPill) {
    return;
  }
  healthPill.textContent = text;
  healthPill.dataset.tone = tone;
};

const formatRuntimeStatus = (
  status?: PopupViewState["runtime"]["status"] | PageSurfaceState["runtimeStatus"]
) => {
  switch (status) {
    case "bootstrap":
      return "Bootstrap";
    case "wake":
      return "Waiting";
    case "ready":
      return "Ready";
    case "degraded":
      return "Degraded";
    case "disabled":
      return "Disabled";
    case "signed_out":
      return "Signed out";
    default:
      return "Idle";
  }
};

const formatSurfaceKind = (kind?: PageSurfaceState["surfaceKind"]) => {
  switch (kind) {
    case "market-main-holders":
      return "Main holders";
    case "feed-top-holders":
      return "Feed top holders";
    default:
      return "Unknown";
  }
};

const ensureSurfaceInfoSection = () => {
  const existing = document.querySelector<HTMLElement>("[data-surface-info='1']");
  if (existing) {
    return existing;
  }

  const section = document.createElement("section");
  section.dataset.surfaceInfo = "1";
  section.className = "surface-info";
  section.style.paddingBottom = "0.75rem";
  section.style.marginBottom = "0.75rem";
  section.style.borderBottom = "1px solid rgba(255,255,255,0.08)";
  section.innerHTML = `
    <p style="font-weight:600;margin-bottom:0.5rem;">Page Runtime</p>
    <div data-row="runtime"></div>
    <div data-row="status"></div>
    <div data-row="kind"></div>
    <div data-row="rows"></div>
    <div data-row="annotated"></div>
    <div data-row="degraded"></div>
    <div data-row="health"></div>
    <div data-row="updated"></div>
  `;

  Array.from(section.querySelectorAll<HTMLElement>("[data-row]")).forEach((row) => {
    row.style.display = "flex";
    row.style.justifyContent = "space-between";
    row.style.marginBottom = "0.25rem";
  });

  const labels: Record<string, string> = {
    runtime: "Runtime",
    status: "Surface",
    kind: "Kind",
    rows: "Rows",
    annotated: "Annotated",
    degraded: "Degraded",
    health: "Health",
    updated: "Updated"
  };

  Object.entries(labels).forEach(([key, label]) => {
    const row = section.querySelector<HTMLElement>(`[data-row="${key}"]`);
    if (!row) {
      return;
    }

    const left = document.createElement("span");
    left.textContent = label;
    left.style.opacity = "0.8";

    const right = document.createElement("span");
    right.dataset.value = key;
    right.style.fontWeight = "500";

    row.append(left, right);
  });

  sidepanelCard?.insertBefore(section, sidepanelCard.firstElementChild ?? null);
  return section;
};

const setSurfaceValue = (key: string, value: string) => {
  const node = ensureSurfaceInfoSection().querySelector<HTMLElement>(`[data-value="${key}"]`);
  if (node) {
    node.textContent = value;
  }
};

const formatSurfaceStatus = (state: PageSurfaceState) => {
  if (!state.surfaceFound) {
    return state.errorCode === "slug_missing" ? "Waiting for market" : "Waiting for holders";
  }

  if (!state.surfaceActive) {
    return state.errorCode === "panel_inactive" ? "Open holders panel" : "Waiting";
  }

  if (state.rowsAnnotated > 0) {
    return "Annotated";
  }

  if (state.errorCode === "fallback_list") {
    return "Fallback list";
  }

  return "Watching";
};

const renderSurfaceInfo = (state: PageSurfaceState | null) => {
  if (!state) {
    setSurfaceValue("runtime", "Waiting");
    setSurfaceValue("status", "No data");
    setSurfaceValue("kind", "Waiting");
    setSurfaceValue("rows", "Waiting");
    setSurfaceValue("annotated", "Waiting");
    setSurfaceValue("degraded", "Waiting");
    setSurfaceValue("health", "Waiting");
    setSurfaceValue("updated", "Waiting");
    return;
  }

  setSurfaceValue("runtime", formatRuntimeStatus(state.runtimeStatus));
  setSurfaceValue("status", formatSurfaceStatus(state));
  setSurfaceValue("kind", formatSurfaceKind(state.surfaceKind));
  setSurfaceValue("rows", String(state.rowsDetected));
  setSurfaceValue("annotated", String(state.rowsAnnotated));
  setSurfaceValue("degraded", state.fallbackMode ? "Yes" : "No");
  setSurfaceValue(
    "health",
    state.healthStatus === "ok"
      ? `OK${state.healthLabelsVersion ? ` · ${state.healthLabelsVersion}` : ""}`
      : state.healthStatus === "error"
        ? state.healthError || "Error"
        : state.healthStatus === "skipped"
          ? "Skipped"
          : "Waiting"
  );
  setSurfaceValue("updated", state.lastUpdatedAt ? new Date(state.lastUpdatedAt).toLocaleString() : "Waiting");
};

const renderState = (state: PopupViewState) => {
  if (memberLabel) {
    memberLabel.textContent = state.auth.memberLabel ?? "Not signed in";
  }

  if (toggleEnabledInput) {
    toggleEnabledInput.checked = state.config.enabled;
  }

  if (state.auth.status === "expired") {
    setHealth("Session expired", "error");
    if (syncLabel) {
      syncLabel.textContent = "Reconnect from the popup.";
    }
    return;
  }

  if (!state.auth.isAuthenticated) {
    setHealth("Not connected", "neutral");
    if (syncLabel) {
      syncLabel.textContent = "Sign in from the popup first.";
    }
    return;
  }

  if (!state.config.enabled) {
    setHealth("Disabled", "error");
    if (syncLabel) {
      syncLabel.textContent = "Enable runtime injection to annotate Polymarket.";
    }
    return;
  }

  if (state.sync.lastError || state.runtime.lastHealthUploadError) {
    setHealth("Degraded", "error");
    if (syncLabel) {
      syncLabel.textContent = state.runtime.lastHealthUploadError || state.sync.lastError || "Runtime degraded.";
    }
    return;
  }

  if (state.runtime.status === "bootstrap" || state.runtime.status === "wake") {
    setHealth(formatRuntimeStatus(state.runtime.status), "neutral");
  } else if (state.runtime.status === "degraded") {
    setHealth("Degraded", "error");
  } else {
    setHealth("Ready", "success");
  }

  if (syncLabel) {
    syncLabel.textContent =
      state.runtime.detail?.trim() ||
      (state.sync.lastSyncAt
        ? `Last sync ${new Date(state.sync.lastSyncAt).toLocaleString()}`
        : "Connected and waiting for page activity.");
  }
};

const hydrateStoredState = async () => {
  const [state, surfaceState] = await Promise.all([readStoredPopupState(), readStoredPageSurfaceState()]);
  renderState(state);
  renderSurfaceInfo(surfaceState);
  return {
    state,
    surfaceState
  };
};

const openDetail = (item: AddressSearchResult, row?: HTMLElement) => {
  if (!resultDetail || !resultDetailInner) {
    return;
  }

  const briefShort =
    item.aiBriefShort ||
    item.hoverCard?.aiBriefShortText ||
    item.strategyFocus ||
    item.noteSnippet ||
    item.bio ||
    item.teamNote ||
    "暂无摘要。";
  const briefNote =
    item.aiBriefNote ||
    item.hoverCard?.aiNarrativeNoteText ||
    item.hoverCard?.aiStatsNoteText ||
    item.noteSnippet ||
    item.bio ||
    item.teamNote ||
    "";
  const deepNote = item.aiDeepNote || item.hoverCard?.aiDeepNoteText || "";
  const badgeGroups = getDetailBadgeGroups(item);

  setActiveResultRow(row ?? resultsList?.querySelector<HTMLElement>(`[data-result-key="${item.normalizedAddress}"]`) ?? null);
  resultDetail.hidden = false;
  clearNode(resultDetailInner);

  const header = document.createElement("div");
  header.className = "result-detail-head";

  const titleWrap = document.createElement("div");
  const title = document.createElement("div");
  title.className = "result-detail-title";
  title.textContent = item.alias?.trim() || item.displayName || item.address;

  const address = document.createElement("div");
  address.className = "result-address";
  address.textContent = item.address;
  titleWrap.append(title, address);

  const closeButton = document.createElement("button");
  closeButton.type = "button";
  closeButton.className = "result-detail-close";
  closeButton.setAttribute("aria-label", "关闭详情");
  closeButton.textContent = "×";
  closeButton.addEventListener("click", () => {
    resultDetail.hidden = true;
    clearNode(resultDetailInner);
    setActiveResultRow(null);
  });
  header.append(titleWrap, closeButton);

  const briefShortEl = document.createElement("div");
  briefShortEl.className = "result-brief-short";
  briefShortEl.textContent = briefShort;

  const tagsBlock = document.createElement("div");
  tagsBlock.className = "result-tag-groups";
  tagsBlock.append(
    createBadgeGroup("结构化标签", badgeGroups.officialTags, "暂无结构化标签"),
    createBadgeGroup("AI 标签", badgeGroups.aiTags, "暂无 AI 标签")
  );
  if (badgeGroups.statusTags.length > 0) {
    tagsBlock.append(createBadgeGroup("状态", badgeGroups.statusTags));
  }
  if (badgeGroups.libraryTags.length > 0) {
    tagsBlock.append(createBadgeGroup("补充标签", badgeGroups.libraryTags));
  }

  const noteToggle = document.createElement("details");
  noteToggle.className = "result-note";
  noteToggle.open = Boolean(briefNote) && !deepNote;
  const noteSummary = document.createElement("summary");
  noteSummary.textContent = "AI 摘要说明";
  const noteText = document.createElement("div");
  noteText.className = "result-brief-note";
  noteText.textContent = briefNote || "暂无摘要说明。";
  noteToggle.append(noteSummary, noteText);

  const deepToggle = document.createElement("details");
  deepToggle.className = "result-note result-note-deep";
  deepToggle.open = false;
  const deepSummary = document.createElement("summary");
  deepSummary.textContent = "深度解读";
  const deepText = document.createElement("div");
  deepText.className = "result-deep-note";
  deepText.textContent = deepNote || "暂无深度解读。";
  deepToggle.append(deepSummary, deepText);

  const link = createSafeExternalLink(item.detailUrl, "后台详情");
  const detailNodes: HTMLElement[] = [header, briefShortEl, tagsBlock, noteToggle];
  if (deepNote) {
    detailNodes.push(deepToggle);
  } else {
    const emptyDeepNote = document.createElement("div");
    emptyDeepNote.className = "result-empty-note";
    emptyDeepNote.textContent = "Finder 还没有同步深度解读。";
    detailNodes.push(emptyDeepNote);
  }
  if (!link.hidden) {
    detailNodes.push(link);
  }

  resultDetailInner.append(...detailNodes);
  resultDetail.scrollIntoView({ block: "nearest" });
};

const renderResults = (items: AddressSearchResult[]) => {
  if (!resultsList || !resultsMeta) {
    return;
  }

  if (items.length === 0) {
    resultsMeta.textContent = "No matching wallets found.";
    clearNode(resultsList);
    if (resultDetail && resultDetailInner) {
      resultDetail.hidden = true;
      clearNode(resultDetailInner);
    }
    return;
  }

  resultsMeta.textContent = `Found ${items.length} result(s).`;
  clearNode(resultsList);
  if (resultDetail && resultDetailInner) {
    resultDetail.hidden = true;
    clearNode(resultDetailInner);
  }

  items.forEach((item) => {
    const row = document.createElement("li");
    row.className = "result-card";
    row.dataset.resultKey = item.normalizedAddress;
    row.tabIndex = 0;

    const openButton = document.createElement("button");
    openButton.type = "button";
    openButton.className = "result-open";
    openButton.textContent = "解读";
    openButton.title = "查看扩展内详情";

    const head = document.createElement("div");
    head.className = "result-head";

    const name = document.createElement("div");
    name.className = "result-name";
    name.textContent = item.alias?.trim() || item.displayName || item.address;

    const link = createSafeExternalLink(item.detailUrl, "后台");
    head.append(name, link);

    const address = document.createElement("div");
    address.className = "result-address";
    address.textContent = item.address;

    const copy = document.createElement("div");
    copy.className = "result-copy";
    copy.textContent = truncateText(
      item.aiBriefShort ||
        item.hoverCard?.aiBriefShortText ||
        item.strategyFocus ||
        item.hoverCard?.aiNarrativeNoteText ||
        item.noteSnippet ||
        item.bio ||
        item.teamNote ||
        "No summary yet.",
      140
    );

    const badgeCluster = document.createElement("div");
    badgeCluster.className = "badge-cluster";
    dedupeBadges([...(item.hoverBadges ?? []), ...(item.badges ?? []), ...(item.statusBadges ?? [])])
      .slice(0, 5)
      .forEach((badge) => {
        badgeCluster.append(createBadgeNode(badge));
      });

    const deepHint = document.createElement("div");
    deepHint.className = "result-ai-hint";
    deepHint.textContent =
      item.aiDeepNote || item.hoverCard?.aiDeepNoteText ? "含深度解读，点击查看" : "点击查看摘要与标签";

    row.append(openButton, head, address, copy, badgeCluster, deepHint);

    openButton.addEventListener("click", (event) => {
      event.stopPropagation();
      openDetail(item, row);
    });
    link.addEventListener("click", (event) => {
      event.stopPropagation();
    });
    row.addEventListener("click", () => openDetail(item, row));
    row.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openDetail(item, row);
      }
    });

    resultsList.append(row);
  });
};

const openFocusedAddress = async (focus: SidePanelFocusTarget | null | undefined) => {
  const address = compactText(focus?.normalizedAddress || focus?.address);
  if (!address) {
    return;
  }

  const focusToken = `${address}:${focus?.requestedAt ?? ""}`;
  if (focusToken === lastHandledFocusToken) {
    return;
  }
  lastHandledFocusToken = focusToken;

  if (searchInput) {
    searchInput.value = address;
  }
  if (resultsMeta) {
    resultsMeta.textContent = "正在打开当前地址详情...";
  }
  if (resultsList) {
    clearNode(resultsList);
  }

  try {
    const items = await sendExtensionMessage<AddressSearchResult[]>({
      type: "wsm:lookupAddresses",
      addresses: [address]
    });
    renderResults(items);
    const matched =
      items.find((item) => item.normalizedAddress.toLowerCase() === address.toLowerCase()) ?? items[0];
    if (matched) {
      openDetail(matched);
      if (resultsMeta) {
        resultsMeta.textContent = "已打开扩展内详情。";
      }
    } else if (resultsMeta) {
      resultsMeta.textContent = "这个地址暂未在 Smart Pro 地址库中找到。";
    }
  } catch (error) {
    console.error("sidepanel focus lookup", error);
    if (resultsMeta) {
      resultsMeta.textContent = "打开地址详情失败，请稍后重试。";
    }
  }
};

const openStoredFocusTarget = async () => {
  const stored = await chrome.storage.local.get(SIDEPANEL_FOCUS_KEY);
  await openFocusedAddress(stored[SIDEPANEL_FOCUS_KEY] as SidePanelFocusTarget | undefined);
};

const refreshSurfaceInfo = async () => {
  try {
    const payload = await sendExtensionMessage<PageSurfaceState | null>({ type: "wsm:getPageSurfaceState" });
    renderSurfaceInfo(payload ?? null);
  } catch (error) {
    console.error("surface info fetch", error);
    try {
      renderSurfaceInfo(await readStoredPageSurfaceState());
    } catch (fallbackError) {
      console.error("surface info storage fallback", fallbackError);
      renderSurfaceInfo(null);
    }
  }
};

const refreshState = async () => {
  try {
    const state = await sendExtensionMessage<PopupViewState>({ type: "wsm:getPopupState" });
    renderState(state);
    await refreshSurfaceInfo();
  } catch (error) {
    console.error(error);
    try {
      const fallback = await hydrateStoredState();
      if (!fallback.state.auth.isAuthenticated && syncLabel) {
        syncLabel.textContent = "Waiting for background runtime to wake up.";
      }
    } catch (fallbackError) {
      console.error("sidepanel storage fallback", fallbackError);
      setHealth("Read failed", "error");
      if (syncLabel) {
        syncLabel.textContent = "Unable to read extension state.";
      }
    }
  }
};

const refreshCurrentTabAnnotations = async () => {
  try {
    await sendExtensionMessage({ type: "wsm:refreshActiveTab" });
  } catch (error) {
    console.error(error);
  }
};

const runSearch = async () => {
  const query = searchInput?.value.trim() ?? "";
  if (!query) {
    if (resultsMeta) {
      resultsMeta.textContent = "Search by wallet, alias, or strategy note.";
    }
    if (resultsList) {
      clearNode(resultsList);
    }
    if (resultDetail && resultDetailInner) {
      resultDetail.hidden = true;
      clearNode(resultDetailInner);
    }
    return;
  }

  if (resultsMeta) {
    resultsMeta.textContent = "Searching...";
  }

  try {
    const items = await sendExtensionMessage<AddressSearchResult[]>({
      type: "wsm:searchAddresses",
      query,
      limit: 12
    });
    renderResults(items);
  } catch (error) {
    console.error(error);
    if (resultsMeta) {
      resultsMeta.textContent = "Search failed. Try again later.";
    }
  }
};

toggleEnabledInput?.addEventListener("change", () => {
  void sendExtensionMessage<{ state?: PopupViewState }>({
    type: "wsm:updateConfig",
    patch: { enabled: Boolean(toggleEnabledInput.checked) }
  })
    .then(async (payload) => {
      if (payload.state) {
        renderState(payload.state);
      }
      await refreshCurrentTabAnnotations();
      await refreshSurfaceInfo();
    })
    .catch((error) => {
      console.error(error);
      setHealth("Update failed", "error");
      if (syncLabel) {
        syncLabel.textContent = "Failed to update runtime settings.";
      }
    });
});

refreshButton?.addEventListener("click", () => {
  void refreshCurrentTabAnnotations().finally(() => {
    void refreshState();
  });
});

searchInput?.addEventListener("input", () => {
  if (searchTimer) {
    window.clearTimeout(searchTimer);
  }
  searchTimer = window.setTimeout(() => {
    void runSearch();
  }, 180);
});

openWorkbenchButton?.addEventListener("click", () => {
  void sendExtensionMessage({ type: "wsm:openWorkbench" }).catch((error) => {
    console.error(error);
    setHealth("Open failed", "error");
    if (syncLabel) {
      syncLabel.textContent = "Unable to open workbench.";
    }
  });
});

openPolymarketButton?.addEventListener("click", () => {
  void sendExtensionMessage({ type: "wsm:openPolymarket" }).catch((error) => {
    console.error(error);
    setHealth("Open failed", "error");
    if (syncLabel) {
      syncLabel.textContent = "Unable to open Polymarket.";
    }
  });
});

const startSurfaceInfoPoll = () => {
  if (surfaceRefreshTimer) {
    window.clearInterval(surfaceRefreshTimer);
  }
  surfaceRefreshTimer = window.setInterval(() => {
    void refreshSurfaceInfo();
  }, 30_000);
};

chrome.storage.onChanged.addListener((changes: Record<string, ExtensionStorageChange>, areaName: string) => {
  if (areaName === "local" && SIDEPANEL_FOCUS_KEY in changes) {
    void openFocusedAddress(changes[SIDEPANEL_FOCUS_KEY]?.newValue as SidePanelFocusTarget | undefined);
  }

  if (!hasRelevantStorageChange(changes, areaName)) {
    return;
  }

  void hydrateStoredState().catch((error) => {
    console.error("sidepanel storage sync", error);
  });
});

void hydrateStoredState()
  .catch((error) => {
    console.error("sidepanel initial storage", error);
  })
  .finally(() => {
    void refreshState();
    void openStoredFocusTarget();
  });
startSurfaceInfoPoll();

export {};
