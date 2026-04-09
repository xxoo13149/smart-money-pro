import { normalizeAddress } from "@weather-smart-money/core";
import type {
  WalletAiConfidence,
  WalletAiExtractPreviewRow,
  WalletAiExtractRequest,
  WalletAiProviderMeta,
  WalletAiSignalQuality,
  WalletImportLabelDraft,
  WalletLabelKind,
  WalletWeatherDriver,
  WalletWeatherEdgeStyle,
  WalletWeatherForecastBasis,
  WalletWeatherMarketScope,
  WalletWeatherResolutionSource,
  WalletWeatherSignalDraft,
  WalletWeatherTimingWindow
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
  weatherSignals?: AiExtractSchemaSignals;
}

const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";
const GROQ_BASE_URL = "https://api.groq.com/openai/v1";
const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash-lite";
const DEFAULT_GROQ_MODEL = "openai/gpt-oss-20b";

const MAX_ALIAS_LENGTH = 18;
const MAX_SUMMARY_LENGTH = 84;
const MAX_LABEL_VALUE_LENGTH = 24;
const MAX_SOURCE_EXCERPT_LENGTH = 320;
const MAX_BIO_LENGTH = 600;
const MAX_TEAM_NOTE_LENGTH = 320;
const WEATHER_DRIVER_LIMIT = 2;

const VALID_CONFIDENCE = new Set<WalletAiConfidence>(["high", "medium", "low", "unknown"]);
const WEATHER_MAIN_LABEL_KINDS = [
  "resolution_source",
  "forecast_basis",
  "timing_window",
  "edge_style",
  "weather_driver"
] as const satisfies readonly WalletLabelKind[];

const WEATHER_HIGHLIGHT_LABEL_KINDS = new Set<WalletLabelKind>(WEATHER_MAIN_LABEL_KINDS);

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
  upper_tail: "做上尾",
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

const LABEL_NAME_COPY: Record<
  | "market_scope"
  | "resolution_source"
  | "forecast_basis"
  | "timing_window"
  | "edge_style"
  | "weather_driver"
  | "signal_quality",
  string
> = {
  market_scope: "市场范围",
  resolution_source: "结算来源",
  forecast_basis: "预测依据",
  timing_window: "时间窗口",
  edge_style: "下注边",
  weather_driver: "天气驱动",
  signal_quality: "信号质量"
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
          confidence: {
            type: "string",
            enum: ["high", "medium", "low", "unknown"]
          },
          sourceExcerpt: { type: "string" },
          weatherSignals: {
            type: "object",
            properties: {
              marketScope: {
                type: "string",
                enum: ["single_city_max_temp", "multi_city_temp", "mixed_weather", "unknown"]
              },
              resolutionSource: {
                type: "string",
                enum: ["nws_noaa", "jma", "kma", "dwd", "official_other", "unknown"]
              },
              forecastBasis: {
                type: "string",
                enum: [
                  "ensemble_guidance",
                  "official_grid",
                  "nowcast",
                  "station_observation",
                  "narrative_only",
                  "unknown"
                ]
              },
              timingWindow: {
                type: "string",
                enum: ["d2_plus", "d1", "intraday", "near_close", "unknown"]
              },
              edgeStyle: {
                type: "string",
                enum: [
                  "upper_tail",
                  "baseline_mean",
                  "range_threshold",
                  "late_reprice",
                  "obs_reaction",
                  "unknown"
                ]
              },
              weatherDrivers: {
                type: "array",
                items: {
                  type: "string",
                  enum: [
                    "cloud_cover",
                    "precip_timing",
                    "wind_shift",
                    "humidity_dewpoint",
                    "ridge_heat_dome",
                    "front_passage",
                    "urban_heat",
                    "storm_outflow",
                    "unknown"
                  ]
                }
              },
              evidenceQuality: {
                type: "string",
                enum: ["explicit_numeric", "source_named", "qualitative_only", "insufficient"]
              }
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
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          address: { type: "string" },
          displayName: { type: "string" },
          alias: { type: "string" },
          strategyFocus: { type: "string" },
          bio: { type: "string" },
          teamNote: { type: "string" },
          watchlist: { type: "boolean" },
          confidence: {
            type: "string",
            enum: ["high", "medium", "low", "unknown"]
          },
          sourceExcerpt: { type: "string" },
          weatherSignals: {
            type: "object",
            additionalProperties: false,
            properties: {
              marketScope: {
                type: "string",
                enum: ["single_city_max_temp", "multi_city_temp", "mixed_weather", "unknown"]
              },
              resolutionSource: {
                type: "string",
                enum: ["nws_noaa", "jma", "kma", "dwd", "official_other", "unknown"]
              },
              forecastBasis: {
                type: "string",
                enum: [
                  "ensemble_guidance",
                  "official_grid",
                  "nowcast",
                  "station_observation",
                  "narrative_only",
                  "unknown"
                ]
              },
              timingWindow: {
                type: "string",
                enum: ["d2_plus", "d1", "intraday", "near_close", "unknown"]
              },
              edgeStyle: {
                type: "string",
                enum: [
                  "upper_tail",
                  "baseline_mean",
                  "range_threshold",
                  "late_reprice",
                  "obs_reaction",
                  "unknown"
                ]
              },
              weatherDrivers: {
                type: "array",
                items: {
                  type: "string",
                  enum: [
                    "cloud_cover",
                    "precip_timing",
                    "wind_shift",
                    "humidity_dewpoint",
                    "ridge_heat_dome",
                    "front_passage",
                    "urban_heat",
                    "storm_outflow",
                    "unknown"
                  ]
                }
              },
              evidenceQuality: {
                type: "string",
                enum: ["explicit_numeric", "source_named", "qualitative_only", "insufficient"]
              }
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
          "weatherSignals"
        ]
      }
    }
  },
  required: ["items"]
} as const;

