import Link from "next/link";
import type { WalletImportBatch, WalletSourceType } from "@weather-smart-money/core";

import type { WalletImportsPageData, WalletImportBatchSummary } from "../lib/data";
import { AppLink } from "./AppLink";
import { WalletImportPanel, type WalletImportSourceMode } from "./WalletImportPanel";
import styles from "./ImportsConsole.module.css";

export type ImportsConsoleView = "overview" | "finder" | "batch";

const SOURCE_LABELS: Record<WalletSourceType, string> = {
  manual: "手动",
  finder: "Finder",
  ai: "AI",
  file: "文件",
  system: "系统"
};

const formatDate = (value?: string | null) => {
  if (!value) {
    return "--";
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString("zh-CN", { hour12: false });
};

const shortId = (value: string) => value.slice(0, 8);

const getBatchTitle = (batch: WalletImportBatch) =>
  batch.sourceName || `${SOURCE_LABELS[batch.sourceType]} 导入 ${shortId(batch.id)}`;

const getBatchHref = (batchId: string) => `/imports/batches/${batchId}`;

const getModeHref = (mode: WalletImportSourceMode) =>
  mode === "finder" ? "/imports/finder" : `/imports?source=${mode}`;

const getWalletBatchHref = (batchId: string, walletId?: string) => {
  if (!batchId) {
    return walletId ? `/wallets/${walletId}` : "/wallets";
  }

  const params = new URLSearchParams({ batch: batchId });
  if (walletId) {
    params.set("selected", walletId);
    params.set("panel", "inspect");
  }
  return `/wallets?${params.toString()}`;
};

const getPageCopy = (view: ImportsConsoleView, selectedBatch: WalletImportBatchSummary | null) => {
  if (view === "finder") {
    return {
      kicker: "Finder Integration",
      title: "Finder 对接中心",
      description:
        "从本地 Finder 读取筛选好的候选地址，先走 AI 结构化预览，再确认写入 Smart Pro 地址库。",
      primaryHref: "/imports",
      primaryLabel: "导入中心",
      secondaryHref: "/wallets?source=finder",
      secondaryLabel: "查看 Finder 地址"
    };
  }

  if (view === "batch") {
    return {
      kicker: "Import Batch",
      title: selectedBatch ? getBatchTitle(selectedBatch.batch) : "导入批次页",
      description:
        "查看单个导入批次的时间、来源、成功行、新增地址、命中地址库和失败行。",
      primaryHref: "/imports",
      primaryLabel: "返回导入中心",
      secondaryHref: selectedBatch ? getWalletBatchHref(selectedBatch.batch.id) : "/wallets",
      secondaryLabel: "打开本批地址"
    };
  }

  return {
    kicker: "Import Operations",
    title: "导入中心",
    description: "统一管理 Finder 候选、AI 结构化预览、地址入库和批次备份结果。",
    primaryHref: "/imports/finder",
    primaryLabel: "Finder 对接中心",
    secondaryHref: "/wallets",
    secondaryLabel: "打开地址库"
  };
};

const buildBatchStats = (summary: WalletImportBatchSummary | null) => [
  {
    label: "原始行",
    value: summary?.batch.rowCount ?? 0,
    tone: "finder",
    href: summary ? getBatchHref(summary.batch.id) : "/imports/finder"
  },
  {
    label: "导入成功",
    value: summary?.successCount ?? 0,
    tone: "ai",
    href: summary ? getBatchHref(summary.batch.id) : "/imports"
  },
  {
    label: "新增地址",
    value: summary?.batch.createdCount ?? 0,
    tone: "official",
    href: summary ? getWalletBatchHref(summary.batch.id) : "/wallets"
  },
  {
    label: "命中地址库",
    value: summary?.existingOverlapCount ?? 0,
    tone: "human",
    href: summary ? getWalletBatchHref(summary.batch.id) : "/wallets"
  },
  {
    label: "失败行",
    value: summary?.batch.failedCount ?? 0,
    tone: "warning",
    href: summary ? getBatchHref(summary.batch.id) : "/imports"
  }
];

export function ImportsConsole({
  data,
  initialSourceMode,
  view = "overview"
}: {
  data: WalletImportsPageData;
  initialSourceMode: WalletImportSourceMode;
  view?: ImportsConsoleView;
}) {
  const selectedBatch = data.selectedBatch;
  const batchStats = buildBatchStats(selectedBatch);
  const pageCopy = getPageCopy(view, selectedBatch);
  const showImportPanel = view !== "batch";

  return (
    <div className={styles.page}>
      <section className={styles.header}>
        <div className={styles.headerCopy}>
          <span className={styles.kicker}>{pageCopy.kicker}</span>
          <h1 className={styles.title}>{pageCopy.title}</h1>
          <p className={styles.description}>{pageCopy.description}</p>
        </div>
        <div className={styles.headerActions}>
          <AppLink href={pageCopy.primaryHref} className={styles.primaryButton}>
            {pageCopy.primaryLabel}
          </AppLink>
          <AppLink href={pageCopy.secondaryHref} className={styles.ghostButton}>
            {pageCopy.secondaryLabel}
          </AppLink>
        </div>
      </section>

      <section className={styles.metrics} aria-label="导入概览">
        <div className={styles.metric}>
          <span>导入批次</span>
          <strong>{data.overview.totalBatches}</strong>
        </div>
        <div className={styles.metric}>
          <span>Finder 批次</span>
          <strong>{data.overview.finderBatches}</strong>
        </div>
        <div className={styles.metric}>
          <span>已关联地址</span>
          <strong>{data.overview.importedWallets}</strong>
        </div>
        <div className={styles.metric}>
          <span>近 7 天入库行</span>
          <strong>{data.overview.importedRows7d}</strong>
        </div>
        <div className={styles.metric}>
          <span>近 7 天失败行</span>
          <strong>{data.overview.failedRows7d}</strong>
        </div>
      </section>

      <div className={styles.workspace}>
        {showImportPanel ? (
          <section className={styles.importPanel}>
            <div className={styles.sectionHeader}>
              <div>
                <span className={styles.kicker}>Import Action</span>
                <h2>{view === "finder" ? "同步 Finder 候选" : "发起导入"}</h2>
              </div>
              <div className={styles.modeSwitch}>
                <AppLink
                  href={getModeHref("finder")}
                  className={initialSourceMode === "finder" ? styles.modeActive : styles.modeLink}
                >
                  Finder
                </AppLink>
                <AppLink
                  href={getModeHref("file")}
                  className={initialSourceMode === "file" ? styles.modeActive : styles.modeLink}
                >
                  文件
                </AppLink>
                <AppLink
                  href={getModeHref("paste")}
                  className={initialSourceMode === "paste" ? styles.modeActive : styles.modeLink}
                >
                  粘贴
                </AppLink>
              </div>
            </div>
            <WalletImportPanel initialSourceMode={initialSourceMode} />
          </section>
        ) : null}

        <aside className={showImportPanel ? styles.sidePanel : styles.sidePanelWide}>
          <div className={styles.sectionHeader}>
            <div>
              <span className={styles.kicker}>Selected Batch</span>
              <h2>{selectedBatch ? getBatchTitle(selectedBatch.batch) : "暂无批次"}</h2>
            </div>
            {selectedBatch ? (
              <Link href={getWalletBatchHref(selectedBatch.batch.id)} className={styles.ghostButton}>
                打开地址库
              </Link>
            ) : null}
          </div>

          <div className={styles.detailList}>
            <div>
              <span>来源</span>
              <strong>{selectedBatch ? selectedBatch.sourceLabel : "--"}</strong>
            </div>
            <div>
              <span>批次 ID</span>
              <strong>{selectedBatch ? selectedBatch.batch.id : "--"}</strong>
            </div>
            <div>
              <span>创建时间</span>
              <strong>{formatDate(selectedBatch?.batch.createdAt)}</strong>
            </div>
            <div>
              <span>执行人</span>
              <strong>{selectedBatch?.batch.actor ?? "--"}</strong>
            </div>
            <div>
              <span>最近操作</span>
              <strong>{selectedBatch?.latestOperationAt ? formatDate(selectedBatch.latestOperationAt) : "暂无记录"}</strong>
            </div>
            <div>
              <span>操作人</span>
              <strong>
                {selectedBatch?.operationActors.length ? selectedBatch.operationActors.join(" / ") : "暂无记录"}
              </strong>
            </div>
          </div>

          <div className={styles.resultStrip}>
            <div>
              <span>新增</span>
              <strong>{selectedBatch?.batch.createdCount ?? 0}</strong>
            </div>
            <div>
              <span>命中地址库</span>
              <strong>{selectedBatch?.batch.updatedCount ?? 0}</strong>
            </div>
            <div>
              <span>失败</span>
              <strong>{selectedBatch?.batch.failedCount ?? 0}</strong>
            </div>
          </div>

          {selectedBatch?.promotedLabels.length ? (
            <div className={styles.labelCloud}>
              {selectedBatch.promotedLabels.map((label) => (
                <span key={label}>{label}</span>
              ))}
            </div>
          ) : (
            <div className={styles.emptyState}>这个批次还没有转正后的官方标签。</div>
          )}
        </aside>
      </div>

      <section className={styles.flowSection}>
        <div className={styles.sectionHeader}>
          <div>
            <span className={styles.kicker}>Batch Result</span>
            <h2>导入结果统计</h2>
          </div>
          {selectedBatch ? (
            <span className={styles.subtleText}>批次 {shortId(selectedBatch.batch.id)} · {formatDate(selectedBatch.batch.createdAt)}</span>
          ) : null}
        </div>
        <div className={styles.flowRail}>
          {batchStats.map((step, index) => (
            <AppLink key={step.label} href={step.href} className={styles.flowStep} data-tone={step.tone}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <strong>{step.value}</strong>
              <p>{step.label}</p>
            </AppLink>
          ))}
        </div>
      </section>

      <section className={styles.batchGrid}>
        <div className={styles.batchList}>
          <div className={styles.sectionHeader}>
            <div>
              <span className={styles.kicker}>Batch History</span>
              <h2>导入批次历史</h2>
            </div>
          </div>

          <div className={styles.batchRows}>
            {data.batches.length > 0 ? (
              data.batches.map((summary) => {
                const active = selectedBatch?.batch.id === summary.batch.id;
                return (
                  <AppLink
                    key={summary.batch.id}
                    href={getBatchHref(summary.batch.id)}
                    className={active ? styles.batchRowActive : styles.batchRow}
                  >
                    <div>
                      <span className={styles.sourceBadge} data-source={summary.batch.sourceType}>
                        {SOURCE_LABELS[summary.batch.sourceType]}
                      </span>
                      <strong>{getBatchTitle(summary.batch)}</strong>
                      <p>{formatDate(summary.batch.createdAt)}</p>
                    </div>
                    <div className={styles.batchNumbers}>
                      <span>{summary.batch.createdCount} 新增</span>
                      <span>{summary.existingOverlapCount} 命中地址库</span>
                      <span>{summary.successCount} 成功</span>
                      <span>{summary.batch.failedCount} 失败</span>
                    </div>
                  </AppLink>
                );
              })
            ) : (
              <div className={styles.emptyState}>还没有导入批次，先从上方发起一次 Finder 或 AI 导入。</div>
            )}
          </div>
        </div>

        <div className={styles.walletList}>
          <div className={styles.sectionHeader}>
            <div>
              <span className={styles.kicker}>Batch Wallets</span>
              <h2>本批地址</h2>
            </div>
            {selectedBatch ? (
              <Link
                href={getWalletBatchHref(selectedBatch.batch.id)}
                className={styles.ghostButton}
              >
                打开本批地址
              </Link>
            ) : null}
          </div>

          <div className={styles.walletRows}>
            {data.selectedBatchRows.length > 0 ? (
              data.selectedBatchRows.map((row) => (
                <AppLink
                  key={row.wallet.id}
                  href={getWalletBatchHref(
                    selectedBatch?.batch.id ?? row.wallet.importBatchId ?? "",
                    row.wallet.id
                  )}
                  className={styles.walletRow}
                >
                  <div>
                    <strong>{row.wallet.alias ?? row.wallet.displayName}</strong>
                    <p>{row.wallet.address}</p>
                  </div>
                  <div className={styles.walletMeta}>
                    <span>{row.wallet.deletedAt ? "已删除" : "已入库"}</span>
                    <span>{row.labels.filter((label) => label.source === "user").length} 官方标签</span>
                    <span>{row.labels.filter((label) => label.source !== "user").length} AI 标签</span>
                    <span>查看地址</span>
                  </div>
                </AppLink>
              ))
            ) : (
              <div className={styles.emptyState}>这个批次没有可展示的地址行。</div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
