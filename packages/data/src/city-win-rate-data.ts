import {
  MIN_CITY_WIN_RATE_SAMPLE,
  canonicalCityName,
  cityFromMarketSlug,
  isNonCityBucket,
  normalizeCityKey,
  resolveCityDayWinRate,
  resolveCityWinRate
} from "@weather-smart-money/core";

import type { D1Database } from "@cloudflare/workers-types";

import { getCityWalletBreakdown, searchCities } from "./repository.js";

/**
 * 扩展端「按市场城市亮出真实战绩」的数据层。
 *
 * 口径全部来自 Finder 的 `weather_profile_v2.cities`：胜率按**已结算仓位**
 * （won / resolved），这是唯一可信的城市胜率；逐日胜率（win_days / days）是
 * 次要口径，且只有产出该字段的 run 才有。
 *
 * 样本门槛：已结算仓位 < MIN_CITY_WIN_RATE_SAMPLE 时不给百分比，只给样本数。
 * 2/2 的 100% 显示成绿色胜率会误导人，所以宁可不给。
 */

const num = (value: unknown): number => {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const str = (value: unknown): string | undefined => {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
};

export interface CityWalletRow {
  walletId: string;
  normalizedAddress: string;
  displayName?: string;
  alias?: string;
  watchlisted: boolean;
  /** 仓位口径胜率；样本不足时 undefined。 */
  winRate?: number;
  rawWinRate?: number;
  winRateConfidence: "trusted" | "insufficient" | "unknown";
  resolvedCount?: number;
  wonCount?: number;
  pnlUsd: number;
  volumeUsd: number;
  roi: number;
  dayWinRate?: number;
  dayWinRateConfidence: "trusted" | "insufficient" | "unknown";
  tradeDays?: number;
  bestDay?: { date: string; pnlUsd?: number };
  worstDay?: { date: string; pnlUsd?: number };
  aiBriefShort?: string;
  portraitLabels: string[];
  snapshotAsOf?: string;
}

export interface CityWinRatePayload {
  city: string;
  /** slug 解析出的原始字符串，便于扩展端排查解析问题。 */
  parsedFrom?: string;
  walletCount: number;
  /** 城市整体战绩：所有被标注地址在该城市的合计。 */
  total: {
    resolvedPositions: number;
    wonPositions: number;
    pnlUsd: number;
    volumeUsd: number;
    winRate?: number;
    winRateConfidence: "trusted" | "insufficient" | "unknown";
  };
  wallets: CityWalletRow[];
  minSample: number;
  refreshedAt: string;
  sourceStatus: "live";
}

const parseDayExtreme = (
  value: unknown
): { date: string; pnlUsd?: number } | undefined => {
  if (typeof value !== "string" || !value.trim()) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    const date = str(parsed.date);
    return date ? { date, pnlUsd: num(parsed.pnl_usd) } : undefined;
  } catch {
    return undefined;
  }
};

const parsePortraitLabels = (value: unknown): string[] => {
  if (typeof value !== "string" || !value.trim()) {
    return [];
  }
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .map((item) =>
        typeof item === "string"
          ? item
          : item && typeof item === "object"
            ? str((item as Record<string, unknown>).name)
            : undefined
      )
      .filter((name): name is string => Boolean(name))
      .slice(0, 6);
  } catch {
    return [];
  }
};

/**
 * 从市场 slug 解析城市，再查该城市下所有被标注地址的真实战绩。
 *
 * slug 解析不出城市时返回 null（而不是猜一个），让调用方决定是回退到模糊搜索
 * 还是静默不展示——显示错误城市的战绩比不显示更糟。
 */