const SYSTEM_PROMPT = `
角色：
你是 Polymarket 天气温度交易地址结构化助手，专门整理“最高温度/天气”市场里的地址资料。

目标：
只提取会影响天气温度市场交易判断的信息。主展示只服务交易决策，不做人物画像包装。

允许信息：
1. 结算来源或官方站点。
2. 预测依据，例如集合预报、官方格点、临近预报、站点实测。
3. 常用时间窗口，例如 D1、D2+、日内、近收盘。
4. 下注边，例如做上尾、做基线均值、抓阈值、等临近重定价、看实况反应。
5. 明确天气驱动，例如云量、降水时点、风向切换、湿度/露点、高压热穹、锋面过境、城市热岛、雷暴外流。
6. 原文证据摘录，只能来自输入材料。

禁止信息：
1. 不得编造地址、别名、来源、站点、城市、市场、结论。
2. 不得联网补充，也不得根据常识脑补。
3. 不要输出空泛人格标签，例如“聪明钱”“高频”“稳健”“激进”“经验丰富”“亚洲风格”。
4. 不要把人物背景、组织身份、社群身份放进主展示标签。
5. alias 只有输入材料中出现了清晰短称呼时才可填写，否则留空字符串。
6. strategyFocus 必须是一句短交易摘要，不得写成长背景。

输出要求：
1. 只返回 JSON，格式必须是 { "items": [...] }。
2. 每个地址拆成单独 item。
3. 无法确认的枚举必须填 "unknown"。
4. weatherDrivers 最多输出 2 个，而且必须有输入材料证据。
5. sourceExcerpt 保留最能支持判断的一小段原文。
6. watchlist 只有材料明确表达“重点观察 / 持续跟踪 / 关键样本”等意思时才能为 true。

枚举：
- marketScope: single_city_max_temp | multi_city_temp | mixed_weather | unknown
- resolutionSource: nws_noaa | jma | kma | dwd | official_other | unknown
- forecastBasis: ensemble_guidance | official_grid | nowcast | station_observation | narrative_only | unknown
- timingWindow: d2_plus | d1 | intraday | near_close | unknown
- edgeStyle: upper_tail | baseline_mean | range_threshold | late_reprice | obs_reaction | unknown
- weatherDrivers: cloud_cover | precip_timing | wind_shift | humidity_dewpoint | ridge_heat_dome | front_passage | urban_heat | storm_outflow | unknown
- evidenceQuality: explicit_numeric | source_named | qualitative_only | insufficient

Few-shot 正例：
输入片段：
地址: 0x1111111111111111111111111111111111111111
显示名: Wumai
主要市场/城市: Singapore
结算来源或站点: NWS/NOAA station observation
主要依据: D1 ensemble guidance and late cloud cover reduction
常用时间窗口: D1
常见下注方式: upper tail near threshold
重点观察原因: 持续跟踪样本
原文证据摘录: Uses NWS/NOAA obs, watches D1 ensemble spread, leans upper tail when cloud cover clears late.
输出：
{"items":[{"address":"0x1111111111111111111111111111111111111111","displayName":"Wumai","alias":"Wumai","strategyFocus":"集合预报 / D1 / 做上尾 / 云量","bio":"","teamNote":"持续跟踪样本","watchlist":true,"confidence":"high","sourceExcerpt":"Uses NWS/NOAA obs, watches D1 ensemble spread, leans upper tail when cloud cover clears late.","weatherSignals":{"marketScope":"single_city_max_temp","resolutionSource":"nws_noaa","forecastBasis":"ensemble_guidance","timingWindow":"d1","edgeStyle":"upper_tail","weatherDrivers":["cloud_cover"],"evidenceQuality":"source_named"}}]}

Few-shot 可导入但需 review：
输入片段：
地址: 0x2222222222222222222222222222222222222222
显示名: Seoul Desk
主要市场/城市: Seoul
主要依据: JMA style narrative update before close
常用时间窗口: near close
原文证据摘录: Usually adjusts late with narrative weather updates before close.
输出：
{"items":[{"address":"0x2222222222222222222222222222222222222222","displayName":"Seoul Desk","alias":"","strategyFocus":"文字判断 / 近收盘 / 临近重定价","bio":"","teamNote":"","watchlist":false,"confidence":"medium","sourceExcerpt":"Usually adjusts late with narrative weather updates before close.","weatherSignals":{"marketScope":"single_city_max_temp","resolutionSource":"unknown","forecastBasis":"narrative_only","timingWindow":"near_close","edgeStyle":"late_reprice","weatherDrivers":[],"evidenceQuality":"qualitative_only"}}]}

Few-shot 负例：
输入片段：
地址: 0x3333333333333333333333333333333333333333
显示名: Weather Master
描述: 天气高手，亚洲风格，经验丰富，聪明钱，值得关注。
输出：
{"items":[{"address":"0x3333333333333333333333333333333333333333","displayName":"Weather Master","alias":"","strategyFocus":"","bio":"天气高手，亚洲风格，经验丰富，聪明钱，值得关注。","teamNote":"","watchlist":false,"confidence":"low","sourceExcerpt":"天气高手，亚洲风格，经验丰富，聪明钱，值得关注。","weatherSignals":{"marketScope":"unknown","resolutionSource":"unknown","forecastBasis":"unknown","timingWindow":"unknown","edgeStyle":"unknown","weatherDrivers":[],"evidenceQuality":"insufficient"}}]}
`.trim();

