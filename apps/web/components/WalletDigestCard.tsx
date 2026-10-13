"use client";

import { useState } from "react";
import type { WalletAdminRow } from "@weather-smart-money/core";

import styles from "./WalletsConsole.module.css";

const usd = (value?: number) =>
  value === undefined
    ? "--"
    : `${value < 0 ? "-" : value > 0 ? "+" : ""}$${Math.abs(value).toLocaleString("en-US", {
        maximumFractionDigits: value >= 1000 ? 0 : 2
      })}`;

const pct = (value?: number) => (value === undefined ? "--" : `${(value * 100).toFixed(1)}%`);
const int = (value?: number) => (value === undefined ? "--" : value.toLocaleString("en-US"));

// 地址库行内悬浮卡：直接把判断一个地址值不值得跟的关键数字亮出来，
// 不用点进检查器再往下翻。刻意只保留 4 个核心数字 + 主城市 + 画像标签。
export function WalletDigestCard({
  row,
  onOpenInspector,
  onOpenDetail
}: {
  row: WalletAdminRow;
  onOpenInspector: (walletId: string) => void;
  onOpenDetail: (walletId: string) => void;
}) {
  const [pinned, setPinned] = useState(false);
  const digest = row.finderDigest;

  // 只有 3 个标签进悬浮卡，多了就没法一眼扫完。
  // 系统标签的 name 是分组名（画像/风格、数据状态），value 才是真标签。
  // 悬浮卡只放画像/信号两类真标签，数据状态、活跃状态这类运营噪音不进卡片。
  const PORTAIT_GROUPS = new Set(["画像/风格", "信号质量", "Weather专精"]);
  const portrait = row.labels
    .filter((label) => label.source !== "user" && PORTAIT_GROUPS.has(label.name))
    .slice(0, 3);

  return (
    <div
      className={styles.digestCard}
      data-pinned={pinned ? "true" : "false"}
      onMouseEnter={() => !pinned && setPinned(true)}
      onMouseLeave={() => pinned && setPinned(false)}
      onClick={(event) => event.stopPropagation()}
    >
      <div className={styles.digestHead}>
        <div>
          <strong className={styles.digestName}>
            {row.wallet.alias ?? row.wallet.displayName}
          </strong>
          <span className={styles.identityMono}>{row.wallet.address.slice(0, 10)}…</span>
        </div>
        {row.wallet.watchlisted ? <span className={styles.panelTag}>Watchlist</span> : null}
      </div>

      {digest ? (
        <>
          <div className={styles.digestStats}>
            <div className={styles.digestStat}>
              <span>总盈亏</span>
              <strong data-tone={digest.totalPnlUsd === undefined ? "flat" : digest.totalPnlUsd >= 0 ? "up" : "down"}>
                {usd(digest.totalPnlUsd)}
              </strong>
            </div>
            <div className={styles.digestStat}>
              <span>胜率</span>
              <strong>{pct(digest.winRate)}</strong>
            </div>
            <div className={styles.digestStat}>
              <span>成交量</span>
              <strong>{usd(digest.volumeUsd).replace("+", "")}</strong>
            </div>
            <div className={styles.digestStat}>
              <span>交易笔数</span>
              <strong>{int(digest.trades)}</strong>
            </div>
          </div>

          <div className={styles.digestFacts}>
            {digest.topCity ? (
              <span>
                主城市 <strong>{digest.topCity}</strong>
              </span>
            ) : null}
            {digest.weatherShare !== undefined ? (
              <span>
                天气占比 <strong>{pct(digest.weatherShare)}</strong>
              </span>
            ) : null}
            {digest.resolvedPositions !== undefined ? (
              <span>
                已结算 <strong>{int(digest.resolvedPositions)}</strong>
              </span>
            ) : null}
            {digest.roi !== undefined ? (
              <span>
                ROI <strong>{pct(digest.roi)}</strong>
              </span>
            ) : null}
            {digest.bestMultiple ? (
              <span>
                单仓最高 <strong>{digest.bestMultiple.toFixed(1)}x</strong>
              </span>
            ) : null}
          </div>
        </>
      ) : (
        <div className={styles.digestFacts}>
          <span>暂无 Finder 画像</span>
        </div>
      )}

      {portrait.length > 0 ? (
        <div className={styles.digestTags}>
          {portrait.map((label) => (
            <span key={label.id} className={styles.inlineTag}>
              {label.value || label.name}
            </span>
          ))}
        </div>
      ) : null}

      {row.summaryText ? <p className={styles.digestSummary}>{row.summaryText}</p> : null}

      <div className={styles.digestActions}>
        <button
          type="button"
          className={styles.iconButton}
          onClick={(event) => {
            event.stopPropagation();
            onOpenInspector(row.wallet.id);
          }}
        >
          检查
        </button>
        <button
          type="button"
          className={styles.iconButton}
          onClick={(event) => {
            event.stopPropagation();
            onOpenDetail(row.wallet.id);
          }}
        >
          完整详情
        </button>
      </div>
    </div>
  );
}