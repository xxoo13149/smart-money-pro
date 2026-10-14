/**
 * 城市层级胜率的最小样本门槛。
 *
 * 背景：Finder 按**已结算仓位**算城市胜率（`won_positions / resolved_positions`），
 * 这是唯一可信的「真实胜率」口径。但一个地址在某个城市可能只 settled 过 2 个仓位，
 * 那种 2/2 的 100% 没有任何统计意义，直接展示会误导人——尤其在扩展端上，一个
 * 绿色的 100% 会让人以为这个人在这座城市战绩极好。
 *
 * 统一门槛：已结算仓位 < MIN_CITY_WIN_RATE_SAMPLE 时不展示百分比，改为展示
 * 「样本不足」。低于门槛的城市仍然展示 PnL / 成交量，因为金额不受样本量影响
 * 太多（一个仓位也真的赚了钱），但**不展示胜率**。
 */

/** 展示城市胜率所需的最小已结算仓位数。 */
export const MIN_CITY_WIN_RATE_SAMPLE = 5;

/** 展示城市逐日胜率所需的最小交易日数。 */
export const MIN_CITY_DAY_WIN_RATE_SAMPLE = 3;

export type CityWinRateConfidence = "trusted" | "insufficient" | "unknown";

export interface CityWinRateView {
  /** 已结算仓位数；undefined 表示 Finder 没给。 */
  resolvedCount?: number;
  /** 胜率（0-1）；门槛不足时强制为 undefined，避免调用方误用。 */
  winRate?: number;
  /** 原始胜率，不做门槛过滤，仅供数据核对与调试。 */
  rawWinRate?: number;
  confidence: CityWinRateConfidence;
}

/**
 * 按最小样本门槛裁决一个城市胜率能否展示。
 *
 * 注意 `winRate` 的清洗：Finder 可能给出 NaN/负数/>1 的脏值（resolved_count=0
 * 时某些 run 会算成 0），这里统一过滤掉——0 值只在原始数据确实是 0 时保留。
 */
export const resolveCityWinRate = (input: {
  winRate?: number;
  resolvedCount?: number;
  wonCount?: number;
}): CityWinRateView => {
  const raw =
    typeof input.winRate === "number" && Number.isFinite(input.winRate) &&
      input.winRate >= 0 && input.winRate <= 1
      ? input.winRate
      : undefined;

  if (raw === undefined) {
    return { confidence: "unknown" };
  }

  const resolved =
    typeof input.resolvedCount === "number" && Number.isFinite(input.resolvedCount)
      ? input.resolvedCount
      : undefined;

  if (resolved === undefined) {
    return { rawWinRate: raw, confidence: "unknown" };
  }

  if (resolved < MIN_CITY_WIN_RATE_SAMPLE) {
    return { resolvedCount: resolved, rawWinRate: raw, confidence: "insufficient" };
  }

  return { resolvedCount: resolved, winRate: raw, rawWinRate: raw, confidence: "trusted" };
};

/**
 * 逐日胜率的可展示判定。老 Finder run 不产出 days，落到 unknown 而不是 0%。
 */
export const resolveCityDayWinRate = (input: {
  dayWinRate?: number;
  tradeDays?: number;
  winDays?: number;
}): CityWinRateView => {
  const raw =
    typeof input.dayWinRate === "number" && Number.isFinite(input.dayWinRate) &&
      input.dayWinRate >= 0 && input.dayWinRate <= 1
      ? input.dayWinRate
      : undefined;

  if (raw === undefined) {
    return { confidence: "unknown" };
  }

  const days =
    typeof input.tradeDays === "number" && Number.isFinite(input.tradeDays)
      ? input.tradeDays
      : undefined;

  if (days === undefined) {
    return { rawWinRate: raw, confidence: "unknown" };
  }

  if (days < MIN_CITY_DAY_WIN_RATE_SAMPLE) {
    return { resolvedCount: days, rawWinRate: raw, confidence: "insufficient" };
  }

  return { resolvedCount: days, winRate: raw, rawWinRate: raw, confidence: "trusted" };
};

/** 城市键归一：扩展端从 Polymarket slug 取到的名字可能大小写/空格不一致。 */
export const normalizeCityKey = (value: string | null | undefined): string => {
  if (!value) {
    return "";
  }
  return value.trim().toLowerCase().replace(/\s+/g, " ");
};

/**
 * Finder 的 `cities` 里混着非城市桶，直接展示会污染城市榜和扩展端查询。
 * 这些是市场类型或地区桶，不是「某座城市的最高温市场」：
 * 实测样本里出现 `climate`(63 结算仓位) / `AQI`(6) / `air`(8) / `USA`(24) / `Tech`(2)。
 */
export const NON_CITY_BUCKETS = new Set([
  "climate",
  "aqi",
  "air",
  "air quality",
  "usa",
  "us",
  "tech",
  "global",
  "world",
  "other",
  "unknown",
  "未知城市",
  "null",
  "none",
  "-"
]);