const compactText = (value: unknown) =>
  typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";

const truncateText = (value: string, maxLength: number) =>
  value.length <= maxLength ? value : `${value.slice(0, maxLength - 3).trimEnd()}...`;

const normalizeConfidence = (value: string | undefined): WalletAiConfidence => {
  const normalized = compactText(value).toLowerCase() as WalletAiConfidence;
  return VALID_CONFIDENCE.has(normalized) ? normalized : "unknown";
};

const normalizeEnum = <T extends string>(value: string | undefined, valid: Set<T>, fallback: T): T => {
  const normalized = compactText(value).toLowerCase() as T;
  return valid.has(normalized) ? normalized : fallback;
};

const compactExcerpt = (value: string | undefined) => truncateText(compactText(value), MAX_SOURCE_EXCERPT_LENGTH);

const dedupeStrings = <T extends string>(values: T[]) => Array.from(new Set(values));

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
    evidenceQuality: normalizeEnum(
      value?.evidenceQuality,
      VALID_EVIDENCE_QUALITY,
      "insufficient"
    )
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
  signals: WalletWeatherSignalDraft
): WalletAiSignalQuality => {
  const highValueSignalCount = countHighValueWeatherSignals(signals);

  if (
    highValueSignalCount >= 3 &&
    (signals.evidenceQuality === "explicit_numeric" || signals.evidenceQuality === "source_named")
  ) {
    return "high_signal";
  }

  if (
    highValueSignalCount >= 1 &&
    signals.evidenceQuality !== "insufficient" &&
    signals.evidenceQuality !== "explicit_numeric"
  ) {
    return "needs_review";
  }

  if (highValueSignalCount >= 1 && signals.evidenceQuality === "explicit_numeric") {
    return "needs_review";
  }

  return "low_signal";
};

const createLabelDraft = (
  kind: WalletLabelKind,
  value: string | undefined
): WalletImportLabelDraft | null => {
  const normalized = compactText(value);
  if (!normalized) {
    return null;
  }

  return {
    name: LABEL_NAME_COPY[kind as keyof typeof LABEL_NAME_COPY] ?? "标签",
    value: truncateText(normalized, MAX_LABEL_VALUE_LENGTH),
    kind
  };
};

