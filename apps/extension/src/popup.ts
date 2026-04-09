interface PopupViewState {
  runtimeConfig: {
    mode: "dev" | "release";
    backendBaseUrl: string;
    adminBaseUrl: string;
    workbenchPath: string;
    showDebugControls: boolean;
    privacyPolicyUrl?: string;
  };
  config: {
    enabled: boolean;
    debugMode: boolean;
  };
  auth: {
    status: "connected" | "signed_out" | "expired";
    isAuthenticated: boolean;
    memberLabel?: string;
    expiresAt?: string;
    refreshExpiresAt?: string;
  };
  sync: {
    lastSyncAt?: string;
    lastError?: string;
  };
  runtime: {
    status: "idle" | "bootstrap" | "wake" | "ready" | "degraded" | "disabled" | "signed_out";
    detail?: string;
    lastEventAt: string;
    lastBootstrapAt?: string;
    lastWakeAt?: string;
    lastReadyAt?: string;
    lastDegradedAt?: string;
    lastHealthAt?: string;
    lastHealthUploadAt?: string;
    lastHealthUploadError?: string;
    lastLabelsVersion?: string;
  };
}

const loginForm = document.querySelector<HTMLFormElement>("#login-form");
const inviteInput = document.querySelector<HTMLInputElement>("#invite-code");
const loginButton = document.querySelector<HTMLButtonElement>("#login-button");
const sessionPanel = document.querySelector<HTMLElement>("#session-panel");
const sessionMember = document.querySelector<HTMLElement>("#session-member");
const sessionStatus = document.querySelector<HTMLElement>("#session-status");
const runtimeTarget = document.querySelector<HTMLElement>("#runtime-target");
const expiresAtNode = document.querySelector<HTMLElement>("#expires-at");
const refreshExpiresAtNode = document.querySelector<HTMLElement>("#refresh-expires-at");
const lastSyncNode = document.querySelector<HTMLElement>("#last-sync");
const backendOriginNode = document.querySelector<HTMLElement>("#backend-origin");
const openWorkbenchButton = document.querySelector<HTMLButtonElement>("#open-workbench-button");
const openSidePanelButton = document.querySelector<HTMLButtonElement>("#open-sidepanel-button");
const openPolymarketButton = document.querySelector<HTMLButtonElement>("#open-polymarket-button");
const refreshStateButton = document.querySelector<HTMLButtonElement>("#refresh-state-button");
const logoutButton = document.querySelector<HTMLButtonElement>("#logout-button");
const toggleEnabledInput = document.querySelector<HTMLInputElement>("#toggle-enabled");
const toggleDebugInput = document.querySelector<HTMLInputElement>("#toggle-debug");
const debugControls = document.querySelector<HTMLElement>("#debug-controls");
const statusText = document.querySelector<HTMLElement>("#status-text");
const privacyLink = document.querySelector<HTMLAnchorElement>("#privacy-link");

let currentState: PopupViewState | null = null;

const sendMessage = <T = unknown>(message: unknown): Promise<T> =>
  new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response: { ok?: boolean; error?: string; payload?: T }) => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
        return;
      }

      if (response?.ok === false) {
        reject(new Error(response.error ?? "unknown"));
        return;
      }

      resolve((response as { payload?: T }).payload ?? (response as T));
    });
  });

const formatTimestamp = (value?: string, fallback = "Not synced yet") =>
  value ? new Date(value).toLocaleString() : fallback;

const setStatus = (text: string, tone: "neutral" | "success" | "error" = "neutral") => {
  if (!statusText) {
    return;
  }

  statusText.textContent = text;
  statusText.dataset.tone = tone;
};

const setBusy = (value: boolean) => {
  loginButton?.toggleAttribute("disabled", value);
  refreshStateButton?.toggleAttribute("disabled", value);
  openWorkbenchButton?.toggleAttribute("disabled", value || !currentState);
  openSidePanelButton?.toggleAttribute("disabled", value || !currentState);
  openPolymarketButton?.toggleAttribute("disabled", value || !currentState);
  logoutButton?.toggleAttribute("disabled", value || !currentState?.auth.isAuthenticated);
};

