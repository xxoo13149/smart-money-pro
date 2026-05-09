import {
  normalizeAddress,
  type WalletImportPreviewRow,
  type WalletLabelKind
} from "@weather-smart-money/core";

type CanonicalField =
  | "address"
  | "displayName"
  | "alias"
  | "bio"
  | "strategyFocus"
  | "teamNote"
  | "firstSeenAt"
  | "marketCity"
  | "resolutionSource"
  | "forecastBasis"
  | "timingWindow"
  | "edgeStyle"
  | "weatherDrivers"
  | "sourceExcerpt"
  | "watchlist"
  | "watchReason"
  | "note"
  | "tags"
  | "region"
  | "specialty"
  | "style"
  | "strategyHabit"
  | "risk"
  | "confidence";

export interface WalletImportFieldGuide {
  key: CanonicalField;
  label: string;
  required?: boolean;
  description: string;
  examples: string[];
}

export interface WalletImportPreview {
  fileName: string;
  detectedFormat: "json" | "csv" | "txt";
  totalRows: number;
  validRows: number;
  invalidRows: number;
  importedFieldGuide: WalletImportFieldGuide[];
  rows: WalletImportPreviewRow[];
}

export const WALLET_IMPORT_FIELD_GUIDE: WalletImportFieldGuide[] = [
  {
    key: "address",
    label: "地址",
    required: true,
    description: "必填。识别 0x 地址即可，支持 address、wallet、proxyWallet 等列名。",
    examples: ["0x81a60a0882a2393dd4a453e257af763e3362762e"]
  },
  {
    key: "displayName",
    label: "显示名",
    required: true,
    description: "必填。后台列表、检索结果和详情页优先展示这个名字。",
    examples: ["Wumai", "Singapore Temp Desk"]
  },
  {
    key: "alias",
    label: "扩展别名",
    description: "可选。用于页内标注的短称呼，建议控制在 18 个字以内。",
    examples: ["Wumai", "SG Tail"]
  },
  {
    key: "marketCity",
    label: "主要市场/城市",
    description: "推荐。用于说明地址主要盯哪个城市或市场。",
    examples: ["Singapore", "Seoul", "Tokyo"]
  },
  {
    key: "resolutionSource",
    label: "结算来源或站点",
    description: "推荐。只写材料里明确出现的官方来源或站点。",
    examples: ["NWS/NOAA", "JMA", "KMA", "DWD"]
  },
  {
    key: "forecastBasis",
    label: "主要依据",
    description: "推荐。描述常用的预测依据，例如集合预报、官方格点、临近预报、站点实测。",
    examples: ["ensemble guidance", "official grid", "station observation"]
  },
  {
    key: "timingWindow",
    label: "常用时间窗口",
    description: "推荐。写 D1、D2+、日内或临近收盘等交易节奏。",
    examples: ["D1", "D2+", "intraday", "near close"]
  },
  {
    key: "edgeStyle",
    label: "常见下注方式",
    description: "推荐。只写真正影响下单方式的描述，例如做上尾、抓阈值、临近重定价。",
    examples: ["upper tail", "range threshold", "late reprice"]
  },
  {
    key: "weatherDrivers",
    label: "天气驱动",
    description: "推荐。写 1-2 个明确天气驱动，避免泛化叙事。",
    examples: ["cloud cover", "precip timing", "urban heat"]
  },
  {
    key: "watchReason",
    label: "重点观察原因",
    description: "可选。只有明确要持续跟踪时再写。",
    examples: ["关键样本", "持续跟踪近收盘重定价"]
  },
  {
    key: "sourceExcerpt",
    label: "原文证据摘录",
    description: "强烈推荐。保留能支撑判断的一段原文，AI 和复审都会优先看这里。",
    examples: [
      "Uses NWS/NOAA obs, watches D1 ensemble spread, leans upper tail when cloud cover clears late."
    ]
  },
  {
    key: "teamNote",
    label: "团队备注",
    description: "可选。写给内部团队看的长一点说明，主展示不会直接用这段内容。",
    examples: ["主要盯 Singapore 日最高温，偏爱云量和临近收盘重定价。"]
  },
  {
    key: "watchlist",
    label: "Watchlist",
    description: "可选。填 true/yes/是，或直接写持续跟踪原因。",
    examples: ["true", "yes", "重点观察"]
  },
  {
    key: "firstSeenAt",
    label: "首次发现时间",
    description: "可选。推荐 ISO 时间，也接受 YYYY-MM-DD。",
    examples: ["2026-04-07T00:00:00.000Z", "2026-04-07"]
  }
];

