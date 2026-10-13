"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import type {
  DashboardLibraryDigest,
  DashboardLabelFacet,
  DashboardRankRow
} from "@weather-smart-money/core";

import styles from "./dashboard.module.css";

type RankKey = "topByPnl" | "topByWinRate" | "topByVolume" | "topLosers";

const RANK_TABS: Array<{ key: RankKey; label: string; hint: string }> = [
  { key: "topByPnl", label: "盈利榜", hint: "总盈亏最高" },
  { key: "topByWinRate", label: "胜率榜", hint: "已结算 ≥5 仓" },
  { key: "topByVolume", label: "成交榜", hint: "成交量最大" },
  { key: "topLosers", label: "亏损榜", hint: "亏得最多，避雷" }
];

const LABEL_KIND_LABELS: Record<string, string> = {
  portrait_style: "画像风格",
  finder_portrait: "Finder 画像",
  signal_quality: "信号质量",
  trader_archetype: "交易者类型",
  early_entry_signal: "提前布局信号",
  activity_level: "活跃度",
  frequency_region: "高频城市",
  payout_region: "盈亏城市",
  husky_profile: "Husky 画像",
  winrate_region: "胜率城市",
  其他: "其他"
};

const labelKindLabel = (kind: string) => LABEL_KIND_LABELS[kind] ?? kind;

const usd = (value: number) => {
  const abs = Math.abs(value);
  if (abs >= 1000) return `${value < 0 ? "-" : "+"}$${(abs / 1000).toFixed(1)}k`;
  return `${value < 0 ? "-" : "+"}$${abs.toFixed(abs >= 100 ? 0 : 1)}`;
};

const plainUsd = (value: number) => {
  const abs = Math.abs(value);
  if (abs >= 1000) return `$${(abs / 1000).toFixed(1)}k`;
  return `$${abs.toFixed(abs >= 100 ? 0 : 2)}`;
};

const pct = (value: number) => `${(value * 100).toFixed(1)}%`;

const compact = (value: number) =>
  value >= 10000 ? `${(value / 1000).toFixed(1)}k` : value.toLocaleString("en-US");

const ago = (iso: string) => {
  const time = Date.parse(iso);
  if (Number.isNaN(time)) return iso;
  const minutes = Math.round((Date.now() - time) / 60000);
  if (minutes < 60) return `${Math.max(minutes, 1)} 分钟前`;
  if (minutes < 1440) return `${Math.round(minutes / 60)} 小时前`;
  if (minutes < 10080) return `${Math.round(minutes / 1440)} 天前`;
  return new Date(time).toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit" });
};

const shortRun = (name: string | null) => {
  if (!name) return "未知来源";
  const trimmed = name.replace(/^Finder-app:/i, "").replace(/^Finder-Husky:\s*/i, "Husky·");
  return trimmed.length > 28 ? `${trimmed.slice(0, 28)}…` : trimmed;
};

function Kpi({
  label,
  value,
  sub,
  tone
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "up" | "down";
}) {
  return (
    <article className={styles.kpi}>
      <span className={styles.kpiLabel}>{label}</span>
      <strong
        className={`${styles.kpiValue} ${
          tone === "up" ? styles.up : tone === "down" ? styles.down : ""
        }`}
      >
        {value}
      </strong>
      {sub ? <span className={styles.kpiSub}>{sub}</span> : null}
    </article>
  );
}

