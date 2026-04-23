import {
  PRIMARY_SIGNAL_KIND_PRIORITY,
  normalizeAddress,
  type WalletAiConfidence,
  type WalletAiExtractPreviewRow,
  type WalletAiExtractRequest,
  type WalletAiProviderMeta,
  type WalletAiSignalQuality,
  type WalletImportLabelDraft,
  type WalletLabelKind,
  type WalletPrimarySignal,
  type WalletPrimarySignalKind,
  type WalletWeatherSignalDraft
} from "@weather-smart-money/core";
import { getSmartMoneyBindings } from "./cloudflare-env";

type Provider = "gemini" | "groq";
type AiSignal = {
  kind?: string;
  label?: string;
  region?: string;
  metricText?: string;
  evidence?: string;
};
type AiItem = {
  address?: string;
  displayName?: string;
  alias?: string;
  strategyFocus?: string;
  bio?: string;
  teamNote?: string;
  watchlist?: boolean;
  confidence?: string;
  sourceExcerpt?: string;
  highlightTags?: string[];
  keyMetrics?: string[];
  primarySignals?: AiSignal[];
  weatherSignals?: Partial<WalletWeatherSignalDraft>;
};
type ParsedWalletReportTag = {
  title: string;
  detail: string;
};

const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";
const GROQ_BASE_URL = "https://api.groq.com/openai/v1";
const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash-lite";
const DEFAULT_GROQ_MODEL = "openai/gpt-oss-20b";

const MAX_ALIAS = 18;
const MAX_SUMMARY = 42;
const MAX_LABEL = 24;
const MAX_EXCERPT = 360;
const MAX_TEXT = 320;
const MAX_KEY_METRIC = 8;
const MAX_HIGHLIGHT_TAG = 10;
const PRIMARY_SIGNAL_KINDS = [
  "geo_specialty",
  "frequency_region",
  "winrate_region",
  "payout_region",
  "trader_archetype"
] as const satisfies readonly WalletPrimarySignalKind[];

const SIGNAL_LABEL_KIND: Record<WalletPrimarySignalKind, WalletLabelKind> = {
  geo_specialty: "geo_specialty",
  frequency_region: "frequency_region",
  winrate_region: "winrate_region",
  payout_region: "payout_region",
  trader_archetype: "trader_archetype"
};

const LABEL_NAME: Record<string, string> = {
  group: "标签",
  activity_level: "活跃标签",
  new_wallet_signal: "新钱包标签",
  early_entry_signal: "提前埋伏",
  geo_specialty: "地点专精",
  frequency_region: "高频地区",
  winrate_region: "高胜率地区",
  payout_region: "高暴击地区",
  trader_archetype: "选手类型",
  market_scope: "市场范围",
  resolution_source: "结算来源",
  forecast_basis: "预测依据",
  timing_window: "时间窗口",
  edge_style: "下注边",
  weather_driver: "天气驱动",
  signal_quality: "信号质量"
};

const SYSTEM_PROMPT = `
你是地址库 AI 导入助手。输入已是搜索系统 AI 输出，你只做提炼、筛选和简洁呈现。
请接收搜索系统AI输出的所有结果，无需重复检验任何数据、无需关注任何数据验证逻辑及规则判定细节，核心仅完成提炼、筛选与简洁呈现操作。
硬性要求：
1. 只要原文里出现“【钱包 #N】 名称”，displayName 就必须逐条原样复制该名称。
2. 只要原文里出现“完整地址: 0x...”，address 就必须逐条原样复制该地址。
3. 不允许只返回标签、摘要或指标而省略 address / displayName。
4. 如果其他字段拿不准，也必须保留 address、displayName、sourceExcerpt。
5. 有几个钱包分块，就输出几个 item，顺序与原文保持一致。
短标签规则：
1. 高频交易地区=>高频-XX地区
2. 高暴击=>高暴击-XX地区
3. 高胜率=>高胜率-XX地区
4. 彩票型/拆分型/流动型选手=>对应短标签
5. 活跃标签=>正常/低活跃
6. 新钱包标签=>新钱包/隐藏高手新钱包
7. 提前埋伏标签=>提前埋伏
关键数据规则：
高频=地区+交易占比；高暴击=地区+盈利倍数；高胜率=地区+胜率；彩票型=筹码成本占比；拆分型=持仓均价；流动型=swap占比+卖出主导天数占比；活跃=最新交易日期；新钱包=注册时间差；提前埋伏=符合条件交易占比。
仅输出 JSON: {"items":[...]}，每个 item 固定字段 address, displayName, alias, strategyFocus, bio, teamNote, watchlist, confidence, sourceExcerpt, highlightTags, keyMetrics, primarySignals, weatherSignals。
`.trim();