const FIELD_ALIASES: Record<string, CanonicalField> = {
  address: "address",
  wallet: "address",
  walletaddress: "address",
  walletaddr: "address",
  proxywallet: "address",
  proxyaddress: "address",
  addr: "address",
  钱包地址: "address",
  地址: "address",
  displayname: "displayName",
  display: "displayName",
  name: "displayName",
  username: "displayName",
  user: "displayName",
  名称: "displayName",
  显示名: "displayName",
  用户名: "displayName",
  alias: "alias",
  nick: "alias",
  nickname: "alias",
  别名: "alias",
  标注名: "alias",
  bio: "bio",
  intro: "bio",
  profile: "bio",
  description: "bio",
  简介: "bio",
  描述: "bio",
  strategyfocus: "strategyFocus",
  strategy: "strategyFocus",
  thesis: "strategyFocus",
  summary: "strategyFocus",
  策略: "strategyFocus",
  策略重点: "strategyFocus",
  一句话摘要: "strategyFocus",
  marketcity: "marketCity",
  market: "marketCity",
  city: "marketCity",
  location: "marketCity",
  城市: "marketCity",
  市场: "marketCity",
  主要市场: "marketCity",
  主要市场城市: "marketCity",
  resolutionsource: "resolutionSource",
  source: "resolutionSource",
  station: "resolutionSource",
  settlementsource: "resolutionSource",
  官方结算来源: "resolutionSource",
  结算来源: "resolutionSource",
  结算来源或站点: "resolutionSource",
  forecastbasis: "forecastBasis",
  basis: "forecastBasis",
  signalbasis: "forecastBasis",
  主要依据: "forecastBasis",
  预测依据: "forecastBasis",
  timingwindow: "timingWindow",
  timing: "timingWindow",
  window: "timingWindow",
  常用时间窗口: "timingWindow",
  时间窗口: "timingWindow",
  edgestyle: "edgeStyle",
  edge: "edgeStyle",
  betstyle: "edgeStyle",
  executionstyle: "edgeStyle",
  常见下注方式: "edgeStyle",
  下注方式: "edgeStyle",
  weatherdrivers: "weatherDrivers",
  driver: "weatherDrivers",
  drivers: "weatherDrivers",
  驱动: "weatherDrivers",
  天气驱动: "weatherDrivers",
  sourceexcerpt: "sourceExcerpt",
  excerpt: "sourceExcerpt",
  evidence: "sourceExcerpt",
  quote: "sourceExcerpt",
  原文证据摘录: "sourceExcerpt",
  原文摘录: "sourceExcerpt",
  证据摘录: "sourceExcerpt",
  teamnote: "teamNote",
  memo: "teamNote",
  comment: "teamNote",
  remarks: "teamNote",
  团队备注: "teamNote",
  备注: "teamNote",
  note: "note",
  notes: "note",
  watchlist: "watchlist",
  watch: "watchlist",
  tracking: "watchlist",
  跟踪: "watchlist",
  观察列表: "watchlist",
  watchreason: "watchReason",
  reason: "watchReason",
  重点观察原因: "watchReason",
  持续跟踪原因: "watchReason",
  firstseenat: "firstSeenAt",
  firstseen: "firstSeenAt",
  firstseentime: "firstSeenAt",
  首次发现: "firstSeenAt",
  首次发现时间: "firstSeenAt",
  tags: "tags",
  labels: "tags",
  tag: "tags",
  标签: "tags",
  region: "region",
  geography: "region",
  area: "region",
  地区: "region",
  specialty: "specialty",
  focus: "specialty",
  niche: "specialty",
  专精: "specialty",
  赛道: "specialty",
  style: "style",
  风格: "style",
  strategyhabit: "strategyHabit",
  habit: "strategyHabit",
  策略习惯: "strategyHabit",
  操作习惯: "strategyHabit",
  risk: "risk",
  风险: "risk",
  confidence: "confidence",
  信心: "confidence",
  置信度: "confidence"
};

const BOOLEANISH_TRUE = new Set([
  "1",
  "true",
  "yes",
  "y",
  "watch",
  "watchlist",
  "on",
  "是",
  "加入",
  "跟踪",
  "需要跟踪",
  "重点观察"
]);

