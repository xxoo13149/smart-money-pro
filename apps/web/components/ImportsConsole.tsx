import Link from "next/link";
import type { WalletImportBatch, WalletSourceType } from "@weather-smart-money/core";

import type { WalletImportsPageData, WalletImportBatchSummary } from "../lib/data";
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

const getWalletBatchHref = (batchId: string, walletId?: string, status?: "review_needed" | "active") => {
  if (!batchId) {
    return walletId ? `/wallets/${walletId}` : "/wallets";
  }

  const params = new URLSearchParams({ batch: batchId });
  if (status) {
    params.set("status", status);
  }
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
        "聚焦单个导入批次的来源、AI 结构化结果、待确认地址、人工审阅记录和官方标签产出。",
      primaryHref: "/imports",
      primaryLabel: "返回导入中心",
      secondaryHref: selectedBatch
        ? getWalletBatchHref(selectedBatch.batch.id, undefined, "review_needed")
        : "/wallets?status=review_needed",
      secondaryLabel: "处理本批待确认"
    };
  }

  return {
    kicker: "Import Operations",
    title: "导入中心",
    description: "统一管理 Finder 候选、AI 结构化、地址库待确认、人工审阅和官方标签转正。",
    primaryHref: "/imports/finder",
    primaryLabel: "Finder 对接中心",
    secondaryHref: "/wallets?status=review_needed",
    secondaryLabel: "处理待确认"
  };
};

const buildWorkflow = (summary: WalletImportBatchSummary | null) => [
  {
    label: "Finder 候选",
    value: summary?.workflow.finderCandidates ?? 0,
    tone: "finder",
    href: summary ? getBatchHref(summary.batch.id) : "/imports/finder"
  },
  {
    label: "AI 结构化",
    value: summary?.workflow.structuredRows ?? 0,
    tone: "ai",
    href: summary ? getBatchHref(summary.batch.id) : "/imports"
  },
  {
    label: "地址库待确认",
    value: summary?.workflow.reviewQueue ?? 0,
    tone: "review",
    href: summary ? getWalletBatchHref(summary.batch.id, undefined, "review_needed") : "/wallets?status=review_needed"
  },
  {
    label: "人工审阅",
    value: summary?.workflow.approvedWallets ?? 0,
    tone: "human",
    href: summary ? getWalletBatchHref(summary.batch.id, undefined, "active") : "/wallets?status=active"
  },
  {
    label: "官方标签",
    value: summary?.workflow.promotedLabels ?? 0,
    tone: "official",
    href: summary ? getWalletBatchHref(summary.batch.id) : "/wallets"
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
  const workflow = buildWorkflow(selectedBatch);
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
          <Link href={pageCopy.primaryHref} className={styles.primaryButton}>
            {pageCopy.primaryLabel}
          </Link>
          <Link href={pageCopy.secondaryHref} className={styles.ghostButton}>
            {pageCopy.secondaryLabel}
          </Link>
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
          <span>待确认地址</span>
          <strong>{data.overview.pendingReviewWallets}</strong>
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
                <Link
                  href={getModeHref("finder")}
                  className={initialSourceMode === "finder" ? styles.modeActive : styles.modeLink}
                >
                  Finder
                </Link>
                <Link
                  href={getModeHref("file")}
                  className={initialSourceMode === "file" ? styles.modeActive : styles.modeLink}
                >
                  文件
                </Link>
                <Link
                  href={getModeHref("paste")}
                  className={initialSourceMode === "paste" ? styles.modeActive : styles.modeLink}
                >
                  粘贴
                </Link>
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
              <span>后续审阅</span>
              <strong>{selectedBatch?.latestReviewAt ? formatDate(selectedBatch.latestReviewAt) : "暂无记录"}</strong>
            </div>
            <div>
              <span>审阅人</span>
              <strong>
                {selectedBatch?.reviewActors.length ? selectedBatch.reviewActors.join(" / ") : "暂无记录"}
              </strong>
            </div>
          </div>

          <div className={styles.resultStrip}>
            <div>
              <span>新增</span>
              <strong>{selectedBatch?.batch.createdCount ?? 0}</strong>
            </div>
            <div>
              <span>更新</span>
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
            <span className={styles.kicker}>Operational Flow</span>
            <h2>导入处理链路</h2>
          </div>
          {selectedBatch ? (
            <span className={styles.subtleText}>当前批次：{shortId(selectedBatch.batch.id)}</span>
          ) : null}
        </div>
        <div className={styles.flowRail}>
          {workflow.map((step, index) => (
            <Link key={step.label} href={step.href} className={styles.flowStep} data-tone={step.tone}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <strong>{step.value}</strong>
              <p>{step.label}</p>
            </Link>
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
                  <Link
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
                      <span>{summary.batch.updatedCount} 更新</span>
                      <span>{summary.batch.failedCount} 失败</span>
                    </div>
                  </Link>
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
                href={getWalletBatchHref(selectedBatch.batch.id, undefined, "review_needed")}
                className={styles.ghostButton}
              >
                只看待确认
              </Link>
            ) : null}
          </div>

          <div className={styles.walletRows}>
            {data.selectedBatchRows.length > 0 ? (
              data.selectedBatchRows.map((row) => (
                <Link
                  key={row.wallet.id}
                  href={getWalletBatchHref(
                    selectedBatch?.batch.id ?? row.wallet.importBatchId ?? "",
                    row.wallet.id,
                    row.wallet.curationStatus === "review_needed" ? "review_needed" : undefined
                  )}
                  className={styles.walletRow}
                >
                  <div>
                    <strong>{row.wallet.alias ?? row.wallet.displayName}</strong>
                    <p>{row.wallet.address}</p>
                  </div>
                  <div className={styles.walletMeta}>
                    <span>{row.wallet.curationStatus === "review_needed" ? "待确认" : "已入库"}</span>
                    <span>{row.labels.filter((label) => label.source === "user").length} 官方标签</span>
                    <span>{row.labels.filter((label) => label.source !== "user").length} AI 标签</span>
                    <span>{row.wallet.curationStatus === "review_needed" ? "去审阅" : "查看链路"}</span>
                  </div>
                </Link>
              ))
            ) : (
              <div className={styles.emptyState}>当前批次没有可展示的地址行。</div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
