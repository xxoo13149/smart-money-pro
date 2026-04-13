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
  type WalletWeatherDriver,
  type WalletWeatherEdgeStyle,
  type WalletWeatherForecastBasis,
  type WalletWeatherMarketScope,
  type WalletWeatherResolutionSource,
  type WalletWeatherSignalDraft,
  type WalletWeatherTimingWindow
} from "@weather-smart-money/core";

import { getSmartMoneyBindings } from "./cloudflare-env";

type ProviderName = "gemini" | "groq";

interface ProviderRuntimeConfig {
  geminiApiKey?: string;
  groqApiKey?: string;
  providerOrder: ProviderName[];
  geminiModel: string;
  groqModel: string;
}

interface AiExtractSchemaSignals {
  marketScope?: string;
  resolutionSource?: string;
  forecastBasis?: string;
  timingWindow?: string;
  edgeStyle?: string;
  weatherDrivers?: string[];
  evidenceQuality?: string;
}

interface AiExtractSchemaPrimarySignal {
  kind?: string;
  label?: string;
  region?: string;
  metricText?: string;
  evidence?: string;
}

interface AiExtractSchemaItem {
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
  primarySignals?: AiExtractSchemaPrimarySignal[];
  weatherSignals?: AiExtractSchemaSignals;
}

const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";
const GROQ_BASE_URL = "https://api.groq.com/openai/v1";
const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash-lite";
const DEFAULT_GROQ_MODEL = "openai/gpt-oss-20b";

const MAX_ALIAS_LENGTH = 18;
const MAX_SUMMARY_LENGTH = 42;
const MAX_LABEL_VALUE_LENGTH = 24;
const MAX_SOURCE_EXCERPT_LENGTH = 360;
const MAX_BIO_LENGTH = 600;
const MAX_TEAM_NOTE_LENGTH = 320;
const WEATHER_DRIVER_LIMIT = 2;
const MAX_HIGHLIGHT_TAG_LENGTH = 32;
const MAX_HIGHLIGHT_TAG_COUNT = 8;
const MAX_KEY_METRIC_LENGTH = 48;
const MAX_KEY_METRIC_COUNT = 5;
const MAX_PRIMARY_SIGNAL_COUNT = 5;

const PRIMARY_SIGNAL_KINDS = [
  "geo_specialty",
  "frequency_region",
  "winrate_region",
  "payout_region",
  "trader_archetype"
] as const satisfies readonly WalletPrimarySignalKind[];

const VALID_CONFIDENCE = new Set<WalletAiConfidence>(["high", "medium", "low", "unknown"]);
const VALID_PRIMARY_SIGNAL_KIND = new Set<WalletPrimarySignalKind>(PRIMARY_SIGNAL_KINDS);
const PRIMARY_SIGNAL_LABEL_KINDS: Record<WalletPrimarySignalKind, WalletLabelKind> = {
  geo_specialty: "geo_specialty",
  frequency_region: "frequency_region",
  winrate_region: "winrate_region",
  payout_region: "payout_region",
  trader_archetype: "trader_archetype"
};
const WEATHER_HIGHLIGHT_LABEL_KINDS = new Set<WalletLabelKind>([
  ...Object.values(PRIMARY_SIGNAL_LABEL_KINDS),
  "resolution_source",
  "forecast_basis",
  "timing_window",
  "edge_style",
  "weather_driver",
  "signal_quality"
]);

const VALID_MARKET_SCOPE = new Set<WalletWeatherMarketScope>([
  "single_city_max_temp",
  "multi_city_temp",
  "mixed_weather",
  "unknown"
]);
const VALID_RESOLUTION_SOURCE = new Set<WalletWeatherResolutionSource>([
  "nws_noaa",
  "jma",
  "kma",
  "dwd",
  "official_other",
  "unknown"
]);
const VALID_FORECAST_BASIS = new Set<WalletWeatherForecastBasis>([
  "ensemble_guidance",
  "official_grid",
  "nowcast",
  "station_observation",
  "narrative_only",
  "unknown"
]);
const VALID_TIMING_WINDOW = new Set<WalletWeatherTimingWindow>([
  "d2_plus",
  "d1",
  "intraday",
  "near_close",
  "unknown"
]);
const VALID_EDGE_STYLE = new Set<WalletWeatherEdgeStyle>([
  "upper_tail",
  "baseline_mean",
  "range_threshold",
  "late_reprice",
  "obs_reaction",
  "unknown"
]);
const VALID_WEATHER_DRIVERS = new Set<WalletWeatherDriver>([
  "cloud_cover",
  "precip_timing",
  "wind_shift",
  "humidity_dewpoint",
  "ridge_heat_dome",
  "front_passage",
  "urban_heat",
  "storm_outflow",
  "unknown"
]);
const VALID_EVIDENCE_QUALITY = new Set<WalletWeatherSignalDraft["evidenceQuality"]>([
  "explicit_numeric",
  "source_named",
  "qualitative_only",
  "insufficient"
]);