const ARCHETYPE = [
  { pattern: /(彩票型|lottery)/i, label: "彩票型选手" },
  { pattern: /(拆分型|split)/i, label: "拆分型选手" },
  { pattern: /(流动型|流政型|flow|liquid)/i, label: "流动型选手" }
] as const;

const VALID_CONF = new Set<WalletAiConfidence>(["high", "medium", "low", "unknown"]);
const WATCHLIST_CUE = /(重点观察|持续跟踪|关键样本|watchlist|track closely)/i;
const GENERIC_SUMMARY_CUE =
  /(聪明|稳健|经验丰富|激进|高手|值得关注|smart money|experienced|smart|strong)/i;
const WALLET_BLOCK_HEADER = /【钱包\s*#\d+】\s*([^\r\n]+)/g;
const WALLET_ADDRESS_LINE = /完整地址\s*[:：]\s*(0x[a-fA-F0-9]{40})/;
const REPORT_TAG_LINE =
  /标签\d+\.\s*([^\r\n]+)\r?\n\s*判定:\s*\[(YES|NO)\]\s*(?:匹配|不匹配)\s*-\s*([^\r\n]+)/g;

const text = (value: unknown) =>
  typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";

const cut = (value: string, maxLength: number) =>
  value.length <= maxLength ? value : `${value.slice(0, maxLength - 3).trimEnd()}...`;

const excerpt = (value?: string) => cut(text(value), MAX_EXCERPT);

const uniqueText = (values: Array<string | undefined>, limit: number) =>
  Array.from(new Set(values.map((value) => text(value)).filter(Boolean))).slice(0, limit);

const normalizeTag = (raw: string) => {
  let tag = text(raw)
    .replace(/^(标签匹配|标签|类型|选手类型)\s*[:：-]?\s*/iu, "")
    .replace(/^高频(?:交易)?地区\s*[:：-]?\s*/iu, "高频-")
    .replace(/^高暴击(?:地区)?\s*[:：-]?\s*/iu, "高暴击-")
    .replace(/^高胜率(?:地区)?\s*[:：-]?\s*/iu, "高胜率-");

  if (/活跃|active/i.test(tag)) {
    tag = /低活跃|inactive|low/i.test(tag) ? "低活跃" : "正常";
  }
  if (/隐藏高手新钱包/i.test(tag)) {
    tag = "隐藏高手新钱包";
  } else if (/新钱包|new wallet/i.test(tag)) {
    tag = "新钱包";
  }
  if (/提前埋伏|early entry/i.test(tag)) {
    tag = "提前埋伏";
  }

  for (const archetype of ARCHETYPE) {
    if (archetype.pattern.test(tag)) {
      tag = archetype.label;
    }
  }

  return tag ? cut(tag.replace(/\s+/g, ""), MAX_LABEL) : "";
};

const normalizeMetric = (raw: string) => {
  const metric = text(raw).replace(/^(关键数据|核心数据|数据)\s*[:：-]?\s*/iu, "");
  return metric ? cut(metric, 48) : "";
};

const signalKindFromTag = (tag: string): WalletPrimarySignalKind | undefined => {
  if (tag.startsWith("高暴击-")) {
    return "payout_region";
  }
  if (tag.startsWith("高胜率-")) {
    return "winrate_region";
  }
  if (tag.startsWith("高频-")) {
    return "frequency_region";
  }
  if (ARCHETYPE.some((archetype) => archetype.pattern.test(tag))) {
    return "trader_archetype";
  }
  if (tag.endsWith("专精")) {
    return "geo_specialty";
  }
  return undefined;
};

const labelKindFromTag = (tag: string): WalletLabelKind => {
  if (tag === "正常" || tag === "低活跃") {
    return "activity_level";
  }
  if (tag === "新钱包" || tag === "隐藏高手新钱包") {
    return "new_wallet_signal";
  }
  if (tag === "提前埋伏") {
    return "early_entry_signal";
  }

  const signalKind = signalKindFromTag(tag);
  return signalKind ? SIGNAL_LABEL_KIND[signalKind] : "group";
};

