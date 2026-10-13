import {
  FINDER_LABEL_CATALOG,
  PRIMARY_SIGNAL_KIND_PRIORITY,
  fallbackFinderLabelMeta,
  getFinderLabelMeta,
  normalizeAddress,
  normalizeWalletLabelText,
  type FinderLabelMeta,
  type WalletAiExtractPreviewRow,
  type WalletAiProviderMeta,
  type WalletFinderAiInsight,
  type WalletFinderCityRow,
  type WalletFinderPatternRow,
  type WalletFinderPortraitLabel,
  type WalletFinderProfile,
  type WalletFinderProfileMetric,
  type WalletImportCommitRequest,
  type WalletImportLabelDraft,
  type WalletImportPreviewRow,
  type WalletLabelKind,
  type WalletPrimarySignal,
  type WalletPrimarySignalKind,
  type WalletWeatherSignalDraft
} from "@weather-smart-money/core";

import {
  commitWalletImport,
  listWalletAdminRows,
  previewWalletImportAi,
  type WalletImportCommitResult
} from "./data-service";

type JsonRecord = Record<string, unknown>;

type FinderWalletPayload = {
  row: JsonRecord;
  detail: JsonRecord;
  finderAi?: JsonRecord;
};

export interface FinderImportRequest {
  finderBaseUrl?: string;
  runId?: string;
  limit?: number;
  text?: string;
  sourceName?: string;
  wallets?: unknown[];
  rows?: WalletImportPreviewRow[];
}

export interface FinderImportPreviewResult {
  rows: WalletImportPreviewRow[];
  sourceName: string;
  runId?: string;
  finderBaseUrl?: string;
  totalRows: number;
  validRows: number;
  pulledRows?: number;
  matchedRows?: number;
  filteredOutRows?: number;
  providerMeta?: WalletAiProviderMeta;
  fallbackReason?: string;
  pulledAt: string;
}

export interface FinderImportCommitResult extends FinderImportPreviewResult {
  commit: WalletImportCommitResult;
}

const DEFAULT_FINDER_BASE_URL = "http://127.0.0.1:41874";
const MAX_FINDER_WALLETS = 500;
const FINDER_DETAIL_CONCURRENCY = 6;
const FINDER_LABEL_SOURCE_NOTE = "Finder-app 分析同步";

const UNKNOWN_WEATHER_SIGNALS: WalletWeatherSignalDraft = {
  marketScope: "unknown",
  resolutionSource: "unknown",
  forecastBasis: "unknown",
  timingWindow: "unknown",
  edgeStyle: "unknown",
  weatherDrivers: [],
  evidenceQuality: "insufficient"
};

const LEGACY_LABEL_KEY_META: Record<
  string,
  {
    reportTitle: string;
    name: string;
    kind: WalletLabelKind;
    signalKind?: WalletPrimarySignalKind;
    fallbackValue: string;
  }
> = {
  high_frequency_region: {
    reportTitle: "高频交易地区",
    name: "高频地区",
    kind: "frequency_region",
    signalKind: "frequency_region",
    fallbackValue: "高频地区"
  },
  high_daily_region_profit: {
    reportTitle: "高暴击",
    name: "高暴击地区",
    kind: "payout_region",
    signalKind: "payout_region",
    fallbackValue: "高暴击"
  },
  regional_high_win_rate: {
    reportTitle: "高胜率",
    name: "高胜率地区",
    kind: "winrate_region",
    signalKind: "winrate_region",
    fallbackValue: "高胜率"
  },
  lottery_player: {
    reportTitle: "彩票型选手",
    name: "选手类型",
    kind: "trader_archetype",
    signalKind: "trader_archetype",
    fallbackValue: "彩票型选手"
  },
  split_player: {
    reportTitle: "拆分型选手",
    name: "选手类型",
    kind: "trader_archetype",
    signalKind: "trader_archetype",
    fallbackValue: "拆分型选手"
  },
  liquidity_player: {
    reportTitle: "流动型选手",
    name: "选手类型",
    kind: "trader_archetype",
    signalKind: "trader_archetype",
    fallbackValue: "流动型选手"
  },
  normal_active: {
    reportTitle: "活跃",
    name: "活跃标签",
    kind: "activity_level",
    fallbackValue: "正常"
  },
  low_active: {
    reportTitle: "活跃",
    name: "活跃标签",
    kind: "activity_level",
    fallbackValue: "低活跃"
  },
  new_wallet: {
    reportTitle: "新钱包",
    name: "新钱包标签",
    kind: "new_wallet_signal",
    fallbackValue: "新钱包"
  },
  hidden_expert_new_wallet: {
    reportTitle: "新钱包",
    name: "新钱包标签",
    kind: "new_wallet_signal",
    fallbackValue: "隐藏高手新钱包"
  },
  early_positioning: {
    reportTitle: "提前埋伏",
    name: "提前埋伏",
    kind: "early_entry_signal",
    fallbackValue: "提前埋伏"
  }
};

/**
 * Finder 大更新后的标签映射：核心目录（含风格画像/外部画像/数据状态）打底，
 * 老 key 的既有映射原样覆盖，保证既有标签展示不变。
 */
const LABEL_KEY_META: Record<
  string,
  {
    reportTitle: string;
    name: string;
    kind: WalletLabelKind;
    signalKind?: WalletPrimarySignalKind;
    fallbackValue: string;
  }
> = {
  ...FINDER_LABEL_CATALOG,
  ...LEGACY_LABEL_KEY_META
};

const text = (value: unknown) => {
  if (typeof value === "string") {
    return value.replace(/\s+/g, " ").trim();
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return "";
};

const truncate = (value: string, maxLength: number) =>
  value.length <= maxLength ? value : `${value.slice(0, maxLength - 3).trimEnd()}...`;

const asRecord = (value: unknown): JsonRecord =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {};

const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

const numberText = (value: unknown, digits = 2) => {
  const numeric = typeof value === "number" ? value : Number.parseFloat(text(value));
  return Number.isFinite(numeric) ? numeric.toFixed(digits).replace(/\.?0+$/u, "") : "";
};

const percentText = (value: unknown) => {
  const numeric = typeof value === "number" ? value : Number.parseFloat(text(value));
  if (!Number.isFinite(numeric)) {
    return "";
  }
  return `${(numeric * 100).toFixed(1)}%`;
};

const normalizeFinderBaseUrl = (raw?: string) => {
  const url = new URL(raw?.trim() || DEFAULT_FINDER_BASE_URL);
  const hostname = url.hostname.toLowerCase();
  if (url.protocol !== "http:" || !["localhost", "127.0.0.1", "::1"].includes(hostname)) {
    throw new Error("Finder API 只允许读取本机 http://127.0.0.1 / localhost 地址");
  }
  url.pathname = url.pathname.replace(/\/+$/u, "");
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/u, "");
};

const fetchFinderJson = async <T,>(baseUrl: string, path: string): Promise<T> => {
  const response = await fetch(`${baseUrl}${path}`, { cache: "no-store" });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(
      `Finder API ${path} 返回 ${response.status}: ${text((payload as { error?: unknown })?.error) || response.statusText}`
    );
  }
  return payload as T;
};

