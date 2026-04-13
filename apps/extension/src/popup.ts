import {
  type ExtensionStorageChange,
  type PopupViewState,
  hasRelevantStorageChange,
  readStoredPopupState,
  sendExtensionMessage
} from "./ui-state.js";

const loginForm = document.querySelector<HTMLFormElement>("#login-form");
const emailInput = document.querySelector<HTMLInputElement>("#email");
const passwordInput = document.querySelector<HTMLInputElement>("#password");
const inviteInput = document.querySelector<HTMLInputElement>("#invite-code");
const loginButton = document.querySelector<HTMLButtonElement>("#login-button");
const sessionPanel = document.querySelector<HTMLElement>("#session-panel");
const sessionEmail = document.querySelector<HTMLElement>("#session-email");
const sessionMember = document.querySelector<HTMLElement>("#session-member");
const sessionInvite = document.querySelector<HTMLElement>("#session-invite");
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

const formatTimestamp = (value?: string, fallback = "暂无") =>
  value ? new Date(value).toLocaleString() : fallback;

const setStatus = (text: string, tone: "neutral" | "success" | "error" = "neutral") => {
  if (!statusText) {
    return;
  }

  statusText.textContent = text;
  statusText.dataset.tone = tone;
};

const setBusy = (value: boolean) => {
  emailInput?.toggleAttribute("disabled", value);
  passwordInput?.toggleAttribute("disabled", value);
  inviteInput?.toggleAttribute("disabled", value);
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
      return "初始化中";
    case "wake":
      return "唤醒中";
    case "ready":
      return "已就绪";
    case "degraded":
      return "降级运行";
    case "disabled":
      return "已停用";
    case "signed_out":
      return "未登录";
    default:
      return "空闲";
  }
};

const syncLoginButtonLabel = () => {
  if (!loginButton) {
    return;
  }

  const hasInvite = Boolean(inviteInput?.value.trim());
  loginButton.textContent = hasInvite ? "登录并绑定账户" : "登录账户";
};

const renderHealth = (state: PopupViewState) => {
  if (state.auth.status === "expired") {
    setStatus("登录已过期", "error");
    return;
  }

  if (!state.auth.isAuthenticated) {
    setStatus("未登录", "neutral");
    return;
  }

  if (!state.config.enabled) {
    setStatus("标注已停用", "error");
    return;
  }

  if (state.runtime.status === "degraded" || state.sync.lastError || state.runtime.lastHealthUploadError) {
    setStatus("需要处理", "error");
    return;
  }

  if (state.runtime.status === "ready") {
    setStatus("运行正常", "success");
    return;
  }

  if (state.runtime.status === "bootstrap" || state.runtime.status === "wake") {
    setStatus(formatRuntimeStatus(state.runtime.status), "neutral");
    return;
  }

  setStatus("已连接", "success");
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
    parts.push(`标签 ${state.runtime.lastLabelsVersion.trim()}`);
  }
  runtimeTarget.textContent = parts.join(" · ");
};