const createLabel = (
  kind: WalletLabelKind,
  value: string,
  evidence?: string
): WalletImportLabelDraft => ({
  name: LABEL_NAME[kind] ?? "标签",
  value: cut(value, MAX_LABEL),
  kind,
  evidence: evidence ? excerpt(evidence) : undefined
});

const normalizeSignalKind = (value: string, label: string): WalletPrimarySignalKind | undefined => {
  const normalized = text(value).toLowerCase().replace(/\s+/g, "_");
  if ((PRIMARY_SIGNAL_KINDS as readonly string[]).includes(normalized)) {
    return normalized as WalletPrimarySignalKind;
  }
  return signalKindFromTag(normalizeTag(label));
};

export const normalizePrimarySignals = (
  values: AiSignal[] | undefined,
  highlightTags: string[],
  _keyMetrics: string[],
  sourceExcerpt: string
) => {
  const rows: WalletPrimarySignal[] = [];

  for (const signal of Array.isArray(values) ? values : []) {
    const kind = normalizeSignalKind(signal.kind ?? "", signal.label ?? "");
    if (!kind) {
      continue;
    }

    const label = normalizeTag(signal.label ?? "");
    if (!label) {
      continue;
    }

    rows.push({
      kind,
      label,
      region: text(signal.region) || undefined,
      metricText: text(signal.metricText) || undefined,
      evidence: excerpt(signal.evidence) || sourceExcerpt || undefined,
      priority: PRIMARY_SIGNAL_KIND_PRIORITY[kind]
    });
  }

  if (rows.length === 0) {
    for (const tag of highlightTags) {
      const kind = signalKindFromTag(tag);
      if (!kind) {
        continue;
      }

      rows.push({
        kind,
        label: tag,
        priority: PRIMARY_SIGNAL_KIND_PRIORITY[kind],
        evidence: sourceExcerpt || undefined
      });
    }
  }

  const map = new Map<string, WalletPrimarySignal>();
  rows.forEach((row) => {
    map.set(`${row.kind}:${row.label.toLowerCase()}`, row);
  });

  return Array.from(map.values())
    .sort((left, right) => (right.priority ?? 0) - (left.priority ?? 0))
    .slice(0, 5);
};

export const normalizeWeatherSignals = (
  value: Partial<WalletWeatherSignalDraft> | undefined
): WalletWeatherSignalDraft => ({
  marketScope: (text(value?.marketScope) as WalletWeatherSignalDraft["marketScope"]) || "unknown",
  resolutionSource:
    (text(value?.resolutionSource) as WalletWeatherSignalDraft["resolutionSource"]) || "unknown",
  forecastBasis:
    (text(value?.forecastBasis) as WalletWeatherSignalDraft["forecastBasis"]) || "unknown",
  timingWindow: (text(value?.timingWindow) as WalletWeatherSignalDraft["timingWindow"]) || "unknown",
  edgeStyle: (text(value?.edgeStyle) as WalletWeatherSignalDraft["edgeStyle"]) || "unknown",
  weatherDrivers: Array.isArray(value?.weatherDrivers)
    ? (Array.from(
        new Set(value.weatherDrivers.map((driver) => text(driver)).filter(Boolean))
      ).slice(0, 2) as WalletWeatherSignalDraft["weatherDrivers"])
    : [],
  evidenceQuality:
    (text(value?.evidenceQuality) as WalletWeatherSignalDraft["evidenceQuality"]) || "insufficient"
});

export const countHighValueWeatherSignals = (signals: WalletWeatherSignalDraft) =>
  [
    signals.resolutionSource !== "unknown",
    signals.forecastBasis !== "unknown",
    signals.timingWindow !== "unknown",
    signals.edgeStyle !== "unknown",
    ...signals.weatherDrivers.map((driver) => driver !== "unknown")
  ].filter(Boolean).length;

export const inferWalletAiSignalQuality = (
  signals: WalletWeatherSignalDraft,
  primarySignals: WalletPrimarySignal[],
  highlightTags: string[],
  keyMetrics: string[],
  sourceExcerpt: string,
  strategyFocus?: string
): WalletAiSignalQuality => {
  if (primarySignals.length >= 2 && keyMetrics.length > 0) {
    return "high_signal";
  }
  if (
    primarySignals.length ||
    highlightTags.length ||
    keyMetrics.length ||
    countHighValueWeatherSignals(signals) ||
    text(sourceExcerpt) ||
    text(strategyFocus)
  ) {
    return "needs_review";
  }
  return "low_signal";
};