const WATCHLIST_CUE =
  /(重点观察|持续跟踪|持续关注|关键样本|重点样本|重点跟踪|观察名单|watchlist|track closely|keep watching|priority sample)/i;
const GENERIC_SUMMARY_CUE =
  /(聪明|稳健|经验丰富|激进|高手|值得关注|smart money|experienced|smart|strong)/i;

const MARKET_SCOPE_COPY: Record<WalletWeatherMarketScope, string> = {
  single_city_max_temp: "单城最高温",
  multi_city_temp: "多城温度",
  mixed_weather: "混合天气",
  unknown: "未知范围"
};
const RESOLUTION_SOURCE_COPY: Record<WalletWeatherResolutionSource, string> = {
  nws_noaa: "NWS/NOAA",
  jma: "JMA",
  kma: "KMA",
  dwd: "DWD",
  official_other: "官方站点",
  unknown: "未知来源"
};
const FORECAST_BASIS_COPY: Record<WalletWeatherForecastBasis, string> = {
  ensemble_guidance: "集合预报",
  official_grid: "官方格点",
  nowcast: "临近预报",
  station_observation: "站点实测",
  narrative_only: "文字判断",
  unknown: "未知依据"
};
const TIMING_WINDOW_COPY: Record<WalletWeatherTimingWindow, string> = {
  d2_plus: "D2+",
  d1: "D1",
  intraday: "日内",
  near_close: "近收盘",
  unknown: "未知窗口"
};
const EDGE_STYLE_COPY: Record<WalletWeatherEdgeStyle, string> = {
  upper_tail: "做上沿",
  baseline_mean: "基线均值",
  range_threshold: "区间阈值",
  late_reprice: "临近重定价",
  obs_reaction: "实况反应",
  unknown: "未知下注边"
};
const WEATHER_DRIVER_COPY: Record<WalletWeatherDriver, string> = {
  cloud_cover: "云量",
  precip_timing: "降水时点",
  wind_shift: "风向切换",
  humidity_dewpoint: "湿度/露点",
  ridge_heat_dome: "高压热穹",
  front_passage: "锋面过境",
  urban_heat: "城市热岛",
  storm_outflow: "雷暴外流",
  unknown: "未知驱动"
};
const SIGNAL_QUALITY_COPY: Record<WalletAiSignalQuality, string> = {
  high_signal: "高信号",
  needs_review: "需复核",
  low_signal: "低信号"
};
const LABEL_NAME_COPY: Record<WalletLabelKind, string> = {
  wallet_age: "钱包年龄",
  performance: "表现",
  specialty: "专精",
  style: "风格",
  risk: "风险",
  group: "标签",
  alias: "别名",
  confidence: "置信度",
  strategy: "策略",
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

const TRADER_ARCHETYPE_NORMALIZERS = [
  { pattern: /(彩票型|彩票选手|lottery)/i, label: "彩票型选手" },
  { pattern: /(拆分型|拆分选手|split)/i, label: "拆分型选手" },
  { pattern: /(流动型|流政型|流动选手|flow|liquid)/i, label: "流动型选手" }
] as const;

const compactText = (value: unknown) =>
  typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";

const truncateText = (value: string, maxLength: number) =>
  value.length <= maxLength ? value : `${value.slice(0, maxLength - 3).trimEnd()}...`;

const dedupeStrings = <T extends string>(values: T[]) => Array.from(new Set(values));

const normalizeConfidence = (value: string | undefined): WalletAiConfidence => {
  const normalized = compactText(value).toLowerCase() as WalletAiConfidence;
  return VALID_CONFIDENCE.has(normalized) ? normalized : "unknown";
};

const normalizeEnum = <T extends string>(value: string | undefined, valid: Set<T>, fallback: T): T => {
  const normalized = compactText(value).toLowerCase() as T;
  return valid.has(normalized) ? normalized : fallback;
};

const compactExcerpt = (value: string | undefined) => truncateText(compactText(value), MAX_SOURCE_EXCERPT_LENGTH);

const sanitizeLongText = (value: string | undefined, maxLength: number) => {
  const compactValue = compactText(value);
  return compactValue ? truncateText(compactValue, maxLength) : undefined;
};

const sanitizeAlias = (alias: string | undefined, displayName: string): string | undefined => {
  const compactAlias = compactText(alias).replace(/[，。；;:：]+$/gu, "");
  if (!compactAlias || compactAlias.length > MAX_ALIAS_LENGTH) {
    return undefined;
  }
  if (compactAlias === displayName || compactAlias.split(/\s+/u).length > 4) {
    return undefined;
  }
  return compactAlias;
};

const GEMINI_AI_EXTRACT_SCHEMA = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          address: { type: "string" },
          displayName: { type: "string" },
          alias: { type: "string" },
          strategyFocus: { type: "string" },
          bio: { type: "string" },
          teamNote: { type: "string" },
          watchlist: { type: "boolean" },
          confidence: { type: "string", enum: ["high", "medium", "low", "unknown"] },
          sourceExcerpt: { type: "string" },
          highlightTags: { type: "array", items: { type: "string" } },
          keyMetrics: { type: "array", items: { type: "string" } },
          primarySignals: {
            type: "array",
            items: {
              type: "object",
              properties: {
                kind: { type: "string", enum: PRIMARY_SIGNAL_KINDS },
                label: { type: "string" },
                region: { type: "string" },
                metricText: { type: "string" },
                evidence: { type: "string" }
              }
            }
          },
          weatherSignals: {
            type: "object",
            properties: {
              marketScope: { type: "string", enum: [...VALID_MARKET_SCOPE] },
              resolutionSource: { type: "string", enum: [...VALID_RESOLUTION_SOURCE] },
              forecastBasis: { type: "string", enum: [...VALID_FORECAST_BASIS] },
              timingWindow: { type: "string", enum: [...VALID_TIMING_WINDOW] },
              edgeStyle: { type: "string", enum: [...VALID_EDGE_STYLE] },
              weatherDrivers: {
                type: "array",
                items: { type: "string", enum: [...VALID_WEATHER_DRIVERS] }
              },
              evidenceQuality: { type: "string", enum: [...VALID_EVIDENCE_QUALITY] }
            },
            required: [
              "marketScope",
              "resolutionSource",
              "forecastBasis",
              "timingWindow",
              "edgeStyle",
              "weatherDrivers",
              "evidenceQuality"
            ]
          }
        },
        required: [
          "address",
          "displayName",
          "alias",
          "strategyFocus",
          "bio",
          "teamNote",
          "watchlist",
          "confidence",
          "sourceExcerpt",
          "highlightTags",
          "keyMetrics",
          "primarySignals",
          "weatherSignals"
        ]
      }
    }
  },
  required: ["items"]
} as const;