const getFinderWalletAddress = (row: JsonRecord, detail?: JsonRecord) =>
  text(row.wallet) ||
  text(row.address) ||
  text(row.proxyWallet) ||
  text(asRecord(detail?.selection_record).wallet) ||
  text(asRecord(detail?.screening).wallet) ||
  text(detail?.wallet);

const getFinderUserName = (row: JsonRecord, detail?: JsonRecord) =>
  text(row.user_name) ||
  text(row.userName) ||
  text(row.username) ||
  text(asRecord(detail?.leaderboard_entry).userName) ||
  text(asRecord(detail?.leaderboard_entry).user_name) ||
  text(asRecord(detail?.profile).userName);

const getFinderXUserName = (row: JsonRecord, detail?: JsonRecord) =>
  text(row.x_username) ||
  text(row.xUsername) ||
  text(asRecord(detail?.leaderboard_entry).xUsername) ||
  text(asRecord(detail?.leaderboard_entry).x_username) ||
  text(asRecord(detail?.profile).xUsername);

const regionFromDisplayName = (value: string) => {
  const afterColon = value.split(/[:：]/u)[1];
  return text(afterColon).replace(/地区$/u, "");
};

const labelValueFromEvaluation = (item: JsonRecord, meta: (typeof LABEL_KEY_META)[string]) => {
  const displayName = text(item.display_name) || text(item.name) || text(item.title);
  const details = asRecord(item.details ?? item.facts);
  const region = text(details.region) || text(details.city) || regionFromDisplayName(displayName);

  if (meta.kind === "frequency_region" && region) {
    return `高频-${region}地区`;
  }
  if (meta.kind === "payout_region" && region) {
    return `高暴击-${region}地区`;
  }
  if (meta.kind === "winrate_region" && region) {
    return `高胜率-${region}地区`;
  }
  if (meta.kind === "activity_level") {
    return displayName.includes("低") || text(item.key) === "low_active" ? "低活跃" : "正常";
  }

  return displayName || meta.fallbackValue;
};

const labelEvidenceText = (item: JsonRecord, fallback?: string) => {
  const evidence = asRecord(item.evidence);
  return truncate(
    text(item.reason) ||
      text(item.description) ||
      text(evidence.reason) ||
      text(asRecord(item.details).reason) ||
      fallback ||
      "Finder 标签命中",
    320
  );
};

const labelDraftKey = (label: WalletImportLabelDraft) =>
  `${label.kind}:${label.value.toLowerCase().replace(/[\s,，;；:：|/\\-]+/gu, "")}`;

const KNOWN_LABEL_KINDS = new Set<WalletLabelKind>([
  "wallet_age",
  "performance",
  "specialty",
  "style",
  "risk",
  "group",
  "alias",
  "confidence",
  "strategy",
  "activity_level",
  "new_wallet_signal",
  "early_entry_signal",
  "geo_specialty",
  "frequency_region",
  "winrate_region",
  "payout_region",
  "trader_archetype",
  "market_scope",
  "resolution_source",
  "forecast_basis",
  "timing_window",
  "edge_style",
  "weather_driver",
  "signal_quality",
  "portrait_style",
  "husky_profile",
  "data_status"
]);

const FINDER_AI_KIND_NAME: Partial<Record<WalletLabelKind, string>> = {
  frequency_region: "高频地区",
  payout_region: "高暴击地区",
  winrate_region: "高胜率地区",
  trader_archetype: "选手类型",
  activity_level: "活跃标签",
  new_wallet_signal: "新钱包标签",
  early_entry_signal: "提前埋伏",
  geo_specialty: "地区专精",
  group: "Finder 标签"
};

const canonicalRegionTag = (raw: string, prefix: "高频" | "高暴击" | "高胜率") => {
  const value = text(raw).replace(/高爆击/gu, "高暴击");
  const region =
    regionFromDisplayName(value) ||
    value
      .replace(new RegExp(`^${prefix}(?:交易)?(?:地区)?\\s*[-:：]?\\s*`, "iu"), "")
      .replace(/地区$/u, "")
      .trim();
  return region ? `${prefix}-${region}地区` : prefix;
};

const normalizeFinderAiLabelText = (
  rawValue: string,
  kindHint?: WalletLabelKind
): Pick<WalletImportLabelDraft, "name" | "value" | "kind"> | undefined => {
  const normalized = text(rawValue).replace(/高爆击/gu, "高暴击");
  if (!normalized) {
    return undefined;
  }

  // 新标签（风格画像/外部画像/数据状态）优先按目录规范化展示名
  const normalizedKey = normalizeWalletLabelText(normalized);
  const catalogMeta = Object.values(FINDER_LABEL_CATALOG).find(
    (item) =>
      normalizeWalletLabelText(item.fallbackValue) === normalizedKey ||
      normalizeWalletLabelText(item.reportTitle) === normalizedKey
  );
  if (catalogMeta && !kindHint) {
    return { name: catalogMeta.name, value: catalogMeta.fallbackValue, kind: catalogMeta.kind };
  }
  if (catalogMeta) {
    return {
      name: catalogMeta.name,
      value: catalogMeta.fallbackValue,
      kind:
        kindHint && kindHint !== "signal_quality" && kindHint !== "confidence" && kindHint !== "market_scope"
          ? kindHint
          : catalogMeta.kind
    };
  }

  if (kindHint === "frequency_region" || /^高频/u.test(normalized)) {
    return { name: "高频地区", value: canonicalRegionTag(normalized, "高频"), kind: "frequency_region" };
  }
  if (kindHint === "payout_region" || /^高暴击/u.test(normalized)) {
    return { name: "高暴击地区", value: canonicalRegionTag(normalized, "高暴击"), kind: "payout_region" };
  }
  if (kindHint === "winrate_region" || /^高胜率/u.test(normalized)) {
    return { name: "高胜率地区", value: canonicalRegionTag(normalized, "高胜率"), kind: "winrate_region" };
  }
  if (kindHint === "activity_level" || /活跃|active/iu.test(normalized)) {
    return {
      name: "活跃标签",
      value: /低活跃|inactive|low/iu.test(normalized) ? "低活跃" : "正常",
      kind: "activity_level"
    };
  }
  if (kindHint === "new_wallet_signal" || /隐藏高手新钱包|新钱包|new wallet/iu.test(normalized)) {
    return {
      name: "新钱包标签",
      value: /隐藏高手/iu.test(normalized) ? "隐藏高手新钱包" : "新钱包",
      kind: "new_wallet_signal"
    };
  }
  if (kindHint === "early_entry_signal" || /提前埋伏|early entry/iu.test(normalized)) {
    return { name: "提前埋伏", value: "提前埋伏", kind: "early_entry_signal" };
  }
  if (
    kindHint === "trader_archetype" ||
    /彩票型选手|彩票型|拆分型选手|拆分型|流动型选手|流动型/iu.test(normalized)
  ) {
    const value = /拆分型/iu.test(normalized)
      ? "拆分型选手"
      : /流动型/iu.test(normalized)
        ? "流动型选手"
        : "彩票型选手";
    return { name: "选手类型", value, kind: "trader_archetype" };
  }
  if (kindHint && kindHint !== "signal_quality" && kindHint !== "confidence" && kindHint !== "market_scope") {
    return {
      name: FINDER_AI_KIND_NAME[kindHint] ?? "Finder 标签",
      value: truncate(normalized, 24),
      kind: kindHint
    };
  }

  return {
    name: "Finder 标签",
    value: truncate(normalized, 24),
    kind: "group"
  };
};