export const buildWeatherLabels = (
  _signals: WalletWeatherSignalDraft,
  signalQuality: WalletAiSignalQuality
): WalletImportLabelDraft[] => [
  createLabel(
    "signal_quality",
    signalQuality === "high_signal"
      ? "高信号"
      : signalQuality === "needs_review"
        ? "需复核"
        : "低信号"
  )
];

export const filterWeatherHighlightLabels = <T extends { kind: WalletLabelKind }>(labels: T[]) =>
  labels.filter((label) =>
    new Set<WalletLabelKind>([
      "resolution_source",
      "forecast_basis",
      "timing_window",
      "edge_style",
      "weather_driver",
      "signal_quality",
      ...Object.values(SIGNAL_LABEL_KIND)
    ]).has(label.kind)
  );

export const buildWeatherStrategyFocus = (
  _signals: WalletWeatherSignalDraft,
  fallbackText?: string
) => (text(fallbackText) ? cut(text(fallbackText), MAX_SUMMARY) : "");

export const buildAiStrategyFocus = (
  explicitSummary: string | undefined,
  primarySignals: WalletPrimarySignal[],
  keyMetrics: string[],
  weatherSignals: WalletWeatherSignalDraft
) => {
  const summary = text(explicitSummary);
  if (summary && !GENERIC_SUMMARY_CUE.test(summary)) {
    return cut(summary, MAX_SUMMARY);
  }

  if (primarySignals[0]?.label || keyMetrics[0]) {
    return cut(
      [primarySignals[0]?.label, primarySignals[1]?.label, keyMetrics[0]]
        .filter(Boolean)
        .join("，"),
      MAX_SUMMARY
    );
  }

  return buildWeatherStrategyFocus(weatherSignals, explicitSummary);
};

