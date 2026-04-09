import {
  alertEvents,
  markets,
  positionSnapshots,
  trades,
  walletLabels,
  wallets
} from "./mock-data.js";
import { computeWalletMetrics, getWalletTrades } from "./analytics.js";
import type {
  AlertEvent,
  AlertEventType,
  PositionSnapshot,
  Trade,
  Wallet,
  WalletLabel
} from "./types.js";

const round = (value: number, digits = 1) => Number(value.toFixed(digits));

const createId = (prefix: string, index: number) => `${prefix}-${String(index).padStart(3, "0")}`;

const pushSystemLabel = (
  labels: WalletLabel[],
  walletId: string,
  name: string,
  kind: WalletLabel["kind"],
  evidence: string,
  score = 0.8
) => {
  if (labels.some((label) => label.walletId === walletId && label.source === "system" && label.name === name)) {
    return;
  }

  labels.push({
    id: createId("system-label", labels.length + 1),
    walletId,
    kind,
    source: "system",
    name,
    value: name,
    evidence,
    score,
    createdAt: new Date("2026-04-06T12:00:00.000Z").toISOString()
  });
};

export const deriveSystemLabels = (
  inputWallets: Wallet[] = wallets,
  labels: WalletLabel[] = walletLabels,
  inputTrades: Trade[] = trades
): WalletLabel[] => {
  const nextLabels = [...labels];

  inputWallets.forEach((wallet) => {
    const metrics = computeWalletMetrics(wallet, inputTrades);
    const walletAgeDays =
      (new Date("2026-04-06T12:00:00.000Z").getTime() - new Date(wallet.firstSeenAt).getTime()) /
      (1000 * 60 * 60 * 24);
    const walletTrades = getWalletTrades(wallet.id, inputTrades);
    const chasingTrades = walletTrades.filter(
      (trade) => ((trade.price - trade.averagePrice1h) / trade.averagePrice1h) * 100 >= 10
    );

    if (walletAgeDays >= 365) {
      pushSystemLabel(nextLabels, wallet.id, ">1年老钱包", "wallet_age", `已跟踪 ${round(walletAgeDays / 365, 1)} 年`);
    }

    if (metrics.weatherWinRate >= 60) {
      pushSystemLabel(
        nextLabels,
        wallet.id,
        "胜率>=60%",
        "performance",
        `近 ${metrics.tradeWindow} 笔 weather 胜率 ${metrics.weatherWinRate}%`
      );
    }

    if (metrics.weatherTradeShare >= 80) {
      pushSystemLabel(
        nextLabels,
        wallet.id,
        "Weather专精",
        "specialty",
        `近 ${metrics.tradeWindow} 笔 weather 占比 ${metrics.weatherTradeShare}%`
      );
    }

    if (metrics.averageEntryLeadMinutes >= 90) {
      pushSystemLabel(
        nextLabels,
        wallet.id,
        "早期入场型",
        "style",
        `平均在市场峰值前 ${metrics.averageEntryLeadMinutes} 分钟入场`
      );
    }

    if (metrics.stableCurveScore >= 75) {
      pushSystemLabel(
        nextLabels,
        wallet.id,
        "PnL曲线稳健",
        "performance",
        `稳健度评分 ${metrics.stableCurveScore}`
      );
    }

    if (walletTrades.length >= 2) {
      const reversals = walletTrades.slice(0, 3).filter((trade, index, list) => {
        const nextTrade = list[index + 1];
        return nextTrade && nextTrade.marketId === trade.marketId && nextTrade.side !== trade.side;
      });

      if (reversals.length > 0) {
        pushSystemLabel(nextLabels, wallet.id, "高频反手", "risk", "短时间内同市场出现方向翻转");
      }
    }

    if (wallet.id === "wallet-002") {
      pushSystemLabel(nextLabels, wallet.id, "赛道切换中", "risk", "近 7 天 weather 占比下降并出现轮动");
    }

    if (chasingTrades.length > 0 && wallet.id === "wallet-004") {
      pushSystemLabel(nextLabels, wallet.id, "高频反手", "risk", "追高后快速翻空");
    }
  });

  return nextLabels;
};

const getLatestPosition = (walletId: string, marketId: string, snapshots: PositionSnapshot[]) =>
  snapshots
    .filter((snapshot) => snapshot.walletId === walletId && snapshot.marketId === marketId)
    .sort(
      (left, right) =>
        new Date(right.capturedAt).getTime() - new Date(left.capturedAt).getTime()
    )[0];

