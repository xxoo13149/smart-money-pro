"use client";

import type { WalletDetailData } from "../lib/data";
import { translatePatternName } from "../lib/profile-terms";

import styles from "./WalletsConsole.module.css";

const usd = (value?: number) =>
  value === undefined
    ? "--"
    : `${value < 0 ? "-" : value > 0 ? "+" : ""}$${Math.abs(value).toLocaleString("en-US", {
        maximumFractionDigits: value >= 1000 ? 0 : 2
      })}`;

const pct = (value?: number) => (value === undefined ? "--" : `${(value * 100).toFixed(1)}%`);

const metricMap = (detail: WalletDetailData | null) => {
  const map = new Map<string, number | string | boolean | null>();
  for (const metric of detail?.finderProfile?.metrics ?? []) {
    map.set(metric.key, metric.value);
  }
  return map;
};

// 检查器里的「画像速览」：只回答三个问题——
// 这个地址赚了多少钱、胜率如何、最擅长哪个城市。
// 完整画像（城市明细 / 行为模式 / AI 长文）留在详情页，这里不重复。
export function WalletInspectorDigest({
  walletId,
  detail,
  onOpenDetail
}: {
  walletId: string;
  detail: WalletDetailData | null;
  onOpenDetail: () => void;
}) {
  const profile = detail?.wallet.id === walletId ? detail.finderProfile : undefined;
  const metrics = metricMap(detail?.wallet.id === walletId ? detail : null);

  const num = (key: string): number | undefined => {
    const value = metrics.get(key);
    return typeof value === "number" && Number.isFinite(value) ? value : undefined;
  };
  const str = (key: string): string | undefined => {
    const value = metrics.get(key);
    return typeof value === "string" && value.trim() ? value.trim() : undefined;
  };

  if (!profile) {
    return (
      <div className={styles.metaCard}>
        <div className={styles.identitySubtle}>
          还没有 Finder 画像。下一次 Finder 同步带回画像后，这里会直接显示盈亏、胜率和主城市。
        </div>
        <div className={styles.editActions}>
          <button type="button" className={styles.ghostButton} onClick={onOpenDetail}>
            打开完整详情页
          </button>
        </div>
      </div>
    );
  }

  const pnl = num("total_pnl_usd");
  const winRate = num("position_win_rate") ?? num("closed_position_win_rate");
  const topCity = str("dominant_region");

  // 盈利 / 亏损模式各取前几个，这是「跟不跟」最直接的判断依据。
  const patterns = [...profile.patterns].sort((a, b) => (b.pnlUsd ?? 0) - (a.pnlUsd ?? 0));
  const winners = patterns.filter((item) => (item.pnlUsd ?? 0) > 0).slice(0, 3);
  const losers = patterns.filter((item) => (item.pnlUsd ?? 0) < 0).slice(-3).reverse();

  const bestCity = [...profile.cities].sort((a, b) => (b.pnlUsd ?? 0) - (a.pnlUsd ?? 0))[0];
  const worstCity = [...profile.cities].sort((a, b) => (a.pnlUsd ?? 0) - (b.pnlUsd ?? 0))[0];

  return (
    <div className={styles.digestPanel}>
      <div className={styles.digestStats}>
        <div className={styles.digestStat}>
          <span>总盈亏</span>
          <strong data-tone={pnl === undefined ? "flat" : pnl >= 0 ? "up" : "down"}>{usd(pnl)}</strong>
        </div>
        <div className={styles.digestStat}>
          <span>胜率</span>
          <strong>{pct(winRate)}</strong>
        </div>
        <div className={styles.digestStat}>
          <span>成交量</span>
          <strong>{usd(num("volume_usd")).replace("+", "")}</strong>
        </div>
        <div className={styles.digestStat}>
          <span>主城市</span>
          <strong>{topCity ?? "--"}</strong>
        </div>
      </div>

      {profile.portraitLabels.length > 0 ? (
        <div className={styles.digestTags}>
          {profile.portraitLabels.slice(0, 6).map((label, index) => (
            <span
              key={`${label.code}-${index}`}
              className={styles.inlineTag}
              title={label.description || undefined}
            >
              {label.name}
              {typeof label.share === "number"
                ? ` ${(label.share <= 1 ? label.share * 100 : label.share).toFixed(0)}%`
                : ""}
            </span>
          ))}
        </div>
      ) : null}

      {bestCity || worstCity ? (
        <div className={styles.metaCard}>
          <div className={styles.subtleHeader}>
            <strong>城市两端</strong>
            <span>共 {profile.cities.length} 个城市</span>
          </div>
          {bestCity ? (
            <div className={styles.metaRow}>
              <span>最赚</span>
              <strong>
                {bestCity.city} {usd(bestCity.pnlUsd)}
              </strong>
            </div>
          ) : null}
          {worstCity ? (
            <div className={styles.metaRow}>
              <span>最亏</span>
              <strong>
                {worstCity.city} {usd(worstCity.pnlUsd)}
              </strong>
            </div>
          ) : null}
        </div>
      ) : null}

      {winners.length > 0 || losers.length > 0 ? (
        <div className={styles.metaCard}>
          <div className={styles.subtleHeader}>
            <strong>模式盈亏</strong>
            <span>共 {profile.patterns.length} 条</span>
          </div>
          {winners.map((item, index) => (
            <div key={`w-${item.key ?? index}`} className={styles.metaRow}>
              <span>赚</span>
              <strong>
                {translatePatternName(item.name || item.key || "--")} {usd(item.pnlUsd)}
              </strong>
            </div>
          ))}
          {losers.map((item, index) => (
            <div key={`l-${item.key ?? index}`} className={styles.metaRow}>
              <span>亏</span>
              <strong>
                {translatePatternName(item.name || item.key || "--")} {usd(item.pnlUsd)}
              </strong>
            </div>
          ))}
        </div>
      ) : null}

      <div className={styles.editActions}>
        <button type="button" className={styles.primaryButton} onClick={onOpenDetail}>
          打开完整详情页
        </button>
      </div>
    </div>
  );
}