import type {
  AddressLabelBadge,
  WalletLabelKind,
  WalletPrimarySignalKind
} from "./types.js";

/**
 * Finder 标签目录：Finder-app 侧所有标签 key 到 Smart Pro 展示层的唯一映射表。
 *
 * 对齐 Finder 的四个标签分组：
 * - core_screening：核心筛选标签（6 个，命中=正式结果）
 * - portrait_style：画像/风格标签（Finder 自算行为画像）
 * - operational_data_quality：运行与数据状态（不是交易风格，不参与筛选）
 * - external_calibration_snapshot：外部校准快照（Husky 画像，仅展示）
 */
export type FinderLabelGroup =
  | "core_screening"
  | "portrait_style"
  | "operational_data_quality"
  | "external_calibration_snapshot";

export interface FinderLabelMeta {
  key: string;
  reportTitle: string;
  name: string;
  kind: WalletLabelKind;
  group: FinderLabelGroup;
  signalKind?: WalletPrimarySignalKind;
  fallbackValue: string;
}

const meta = (
  key: string,
  reportTitle: string,
  name: string,
  kind: WalletLabelKind,
  group: FinderLabelGroup,
  fallbackValue: string,
  signalKind?: WalletPrimarySignalKind
): FinderLabelMeta => ({
  key,
  reportTitle,
  name,
  kind,
  group,
  fallbackValue,
  signalKind
});

export const FINDER_LABEL_CATALOG: Record<string, FinderLabelMeta> = {
  // 核心筛选标签（CORE_SCREENING_LABEL_CATALOG）
  high_frequency_region: meta(
    "high_frequency_region",
    "高频交易地区",
    "高频地区",
    "frequency_region",
    "core_screening",
    "高频地区",
    "frequency_region"
  ),
  high_daily_region_profit: meta(
    "high_daily_region_profit",
    "高暴击",
    "高暴击地区",
    "payout_region",
    "core_screening",
    "高暴击",
    "payout_region"
  ),
  regional_high_win_rate: meta(
    "regional_high_win_rate",
    "高胜率",
    "高胜率地区",
    "winrate_region",
    "core_screening",
    "高胜率",
    "winrate_region"
  ),
  lottery_player: meta(
    "lottery_player",
    "彩票型选手",
    "选手类型",
    "trader_archetype",
    "core_screening",
    "彩票型选手",
    "trader_archetype"
  ),
  split_player: meta(
    "split_player",
    "拆分型选手",
    "选手类型",
    "trader_archetype",
    "core_screening",
    "拆分型选手",
    "trader_archetype"
  ),
  liquidity_player: meta(
    "liquidity_player",
    "流动型选手",
    "选手类型",
    "trader_archetype",
    "core_screening",
    "流动型选手",
    "trader_archetype"
  ),

  // 画像/风格标签（style_label_catalog.json）
  model_follower: meta(
    "model_follower",
    "模型共识跟随",
    "风格画像",
    "portrait_style",
    "portrait_style",
    "模型共识跟随"
  ),
  contrarian_hot: meta(
    "contrarian_hot",
    "逆高温",
    "风格画像",
    "portrait_style",
    "portrait_style",
    "逆高温"
  ),
  contrarian_cold: meta(
    "contrarian_cold",
    "逆低温",
    "风格画像",
    "portrait_style",
    "portrait_style",
    "逆低温"
  ),
  favorite_grinder: meta(
    "favorite_grinder",
    "热门价位交易者",
    "风格画像",
    "portrait_style",
    "portrait_style",
    "热门价位交易者"
  ),
  longshot_hunter: meta(
    "longshot_hunter",
    "低价博弈者",
    "风格画像",
    "portrait_style",
    "portrait_style",
    "低价博弈者"
  ),
  no_seller: meta("no_seller", "NO 仓偏好", "风格画像", "portrait_style", "portrait_style", "NO 仓偏好"),
  scalper: meta("scalper", "短线退出", "风格画像", "portrait_style", "portrait_style", "短线退出"),
  holder: meta("holder", "持有到结算", "风格画像", "portrait_style", "portrait_style", "持有到结算"),
  d1_planner: meta(
    "d1_planner",
    "提前一天布局",
    "风格画像",
    "portrait_style",
    "portrait_style",
    "提前一天布局"
  ),
  intraday_sniper: meta(
    "intraday_sniper",
    "日内入场",
    "风格画像",
    "portrait_style",
    "portrait_style",
    "日内入场"
  ),
  city_specialist: meta(
    "city_specialist",
    "城市专注",
    "风格画像",
    "portrait_style",
    "portrait_style",
    "城市专注"
  ),

  // 早期/新钱包画像（历史评估 key，保持既有展示不变）
  new_wallet: meta("new_wallet", "新钱包", "新钱包标签", "new_wallet_signal", "portrait_style", "新钱包"),
  hidden_expert_new_wallet: meta(
    "hidden_expert_new_wallet",
    "新钱包",
    "新钱包标签",
    "new_wallet_signal",
    "portrait_style",
    "隐藏高手新钱包"
  ),
  early_positioning: meta(
    "early_positioning",
    "提前埋伏",
    "提前埋伏",
    "early_entry_signal",
    "portrait_style",
    "提前埋伏"
  ),

  // 运行与数据状态（FINDER_OPERATIONAL_STATE_CATALOG）
  normal_active: meta(
    "normal_active",
    "活跃",
    "活跃标签",
    "activity_level",
    "operational_data_quality",
    "正常"
  ),
  low_active: meta("low_active", "活跃", "活跃标签", "activity_level", "operational_data_quality", "低活跃"),
  "finder:full_history_pending": meta(
    "finder:full_history_pending",
    "全历史待补齐",
    "数据状态",
    "data_status",
    "operational_data_quality",
    "全历史待补齐"
  ),
  "finder:model_history_pending": meta(
    "finder:model_history_pending",
    "模型历史待积累",
    "数据状态",
    "data_status",
    "operational_data_quality",
    "模型历史待积累"
  ),
  "finder:chain_evidence_pending": meta(
    "finder:chain_evidence_pending",
    "链上证据不足",
    "数据状态",
    "data_status",
    "operational_data_quality",
    "链上证据不足"
  ),

  // 外部校准快照（HUSKY_EXTERNAL_LABEL_SPECS 独有 key）
  cashout_closer: meta(
    "cashout_closer",
    "提前止盈",
    "外部画像",
    "husky_profile",
    "external_calibration_snapshot",
    "提前止盈"
  ),
  derisk_manager: meta(
    "derisk_manager",
    "风控减仓",
    "外部画像",
    "husky_profile",
    "external_calibration_snapshot",
    "风控减仓"
  ),
  globetrotter: meta(
    "globetrotter",
    "跨城市交易",
    "外部画像",
    "husky_profile",
    "external_calibration_snapshot",
    "跨城市交易"
  ),
  sample_small: meta(
    "sample_small",
    "样本不足",
    "数据状态",
    "data_status",
    "external_calibration_snapshot",
    "样本不足"
  )
};