const normalizeFinderAiKind = (rawKind: string): WalletLabelKind | undefined => {
  const normalized = rawKind.trim().toLowerCase();
  return KNOWN_LABEL_KINDS.has(normalized as WalletLabelKind)
    ? (normalized as WalletLabelKind)
    : undefined;
};

const addFinderAiLabelDraft = (
  labels: Map<string, WalletImportLabelDraft>,
  rawValue: string,
  options: {
    kind?: WalletLabelKind;
    evidence?: string;
    sourceName: string;
  }
) => {
  const normalized = normalizeFinderAiLabelText(rawValue, options.kind);
  if (!normalized || !normalized.value) {
    return;
  }

  const label: WalletImportLabelDraft = {
    ...normalized,
    value: truncate(normalized.value, 24),
    evidence: options.evidence ? truncate(options.evidence, 320) : undefined,
    source: "system",
    sourceNote: options.sourceName
  };
  labels.set(labelDraftKey(label), label);
};

const getMatchedFinderEvaluations = (detail: JsonRecord, row?: JsonRecord) => {
  const evaluations = asArray(detail.label_evaluations)
    .map(asRecord)
    .filter((item) => item.matched === true);
  const labels = asArray(detail.labels)
    .map(asRecord)
    .filter((item) => item.matched !== false);
  const labelFamilies = asRecord(row?.labelFamilies);
  const familyLabels = [
    ...asArray(labelFamilies.systemCore).map(asRecord),
    ...asArray(labelFamilies.supplementary).map(asRecord),
    ...asArray(labelFamilies.system_core_labels).map(asRecord),
    ...asArray(labelFamilies.supplementary_labels).map(asRecord)
  ].filter((item) => Object.keys(item).length > 0 && item.matched !== false);
  return [...evaluations, ...labels, ...familyLabels];
};

const hasFinderAiMatchedLabels = (finderAi: JsonRecord) =>
  finderAi.matched === true ||
  asArray(finderAi.labels).length > 0 ||
  asArray(finderAi.primarySignals)
    .map(asRecord)
    .some((item) => item.matched !== false && Boolean(text(item.key) || text(item.label)));

const hasFinderMatchedLabels = (row: JsonRecord, detail: JsonRecord) => {
  const finderAi = asRecord(row.finderAi ?? row.finder_ai ?? detail.finderAi ?? detail.finder_ai);
  return (
    getMatchedFinderEvaluations(detail, row).length > 0 ||
    asArray(row.labels).map(text).some(Boolean) ||
    asArray(detail.other_labels).length > 0 ||
    hasFinderAiMatchedLabels(finderAi)
  );
};

const buildFinderLabels = (
  row: JsonRecord,
  detail: JsonRecord,
  sourceName: string,
  finderAi?: JsonRecord
) => {
  const labels = new Map<string, WalletImportLabelDraft>();
  const evidenceSummary = asRecord(detail.evidence_summary);
  const fallbackEvidence = text(evidenceSummary.headline);
  const finderAiRecord =
    finderAi && Object.keys(finderAi).length > 0
      ? finderAi
      : asRecord(row.finderAi ?? row.finder_ai ?? detail.finderAi ?? detail.finder_ai);

  for (const item of getMatchedFinderEvaluations(detail, row)) {
    const key = text(item.key);
    const meta = LABEL_KEY_META[key] ?? (key ? fallbackFinderLabelMeta(key) : undefined);
    if (!meta) {
      continue;
    }

    const label: WalletImportLabelDraft = {
      name: meta.name,
      value: truncate(labelValueFromEvaluation(item, meta), 24),
      kind: meta.kind,
      evidence: labelEvidenceText(item, fallbackEvidence),
      source: "system",
      sourceNote: sourceName
    };
    labels.set(labelDraftKey(label), label);
  }

  for (const item of asArray(finderAiRecord.primarySignals).map(asRecord)) {
    if (item.matched === false) {
      continue;
    }
    const key = text(item.key);
    const meta = LABEL_KEY_META[key];
    if (meta) {
      const label: WalletImportLabelDraft = {
        name: meta.name,
        value: truncate(labelValueFromEvaluation({ ...item, display_name: text(item.label) }, meta), 24),
        kind: meta.kind,
        evidence: labelEvidenceText({ ...item, reason: text(item.reason) }, fallbackEvidence),
        source: "system",
        sourceNote: sourceName
      };
      labels.set(labelDraftKey(label), label);
      continue;
    }

    addFinderAiLabelDraft(labels, text(item.label), {
      evidence: text(item.reason) || fallbackEvidence,
      sourceName
    });
  }

  for (const item of asArray(finderAiRecord.labels).map(asRecord)) {
    addFinderAiLabelDraft(labels, text(item.value) || text(item.label) || text(item.name), {
      kind: normalizeFinderAiKind(text(item.kind)),
      evidence: text(item.evidence) || fallbackEvidence,
      sourceName
    });
  }

  for (const rawLabel of asArray(row.labels)) {
    const labelText = text(rawLabel);
    if (!labelText) {
      continue;
    }
    addFinderAiLabelDraft(labels, labelText, {
      evidence: fallbackEvidence || undefined,
      sourceName
    });
  }

  // 画像/数据状态标签：detail.other_labels（Finder 自算画像 + Husky 外部画像）
  // 与 detail.data_quality_states（运行/数据状态），含分类与份额
  const otherLabelItems = [
    ...asArray(detail.other_labels).map(asRecord),
    ...asArray(detail.data_quality_states).map(asRecord),
    ...asArray(asRecord(row.labelFamilies).other).map(asRecord),
    ...asArray(asRecord(row.labelFamilies).otherLabels).map(asRecord)
  ];
  for (const item of otherLabelItems) {
    const key = text(item.key);
    const display = text(item.display_name) || text(item.displayName);
    const category = text(item.category);
    const source = text(item.source);
    const meta = getFinderLabelMeta(key);
    const isDataStatus =
      meta?.kind === "data_status" || category.includes("数据状态") || category.includes("运行");
    const isHusky =
      meta?.kind === "husky_profile" ||
      key.toLowerCase().startsWith("husky:") ||
      category.includes("外部") ||
      source.toLowerCase().includes("husky");
    const value = truncate(display || meta?.fallbackValue || key.replace(/^(?:finder|husky):/u, ""), 24);
    if (!value) {
      continue;
    }
    const share = typeof item.share === "number" ? item.share : Number.parseFloat(text(item.share));
    const shareText = Number.isFinite(share)
      ? `份额 ${(share <= 1 ? share * 100 : share).toFixed(1)}%`
      : "";
    const label: WalletImportLabelDraft = {
      name: isDataStatus ? "数据状态" : isHusky ? "外部画像" : "画像/风格",
      value,
      kind: isDataStatus ? "data_status" : isHusky ? "husky_profile" : "portrait_style",
      evidence: truncate(
        [category ? `分类：${category}` : "", shareText, text(item.reason), source]
          .filter(Boolean)
          .join("，") || fallbackEvidence || "Finder 画像标签",
        320
      ),
      source: "system",
      sourceNote: `${sourceName}${isHusky ? "（外部画像）" : ""}`
    };
    labels.set(labelDraftKey(label), label);
  }

  return Array.from(labels.values()).slice(0, 24);
};