const applyState = (state: PopupViewState) => {
  currentState = state;
  renderRuntimeSummary(state);
  syncLoginButtonLabel();

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

  if (sessionEmail) {
    sessionEmail.textContent = state.auth.userEmail ?? "未登录";
  }

  if (sessionMember) {
    sessionMember.textContent = state.auth.memberLabel ?? "未登录";
  }

  if (sessionInvite) {
    sessionInvite.textContent = state.auth.inviteCode ?? "未绑定";
  }

  if (sessionStatus) {
    sessionStatus.textContent =
      state.auth.status === "connected"
        ? "已连接"
        : state.auth.status === "expired"
          ? "已过期"
          : "未登录";
  }

  if (expiresAtNode) {
    expiresAtNode.textContent = formatTimestamp(state.auth.expiresAt, "等待签发");
  }

  if (refreshExpiresAtNode) {
    refreshExpiresAtNode.textContent = formatTimestamp(state.auth.refreshExpiresAt, "未签发");
  }

  if (lastSyncNode) {
    const healthStamp = state.runtime.lastHealthUploadAt ?? state.runtime.lastHealthAt;
    lastSyncNode.textContent = formatTimestamp(state.sync.lastSyncAt ?? healthStamp, "尚未同步");
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

const hydrateStoredState = async () => {
  const state = await readStoredPopupState();
  applyState(state);
  return state;
};

const refreshState = async (options?: { silent?: boolean }) => {
  if (!options?.silent) {
    setStatus("正在读取运行状态...", "neutral");
  }

  setBusy(true);
  try {
    const payload = await sendExtensionMessage<PopupViewState>({ type: "wsm:getPopupState" });
    applyState(payload);
  } catch (error) {
    console.error("popup state", error);
    try {
      const fallbackState = await hydrateStoredState();
      renderHealth(fallbackState);
    } catch (fallbackError) {
      console.error("popup storage fallback", fallbackError);
      setStatus("读取状态失败", "error");
    }
  } finally {
    setBusy(false);
  }
};

const refreshCurrentTabAnnotations = async () => {
  try {
    await sendExtensionMessage({ type: "wsm:refreshActiveTab" });
  } catch (error) {
    console.error("refresh active tab", error);
  }
};

const openSidePanelDirect = async () => {
  if (!chrome.sidePanel?.open) {
    await sendExtensionMessage({ type: "wsm:openWorkbench" });
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

  await sendExtensionMessage({ type: "wsm:openSidePanel" });
};

const openOrFocusPolymarket = async () => {
  await sendExtensionMessage({ type: "wsm:openPolymarket" });
};

const handleLogin = async (event: SubmitEvent) => {
  event.preventDefault();

  const email = emailInput?.value.trim() ?? "";
  const password = passwordInput?.value ?? "";
  const inviteCode = inviteInput?.value.trim() || undefined;

  if (!email) {
    setStatus("请输入邮箱", "error");
    return;
  }

  if (!password) {
    setStatus("请输入密码", "error");
    return;
  }

  setBusy(true);
  setStatus(inviteCode ? "正在登录并绑定邀请码..." : "正在登录...", "neutral");
  try {
    const payload = await sendExtensionMessage<{ state?: PopupViewState }>({
      type: "wsm:authLogin",
      email,
      password,
      inviteCode
    });

    if (passwordInput) {
      passwordInput.value = "";
    }
    if (inviteInput) {
      inviteInput.value = "";
    }
    syncLoginButtonLabel();

    if (payload.state) {
      applyState(payload.state);
    } else {
      await hydrateStoredState();
    }
    setStatus("登录成功", "success");
  } catch (error) {
    console.error("auth login", error);
    setStatus(error instanceof Error ? error.message : "登录失败", "error");
  } finally {
    setBusy(false);
  }
};

const handleLogout = async () => {
  setBusy(true);
  setStatus("正在退出登录...", "neutral");
  try {
    const payload = await sendExtensionMessage<{ state?: PopupViewState }>({ type: "wsm:logout" });
    if (payload.state) {
      applyState(payload.state);
    } else {
      await hydrateStoredState();
    }
    setStatus("已退出登录", "neutral");
  } catch (error) {
    console.error("logout", error);
    setStatus("退出失败", "error");
  } finally {
    setBusy(false);
  }
};

const updateConfig = async (patch: { enabled?: boolean; debugMode?: boolean }) => {
  try {
    const payload = await sendExtensionMessage<{ state?: PopupViewState }>({
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
    setStatus("保存设置失败", "error");
  }
};

loginForm?.addEventListener("submit", handleLogin);
inviteInput?.addEventListener("input", syncLoginButtonLabel);
logoutButton?.addEventListener("click", handleLogout);
openWorkbenchButton?.addEventListener("click", () => {
  void sendExtensionMessage({ type: "wsm:openWorkbench" }).catch((error) => {
    console.error(error);
    setStatus("打开后台失败", "error");
  });
});
openSidePanelButton?.addEventListener("click", () => {
  void openSidePanelDirect().catch((error) => {
    console.error(error);
    setStatus("打开侧边面板失败", "error");
  });
});
openPolymarketButton?.addEventListener("click", () => {
  void openOrFocusPolymarket().catch((error) => {
    console.error(error);
    setStatus("打开 Polymarket 失败", "error");
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

chrome.storage.onChanged.addListener((changes: Record<string, ExtensionStorageChange>, areaName: string) => {
  if (!hasRelevantStorageChange(changes, areaName)) {
    return;
  }

  void hydrateStoredState().catch((error) => {
    console.error("popup storage sync", error);
  });
});

void hydrateStoredState()
  .catch((error) => {
    console.error("popup initial storage", error);
  })
  .finally(() => {
    syncLoginButtonLabel();
    void refreshState();
  });

export {};
