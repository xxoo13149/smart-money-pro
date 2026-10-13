"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import type {
  WalletAdminRow,
  WalletListPanelMode,
  WalletListQuery,
  WalletListResponse,
  WalletStatusBadge
} from "@weather-smart-money/core";
import { getLabelKindTone } from "@weather-smart-money/core";

import type { WalletDetailData } from "../lib/data";
import { stringifyWalletListQuery } from "../lib/wallets-query";
import { AppLink } from "./AppLink";
import { Modal } from "./Modal";
import { WalletCreateForm } from "./WalletCreateForm";
import { WalletDigestCard } from "./WalletDigestCard";
import { WalletInspectorDigest } from "./WalletInspectorDigest";
import { WalletImportPanel, type WalletImportSourceMode } from "./WalletImportPanel";
import styles from "./WalletsConsole.module.css";

type ColumnPreset = "compact" | "standard";
type InspectorSection = "digest" | "meta";
type DensityMode = "compact" | "comfortable";

const DENSITY_STORAGE_KEY = "wallet-workspace-density";
const PANEL_PINNED_STORAGE_KEY = "wallet-workspace-panel-pinned";
const HELP_STORAGE_KEY = "wallet-workspace-help-open";
const FLASH_STORAGE_KEY = "wallet-workspace-flash";

const SORT_OPTIONS = [
  { value: "updated_desc", label: "最近更新" },
  { value: "created_desc", label: "最近新增" },
  { value: "name_asc", label: "名称 A-Z" }
] as const;

const LIMIT_OPTIONS = [25, 50, 100, 200] as const;

const SOURCE_OPTIONS = [
  { value: "all", label: "全部来源" },
  { value: "manual", label: "手动录入" },
  { value: "finder", label: "Finder 导入" },
  { value: "ai", label: "AI 导入" },
  { value: "file", label: "文件导入" },
  { value: "system", label: "系统内置" }
] as const;

const STATUS_OPTIONS = [
  { value: "all", label: "全部状态" },
  { value: "active", label: "正常" },
  { value: "watchlist", label: "Watchlist" },
  { value: "review_needed", label: "需复核" },
  { value: "deleted", label: "已删除" }
] as const;

const COLUMN_PRESETS: Array<{ value: ColumnPreset; label: string }> = [
  { value: "compact", label: "紧凑" },
  { value: "standard", label: "标准" }
];

const SYSTEM_VIEWS = [
  { id: "all", label: "全部地址" },
  { id: "watchlist", label: "Watchlist" },
  { id: "review-needed", label: "需复核" },
  { id: "recent-created", label: "最近新增" },
  { id: "deleted", label: "已删除" }
] as const;

// 检查器只保留两段：先看画像速览（值不值得跟），需要改资料时再看第二段。
// 标签逐项编辑、记录流、分析摘要都已移到详情页，这里不再重复。
const INSPECTOR_SECTIONS: Array<{ id: InspectorSection; label: string }> = [
  { id: "digest", label: "画像速览" },
  { id: "meta", label: "资料" }
];

const shortAddress = (address: string) =>
  address.length > 18 ? `${address.slice(0, 8)}...${address.slice(-6)}` : address;

const shortText = (value: string, max = 108) =>
  value.length > max ? `${value.slice(0, max - 1).trimEnd()}...` : value;

const normalizeSearchDraft = (value: string) => value.trim().replace(/\s+/g, " ");

const mergeUniqueIds = (current: string[], incoming: string[]) =>
  Array.from(new Set([...current, ...incoming.filter(Boolean)]));

const removeIds = (current: string[], incoming: string[]) => {
  if (incoming.length === 0) {
    return current;
  }

  const blocked = new Set(incoming);
  const next = current.filter((item) => !blocked.has(item));
  return next.length === current.length ? current : next;
};

const retainIds = (current: string[], allowed: Set<string>) => {
  const next = current.filter((item) => allowed.has(item));
  return next.length === current.length ? current : next;
};

const formatDate = (value?: string | null) => {
  if (!value) return "--";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString("zh-CN", { hour12: false });
};

const buildQueryUrl = (pathname: string, query: WalletListQuery) => {
  const params = stringifyWalletListQuery(query).toString();
  return params ? `${pathname}?${params}` : pathname;
};

const buildResultSignature = (query: WalletListQuery) =>
  JSON.stringify({
    q: query.q ?? "",
    view: query.view ?? "",
    status: query.status ?? "all",
    source: query.source ?? "all",
    labels: query.labels ?? [],
    sort: query.sort ?? "updated_desc",
    limit: query.limit ?? 100,
    includeDeleted: Boolean(query.includeDeleted),
    createdAfter: query.createdAfter ?? "",
    createdBefore: query.createdBefore ?? ""
  });

const isEditableElement = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT" ||
    target.isContentEditable);

const getSystemViewId = (query: WalletListQuery) => {
  if (query.status === "deleted" || query.includeDeleted) {
    return "deleted";
  }
  if (query.status === "watchlist") {
    return "watchlist";
  }
  if (query.status === "review_needed") {
    return "review-needed";
  }
  if ((query.sort ?? "updated_desc") === "created_desc") {
    return "recent-created";
  }
  return "all";
};

const isWideEnoughToPin = (width: number) => width >= 1600;

const fetchJson = async <T,>(url: string, init?: RequestInit) => {
  const response = await fetch(url, init);
  const payload = (await response.json().catch(() => ({}))) as { data?: T; error?: string };
  return { ok: response.ok, data: payload.data, error: payload.error };
};