const normalizeKey = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/["'`]/g, "")
    .replace(/[\s_\-.:/\\(){}\[\]]+/g, "");

const cleanValue = (value: unknown) => {
  if (typeof value === "string") {
    return value.replace(/\u0000/g, "").trim();
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return "";
};

const compactText = (value: string | null | undefined) => (value ?? "").replace(/\s+/g, " ").trim();

const truncateText = (value: string, maxLength: number) =>
  value.length <= maxLength ? value : `${value.slice(0, maxLength - 3).trimEnd()}...`;

export const splitLabelsText = (value: string) =>
  value
    .split(/[，,;；/|、\n]+/)
    .map((item) => item.trim())
    .filter(Boolean);

const parseBooleanish = (value: string) => BOOLEANISH_TRUE.has(value.trim().toLowerCase());

const toRecord = (value: unknown): Record<string, string> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, entryValue]) => [key, cleanValue(entryValue)])
  );
};

const parseCsvLine = (line: string, delimiter: string) => {
  const result: string[] = [];
  let current = "";
  let insideQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (char === '"') {
      if (insideQuotes && next === '"') {
        current += '"';
        index += 1;
      } else {
        insideQuotes = !insideQuotes;
      }
      continue;
    }

    if (char === delimiter && !insideQuotes) {
      result.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  result.push(current.trim());
  return result;
};

const detectFormat = (fileName: string, text: string): "json" | "csv" | "txt" => {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".json")) {
    return "json";
  }
  if (lower.endsWith(".csv")) {
    return "csv";
  }
  if (lower.endsWith(".txt")) {
    return "txt";
  }

  const trimmed = text.trim();
  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    return "json";
  }
  if (trimmed.includes(",") || trimmed.includes("\t")) {
    return "csv";
  }
  return "txt";
};

const parseDelimitedText = (text: string) => {
  const lines = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const firstLine = lines[0];
  if (!firstLine) {
    return [] as Record<string, string>[];
  }

  const delimiter = firstLine.includes("\t") ? "\t" : ",";
  const headers = parseCsvLine(firstLine, delimiter);

  return lines.slice(1).map((line) => {
    const columns = parseCsvLine(line, delimiter);
    return Object.fromEntries(
      headers.map((header, index) => [header, cleanValue(columns[index] ?? "")])
    );
  });
};

const parseKeyValueBlocks = (text: string) =>
  text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n\s*\r?\n/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      const entries = block
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .flatMap((line) => {
          const separatorIndex = line.indexOf(":");
          if (separatorIndex < 1) {
            return [];
          }

          const key = line.slice(0, separatorIndex).trim();
          const value = line.slice(separatorIndex + 1).trim();
          if (!key || !value) {
            return [];
          }

          return [[key, value] as const];
        });

      return entries.length > 0 ? Object.fromEntries(entries) : null;
    })
    .filter((record): record is Record<string, string> => Boolean(record));

const parseTxtText = (text: string) => {
  const trimmed = text.trim().replace(/^\uFEFF/, "");
  if (!trimmed) {
    return [] as Record<string, string>[];
  }

  const lines = trimmed.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.every((line) => line.trim().startsWith("{") && line.trim().endsWith("}"))) {
    return lines.map((line) => toRecord(JSON.parse(line)));
  }

  const keyValueBlocks = parseKeyValueBlocks(trimmed);
  if (keyValueBlocks.length > 0) {
    return keyValueBlocks;
  }

  const firstLine = lines[0];
  if (firstLine && (firstLine.includes(",") || firstLine.includes("\t"))) {
    return parseDelimitedText(trimmed);
  }

  return lines.map((line) => ({
    address: line.trim(),
    displayName: line.trim()
  }));
};

const parseJsonText = (text: string) => {
  const parsed = JSON.parse(text) as unknown;

  if (Array.isArray(parsed)) {
    return parsed.map(toRecord);
  }

  if (parsed && typeof parsed === "object") {
    const items =
      (parsed as { items?: unknown[]; data?: unknown[]; rows?: unknown[]; wallets?: unknown[] }).items ??
      (parsed as { items?: unknown[]; data?: unknown[]; rows?: unknown[]; wallets?: unknown[] }).data ??
      (parsed as { items?: unknown[]; data?: unknown[]; rows?: unknown[]; wallets?: unknown[] }).rows ??
      (parsed as { items?: unknown[]; data?: unknown[]; rows?: unknown[]; wallets?: unknown[] }).wallets;

    if (Array.isArray(items)) {
      return items.map(toRecord);
    }

    return [toRecord(parsed)];
  }

  return [] as Record<string, string>[];
};