const buildFinderMetrics = (row: JsonRecord, detail: JsonRecord) => {
  const metrics = asRecord(detail.metrics);
  const values = [
    numberText(row.pnl) ? `PnL ${numberText(row.pnl)} USD` : "",
    numberText(row.volume, 0) ? `成交量 ${numberText(row.volume, 0)}` : "",
    numberText(row.trade_count, 0) ? `交易 ${numberText(row.trade_count, 0)} 笔` : "",
    percentText(row.weather_trade_ratio) ? `天气占比 ${percentText(row.weather_trade_ratio)}` : "",
    percentText(row.closed_position_win_rate)
      ? `已平仓胜率 ${percentText(row.closed_position_win_rate)}`
      : "",
    numberText(row.closed_profit_multiple) ? `盈利倍数 ${numberText(row.closed_profit_multiple)}x` : "",
    text(row.main_region) || text(row.dominant_region)
      ? `主地区 ${text(row.main_region) || text(row.dominant_region)}`
      : "",
    numberText(metrics.unified_profit) ? `统一收益 ${numberText(metrics.unified_profit)}` : ""
  ].filter(Boolean);

  return Array.from(new Set(values)).slice(0, 8);
};

const numericValue = (value: unknown) => {
  const numeric = typeof value === "number" ? value : Number.parseFloat(text(value));
  return Number.isFinite(numeric) ? numeric : undefined;
};

const scalarRecord = (input: JsonRecord) => {
  const output: JsonRecord = {};
  for (const [key, value] of Object.entries(input)) {
    if (typeof value === "number" || typeof value === "string" || typeof value === "boolean") {
      output[key] = value;
    }
  }
  return output;
};

const PROFILE_METRIC_SPECS: Array<{
  key: string;
  label: string;
  unit: WalletFinderProfileMetric["unit"];
  rowKeys?: string[];
  overviewKeys?: string[];
  coverageKeys?: string[];
  source?: string;
}> = [
  { key: "total_pnl_usd", label: "总盈亏", unit: "usd", overviewKeys: ["pnl_usd"], rowKeys: ["pnl"], source: "Finder 账本" },
  { key: "trade_exit_pnl_usd", label: "交易退出盈亏", unit: "usd", overviewKeys: ["trade_exit_pnl_usd"], source: "Finder 账本" },
  { key: "settlement_pnl_usd", label: "结算盈亏", unit: "usd", overviewKeys: ["settlement_pnl_usd"], source: "Finder 账本" },
  { key: "roi", label: "投资回报率", unit: "percent", overviewKeys: ["roi"], rowKeys: ["display_roi", "falcon_total_roi"] },
  { key: "position_win_rate", label: "胜率（已结算仓位）", unit: "percent", overviewKeys: ["position_win_rate"], rowKeys: ["wallet_win_rate", "closed_position_win_rate", "display_win_rate", "falcon_win_rate"] },
  { key: "resolved_positions", label: "已结算仓位", unit: "count", overviewKeys: ["resolved_positions"], rowKeys: ["weather_position_resolved_count", "ledger_resolved_position_count"] },
  { key: "won_positions", label: "获胜仓位", unit: "count", overviewKeys: ["won_positions"] },
  { key: "open_value_usd", label: "未平仓价值", unit: "usd", overviewKeys: ["open_value_usd"] },
  { key: "open_position_count", label: "未平仓仓位数", unit: "count", coverageKeys: ["open_position_count"], rowKeys: ["weather_open_position_count"] },
  { key: "avg_stake_usd", label: "单仓平均成本", unit: "usd", overviewKeys: ["avg_stake_usd"] },
  { key: "settled_position_cost_usd", label: "已结算仓位成本", unit: "usd", overviewKeys: ["settled_position_cost_usd"] },
  { key: "volume_usd", label: "成交量", unit: "usd", overviewKeys: ["volume_usd"], rowKeys: ["volume"] },
  { key: "trades", label: "交易笔数", unit: "count", overviewKeys: ["trades"], rowKeys: ["trade_count", "total_trade_count"] },
  { key: "weather_trade_count", label: "天气交易笔数", unit: "count", coverageKeys: ["weather_trade_count"], rowKeys: ["weather_trade_count"] },
  { key: "weather_notional_ratio", label: "天气成交占比", unit: "percent", rowKeys: ["weather_notional_ratio", "weather_trade_ratio"] },
  { key: "weather_position_pnl", label: "天气仓位盈亏", unit: "usd", rowKeys: ["weather_position_pnl"] },
  { key: "weather_position_roi", label: "天气仓位 ROI", unit: "percent", rowKeys: ["weather_position_roi"] },
  { key: "closed_position_win_rate", label: "已平仓胜率", unit: "percent", rowKeys: ["closed_position_win_rate", "closed_position_sample_win_rate"] },
  { key: "closed_profit_multiple", label: "盈利倍数", unit: "multiple", rowKeys: ["closed_profit_multiple"] },
  { key: "median_trade_notional", label: "中位交易额", unit: "usd", rowKeys: ["median_trade_notional"] },
  { key: "trades_per_active_day", label: "活跃日均交易", unit: "count", rowKeys: ["trades_per_active_day"] },
  { key: "dominant_region", label: "主交易城市", unit: "text", rowKeys: ["dominant_region", "main_region", "v2_dominant_region"] },
  { key: "max_region_daily_profit_multiple", label: "同城单日最高回报", unit: "multiple", rowKeys: ["max_region_daily_profit_multiple"] },
  { key: "highest_burst", label: "最高爆发收益", unit: "usd", rowKeys: ["highest_burst"] },
  { key: "max_closed_position_profit_multiple", label: "单仓最高盈利倍数", unit: "multiple", rowKeys: ["max_closed_position_profit_multiple"] },
  { key: "unreconciled_position_count", label: "未对账仓位数", unit: "count", coverageKeys: ["unreconciled_position_count"] }
];