const formatRuntimeStatus = (status: PopupViewState["runtime"]["status"]) => {
  switch (status) {
    case "bootstrap":
      return "Bootstrap";
    case "wake":
      return "Wake";
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

const renderHealth = (state: PopupViewState) => {
  if (state.auth.status === "expired") {
    setStatus("Session expired", "error");
    return;
  }

  if (!state.auth.isAuthenticated) {
    setStatus("Not connected", "neutral");
    return;
  }

  if (!state.config.enabled) {
    setStatus("Runtime disabled", "error");
    return;
  }

  if (state.runtime.status === "degraded" || state.sync.lastError || state.runtime.lastHealthUploadError) {
    setStatus("Needs attention", "error");
    return;
  }

  if (state.runtime.status === "ready") {
    setStatus("Runtime ready", "success");
    return;
  }

  if (state.runtime.status === "bootstrap" || state.runtime.status === "wake") {
    setStatus(formatRuntimeStatus(state.runtime.status), "neutral");
    return;
  }

  setStatus("Connected", "success");
};

const renderRuntimeSummary = (state: PopupViewState) => {
  if (!runtimeTarget) {
    return;
  }

  const parts = [formatRuntimeStatus(state.runtime.status)];
  if (state.runtime.detail?.trim()) {
    parts.push(state.runtime.detail.trim());
  }
  if (state.runtime.lastLabelsVersion?.trim()) {
    parts.push(`Labels ${state.runtime.lastLabelsVersion.trim()}`);
  }
  runtimeTarget.textContent = parts.join(" · ");
};

const applyState = (state: PopupViewState) => {
  currentState = state;
  renderRuntimeSummary(state);

  if (backendOriginNode) {
    backendOriginNode.textContent = state.runtimeConfig.backendBaseUrl;
  }

  if (privacyLink) {
    privacyLink.href =
      state.runtimeConfig.privacyPolicyUrl ??
      new URL("/extension/privacy", state.runtimeConfig.adminBaseUrl).toString();
  }

  sessionPanel?.classList.toggle("hidden", !state.auth.isAuthenticated);
  loginForm?.classList.toggle("hidden", state.auth.isAuthenticated);

  if (sessionMember) {
    sessionMember.textContent = state.auth.memberLabel ?? "Not signed in";
  }

  if (sessionStatus) {
    sessionStatus.textContent =
      state.auth.status === "connected"
        ? "Connected"
        : state.auth.status === "expired"
          ? "Expired"
          : "Signed out";
  }

  if (expiresAtNode) {
    expiresAtNode.textContent = formatTimestamp(state.auth.expiresAt, "Waiting for token");
  }

  if (refreshExpiresAtNode) {
    refreshExpiresAtNode.textContent = formatTimestamp(state.auth.refreshExpiresAt, "Not issued");
  }

  if (lastSyncNode) {
    const healthStamp = state.runtime.lastHealthUploadAt ?? state.runtime.lastHealthAt;
    lastSyncNode.textContent = formatTimestamp(state.sync.lastSyncAt ?? healthStamp);
  }

  if (toggleEnabledInput) {
    toggleEnabledInput.checked = state.config.enabled;
  }

  if (toggleDebugInput) {
    toggleDebugInput.checked = state.config.debugMode;
  }

  debugControls?.classList.toggle("hidden", !state.runtimeConfig.showDebugControls);
  renderHealth(state);
};

const refreshState = async (options?: { silent?: boolean }) => {
  if (!options?.silent) {
    setStatus("Reading runtime state...", "neutral");
  }

  setBusy(true);
  try {
    const payload = await sendMessage<PopupViewState>({ type: "wsm:getPopupState" });
    applyState(payload);
  } catch (error) {
    console.error("popup state", error);
    setStatus("Failed to read state", "error");
  } finally {
    setBusy(false);
  }
};

const refreshCurrentTabAnnotations = async () => {
  try {
    await sendMessage({ type: "wsm:refreshActiveTab" });
  } catch (error) {
    console.error("refresh active tab", error);
  }
};

const openSidePanelDirect = async () => {
  if (!chrome.sidePanel?.open) {
    await sendMessage({ type: "wsm:openWorkbench" });
    return;
  }

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const currentWindow = await chrome.windows.getCurrent();
  try {
    if (tab?.id) {
      await chrome.sidePanel.setOptions({
        tabId: tab.id,
        path: "sidepanel.html",
        enabled: true
      });

      try {
        await chrome.sidePanel.open({ tabId: tab.id });
        return;
      } catch (error) {
        if (typeof tab.windowId === "number") {
          await chrome.sidePanel.open({ windowId: tab.windowId });
          return;
        }
        throw error;
      }
    }

    if (typeof currentWindow.id === "number") {
      await chrome.sidePanel.open({ windowId: currentWindow.id });
      return;
    }
  } catch (error) {
    console.warn("open side panel direct failed, falling back to background", error);
  }

  await sendMessage({ type: "wsm:openSidePanel" });
};

const openOrFocusPolymarket = async () => {
  await sendMessage({ type: "wsm:openPolymarket" });
};

const handleLogin = async (event: SubmitEvent) => {
  event.preventDefault();
  const inviteCode = inviteInput?.value.trim();
  if (!inviteCode) {
    setStatus("Invite code required", "error");
    return;
  }

  setBusy(true);
  setStatus("Connecting session...", "neutral");
  try {
    await sendMessage({
      type: "wsm:authExchange",
      inviteCode
    });
    if (inviteInput) {
      inviteInput.value = "";
    }
    await refreshState({ silent: true });
    setStatus("Connected", "success");
  } catch (error) {
    console.error("auth exchange", error);
    setStatus("Failed to connect", "error");
  } finally {
    setBusy(false);
  }
};

const handleLogout = async () => {
  setBusy(true);
  setStatus("Signing out...", "neutral");
  try {
    await sendMessage({ type: "wsm:logout" });
    await refreshState({ silent: true });
    setStatus("Signed out", "neutral");
  } catch (error) {
    console.error("logout", error);
    setStatus("Failed to sign out", "error");
  } finally {
    setBusy(false);
  }
};

const updateConfig = async (patch: { enabled?: boolean; debugMode?: boolean }) => {
  try {
    const payload = await sendMessage<{ state?: PopupViewState }>({
      type: "wsm:updateConfig",
      patch
    });

    if (payload.state) {
      applyState(payload.state);
    } else {
      await refreshState({ silent: true });
    }
  } catch (error) {
    console.error("update config", error);
    setStatus("Failed to save settings", "error");
  }
};

loginForm?.addEventListener("submit", handleLogin);
logoutButton?.addEventListener("click", handleLogout);
openWorkbenchButton?.addEventListener("click", () => {
  void sendMessage({ type: "wsm:openWorkbench" }).catch((error) => {
    console.error(error);
    setStatus("Failed to open workbench", "error");
  });
});
openSidePanelButton?.addEventListener("click", () => {
  void openSidePanelDirect().catch((error) => {
    console.error(error);
    setStatus("Failed to open side panel", "error");
  });
});
openPolymarketButton?.addEventListener("click", () => {
  void openOrFocusPolymarket().catch((error) => {
    console.error(error);
    setStatus("Failed to open Polymarket", "error");
  });
});
refreshStateButton?.addEventListener("click", () => {
  void refreshCurrentTabAnnotations().finally(() => {
    void refreshState();
  });
});
toggleEnabledInput?.addEventListener("change", () => {
  void updateConfig({ enabled: Boolean(toggleEnabledInput.checked) });
});
toggleDebugInput?.addEventListener("change", () => {
  void updateConfig({ debugMode: Boolean(toggleDebugInput.checked) });
});

void refreshState();

export {};