const GROQ_AI_EXTRACT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: GEMINI_AI_EXTRACT_SCHEMA.properties,
  required: ["items"]
} as const;

const SYSTEM_PROMPT = `
你是 Polymarket 地址库的结构化整理助手。输入已经是搜索系统 AI 返回的结果，你不用重新核验真假，只需要提炼、筛选、压缩并输出结构化 JSON。

核心目标：
1. 先回答“这个地址和别人最不一样的地方是什么”。
2. 优先输出 5 类主差异信号：地点专精、高频-地区、高胜率-地区、高暴击-地区、结构型选手（彩票型 / 拆分型 / 流动型）。
3. highlightTags 可以宽松保留搜索 AI 的原始重点标签，但 primarySignals 必须按统一 taxonomy 输出。
4. strategyFocus 必须是一句解释句，说明差异，不要只是重复标签。
5. 人物背景、泛化评价、备注性信息只放到 bio 或 teamNote。

禁止事项：
- 不要编造地址、地区、指标、别名、胜率、倍数
- 不要联网补充，不要用常识脑补
- 不要把“聪明、稳健、经验丰富、激进、高手”这类空泛词当成主标签或 strategyFocus
- alias 只有在输入里本来就有明确短称呼时才填写

输出要求：
- 只返回 JSON，格式固定为 { "items": [...] }
- 每个地址一条 item
- 字段固定：address、displayName、alias、strategyFocus、bio、teamNote、watchlist、confidence、sourceExcerpt、highlightTags、keyMetrics、primarySignals、weatherSignals
- primarySignals.kind 只允许：geo_specialty、frequency_region、winrate_region、payout_region、trader_archetype
- strategyFocus 优先写成解释句，例如：
  - 主做首尔，高胜率更突出，胜率 68%，偏拆分进场
  - 新加坡高频明显，暴击倍数更强，已卖出占比高，偏流动型
- 缺失值使用空字符串、false、unknown 或空数组，不要省略字段

正例：
输入：地址 0x1111111111111111111111111111111111111111；显示名 Wumai；标签匹配 高频交易地区-新加坡 高暴击-新加坡 流动型选手；关键数据 新加坡交易占比 62%, 新加坡盈利倍数 3.8x, 已卖出占比 71%。
输出时：
- highlightTags 可保留 ["高频-新加坡","高暴击-新加坡","流动型选手"]
- primarySignals 至少包含 frequency_region、payout_region、trader_archetype
- strategyFocus 可写“新加坡高频明显，暴击倍数更强，已卖出占比高，偏流动型”

负例：
如果输入只有“很聪明、经验丰富、值得关注”，那这些只能进 bio/teamNote，highlightTags 和 primarySignals 应为空。
`.trim();

