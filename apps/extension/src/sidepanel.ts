import {
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
  badges: Array<{ id: string; text: string; tone: string }>;
  hoverBadges?: Array<{ id: string; text: string; tone: string }>;
  statusBadges?: Array<{ id: string; text: string; tone: string }>;
  hoverCard?: {
    officialTags: Array<{ id: string; text: string; tone: string }>;
    officialNoteText?: string;
    aiTags: Array<{ id: string; text: string; tone: string }>;
    aiBriefShortText?: string;
    aiStatsNoteText?: string;
    aiNarrativeNoteText?: string;
    aiDeepNoteText?: string;
  };
  noteSnippet?: string;
  aiDeepNote?: string;
  watchlisted: boolean;
  detailUrl: string;
  updatedAt: string;
  version: string;
  bio?: string;
  strategyFocus?: string;
  teamNote?: string;
}

const healthPill = document.querySelector<HTMLElement>("#health-pill");
const memberLabel = document.querySelector<HTMLElement>("#member-label");
const syncLabel = document.querySelector<HTMLElement>("#sync-label");
const toggleEnabledInput = document.querySelector<HTMLInputElement>("#toggle-enabled");
const refreshButton = document.querySelector<HTMLButtonElement>("#refresh-button");
const searchInput = document.querySelector<HTMLInputElement>("#search-input");
const resultsMeta = document.querySelector<HTMLElement>("#results-meta");
const resultsList = document.querySelector<HTMLElement>("#results-list");
const openWorkbenchButton = document.querySelector<HTMLButtonElement>("#open-workbench-button");
const openPolymarketButton = document.querySelector<HTMLButtonElement>("#open-polymarket-button");
const sidepanelCard = document.querySelector<HTMLElement>(".sidepanel-card");

let searchTimer: number | null = null;
let surfaceRefreshTimer: number | null = null;

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

const renderResults = (items: AddressSearchResult[]) => {
  if (!resultsList || !resultsMeta) {
    return;
  }

  if (items.length === 0) {
    resultsMeta.textContent = "No matching wallets found.";
    resultsList.innerHTML = "";
    return;
  }

  resultsMeta.textContent = `Found ${items.length} result(s).`;
  resultsList.innerHTML = "";

  items.forEach((item) => {
    const row = document.createElement("li");
    row.className = "result-card";
    row.innerHTML = `
      <div class="result-head">
        <div class="result-name">${item.alias?.trim() || item.displayName || item.address}</div>
        <a class="result-link" href="${item.detailUrl}" target="_blank" rel="noreferrer">Workbench</a>
      </div>
      <div class="result-address">${item.address}</div>
      <div class="result-copy">${
        item.hoverCard?.aiBriefShortText ||
        item.strategyFocus ||
        item.hoverCard?.aiNarrativeNoteText ||
        item.noteSnippet ||
        item.bio ||
        item.teamNote ||
        "No summary yet."
      }</div>
      ${
        item.aiDeepNote || item.hoverCard?.aiDeepNoteText
          ? `<div class="result-copy">${item.aiDeepNote || item.hoverCard?.aiDeepNoteText}</div>`
          : ""
      }
      <div class="badge-cluster"></div>
    `;

    const badgeCluster = row.querySelector<HTMLElement>(".badge-cluster");
    item.badges.slice(0, 4).forEach((badge) => {
      const badgeNode = document.createElement("span");
      badgeNode.className = "badge";
      badgeNode.textContent = badge.text;
      badgeCluster?.append(badgeNode);
    });

    resultsList.append(row);
  });
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
      resultsList.innerHTML = "";
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
  });
startSurfaceInfoPoll();

export {};