export const buildWeatherLabels = (
  signals: WalletWeatherSignalDraft,
  signalQuality: WalletAiSignalQuality
): WalletImportLabelDraft[] => {
  const labels: Array<WalletImportLabelDraft | null> = [
    createLabelDraft(
      "resolution_source",
      signals.resolutionSource === "unknown"
        ? undefined
        : RESOLUTION_SOURCE_COPY[signals.resolutionSource]
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
    ),
    createLabelDraft(
      "market_scope",
      signals.marketScope === "unknown" ? undefined : MARKET_SCOPE_COPY[signals.marketScope]
    )
  ];

  signals.weatherDrivers.forEach((driver) => {
    labels.push(
      createLabelDraft(
        "weather_driver",
        driver === "unknown" ? undefined : WEATHER_DRIVER_COPY[driver]
      )
    );
  });

  labels.push(createLabelDraft("signal_quality", SIGNAL_QUALITY_COPY[signalQuality]));

  return labels.filter((label): label is WalletImportLabelDraft => Boolean(label));
};

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

const sanitizeAlias = (
  alias: string | undefined,
  displayName: string,
  sourceExcerpt: string
): string | undefined => {
  const compactAlias = compactText(alias).replace(/[，。；;:：、]+$/g, "");
  if (!compactAlias || compactAlias.length > MAX_ALIAS_LENGTH) {
    return undefined;
  }

  if (compactAlias === displayName) {
    return undefined;
  }

  if (compactAlias.split(/\s+/).length > 4) {
    return undefined;
  }

  if (sourceExcerpt && !sourceExcerpt.includes(compactAlias) && !displayName.includes(compactAlias)) {
    return undefined;
  }

  return compactAlias;
};

const sanitizeLongText = (value: string | undefined, maxLength: number) => {
  const compactValue = compactText(value);
  return compactValue ? truncateText(compactValue, maxLength) : undefined;
};

const shouldKeepWatchlist = (watchlist: boolean | undefined, sourceExcerpt: string, teamNote?: string) =>
  Boolean(watchlist) && WATCHLIST_CUE.test(`${sourceExcerpt} ${compactText(teamNote)}`);

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
      headers: {
        "Content-Type": "application/json"
      },
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

  const jsonText = extractGeminiJson(payload);
  const parsed = JSON.parse(jsonText) as { items?: AiExtractSchemaItem[] };
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
        {
          role: "system",
          content: SYSTEM_PROMPT
        },
        {
          role: "user",
          content: `sourceName: ${input.sourceName ?? "text"}\n\nrawText:\n${input.text}`
        }
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "wallet_weather_extract",
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

const normalizeAiItemsToRows = (
  items: AiExtractSchemaItem[],
  providerMeta: WalletAiProviderMeta
) =>
  items.map((item, index) => {
    const address = compactText(item.address);
    const normalizedAddress = normalizeAddress(address);
    const sourceExcerpt = compactExcerpt(item.sourceExcerpt);
    const displayName = compactText(item.displayName) || normalizedAddress || "";
    const weatherSignals = normalizeWeatherSignals(item.weatherSignals);
    const signalQuality = inferWalletAiSignalQuality(weatherSignals);
    const strategyFocus = buildWeatherStrategyFocus(weatherSignals, item.strategyFocus);
    const alias = sanitizeAlias(item.alias, displayName, sourceExcerpt);
    const labels = buildWeatherLabels(weatherSignals, signalQuality);
    const warnings: string[] = [];
    const errors: string[] = [];
    const highValueSignalCount = countHighValueWeatherSignals(weatherSignals);
    const watchlistEnabled = shouldKeepWatchlist(item.watchlist, sourceExcerpt, item.teamNote);

    if (!normalizedAddress) {
      errors.push("AI 未提取出有效地址");
    }

    if (!displayName) {
      errors.push("AI 未提取出显示名");
    }

    if (!sourceExcerpt) {
      errors.push("缺少原文证据摘录");
    }

    if (highValueSignalCount < 2) {
      errors.push("高价值天气信号不足，至少需要 2 个明确维度");
    }

    if (signalQuality === "needs_review") {
      warnings.push("天气交易信号仍需人工复核");
    }

    if (signalQuality === "low_signal") {
      warnings.push("材料偏泛，交易信号较弱");
    }

    if (weatherSignals.evidenceQuality === "qualitative_only") {
      warnings.push("当前只有定性证据，建议补充来源或数值依据");
    }

    if (weatherSignals.evidenceQuality === "insufficient") {
      warnings.push("证据不足，默认进入低信号处理");
    }

    if (compactText(item.alias) && !alias) {
      warnings.push("别名不够短或证据不足，已自动清空");
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
