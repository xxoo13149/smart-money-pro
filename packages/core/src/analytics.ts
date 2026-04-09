import { markets, trades } from "./mock-data.js";
import type {
  DashboardSummary,
  Market,
  SectorMarketDigest,
  Trade,
  Wallet,
  WalletMetrics
} from "./types.js";

const DEFAULT_TRADE_WINDOW = 30;

const minutesBetween = (start: string, end: string) =>
  Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000);

const round = (value: number, digits = 2) => Number(value.toFixed(digits));

export const getWalletTrades = (walletId: string, allTrades: Trade[] = trades) =>
  allTrades
    .filter((trade) => trade.walletId === walletId && trade.sector === "weather")
    .sort(
      (left, right) =>
        new Date(right.enteredAt).getTime() - new Date(left.enteredAt).getTime()
    );

export const computeWalletMetrics = (
  wallet: Wallet,
  allTrades: Trade[] = trades,
  tradeWindow = DEFAULT_TRADE_WINDOW
): WalletMetrics => {
  const walletTrades = getWalletTrades(wallet.id, allTrades).slice(0, tradeWindow);
  const settled = walletTrades.filter((trade) => trade.outcome !== "pending");
  const wins = settled.filter((trade) => trade.outcome === "win");
  const realizedPnl = walletTrades.reduce((sum, trade) => sum + trade.realizedPnlUsd, 0);
  const avgLeadMinutes =
    walletTrades.length === 0
      ? 0
      : walletTrades.reduce(
          (sum, trade) => sum + minutesBetween(trade.enteredAt, trade.marketPeakAt),
          0
        ) / walletTrades.length;
  const avgRiskReward =
    settled.length === 0
      ? 0
      : settled.reduce((sum, trade) => sum + trade.realizedPnlUsd / trade.sizeUsd, 0) /
        settled.length;
  const allWalletTrades = allTrades.filter((trade) => trade.walletId === wallet.id);
  const weatherShare = allWalletTrades.length === 0 ? 1 : walletTrades.length / allWalletTrades.length;
  const stableCurveScore =
    settled.length === 0
      ? 0
      : Math.max(
          0,
          Math.min(
            100,
            72 +
              wins.length * 4 -
              settled.filter((trade) => trade.realizedPnlUsd < 0).length * 6 +
              avgRiskReward * 50
          )
        );

  return {
    walletId: wallet.id,
    tradeWindow,
    weatherWinRate:
      settled.length === 0 ? 0 : round((wins.length / settled.length) * 100, 1),
    averageEntryLeadMinutes: round(avgLeadMinutes, 0),
    avgRiskReward: round(avgRiskReward, 2),
    totalRealizedPnlUsd: round(realizedPnl, 0),
    weatherTradeShare: round(weatherShare * 100, 1),
    stableCurveScore: round(stableCurveScore, 0),
    last30Trades: walletTrades
  };
};

export const computeDashboardSummary = (
  wallets: Wallet[],
  openAlertCount: number
): DashboardSummary => {
  const winRates = wallets.map((wallet) => computeWalletMetrics(wallet).weatherWinRate);
  return {
    activeWeatherMarkets: markets.filter((market) => market.status === "open").length,
    trackedWallets: wallets.length,
    openAlerts: openAlertCount,
    watchlistedWallets: wallets.filter((wallet) => wallet.watchlisted).length,
    averageWeatherWinRate:
      winRates.length === 0
        ? 0
        : round(winRates.reduce((sum, winRate) => sum + winRate, 0) / winRates.length, 1)
  };
};

export const computeMarketDigests = (
  trackedWallets: Wallet[],
  allMarkets: Market[] = markets,
  allTrades: Trade[] = trades
): SectorMarketDigest[] =>
  allMarkets
    .filter((market) => market.sector === "weather")
    .map((market) => {
      const marketTrades = allTrades.filter((trade) => trade.marketId === market.id);
      const notableWallets = trackedWallets
        .filter((wallet) => marketTrades.some((trade) => trade.walletId === wallet.id))
        .slice(0, 3)
        .map((wallet) => wallet.alias ?? wallet.displayName);

      return {
        marketId: market.id,
        title: market.title,
        location: market.location,
        status: market.status,
        notableWallets,
        netTrackedFlowUsd: marketTrades.reduce((sum, trade) => sum + trade.sizeUsd, 0)
      };
    })
    .sort((left, right) => right.netTrackedFlowUsd - left.netTrackedFlowUsd);