const exportRows = (rows: WalletAdminRow[]) => {
  const csv = [
    ["address", "displayName", "alias", "summary", "labels", "updatedAt"].join(","),
    ...rows.map((row) =>
      [
        row.wallet.address,
        row.wallet.displayName,
        row.wallet.alias ?? "",
        row.summaryText.replaceAll('"', '""'),
        row.labels.map((label) => label.value || label.name).join(" | ").replaceAll('"', '""'),
        row.wallet.updatedAt
      ]
        .map((item) => `"${item}"`)
        .join(",")
    )
  ].join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `wallets-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
};

const renderStatusBadge = (badge: WalletStatusBadge) => (
  <span key={badge.id} className={styles.statusBadge} data-tone={badge.tone}>
    <i />
    {badge.text}
  </span>
);


export const WalletsConsole = ({
  initialData,
  initialQuery,
  initialSelectedWalletDetail
}: {
  initialData: WalletListResponse;
  initialQuery: WalletListQuery;
  initialSelectedWalletDetail: WalletDetailData | null;
}) => {
  const router = useRouter();
  const pathname = usePathname();
  const [, startNavigation] = useTransition();
  const [queryState, setQueryState] = useState(initialQuery);
  const [searchDraft, setSearchDraft] = useState(initialQuery.q ?? "");
  const [focusRowId, setFocusRowId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectionAnchorId, setSelectionAnchorId] = useState<string | null>(null);
  const [panelMode, setPanelMode] = useState<WalletListPanelMode>(initialQuery.panel ?? "inspect");
  const [panelTargetId, setPanelTargetId] = useState<string | null>(initialQuery.selected ?? null);
  const [panelOpen, setPanelOpen] = useState(Boolean(initialQuery.selected && initialQuery.panel));
  const [panelSection, setPanelSection] = useState<InspectorSection>("digest");
  const [detail, setDetail] = useState<WalletDetailData | null>(initialSelectedWalletDetail);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [columnPreset, setColumnPreset] = useState<ColumnPreset>("standard");
  const [density, setDensity] = useState<DensityMode>("compact");
  const [labelPickerOpen, setLabelPickerOpen] = useState(false);
  const [labelFacetQuery, setLabelFacetQuery] = useState("");
  const [panelPinned, setPanelPinned] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [finderAiOpen, setFinderAiOpen] = useState(false);
  const [importSourceMode, setImportSourceMode] = useState<WalletImportSourceMode>("file");
  const [optimisticDeletedIds, setOptimisticDeletedIds] = useState<string[]>([]);
  const [armedDeleteId, setArmedDeleteId] = useState<string | null>(null);
  const [deletePendingId, setDeletePendingId] = useState<string | null>(null);
  const [deleteSuccessIds, setDeleteSuccessIds] = useState<string[]>([]);
  const [deleteErrors, setDeleteErrors] = useState<Record<string, string>>({});
  const [editForm, setEditForm] = useState({
    alias: "",
    strategyFocus: "",
    teamNote: "",
    labelValue: "",
    labelVerificationNote: "",
    labelSourceNote: ""
  });
  const [viewportWidth, setViewportWidth] = useState(0);
  const [navigationHint, setNavigationHint] = useState(false);

  const sectionRefs = useRef<Record<InspectorSection, HTMLDivElement | null>>({
    digest: null,
    meta: null
  });
  const deleteTimerRef = useRef<number | null>(null);
  const feedbackTimerRef = useRef<number | null>(null);
  const deleteTransitionRef = useRef<number | null>(null);
  const searchDebounceRef = useRef<number | null>(null);
  const navigationHintTimerRef = useRef<number | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const previousSignatureRef = useRef(buildResultSignature(initialQuery));

  const currentData = initialData;
  const visibleRows = useMemo(
    () => currentData.items.filter((row) => !optimisticDeletedIds.includes(row.wallet.id)),
    [currentData.items, optimisticDeletedIds]
  );
  const labelFacetItems = useMemo(() => {
    const query = labelFacetQuery.trim().toLowerCase();
    const items = currentData.facetCounts.labelCounts.filter((item) =>
      query
        ? item.label.toLowerCase().includes(query) || item.key.toLowerCase().includes(query)
        : true
    );
    return {
      total: items.length,
      visible: items
    };
  }, [currentData.facetCounts.labelCounts, labelFacetQuery]);
  const versionGroups = useMemo(() => {
    const groups = new Map<string, typeof currentData.facetCounts.versionCounts>();
    for (const item of currentData.facetCounts.versionCounts) {
      const name = item.name ?? "版本";
      const list = groups.get(name) ?? [];
      list.push(item);
      groups.set(name, list);
    }
    return Array.from(groups.entries()).map(([name, items]) => ({ name, items }));
  }, [currentData.facetCounts.versionCounts]);
  const currentPageIds = useMemo(() => visibleRows.map((row) => row.wallet.id), [visibleRows]);
  const selectedRows = useMemo(
    () => visibleRows.filter((row) => selectedIds.includes(row.wallet.id)),
    [selectedIds, visibleRows]
  );
  const panelRow = visibleRows.find((row) => row.wallet.id === panelTargetId) ?? null;
  const panelWallet =
    detail?.wallet.id === panelTargetId
      ? detail.wallet
      : panelRow?.wallet ?? null;
  const panelFinderAi =
    detail?.wallet.id === panelTargetId
      ? detail.finderAi
      : panelRow?.finderAi;
  const panelFinderProfile =
    detail?.wallet.id === panelTargetId ? detail.finderProfile : undefined;
  const allCurrentPageSelected =
    currentPageIds.length > 0 && currentPageIds.every((walletId) => selectedIds.includes(walletId));
  const routeSyncing = navigationHint;
  const showSummaryColumn = columnPreset !== "compact";
  const showUpdatedColumn = true;
  const activeSystemView = getSystemViewId(queryState);
  const canPinPanel = isWideEnoughToPin(viewportWidth);
  const inspectorTitle = panelWallet?.alias ?? panelWallet?.displayName ?? "地址检查器";
  const panelFinderAiMeta = [
    panelFinderAi?.providerMeta?.model,
    panelFinderAi?.providerMeta?.promptVersion,
    panelFinderAi?.evidenceLevel
  ].filter(Boolean).join(" / ");
  const committedSearch = queryState.q ?? "";
  const normalizedSearchDraft = normalizeSearchDraft(searchDraft);
  const searchDirty = normalizedSearchDraft !== committedSearch;
  const hasAnyFilter =
    Boolean(committedSearch) ||
    Boolean(queryState.source && queryState.source !== "all") ||
    Boolean(queryState.status && queryState.status !== "all" && queryState.status !== "review_needed") ||
    Boolean(queryState.includeDeleted && queryState.status !== "deleted") ||
    (queryState.labels ?? []).length > 0;
  const searchStatusText = routeSyncing
    ? `正在搜索${normalizedSearchDraft || committedSearch ? `：${normalizedSearchDraft || committedSearch}` : ""}`
    : searchDirty
      ? "输入后按 Enter 或点击搜索，系统也会自动刷新"
      : committedSearch
        ? `已搜索“${committedSearch}”，命中 ${currentData.totalCount} 条`
        : "支持地址、名称、别名、标签、摘要和 AI 解读关键词";

  const pushFeedback = (message: string) => {
    setFeedback(message);
    if (feedbackTimerRef.current) {
      window.clearTimeout(feedbackTimerRef.current);
    }
    feedbackTimerRef.current = window.setTimeout(() => {
      setFeedback(null);
      feedbackTimerRef.current = null;
    }, 2200);
  };

  const showNavigationHint = () => {
    setNavigationHint(true);
    if (navigationHintTimerRef.current) {
      window.clearTimeout(navigationHintTimerRef.current);
    }
    navigationHintTimerRef.current = window.setTimeout(() => {
      setNavigationHint(false);
      navigationHintTimerRef.current = null;
    }, 2600);
  };

  const downloadFullLibraryExport = () => {
    pushFeedback("正在准备地址库全量导出...");
    window.location.assign("/api/wallets/export?scope=all&includeDeleted=true");
  };

  const scheduleDeletedRows = (walletIds: string[]) => {
    const nextIds = walletIds.filter(Boolean);
    if (nextIds.length === 0) {
      return;
    }

    setDeleteSuccessIds((current) => mergeUniqueIds(current, nextIds));
    setSelectedIds((current) => removeIds(current, nextIds));

    if (queryState.status !== "deleted") {
      setOptimisticDeletedIds((current) => mergeUniqueIds(current, nextIds));
    }

    if (deleteTransitionRef.current) {
      window.clearTimeout(deleteTransitionRef.current);
    }

    deleteTransitionRef.current = window.setTimeout(() => {
      setDeleteSuccessIds((current) => removeIds(current, nextIds));
      deleteTransitionRef.current = null;
      refreshWorkspace();
    }, queryState.status === "deleted" ? 900 : 180);
  };

  const updateLocalQuery = (nextQuery: WalletListQuery) => {
    const currentUrl = buildQueryUrl(pathname, queryState);
    const nextUrl = buildQueryUrl(pathname, nextQuery);
    setQueryState(nextQuery);

    if (currentUrl === nextUrl) {
      return;
    }

    showNavigationHint();
    window.history.replaceState(window.history.state, "", nextUrl);
    startNavigation(() => {
      router.replace(nextUrl, { scroll: false });
    });
  };

  const patchQuery = (
    patch: Partial<WalletListQuery>,
    options?: { resetCursor?: boolean; clearSelection?: boolean; closePanel?: boolean }
  ) => {
    const nextQuery: WalletListQuery = {
      ...queryState,
      ...patch,
      cursor: options?.resetCursor ? undefined : patch.cursor ?? queryState.cursor
    };

    if (options?.clearSelection) {
      setSelectedIds([]);
      setSelectionAnchorId(null);
    }

    if (options?.closePanel) {
      nextQuery.selected = undefined;
      nextQuery.panel = undefined;
      setPanelOpen(false);
      setPanelTargetId(null);
      setPanelMode("inspect");
      setDetailError(null);
    }

    setFeedback(null);
    updateLocalQuery(nextQuery);
  };

  const commitSearch = (value = searchDraft, options?: { immediateFeedback?: boolean }) => {
    const nextSearch = normalizeSearchDraft(value);
    setSearchDraft(nextSearch);

    if ((queryState.q ?? "") === nextSearch) {
      if (options?.immediateFeedback) {
        pushFeedback(nextSearch ? `当前已经在搜索：${nextSearch}` : "当前没有搜索关键词");
      }
      return;
    }

    if (searchDebounceRef.current) {
      window.clearTimeout(searchDebounceRef.current);
      searchDebounceRef.current = null;
    }

    patchQuery(
      { q: nextSearch || undefined },
      { resetCursor: true, clearSelection: true, closePanel: true }
    );
  };

  const clearSearch = () => {
    commitSearch("");
  };

  const commitCurrentSearchInput = (options?: { immediateFeedback?: boolean }) => {
    commitSearch(searchInputRef.current?.value ?? searchDraft, options);
  };

  const refreshWorkspace = () => {
    showNavigationHint();
    startNavigation(() => {
      router.refresh();
    });
  };

  const openInspector = (walletId: string, mode: WalletListPanelMode) => {
    setFocusRowId(walletId);
    setPanelOpen(true);
    setPanelTargetId(walletId);
    setPanelMode(mode);
    setPanelSection("digest");
    setDetailError(null);
    updateLocalQuery({ ...queryState, selected: walletId, panel: mode, cursor: queryState.cursor });
  };

  const openFinderAiDetail = (walletId: string) => {
    setFocusRowId(walletId);
    setPanelTargetId(walletId);
    setPanelMode("inspect");
    setPanelSection("digest");
    setDetailError(null);
    setFinderAiOpen(true);
  };

  const closeInspector = () => {
    setPanelOpen(false);
    setPanelTargetId(null);
    setPanelMode("inspect");
    setDetailError(null);
    updateLocalQuery({ ...queryState, selected: undefined, panel: undefined });
  };

  const applySystemView = (viewId: (typeof SYSTEM_VIEWS)[number]["id"]) => {
    if (viewId === "watchlist") {
      patchQuery(
        { view: viewId, status: "watchlist", sort: queryState.sort ?? "updated_desc", includeDeleted: false },
        { resetCursor: true, clearSelection: true, closePanel: true }
      );
      return;
    }

    if (viewId === "recent-created") {
      patchQuery(
        { view: viewId, status: "all", sort: "created_desc", includeDeleted: false },
        { resetCursor: true, clearSelection: true, closePanel: true }
      );
      return;
    }

    if (viewId === "review-needed") {
      patchQuery(
        { view: viewId, status: "review_needed", includeDeleted: false, sort: "updated_desc" },
        { resetCursor: true, clearSelection: true, closePanel: true }
      );
      return;
    }

    if (viewId === "deleted") {
      patchQuery(
        { view: viewId, status: "deleted", includeDeleted: true, sort: "updated_desc" },
        { resetCursor: true, clearSelection: true, closePanel: true }
      );
      return;
    }

    patchQuery(
      { view: viewId, status: "all", includeDeleted: false, sort: "updated_desc" },
      { resetCursor: true, clearSelection: true, closePanel: true }
    );
  };

  const runBulkAction = async (action: "watchlist_add" | "watchlist_remove" | "soft_delete") => {
    if (selectedIds.length === 0) {
      return;
    }

    if (
      action === "soft_delete" &&
      !window.confirm(`确认软删除这 ${selectedIds.length} 个地址吗？`)
    ) {
      return;
    }

    const result = await fetchJson<{
      successIds: string[];
      successCount: number;
      failed: Array<{ walletId: string; error: string }>;
    }>("/api/wallets/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action,
        walletIds: selectedIds,
        reason: action === "soft_delete" ? "wallet-workspace-bulk-delete" : undefined
      })
    });

    const data = result.data;
    if (!result.ok || !data) {
      pushFeedback(result.error ?? "批量操作失败");
      return;
    }

    if (action === "soft_delete" && data.successIds.length > 0) {
      scheduleDeletedRows(data.successIds);
      if (panelTargetId && data.successIds.includes(panelTargetId) && queryState.status !== "deleted") {
        closeInspector();
      }
    }

    const failedIds = new Set(data.failed.map((item) => item.walletId));
    setSelectedIds((current) => current.filter((walletId) => failedIds.has(walletId)));
    pushFeedback(
      data.failed.length > 0
        ? `批量操作部分完成：成功 ${data.successCount} 个，失败 ${data.failed.length} 个`
        : `批量操作完成：已处理 ${data.successCount} 个地址`
    );

    if (action !== "soft_delete") {
      window.setTimeout(() => refreshWorkspace(), 120);
    }
  };

  const runRowDelete = async (walletId: string) => {
    setDeletePendingId(walletId);
    setDeleteErrors((current) => {
      const next = { ...current };
      delete next[walletId];
      return next;
    });

    const result = await fetchJson<{ successIds: string[] }>("/api/wallets/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "soft_delete",
        walletIds: [walletId],
        reason: "wallet-row-delete"
      })
    });

    if (!result.ok || !result.data) {
      setDeleteErrors((current) => ({
        ...current,
        [walletId]: result.error ?? "删除失败"
      }));
      setDeletePendingId(null);
      return;
    }

    setArmedDeleteId(null);
    setDeletePendingId(null);

    scheduleDeletedRows([walletId]);

    if (panelTargetId === walletId && queryState.status !== "deleted") {
      closeInspector();
    }

    pushFeedback("地址已删除，列表会立即收起并同步到扩展标注。");
  };

  const toggleWatchlist = async (walletId: string, enabled: boolean) => {
    const response = await fetch("/api/watchlists", {
      method: enabled ? "POST" : "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ walletId })
    });
    const payload = (await response.json().catch(() => ({}))) as { error?: string };

    if (!response.ok) {
      pushFeedback(payload.error ?? "更新 Watchlist 失败");
      return;
    }

    pushFeedback(enabled ? "已加入 Watchlist" : "已移出 Watchlist");
    refreshWorkspace();
  };

  const saveQuickEdit = async () => {
    if (!panelTargetId) {
      return;
    }

    const response = await fetch(`/api/wallets/${panelTargetId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        alias: editForm.alias,
        strategyFocus: editForm.strategyFocus,
        teamNote: editForm.teamNote
      })
    });
    const payload = (await response.json().catch(() => ({}))) as { error?: string };

    if (!response.ok) {
      pushFeedback(payload.error ?? "保存资料失败");
      return;
    }

    pushFeedback("地址资料已更新");
    refreshWorkspace();
  };

  const addQuickLabel = async () => {
    const targetWalletId = panelTargetId;
    if (!targetWalletId) {
      return;
    }

    const value = editForm.labelValue.trim();
    if (!value) {
      return;
    }

    const response = await fetch(`/api/wallets/${targetWalletId}/user-tags`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "官方标签",
        value,
        kind: "group",
        source: "user",
        verificationNote: editForm.labelVerificationNote.trim() || undefined,
        sourceNote: editForm.labelSourceNote.trim() || undefined
      })
    });
    const payload = (await response.json().catch(() => ({}))) as { error?: string };

    if (!response.ok) {
      pushFeedback(payload.error ?? "标签写入失败");
      return;
    }

    setEditForm((current) => ({
      ...current,
      labelValue: "",
      labelVerificationNote: "",
      labelSourceNote: ""
    }));
    pushFeedback("已新增官方标签并写入备注");
    refreshWorkspace();
  };

  const jumpToSection = (section: InspectorSection) => {
    setPanelSection(section);
    sectionRefs.current[section]?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const toggleRowSelection = (walletId: string, rangeSelect = false) => {
    if (rangeSelect && selectionAnchorId) {
      const anchorIndex = currentPageIds.indexOf(selectionAnchorId);
      const nextIndex = currentPageIds.indexOf(walletId);
      if (anchorIndex >= 0 && nextIndex >= 0) {
        const [start, end] =
          anchorIndex < nextIndex ? [anchorIndex, nextIndex] : [nextIndex, anchorIndex];
        const rangeIds = currentPageIds.slice(start, end + 1);
        setSelectedIds((current) => Array.from(new Set([...current, ...rangeIds])));
        return;
      }
    }

    setSelectionAnchorId(walletId);
    setSelectedIds((current) =>
      current.includes(walletId)
        ? current.filter((id) => id !== walletId)
        : [...current, walletId]
    );
  };

  const toggleSelectCurrentPage = () => {
    if (allCurrentPageSelected) {
      setSelectedIds((current) => current.filter((walletId) => !currentPageIds.includes(walletId)));
      return;
    }

    setSelectionAnchorId(currentPageIds[0] ?? null);
    setSelectedIds((current) => Array.from(new Set([...current, ...currentPageIds])));
  };

  const clearFilters = () => {
    if (searchDebounceRef.current) {
      window.clearTimeout(searchDebounceRef.current);
      searchDebounceRef.current = null;
    }
    setSearchDraft("");
    patchQuery(
      {
        q: undefined,
        view: undefined,
        status: "all",
        source: "all",
        labels: undefined,
        sort: "updated_desc",
        limit: queryState.limit ?? 100,
        includeDeleted: false,
        createdAfter: undefined,
        createdBefore: undefined
      },
      { resetCursor: true, clearSelection: true, closePanel: true }
    );
  };

  const removeLabelFilter = (label: string) => {
    patchQuery(
      { labels: (queryState.labels ?? []).filter((item) => item !== label) || undefined },
      { resetCursor: true, clearSelection: true, closePanel: true }
    );
  };

  const toggleLabelFilter = (label: string) => {
    const current = new Set(queryState.labels ?? []);
    if (current.has(label)) {
      current.delete(label);
    } else {
      current.add(label);
    }

    patchQuery(
      { labels: current.size > 0 ? Array.from(current) : undefined },
      { resetCursor: true, clearSelection: true, closePanel: true }
    );
  };

  useEffect(() => {
    setViewportWidth(window.innerWidth);

    const storedDensity = window.localStorage.getItem(DENSITY_STORAGE_KEY);
    if (storedDensity === "compact" || storedDensity === "comfortable") {
      setDensity(storedDensity);
    }

    setHelpOpen(window.localStorage.getItem(HELP_STORAGE_KEY) === "true");
    setPanelPinned(window.localStorage.getItem(PANEL_PINNED_STORAGE_KEY) === "true");
    const flashMessage = window.sessionStorage.getItem(FLASH_STORAGE_KEY);
    if (flashMessage) {
      window.sessionStorage.removeItem(FLASH_STORAGE_KEY);
      setFeedback(flashMessage);
      if (feedbackTimerRef.current) {
        window.clearTimeout(feedbackTimerRef.current);
      }
      feedbackTimerRef.current = window.setTimeout(() => {
        setFeedback(null);
        feedbackTimerRef.current = null;
      }, 2200);
    }

    const handleResize = () => {
      setViewportWidth(window.innerWidth);
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    window.localStorage.setItem(DENSITY_STORAGE_KEY, density);
  }, [density]);

  useEffect(() => {
    window.localStorage.setItem(HELP_STORAGE_KEY, String(helpOpen));
  }, [helpOpen]);

  useEffect(() => {
    if (!canPinPanel && panelPinned) {
      setPanelPinned(false);
      return;
    }

    window.localStorage.setItem(PANEL_PINNED_STORAGE_KEY, String(panelPinned && canPinPanel));
  }, [canPinPanel, panelPinned]);

  useEffect(() => {
    setQueryState(initialQuery);
    setSearchDraft(initialQuery.q ?? "");
    setPanelMode(initialQuery.panel ?? "inspect");
    setPanelTargetId(initialQuery.selected ?? null);
    setPanelOpen(Boolean(initialQuery.selected && initialQuery.panel));
    setNavigationHint(false);
    if (navigationHintTimerRef.current) {
      window.clearTimeout(navigationHintTimerRef.current);
      navigationHintTimerRef.current = null;
    }
  }, [initialQuery]);

  useEffect(() => {
    setDetail(initialSelectedWalletDetail);
  }, [initialSelectedWalletDetail]);

  useEffect(() => {
    const nextSignature = buildResultSignature(initialQuery);
    setDeleteErrors({});
    setDeletePendingId(null);

    if (previousSignatureRef.current !== nextSignature) {
      setSelectedIds([]);
      setSelectionAnchorId(null);
      setOptimisticDeletedIds([]);
      setDeleteSuccessIds([]);
      previousSignatureRef.current = nextSignature;
    }
  }, [initialQuery]);

  useEffect(() => {
    const serverIds = new Set(currentData.items.map((row) => row.wallet.id));
    setOptimisticDeletedIds((current) => retainIds(current, serverIds));
    setDeleteSuccessIds((current) => retainIds(current, serverIds));
  }, [currentData.items]);

  useEffect(() => {
    setSelectedIds((current) => current.filter((walletId) => currentPageIds.includes(walletId)));
  }, [currentPageIds]);

  useEffect(() => {
    const nextSearch = normalizeSearchDraft(searchDraft);
    if ((queryState.q ?? "") === nextSearch) {
      return;
    }

    if (searchDebounceRef.current) {
      window.clearTimeout(searchDebounceRef.current);
    }

    searchDebounceRef.current = window.setTimeout(() => {
      commitSearch(nextSearch);
    }, 650);

    return () => {
      if (searchDebounceRef.current) {
        window.clearTimeout(searchDebounceRef.current);
        searchDebounceRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchDraft]);

  useEffect(() => {
    if (!panelTargetId || !panelOpen) {
      setDetailError(null);
      return;
    }

    if (initialSelectedWalletDetail?.wallet.id === panelTargetId) {
      setDetail(initialSelectedWalletDetail);
      setDetailLoading(false);
      return;
    }

    let cancelled = false;
    setDetailLoading(true);
    setDetailError(null);

    void fetchJson<WalletDetailData>(`/api/wallets/${panelTargetId}`).then((result) => {
      if (cancelled) {
        return;
      }

      if (!result.ok || !result.data) {
        setDetailError(result.error ?? "读取地址详情失败");
        setDetailLoading(false);
        return;
      }

      setDetail(result.data);
      setDetailLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [initialSelectedWalletDetail, panelOpen, panelTargetId]);

  useEffect(() => {
    const wallet = detail?.wallet.id === panelTargetId ? detail.wallet : panelWallet;
    if (!wallet) {
      return;
    }

    setEditForm((current) => ({
      ...current,
      alias: wallet.alias ?? wallet.displayName,
      strategyFocus: wallet.strategyFocus ?? "",
      teamNote: wallet.teamNote ?? "",
      labelValue: "",
      labelVerificationNote: "",
      labelSourceNote: ""
    }));
  }, [
    detail?.wallet.alias,
    detail?.wallet.displayName,
    detail?.wallet.id,
    detail?.wallet.strategyFocus,
    detail?.wallet.teamNote,
    panelTargetId,
    panelWallet
  ]);

  useEffect(() => {
    if (focusRowId && !visibleRows.some((row) => row.wallet.id === focusRowId)) {
      setFocusRowId(null);
    }
  }, [focusRowId, visibleRows]);

  useEffect(() => {
    if (!armedDeleteId) {
      if (deleteTimerRef.current) {
        window.clearTimeout(deleteTimerRef.current);
        deleteTimerRef.current = null;
      }
      return;
    }

    deleteTimerRef.current = window.setTimeout(() => {
      setArmedDeleteId(null);
    }, 2500);

    return () => {
      if (deleteTimerRef.current) {
        window.clearTimeout(deleteTimerRef.current);
        deleteTimerRef.current = null;
      }
    };
  }, [armedDeleteId]);

  useEffect(() => {
    if (!armedDeleteId) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        setArmedDeleteId(null);
        return;
      }

      if (target.closest(`[data-delete-scope="${armedDeleteId}"]`)) {
        return;
      }

      setArmedDeleteId(null);
    };

    document.addEventListener("pointerdown", handlePointerDown, true);
    return () => document.removeEventListener("pointerdown", handlePointerDown, true);
  }, [armedDeleteId]);

  useEffect(() => {
    return () => {
      if (feedbackTimerRef.current) {
        window.clearTimeout(feedbackTimerRef.current);
      }
      if (deleteTransitionRef.current) {
        window.clearTimeout(deleteTransitionRef.current);
      }
      if (searchDebounceRef.current) {
        window.clearTimeout(searchDebounceRef.current);
      }
      if (navigationHintTimerRef.current) {
        window.clearTimeout(navigationHintTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isEditableElement(event.target)) {
        return;
      }

      if (event.key === "Escape") {
        if (armedDeleteId) {
          setArmedDeleteId(null);
          return;
        }
        if (panelOpen) {
          closeInspector();
        }
        return;
      }

      if (!focusRowId) {
        return;
      }

      if (event.key === "Enter" || event.key.toLowerCase() === "i") {
        event.preventDefault();
        openInspector(focusRowId, "inspect");
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [armedDeleteId, closeInspector, focusRowId, openInspector, panelOpen]);

  const activeFilterChips = [
    queryState.q
      ? { id: `q:${queryState.q}`, label: `搜索：${queryState.q}`, onRemove: clearSearch }
      : null,
    queryState.source && queryState.source !== "all"
      ? {
          id: `source:${queryState.source}`,
          label: `来源：${SOURCE_OPTIONS.find((item) => item.value === queryState.source)?.label ?? queryState.source}`,
          onRemove: () =>
            patchQuery(
              { source: "all" },
              { resetCursor: true, clearSelection: true, closePanel: true }
            )
        }
      : null,
    queryState.status && queryState.status !== "all"
      ? {
          id: `status:${queryState.status}`,
          label: `状态：${STATUS_OPTIONS.find((item) => item.value === queryState.status)?.label ?? queryState.status}`,
          onRemove: () =>
            patchQuery(
              {
                status: "all",
                includeDeleted: false
              },
              { resetCursor: true, clearSelection: true, closePanel: true }
            )
        }
      : null,
    ...(queryState.labels ?? []).map((label) => ({
      id: `label:${label}`,
      label: `标签：${label}`,
      onRemove: () => removeLabelFilter(label)
    })),
    queryState.includeDeleted && queryState.status !== "deleted"
      ? {
          id: "deleted:true",
          label: "包含已删除",
          onRemove: () =>
            patchQuery(
              { includeDeleted: false },
              { resetCursor: true, clearSelection: true, closePanel: true }
            )
        }
      : null
  ].filter((item): item is NonNullable<typeof item> => Boolean(item));

  return (
    <div className={`${styles.page} ${density === "comfortable" ? styles.pageComfortable : ""}`}>
      <section className={styles.header}>
        <div className={styles.headerCopy}>
          <span className={styles.kicker}>Address Workspace</span>
          <h1 className={styles.title}>地址库工作台</h1>
          <p className={styles.description}>
            这里是高频整理地址的主工作台。默认只做筛选、扫描、检查编辑、单条删除和批量操作，
            长内容维护与完整分析继续留在详情页。
          </p>
        </div>
        <div className={styles.headerActions}>
          <AppLink href="/imports" className={styles.primaryButton}>
            导入中心
          </AppLink>
          <AppLink href="/imports/finder" className={styles.ghostButton}>
            Finder 对接
          </AppLink>
          <button type="button" className={styles.ghostButton} onClick={downloadFullLibraryExport}>
            导出全库 JSON
          </button>
          <button
            type="button"
            className={styles.ghostButton}
            onClick={() => {
              setImportSourceMode("file");
              setImportOpen(true);
            }}
          >
            快速导入
          </button>
          <button type="button" className={styles.ghostButton} onClick={() => setCreateOpen(true)}>
            手动新增
          </button>
          <button type="button" className={styles.ghostButton} onClick={refreshWorkspace}>
            刷新
          </button>
        </div>
      </section>

      <section className={styles.statsStrip}>
        <div className={styles.statCard}>
          <span>当前结果</span>
          <strong>{currentData.totalCount}</strong>
        </div>
        <div className={styles.statCard}>
          <span>Watchlist</span>
          <strong>{currentData.facetCounts.watchlistedCount}</strong>
        </div>
        <div className={styles.statCard}>
          <span>正常地址</span>
          <strong>{currentData.facetCounts.activeCount}</strong>
        </div>
        <div className={styles.statCard}>
          <span>已删除</span>
          <strong>{currentData.facetCounts.deletedCount}</strong>
        </div>
      </section>

      <section className={styles.filterShelf}>
        <div className={styles.segmented}>
          {SYSTEM_VIEWS.map((view) => (
            <button
              key={view.id}
              type="button"
              className={`${styles.segmentedItem} ${activeSystemView === view.id ? styles.segmentedItemActive : ""}`}
              onClick={() => applySystemView(view.id)}
            >
              {view.label}
            </button>
          ))}
        </div>

        <div className={styles.toolbarRow}>
          <label className={styles.searchField}>
            <span className={styles.fieldLabel}>搜索地址 / 名称 / 标签</span>
            <div className={styles.searchControl} data-dirty={searchDirty || undefined}>
              <input
                ref={searchInputRef}
                type="search"
                value={searchDraft}
                onChange={(event) => setSearchDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    commitSearch(event.currentTarget.value, { immediateFeedback: true });
                  }
                }}
                placeholder="输入 portrait、0x 地址片段、标签或 AI 摘要"
                className={styles.searchInput}
                aria-label="搜索地址、名称、别名、标签或摘要"
                enterKeyHint="search"
              />
              {searchDraft ? (
                <button
                  type="button"
                  className={styles.searchClearButton}
                  onClick={clearSearch}
                  aria-label="清空搜索"
                  title="清空搜索"
                >
                  x
                </button>
              ) : null}
              <button
                type="button"
                className={styles.searchSubmitButton}
                onClick={() => commitCurrentSearchInput({ immediateFeedback: true })}
                disabled={routeSyncing}
              >
                搜索
              </button>
            </div>
            <div className={styles.searchFeedback} data-active={routeSyncing || searchDirty || undefined}>
              {routeSyncing ? <span className={styles.searchSpinner} aria-hidden="true" /> : null}
              <span>{searchStatusText}</span>
            </div>
          </label>

          <label className={styles.compactField}>
            <span className={styles.fieldLabel}>来源</span>
            <select
              className={styles.select}
              value={queryState.source ?? "all"}
              onChange={(event) =>
                patchQuery(
                  { source: event.target.value as WalletListQuery["source"] },
                  { resetCursor: true, clearSelection: true, closePanel: true }
                )
              }
            >
              {SOURCE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className={styles.compactField}>
            <span className={styles.fieldLabel}>版本</span>
            <select
              className={styles.select}
              value={queryState.version ?? ""}
              onChange={(event) =>
                patchQuery(
                  { version: event.target.value || undefined },
                  { resetCursor: true, clearSelection: true, closePanel: true }
                )
              }
            >
              <option value="">全部版本</option>
              {versionGroups.map((group) => (
                <optgroup key={group.name} label={group.name}>
                  {group.items.map((item) => (
                    <option key={item.key} value={item.key}>
                      {item.label}（{item.count}）
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>

          <label className={styles.compactField}>
            <span className={styles.fieldLabel}>页容量</span>
            <select
              className={styles.select}
              value={queryState.limit ?? 100}
              onChange={(event) =>
                patchQuery(
                  { limit: Number.parseInt(event.target.value, 10) },
                  { resetCursor: true, clearSelection: true, closePanel: true }
                )
              }
            >
              {LIMIT_OPTIONS.map((limit) => (
                <option key={limit} value={limit}>
                  {limit} 条
                </option>
              ))}
            </select>
          </label>

          <label className={styles.compactField}>
            <span className={styles.fieldLabel}>列预设</span>
            <select
              className={styles.select}
              value={columnPreset}
              onChange={(event) => setColumnPreset(event.target.value as ColumnPreset)}
            >
              {COLUMN_PRESETS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className={styles.compactField}>
            <span className={styles.fieldLabel}>行密度</span>
            <select
              className={styles.select}
              value={density}
              onChange={(event) => setDensity(event.target.value as DensityMode)}
            >
              <option value="compact">紧凑</option>
              <option value="comfortable">舒适</option>
            </select>
          </label>

          <div className={styles.filterActions}>
            <button type="button" className={styles.ghostButton} onClick={clearFilters}>
              清空筛选
            </button>
          </div>
        </div>

        <div className={styles.filterFooter}>
          <div className={styles.viewRail}>
            <span className={styles.fieldLabel}>标签筛选</span>
            <button
              type="button"
              className={styles.ghostButton}
              onClick={() => setLabelPickerOpen(true)}
            >
              {(queryState.labels ?? []).length > 0
                ? `选择标签（已选 ${(queryState.labels ?? []).length}）`
                : "选择标签"}
            </button>
          </div>

          {labelPickerOpen ? (
            <div className={styles.labelPickerBackdrop} onClick={() => setLabelPickerOpen(false)}>
              <div
                className={styles.labelPickerPanel}
                onClick={(event) => event.stopPropagation()}
              >
                <div className={styles.labelPickerHead}>
                  <strong>标签筛选 · 可多选 · 点空白处关闭</strong>
                  <button
                    type="button"
                    className={styles.ghostButton}
                    onClick={() => setLabelPickerOpen(false)}
                  >
                    关闭
                  </button>
                </div>
                <input
                  type="search"
                  value={labelFacetQuery}
                  onChange={(event) => setLabelFacetQuery(event.target.value)}
                  placeholder="输入标签名快速定位"
                  aria-label="按标签名快速定位筛选"
                  className={styles.select}
                />
                <div className={styles.labelPickerTags}>
                  {labelFacetItems.visible.map((label) => {
                    const active = (queryState.labels ?? []).includes(label.key);
                    return (
                      <button
                        key={label.key}
                        type="button"
                        data-tone={getLabelKindTone(label.kind)}
                        className={`${styles.labelChip} ${active ? styles.labelChipActive : ""}`}
                        onClick={() => toggleLabelFilter(label.key)}
                        title={`${label.label}（${label.count} 个地址）`}
                      >
                        <span>{label.label}</span>
                        <strong>{label.count}</strong>
                      </button>
                    );
                  })}
                  {labelFacetItems.visible.length === 0 ? (
                    <span className={styles.fieldLabel}>没有匹配的标签</span>
                  ) : null}
                </div>
              </div>
            </div>
          ) : null}

          <div className={styles.activeFilters}>
            {activeFilterChips.map((chip) => (
              <button
                key={chip.id}
                type="button"
                className={styles.activeFilter}
                onClick={chip.onRemove}
              >
                {chip.label}
              </button>
            ))}
          </div>
        </div>

        <details
          className={styles.helpPanel}
          open={helpOpen}
          onToggle={(event) => setHelpOpen((event.currentTarget as HTMLDetailsElement).open)}
        >
          <summary>使用说明与恢复信息</summary>
          <p>
            单击一行只会选中，不会自动打开详情。按 Enter、按 I 或点行尾“检查”才会打开右侧检查器；
            删除采用两段式轻确认，默认 2.5 秒后自动取消。
          </p>
          <div className={styles.helpGrid}>
            <div>
              <strong>D1 权威库</strong>
              <span>管理台始终直读 D1 最新数据，不使用 KV 当权威源。</span>
            </div>
            <div>
              <strong>软删除</strong>
              <span>默认列表和扩展会隐藏地址，但审计流和时间戳保留。</span>
            </div>
            <div>
              <strong>恢复能力</strong>
              <span>近期依赖 D1 Time Travel，长期依赖逻辑快照和审计记录。</span>
            </div>
          </div>
        </details>
      </section>

      <section className={styles.dataPlane}>
        {selectedIds.length > 0 ? (
          <div className={styles.bulkBar}>
            <div className={styles.bulkSummary}>
              已选中 <strong>{selectedIds.length}</strong> 条，本轮批量操作只作用于当前页显式选择。
            </div>
            <div className={styles.bulkActions}>
              <button type="button" className={styles.ghostButton} onClick={() => runBulkAction("watchlist_add")}>
                加入 Watchlist
              </button>
              <button type="button" className={styles.ghostButton} onClick={() => runBulkAction("watchlist_remove")}>
                移出 Watchlist
              </button>
              <button type="button" className={styles.dangerButton} onClick={() => runBulkAction("soft_delete")}>
                批量删除
              </button>
              <button type="button" className={styles.ghostButton} onClick={() => exportRows(selectedRows)}>
                导出选中
              </button>
              <button type="button" className={styles.ghostButton} onClick={() => setSelectedIds([])}>
                清空选择
              </button>
            </div>
          </div>
        ) : null}

        <div className={styles.resultStatus} data-loading={routeSyncing || undefined}>
          <div>
            <strong>{routeSyncing ? "正在同步搜索结果" : "当前结果"}</strong>
            <span>
              {committedSearch
                ? `关键词“${committedSearch}”，当前页 ${visibleRows.length} 条 / 共 ${currentData.totalCount} 条`
                : `当前页 ${visibleRows.length} 条 / 共 ${currentData.totalCount} 条`}
            </span>
          </div>
          {searchDirty ? (
            <button
              type="button"
              className={styles.ghostButton}
              onClick={() => commitCurrentSearchInput()}
            >
              应用输入内容
            </button>
          ) : null}
        </div>

        <div className={styles.tableWrap}>
          <table className={`${styles.table} ${density === "comfortable" ? styles.tableComfortable : ""}`}>
            <colgroup>
              <col style={{ width: 40 }} />
              <col style={{ width: showSummaryColumn ? "40%" : "58%" }} />
              {showSummaryColumn ? <col style={{ width: "28%" }} /> : null}
              <col style={{ width: showUpdatedColumn ? "20%" : "42%" }} />
              {showUpdatedColumn ? <col style={{ width: 120 }} /> : null}
            </colgroup>
            <thead>
              <tr>
                <th className={styles.checkboxCell}>
                  <input
                    type="checkbox"
                    checked={allCurrentPageSelected}
                    onChange={toggleSelectCurrentPage}
                    aria-label="选择当前页"
                  />
                </th>
                <th>地址主体</th>
                {showSummaryColumn ? <th>一句话摘要</th> : null}
                <th>状态 / 信号</th>
                {showUpdatedColumn ? <th>更新时间</th> : null}
              </tr>
            </thead>
            <tbody>
              {visibleRows.length === 0 ? (
                <tr>
                  <td colSpan={showSummaryColumn && showUpdatedColumn ? 5 : showSummaryColumn || showUpdatedColumn ? 4 : 3}>
                    <div className={styles.emptyState}>
                      {committedSearch
                        ? `没有找到与“${committedSearch}”匹配的地址。可以换成地址片段、别名、标签或摘要关键词再试。`
                        : "当前筛选下没有地址。可以尝试放宽筛选条件，或直接使用 AI 导入 / 手动新增继续扩库。"}
                      {hasAnyFilter ? (
                        <div className={styles.emptyActions}>
                          {committedSearch ? (
                            <button type="button" className={styles.ghostButton} onClick={clearSearch}>
                              清空搜索
                            </button>
                          ) : null}
                          <button type="button" className={styles.ghostButton} onClick={clearFilters}>
                            清空全部筛选
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ) : null}

              {visibleRows.map((row) => {
                const focused = focusRowId === row.wallet.id;
                const checked = selectedIds.includes(row.wallet.id);
                const highlightChips = row.highlights
                  .filter((badge) => badge.tone !== "watch")
                  .slice(0, columnPreset === "compact" ? 1 : 2);
                const extraHighlights = Math.max(
                  row.highlights.filter((badge) => badge.tone !== "watch").length - highlightChips.length,
                  0
                );
                const deleteArmed = armedDeleteId === row.wallet.id;
                const deleteSucceeded = deleteSuccessIds.includes(row.wallet.id);
                const deleteError = deleteErrors[row.wallet.id];
                const aliasText =
                  row.wallet.alias && row.wallet.alias !== row.wallet.displayName
                    ? row.wallet.alias
                    : null;

                return (
                  <tr
                    key={row.wallet.id}
                    className={`${styles.tableRow} ${focused ? styles.activeRow : ""} ${checked ? styles.checkedRow : ""} ${deleteArmed ? styles.rowDeleteArmed : ""} ${deleteSucceeded ? styles.rowDeleteSuccess : ""}`}
                    onClick={() => setFocusRowId(row.wallet.id)}
                  >
                    <td className={styles.checkboxCell} onClick={(event) => event.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={checked}
                        readOnly
                        onClick={(event) => {
                          event.stopPropagation();
                          toggleRowSelection(row.wallet.id, event.shiftKey);
                        }}
                        aria-label={`选择 ${row.wallet.displayName}`}
                      />
                    </td>

                    <td>
                      <div className={styles.identityCell}>
                        <div className={styles.identityBlock}>
                        <div className={styles.identityTop}>
                          <div className={styles.identityStack}>
                            <div className={styles.identityTitleRow}>
                              <span className={styles.identityTitle}>{row.wallet.displayName}</span>
                              {aliasText ? <span className={styles.identityAlias}>{aliasText}</span> : null}
                            </div>
                            <div className={styles.identityMeta}>
                              <span className={styles.identityMono}>{shortAddress(row.wallet.address)}</span>
                              <span className={styles.sourcePill}>{row.sourceMeta.label}</span>
                              {row.wallet.watchlisted ? <span className={styles.panelTag}>Watchlist</span> : null}
                            </div>
                            {row.sourceMeta.sourceName || row.sourceMeta.importBatchId ? (
                              <div className={styles.identitySubtle}>
                                {row.sourceMeta.sourceName ?? "未命名批次"}
                                {row.sourceMeta.importBatchId
                                  ? ` · 批次 ${row.sourceMeta.importBatchId.slice(0, 8)}`
                                  : ""}
                              </div>
                            ) : null}
                          </div>

                          <div className={styles.rowActions} data-delete-scope={row.wallet.id}>
                            {row.finderAi ? (
                              <button
                                type="button"
                                className={styles.iconButton}
                                disabled={deletePendingId === row.wallet.id}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  openFinderAiDetail(row.wallet.id);
                                }}
                              >
                                AI 解读
                              </button>
                            ) : null}
                            <button
                              type="button"
                              className={styles.iconButton}
                              disabled={deletePendingId === row.wallet.id}
                              onClick={(event) => {
                                event.stopPropagation();
                                openInspector(row.wallet.id, "inspect");
                              }}
                            >
                              检查
                            </button>
                            {!deleteArmed && !row.wallet.deletedAt ? (
                              <button
                                type="button"
                                className={styles.dangerTextButton}
                                disabled={deletePendingId === row.wallet.id}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setArmedDeleteId(row.wallet.id);
                                }}
                              >
                                删除
                              </button>
                            ) : null}
                          </div>
                        </div>

                        <div className={styles.inlineTags}>
                          {highlightChips.map((badge) => (
                            <span key={badge.id} className={styles.inlineTag} data-tone={badge.tone}>
                              {badge.text}
                            </span>
                          ))}
                          {extraHighlights > 0 ? (
                            <span className={styles.inlineTag}>+{extraHighlights}</span>
                          ) : null}
                        </div>

                        {deleteArmed ? (
                          <div className={styles.deleteConfirm} data-delete-scope={row.wallet.id}>
                            <button
                              type="button"
                              className={styles.deleteConfirmButton}
                              disabled={deletePendingId === row.wallet.id}
                              onClick={(event) => {
                                event.stopPropagation();
                                void runRowDelete(row.wallet.id);
                              }}
                            >
                              {deletePendingId === row.wallet.id ? "删除中..." : "确认删除"}
                            </button>
                            <button
                              type="button"
                              className={styles.cancelButton}
                              onClick={(event) => {
                                event.stopPropagation();
                                setArmedDeleteId(null);
                              }}
                            >
                              取消
                            </button>
                            <span className={styles.identitySubtle}>2.5 秒后自动取消</span>
                          </div>
                        ) : null}

                        {deleteSucceeded ? (
                          <div className={styles.inlineSuccess}>已删除，正在同步列表…</div>
                        ) : null}
                        {deleteError ? <div className={styles.inlineError}>{deleteError}</div> : null}
                        </div>
                        <WalletDigestCard
                          row={row}
                          onOpenInspector={(walletId) => openInspector(walletId, "inspect")}
                          onOpenDetail={(walletId) => {
                            window.location.href = `/wallets/${walletId}`;
                          }}
                        />
                      </div>
                    </td>

                    {showSummaryColumn ? (
                      <td className={styles.summaryCell}>
                        {shortText(row.summaryText || "待补充摘要", 96)}
                      </td>
                    ) : null}

                    <td>
                      <div className={styles.statusStack}>
                        {row.statusBadges
                          .filter((badge) => badge.tone !== "ai-review")
                          .map(renderStatusBadge)}
                      </div>
                    </td>

                    {showUpdatedColumn ? (
                      <td className={styles.updatedCell}>{formatDate(row.wallet.updatedAt)}</td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className={styles.pagination}>
          <div className={styles.paginationMeta}>
            当前返回 {currentData.pageMeta.returnedCount} 条，共 {currentData.totalCount} 条
            {currentData.pageMeta.cursor ? `，游标 ${currentData.pageMeta.cursor}` : ""}
          </div>
          <div className={styles.paginationActions}>
            <button
              type="button"
              className={styles.ghostButton}
              disabled={!queryState.cursor}
              onClick={() =>
                patchQuery(
                  { cursor: undefined },
                  { resetCursor: false, clearSelection: true, closePanel: true }
                )
              }
            >
              返回第一页
            </button>
            <button
              type="button"
              className={styles.primaryButton}
              disabled={!currentData.nextCursor}
              onClick={() =>
                patchQuery(
                  { cursor: currentData.nextCursor },
                  { resetCursor: false, clearSelection: true, closePanel: true }
                )
              }
            >
              下一页
            </button>
          </div>
        </div>
      </section>

      <div
        className={`${styles.panelScrim} ${!panelOpen || panelPinned ? styles.panelScrimPinned : ""}`}
        onClick={() => {
          if (!panelPinned) {
            closeInspector();
          }
        }}
        aria-hidden={!panelOpen}
      />

      <aside
        className={`${styles.panel} ${panelOpen ? styles.panelVisible : styles.panelHidden} ${panelPinned && canPinPanel ? styles.panelPinned : ""}`}
      >
        <div className={styles.panelHeader}>
          <div>
            <p>地址检查器</p>
            <h2>{inspectorTitle}</h2>
            <div className={styles.identityMeta}>
              {panelWallet ? <span className={styles.identityMono}>{panelWallet.address}</span> : null}
              {panelWallet?.deletedAt ? <span className={styles.panelTag}>已删除</span> : null}
            </div>
          </div>
          <div className={styles.panelHeaderActions}>
            {canPinPanel ? (
              <button
                type="button"
                className={styles.iconButton}
                onClick={() => setPanelPinned((current) => !current)}
              >
                {panelPinned ? "取消停靠" : "停靠"}
              </button>
            ) : null}
            <button type="button" className={styles.iconButton} onClick={closeInspector}>
              关闭
            </button>
          </div>
        </div>

        <div className={styles.panelToolbar}>
          <div className={styles.panelAnchors}>
            {INSPECTOR_SECTIONS.map((section) => (
              <button
                key={section.id}
                type="button"
                className={`${styles.anchorButton} ${panelSection === section.id ? styles.anchorButtonActive : ""}`}
                onClick={() => jumpToSection(section.id)}
              >
                {section.label}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.panelBody}>
          {!panelTargetId ? (
            <div className={styles.emptyState}>
              先在表格里选中一行，再按 Enter、按 I，或者点击行尾的“检查”打开地址检查器。
            </div>
          ) : null}

          {panelTargetId && detailLoading ? (
            <div className={styles.emptyState}>正在读取地址详情...</div>
          ) : null}

          {panelTargetId && detailError ? (
            <div className={styles.emptyState}>{detailError}</div>
          ) : null}

          {panelWallet ? (
            <>
              <div
                ref={(node) => {
                  sectionRefs.current.digest = node;
                }}
                className={styles.panelSection}
              >
                <div className={styles.panelSectionTitle}>画像速览</div>
                <WalletInspectorDigest
                  walletId={panelWallet.id}
                  detail={detail}
                  onOpenDetail={() => {
                    closeInspector();
                    window.location.href = `/wallets/${panelWallet.id}`;
                  }}
                />
              </div>

              <div
                ref={(node) => {
                  sectionRefs.current.meta = node;
                }}
                className={styles.panelSection}
              >
                <div className={styles.panelSectionTitle}>资料</div>
                <div className={styles.metaCard}>
                  <div className={styles.metaRow}>
                    <span>显示名</span>
                    <strong>{panelWallet.displayName}</strong>
                  </div>
                  <div className={styles.metaRow}>
                    <span>扩展别名</span>
                    <strong>{panelWallet.alias ?? panelWallet.displayName}</strong>
                  </div>
                  <div className={styles.metaRow}>
                    <span>一句话摘要</span>
                    <strong>{panelWallet.strategyFocus || "待补充"}</strong>
                  </div>
                  {panelFinderAi ? (
                    <>
                      <div className={styles.metaRow}>
                        <span>Finder AI 结论</span>
                        <strong>{panelFinderAi.aiBriefShort || panelFinderAi.strategyFocus || "已同步"}</strong>
                      </div>
                      <div className={styles.metaRow}>
                        <span>Finder AI 状态</span>
                        <strong>
                          {panelFinderAi.needsReview
                            ? "需查看"
                            : panelFinderAi.hasConflict
                              ? "有冲突"
                              : "可展示"}
                        </strong>
                      </div>
                      <div className={styles.editActions}>
                        <button
                          type="button"
                          className={styles.primaryButton}
                          onClick={() => setFinderAiOpen(true)}
                        >
                          查看 AI 解读
                        </button>
                      </div>
                    </>
                  ) : null}
                  <div className={styles.metaRow}>
                    <span>来源</span>
                    <strong>{panelRow?.sourceMeta.label ?? panelWallet.sourceType}</strong>
                  </div>
                  <div className={styles.metaRow}>
                    <span>Finder run</span>
                    <strong>
                      {panelRow?.sourceMeta.sourceName
                        ? shortText(panelRow.sourceMeta.sourceName, 42)
                        : "未记录"}
                    </strong>
                  </div>
                  <div className={styles.metaRow}>
                    <span>导入批次</span>
                    <strong>
                      {panelRow?.sourceMeta.importBatchId
                        ? `${panelRow.sourceMeta.importBatchId.slice(0, 8)}…`
                        : "未关联"}
                    </strong>
                  </div>
                  <div className={styles.metaRow}>
                    <span>导入 / 更新</span>
                    <strong>
                      {formatDate(panelRow?.sourceMeta.importedAt)} · {formatDate(panelWallet.updatedAt)}
                    </strong>
                  </div>
                  {panelWallet.deletedAt ? (
                    <div className={styles.metaRow}>
                      <span>删除时间</span>
                      <strong>{formatDate(panelWallet.deletedAt)}</strong>
                    </div>
                  ) : null}
                </div>

                <div className={styles.metaCard}>
                  <div className={styles.editField}>
                    <label className={styles.fieldLabel}>扩展别名</label>
                    <input
                      className={styles.textInput}
                      value={editForm.alias}
                      onChange={(event) => setEditForm((current) => ({ ...current, alias: event.target.value }))}
                    />
                  </div>
                  <div className={styles.editField}>
                    <label className={styles.fieldLabel}>一句话摘要</label>
                    <textarea
                      className={styles.textArea}
                      value={editForm.strategyFocus}
                      onChange={(event) =>
                        setEditForm((current) => ({ ...current, strategyFocus: event.target.value }))
                      }
                    />
                  </div>
                  <div className={styles.editField}>
                    <label className={styles.fieldLabel}>团队备注</label>
                    <textarea
                      className={styles.textArea}
                      value={editForm.teamNote}
                      onChange={(event) => setEditForm((current) => ({ ...current, teamNote: event.target.value }))}
                    />
                  </div>
                  <div className={styles.editActions}>
                    <button type="button" className={styles.primaryButton} onClick={() => void saveQuickEdit()}>
                      保存快速编辑
                    </button>
                    <button
                      type="button"
                      className={styles.ghostButton}
                      onClick={() => void toggleWatchlist(panelWallet.id, !panelWallet.watchlisted)}
                    >
                      {panelWallet.watchlisted ? "移出 Watchlist" : "加入 Watchlist"}
                    </button>
                  </div>
                </div>
              </div>

              <div className={styles.panelFooter}>
                <AppLink className={styles.detailLink} href={`/wallets/${panelWallet.id}`}>
                  打开完整详情页
                </AppLink>
              </div>
            </>
          ) : null}
        </div>
      </aside>

      <Modal
        open={createOpen}
        title="手动新增地址"
        description="只保留最小字段：地址、显示名、扩展别名、标签串和团队备注。时间戳由系统自动生成。"
        onClose={() => setCreateOpen(false)}
      >
        <WalletCreateForm
          variant="modal"
          onSuccess={() => {
            setCreateOpen(false);
            refreshWorkspace();
          }}
        />
      </Modal>

      <Modal
        open={importOpen}
        title={importSourceMode === "finder" ? "从 Finder 导入地址" : "AI 导入地址"}
        description={
          importSourceMode === "finder"
            ? "读取 Finder 当前候选地址，先生成预览，确认后再写入地址库。"
            : "支持文件上传和文本粘贴，固定走“先预览再确认写库”，不会直接自动入库。"
        }
        onClose={() => setImportOpen(false)}
      >
        <WalletImportPanel
          initialSourceMode={importSourceMode}
          onCommitted={() => {
            setImportOpen(false);
            refreshWorkspace();
          }}
        />
      </Modal>

      <Modal
        open={Boolean(finderAiOpen && panelFinderAi)}
        title="Finder AI 解读详情"
        description={
          panelWallet
            ? `${panelWallet.alias ?? panelWallet.displayName} 的 Finder v6 深度分析，来自最近一次同步结果。`
            : "Finder v6 深度分析"
        }
        onClose={() => setFinderAiOpen(false)}
      >
        {panelFinderAi ? (
          <div className={styles.labelEditorList}>
            <div className={styles.metaCard}>
              <div className={styles.subtleHeader}>
                <strong>结论 / 策略结论</strong>
                <span>{panelFinderAiMeta || formatDate(panelFinderAi.updatedAt)}</span>
              </div>
              <div className={styles.longText}>
                {panelFinderAi.aiBriefShort || panelFinderAi.strategyFocus || "待补充"}
              </div>
            </div>

            {panelFinderAi.aiBriefNote ? (
              <div className={styles.metaCard}>
                <div className={styles.subtleHeader}>
                  <strong>摘要说明</strong>
                  <span>{panelFinderAi.needsReview ? "需查看" : "可展示"}</span>
                </div>
                <div className={styles.longText}>{panelFinderAi.aiBriefNote}</div>
              </div>
            ) : null}

            {panelFinderAi.aiDeepNote ? (
              <div className={styles.metaCard}>
                <div className={styles.subtleHeader}>
                  <strong>深度解读</strong>
                  <span>{panelFinderAi.hasConflict ? "有冲突" : "已同步"}</span>
                </div>
                <div className={styles.longText}>{panelFinderAi.aiDeepNote}</div>
              </div>
            ) : null}

            <div className={styles.analysisGrid}>
              {panelFinderAi.keyMetrics?.length ? (
                <div className={styles.metaCard}>
                  <strong>关键指标</strong>
                  <div className={styles.identityMeta}>
                    {panelFinderAi.keyMetrics.map((metric, index) => (
                      <span key={`${metric.key ?? metric.label}-${index}`} className={styles.panelTag}>
                        {metric.label}: {String(metric.value ?? "--")}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}

              {panelFinderAi.labels?.length ? (
                <div className={styles.metaCard}>
                  <strong>同步标签</strong>
                  <div className={styles.identityMeta}>
                    {panelFinderAi.labels.map((label, index) => (
                      <span key={`${label.kind ?? "label"}-${label.value}-${index}`} className={styles.panelTag}>
                        {label.kind ? `${label.kind}: ` : ""}
                        {label.value}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>

            {panelFinderAi.primarySignals?.length ? (
              <div className={styles.metaCard}>
                <div className={styles.subtleHeader}>
                  <strong>命中信号</strong>
                  <span>{panelFinderAi.primarySignals.length} 条</span>
                </div>
                <div className={styles.labelEditorList}>
                  {panelFinderAi.primarySignals.map((signal, index) => (
                    <div key={`${signal.key ?? signal.label}-${index}`} className={styles.labelEditorCard}>
                      <div className={styles.labelEditorTop}>
                        <strong>{signal.label}</strong>
                        <span className={styles.panelTag}>{signal.matched === false ? "未命中" : "命中"}</span>
                      </div>
                      {signal.reason ? <div className={styles.longText}>{signal.reason}</div> : null}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {panelFinderAi.sourceExcerpt ? (
              <div className={styles.metaCard}>
                <div className={styles.subtleHeader}>
                  <strong>来源摘录</strong>
                  <span>{panelFinderAi.runId || "未记录 Run ID"}</span>
                </div>
                <div className={styles.longText}>{panelFinderAi.sourceExcerpt}</div>
              </div>
            ) : null}
          </div>
        ) : (
          <div className={styles.emptyState}>当前地址还没有 Finder AI 解读。</div>
        )}
      </Modal>

      {feedback ? <div className={styles.loadingOverlay} role="status" aria-live="polite">{feedback}</div> : null}
      {routeSyncing ? <div className={styles.loadingOverlay} role="status" aria-live="polite">正在同步最新结果...</div> : null}
    </div>
  );
};