export const getFinderLabelMeta = (key?: string): FinderLabelMeta | undefined => {
  const normalized = (key ?? "").trim().toLowerCase();
  if (!normalized) {
    return undefined;
  }
  return (
    FINDER_LABEL_CATALOG[normalized] ??
    FINDER_LABEL_CATALOG[normalized.replace(/^(?:finder|husky):/u, "")] ??
    undefined
  );
};

/** 兜底：未编目 key 不丢标签，按来源归到通用组，保留原文作值。 */
export const fallbackFinderLabelMeta = (
  key: string,
  group: FinderLabelGroup = "portrait_style"
): FinderLabelMeta => ({
  key,
  reportTitle: "Finder 标签",
  name: group === "external_calibration_snapshot" ? "外部画像" : "Finder 标签",
  kind: group === "external_calibration_snapshot" ? "husky_profile" : "portrait_style",
  group,
  fallbackValue: key
});

/** 标签种类 → Polymarket 徽章色调（不含手动/活跃/质量类特例，特例在调用方处理）。 */
export const LABEL_KIND_TONE: Partial<Record<WalletLabelKind, AddressLabelBadge["tone"]>> = {
  frequency_region: "core",
  payout_region: "core",
  winrate_region: "core",
  trader_archetype: "core",
  geo_specialty: "core",
  style: "portrait",
  portrait_style: "portrait",
  husky_profile: "external",
  data_status: "ai-review"
};

export const getLabelKindTone = (kind?: WalletLabelKind): AddressLabelBadge["tone"] =>
  (kind ? LABEL_KIND_TONE[kind] : undefined) ?? "neutral";

/** 展示层需要弱化/隐藏的状态类标签（不进主展示标签）。 */
export const HIDDEN_LABEL_KINDS = new Set<WalletLabelKind>([
  "activity_level",
  "signal_quality",
  "market_scope",
  "confidence",
  "data_status"
]);