/**
 * 城市别名归一：同一城市在 Finder 里会以多种写法出现，不归一就会算成两个城市。
 * 实测 `NYC`(6 钱包/65 仓位) 与 `nyc`(2 钱包/7 仓位) 被拆成两组，
 * 合并后是 8 钱包 / 72 仓位——这是真实的口径错误，不是显示问题。
 *
 * key 是归一后的名字，value 是展示用的规范名。收录标准：只收有证据的别名
 * （同一批数据里同时存在多种写法），不做猜测式扩写。
 */
export const CITY_ALIASES = new Map<string, string>([
  ["nyc", "New York City"],
  ["new york city", "New York City"],
  ["new york", "New York City"],
  ["la", "Los Angeles"],
  ["los angeles", "Los Angeles"],
  ["sf", "San Francisco"],
  ["san francisco", "San Francisco"],
  ["wuhan", "Wuhan"],
  ["中国", "China"],
  ["china", "China"],
  ["usa", "United States"],
  ["us", "United States"],
  ["united states", "United States"],
  ["uk", "London"],
  ["united kingdom", "London"],
  ["busan", "Busan"],
  ["seoul", "Seoul"],
  ["tokyo", "Tokyo"],
  ["osaka", "Osaka"],
  ["beijing", "Beijing"],
  ["shanghai", "Shanghai"],
  ["shenzhen", "Shenzhen"],
  ["hong kong", "Hong Kong"],
  ["hongkong", "Hong Kong"],
  ["singapore", "Singapore"],
  ["sydney", "Sydney"],
  ["melbourne", "Melbourne"],
  ["toronto", "Toronto"],
  ["vancouver", "Vancouver"],
  ["mexico city", "Mexico City"],
  ["sao paulo", "Sao Paulo"],
  ["buenos aires", "Buenos Aires"],
  ["amsterdam", "Amsterdam"],
  ["berlin", "Berlin"],
  ["paris", "Paris"],
  ["london", "London"],
  ["istanbul", "Istanbul"],
  ["ankara", "Ankara"],
  ["atlanta", "Atlanta"],
  ["austin", "Austin"],
  ["boston", "Boston"],
  ["chicago", "Chicago"],
  ["dallas", "Dallas"],
  ["denver", "Denver"],
  ["miami", "Miami"],
  ["phoenix", "Phoenix"],
  ["seattle", "Seattle"],
  ["lucknow", "Lucknow"],
  ["delhi", "Delhi"],
  ["mumbai", "Mumbai"],
  ["dubai", "Dubai"],
  ["cairo", "Cairo"],
  ["lagos", "Lagos"],
  ["jakarta", "Jakarta"],
  ["bangkok", "Bangkok"],
  ["manila", "Manila"],
  ["hanoi", "Hanoi"]
]);

/** 该城市名是否应排除（非城市桶或空值）。 */
export const isNonCityBucket = (city: string | null | undefined): boolean => {
  const key = normalizeCityKey(city);
  if (!key) {
    return true;
  }
  return NON_CITY_BUCKETS.has(key);
};

/**
 * 反向展开：给定一个城市名，返回库里所有等价写法的小写 key，用于 SQL `IN` 匹配。
 *
 * 为什么必须这样做：Finder 同一座城市会以多种写法落库（实测 `NYC` 29 钱包/288 仓位
 * 对 `New York City` 4 钱包/13 仓位）。按单一名字精确匹配会漏掉 95% 的数据，
 * 扩展端就会显示一个远小于真实情况的战绩。
 *
 * 结果一定包含入参自身的小写形式，且去重；未知城市就只返回它自己。
 */
export const cityNameVariants = (city: string | null | undefined): string[] => {
  const key = normalizeCityKey(city);
  if (!key) {
    return [];
  }
  const variants = new Set<string>([key]);
  for (const [aliasKey, canonical] of CITY_ALIASES) {
    if (normalizeCityKey(canonical) === key) {
      variants.add(aliasKey);
      // 别名值本身也可能是「空格写法」，补一个连字符写法，
      // 因为 SQL 里比对的是 slug 形态（`hong-kong`）或库内原值。
      variants.add(aliasKey.replace(/\s+/g, "-"));
    }
  }
  return [...variants].filter(Boolean);
};

/**
 * 把任意写法的城市名解析成规范名。未知城市原样返回（trim 后），
 * 这样新城市上线时不会丢数据，只是没有别名归一而已。
 */
export const canonicalCityName = (city: string | null | undefined): string => {
  const trimmed = (city ?? "").trim();
  const key = normalizeCityKey(trimmed);
  if (!key) {
    return "";
  }
  return CITY_ALIASES.get(key) ?? trimmed;
};

/**
 * 扩展端从 Polymarket 市场 URL 解析城市时用这个。
 * Polymarket 的 slug 形如 `highest-temperature-in-london-on-january-5th`，
 * 先剥掉 `...-on-<日期>` 后缀再拿城市部分，最后过别名表。
 *
 * 返回空串表示没解析出来，调用方应回退到模糊搜索而不是猜一个城市。
 */
