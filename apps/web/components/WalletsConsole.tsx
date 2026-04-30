"use client";

import { useDeferredValue, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import type {
  WalletAdminRow,
  WalletListPanelMode,
  WalletListQuery,
  WalletListResponse,
  WalletSavedView,
  WalletStatusBadge
} from "@weather-smart-money/core";

import type { WalletDetailData } from "../lib/data";
import { stringifyWalletListQuery } from "../lib/wallets-query";
import { AppLink } from "./AppLink";
import { Modal } from "./Modal";
import { WalletCreateForm } from "./WalletCreateForm";
import { WalletImportPanel, type WalletImportSourceMode } from "./WalletImportPanel";
import styles from "./WalletsConsole.module.css";

type ColumnPreset = "compact" | "standard" | "review";
type InspectorSection = "overview" | "labels" | "records" | "analysis";
type DensityMode = "compact" | "comfortable";
type LabelDraft = {
  name: string;
  value: string;
  kind: string;
  source: string;
  evidence: string;
  verificationNote: string;
  sourceNote: string;
};
type ReviewAction = "promote" | "edit_and_promote" | "dismiss" | "complete_review";

const REVIEW_ACTION_LABELS: Record<ReviewAction, string> = {
  promote: "转官方",
  edit_and_promote: "编辑后转官方",
  dismiss: "忽略",
  complete_review: "完成复核"
};

const DENSITY_STORAGE_KEY = "wallet-workspace-density";
const PANEL_PINNED_STORAGE_KEY = "wallet-workspace-panel-pinned";
const HELP_STORAGE_KEY = "wallet-workspace-help-open";
const FLASH_STORAGE_KEY = "wallet-workspace-flash";

const SORT_OPTIONS = [
  { value: "updated_desc", label: "最近更新" },
  { value: "created_desc", label: "最近新增" },
  { value: "name_asc", label: "名称 A-Z" }
] as const;

const LIMIT_OPTIONS = [50, 100, 200] as const;

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
  { value: "review_needed", label: "AI 待确认" },
  { value: "deleted", label: "已删除" }
] as const;

const COLUMN_PRESETS: Array<{ value: ColumnPreset; label: string }> = [
  { value: "compact", label: "紧凑" },
  { value: "standard", label: "标准" },
  { value: "review", label: "审阅" }
];

const SYSTEM_VIEWS = [
  { id: "all", label: "全部地址" },
  { id: "watchlist", label: "Watchlist" },
  { id: "recent-created", label: "最近新增" },
  { id: "review", label: "AI 待确认" },
  { id: "deleted", label: "已删除" }
] as const;

const INSPECTOR_SECTIONS: Array<{ id: InspectorSection; label: string }> = [
  { id: "overview", label: "概览" },
  { id: "labels", label: "标签" },
  { id: "records", label: "记录" },
  { id: "analysis", label: "分析摘要" }
];

const shortAddress = (address: string) =>
  address.length > 18 ? `${address.slice(0, 8)}...${address.slice(-6)}` : address;

const shortText = (value: string, max = 108) =>
  value.length > max ? `${value.slice(0, max - 1).trimEnd()}...` : value;

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
    return "review";
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

const toLabelDraft = (label: WalletAdminRow["labels"][number]): LabelDraft => ({
  name: label.name,
  value: label.value,
  kind: label.kind,
  source: label.source,
  evidence: label.evidence ?? "",
  verificationNote: label.verificationNote ?? "",
  sourceNote: label.sourceNote ?? ""
});