const normalizeHighlightTag = (value: string) => {
  let normalized = compactText(value)
    .replace(/^(标签匹配|标签|类型|选手类型|风格标签|重点标签)\s*[:：]?\s*/iu, "")
    .replace(/^高频交易地区\s*[-:：]?\s*/iu, "高频-")
    .replace(/^高频地区\s*[-:：]?\s*/iu, "高频-")
    .replace(/^高暴击地区\s*[-:：]?\s*/iu, "高暴击-")
    .replace(/^高胜率地区\s*[-:：]?\s*/iu, "高胜率-")
    .replace(/^地点专精\s*[-:：]?\s*/iu, "")
    .replace(/^地区专精\s*[-:：]?\s*/iu, "");

  for (const item of TRADER_ARCHETYPE_NORMALIZERS) {
    if (item.pattern.test(normalized)) {
      normalized = item.label;
      break;
    }
  }

  if (/专精|主战场|优势地区/iu.test(value) && normalized) {
    normalized = normalized.endsWith("专精") ? normalized : `${normalized}专精`;
  }

  normalized = normalized.replace(/\s+/gu, "").replace(/地区地区$/u, "地区");
  return normalized ? truncateText(normalized, MAX_HIGHLIGHT_TAG_LENGTH) : "";
};

const normalizeKeyMetric = (value: string) => {
  const normalized = compactText(value).replace(/^(关键数据|核心数据|数据)\s*[:：]?\s*/iu, "");
  return normalized ? truncateText(normalized, MAX_KEY_METRIC_LENGTH) : "";
};

const dedupeLabelDrafts = (labels: WalletImportLabelDraft[]) => {
  const deduped = new Map<string, WalletImportLabelDraft>();
  labels.forEach((label) => {
    deduped.set(`${label.kind}:${label.value.toLowerCase()}`, label);
  });
  return Array.from(deduped.values());
};

const normalizeHighlightTags = (values: string[] | undefined) =>
  Array.isArray(values)
    ? Array.from(new Set(values.map(normalizeHighlightTag).filter(Boolean))).slice(0, MAX_HIGHLIGHT_TAG_COUNT)
    : [];

const normalizeKeyMetrics = (values: string[] | undefined) =>
  Array.isArray(values)
    ? Array.from(new Set(values.map(normalizeKeyMetric).filter(Boolean))).slice(0, MAX_KEY_METRIC_COUNT)
    : [];

const normalizePrimarySignalKind = (value: string | undefined): WalletPrimarySignalKind | undefined => {
  const normalized = compactText(value).toLowerCase().replace(/\s+/gu, "_") as WalletPrimarySignalKind;
  return VALID_PRIMARY_SIGNAL_KIND.has(normalized) ? normalized : undefined;
};

const extractRegionFromTag = (value: string) => {
  const text = compactText(value)
    .replace(/^(高频|高胜率|高暴击)-/u, "")
    .replace(/专精$/u, "")
    .replace(/^(地点专精|地区专精)-?/u, "")
    .trim();
  return text || undefined;
};

const buildCanonicalSignalLabel = (kind: WalletPrimarySignalKind, label: string, region?: string) => {
  if (kind === "trader_archetype") {
    const archetype = TRADER_ARCHETYPE_NORMALIZERS.find((item) => item.pattern.test(label));
    return archetype?.label ?? label;
  }
  if (kind === "geo_specialty") {
    const value = compactText(region ?? label).replace(/专精$/u, "");
    return value ? `${value}专精` : "地点专精";
  }
  const value = compactText(region ?? label);
  if (!value) {
    return label;
  }
  if (kind === "frequency_region") {
    return `高频-${value}`;
  }
  if (kind === "winrate_region") {
    return `高胜率-${value}`;
  }
  return `高暴击-${value}`;
};

const resolveSignalKindFromLabel = (value: string): WalletPrimarySignalKind | undefined => {
  const normalized = normalizeHighlightTag(value);
  if (!normalized) {
    return undefined;
  }
  if (normalized.startsWith("高暴击-")) {
    return "payout_region";
  }
  if (normalized.startsWith("高胜率-")) {
    return "winrate_region";
  }
  if (normalized.startsWith("高频-")) {
    return "frequency_region";
  }
  if (normalized.endsWith("专精")) {
    return "geo_specialty";
  }
  if (TRADER_ARCHETYPE_NORMALIZERS.some((item) => item.pattern.test(normalized))) {
    return "trader_archetype";
  }
  return undefined;
};

const matchMetricBySignal = (
  kind: WalletPrimarySignalKind,
  region: string | undefined,
  keyMetrics: string[]
) => {
  const regionPattern = region ? new RegExp(region.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "i") : null;
  return (
    keyMetrics.find((metric) => {
      if (kind === "frequency_region") {
        return /交易占比|频|成交|活跃/u.test(metric) && (!regionPattern || regionPattern.test(metric));
      }
      if (kind === "winrate_region") {
        return /胜率/u.test(metric) && (!regionPattern || regionPattern.test(metric));
      }
      if (kind === "payout_region") {
        return /(盈利倍数|倍数|x\b|X\b|暴击)/u.test(metric) && (!regionPattern || regionPattern.test(metric));
      }
      if (kind === "trader_archetype") {
        return /(筹码成本占比|持仓均价|已卖出占比|成本占比)/u.test(metric);
      }
      return Boolean(regionPattern?.test(metric));
    }) ?? undefined
  );
};