const buildFinderProfile = (
  row: JsonRecord,
  detail: JsonRecord,
  input: { sourceName: string; runId?: string }
): WalletFinderProfile | undefined => {
  const metricsRecord = asRecord(detail.metrics);
  const weatherProfile = asRecord(
    metricsRecord.weather_profile_v2 ?? detail.weather_profile_v2 ?? detail.weatherProfileV2
  );
  const overview = asRecord(weatherProfile.overview);
  const coverage = asRecord(weatherProfile.coverage);
  const strategy = asRecord(weatherProfile.strategy);
  const strategyMetrics = scalarRecord(asRecord(strategy.metrics));

  const pick = (record: JsonRecord, keys?: string[]) => {
    for (const key of keys ?? []) {
      const value = record[key];
      if (value !== undefined && value !== null && value !== "") {
        return value;
      }
    }
    return undefined;
  };

  const metrics: WalletFinderProfileMetric[] = [];
  for (const spec of PROFILE_METRIC_SPECS) {
    const raw =
      pick(overview, spec.overviewKeys) ??
      pick(coverage, spec.coverageKeys) ??
      pick(row, spec.rowKeys);
    if (raw === undefined) {
      continue;
    }
    const numeric = spec.unit === "text" ? undefined : numericValue(raw);
    const value =
      spec.unit === "text"
        ? text(raw)
        : spec.unit === "percent"
          ? numeric
          : numeric;
    if (value === undefined || value === "") {
      continue;
    }
    metrics.push({
      key: spec.key,
      label: spec.label,
      value,
      unit: spec.unit,
      source: spec.source
    });
  }

  const portraitLabels: WalletFinderPortraitLabel[] = [];
  const seenPortrait = new Set<string>();
  const pushPortrait = (label: WalletFinderPortraitLabel) => {
    const key = `${label.group ?? "portrait_style"}:${label.code}:${label.name}`;
    if (seenPortrait.has(key)) {
      return;
    }
    seenPortrait.add(key);
    portraitLabels.push(label);
  };

  for (const item of asArray(detail.labels).map(asRecord)) {
    const display = text(item.display_name);
    if (!display || item.system_core !== true) {
      continue;
    }
    pushPortrait({
      code: text(item.key) || display,
      name: display,
      group: "core_screening",
      description: text(asRecord(item.evidence).reason) || text(item.description) || undefined
    });
  }

  const portraitItems = [
    ...asArray(detail.other_labels).map(asRecord),
    ...asArray(weatherProfile.portrait_labels).map(asRecord)
  ];
  for (const item of portraitItems) {
    const display = text(item.display_name);
    const key = text(item.key);
    if (!display && !key) {
      continue;
    }
    const category = text(item.category);
    const source = text(item.source);
    const isHusky =
      key.toLowerCase().startsWith("husky:") || category.includes("外部") || source.toLowerCase().includes("husky");
    const share = numericValue(item.share);
    pushPortrait({
      code: key || display,
      name: display || key,
      share,
      sampleCount: numericValue(item.sample_count) ?? undefined,
      group: isHusky ? "husky_profile" : "portrait_style",
      description: [category, text(item.facet), text(item.formula_confidence)]
        .filter(Boolean)
        .join("，") || undefined
    });
  }

  for (const item of asArray(detail.data_quality_states).map(asRecord)) {
    const display = text(item.display_name) || text(item.key);
    if (!display) {
      continue;
    }
    pushPortrait({
      code: text(item.key) || display,
      name: display,
      group: "operational",
      description: text(item.reason) || text(item.category) || undefined
    });
  }

  const cities: WalletFinderCityRow[] = asArray(weatherProfile.cities)
    .map(asRecord)
    .map((item) => ({
      city: text(item.city) || text(item.region) || "未知城市",
      region: text(item.region) || undefined,
      positionCount: numericValue(item.positions) ?? undefined,
      tradeCount: numericValue(item.trades) ?? undefined,
      pnlUsd: numericValue(item.pnl_usd) ?? undefined,
      roi: numericValue(item.roi) ?? undefined,
      winRate: numericValue(item.win_rate) ?? undefined,
      resolvedCount: numericValue(item.resolved_positions) ?? undefined,
      wonCount: numericValue(item.won_positions) ?? undefined,
      avgEntryPrice: numericValue(item.avg_entry_price) ?? undefined,
      costUsd: numericValue(item.cost_usd) ?? numericValue(item.staked_usd) ?? undefined,
      payoutUsd: numericValue(item.payout_usd) ?? undefined,
      volumeUsd: numericValue(item.volume_usd) ?? numericValue(item.observed_volume_usd) ?? undefined,
      share: numericValue(item.share) ?? undefined
    }))
    .filter((item) => item.city)
    .sort((left, right) => (right.positionCount ?? 0) - (left.positionCount ?? 0))
    .slice(0, 40);

  const patterns: WalletFinderPatternRow[] = asArray(weatherProfile.patterns)
    .map(asRecord)
    .map((item) => ({
      key: text(item.key) || undefined,
      name: text(item.name) || text(item.key) || undefined,
      tradeCount: numericValue(item.n) ?? numericValue(item.trade_count) ?? undefined,
      resolvedCount: numericValue(item.resolved) ?? numericValue(item.resolved_count) ?? undefined,
      wonCount: numericValue(item.wins) ?? undefined,
      winRate: numericValue(item.win_rate) ?? undefined,
      pnlUsd: numericValue(item.pnl_usd) ?? undefined,
      roi: numericValue(item.roi) ?? undefined,
      stakedUsd: numericValue(item.staked_usd) ?? undefined,
      share: numericValue(item.share) ?? undefined
    }))
    .filter((item) => item.name)
    .sort((left, right) => (right.pnlUsd ?? 0) - (left.pnlUsd ?? 0))
    .slice(0, 12);

  const profile: WalletFinderProfile = {
    runId: input.runId,
    sourceName: input.sourceName,
    snapshotAsOf:
      text(detail.snapshot_as_of) ||
      text(asRecord(detail.evidence_summary).latest_evidence_date) ||
      undefined,
    analysisSource: text(row.analysis_source) || undefined,
    metrics,
    portraitLabels,
    cities,
    patterns,
    strategyMetrics: Object.fromEntries(
      Object.entries(strategyMetrics).slice(0, 32)
    ) as Record<string, number | string | boolean>,
    overview: scalarRecord(overview),
    coverage: scalarRecord(coverage)
  };

  const hasContent =
    metrics.length > 0 ||
    portraitLabels.length > 0 ||
    cities.length > 0 ||
    patterns.length > 0 ||
    Object.keys(profile.overview).length > 0;

  return hasContent ? profile : undefined;
};

const buildPrimarySignals = (labels: WalletImportLabelDraft[]) => {
  const signals: WalletPrimarySignal[] = [];

  for (const label of labels) {
    const meta = Object.values(LABEL_KEY_META).find(
      (item) => item.kind === label.kind && item.signalKind
    );
    if (!meta?.signalKind) {
      continue;
    }

    signals.push({
      kind: meta.signalKind,
      label: label.value,
      metricText: label.evidence,
      evidence: label.evidence,
      priority: PRIMARY_SIGNAL_KIND_PRIORITY[meta.signalKind]
    });
  }

  return signals.slice(0, 5);
};