export const getCityWinRatePayload = async (
  db: D1Database,
  input: { slug?: string | null; city?: string | null }
): Promise<CityWinRatePayload | null> => {
  const parsedFrom = input.slug?.trim() ? cityFromMarketSlug(input.slug) : "";
  const requested = input.city?.trim() ? canonicalCityName(input.city) : "";
  const resolvedCity = requested || parsedFrom || "";

  if (!resolvedCity || isNonCityBucket(resolvedCity)) {
    return null;
  }

  const rows = await getCityWalletBreakdown(db, resolvedCity);
  if (rows.length === 0) {
    return null;
  }

  // 同一钱包可能同时有多种城市写法（`NYC` 与 `New York City` 是同一个钱包的
  // 两条 cities 记录），所以必须先按 wallet_id 合并再算胜率，否则会把一个钱包
  // 算成两行、并让「钱包数」虚高。合并时仓位/PnL/成交量求和，胜率用合计口径重算
  // （won/resolved），不取两行的平均值。
  const byWallet = new Map<string, Record<string, unknown>>();
  for (const row of rows) {
    const id = String(row.wallet_id ?? "");
    const existing = byWallet.get(id);
    if (!existing) {
      byWallet.set(id, { ...row });
      continue;
    }
    existing.resolved_positions =
      num(existing.resolved_positions) + num(row.resolved_positions);
    existing.won_positions = num(existing.won_positions) + num(row.won_positions);
    existing.positions = num(existing.positions) + num(row.positions);
    existing.pnl_usd = num(existing.pnl_usd) + num(row.pnl_usd);
    existing.volume_usd = num(existing.volume_usd) + num(row.volume_usd);
    const mergedResolved = num(existing.resolved_positions);
    existing.win_rate = mergedResolved > 0 ? num(existing.won_positions) / mergedResolved : 0;
    existing.roi =
      num(existing.volume_usd) > 0 ? num(existing.pnl_usd) / num(existing.volume_usd) : num(existing.roi);
    if (!str(existing.ai_brief_short) && str(row.ai_brief_short)) {
      existing.ai_brief_short = row.ai_brief_short;
    }
    if (!str(existing.portrait_labels_json) && str(row.portrait_labels_json)) {
      existing.portrait_labels_json = row.portrait_labels_json;
    }
  }

  let resolvedPositions = 0;
  let wonPositions = 0;
  let pnlUsd = 0;
  let volumeUsd = 0;

  const wallets: CityWalletRow[] = [...byWallet.values()]
    .sort(
      (a, b) =>
        num(b.resolved_positions) - num(a.resolved_positions) || num(b.pnl_usd) - num(a.pnl_usd)
    )
    .map((row) => {
    const rowResolved = num(row.resolved_positions);
    const rowWon = num(row.won_positions);
    const rowPnl = num(row.pnl_usd);
    const rowVolume = num(row.volume_usd);

    resolvedPositions += rowResolved;
    wonPositions += rowWon;
    pnlUsd += rowPnl;
    volumeUsd += rowVolume;

    const winView = resolveCityWinRate({
      winRate: num(row.win_rate) || undefined,
      resolvedCount: rowResolved,
      wonCount: rowWon
    });
    const dayView = resolveCityDayWinRate({
      dayWinRate: num(row.day_win_rate) || undefined,
      tradeDays: num(row.trade_days) || undefined,
      winDays: num(row.win_days) || undefined
    });

    return {
      walletId: String(row.wallet_id ?? ""),
      normalizedAddress: String(row.normalized_address ?? ""),
      displayName: str(row.display_name),
      alias: str(row.alias),
      watchlisted: num(row.watchlisted) === 1,
      winRate: winView.winRate,
      rawWinRate: winView.rawWinRate,
      winRateConfidence: winView.confidence,
      resolvedCount: winView.resolvedCount,
      wonCount: num(row.won_positions) || undefined,
      pnlUsd: rowPnl,
      volumeUsd: rowVolume,
      roi: num(row.roi),
      dayWinRate: dayView.winRate,
      dayWinRateConfidence: dayView.confidence,
      tradeDays: num(row.trade_days) || undefined,
      bestDay: parseDayExtreme(row.best_day),
      worstDay: parseDayExtreme(row.worst_day),
      aiBriefShort: str(row.ai_brief_short),
      portraitLabels: parsePortraitLabels(row.portrait_labels_json),
      snapshotAsOf: str(row.snapshot_as_of)
    };
  });

  const totalWinView = resolveCityWinRate({
    winRate: resolvedPositions > 0 ? wonPositions / resolvedPositions : undefined,
    resolvedCount: resolvedPositions
  });

  return {
    city: resolvedCity,
    parsedFrom: parsedFrom && parsedFrom !== resolvedCity ? parsedFrom : undefined,
    walletCount: wallets.length,
    total: {
      resolvedPositions,
      wonPositions,
      pnlUsd,
      volumeUsd,
      winRate: totalWinView.winRate,
      winRateConfidence: totalWinView.confidence
    },
    wallets,
    minSample: MIN_CITY_WIN_RATE_SAMPLE,
    refreshedAt: new Date().toISOString(),
    sourceStatus: "live"
  };
};

/**
 * 城市模糊匹配：扩展端解析 slug 失败时的兜底。
 * 返回规范名列表，由扩展端提示用户或直接取第一个。
 */
export const findCitySuggestions = async (db: D1Database, term: string, limit = 6) => {
  const key = normalizeCityKey(canonicalCityName(term));
  const probe = key || term.trim();
  if (!probe) {
    return [];
  }

  const rows = await searchCities(db, probe, limit);
  return rows
    .map((row) => ({
      city: canonicalCityName(str(row.city)),
      wallets: num(row.wallets)
    }))
    .filter((item) => item.city && !isNonCityBucket(item.city));
};