const normalizePrimarySignal = (
  value: AiExtractSchemaPrimarySignal,
  keyMetrics: string[],
  sourceExcerpt: string
): WalletPrimarySignal | null => {
  const kind = normalizePrimarySignalKind(value.kind) ?? resolveSignalKindFromLabel(value.label ?? "");
  if (!kind) {
    return null;
  }
  const region = compactText(value.region) || extractRegionFromTag(value.label ?? "");
  const label = buildCanonicalSignalLabel(kind, normalizeHighlightTag(value.label ?? ""), region);
  if (!label) {
    return null;
  }
  const metricText = compactText(value.metricText) || matchMetricBySignal(kind, region, keyMetrics) || undefined;
  const evidence = compactExcerpt(value.evidence) || sourceExcerpt || undefined;
  return {
    kind,
    label: truncateText(label, MAX_LABEL_VALUE_LENGTH),
    region,
    metricText: metricText ? truncateText(metricText, MAX_KEY_METRIC_LENGTH) : undefined,
    priority: PRIMARY_SIGNAL_KIND_PRIORITY[kind],
    evidence
  };
};

const derivePrimarySignalsFromHighlightTags = (
  highlightTags: string[],
  keyMetrics: string[],
  sourceExcerpt: string
) =>
  highlightTags
    .map((tag) =>
      normalizePrimarySignal(
        {
          kind: resolveSignalKindFromLabel(tag),
          label: tag,
          region: extractRegionFromTag(tag),
          metricText: matchMetricBySignal(resolveSignalKindFromLabel(tag) ?? "geo_specialty", extractRegionFromTag(tag), keyMetrics),
          evidence: sourceExcerpt
        },
        keyMetrics,
        sourceExcerpt
      )
    )
    .filter((value): value is WalletPrimarySignal => Boolean(value));

export const normalizePrimarySignals = (
  values: AiExtractSchemaPrimarySignal[] | undefined,
  highlightTags: string[],
  keyMetrics: string[],
  sourceExcerpt: string
) => {
  const deduped = new Map<string, WalletPrimarySignal>();
  const candidates = [
    ...(Array.isArray(values) ? values : []).map((value) => normalizePrimarySignal(value, keyMetrics, sourceExcerpt)),
    ...derivePrimarySignalsFromHighlightTags(highlightTags, keyMetrics, sourceExcerpt)
  ].filter((value): value is WalletPrimarySignal => Boolean(value));

  candidates.forEach((signal) => {
    const key = `${signal.kind}:${signal.label.toLowerCase()}`;
    if (!deduped.has(key)) {
      deduped.set(key, signal);
    }
  });

  return Array.from(deduped.values())
    .sort(
      (left, right) =>
        (right.priority ?? 0) - (left.priority ?? 0) ||
        left.label.localeCompare(right.label, "zh-CN")
    )
    .slice(0, MAX_PRIMARY_SIGNAL_COUNT);
};

export const normalizeWeatherSignals = (
  value: AiExtractSchemaSignals | WalletWeatherSignalDraft | undefined
): WalletWeatherSignalDraft => {
  const weatherDrivers = Array.isArray(value?.weatherDrivers)
    ? dedupeStrings(
        value.weatherDrivers
          .map((item) => normalizeEnum(item, VALID_WEATHER_DRIVERS, "unknown"))
          .filter((item) => item !== "unknown")
      ).slice(0, WEATHER_DRIVER_LIMIT)
    : [];

  return {
    marketScope: normalizeEnum(value?.marketScope, VALID_MARKET_SCOPE, "unknown"),
    resolutionSource: normalizeEnum(value?.resolutionSource, VALID_RESOLUTION_SOURCE, "unknown"),
    forecastBasis: normalizeEnum(value?.forecastBasis, VALID_FORECAST_BASIS, "unknown"),
    timingWindow: normalizeEnum(value?.timingWindow, VALID_TIMING_WINDOW, "unknown"),
    edgeStyle: normalizeEnum(value?.edgeStyle, VALID_EDGE_STYLE, "unknown"),
    weatherDrivers,
    evidenceQuality: normalizeEnum(value?.evidenceQuality, VALID_EVIDENCE_QUALITY, "insufficient")
  };
};

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
  const weatherCount = countHighValueWeatherSignals(signals);
  const primaryCount = primarySignals.length;
  const hasEvidence =
    signals.evidenceQuality === "explicit_numeric" ||
    signals.evidenceQuality === "source_named" ||
    keyMetrics.length > 0 ||
    Boolean(sourceExcerpt);

  if (
    (primaryCount >= 3 && hasEvidence) ||
    (primaryCount >= 2 && keyMetrics.length >= 1) ||
    (primaryCount >= 1 && weatherCount >= 2 && hasEvidence)
  ) {
    return "high_signal";
  }

  if (
    primaryCount > 0 ||
    keyMetrics.length > 0 ||
    highlightTags.length > 0 ||
    weatherCount > 0 ||
    Boolean(compactText(strategyFocus)) ||
    Boolean(sourceExcerpt)
  ) {
    return "needs_review";
  }

  return "low_signal";
};