const buildSourceExcerpt = (row: JsonRecord, detail: JsonRecord) => {
  const evidenceSummary = asRecord(detail.evidence_summary);
  const evaluations = getMatchedFinderEvaluations(detail, row)
    .map((item) => labelEvidenceText(item))
    .slice(0, 4);
  const notes = asArray(detail.strategy_notes).map(text).filter(Boolean).slice(0, 3);
  const reasons = asArray(row.reasons).map(text).filter(Boolean).slice(0, 3);
  return truncate(
    [
      text(evidenceSummary.headline),
      ...evaluations,
      ...notes,
      ...reasons
    ]
      .filter(Boolean)
      .join("； "),
    360
  );
};

const buildStrategyFocus = (
  labels: WalletImportLabelDraft[],
  keyMetrics: string[],
  row: JsonRecord,
  detail: JsonRecord
) =>
  truncate(
    [
      labels[0]?.value,
      labels[1]?.value,
      keyMetrics.find((metric) => metric.startsWith("PnL")),
      text(asRecord(detail.evidence_summary).main_region) ||
        text(row.main_region) ||
        text(row.dominant_region)
    ]
      .filter(Boolean)
      .join("，"),
    84
  );

const buildTeamNote = (input: {
  sourceName: string;
  runId?: string;
  userName?: string;
  xUserName?: string;
  keyMetrics: string[];
}) =>
  truncate(
    [
      `来源：${input.sourceName}`,
      input.runId ? `任务：${input.runId}` : "",
      input.userName ? `榜单用户名：${input.userName}` : "",
      input.xUserName ? `X：${input.xUserName}` : "",
      input.keyMetrics.join(" / ")
    ]
      .filter(Boolean)
      .join(" | "),
    260
  );

const shouldWatchlist = (row: JsonRecord, detail: JsonRecord) =>
  row.watchlist === true ||
  row.suggest_watchlist === true ||
  row.recommend_watchlist === true ||
  asRecord(detail.evidence_summary).suggest_watchlist === true;

