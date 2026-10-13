// Finder 画像里 pattern / strategyMetric 的字段名是英文 slug（例如 side_yes、mgmt_scalp），
// 但 Finder 侧没有提供中文标签。这张表把它们映射成中文，页面只做展示层翻译，
// 不改动上游数据，Finder 之后补上中文名时可以直接删掉对应条目。
//
// 组合 key（形如 fade_hotter+price_mid）会按 `+` 拆开逐段翻译后再拼接。

export const PATTERN_TERM: Record<string, string> = {
  // 方向
  side_yes: "YES 方向",
  side_no: "NO 方向",
  // 价格区间
  price_longshot: "低价冷门",
  price_value: "中价区间",
  price_mid: "中低价位",
  price_favorite: "热门价位",
  // 仓位类型
  bucket_tail: "极端温度档",
  bucket_inner: "中间温度档",
  kind_highest: "最高温档",
  kind_lowest: "最低温档",
  // 时间
  time_d1: "提前一天",
  time_morning: "早盘入场",
  time_midday: "午间入场",
  time_late: "尾盘入场",
  // 处置方式
  mgmt_hold: "持有到结算",
  mgmt_cashout: "提前止盈",
  mgmt_derisk: "获利了结",
  mgmt_scalp: "短线平仓",
  // 与模型关系
  follow_models: "跟随模型",
  fade_hotter: "逆势押热",
  fade_colder: "逆势押冷",
  no_off_consensus: "NO 偏离共识",
  no_on_consensus: "NO 踩共识",
  no_bucket: "NO 押极端档",
  yes_bucket: "YES 押极端档"
};

// 兜底规则：Finder 后续新增 facet slug 时，这里必须同步补词。
// 已知 slug 走词典；未收录的 slug 不能原样丢给用户（会暴露 mgmt_xxx 这类内部 key），
// 只保留可读部分并标注「未分类」，Finder 补中文名后删掉这条分支即可。
const humanizeUnknownSlug = (part: string): string => {
  if (/^[\u4e00-\u9fa5]/.test(part)) {
    // 已经是中文，原样用
    return part;
  }
  const readable = part
    .split("_")
    .filter(Boolean)
    .map((word) => {
      const upper = word.toUpperCase();
      // 方向/价格/时间等有通用含义的词
      if (upper === "YES" || upper === "NO") return upper;
      if (upper === "D1") return "提前一天";
      if (upper === "MID") return "中";
      if (upper === "LOW") return "低";
      if (upper === "HIGH" || upper === "HIGHEST") return "高";
      if (upper === "LOWEST") return "最低";
      if (upper === "TAIL") return "极端";
      if (upper === "INNER") return "中间";
      return null;
    })
    .filter(Boolean)
    .join("");
  return readable || "未分类行为";
};

export const translatePatternName = (raw: string): string => {
  const parts = raw
    .split("+")
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length === 0) {
    return raw;
  }
  const translated = parts.map((part) => PATTERN_TERM[part] ?? humanizeUnknownSlug(part));
  return translated.join(" + ");
};

export const STRATEGY_METRIC_META: Record<
  string,
  // digits: 非份额类指标的展示小数位；count: 整数计数（不显示小数点）
  { label: string; hint?: string; percent?: boolean; digits?: number; count?: boolean }
> = {
  top_city: { label: "主交易城市" },
  top_city_share: { label: "主城市集中度", percent: true },
  cities: { label: "覆盖城市数", count: true },
  no_share: { label: "NO 仓占比", percent: true },
  no_off_consensus: { label: "NO 偏离共识", percent: true },
  no_on_consensus: { label: "NO 踩共识", percent: true },
  hotter_share: { label: "逆势押热占比", percent: true },
  colder_share: { label: "逆势押冷占比", percent: true },
  follow_share: { label: "跟随模型占比", percent: true },
  favorite_share: { label: "热门价位占比", percent: true },
  longshot_share: { label: "低价冷门占比", percent: true },
  scalp_share: { label: "短线平仓占比", percent: true },
  cashout_share: { label: "提前止盈占比", percent: true },
  hold_share: { label: "持有结算占比", percent: true },
  derisk_share: { label: "获利了结占比", percent: true },
  d1_share: { label: "提前一天占比", percent: true },
  intraday_share: { label: "日内入场占比", percent: true },
  tail_share: { label: "极端档仓位占比", percent: true },
  lowest_share: { label: "最低温档占比", percent: true },
  avg_entry_price: { label: "平均入场价", digits: 2 },
  model_yes_classified_positions: { label: "模型 YES 仓位数", count: true },
  model_relation_complete_positions: { label: "可判定模型关系仓位", count: true },
  wins_to_expiry_positions: { label: "持有到期获胜仓位", count: true }
};

// 只展示这几个：它们是判断一个钱包「靠什么赚钱」最直接的证据，
// 剩下的（例如各类一致性计数）属于数据质量指标，放在概览里不占视觉重心。
export const STRATEGY_METRIC_PRIORITY: string[] = [
  "top_city",
  "top_city_share",
  "cities",
  "no_share",
  "hotter_share",
  "colder_share",
  "follow_share",
  "favorite_share",
  "longshot_share",
  "scalp_share",
  "cashout_share",
  "hold_share",
  "d1_share",
  "intraday_share",
  "avg_entry_price"
];