const buildParsedReportTag = (
  title: string,
  detail: string
): {
  tag?: string;
  metric?: string;
  signal?: AiSignal;
} => {
  const normalizedTitle = text(title);
  const normalizedDetail = text(detail);

  if (!normalizedTitle || !normalizedDetail) {
    return {};
  }

  if (normalizedTitle === "高频交易地区") {
    const match = normalizedDetail.match(
      /^([A-Za-z][A-Za-z0-9 '&./-]{0,40})\s*\(占比\s*(\d+(?:\.\d+)?%)/
    );
    if (!match) {
      return {};
    }

    const region = text(match[1]);
    const ratio = text(match[2]);
    const metric = normalizeMetric(`${region} 交易占比 ${ratio}`);
    const tag = normalizeTag(`高频-${region}地区`);
    return {
      tag,
      metric,
      signal: {
        kind: "frequency_region",
        label: tag,
        region,
        metricText: metric,
        evidence: normalizedDetail
      }
    };
  }

  if (normalizedTitle === "高暴击") {
    const match = normalizedDetail.match(
      /(?:如[:：]\s*)?([A-Za-z][A-Za-z0-9 '&./-]{0,40})\s+\d{4}-\d{2}-\d{2}.*?sell\/buy\s*=\s*(\d+(?:\.\d+)?x)/i
    );
    if (!match) {
      return {};
    }

    const region = text(match[1]);
    const payout = text(match[2]);
    const metric = normalizeMetric(`${region} 盈利倍数 ${payout}`);
    const tag = normalizeTag(`高暴击-${region}地区`);
    return {
      tag,
      metric,
      signal: {
        kind: "payout_region",
        label: tag,
        region,
        metricText: metric,
        evidence: normalizedDetail
      }
    };
  }

  if (normalizedTitle === "高胜率") {
    const candidates = Array.from(
      normalizedDetail.matchAll(
        /([A-Za-z][A-Za-z0-9 '&./-]{0,40})\s*:\s*[^()]*\((\d+(?:\.\d+)?%)\)/g
      )
    )
      .map((match) => ({
        region: text(match[1]),
        rate: text(match[2]),
        numericRate: Number.parseFloat(match[2] ?? "0")
      }))
      .sort((left, right) => right.numericRate - left.numericRate);

    const best = candidates[0];
    if (!best?.region || !best.rate) {
      return {};
    }

    const metric = normalizeMetric(`${best.region} 胜率 ${best.rate}`);
    const tag = normalizeTag(`高胜率-${best.region}地区`);
    return {
      tag,
      metric,
      signal: {
        kind: "winrate_region",
        label: tag,
        region: best.region,
        metricText: metric,
        evidence: normalizedDetail
      }
    };
  }

  if (normalizedTitle === "彩票型选手") {
    const ratio = normalizedDetail.match(/(\d+(?:\.\d+)?%)/)?.[1];
    const metric = ratio ? normalizeMetric(`筹码成本占比 ${ratio}`) : undefined;
    return {
      tag: "彩票型选手",
      metric,
      signal: {
        kind: "trader_archetype",
        label: "彩票型选手",
        metricText: metric,
        evidence: normalizedDetail
      }
    };
  }

  if (normalizedTitle === "拆分型选手") {
    const average = normalizedDetail.match(/持仓均价\s*[=:：]?\s*([0-9.]+)/)?.[1];
    const metric = average ? normalizeMetric(`持仓均价 ${average}`) : undefined;
    return {
      tag: "拆分型选手",
      metric,
      signal: {
        kind: "trader_archetype",
        label: "拆分型选手",
        metricText: metric,
        evidence: normalizedDetail
      }
    };
  }

  if (normalizedTitle === "流动型选手") {
    const swapRatio = normalizedDetail.match(/swap(?:交易)?(?:占比)?\s*([0-9.]+%)/i)?.[1];
    const sellRatio = normalizedDetail.match(/卖出主导天数占比\s*([0-9.]+%)/)?.[1];
    const metric = normalizeMetric(
      [swapRatio ? `swap占比 ${swapRatio}` : "", sellRatio ? `卖出主导天数占比 ${sellRatio}` : ""]
        .filter(Boolean)
        .join(" / ")
    );
    return {
      tag: "流动型选手",
      metric: metric || undefined,
      signal: {
        kind: "trader_archetype",
        label: "流动型选手",
        metricText: metric || undefined,
        evidence: normalizedDetail
      }
    };
  }

  if (normalizedTitle === "活跃") {
    const label = /低活跃/.test(normalizedDetail) ? "低活跃" : "正常";
    const latest = normalizedDetail.match(/最新交易[:：]\s*([^)]+)/)?.[1];
    return {
      tag: label,
      metric: latest ? normalizeMetric(`最新交易 ${latest}`) : undefined
    };
  }

  if (normalizedTitle === "新钱包") {
    const label = /隐藏高手/.test(normalizedDetail) ? "隐藏高手新钱包" : "新钱包";
    const age = normalizedDetail.match(/钱包年龄[:：]?\s*([^)]+)/)?.[1];
    return {
      tag: label,
      metric: age ? normalizeMetric(`注册时间差 ${age}`) : undefined
    };
  }

  if (normalizedTitle === "提前埋伏") {
    const ratio = normalizedDetail.match(/(\d+(?:\.\d+)?%)/)?.[1];
    return {
      tag: "提前埋伏",
      metric: ratio ? normalizeMetric(`符合条件交易占比 ${ratio}`) : undefined
    };
  }

  return {};
};

const extractWalletReportFallbackItems = (rawText: string): AiItem[] => {
  const sourceText = rawText.replace(/^\uFEFF/, "");
  const headers = Array.from(sourceText.matchAll(WALLET_BLOCK_HEADER));
  if (headers.length === 0) {
    return [];
  }

  return headers
    .map((header, index) => {
      const start = header.index ?? 0;
      const end = headers[index + 1]?.index ?? sourceText.length;
      const block = sourceText.slice(start, end);
      const displayName = text(header[1]);
      const address = block.match(WALLET_ADDRESS_LINE)?.[1] ?? "";
      const parsedTags: ParsedWalletReportTag[] = Array.from(block.matchAll(REPORT_TAG_LINE))
        .filter((match) => match[2] === "YES")
        .map((match) => ({
          title: text(match[1]),
          detail: text(match[3])
        }));
      const derived = parsedTags.map((tag) => buildParsedReportTag(tag.title, tag.detail));
      const highlightTags = uniqueText(
        derived.map((item) => item.tag),
        MAX_HIGHLIGHT_TAG
      );
      const keyMetrics = uniqueText(
        derived.map((item) => item.metric),
        MAX_KEY_METRIC
      );
      const sourceExcerpt = excerpt(
        parsedTags.length > 0
          ? parsedTags.map((item) => `${item.title}: ${item.detail}`).join("； ")
          : block
              .split(/\r?\n/)
              .map((line) => text(line))
              .filter(Boolean)
              .slice(0, 8)
              .join("； ")
      );
      const primarySignals = normalizePrimarySignals(
        derived.flatMap((item) => (item.signal ? [item.signal] : [])),
        highlightTags,
        keyMetrics,
        sourceExcerpt
      );
      const weatherSignals = normalizeWeatherSignals(undefined);
      const strategyFocus = buildAiStrategyFocus(
        undefined,
        primarySignals,
        keyMetrics,
        weatherSignals
      );

      return {
        address,
        displayName,
        strategyFocus: strategyFocus || undefined,
        sourceExcerpt: sourceExcerpt || undefined,
        highlightTags,
        keyMetrics,
        primarySignals,
        watchlist: WATCHLIST_CUE.test(block),
        confidence: "medium"
      } satisfies AiItem;
    })
    .filter((item) => Boolean(text(item.address) || text(item.displayName)));
};

const mergeSignals = (aiSignals: AiSignal[] | undefined, fallbackSignals: AiSignal[] | undefined) => {
  const map = new Map<string, AiSignal>();

  for (const signal of [...(fallbackSignals ?? []), ...(aiSignals ?? [])]) {
    const kind = normalizeSignalKind(signal.kind ?? "", signal.label ?? "");
    const label = normalizeTag(signal.label ?? "");
    if (!kind || !label) {
      continue;
    }

    map.set(`${kind}:${label.toLowerCase()}`, {
      ...signal,
      kind,
      label
    });
  }

  return Array.from(map.values());
};

const mergeAiItemsWithFallback = (items: AiItem[], fallbackItems: AiItem[]) => {
  const total = Math.max(items.length, fallbackItems.length);
  if (total === 0) {
    return [] as AiItem[];
  }

  return Array.from({ length: total }, (_, index) => {
    const aiItem = items[index] ?? {};
    const fallbackItem = fallbackItems[index] ?? {};
    const highlightTags = uniqueText(
      [...(aiItem.highlightTags ?? []), ...(fallbackItem.highlightTags ?? [])],
      MAX_HIGHLIGHT_TAG
    );
    const keyMetrics = uniqueText(
      [...(aiItem.keyMetrics ?? []), ...(fallbackItem.keyMetrics ?? [])],
      MAX_KEY_METRIC
    );

    return {
      address: text(aiItem.address) || text(fallbackItem.address),
      displayName: text(aiItem.displayName) || text(fallbackItem.displayName),
      alias: text(aiItem.alias) || text(fallbackItem.alias) || undefined,
      strategyFocus: text(aiItem.strategyFocus) || text(fallbackItem.strategyFocus) || undefined,
      bio: text(aiItem.bio) || text(fallbackItem.bio) || undefined,
      teamNote: text(aiItem.teamNote) || text(fallbackItem.teamNote) || undefined,
      watchlist:
        typeof aiItem.watchlist === "boolean" ? aiItem.watchlist : fallbackItem.watchlist,
      confidence: text(aiItem.confidence) || text(fallbackItem.confidence) || undefined,
      sourceExcerpt: text(aiItem.sourceExcerpt) || text(fallbackItem.sourceExcerpt) || undefined,
      highlightTags,
      keyMetrics,
      primarySignals: mergeSignals(aiItem.primarySignals, fallbackItem.primarySignals),
      weatherSignals: aiItem.weatherSignals ?? fallbackItem.weatherSignals
    } satisfies AiItem;
  });
};

const dedupeLabels = (labels: WalletImportLabelDraft[]) => {
  const map = new Map<string, WalletImportLabelDraft>();
  labels.forEach((label) => {
    map.set(`${label.kind}:${label.value.toLowerCase()}`, label);
  });
  return Array.from(map.values());
};

const normalizeRows = (items: AiItem[], providerMeta: WalletAiProviderMeta) =>
  items.map((item, index) => {
    const address = text(item.address);
    const normalizedAddress = normalizeAddress(address);
    const rawDisplayName = text(item.displayName);
    const displayName = rawDisplayName || normalizedAddress || "";
    const sourceExcerpt = excerpt(item.sourceExcerpt);
    const highlightTags = Array.from(
      new Set((item.highlightTags ?? []).map(normalizeTag).filter(Boolean))
    ).slice(0, MAX_HIGHLIGHT_TAG);
    const keyMetrics = Array.from(
      new Set((item.keyMetrics ?? []).map(normalizeMetric).filter(Boolean))
    ).slice(0, MAX_KEY_METRIC);
    const primarySignals = normalizePrimarySignals(
      item.primarySignals,
      highlightTags,
      keyMetrics,
      sourceExcerpt
    );
    const weatherSignals = normalizeWeatherSignals(item.weatherSignals);
    const signalQuality = inferWalletAiSignalQuality(
      weatherSignals,
      primarySignals,
      highlightTags,
      keyMetrics,
      sourceExcerpt,
      item.strategyFocus
    );
    const labels = dedupeLabels([
      ...primarySignals.map((signal) =>
        createLabel(SIGNAL_LABEL_KIND[signal.kind], signal.label, signal.metricText || signal.evidence)
      ),
      ...highlightTags
        .filter((tag) => !primarySignals.some((signal) => signal.label === tag))
        .map((tag) => createLabel(labelKindFromTag(tag), tag, sourceExcerpt)),
      ...buildWeatherLabels(weatherSignals, signalQuality)
    ]);
    const errors: string[] = [];

    if (!normalizedAddress) {
      errors.push("缺少有效地址");
    }
    if (!rawDisplayName) {
      errors.push("缺少显示名");
    }

    return {
      rowNumber: index + 1,
      wallet: {
        address,
        displayName,
        alias: (() => {
          const alias = text(item.alias).replace(/[，。；;:：+]+$/gu, "");
          return !alias || alias.length > MAX_ALIAS || alias === displayName ? undefined : alias;
        })(),
        strategyFocus:
          buildAiStrategyFocus(item.strategyFocus, primarySignals, keyMetrics, weatherSignals) ||
          undefined,
        bio: text(item.bio) ? cut(text(item.bio), 600) : undefined,
        teamNote: text(item.teamNote) ? cut(text(item.teamNote), MAX_TEXT) : undefined
      },
      labels,
      note: text(item.teamNote) ? cut(text(item.teamNote), MAX_TEXT) : undefined,
      watchlistNote:
        Boolean(item.watchlist) || WATCHLIST_CUE.test(`${sourceExcerpt} ${item.teamNote ?? ""}`)
          ? "标记为重点观察"
          : undefined,
      sourceExcerpt: sourceExcerpt || undefined,
      warnings: [],
      errors,
      confidence: VALID_CONF.has(text(item.confidence).toLowerCase() as WalletAiConfidence)
        ? (text(item.confidence).toLowerCase() as WalletAiConfidence)
        : "unknown",
      signalQuality,
      weatherSignals,
      highlightTags,
      keyMetrics,
      primarySignals,
      providerMeta
    } satisfies WalletAiExtractPreviewRow;
  });

const schema = {
  type: "object",
  properties: { items: { type: "array", items: { type: "object" } } },
  required: ["items"]
} as const;

const providerConfig = async () => {
  const bindings = await getSmartMoneyBindings();
  const providerOrder = (
    bindings?.WALLET_AI_PROVIDER_ORDER ??
    process.env.WALLET_AI_PROVIDER_ORDER ??
    "gemini,groq"
  )
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter((value): value is Provider => value === "gemini" || value === "groq");

  return {
    geminiApiKey: bindings?.GEMINI_API_KEY ?? process.env.GEMINI_API_KEY,
    groqApiKey: bindings?.GROQ_API_KEY ?? process.env.GROQ_API_KEY,
    providerOrder: providerOrder.length ? providerOrder : ["gemini", "groq"],
    geminiModel:
      bindings?.WALLET_AI_GEMINI_MODEL ??
      process.env.WALLET_AI_GEMINI_MODEL ??
      DEFAULT_GEMINI_MODEL,
    groqModel:
      bindings?.WALLET_AI_GROQ_MODEL ?? process.env.WALLET_AI_GROQ_MODEL ?? DEFAULT_GROQ_MODEL
  };
};

const extractGeminiText = (payload: unknown) => {
  const candidates = Array.isArray((payload as { candidates?: unknown[] })?.candidates)
    ? ((payload as { candidates?: unknown[] }).candidates ?? [])
    : [];

  for (const candidate of candidates) {
    const parts = Array.isArray(
      (candidate as { content?: { parts?: Array<{ text?: string }> } })?.content?.parts
    )
      ? ((candidate as { content?: { parts?: Array<{ text?: string }> } }).content?.parts ?? [])
      : [];

    for (const part of parts) {
      if (typeof part?.text === "string" && part.text.trim()) {
        return part.text;
      }
    }
  }

  throw new Error("gemini returned no text content");
};

const callGemini = async (
  input: WalletAiExtractRequest,
  cfg: Awaited<ReturnType<typeof providerConfig>>,
  fallbackUsed: boolean
) => {
  if (!cfg.geminiApiKey) {
    throw new Error("missing GEMINI_API_KEY");
  }

  const response = await fetch(
    `${GEMINI_BASE_URL}/models/${encodeURIComponent(cfg.geminiModel)}:generateContent?key=${encodeURIComponent(cfg.geminiApiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              {
                text: `${SYSTEM_PROMPT}\n\nsourceName: ${input.sourceName ?? "text"}\n\nrawText:\n${input.text}`
              }
            ]
          }
        ],
        generationConfig: {
          temperature: 0.1,
          responseMimeType: "application/json",
          responseSchema: schema
        }
      })
    }
  );
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      `gemini request failed: ${response.status} ${JSON.stringify(payload).slice(0, 240)}`
    );
  }

  const parsed = JSON.parse(extractGeminiText(payload)) as { items?: AiItem[] };
  return {
    items: Array.isArray(parsed.items) ? parsed.items : [],
    providerMeta: {
      provider: "gemini",
      model: cfg.geminiModel,
      fallbackUsed,
      succeededAt: new Date().toISOString()
    } satisfies WalletAiProviderMeta
  };
};

const callGroq = async (
  input: WalletAiExtractRequest,
  cfg: Awaited<ReturnType<typeof providerConfig>>,
  fallbackUsed: boolean
) => {
  if (!cfg.groqApiKey) {
    throw new Error("missing GROQ_API_KEY");
  }

  const response = await fetch(`${GROQ_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${cfg.groqApiKey}`
    },
    body: JSON.stringify({
      model: cfg.groqModel,
      temperature: 0.1,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: `sourceName: ${input.sourceName ?? "text"}\n\nrawText:\n${input.text}`
        }
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "wallet_signal_extract",
          schema,
          strict: true
        }
      }
    })
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      `groq request failed: ${response.status} ${JSON.stringify(payload).slice(0, 240)}`
    );
  }

  const content = text(
    (payload as { choices?: Array<{ message?: { content?: string } }> })?.choices?.[0]?.message
      ?.content
  );
  if (!content) {
    throw new Error("groq returned empty content");
  }

  const parsed = JSON.parse(content) as { items?: AiItem[] };
  return {
    items: Array.isArray(parsed.items) ? parsed.items : [],
    providerMeta: {
      provider: "groq",
      model: cfg.groqModel,
      fallbackUsed,
      succeededAt: new Date().toISOString()
    } satisfies WalletAiProviderMeta
  };
};

export const extractWalletsWithAi = async (input: WalletAiExtractRequest) => {
  const cfg = await providerConfig();
  const reportFallbackItems = extractWalletReportFallbackItems(input.text);
  const errors: string[] = [];

  for (const [index, provider] of cfg.providerOrder.entries()) {
    try {
      const result =
        provider === "gemini"
          ? await callGemini(input, cfg, index > 0)
          : await callGroq(input, cfg, index > 0);
      const mergedItems = mergeAiItemsWithFallback(result.items, reportFallbackItems);
      const rows = normalizeRows(mergedItems, result.providerMeta);
      const validRows = rows.filter((row) => row.errors.length === 0).length;

      if (validRows > 0) {
        return {
          rows,
          providerMeta: result.providerMeta
        };
      }

      if (reportFallbackItems.length > 0) {
        return {
          rows: normalizeRows(reportFallbackItems, result.providerMeta),
          providerMeta: result.providerMeta
        };
      }

      throw new Error(`${provider} extraction returned no usable wallets`);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : `${provider} extraction failed`);
    }
  }

  throw new Error(errors.join(" | ") || "no AI provider available");
};