const createLabelDraft = (
  kind: WalletLabelKind,
  value: string | undefined,
  evidence?: string
): WalletImportLabelDraft | null => {
  const normalized = compactText(value);
  if (!normalized) {
    return null;
  }
  return {
    name: LABEL_NAME_COPY[kind],
    value: truncateText(normalized, MAX_LABEL_VALUE_LENGTH),
    kind,
    evidence: compactExcerpt(evidence) || undefined
  };
};

const buildPrimarySignalLabels = (signals: WalletPrimarySignal[]) =>
  signals
    .map((signal) =>
      createLabelDraft(
        PRIMARY_SIGNAL_LABEL_KINDS[signal.kind],
        signal.label,
        signal.metricText || signal.evidence
      )
    )
    .filter((label): label is WalletImportLabelDraft => Boolean(label));

const buildFallbackHighlightLabelDrafts = (
  highlightTags: string[],
  primarySignals: WalletPrimarySignal[],
  sourceExcerpt: string
) => {
  const primaryTexts = new Set(primarySignals.map((signal) => signal.label));
  return highlightTags
    .filter((tag) => !primaryTexts.has(tag))
    .map((tag) => {
      const kind = resolveSignalKindFromLabel(tag);
      return createLabelDraft(kind ? PRIMARY_SIGNAL_LABEL_KINDS[kind] : "group", tag, sourceExcerpt);
    })
    .filter((label): label is WalletImportLabelDraft => Boolean(label));
};

export const buildWeatherLabels = (
  signals: WalletWeatherSignalDraft,
  signalQuality: WalletAiSignalQuality
): WalletImportLabelDraft[] => {
  const labels: Array<WalletImportLabelDraft | null> = [
    createLabelDraft("market_scope", signals.marketScope === "unknown" ? undefined : MARKET_SCOPE_COPY[signals.marketScope]),
    createLabelDraft(
      "resolution_source",
      signals.resolutionSource === "unknown" ? undefined : RESOLUTION_SOURCE_COPY[signals.resolutionSource]
    ),
    createLabelDraft(
      "forecast_basis",
      signals.forecastBasis === "unknown" ? undefined : FORECAST_BASIS_COPY[signals.forecastBasis]
    ),
    createLabelDraft(
      "timing_window",
      signals.timingWindow === "unknown" ? undefined : TIMING_WINDOW_COPY[signals.timingWindow]
    ),
    createLabelDraft(
      "edge_style",
      signals.edgeStyle === "unknown" ? undefined : EDGE_STYLE_COPY[signals.edgeStyle]
    )
  ];

  signals.weatherDrivers.forEach((driver) => {
    labels.push(createLabelDraft("weather_driver", driver === "unknown" ? undefined : WEATHER_DRIVER_COPY[driver]));
  });
  labels.push(createLabelDraft("signal_quality", SIGNAL_QUALITY_COPY[signalQuality]));
  return labels.filter((label): label is WalletImportLabelDraft => Boolean(label));
};

const buildAiLabels = (
  primarySignals: WalletPrimarySignal[],
  highlightTags: string[],
  weatherSignals: WalletWeatherSignalDraft,
  signalQuality: WalletAiSignalQuality,
  sourceExcerpt: string
) =>
  dedupeLabelDrafts([
    ...buildPrimarySignalLabels(primarySignals),
    ...buildFallbackHighlightLabelDrafts(highlightTags, primarySignals, sourceExcerpt),
    ...buildWeatherLabels(weatherSignals, signalQuality)
  ]);

export const filterWeatherHighlightLabels = <T extends { kind: WalletLabelKind }>(labels: T[]) =>
  labels.filter((label) => WEATHER_HIGHLIGHT_LABEL_KINDS.has(label.kind));

export const buildWeatherStrategyFocus = (
  signals: WalletWeatherSignalDraft,
  fallbackText?: string
) => {
  const parts = [
    signals.forecastBasis === "unknown" ? "" : FORECAST_BASIS_COPY[signals.forecastBasis],
    signals.timingWindow === "unknown" ? "" : TIMING_WINDOW_COPY[signals.timingWindow],
    signals.edgeStyle === "unknown" ? "" : EDGE_STYLE_COPY[signals.edgeStyle],
    signals.weatherDrivers[0] ? WEATHER_DRIVER_COPY[signals.weatherDrivers[0]] : ""
  ].filter(Boolean);
  if (parts.length > 0) {
    return truncateText(parts.join(" / "), MAX_SUMMARY_LENGTH);
  }
  const compactFallback = compactText(fallbackText);
  return compactFallback ? truncateText(compactFallback, MAX_SUMMARY_LENGTH) : "";
};