export const cityFromMarketSlug = (slug: string | null | undefined): string => {
  if (!slug) {
    return "";
  }
  let text = slug.trim().toLowerCase().replace(/_/g, "-");

  // 只处理最高温/温度类市场。扩展端会把所有 Polymarket 市场 URL 喂进来，
  // 非温度市场（选举、体育、加密）解析出的任何字符串都不是城市名，
  // 这里必须直接拒绝，否则回退查询会拿一个假城市名去查库。
  if (!/(highest-)?temperature|temperature-(in|on|be)|weather/.test(text)) {
    return "";
  }

  // Polymarket 的天气 slug 实际形态（实测三种都有）：
  //   highest-temperature-in-london-on-january-5th
  //   will-the-highest-temperature-in-london-be-above-20c-on-january-5th
  //   will-the-highest-temperature-be-above-90f-in-london-today
  // 注意城市段在**中间**（`-in-<city>`），不在开头。所以先剥开头前缀，
  // 再按「下一个断点」切出城市，而不是只从尾部剥。

  text = text
    .replace(/^will-the-highest-temperature-be-/, "")
    .replace(/^will-the-highest-temperature-in-/, "")
    .replace(/^will-the-highest-temperature-/, "")
    .replace(/^highest-temperature-be-/, "")
    .replace(/^highest-temperature-in-/, "")
    .replace(/^highest-temperature-/, "")
    .replace(/^temperature-in-/, "")
    .replace(/^temperature-/, "")
    .replace(/^will-it-be-/, "")
    .replace(/^will-the-temperature-be-/, "");

  // 剥掉日期段（城市后面的一切日期信息先切掉）。
  text = text
    .replace(/-on-\d{4}-\d{2}-\d{2}.*$/, "")
    .replace(
      /-on-(january|february|march|april|may|june|july|august|september|october|november|december).*$/,
      ""
    )
    .replace(/-on-\d{1,2}(st|nd|rd|th)?-.*$/, "")
    .replace(/-(january|february|march|april|may|june|july|august|september|october|november|december)[a-z0-9-]*$/, "")
    .replace(/-\d{4}-\d{2}-\d{2}$/, "")
    .replace(/-(this|next)-(week|month|day).*$/, "")
    .replace(/-(today|tomorrow)$/, "")
    .replace(/-\d{1,2}(st|nd|rd|th)?$/, "");

  // 问句/阈值断点：城市后面接上这些词开始就是「问题」而不是城市名了。
  const BREAKERS = [
    "-be-above",
    "-be-below",
    "-be-over",
    "-be-under",
    "-be-at-least",
    "-be-at-most",
    "-be-higher",
    "-be-lower",
    "-reach",
    "-hit",
    "-exceed",
    "-or-higher",
    "-or-lower",
    "-or-above",
    "-or-below",
    "-and-above",
    "-and-below",
    "-be"
  ];

  const cutAt = (value: string): string => {
    let cut = value.length;
    for (const marker of BREAKERS) {
      const at = value.indexOf(marker);
      if (at > 0 && at < cut) {
        cut = at;
      }
    }
    return value.slice(0, cut);
  };

  // 城市出现在两个位置：`<city>-be-above-90f`（前缀已剥完，剩下城市在前）
  // 或 `above-90f-in-<city>`（阈值在前）。优先认显式的 `-in-` 标记，
  // 认不到再回退到「切掉断点后的开头段」。`-in-` 只在文本里出现一次时才用，
  // 否则 `higher-temperature-in-x` 这类多段 slug 会切错位置。
  let segment = "";
  if (text.indexOf("-in-") === text.lastIndexOf("-in-")) {
    const inAt = text.indexOf("-in-");
    if (inAt >= 0) {
      segment = cutAt(text.slice(inAt + "-in-".length));
    }
  }
  if (!segment) {
    segment = cutAt(text);
  }

  // 单位尾巴（挂在城市后的 90f / 32c）。
  const withoutTrailingDate = segment
    .replace(/-\d+(f|c|fahrenheit|celsius|degrees?|-degrees?)$/, "")
    .replace(/-+$/, "")
    .replace(/^-/, "");
  if (!withoutTrailingDate) {
    return "";
  }
  const key = withoutTrailingDate.replace(/-/g, " ").trim();
  const canonical = CITY_ALIASES.get(key) ?? CITY_ALIASES.get(withoutTrailingDate);
  if (canonical) {
    return canonical;
  }

  // 别名表没收录的城市（例如 `munich`、`kuala lumpur`）：slug 全小写，
  // 直接透传会让扩展端显示成 `munich`。这里做一次保守的标题化——
  // 只改大小写，不改拼写，避免把本来就是小写的专名改错。
  return key.replace(/\b[a-z]/g, (ch) => ch.toUpperCase());
};