const canonicalizeRecord = (source: Record<string, string>) => {
  const canonical = new Map<CanonicalField, string>();
  const unknownFields: Record<string, string> = {};

  Object.entries(source).forEach(([key, rawValue]) => {
    const value = cleanValue(rawValue);
    if (!value) {
      return;
    }

    const canonicalKey = FIELD_ALIASES[normalizeKey(key)];
    if (canonicalKey) {
      if (!canonical.has(canonicalKey)) {
        canonical.set(canonicalKey, value);
      }
      return;
    }

    unknownFields[key] = value;
  });

  return { canonical, unknownFields };
};

const toWeatherDriverLabel = (value: string) => {
  const normalized = compactText(value).toLowerCase();
  if (!normalized) {
    return "";
  }
  if (/cloud/.test(normalized) || /云/.test(normalized)) {
    return "云量";
  }
  if (/precip|rain|storm/.test(normalized) || /降水|降雨|雷暴/.test(normalized)) {
    return "降水时点";
  }
  if (/wind/.test(normalized) || /风/.test(normalized)) {
    return "风向切换";
  }
  if (/dew|humidity/.test(normalized) || /湿度|露点/.test(normalized)) {
    return "湿度/露点";
  }
  if (/ridge|heat dome/.test(normalized) || /热穹|高压/.test(normalized)) {
    return "高压热穹";
  }
  if (/front/.test(normalized) || /锋面/.test(normalized)) {
    return "锋面过境";
  }
  if (/urban/.test(normalized) || /热岛/.test(normalized)) {
    return "城市热岛";
  }
  return truncateText(compactText(value), 16);
};

const buildStrategySummary = (canonical: Map<CanonicalField, string>) => {
  const direct = compactText(canonical.get("strategyFocus"));
  if (direct) {
    return truncateText(direct, 84);
  }

  const weatherParts = [
    compactText(canonical.get("forecastBasis")),
    compactText(canonical.get("timingWindow")),
    compactText(canonical.get("edgeStyle")),
    splitLabelsText(canonical.get("weatherDrivers") ?? "").map(toWeatherDriverLabel)[0] ?? ""
  ].filter(Boolean);

  if (weatherParts.length > 0) {
    return truncateText(weatherParts.join(" / "), 84);
  }

  const legacyParts = [
    compactText(canonical.get("strategyHabit")),
    compactText(canonical.get("region")),
    compactText(canonical.get("specialty"))
  ].filter(Boolean);

  return truncateText(legacyParts.join(" / "), 84);
};

const buildTeamNote = (
  canonical: Map<CanonicalField, string>,
  unknownFields: Record<string, string>
) => {
  const extraSummary = Object.entries(unknownFields)
    .slice(0, 6)
    .map(([key, value]) => `${key}: ${value}`)
    .join(" | ");

  const parts = [
    compactText(canonical.get("teamNote")),
    compactText(canonical.get("watchReason")),
    compactText(canonical.get("note")),
    compactText(canonical.get("tags")),
    compactText(extraSummary)
  ].filter(Boolean);

  return truncateText(parts.join(" | "), 260);
};

const pushLabel = (
  labels: Array<{ name: string; value: string; kind: WalletLabelKind }>,
  name: string,
  value: string | undefined,
  kind: WalletLabelKind
) => {
  const normalized = compactText(value);
  if (!normalized) {
    return;
  }

  labels.push({
    name,
    value: truncateText(normalized, 24),
    kind
  });
};

const buildLabels = (canonical: Map<CanonicalField, string>) => {
  const labels: Array<{ name: string; value: string; kind: WalletLabelKind }> = [];

  pushLabel(labels, "结算来源", canonical.get("resolutionSource"), "resolution_source");
  pushLabel(labels, "预测依据", canonical.get("forecastBasis"), "forecast_basis");
  pushLabel(labels, "时间窗口", canonical.get("timingWindow"), "timing_window");
  pushLabel(labels, "下注边", canonical.get("edgeStyle"), "edge_style");

  splitLabelsText(canonical.get("weatherDrivers") ?? "")
    .slice(0, 2)
    .forEach((driver) => {
      pushLabel(labels, "天气驱动", toWeatherDriverLabel(driver), "weather_driver");
    });

  return labels;
};