const buildGeneratedStrategyFocus = (
  primarySignals: WalletPrimarySignal[],
  keyMetrics: string[],
  weatherSignals: WalletWeatherSignalDraft
) => {
  const [primary, secondary] = primarySignals;
  const metric = primary?.metricText || secondary?.metricText || keyMetrics[0];
  const parts: string[] = [];

  if (primary?.kind === "winrate_region") {
    parts.push(primary.region ? `主做${primary.region}` : primary.label);
    parts.push("高胜率更突出");
  } else if (primary?.kind === "payout_region") {
    parts.push(primary.region ? `${primary.region}暴击更强` : primary.label);
  } else if (primary?.kind === "frequency_region") {
    parts.push(primary.region ? `${primary.region}高频明显` : primary.label);
  } else if (primary?.kind === "geo_specialty") {
    parts.push(primary.region ? `主做${primary.region}` : primary.label);
  } else if (primary?.kind === "trader_archetype") {
    parts.push(primary.label.replace("选手", ""));
  }

  if (secondary?.kind === "trader_archetype") {
    parts.push(`偏${secondary.label.replace("选手", "")}`);
  } else if (secondary?.kind === "winrate_region") {
    parts.push("高胜率更突出");
  } else if (secondary?.kind === "payout_region") {
    parts.push("暴击倍数更强");
  } else if (secondary?.kind === "frequency_region") {
    parts.push("高频更明显");
  }

  if (metric) {
    parts.push(metric);
  } else {
    const fallback = buildWeatherStrategyFocus(weatherSignals);
    if (fallback) {
      parts.push(fallback);
    }
  }

  const summary = parts.filter(Boolean).join("，");
  return summary ? truncateText(summary, MAX_SUMMARY_LENGTH) : "";
};

export const buildAiStrategyFocus = (
  explicitSummary: string | undefined,
  primarySignals: WalletPrimarySignal[],
  keyMetrics: string[],
  weatherSignals: WalletWeatherSignalDraft
) => {
  const compactSummary = compactText(explicitSummary);
  if (compactSummary && !GENERIC_SUMMARY_CUE.test(compactSummary)) {
    return truncateText(compactSummary, MAX_SUMMARY_LENGTH);
  }
  const generated = buildGeneratedStrategyFocus(primarySignals, keyMetrics, weatherSignals);
  if (generated) {
    return generated;
  }
  if (keyMetrics.length > 0) {
    return truncateText(keyMetrics.slice(0, 2).join("，"), MAX_SUMMARY_LENGTH);
  }
  return buildWeatherStrategyFocus(weatherSignals, explicitSummary);
};

const shouldKeepWatchlist = (
  watchlist: boolean | undefined,
  sourceExcerpt: string,
  teamNote?: string
) => Boolean(watchlist) || WATCHLIST_CUE.test(`${sourceExcerpt} ${teamNote ?? ""}`);

const buildProviderConfig = async (): Promise<ProviderRuntimeConfig> => {
  const bindings = await getSmartMoneyBindings();
  const providerOrderRaw =
    bindings?.WALLET_AI_PROVIDER_ORDER ??
    process.env.WALLET_AI_PROVIDER_ORDER ??
    "gemini,groq";
  const providerOrder = providerOrderRaw
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter((item): item is ProviderName => item === "gemini" || item === "groq");

  return {
    geminiApiKey: bindings?.GEMINI_API_KEY ?? process.env.GEMINI_API_KEY,
    groqApiKey: bindings?.GROQ_API_KEY ?? process.env.GROQ_API_KEY,
    providerOrder: providerOrder.length > 0 ? providerOrder : ["gemini", "groq"],
    geminiModel:
      bindings?.WALLET_AI_GEMINI_MODEL ??
      process.env.WALLET_AI_GEMINI_MODEL ??
      DEFAULT_GEMINI_MODEL,
    groqModel:
      bindings?.WALLET_AI_GROQ_MODEL ??
      process.env.WALLET_AI_GROQ_MODEL ??
      DEFAULT_GROQ_MODEL
  };
};