function LabelFacetPanel({ facet }: { facet: DashboardLabelFacet }) {
  const max = Math.max(1, ...facet.items.map((item) => item.count));
  return (
    <div className={styles.facetBlock}>
      <div className={styles.facetHead}>
        <h4>{labelKindLabel(facet.kind)}</h4>
        <span>{facet.total} 次</span>
      </div>
      <div className={styles.tagCloud}>
        {facet.items.map((item) => (
          <Link
            key={item.value}
            href={`/wallets?label=${encodeURIComponent(item.value)}`}
            className={styles.tag}
            title={`${item.value} · ${item.count} 个地址 · 占 ${pct(item.share)}`}
          >
            {/* 填充条按整组最高频归一化，而不是按 pill 自身宽度 ——
                否则标签名越长条越长，同样数量的标签条长却不同。 */}
            <span className={styles.tagTrack} aria-hidden="true">
              <span
                className={styles.tagFill}
                style={{ width: `${Math.max(6, (item.count / max) * 100)}%` }}
              />
            </span>
            <span className={styles.tagName} title={item.value}>
              {item.value}
            </span>
            <span className={styles.tagCount}>{item.count}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}

function RankRow({ row, rank }: { row: DashboardRankRow; rank: number }) {
  return (
    <Link href={`/wallets/${row.walletId}`} className={styles.rankRow}>
      <span className={styles.rankBadge}>{rank}</span>
      <div className={styles.rankMain}>
        <div className={styles.rankName}>
          {row.alias || row.displayName || `${row.normalizedAddress.slice(0, 10)}…`}
          {row.watchlisted ? <span className={styles.watchBadge}>Watch</span> : null}
          {row.topCity && row.topCity.toLowerCase() !== "climate" ? (
            <span className={styles.cityBadge}>{row.topCity}</span>
          ) : null}
        </div>
        {row.aiBriefShort ? <p className={styles.rankBrief}>{row.aiBriefShort}</p> : null}
        {row.labels.length > 0 ? (
          <div className={styles.rankLabels}>
            {row.labels.map((label) => (
              <span key={label} className={styles.miniTag}>
                {label}
              </span>
            ))}
          </div>
        ) : null}
      </div>
      <div className={styles.rankStats}>
        <span>
          盈亏{" "}
          <strong className={row.pnlUsd >= 0 ? styles.up : styles.down}>{usd(row.pnlUsd)}</strong>
        </span>
        <span>
          胜率 <strong>{pct(row.winRate)}</strong>
        </span>
        <span>
          成交 <strong>{plainUsd(row.volumeUsd)}</strong>
        </span>
        <span>
          交易 <strong>{row.trades}</strong>
        </span>
      </div>
    </Link>
  );
}

export default function HomePage() {
  const [data, setData] = useState<DashboardLibraryDigest | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rankKey, setRankKey] = useState<RankKey>("topByPnl");

  useEffect(() => {
    let active = true;
    fetch("/api/dashboard")
      .then(async (response) => {
        const payload = (await response.json().catch(() => ({}))) as {
          data?: DashboardLibraryDigest;
          error?: string;
        };
        if (response.status === 401) {
          window.location.replace("/auth/login?next=%2F");
          return;
        }
        if (!response.ok || !payload.data) {
          throw new Error(payload.error || `HTTP ${response.status}`);
        }
        if (active) setData(payload.data);
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : "仪表盘加载失败");
      });
    return () => {
      active = false;
    };
  }, []);

  const cityMax = useMemo(
    () => Math.max(1, ...(data?.cityStats ?? []).map((city) => city.wallets)),
    [data]
  );

  if (error) return <div className="empty-state">仪表盘加载失败：{error}</div>;
  if (!data) {
    return (
      <div className="stack-list">
        <div className="eyebrow">正在加载地址库总览…</div>
      </div>
    );
  }

  const { totals, metrics, labelFacets, cityStats } = data;
  const rows = data[rankKey];
  const winLossRatio =
    metrics.profitableWallets + metrics.losingWallets > 0
      ? metrics.profitableWallets / (metrics.profitableWallets + metrics.losingWallets)
      : 0;
  const portraitFacet =
    labelFacets.find((facet) => facet.kind === "finder_portrait") ??
    labelFacets.find((facet) => facet.kind === "portrait_style");
  const otherFacets = labelFacets.filter((facet) => facet !== portraitFacet);

  if (totals.wallets === 0) {
    return (
      <>
        <section className={styles.hero}>
          <div>
            <h1>地址库总览</h1>
            <p>地址库还是空的，先去导入或同步 Finder 数据。</p>
          </div>
          <Link href="/imports" className="primary-button small-button">
            去导入中心
          </Link>
        </section>
        <section className={styles.emptyPanel}>
          <p className={styles.emptyTitle}>没有任何活跃地址</p>
          <p className={styles.emptyText}>
            从 Finder 同步一批 run，或手动录入地址后，这里会自动汇总盈亏、胜率、城市热度和画像标签分布。
          </p>
          <div className={styles.emptyActions}>
            <Link href="/imports" className="primary-button small-button">
              导入数据
            </Link>
            <Link href="/wallets" className="ghost-button small-button">
              打开地址库
            </Link>
          </div>
        </section>
      </>
    );
  }

  return (
    <>
      <section className={styles.hero}>
        <div>
          <h1>地址库总览</h1>
          <p>
            {compact(totals.wallets)} 个地址 ·{" "}
            {metrics.profiledWallets} 份画像 · {metrics.insightWallets} 条 AI 解读
            {data.snapshotAsOf ? ` · 数据截至 ${data.snapshotAsOf}` : ""}
          </p>
        </div>
        <Link href="/wallets" className="primary-button small-button">
          管理地址库
        </Link>
      </section>

      <section className={styles.kpiGrid}>
        <Kpi
          label="追踪总盈亏"
          value={usd(metrics.totalPnlUsd)}
          tone={metrics.totalPnlUsd >= 0 ? "up" : "down"}
          sub={`${metrics.profitableWallets} 盈 / ${metrics.losingWallets} 亏`}
        />
        <Kpi
          label="加权胜率"
          value={pct(metrics.weightedWinRate)}
          sub={`按 ${compact(metrics.totalResolvedPositions)} 个已结算仓位加权`}
        />
        <Kpi label="总成交量" value={plainUsd(metrics.totalVolumeUsd)} sub={`${compact(metrics.totalTrades)} 笔交易`} />
        <Kpi
          label="盈利钱包占比"
          value={pct(winLossRatio)}
          sub={`画像覆盖 ${metrics.profiledWallets}/${totals.wallets}`}
        />
        <Kpi label="最佳单笔倍数" value={`${metrics.bestMultiple.toFixed(1)}x`} sub={`最高爆发 ${plainUsd(metrics.peakBurstUsd)}`} />
        <Kpi
          label="本周新增"
          value={`+${totals.weekNewWallets}`}
          sub={`标签 ${totals.labelValues} 种 / ${totals.labelAssignments} 次`}
        />
      </section>

      <section className={styles.panel}>
        <header className={styles.panelHead}>
          <h2>标签分布</h2>
          <span className={styles.panelNote}>
            条长 = 相对数量 · 点击标签直接筛地址库
          </span>
        </header>
        {portraitFacet ? (
          <LabelFacetPanel facet={portraitFacet} />
        ) : (
          <p className={styles.emptyText}>暂无画像风格标签，等待 Finder 同步。</p>
        )}
        {otherFacets.length > 0 ? (
          <div className={styles.facetGrid}>
            {otherFacets.map((facet) => (
              <LabelFacetPanel key={facet.kind} facet={facet} />
            ))}
          </div>
        ) : null}
      </section>

      <section className={styles.columns}>
        <article className={styles.panel}>
          <header className={styles.panelHead}>
            <h2>城市战绩</h2>
            <span className={styles.panelNote}>按主交易城市聚合</span>
          </header>
          {cityStats.length > 0 ? (
            <div className={styles.cityList}>
              {cityStats.map((city) => (
                <div key={city.city} className={styles.cityRow}>
                  <span className={styles.cityName}>{city.city}</span>
                  <div className={styles.cityTrack}>
                    <div
                      className={styles.cityFill}
                      style={{ width: `${(city.wallets / cityMax) * 100}%` }}
                    />
                  </div>
                  <span className={styles.cityMeta}>
                    {city.wallets} 个 · 胜率 {pct(city.avgWinRate)} ·{" "}
                    <strong className={city.totalPnlUsd >= 0 ? styles.up : styles.down}>
                      {usd(city.totalPnlUsd)}
                    </strong>
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className={styles.emptyText}>暂无城市数据。</p>
          )}
        </article>

        <article className={styles.panel}>
          <header className={styles.panelHead}>
            <h2>最近导入</h2>
            <Link href="/imports">导入中心</Link>
          </header>
          {data.recentBatches.length > 0 ? (
            <div className={styles.batchList}>
              {data.recentBatches.map((batch, index) => (
                <div key={`${batch.createdAt}-${index}`} className={styles.batchRow}>
                  <span className={styles.batchTime}>{ago(batch.createdAt)}</span>
                  <span className={styles.batchName} title={batch.sourceName ?? ""}>
                    {shortRun(batch.sourceName)}
                  </span>
                  <span className={styles.batchMeta}>
                    {batch.batchCount > 1 ? `${batch.batchCount} 批 · ` : ""}
                    {batch.rowCount} 行 · +{batch.createdCount} 新 / ~{batch.updatedCount} 更
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className={styles.emptyText}>暂无导入记录。</p>
          )}
        </article>
      </section>

      <section className={styles.panel}>
        <header className={styles.panelHead}>
          <h2>地址排行</h2>
          <div className={styles.tabs}>
            {RANK_TABS.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setRankKey(tab.key)}
                className={`${styles.tab} ${rankKey === tab.key ? styles.tabActive : ""}`}
                title={tab.hint}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </header>
        {rows.length > 0 ? (
          <div className={styles.rankList}>
            {rows.map((row, index) => (
              <RankRow key={`${rankKey}-${row.walletId}`} row={row} rank={index + 1} />
            ))}
          </div>
        ) : (
          <p className={styles.emptyText}>该榜单暂无数据。</p>
        )}
      </section>

      {data.watchlist.length > 0 ? (
        <section className={styles.panel}>
          <header className={styles.panelHead}>
            <h2>重点盯防</h2>
            <Link href="/wallets?status=watchlist">查看全部</Link>
          </header>
          <div className={styles.rankList}>
            {data.watchlist.map((row, index) => (
              <RankRow key={`watch-${row.walletId}`} row={row} rank={index + 1} />
            ))}
          </div>
        </section>
      ) : null}
    </>
  );
}