export const WalletsConsole = ({
  initialData,
  savedViews,
  initialQuery,
  initialSelectedWalletDetail
}: {
  initialData: WalletListResponse;
  savedViews: WalletSavedView[];
  initialQuery: WalletListQuery;
  initialSelectedWalletDetail: WalletDetailData | null;
}) => {
  const router = useRouter();
  const pathname = usePathname();
  const [isNavigating, startNavigation] = useTransition();
  const [queryState, setQueryState] = useState(initialQuery);
  const [searchDraft, setSearchDraft] = useState(initialQuery.q ?? "");
  const deferredSearch = useDeferredValue(searchDraft);
  const [focusRowId, setFocusRowId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectionAnchorId, setSelectionAnchorId] = useState<string | null>(null);
  const [panelMode, setPanelMode] = useState<WalletListPanelMode>(initialQuery.panel ?? "inspect");
  const [panelTargetId, setPanelTargetId] = useState<string | null>(initialQuery.selected ?? null);
  const [panelOpen, setPanelOpen] = useState(Boolean(initialQuery.selected && initialQuery.panel));
  const [panelSection, setPanelSection] = useState<InspectorSection>("overview");
  const [detail, setDetail] = useState<WalletDetailData | null>(initialSelectedWalletDetail);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [columnPreset, setColumnPreset] = useState<ColumnPreset>("standard");
  const [density, setDensity] = useState<DensityMode>("compact");
  const [panelPinned, setPanelPinned] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
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
  const [labelDrafts, setLabelDrafts] = useState<Record<string, LabelDraft>>({});
  const [reviewTrayOpen, setReviewTrayOpen] = useState(initialQuery.status === "review_needed");
  const [reviewPendingKey, setReviewPendingKey] = useState<string | null>(null);
  const [viewportWidth, setViewportWidth] = useState(0);

  const sectionRefs = useRef<Record<InspectorSection, HTMLDivElement | null>>({
    overview: null,
    labels: null,
    records: null,
    analysis: null
  });
  const deleteTimerRef = useRef<number | null>(null);
  const feedbackTimerRef = useRef<number | null>(null);
  const deleteTransitionRef = useRef<number | null>(null);
  const previousSignatureRef = useRef(buildResultSignature(initialQuery));

  const currentData = initialData;
  const visibleRows = useMemo(
    () => currentData.items.filter((row) => !optimisticDeletedIds.includes(row.wallet.id)),
    [currentData.items, optimisticDeletedIds]
  );
  const currentPageIds = useMemo(() => visibleRows.map((row) => row.wallet.id), [visibleRows]);
  const selectedRows = useMemo(
    () => visibleRows.filter((row) => selectedIds.includes(row.wallet.id)),
    [selectedIds, visibleRows]
  );
  const panelWallet =
    detail?.wallet.id === panelTargetId
      ? detail.wallet
      : visibleRows.find((row) => row.wallet.id === panelTargetId)?.wallet ?? null;
  const panelLabels =
    detail?.wallet.id === panelTargetId
      ? detail.labels
      : visibleRows.find((row) => row.wallet.id === panelTargetId)?.labels ?? [];
  const reviewTargetId = panelTargetId ?? focusRowId;
  const reviewRow = visibleRows.find((row) => row.wallet.id === reviewTargetId) ?? null;
  const reviewWallet =
    detail?.wallet.id === reviewTargetId ? detail.wallet : reviewRow?.wallet ?? null;
  const reviewLabels =
    detail?.wallet.id === reviewTargetId ? detail.labels : reviewRow?.labels ?? [];
  const officialReviewLabels = useMemo(
    () => reviewLabels.filter((label) => label.source === "user"),
    [reviewLabels]
  );
  const aiReviewLabels = useMemo(
    () => reviewLabels.filter((label) => label.source !== "user"),
    [reviewLabels]
  );
  const reviewTrayVisible = Boolean(reviewTrayOpen && reviewWallet && !reviewWallet.deletedAt);
  const allCurrentPageSelected =
    currentPageIds.length > 0 && currentPageIds.every((walletId) => selectedIds.includes(walletId));
  const showSummaryColumn = columnPreset !== "compact";
  const showUpdatedColumn = columnPreset !== "review" || density === "comfortable";
  const activeSystemView = getSystemViewId(queryState);
  const canPinPanel = isWideEnoughToPin(viewportWidth);
  const inspectorTitle = panelWallet?.alias ?? panelWallet?.displayName ?? "地址检查器";

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

  const refreshWorkspace = () => {
    startNavigation(() => {
      router.refresh();
    });
  };

  const openInspector = (walletId: string, mode: WalletListPanelMode) => {
    setFocusRowId(walletId);
    setPanelOpen(true);
    setPanelTargetId(walletId);
    setPanelMode(mode);
    setPanelSection("overview");
    setDetailError(null);
    updateLocalQuery({ ...queryState, selected: walletId, panel: mode, cursor: queryState.cursor });
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

    if (viewId === "review") {
      patchQuery(
        { view: viewId, status: "review_needed", sort: queryState.sort ?? "updated_desc", includeDeleted: false },
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

  const applySavedView = (viewId: string) => {
    const view = savedViews.find((item) => item.id === viewId);
    if (!view) {
      return;
    }

    setSearchDraft(view.query.q ?? "");
    patchQuery(
      {
        ...view.query,
        view: view.id,
        selected: undefined,
        panel: undefined
      },
      { resetCursor: true, clearSelection: true, closePanel: true }
    );
  };

  const saveCurrentView = async () => {
    const name = window.prompt("给这个视图起一个名字");
    if (!name?.trim()) {
      return;
    }

    const result = await fetchJson<WalletSavedView>("/api/wallets/views", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name.trim(),
        query: {
          ...queryState,
          cursor: undefined,
          selected: undefined,
          panel: undefined
        }
      })
    });

    if (!result.ok || !result.data) {
      pushFeedback(result.error ?? "保存视图失败");
      return;
    }

    pushFeedback(`已保存视图：${result.data.name}`);
    refreshWorkspace();
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
    const targetWalletId = panelTargetId ?? reviewWallet?.id;
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

  const updateLabelDraftField = (
    tagId: string,
    field: keyof LabelDraft,
    value: string
  ) => {
    setLabelDrafts((current) => {
      const draft = current[tagId];
      if (!draft) {
        return current;
      }
      return {
        ...current,
        [tagId]: {
          ...draft,
          [field]: value
        }
      };
    });
  };

  const saveLabelDraft = async (tagId: string) => {
    const targetWalletId = panelTargetId ?? reviewWallet?.id;
    if (!targetWalletId) {
      return;
    }

    const draft = labelDrafts[tagId];
    if (!draft?.name.trim() || !draft.value.trim()) {
      pushFeedback("标签名称和值不能为空");
      return;
    }
    if (draft.source !== "user") {
      pushFeedback("仅官方标签支持在线编辑，AI/系统标签请通过导入流程调整。");
      return;
    }

    const response = await fetch(`/api/wallets/${targetWalletId}/user-tags/${tagId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: draft.name.trim(),
        value: draft.value.trim(),
        kind: draft.kind,
        source: draft.source,
        evidence: draft.evidence.trim() || undefined,
        verificationNote: draft.verificationNote.trim() || undefined,
        sourceNote: draft.sourceNote.trim() || undefined
      })
    });
    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    if (!response.ok) {
      pushFeedback(payload.error ?? "标签更新失败");
      return;
    }

    pushFeedback("标签已更新");
    refreshWorkspace();
  };

  const removeLabelDraft = async (tagId: string) => {
    const targetWalletId = panelTargetId ?? reviewWallet?.id;
    if (!targetWalletId) {
      return;
    }

    const draft = labelDrafts[tagId];
    if (!draft) {
      return;
    }
    if (draft.source !== "user") {
      pushFeedback("仅官方标签支持删除。");
      return;
    }

    const response = await fetch(`/api/wallets/${targetWalletId}/user-tags/${tagId}`, {
      method: "DELETE"
    });
    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    if (!response.ok) {
      pushFeedback(payload.error ?? "标签删除失败");
      return;
    }

    pushFeedback("标签已删除");
    refreshWorkspace();
  };

  const runReviewAction = async (action: ReviewAction, tagId?: string) => {
    if (!reviewWallet) {
      return;
    }

    const draft = tagId ? labelDrafts[tagId] : undefined;
    const reviewKey = `${action}:${tagId ?? reviewWallet.id}`;
    setReviewPendingKey(reviewKey);

    const body =
      action === "complete_review"
        ? { action: "complete_wallet_review" }
        : action === "dismiss"
          ? { action: "dismiss_ai_label", labelId: tagId }
          : action === "edit_and_promote"
            ? {
                action: "edit_and_promote_ai_label",
                labelId: tagId,
                name: draft?.name?.trim() || undefined,
                value: draft?.value?.trim() || undefined,
                kind: draft?.kind || undefined,
                evidence: draft?.evidence?.trim() || undefined,
                verificationNote: draft?.verificationNote?.trim() || undefined,
                sourceNote: draft?.sourceNote?.trim() || undefined
              }
            : { action: "promote_ai_to_official", labelId: tagId };

    const result = await fetchJson<WalletDetailData>(`/api/wallets/${reviewWallet.id}/review`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });

    setReviewPendingKey(null);

    if (!result.ok || !result.data) {
      pushFeedback(result.error ?? "复核动作失败");
      return;
    }

    setDetail(result.data);
    if (tagId) {
      setLabelDrafts((current) => {
        const next = { ...current };
        delete next[tagId];
        return next;
      });
    }

    pushFeedback(REVIEW_ACTION_LABELS[action]);
    if (action === "complete_review") {
      setReviewTrayOpen(false);
    }
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
    if ((queryState.q ?? "") === deferredSearch) {
      return;
    }

    patchQuery(
      { q: deferredSearch.trim() || undefined },
      { resetCursor: true, clearSelection: true, closePanel: true }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deferredSearch]);

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
    setLabelDrafts((current) => ({
      ...current,
      ...Object.fromEntries(reviewLabels.map((label) => [label.id, toLabelDraft(label)]))
    }));
  }, [reviewLabels]);

  useEffect(() => {
    if (reviewTargetId) {
      setReviewTrayOpen(true);
    }
  }, [reviewTargetId]);

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
        if (panelOpen && panelMode === "edit") {
          setPanelMode("inspect");
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
        openInspector(focusRowId, event.key.toLowerCase() === "i" ? "inspect" : panelMode);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [armedDeleteId, closeInspector, focusRowId, openInspector, panelMode, panelOpen]);

  const activeFilterChips = [
    queryState.q
      ? { id: `q:${queryState.q}`, label: `搜索：${queryState.q}`, onRemove: () => setSearchDraft("") }
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
            这里是高频整理地址的主工作台。默认只做筛选、扫描、快速编辑、单条删除和批量操作，
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
          <span>AI 待确认</span>
          <strong>{currentData.facetCounts.reviewNeededCount}</strong>
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
            <input
              value={searchDraft}
              onChange={(event) => setSearchDraft(event.target.value)}
              placeholder="搜索地址、显示名、别名、标签或摘要"
              className={styles.searchInput}
            />
          </label>

          <label className={styles.compactField}>
            <span className={styles.fieldLabel}>保存视图</span>
            <select
              className={styles.select}
              value={queryState.view ?? ""}
              onChange={(event) => {
                const value = event.target.value;
                if (!value) {
                  patchQuery({ view: undefined }, { resetCursor: true, closePanel: true });
                  return;
                }
                applySavedView(value);
              }}
            >
              <option value="">未选择</option>
              {savedViews.map((view) => (
                <option key={view.id} value={view.id}>
                  {view.name}
                </option>
              ))}
            </select>
          </label>

          <label className={styles.compactField}>
            <span className={styles.fieldLabel}>状态</span>
            <select
              className={styles.select}
              value={queryState.status ?? "all"}
              onChange={(event) =>
                patchQuery(
                  {
                    status: event.target.value as WalletListQuery["status"],
                    includeDeleted: event.target.value === "deleted"
                  },
                  { resetCursor: true, clearSelection: true, closePanel: true }
                )
              }
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
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
            <span className={styles.fieldLabel}>排序</span>
            <select
              className={styles.select}
              value={queryState.sort ?? "updated_desc"}
              onChange={(event) =>
                patchQuery(
                  { sort: event.target.value as WalletListQuery["sort"] },
                  { resetCursor: true, clearSelection: true, closePanel: true }
                )
              }
            >
              {SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
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
            <button type="button" className={styles.ghostButton} onClick={saveCurrentView}>
              保存当前视图
            </button>
            <button type="button" className={styles.ghostButton} onClick={clearFilters}>
              清空筛选
            </button>
          </div>
        </div>

        <div className={styles.filterFooter}>
          <div className={styles.viewRail}>
            <span className={styles.fieldLabel}>热门标签</span>
            <div className={styles.inlineTags}>
              {currentData.facetCounts.labelCounts.slice(0, 8).map((label) => {
                const active = (queryState.labels ?? []).includes(label.key);
                return (
                  <button
                    key={label.key}
                    type="button"
                    className={`${styles.labelChip} ${active ? styles.labelChipActive : ""}`}
                    onClick={() => toggleLabelFilter(label.key)}
                  >
                    <span>{label.label}</span>
                    <strong>{label.count}</strong>
                  </button>
                );
              })}
            </div>
          </div>

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
            单击一行只会选中，不会自动打开详情。按 Enter、按 I 或点行尾“检查/快编”才会打开右侧检查器；
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
                      当前筛选下没有地址。可以尝试放宽筛选条件，或直接使用 AI 导入 / 手动新增继续扩库。
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
                            <button
                              type="button"
                              className={styles.iconButton}
                              disabled={deletePendingId === row.wallet.id}
                              onClick={(event) => {
                                event.stopPropagation();
                                openInspector(row.wallet.id, "edit");
                              }}
                            >
                              快编
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
                            <span key={badge.id} className={styles.inlineTag}>
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
                    </td>

                    {showSummaryColumn ? (
                      <td className={styles.summaryCell}>
                        {shortText(row.summaryText || "待补充摘要", columnPreset === "review" ? 160 : 96)}
                      </td>
                    ) : null}

                    <td>
                      <div className={styles.statusStack}>
                        {row.statusBadges.map(renderStatusBadge)}
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

      {reviewTrayVisible ? (
        <section className={styles.reviewTray}>
          <div className={styles.reviewTrayHeader}>
            <div>
              <p className={styles.kicker}>Review Tray</p>
              <h2>{reviewWallet?.alias ?? reviewWallet?.displayName ?? "待复核地址"}</h2>
              <div className={styles.identityMeta}>
                {reviewWallet ? <span className={styles.identityMono}>{reviewWallet.address}</span> : null}
                {reviewRow?.statusBadges.map(renderStatusBadge)}
              </div>
            </div>
            <div className={styles.reviewTrayActions}>
              <button
                type="button"
                className={styles.ghostButton}
                onClick={() => void runReviewAction("complete_review")}
                disabled={reviewPendingKey === `complete_review:${reviewWallet?.id ?? ""}`}
              >
                {REVIEW_ACTION_LABELS.complete_review}
              </button>
              {reviewWallet ? (
                <button
                  type="button"
                  className={styles.ghostButton}
                  onClick={() => void toggleWatchlist(reviewWallet.id, !reviewWallet.watchlisted)}
                >
                  {reviewWallet.watchlisted ? "移出 Watchlist" : "加入 Watchlist"}
                </button>
              ) : null}
              {reviewWallet ? (
                <AppLink className={styles.ghostButton} href={`/wallets/${reviewWallet.id}`}>
                  打开详情页
                </AppLink>
              ) : null}
              <button type="button" className={styles.iconButton} onClick={() => setReviewTrayOpen(false)}>
                暂时收起
              </button>
            </div>
          </div>

          <div className={styles.reviewTrayGrid}>
            <div className={styles.reviewRail}>
              <div className={styles.reviewRailTitle}>地址概览</div>
              <div className={styles.metaCard}>
                <div className={styles.metaRow}>
                  <span>显示名</span>
                  <strong>{reviewWallet?.displayName ?? "--"}</strong>
                </div>
                <div className={styles.metaRow}>
                  <span>一句话摘要</span>
                  <strong>{reviewWallet?.strategyFocus || reviewRow?.summaryText || "待补充摘要"}</strong>
                </div>
                <div className={styles.metaRow}>
                  <span>更新时间</span>
                  <strong>{formatDate(reviewWallet?.updatedAt)}</strong>
                </div>
                <div className={styles.metaRow}>
                  <span>标签概况</span>
                  <strong>官方 {officialReviewLabels.length} / AI {aiReviewLabels.length}</strong>
                </div>
              </div>

              <div className={styles.metaCard}>
                <div className={styles.editField}>
                  <label className={styles.fieldLabel}>新增官方标签</label>
                  <input
                    className={styles.textInput}
                    value={editForm.labelValue}
                    placeholder="例如：高胜率-首尔 / 正常 / 提前埋伏"
                    onChange={(event) =>
                      setEditForm((current) => ({ ...current, labelValue: event.target.value }))
                    }
                  />
                </div>
                <div className={styles.editField}>
                  <label className={styles.fieldLabel}>验证说明</label>
                  <input
                    className={styles.textInput}
                    value={editForm.labelVerificationNote}
                    placeholder="人工确认依据"
                    onChange={(event) =>
                      setEditForm((current) => ({
                        ...current,
                        labelVerificationNote: event.target.value
                      }))
                    }
                  />
                </div>
                <div className={styles.editField}>
                  <label className={styles.fieldLabel}>来源备注</label>
                  <input
                    className={styles.textInput}
                    value={editForm.labelSourceNote}
                    placeholder="数据来源或复核备注"
                    onChange={(event) =>
                      setEditForm((current) => ({ ...current, labelSourceNote: event.target.value }))
                    }
                  />
                </div>
                <button type="button" className={styles.primaryButton} onClick={() => void addQuickLabel()}>
                  新增官方标签
                </button>
              </div>
            </div>

            <div className={styles.reviewRail}>
              <div className={styles.reviewRailTitle}>官方标签轨道</div>
              <div className={styles.reviewRailList}>
                {officialReviewLabels.length > 0 ? (
                  officialReviewLabels.map((label) => {
                    const draft = labelDrafts[label.id] ?? toLabelDraft(label);
                    return (
                      <div key={label.id} className={styles.reviewCard}>
                        <div className={styles.labelEditorTop}>
                          <span className={styles.panelTag}>官方</span>
                          <span className={styles.identitySubtle}>{label.kind}</span>
                        </div>
                        <input
                          className={styles.textInput}
                          value={draft.value}
                          onChange={(event) => updateLabelDraftField(label.id, "value", event.target.value)}
                        />
                        <input
                          className={styles.textInput}
                          value={draft.verificationNote}
                          placeholder="验证说明"
                          onChange={(event) =>
                            updateLabelDraftField(label.id, "verificationNote", event.target.value)
                          }
                        />
                        <input
                          className={styles.textInput}
                          value={draft.sourceNote}
                          placeholder="来源备注"
                          onChange={(event) =>
                            updateLabelDraftField(label.id, "sourceNote", event.target.value)
                          }
                        />
                        <div className={styles.inlineForm}>
                          <button
                            type="button"
                            className={styles.ghostButton}
                            onClick={() => void saveLabelDraft(label.id)}
                          >
                            保存
                          </button>
                          <button
                            type="button"
                            className={styles.dangerTextButton}
                            onClick={() => void removeLabelDraft(label.id)}
                          >
                            删除
                          </button>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className={styles.emptyState}>还没有官方标签，可以先从右侧 AI 候选里转一批。</div>
                )}
              </div>
            </div>

            <div className={styles.reviewRail}>
              <div className={styles.reviewRailTitle}>AI 候选标签轨道</div>
              <div className={styles.reviewRailList}>
                {aiReviewLabels.length > 0 ? (
                  aiReviewLabels.map((label) => {
                    const draft = labelDrafts[label.id] ?? toLabelDraft(label);
                    return (
                      <div key={label.id} className={styles.reviewCard}>
                        <div className={styles.labelEditorTop}>
                          <span className={styles.panelTag}>AI</span>
                          <span className={styles.identitySubtle}>{label.kind}</span>
                        </div>
                        <input
                          className={styles.textInput}
                          value={draft.value}
                          onChange={(event) => updateLabelDraftField(label.id, "value", event.target.value)}
                        />
                        <input
                          className={styles.textInput}
                          value={draft.evidence}
                          placeholder="核心指标 / 证据摘录"
                          onChange={(event) => updateLabelDraftField(label.id, "evidence", event.target.value)}
                        />
                        <input
                          className={styles.textInput}
                          value={draft.verificationNote}
                          placeholder="转官方后的验证说明"
                          onChange={(event) =>
                            updateLabelDraftField(label.id, "verificationNote", event.target.value)
                          }
                        />
                        <input
                          className={styles.textInput}
                          value={draft.sourceNote}
                          placeholder="转官方后的来源备注"
                          onChange={(event) =>
                            updateLabelDraftField(label.id, "sourceNote", event.target.value)
                          }
                        />
                        <div className={styles.reviewCardActions}>
                          <button
                            type="button"
                            className={styles.primaryButton}
                            disabled={reviewPendingKey === `promote:${label.id}`}
                            onClick={() => void runReviewAction("promote", label.id)}
                          >
                            {REVIEW_ACTION_LABELS.promote}
                          </button>
                          <button
                            type="button"
                            className={styles.ghostButton}
                            disabled={reviewPendingKey === `edit_and_promote:${label.id}`}
                            onClick={() => void runReviewAction("edit_and_promote", label.id)}
                          >
                            {REVIEW_ACTION_LABELS.edit_and_promote}
                          </button>
                          <button
                            type="button"
                            className={styles.dangerTextButton}
                            disabled={reviewPendingKey === `dismiss:${label.id}`}
                            onClick={() => void runReviewAction("dismiss", label.id)}
                          >
                            {REVIEW_ACTION_LABELS.dismiss}
                          </button>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className={styles.emptyState}>当前没有待处理 AI 标签，可以直接完成复核。</div>
                )}
              </div>
            </div>
          </div>
        </section>
      ) : null}

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
            <p>{panelMode === "edit" ? "快速编辑" : "地址检查器"}</p>
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
              先在表格里选中一行，再按 Enter、按 I，或者点击行尾的“检查/快编”打开地址检查器。
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
                  sectionRefs.current.overview = node;
                }}
                className={styles.panelSection}
              >
                <div className={styles.panelSectionTitle}>概览</div>
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
                  <div className={styles.metaRow}>
                    <span>来源</span>
                    <strong>
                      {visibleRows.find((row) => row.wallet.id === panelWallet.id)?.sourceMeta.label ??
                        panelWallet.sourceType}
                    </strong>
                  </div>
                  <div className={styles.metaRow}>
                    <span>来源批次</span>
                    <strong>
                      {visibleRows.find((row) => row.wallet.id === panelWallet.id)?.sourceMeta.importBatchId ??
                        "未关联"}
                    </strong>
                  </div>
                  <div className={styles.metaRow}>
                    <span>来源名称</span>
                    <strong>
                      {visibleRows.find((row) => row.wallet.id === panelWallet.id)?.sourceMeta.sourceName ??
                        "未记录"}
                    </strong>
                  </div>
                  <div className={styles.metaRow}>
                    <span>导入时间</span>
                    <strong>
                      {formatDate(
                        visibleRows.find((row) => row.wallet.id === panelWallet.id)?.sourceMeta.importedAt
                      )}
                    </strong>
                  </div>
                  <div className={styles.metaRow}>
                    <span>创建时间</span>
                    <strong>{formatDate(panelWallet.createdAt)}</strong>
                  </div>
                  <div className={styles.metaRow}>
                    <span>更新时间</span>
                    <strong>{formatDate(panelWallet.updatedAt)}</strong>
                  </div>
                  <div className={styles.metaRow}>
                    <span>删除时间</span>
                    <strong>{panelWallet.deletedAt ? formatDate(panelWallet.deletedAt) : "未删除"}</strong>
                  </div>
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

              <div
                ref={(node) => {
                  sectionRefs.current.labels = node;
                }}
                className={styles.panelSection}
              >
                <div className={styles.panelSectionTitle}>标签维护</div>
                <div className={styles.metaCard}>
                  <div className={styles.labelCreateGrid}>
                    <input
                      className={styles.textInput}
                      value={editForm.labelValue}
                      placeholder="新增官方标签值，例如：高胜率-首尔"
                      onChange={(event) =>
                        setEditForm((current) => ({ ...current, labelValue: event.target.value }))
                      }
                    />
                    <input
                      className={styles.textInput}
                      value={editForm.labelVerificationNote}
                      placeholder="验证说明（可选）"
                      onChange={(event) =>
                        setEditForm((current) => ({ ...current, labelVerificationNote: event.target.value }))
                      }
                    />
                    <input
                      className={styles.textInput}
                      value={editForm.labelSourceNote}
                      placeholder="数据来源备注（可选）"
                      onChange={(event) =>
                        setEditForm((current) => ({ ...current, labelSourceNote: event.target.value }))
                      }
                    />
                    <button type="button" className={styles.primaryButton} onClick={() => void addQuickLabel()}>
                      新增官方标签
                    </button>
                  </div>

                  <div className={styles.labelEditorList}>
                    {panelLabels.length > 0 ? (
                      panelLabels.map((label) => {
                        const draft = labelDrafts[label.id] ?? toLabelDraft(label);
                        const editable = label.source === "user";
                        return (
                          <div key={label.id} className={styles.labelEditorCard}>
                            <div className={styles.labelEditorTop}>
                              <span className={styles.panelTag}>{label.source === "user" ? "官方" : "AI"}</span>
                              <span className={styles.identitySubtle}>{label.kind}</span>
                            </div>
                            <input
                              className={styles.textInput}
                              value={draft.value}
                              readOnly={!editable}
                              onChange={(event) => updateLabelDraftField(label.id, "value", event.target.value)}
                            />
                            <input
                              className={styles.textInput}
                              value={draft.verificationNote}
                              placeholder="验证说明（官方标签建议填写）"
                              readOnly={!editable}
                              onChange={(event) =>
                                updateLabelDraftField(label.id, "verificationNote", event.target.value)
                              }
                            />
                            <input
                              className={styles.textInput}
                              value={draft.sourceNote}
                              placeholder="来源备注（如 NOAA/NWS 或团队校验来源）"
                              readOnly={!editable}
                              onChange={(event) => updateLabelDraftField(label.id, "sourceNote", event.target.value)}
                            />
                            {editable ? (
                              <div className={styles.inlineForm}>
                                <button
                                  type="button"
                                  className={styles.ghostButton}
                                  onClick={() => void saveLabelDraft(label.id)}
                                >
                                  保存
                                </button>
                                <button
                                  type="button"
                                  className={styles.dangerTextButton}
                                  onClick={() => void removeLabelDraft(label.id)}
                                >
                                  删除
                                </button>
                              </div>
                            ) : (
                              <span className={styles.identitySubtle}>AI/系统标签为只读展示</span>
                            )}
                          </div>
                        );
                      })
                    ) : (
                      <span className={styles.identitySubtle}>暂时还没有标签。</span>
                    )}
                  </div>
                </div>
              </div>

              <div
                ref={(node) => {
                  sectionRefs.current.records = node;
                }}
                className={styles.panelSection}
              >
                <div className={styles.panelSectionTitle}>记录</div>
                <div className={styles.timeline}>
                  {(detail?.notes ?? []).slice(0, 5).map((note) => (
                    <div key={note.id} className={styles.timelineItem}>
                      <div className={styles.subtleHeader}>
                        <strong>{note.action}</strong>
                        <span>{formatDate(note.createdAt)}</span>
                      </div>
                      <div className={styles.longText}>{note.content}</div>
                      <span>{note.actor}</span>
                    </div>
                  ))}
                  {(detail?.notes?.length ?? 0) === 0 ? (
                    <div className={styles.metaCard}>最近还没有审计记录。</div>
                  ) : null}
                </div>
              </div>

              <div
                ref={(node) => {
                  sectionRefs.current.analysis = node;
                }}
                className={styles.panelSection}
              >
                <div className={styles.panelSectionTitle}>分析摘要</div>
                <div className={styles.analysisGrid}>
                  <div className={styles.metricCard}>
                    <span>胜率</span>
                    <strong>{detail?.metrics.weatherWinRate ?? "--"}%</strong>
                  </div>
                  <div className={styles.metricCard}>
                    <span>平均提前</span>
                    <strong>{detail?.metrics.averageEntryLeadMinutes ?? "--"}m</strong>
                  </div>
                  <div className={styles.metricCard}>
                    <span>风险收益比</span>
                    <strong>{detail?.metrics.avgRiskReward ?? "--"}</strong>
                  </div>
                  <div className={styles.metricCard}>
                    <span>总 PnL</span>
                    <strong>{detail?.metrics.totalRealizedPnlUsd ?? "--"} USD</strong>
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

      {feedback ? <div className={styles.loadingOverlay}>{feedback}</div> : null}
      {isNavigating ? <div className={styles.loadingOverlay}>正在同步最新结果...</div> : null}
    </div>
  );
};