const compactFinderAiMetricValue = (value: unknown) => {
  if (typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  const normalized = text(value);
  return normalized || undefined;
};

const normalizeFinderAiInsight = (
  finderAi: JsonRecord | undefined,
  input: {
    row: JsonRecord;
    detail: JsonRecord;
    sourceName: string;
    runId?: string;
  }
): WalletFinderAiInsight | undefined => {
  if (!finderAi || Object.keys(finderAi).length === 0) {
    return undefined;
  }

  const wallet = asRecord(finderAi.wallet);
  const providerMeta = asRecord(finderAi.providerMeta);
  const normalizedAddress =
    normalizeAddress(text(finderAi.normalizedAddress) || text(wallet.address)) ||
    normalizeAddress(getFinderWalletAddress(input.row, input.detail));

  const labels = asArray(finderAi.labels)
    .map(asRecord)
    .map((label) => ({
      kind: text(label.kind) || undefined,
      value: text(label.value),
      source: text(label.source) || undefined,
      evidence: text(label.evidence) || undefined
    }))
    .filter((label) => label.value)
    .slice(0, 12);
  const primarySignals = asArray(finderAi.primarySignals)
    .map(asRecord)
    .map((signal) => ({
      key: text(signal.key) || undefined,
      label: text(signal.label),
      matched: typeof signal.matched === "boolean" ? signal.matched : undefined,
      reason: text(signal.reason) || undefined
    }))
    .filter((signal) => signal.label)
    .slice(0, 6);
  const keyMetrics = asArray(finderAi.keyMetrics)
    .map(asRecord)
    .map((metric) => ({
      key: text(metric.key) || undefined,
      label: text(metric.label),
      value: compactFinderAiMetricValue(metric.value)
    }))
    .filter((metric) => metric.label)
    .slice(0, 8);
  const weatherSignals = asRecord(finderAi.weatherSignals);
  const providerValue: WalletAiProviderMeta["provider"] =
    text(providerMeta.provider) === "deepseek"
      ? "deepseek"
      : text(providerMeta.provider) === "finder"
        ? "finder"
        : "none";
  const providerMetaPayload = Object.keys(providerMeta).length
    ? {
        provider: providerValue,
        model: text(providerMeta.model) || "finder-app",
        fallbackUsed: providerMeta.fallbackUsed === true,
        succeededAt: text(providerMeta.succeededAt) || text(providerMeta.generatedAt) || undefined,
        promptVersion: text(providerMeta.promptVersion) || undefined,
        generatedAt: text(providerMeta.generatedAt) || undefined,
        inputHash: text(providerMeta.inputHash) || undefined,
        generationScope: text(providerMeta.generationScope) || undefined,
        outputSchemaVersion: text(providerMeta.outputSchemaVersion) || undefined,
        cacheKey: text(providerMeta.cacheKey) || undefined
      } satisfies WalletAiProviderMeta
    : undefined;

  return {
    walletId: text(finderAi.walletId) || undefined,
    sourceName: text(finderAi.sourceName) || input.sourceName,
    runId: text(finderAi.runId) || input.runId,
    normalizedAddress: normalizedAddress || undefined,
    strategyFocus: text(finderAi.strategyFocus) || undefined,
    aiBriefShort: text(finderAi.aiBriefShort) || undefined,
    aiBriefNote: text(finderAi.aiBriefNote) || undefined,
    aiDeepNote: text(finderAi.aiDeepNote) || undefined,
    sourceExcerpt: text(finderAi.sourceExcerpt) || undefined,
    evidenceLevel: text(finderAi.evidenceLevel) || undefined,
    hasConflict: finderAi.hasConflict === true,
    needsReview: finderAi.needsReview === true,
    labels,
    primarySignals,
    keyMetrics,
    weatherSignals: Object.keys(weatherSignals).length > 0 ? weatherSignals : undefined,
    providerMeta: providerMetaPayload,
    raw: finderAi
  };
};

const buildFinderPreviewRows = (
  wallets: Array<{ row: JsonRecord; detail: JsonRecord; finderAi?: JsonRecord }>,
  input: {
    sourceName: string;
    runId?: string;
  }
): WalletAiExtractPreviewRow[] =>
  wallets.map(({ row, detail, finderAi }, index) => {
    const address = getFinderWalletAddress(row, detail);
    const normalizedAddress = normalizeAddress(address);
    const userName = getFinderUserName(row, detail);
    const xUserName = getFinderXUserName(row, detail);
    const displayName = userName || xUserName || normalizedAddress || address || `Finder 钱包 ${index + 1}`;
    const labels = buildFinderLabels(row, detail, input.sourceName, finderAi);
    const keyMetrics = buildFinderMetrics(row, detail);
    const primarySignals = buildPrimarySignals(labels);
    const sourceExcerpt = buildSourceExcerpt(row, detail);
    const normalizedFinderAi = normalizeFinderAiInsight(finderAi, {
      row,
      detail,
      sourceName: input.sourceName,
      runId: input.runId
    });
    const errors: string[] = [];

    if (!normalizedAddress) {
      errors.push("缺少有效地址");
    }
    if (!displayName) {
      errors.push("缺少显示名");
    }

    return {
      rowNumber: index + 1,
      wallet: {
        address,
        displayName,
        alias: userName && userName.length <= 18 ? userName : undefined,
        strategyFocus:
          normalizedFinderAi?.aiBriefShort ||
          normalizedFinderAi?.strategyFocus ||
          buildStrategyFocus(labels, keyMetrics, row, detail) ||
          undefined,
        teamNote: buildTeamNote({
          sourceName: input.sourceName,
          runId: input.runId,
          userName,
          xUserName,
          keyMetrics
        }),
        firstSeenAt:
          text(row.first_seen_at) ||
          text(row.firstSeenAt) ||
          text(asRecord(detail.evidence_summary).latest_evidence_date) ||
          undefined
      },
      labels: [
        ...labels,
        {
          name: "信号质量",
          value: labels.length >= 2 ? "高信号" : labels.length ? "信号不足" : "低信号",
          kind: "signal_quality",
          evidence: sourceExcerpt || undefined,
          source: "system",
          sourceNote: input.sourceName
        }
      ],
      finderAi: normalizedFinderAi,
      finderProfile: buildFinderProfile(row, detail, {
        sourceName: input.sourceName,
        runId: input.runId
      }),
      watchlistNote: shouldWatchlist(row, detail) ? "Finder 建议进入观察名单" : undefined,
      sourceExcerpt: normalizedFinderAi?.sourceExcerpt || sourceExcerpt || undefined,
      warnings: labels.length === 0 ? ["Finder 未提供命中标签，建议补充证据"] : [],
      errors,
      confidence: labels.length >= 2 ? "high" : labels.length ? "medium" : "unknown",
      signalQuality: labels.length >= 2 ? "high_signal" : labels.length ? "needs_review" : "low_signal",
      weatherSignals: UNKNOWN_WEATHER_SIGNALS,
      highlightTags: labels.map((label) => label.value).slice(0, 10),
      keyMetrics,
      primarySignals,
      providerMeta: {
        provider: "none",
        model: "finder-app-adapter",
        fallbackUsed: true,
        succeededAt: new Date().toISOString()
      }
    };
  });

const attachFinderSourceNote = (rows: WalletAiExtractPreviewRow[], sourceName: string) =>
  rows.map((row) => ({
    ...row,
    labels: row.labels.map((label) => ({
      ...label,
      source: label.source ?? "system",
      sourceNote: label.sourceNote ?? sourceName
    })),
    note: undefined
  }));

const countValidRows = (rows: WalletImportPreviewRow[]) =>
  rows.filter((row) => row.errors.length === 0).length;

const resolveFinderRunId = async (baseUrl: string, runId?: string) => {
  const requested = runId?.trim();
  if (requested && requested !== "latest") {
    return requested;
  }

  const payload = await fetchFinderJson<{ items?: Array<{ run_id?: string; status?: string }> }>(
    baseUrl,
    "/api/runs"
  );
  const runs = Array.isArray(payload.items) ? payload.items : [];
  const selected =
    runs.find((run) => run.status === "succeeded") ??
    runs.find((run) => run.status === "partial" || run.status === "artifact") ??
    runs[0];
  if (!selected?.run_id) {
    throw new Error("Finder 暂无可读取的分析任务");
  }

  return selected.run_id;
};

const pullFinderWallets = async (input: FinderImportRequest) => {
  const baseUrl = normalizeFinderBaseUrl(input.finderBaseUrl);
  const runId = await resolveFinderRunId(baseUrl, input.runId);
  const limit = Math.max(1, Math.min(MAX_FINDER_WALLETS, Math.trunc(input.limit ?? 100)));
  const listPayload = await fetchFinderJson<{ items?: unknown[] }>(
    baseUrl,
    `/api/runs/${encodeURIComponent(runId)}/wallets?offset=0&limit=${limit}`
  );
  const rows = asArray(listPayload.items).map(asRecord);
  const wallets: Array<{ row: JsonRecord; detail: JsonRecord; finderAi?: JsonRecord }> = [];

  for (let index = 0; index < rows.length; index += FINDER_DETAIL_CONCURRENCY) {
    const chunk = rows.slice(index, index + FINDER_DETAIL_CONCURRENCY);
    const details = await Promise.all(
      chunk.map(async (row) => {
        const address = getFinderWalletAddress(row);
        if (!address) {
          return {};
        }

        try {
          return await fetchFinderJson<JsonRecord>(
            baseUrl,
            `/api/runs/${encodeURIComponent(runId)}/wallets/${encodeURIComponent(address.toLowerCase())}`
          );
        } catch {
          return {};
        }
      })
    );

    chunk.forEach((row, detailIndex) => {
      const detail = asRecord(details[detailIndex]);
      const finderAi = asRecord(row.finderAi ?? row.finder_ai ?? detail.finderAi ?? detail.finder_ai);
      wallets.push({
        row,
        detail,
        finderAi: Object.keys(finderAi).length > 0 ? finderAi : undefined
      });
    });
  }

  return { baseUrl, runId, wallets };
};

const resolveWalletInputs = async (input: FinderImportRequest) => {
  if (Array.isArray(input.wallets) && input.wallets.length > 0) {
    const wallets = input.wallets.map((item) => {
      const record = asRecord(item);
      const detail = asRecord(record.detail ?? record.finder_detail ?? record);
      const finderAi = asRecord(record.finderAi ?? record.finder_ai ?? detail.finderAi ?? detail.finder_ai);
      return {
        row: asRecord(record.row ?? record.finder_row ?? record.selection_record ?? record),
        detail,
        finderAi: Object.keys(finderAi).length > 0 ? finderAi : undefined
      };
    });

    return {
      wallets,
      pulledRows: wallets.length,
      runId: input.runId?.trim() || undefined,
      finderBaseUrl: input.finderBaseUrl?.trim() || undefined
    };
  }

  const pulled = await pullFinderWallets(input);
  return {
    wallets: pulled.wallets,
    pulledRows: pulled.wallets.length,
    runId: pulled.runId,
    finderBaseUrl: pulled.baseUrl
  };
};

export const previewFinderImport = async (
  input: FinderImportRequest
): Promise<FinderImportPreviewResult> => {
  const pulledAt = new Date().toISOString();
  const sourceName = input.sourceName?.trim() || `Finder-app${input.runId ? `:${input.runId}` : ""}`;

  if (input.text?.trim()) {
    try {
      const aiPreview = await previewWalletImportAi({
        text: input.text,
        sourceName
      });
      const rows = attachFinderSourceNote(aiPreview.rows, sourceName);
      return {
        rows,
        sourceName,
        runId: input.runId?.trim() || undefined,
        finderBaseUrl: input.finderBaseUrl?.trim() || undefined,
        totalRows: rows.length,
        validRows: countValidRows(rows),
        providerMeta: aiPreview.providerMeta,
        pulledAt
      };
    } catch (error) {
      return {
        rows: [],
        sourceName,
        runId: input.runId?.trim() || undefined,
        finderBaseUrl: input.finderBaseUrl?.trim() || undefined,
        totalRows: 0,
        validRows: 0,
        fallbackReason: error instanceof Error ? error.message : "Finder 文本 AI 预览失败",
        pulledAt
      };
    }
  }

  const resolved = await resolveWalletInputs(input);
  const resolvedSourceName =
    input.sourceName?.trim() || `Finder-app${resolved.runId ? `:${resolved.runId}` : ""}`;
  const pulledRows = resolved.pulledRows ?? resolved.wallets.length;
  const matchedWallets = resolved.wallets.filter(({ row, detail }) => hasFinderMatchedLabels(row, detail));
  const matchedRows = matchedWallets.length;
  const filteredOutRows = Math.max(0, pulledRows - matchedRows);
  const deterministicRows = buildFinderPreviewRows(matchedWallets, {
    sourceName: resolvedSourceName,
    runId: resolved.runId
  });

  if (matchedWallets.length === 0) {
    return {
      rows: [],
      sourceName: resolvedSourceName,
      runId: resolved.runId,
      finderBaseUrl: resolved.finderBaseUrl,
      totalRows: 0,
      validRows: 0,
      pulledRows,
      matchedRows,
      filteredOutRows,
      fallbackReason: "本次 Finder 结果里没有命中标签的钱包，已按规则全部跳过。",
      pulledAt
    };
  }

  return {
    rows: deterministicRows,
    sourceName: resolvedSourceName,
    runId: resolved.runId,
    finderBaseUrl: resolved.finderBaseUrl,
    totalRows: deterministicRows.length,
    validRows: countValidRows(deterministicRows),
    pulledRows,
    matchedRows,
    filteredOutRows,
    providerMeta: deterministicRows[0]?.providerMeta,
    pulledAt
  };
};

export const commitFinderImport = async (
  input: FinderImportRequest,
  actor: string
): Promise<FinderImportCommitResult> => {
  const preview =
    Array.isArray(input.rows) && input.rows.length > 0
      ? {
          rows: input.rows,
          sourceName: input.sourceName?.trim() || `Finder-app${input.runId ? `:${input.runId}` : ""}`,
          runId: input.runId?.trim() || undefined,
          finderBaseUrl: input.finderBaseUrl?.trim() || undefined,
          totalRows: input.rows.length,
          validRows: countValidRows(input.rows),
          pulledAt: new Date().toISOString()
        }
      : await previewFinderImport(input);

  const commitRequest: WalletImportCommitRequest = {
    rows: preview.rows,
    mode: "finder",
    sourceType: "finder",
    sourceName: preview.sourceName,
    preserveExistingManualFields: true
  };
  const commit = await commitWalletImport(commitRequest, actor);

  return {
    ...preview,
    commit
  };
};

const statusLabel = (status?: string) => {
  switch (status) {
    case "active":
      return "正常";
    case "review_needed":
      return "待补充证据";
    case "deleted":
      return "已删除";
    default:
      return "未知";
  }
};

export const lookupFinderWallets = async (addresses: string[]) => {
  const rows = await listWalletAdminRows({ includeDeleted: true });
  const byAddress = new Map(
    rows.map((row) => [
      normalizeAddress(row.wallet.address) ?? row.wallet.normalizedAddress,
      row
    ])
  );

  return addresses.map((address) => {
    const normalizedAddress = normalizeAddress(address);
    const row = normalizedAddress ? byAddress.get(normalizedAddress) : undefined;
    const wallet = row?.wallet;
    const labels = row?.labels ?? [];
    return {
      address,
      normalizedAddress,
      valid: Boolean(normalizedAddress),
      exists: Boolean(row),
      displayName: wallet?.displayName,
      alias: wallet?.alias,
      confirmed: wallet?.curationStatus === "active",
      watchlisted: Boolean(wallet?.watchlisted),
      reviewStatus: wallet?.curationStatus,
      reviewStatusLabel: statusLabel(wallet?.curationStatus),
      tags: labels.map((label) => ({
        name: label.name,
        value: label.value,
        kind: label.kind,
        source: label.source,
        evidence: label.evidence
      })),
      shouldExclude: Boolean(row),
      excludeReason: row ? "Smart Pro 已记录该地址，Finder 默认可跳过重复分析" : undefined,
      detailUrl: wallet ? `/wallets/${wallet.id}` : undefined,
      updatedAt: wallet?.updatedAt
    };
  });
};

export const searchFinderWallets = async (query: string, limit = 12) => {
  const rows = await listWalletAdminRows({
    q: query,
    includeDeleted: true,
    limit: Math.max(1, Math.min(25, Math.trunc(limit)))
  });

  return rows.slice(0, Math.max(1, Math.min(25, Math.trunc(limit)))).map((row) => ({
    address: row.wallet.address,
    normalizedAddress: row.wallet.normalizedAddress,
    displayName: row.wallet.displayName,
    alias: row.wallet.alias,
    summary: row.summaryText,
    watchlisted: row.wallet.watchlisted,
    reviewStatus: row.wallet.curationStatus,
    reviewStatusLabel: statusLabel(row.wallet.curationStatus),
    tags: row.labels.slice(0, 8).map((label) => ({
      name: label.name,
      value: label.value,
      kind: label.kind,
      source: label.source
    })),
    detailUrl: `/wallets/${row.wallet.id}`,
    updatedAt: row.wallet.updatedAt
  }));
};

export const getFinderWalletDetail = async (address: string) => {
  const normalizedAddress = normalizeAddress(address);
  if (!normalizedAddress) {
    return null;
  }

  const rows = await listWalletAdminRows({ q: normalizedAddress, includeDeleted: true });
  const row = rows.find((item) => item.wallet.normalizedAddress === normalizedAddress);
  if (!row) {
    return null;
  }

  return {
    address: row.wallet.address,
    normalizedAddress: row.wallet.normalizedAddress,
    displayName: row.wallet.displayName,
    alias: row.wallet.alias,
    bio: row.wallet.bio,
    strategyFocus: row.wallet.strategyFocus,
    teamNote: row.wallet.teamNote,
    watchlisted: row.wallet.watchlisted,
    reviewStatus: row.wallet.curationStatus,
    reviewStatusLabel: statusLabel(row.wallet.curationStatus),
    source: row.sourceMeta,
    tags: row.labels.map((label) => ({
      id: label.id,
      name: label.name,
      value: label.value,
      kind: label.kind,
      source: label.source,
      evidence: label.evidence,
      verificationNote: label.verificationNote,
      sourceNote: label.sourceNote
    })),
    shouldExclude: true,
    excludeReason: "Smart Pro 已记录该地址，Finder 默认可跳过重复分析",
    detailUrl: `/wallets/${row.wallet.id}`,
    updatedAt: row.wallet.updatedAt
  };
};