const extractGeminiJson = (payload: unknown) => {
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
  config: ProviderRuntimeConfig,
  fallbackUsed: boolean
) => {
  if (!config.geminiApiKey) {
    throw new Error("missing GEMINI_API_KEY");
  }

  const response = await fetch(
    `${GEMINI_BASE_URL}/models/${encodeURIComponent(config.geminiModel)}:generateContent?key=${encodeURIComponent(config.geminiApiKey)}`,
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
          responseSchema: GEMINI_AI_EXTRACT_SCHEMA
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

  const parsed = JSON.parse(extractGeminiJson(payload)) as { items?: AiExtractSchemaItem[] };
  return {
    items: Array.isArray(parsed.items) ? parsed.items : [],
    providerMeta: {
      provider: "gemini",
      model: config.geminiModel,
      fallbackUsed,
      succeededAt: new Date().toISOString()
    } satisfies WalletAiProviderMeta
  };
};

const callGroq = async (
  input: WalletAiExtractRequest,
  config: ProviderRuntimeConfig,
  fallbackUsed: boolean
) => {
  if (!config.groqApiKey) {
    throw new Error("missing GROQ_API_KEY");
  }

  const response = await fetch(`${GROQ_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.groqApiKey}`
    },
    body: JSON.stringify({
      model: config.groqModel,
      temperature: 0.1,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `sourceName: ${input.sourceName ?? "text"}\n\nrawText:\n${input.text}` }
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "wallet_primary_signal_extract",
          schema: GROQ_AI_EXTRACT_SCHEMA,
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

  const content = compactText(
    (payload as { choices?: Array<{ message?: { content?: string } }> })?.choices?.[0]?.message
      ?.content
  );
  if (!content) {
    throw new Error("groq returned empty content");
  }

  const parsed = JSON.parse(content) as { items?: AiExtractSchemaItem[] };
  return {
    items: Array.isArray(parsed.items) ? parsed.items : [],
    providerMeta: {
      provider: "groq",
      model: config.groqModel,
      fallbackUsed,
      succeededAt: new Date().toISOString()
    } satisfies WalletAiProviderMeta
  };
};

const normalizeAiItemsToRows = (items: AiExtractSchemaItem[], providerMeta: WalletAiProviderMeta) =>
  items.map((item, index) => {
    const address = compactText(item.address);
    const normalizedAddress = normalizeAddress(address);
    const sourceExcerpt = compactExcerpt(item.sourceExcerpt);
    const rawDisplayName = compactText(item.displayName);
    const displayName = rawDisplayName || normalizedAddress || "";
    const weatherSignals = normalizeWeatherSignals(item.weatherSignals);
    const highlightTags = normalizeHighlightTags(item.highlightTags);
    const keyMetrics = normalizeKeyMetrics(item.keyMetrics);
    const primarySignals = normalizePrimarySignals(item.primarySignals, highlightTags, keyMetrics, sourceExcerpt);
    const strategyFocus = buildAiStrategyFocus(item.strategyFocus, primarySignals, keyMetrics, weatherSignals);
    const signalQuality = inferWalletAiSignalQuality(
      weatherSignals,
      primarySignals,
      highlightTags,
      keyMetrics,
      sourceExcerpt,
      strategyFocus
    );
    const alias = sanitizeAlias(item.alias, displayName);
    const labels = buildAiLabels(primarySignals, highlightTags, weatherSignals, signalQuality, sourceExcerpt);
    const warnings: string[] = [];
    const errors: string[] = [];
    const watchlistEnabled = shouldKeepWatchlist(item.watchlist, sourceExcerpt, item.teamNote);

    if (!normalizedAddress) {
      errors.push("AI 未提取出有效地址");
    }
    if (!rawDisplayName) {
      errors.push("AI 未提取出显示名");
    }
    if (!sourceExcerpt) {
      warnings.push("缺少原文摘录，建议补充证据后再确认导入");
    }
    if (primarySignals.length === 0 && highlightTags.length > 0) {
      warnings.push("已保留原始重点标签，但主差异信号仍建议人工复核");
    }
    if (signalQuality === "needs_review") {
      warnings.push("当前条目建议进入复核视图后再作为主标注使用");
    }
    if (signalQuality === "low_signal") {
      warnings.push("当前材料重点不够集中，系统已尽量保留原始结果供后续整理");
    }
    if (compactText(item.alias) && !alias) {
      warnings.push("别名过长或不适合页内展示，已自动清空回退为显示名");
    }

    return {
      rowNumber: index + 1,
      wallet: {
        address,
        displayName,
        alias,
        strategyFocus: strategyFocus || undefined,
        bio: sanitizeLongText(item.bio, MAX_BIO_LENGTH),
        teamNote: sanitizeLongText(item.teamNote, MAX_TEAM_NOTE_LENGTH)
      },
      labels,
      note: sanitizeLongText(item.teamNote, MAX_TEAM_NOTE_LENGTH),
      watchlistNote: watchlistEnabled ? "AI 标记为重点跟踪样本" : undefined,
      sourceExcerpt: sourceExcerpt || undefined,
      warnings,
      errors,
      confidence: normalizeConfidence(item.confidence),
      signalQuality,
      weatherSignals,
      highlightTags,
      keyMetrics,
      primarySignals,
      providerMeta
    } satisfies WalletAiExtractPreviewRow;
  });

export const extractWalletsWithAi = async (input: WalletAiExtractRequest) => {
  const config = await buildProviderConfig();
  const errors: string[] = [];

  for (const [index, provider] of config.providerOrder.entries()) {
    try {
      const result =
        provider === "gemini"
          ? await callGemini(input, config, index > 0)
          : await callGroq(input, config, index > 0);

      return {
        rows: normalizeAiItemsToRows(result.items, result.providerMeta),
        providerMeta: result.providerMeta
      };
    } catch (error) {
      errors.push(error instanceof Error ? error.message : `${provider} extraction failed`);
    }
  }

  throw new Error(errors.join(" | ") || "no AI provider available");
};