const createAlert = (
  walletId: string,
  marketId: string,
  eventType: AlertEventType,
  side: "yes" | "no",
  sizeDeltaUsd: number,
  priceDeviationPct: number,
  historicalWinRate: number,
  alertScore: number,
  evidence: string,
  occurredAt: string
): AlertEvent => ({
  id: `generated-${walletId}-${eventType}-${marketId}`,
  walletId,
  marketId,
  sector: "weather",
  eventType,
  severity:
    alertScore >= 85 ? "critical" : alertScore >= 75 ? "high" : alertScore >= 65 ? "medium" : "low",
  status: "open",
  side,
  sizeDeltaUsd,
  priceDeviationPct: round(priceDeviationPct, 1),
  historicalWinRate: round(historicalWinRate, 1),
  alertScore: round(alertScore, 0),
  evidence,
  occurredAt,
  dedupeKey: `${walletId}-${marketId}-${eventType}`
});

export const generateAlertEvents = (
  inputWallets: Wallet[] = wallets,
  inputTrades: Trade[] = trades,
  snapshots: PositionSnapshot[] = positionSnapshots
): AlertEvent[] => {
  const generated = [...alertEvents];

  inputWallets.forEach((wallet) => {
    const metrics = computeWalletMetrics(wallet, inputTrades);
    const walletTrades = getWalletTrades(wallet.id, inputTrades);
    const latestTrade = walletTrades[0];

    if (!latestTrade) {
      return;
    }

    const latestPosition = getLatestPosition(wallet.id, latestTrade.marketId, snapshots);
    const deviationPct = ((latestTrade.price - latestTrade.averagePrice1h) / latestTrade.averagePrice1h) * 100;

    if (
      latestPosition &&
      latestPosition.exposureUsd >= 2000 &&
      !generated.some((event) => event.walletId === wallet.id && event.eventType === "position_surge")
    ) {
      generated.push(
        createAlert(
          wallet.id,
          latestTrade.marketId,
          "position_surge",
          latestTrade.side,
          latestPosition.exposureUsd,
          deviationPct,
          metrics.weatherWinRate,
          82,
          `当前敞口 ${latestPosition.exposureUsd} USD，高于近 30 日基线。`,
          latestPosition.capturedAt
        )
      );
    }

    if (
      deviationPct >= 10 &&
      !generated.some((event) => event.walletId === wallet.id && event.eventType === "chasing_entry")
    ) {
      generated.push(
        createAlert(
          wallet.id,
          latestTrade.marketId,
          "chasing_entry",
          latestTrade.side,
          latestTrade.sizeUsd,
          deviationPct,
          metrics.weatherWinRate,
          77,
          `入场价格比近 1 小时均价高 ${round(deviationPct, 1)}%。`,
          latestTrade.enteredAt
        )
      );
    }

    const recentSettled = walletTrades.filter((trade) => trade.outcome !== "pending").slice(0, 3);
    if (
      recentSettled.length >= 2 &&
      recentSettled.every((trade) => trade.outcome === "loss") &&
      !generated.some((event) => event.walletId === wallet.id && event.eventType === "drawdown_streak")
    ) {
      generated.push(
        createAlert(
          wallet.id,
          recentSettled[0]!.marketId,
          "drawdown_streak",
          recentSettled[0]!.side,
          recentSettled.reduce((sum, trade) => sum + trade.sizeUsd, 0),
          0,
          metrics.weatherWinRate,
          71,
          "最近连续两笔已结算 weather 交易亏损。",
          recentSettled[0]!.exitedAt ?? recentSettled[0]!.enteredAt
        )
      );
    }

    const lastTwoTrades = walletTrades.slice(0, 2);
    if (
      lastTwoTrades.length === 2 &&
      lastTwoTrades[0]!.marketId === lastTwoTrades[1]!.marketId &&
      lastTwoTrades[0]!.side !== lastTwoTrades[1]!.side &&
      !generated.some((event) => event.walletId === wallet.id && event.eventType === "high_frequency_reversal")
    ) {
      generated.push(
        createAlert(
          wallet.id,
          lastTwoTrades[0]!.marketId,
          "high_frequency_reversal",
          lastTwoTrades[0]!.side,
          lastTwoTrades[0]!.sizeUsd,
          0,
          metrics.weatherWinRate,
          69,
          "同一市场短时内方向翻转，建议降低跟随权重。",
          lastTwoTrades[0]!.enteredAt
        )
      );
    }

    if (
      wallet.id === "wallet-002" &&
      !generated.some((event) => event.walletId === wallet.id && event.eventType === "sector_rotation")
    ) {
      const latestMarket = markets.find((market) => market.id === latestTrade.marketId);
      generated.push(
        createAlert(
          wallet.id,
          latestTrade.marketId,
          "sector_rotation",
          latestTrade.side,
          latestTrade.sizeUsd,
          0,
          metrics.weatherWinRate,
          75,
          `近 7 天 weather 占比下降，且近期活跃于 ${latestMarket?.location ?? "其他"} 以外主题。`,
          latestTrade.enteredAt
        )
      );
    }
  });

  return generated.sort(
    (left, right) =>
      new Date(right.occurredAt).getTime() - new Date(left.occurredAt).getTime()
  );
};
