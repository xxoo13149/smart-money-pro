"use client";

import { useEffect, useState } from "react";
import { notFound } from "next/navigation";

import { Section } from "../../../components/Section";
import { WalletEditForm } from "../../../components/WalletEditForm";
import { WalletQuickActions } from "../../../components/WalletQuickActions";
import { WalletDeleteButton } from "../../../components/WalletDeleteButton";
import type { WalletDetailData } from "../../../lib/data";
import {
  STRATEGY_METRIC_META,
  STRATEGY_METRIC_PRIORITY,
  translatePatternName
} from "../../../lib/profile-terms";
import styles from "./wallet-detail.module.css";

const formatDate = (value: string | undefined) => {
  if (!value) {
    return "--";
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("zh-CN");
};

const usd = (value?: number | null) =>
  value === undefined || value === null
    ? "--"
    : `${value < 0 ? "-" : value > 0 ? "+" : ""}$${Math.abs(value).toLocaleString("en-US", {
        maximumFractionDigits: Math.abs(value) >= 1000 ? 0 : 2
      })}`;

const pct = (value?: number | null) =>
  value === undefined || value === null ? "--" : `${(value * 100).toFixed(1)}%`;

const fmtNum = (value?: number | null, digits = 0) =>
  value === undefined || value === null
    ? "--"
    : value.toLocaleString("en-US", { maximumFractionDigits: digits });

type MetricMap = Map<string, number | string | boolean | null>;

const buildMetricMap = (data: WalletDetailData | null): MetricMap => {
  const map: MetricMap = new Map();
  for (const metric of data?.finderProfile?.metrics ?? []) {
    map.set(metric.key, metric.value);
  }
  return map;
};

export default function WalletDetailPage() {
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<WalletDetailData | null>(null);
  const [status, setStatus] = useState<"loading" | "missing" | "error">("loading");

  useEffect(() => {
    let active = true;
    const id = window.location.pathname.split("/").filter(Boolean).pop() ?? "";
    fetch(`/api/wallets/${id}`)
      .then(async (response) => {
        const payload = (await response.json().catch(() => ({}))) as {
          data?: WalletDetailData;
          error?: string;
        };
        if (response.status === 401) {
          window.location.replace(`/auth/login?next=${encodeURIComponent(`/wallets/${id}`)}`);
          return;
        }
        if (response.status === 404) {
          if (active) setStatus("missing");
          return;
        }
        if (!response.ok || !payload.data) {
          throw new Error(payload.error || `HTTP ${response.status}`);
        }
        if (active) {
          setData(payload.data);
          setStatus("loading");
        }
      })
      .catch((cause: unknown) => {
        if (active) {
          setStatus("error");
          setError(cause instanceof Error ? cause.message : "钱包详情加载失败");
        }
      });
    return () => {
      active = false;
    };
  }, []);

  if (status === "missing") {
    notFound();
  }

  if (status === "error") {
    return <div className="empty-state">钱包详情加载失败：{error}</div>;
  }

  if (!data) {
    return (
      <div className="stack-list">
        <div className="eyebrow">正在加载钱包详情…</div>
      </div>
    );
  }

  const { wallet, labels, watchlistEntry, finderAi, finderProfile } = data;
  const metrics = buildMetricMap(data);
  const num = (key: string): number | undefined => {
    const value = metrics.get(key);
    return typeof value === "number" && Number.isFinite(value) ? value : undefined;
  };
  const str = (key: string): string | undefined => {
    const value = metrics.get(key);
    return typeof value === "string" && value.trim() ? value.trim() : undefined;
  };

  // ── KPI 条：一眼看清这个地址的赚钱能力（对标 huskyweather 顶部统计）──
  const pnl = num("total_pnl_usd");
  const winRate = num("position_win_rate") ?? num("closed_position_win_rate");
  const kpis = [
    { label: "总盈亏", value: usd(pnl), tone: pnl === undefined ? "flat" : pnl >= 0 ? "up" : "down" },
    { label: "胜率", value: pct(winRate), tone: "flat" },
    { label: "成交量", value: usd(num("volume_usd")).replace("+", ""), tone: "flat" },
    { label: "交易笔数", value: fmtNum(num("trades")), tone: "flat" },
    { label: "已结算仓位", value: fmtNum(num("resolved_positions")), tone: "flat" },
    { label: "天气成交占比", value: pct(num("weather_notional_ratio")), tone: "flat" },
    { label: "单仓平均", value: usd(num("avg_stake_usd")).replace("+", ""), tone: "flat" },
    // 0 值代表画像没有真实爆发数据，不当有效值展示
    { label: "最高爆发", value: num("highest_burst") ? usd(num("highest_burst")) : "--", tone: "up" }
  ].filter((kpi) => kpi.value !== "--");

  // ── 风格份额条：这个钱包「怎么交易」──
  type StrategyEntry = { key: string; label: string; text?: string; ratio?: number };
  const strategyEntries: StrategyEntry[] = [];
  for (const key of STRATEGY_METRIC_PRIORITY) {
    const value = finderProfile?.strategyMetrics[key];
    if (typeof value !== "number" || !Number.isFinite(value)) {
      continue;
    }
    const meta = STRATEGY_METRIC_META[key];
    // 份额类为 0 表示该行为完全没出现，不占版面；均值/数量类 0 有意义
    if (meta?.percent && value === 0) {
      continue;
    }
    strategyEntries.push({
      key,
      label: meta?.label ?? key,
      // 均价类不是份额，单独走文本
      text: meta?.percent
        ? undefined
        : meta?.count
          ? value.toLocaleString("en-US", { maximumFractionDigits: 0 })
          : value.toFixed(meta?.digits ?? 1),
      ratio: meta?.percent ? value : undefined
    });
  }

  // ── 画像：风格标签做卡片，运营状态（对账不足等）压成一行提示 ──
  const styleLabels = (finderProfile?.portraitLabels ?? []).filter(
    (label) => label.group !== "operational"
  );
  const operationalLabels = (finderProfile?.portraitLabels ?? []).filter(
    (label) => label.group === "operational"
  );

  // ── 城市明细：按盈亏降序，最赚在最上面 ──
  // 全 0 城市（既没成交也没盈亏）不占版面
  const cityRows = [...(finderProfile?.cities ?? [])]
    .filter((city) => (city.volumeUsd ?? 0) !== 0 || (city.positionCount ?? 0) !== 0)
    .sort((a, b) => (b.pnlUsd ?? 0) - (a.pnlUsd ?? 0));
  const maxAbsCityPnl = Math.max(
    1,
    ...cityRows.map((city) => Math.abs(city.pnlUsd ?? 0))
  );

  // ── 模式盈亏：赚的在前、亏的在后（对标 huskyweather 的 Patterns that work/lose）──
  const patternRows = [...(finderProfile?.patterns ?? [])].sort(
    (a, b) => (b.pnlUsd ?? 0) - (a.pnlUsd ?? 0)
  );
  const winPatterns = patternRows.filter((item) => (item.pnlUsd ?? 0) > 0);
  const losePatterns = patternRows
    .filter((item) => (item.pnlUsd ?? 0) < 0)
    .reverse();

  return (
    <>
      <section className={styles.hero}>
        <div className={styles.heroMain}>
          <div className={styles.heroTitleRow}>
            <h1>{wallet.alias ?? wallet.displayName}</h1>
            <span className={styles.heroAddr}>{wallet.address}</span>
          </div>
          {wallet.strategyFocus || wallet.bio ? (
            <p className={styles.heroBio}>{wallet.strategyFocus || wallet.bio}</p>
          ) : null}
          <div className={styles.heroChips}>
            {watchlistEntry ? <span className={styles.chipWatch}>Watchlist</span> : null}
            {wallet.deletedAt ? <span className={styles.chipDanger}>已删除</span> : null}
            <span className={styles.chip}>
              {finderProfile?.snapshotAsOf
                ? `画像快照 ${formatDate(finderProfile.snapshotAsOf)}`
                : finderProfile
                  ? "已同步画像"
                  : "暂无画像"}
            </span>
            {str("dominant_region") ? (
              <span className={styles.chip}>主城市 {str("dominant_region")}</span>
            ) : null}
            {finderAi?.aiBriefShort ? <span className={styles.chip}>{finderAi.aiBriefShort}</span> : null}
          </div>
        </div>
        {kpis.length > 0 ? (
          <div className={styles.kpiRow}>
            {kpis.map((kpi) => (
              <div key={kpi.label} className={styles.kpi} data-tone={kpi.tone}>
                <span>{kpi.label}</span>
                <strong>{kpi.value}</strong>
              </div>
            ))}
          </div>
        ) : null}
      </section>

      {finderProfile?.portraitLabels.length ? (
        <section className={styles.block}>
          <h2 className={styles.blockTitle}>交易画像</h2>
          <div className={styles.portraitGrid}>
            {styleLabels.map((label, index) => (
              <div
                key={`${label.code}-${index}`}
                className={styles.portraitCard}
                title={label.description || undefined}
              >
                <strong>{label.name}</strong>
                {typeof label.share === "number" ? (
                  <>
                    <div className={styles.shareBar}>
                      <span
                        style={{
                          width: `${Math.min(100, Math.max(2, (label.share <= 1 ? label.share : label.share / 100) * 100))}%`
                        }}
                      />
                    </div>
                    <span className={styles.shareText}>
                      {(label.share <= 1 ? label.share * 100 : label.share).toFixed(0)}%
                    </span>
                  </>
                ) : null}
              </div>
            ))}
          </div>
          {operationalLabels.length > 0 ? (
            <p className={styles.operationalNote}>
              数据提示：{operationalLabels.map((label) => label.name).join("、")}
            </p>
          ) : null}
        </section>
      ) : null}

      {strategyEntries.length > 0 ? (
        <section className={styles.block}>
          <h2 className={styles.blockTitle}>怎么交易</h2>
          <div className={styles.shareList}>
            {strategyEntries.map((entry) => (
              <div key={entry.key} className={styles.shareItem} data-kind={entry.ratio === undefined ? "scalar" : "ratio"}>
                <span className={styles.shareLabel}>{entry.label}</span>
                {/* 标量类也占住中间轨道位置，保证数值列统一右对齐 */}
                <div className={styles.shareTrack} aria-hidden={entry.ratio === undefined}>
                  {entry.ratio !== undefined ? (
                    <span
                      style={{
                        width: `${Math.min(100, Math.max(1.5, entry.ratio * 100))}%`
                      }}
                    />
                  ) : null}
                </div>
                <span className={styles.shareText}>{entry.ratio !== undefined ? pct(entry.ratio) : entry.text}</span>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {cityRows.length > 0 ? (
        <section className={styles.block}>
          <h2 className={styles.blockTitle}>城市战绩</h2>
          <div className={styles.cityTableWrap}>
            <table className={styles.cityTable}>
              <thead>
                <tr>
                  <th>城市</th>
                  <th>盈亏</th>
                  <th>胜率</th>
                  <th>仓位</th>
                  <th>已结算</th>
                  <th>ROI</th>
                  <th>成交量</th>
                </tr>
              </thead>
              <tbody>
                {cityRows.map((city, index) => {
                  const cityPnl = city.pnlUsd ?? 0;
                  // 有仓位但既没成交也没结算：显示「暂无战绩」，不要铺一排 $0 / 0.0%
                  const dormant =
                    (city.volumeUsd ?? 0) === 0 && (city.resolvedCount ?? 0) === 0;
                  if (dormant) {
                    return (
                      <tr key={`${city.city}-${index}`} className={styles.cityDormant}>
                        <td className={styles.cityName}>
                          <span>{city.city}</span>
                        </td>
                        <td colSpan={6} className={styles.cityDormantNote}>
                          暂无战绩 · {fmtNum(city.positionCount)} 个未结算仓位
                        </td>
                      </tr>
                    );
                  }
                  return (
                    <tr key={`${city.city}-${index}`}>
                      <td className={styles.cityName}>
                        <span>{city.city}</span>
                        <span
                          className={styles.pnlBar}
                          data-tone={cityPnl >= 0 ? "up" : "down"}
                          style={{
                            width: `${Math.max(2, (Math.abs(cityPnl) / maxAbsCityPnl) * 100)}%`
                          }}
                        />
                      </td>
                      <td className={cityPnl >= 0 ? styles.pnlUp : styles.pnlDown}>
                        {usd(city.pnlUsd)}
                      </td>
                      <td>{pct(city.winRate)}</td>
                      <td>{fmtNum(city.positionCount)}</td>
                      <td>{fmtNum(city.resolvedCount)}</td>
                      <td>{pct(city.roi)}</td>
                      <td>{usd(city.volumeUsd).replace("+", "")}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {winPatterns.length > 0 || losePatterns.length > 0 ? (
        <section className={styles.block}>
          <h2 className={styles.blockTitle}>赚钱 / 亏钱的模式</h2>
          <div className={styles.patternCols}>
            {winPatterns.length > 0 ? (
              <div className={styles.patternCol}>
                <h3 className={styles.patternColTitle}>赚钱</h3>
                {winPatterns.map((item, index) => (
                  <div key={`w-${item.key ?? index}`} className={styles.patternRow}>
                    <div className={styles.patternName}>
                      {translatePatternName(item.name || item.key || "--")}
                    </div>
                    <div className={styles.patternMeta}>
                      {fmtNum(item.resolvedCount)} 已结算 · 胜率 {pct(item.winRate)}
                    </div>
                    <div className={`${styles.patternPnl} ${styles.pnlUp}`}>{usd(item.pnlUsd)}</div>
                  </div>
                ))}
              </div>
            ) : null}
            <div className={styles.patternCol}>
              <h3 className={styles.patternColTitle}>亏钱</h3>
              {losePatterns.length > 0 ? (
                losePatterns.map((item, index) => (
                  <div key={`l-${item.key ?? index}`} className={styles.patternRow}>
                    <div className={styles.patternName}>
                      {translatePatternName(item.name || item.key || "--")}
                    </div>
                    <div className={styles.patternMeta}>
                      {fmtNum(item.resolvedCount)} 已结算 · 胜率 {pct(item.winRate)}
                    </div>
                    <div className={`${styles.patternPnl} ${styles.pnlDown}`}>
                      {usd(item.pnlUsd)}
                    </div>
                  </div>
                ))
              ) : (
                <div className={styles.patternEmpty}>
                  画像里所有行为模式累计盈亏都是正数，暂时没有亏损模式。
                </div>
              )}
            </div>
          </div>
        </section>
      ) : null}

      {finderAi && (finderAi.aiDeepNote || finderAi.aiBriefNote) ? (
        <section className={styles.block}>
          <h2 className={styles.blockTitle}>AI 解读</h2>
          <div className={styles.aiNote}>
            {finderAi.aiDeepNote || finderAi.aiBriefNote}
          </div>
        </section>
      ) : null}

      <section className={styles.block}>
        <h2 className={styles.blockTitle}>资料与标签</h2>
        <div className={styles.metaGrid}>
          <div className={styles.metaCard}>
            <h3 className={styles.metaCardTitle}>基础资料</h3>
            <div className={styles.metaKv}>
              <span>首次发现</span>
              <strong>{formatDate(wallet.firstSeenAt)}</strong>
            </div>
            <div className={styles.metaKv}>
              <span>最近更新</span>
              <strong>{formatDate(wallet.updatedAt)}</strong>
            </div>
            <div className={styles.metaKv}>
              <span>删除状态</span>
              <strong>{wallet.deletedAt ? formatDate(wallet.deletedAt) : "正常"}</strong>
            </div>
            {/* 资料编辑默认收起：详情页的视觉重心是画像，不是维护表单 */}
            <details className={styles.metaFold}>
              <summary>编辑资料（展示名 / 摘要 / 背景 / 备注）</summary>
              <div className={styles.metaFoldBody}>
                <WalletEditForm wallet={wallet} />
              </div>
            </details>
          </div>
          <div className={styles.metaCard}>
            <h3 className={styles.metaCardTitle}>自定义标签</h3>
            <div className={styles.labelCluster}>
              {labels.length > 0 ? (
                labels.map((label) => (
                  <span key={label.id} className={styles.labelBadge}>
                    {label.value || label.name}
                  </span>
                ))
              ) : (
                <span className={styles.metaSoft}>暂无标签</span>
              )}
            </div>
            <WalletQuickActions walletId={wallet.id} sections={["tags", "watchlist"]} />
          </div>
        </div>
      </section>

      <section className={styles.block}>
        <div className={styles.dangerRow}>
          <WalletDeleteButton walletId={wallet.id} disabled={Boolean(wallet.deletedAt)} />
        </div>
      </section>
    </>
  );
}