const buildWatchlistNote = (canonical: Map<CanonicalField, string>) => {
  const explicitReason = compactText(canonical.get("watchReason"));
  if (explicitReason) {
    return truncateText(explicitReason, 120);
  }

  const raw = compactText(canonical.get("watchlist"));
  if (!raw) {
    return undefined;
  }

  return parseBooleanish(raw) ? "导入时加入 watchlist" : truncateText(raw, 120);
};

const buildSourceExcerpt = (source: Record<string, string>, canonical: Map<CanonicalField, string>) => {
  const explicit = compactText(canonical.get("sourceExcerpt"));
  if (explicit) {
    return truncateText(explicit, 320);
  }

  return truncateText(
    Object.entries(source)
      .slice(0, 6)
      .map(([key, value]) => `${key}: ${value}`)
      .join(" | "),
    320
  );
};

export const validateWalletImportPreviewRow = (row: WalletImportPreviewRow) => {
  const warnings = [...row.warnings];
  const errors = [...row.errors];
  const normalizedAddress = normalizeAddress(row.wallet.address);

  if (!normalizedAddress) {
    errors.push("缺少有效地址");
  }

  if (!compactText(row.wallet.displayName)) {
    errors.push("缺少显示名");
  }

  return {
    ...row,
    warnings,
    errors
  } satisfies WalletImportPreviewRow;
};

const buildPreviewRow = (source: Record<string, string>, rowNumber: number): WalletImportPreviewRow => {
  const { canonical, unknownFields } = canonicalizeRecord(source);
  const rawAddress = canonical.get("address") ?? "";
  const normalizedAddress = normalizeAddress(rawAddress);
  const displayName =
    compactText(canonical.get("displayName")) ||
    compactText(canonical.get("alias")) ||
    normalizedAddress ||
    "";
  const strategyFocus = buildStrategySummary(canonical) || undefined;
  const teamNote = buildTeamNote(canonical, unknownFields) || undefined;
  const labels = buildLabels(canonical);
  const warnings: string[] = [];
  const errors: string[] = [];

  if (!normalizedAddress) {
    errors.push("缺少有效地址");
  }

  if (!displayName) {
    errors.push("缺少显示名");
  }

  if (labels.length < 2) {
    warnings.push("建议至少补充 2 个天气交易维度，例如来源、依据、时间窗口、下注边或天气驱动");
  }

  if (!compactText(canonical.get("sourceExcerpt"))) {
    warnings.push("缺少原文证据摘录，后续 AI 摘要和标签可信度会更弱");
  }

  if (Object.keys(unknownFields).length > 0) {
    warnings.push(`保留了 ${Object.keys(unknownFields).length} 个未识别字段，已折叠进团队备注`);
  }

  return {
    rowNumber,
    wallet: {
      address: rawAddress,
      displayName,
      alias: compactText(canonical.get("alias")) || undefined,
      bio: compactText(canonical.get("bio")) || undefined,
      strategyFocus,
      teamNote,
      firstSeenAt: compactText(canonical.get("firstSeenAt")) || undefined
    },
    labels,
    note: compactText(canonical.get("note")) || teamNote,
    watchlistNote: buildWatchlistNote(canonical),
    sourceExcerpt: buildSourceExcerpt(source, canonical),
    warnings,
    errors
  };
};

export const parseWalletImportText = (fileName: string, text: string): WalletImportPreview => {
  const detectedFormat = detectFormat(fileName, text);
  const rawRows =
    detectedFormat === "json"
      ? parseJsonText(text)
      : detectedFormat === "csv"
        ? parseDelimitedText(text)
        : parseTxtText(text);

  const rows = rawRows.map((row, index) =>
    validateWalletImportPreviewRow(buildPreviewRow(row, index + 1))
  );

  return {
    fileName,
    detectedFormat,
    totalRows: rows.length,
    validRows: rows.filter((row) => row.errors.length === 0).length,
    invalidRows: rows.filter((row) => row.errors.length > 0).length,
    importedFieldGuide: WALLET_IMPORT_FIELD_GUIDE,
    rows
  };
};
