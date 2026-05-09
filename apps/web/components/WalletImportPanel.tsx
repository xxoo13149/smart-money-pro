"use client";

import { startTransition, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type {
  WalletAiExtractPreviewRow,
  WalletAiProviderMeta,
  WalletImportPreviewRow,
  WalletPrimarySignal
} from "@weather-smart-money/core";

import { WALLET_IMPORT_FIELD_GUIDE, type WalletImportPreview } from "../lib/wallet-import";

type PreviewMode = "ai" | "text";
export type WalletImportSourceMode = "file" | "paste" | "finder";

interface AiPreviewResponse {
  rows: WalletAiExtractPreviewRow[];
  providerMeta?: WalletAiProviderMeta;
  fallbackReason?: string;
}

interface FinderPreviewResponse {
  rows: WalletImportPreviewRow[];
  sourceName: string;
  runId?: string;
  finderBaseUrl?: string;
  totalRows: number;
  validRows: number;
  pulledRows?: number;
  matchedRows?: number;
  filteredOutRows?: number;
  providerMeta?: WalletAiProviderMeta;
  fallbackReason?: string;
}

const PREVIEW_LABEL_KINDS = new Set([
  "performance",
  "style",
  "strategy",
  "group",
  "resolution_source",
  "forecast_basis",
  "timing_window",
  "edge_style",
  "weather_driver"
]);

const WEATHER_GUIDE_BLOCKS = [
  {
    title: "什么信息最有价值",
    body:
      "优先给出搜索系统 AI 已经命中的重点标签和关键数据，例如高频-XX地区、高暴击-XX地区、高胜率-XX地区，以及彩票型、拆分型、流动型选手标签。"
  },
  {
    title: "系统现在怎么处理",
    body:
      "现在会尽量接收搜索系统 AI 返回的全部结果，不再做过强的二次拦截。系统主要负责提炼短标签、压缩关键数据、方便后台快速查看。"
  },
  {
    title: "推荐输入模板",
    body:
      "原来的结构化模板仍然保留；如果你已经有搜索系统 AI 的输出，也可以直接把标签匹配结果、关键数据和原文摘录整块贴进来。"
  },
  {
    title: "短标签提炼规则",
    body:
      "高频交易地区提炼为“高频-XX地区”，高暴击提炼为“高暴击-XX地区”，高胜率提炼为“高胜率-XX地区”；彩票型、拆分型、流动型选手会直接保留为对应短标签。"
  },
  {
    title: "关键数据如何展示",
    body:
      "系统会优先提炼交易占比、盈利倍数、胜率、筹码成本占比、持仓均价、已卖出占比，并把这些信息压缩到一句摘要和预览卡片里。"
  }
] as const;

const TEMPLATE_TEXT = `地址: 0x...
显示名: Wumai
标签匹配: 高频交易地区-新加坡, 高暴击-新加坡, 流动型选手
关键数据: 新加坡交易占比 62%, 新加坡盈利倍数 3.8x, 已卖出占比 71%
主要市场/城市: Singapore
结算来源或站点: NWS/NOAA
主要依据: ensemble guidance + station observation
常用时间窗口: D1
常见下注方式: upper tail near threshold
天气驱动: cloud cover, precip timing
重点观察原因: 持续跟踪样本
原文证据摘录: Uses NWS/NOAA obs, watches D1 ensemble spread, leans upper tail when cloud cover clears late.`;

const DEFAULT_FINDER_BASE_URL = "http://127.0.0.1:41874";

const countValidRows = (rows: WalletImportPreviewRow[]) =>
  rows.filter((row) => row.errors.length === 0).length;

const shortText = (value: string, max = 120) =>
  value.length > max ? `${value.slice(0, max - 3).trimEnd()}...` : value;

const isAiPreviewRow = (row: WalletImportPreviewRow): row is WalletAiExtractPreviewRow =>
  "signalQuality" in row && "weatherSignals" in row;

const getSignalQualityLabel = (row: WalletImportPreviewRow) => {
  if (!isAiPreviewRow(row)) {
    return "文本预览";
  }

  switch (row.signalQuality) {
    case "high_signal":
      return "高信号";
    case "needs_review":
      return "信号不足";
    default:
      return "低信号";
  }
};

const getSignalQualityTone = (row: WalletImportPreviewRow) => {
  if (!isAiPreviewRow(row)) {
    return "neutral";
  }

  switch (row.signalQuality) {
    case "high_signal":
      return "watch";
    case "needs_review":
      return "neutral";
    default:
      return "danger";
  }
};

const getPreviewTags = (row: WalletImportPreviewRow) =>
  row.labels
    .filter((label) => PREVIEW_LABEL_KINDS.has(label.kind))
    .map((label) => label.value)
    .slice(0, 4);

const getPrimarySignalTags = (row: WalletImportPreviewRow) =>
  isAiPreviewRow(row) ? row.primarySignals.map((signal) => signal.label).slice(0, 4) : [];

const getPreviewMetrics = (row: WalletImportPreviewRow) =>
  isAiPreviewRow(row) ? row.keyMetrics.slice(0, 4) : [];

const getPreviewSignals = (row: WalletImportPreviewRow): WalletPrimarySignal[] =>
  isAiPreviewRow(row) ? row.primarySignals.slice(0, 4) : [];

export const WalletImportPanel = ({
  onCommitted,
  initialSourceMode = "file"
}: {
  onCommitted?: () => void;
  initialSourceMode?: WalletImportSourceMode;
}) => {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [sourceMode, setSourceMode] = useState<WalletImportSourceMode>(initialSourceMode);
  const [previewMode, setPreviewMode] = useState<PreviewMode>("ai");
  const [file, setFile] = useState<File | null>(null);
  const [pastedText, setPastedText] = useState("");
  const [finderBaseUrl, setFinderBaseUrl] = useState(DEFAULT_FINDER_BASE_URL);
  const [finderRunId, setFinderRunId] = useState("");
  const [preview, setPreview] = useState<WalletImportPreviewRow[] | null>(null);
  const [previewMeta, setPreviewMeta] = useState<{
    sourceName: string;
    detectedFormat?: string;
    finderRunId?: string;
    finderBaseUrl?: string;
    pulledRows?: number;
    matchedRows?: number;
    filteredOutRows?: number;
    providerMeta?: WalletAiProviderMeta;
    fallbackReason?: string;
  } | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [pending, setPending] = useState<"preview" | "commit" | null>(null);
  const [result, setResult] = useState<{
    createdCount: number;
    updatedCount: number;
    finderAiUpsertedCount?: number;
    failedRows: Array<{ rowNumber: number; displayName: string; reason: string }>;
  } | null>(null);

  useEffect(() => {
    setPreview(null);
    setPreviewMeta(null);
    setResult(null);
    setStatus(null);
  }, [previewMode, sourceMode]);

  useEffect(() => {
    setSourceMode(initialSourceMode);
  }, [initialSourceMode]);

  const resolveSource = async () => {
    if (sourceMode === "file") {
      if (!file) {
        throw new Error("请先选择要导入的文件。");
      }

      return {
        sourceName: file.name || "wallets.txt",
        text: await file.text()
      };
    }

    if (!pastedText.trim()) {
      throw new Error("请先粘贴要解析的地址资料。");
    }

    return {
      sourceName: "wallets.txt",
      text: pastedText
    };
  };

  const loadPreview = async () => {
    setPending("preview");
    setResult(null);
    setStatus(
      sourceMode === "finder"
        ? "正在读取 Finder 候选地址并生成 AI 预览..."
        : previewMode === "ai"
        ? "正在调用 AI 做天气交易结构化提取..."
        : "正在生成文本预览..."
    );

    try {
      if (sourceMode === "finder") {
        const response = await fetch("/api/finder/import/preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            finderBaseUrl,
            runId: finderRunId.trim() || "latest",
            limit: 100
          })
        });
        const payload = (await response.json().catch(() => ({}))) as {
          data?: FinderPreviewResponse;
          error?: string;
        };

        if (!response.ok || !payload.data) {
          throw new Error(payload.error ?? "Finder 预览生成失败，请确认 Finder API 已启动。");
        }

        setPreview(payload.data.rows ?? []);
        setPreviewMeta({
          sourceName: payload.data.sourceName,
          finderRunId: payload.data.runId,
          finderBaseUrl: payload.data.finderBaseUrl,
          pulledRows: payload.data.pulledRows,
          matchedRows: payload.data.matchedRows,
          filteredOutRows: payload.data.filteredOutRows,
          providerMeta: payload.data.providerMeta,
          fallbackReason: payload.data.fallbackReason
        });
        setStatus(
          `Finder 预览完成：共拉取 ${payload.data.pulledRows ?? payload.data.totalRows} 条，命中标签 ${payload.data.matchedRows ?? payload.data.totalRows} 条，过滤 ${payload.data.filteredOutRows ?? 0} 条，${payload.data.validRows} 条可导入。`
        );
        return;
      }

      const source = await resolveSource();
      const response = await fetch(
        previewMode === "ai" ? "/api/wallets/import/ai-preview" : "/api/wallets/import/text",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(source)
        }
      );
      const payload = (await response.json().catch(() => ({}))) as {
        data?: WalletImportPreview | AiPreviewResponse;
        error?: string;
      };

      if (!response.ok || !payload.data) {
        throw new Error(payload.error ?? "预览生成失败，请重试。");
      }

      if (previewMode === "ai") {
        const aiData = payload.data as AiPreviewResponse;
        setPreview(aiData.rows ?? []);
        setPreviewMeta({
          sourceName: source.sourceName,
          providerMeta: aiData.providerMeta,
          fallbackReason: aiData.fallbackReason
        });
        setStatus(
          `AI 预览完成：共识别 ${aiData.rows.length} 条，${countValidRows(aiData.rows)} 条可导入。`
        );
      } else {
        const textData = payload.data as WalletImportPreview;
        setPreview(textData.rows);
        setPreviewMeta({
          sourceName: textData.fileName,
          detectedFormat: textData.detectedFormat
        });
        setStatus(
          `文本预览完成：共识别 ${textData.totalRows} 条，${textData.validRows} 条可导入。`
        );
      }
    } catch (error) {
      setPreview(null);
      setPreviewMeta(null);
      setStatus(error instanceof Error ? error.message : "预览生成失败，请稍后再试。");
    } finally {
      setPending(null);
    }
  };

  const commitImport = async () => {
    if (!preview || !previewMeta) {
      return;
    }

    setPending("commit");
    setStatus(
      sourceMode === "finder"
        ? "正在提交 Finder 地址资料并写入地址库..."
        : "正在提交地址资料并写入地址库..."
    );

    try {
      const response = await fetch("/api/wallets/import/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rows: preview,
          mode:
            sourceMode === "finder"
              ? "ai"
              : previewMode === "ai" && previewMeta.providerMeta?.provider !== "none"
              ? "ai"
              : sourceMode === "paste"
                ? "text"
                : "file",
          sourceType: sourceMode === "finder" ? "finder" : undefined,
          sourceName: previewMeta.sourceName,
          preserveExistingManualFields: sourceMode === "finder"
        })
      });
      const payload = (await response.json().catch(() => ({}))) as {
        data?: {
          createdCount: number;
          updatedCount: number;
          finderAiUpsertedCount?: number;
          failedRows: Array<{ rowNumber: number; displayName: string; reason: string }>;
        };
        error?: string;
      };

      if (!response.ok || !payload.data) {
        throw new Error(payload.error ?? "导入失败，请检查数据后重试。");
      }

      setResult(payload.data);
      const finderAiStatus =
        sourceMode === "finder"
          ? `，Finder AI 深度解读 ${payload.data.finderAiUpsertedCount ?? 0} 条`
          : "";
      setStatus(
        `${sourceMode === "finder" ? "Finder " : ""}导入完成：新增 ${payload.data.createdCount} 条，更新 ${payload.data.updatedCount} 条${finderAiStatus}，失败 ${payload.data.failedRows.length} 条。`
      );

      if (onCommitted) {
        onCommitted();
      } else {
        startTransition(() => router.refresh());
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "导入失败，请稍后再试。");
    } finally {
      setPending(null);
    }
  };

  const validRows = preview ? countValidRows(preview) : 0;

  return (
    <div className="stack-item import-panel">
      <div className="section-inline-header">
        <div>
          <h3 className="inline-title">AI 导入</h3>
          <p className="inline-copy">
            支持文件上传和文本粘贴。默认先接收搜索系统 AI 的结果做结构化提炼，再确认写库；原有模板字段仍然保留。
          </p>
        </div>
      </div>

      <div className="segmented">
        <button
          type="button"
          className={`segmented__item${sourceMode === "file" ? " segmented__item--active" : ""}`}
          onClick={() => setSourceMode("file")}
        >
          上传文件
        </button>
        <button
          type="button"
          className={`segmented__item${sourceMode === "paste" ? " segmented__item--active" : ""}`}
          onClick={() => setSourceMode("paste")}
        >
          粘贴文本
        </button>
        <button
          type="button"
          className={`segmented__item${sourceMode === "finder" ? " segmented__item--active" : ""}`}
          onClick={() => setSourceMode("finder")}
        >
          Finder
        </button>
      </div>

      {sourceMode !== "finder" ? (
        <div className="segmented">
          <button
            type="button"
            className={`segmented__item${previewMode === "ai" ? " segmented__item--active" : ""}`}
            onClick={() => setPreviewMode("ai")}
          >
            AI 结构化预览
          </button>
          <button
            type="button"
            className={`segmented__item${previewMode === "text" ? " segmented__item--active" : ""}`}
            onClick={() => setPreviewMode("text")}
          >
            文本解析预览
          </button>
        </div>
      ) : null}

      <div className="import-grid">
        <div>
          {sourceMode === "file" ? (
            <>
              <button
                type="button"
                className={`import-dropzone${isDragging ? " import-dropzone--active" : ""}`}
                onDragOver={(event) => {
                  event.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(event) => {
                  event.preventDefault();
                  setIsDragging(false);
                  setFile(event.dataTransfer.files?.[0] ?? null);
                }}
                onClick={() => {
                  if (inputRef.current) {
                    inputRef.current.value = "";
                    inputRef.current.click();
                  }
                }}
              >
                <span className="import-dropzone__title">
                  {file ? file.name : "拖拽文件到这里，或点击选择文件"}
                </span>
                <span className="import-dropzone__copy">
                  支持 JSON / CSV / TXT。只要材料里包含地址、显示名和交易线索，系统就会尽量结构化提取。
                </span>
              </button>
              <input
                ref={inputRef}
                type="file"
                accept=".json,.csv,.txt,application/json,text/csv,text/plain"
                className="hidden"
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              />
            </>
          ) : sourceMode === "finder" ? (
            <div className="stack-list">
              <label className="field-shell">
                <span className="field-label">Finder API 地址</span>
                <input
                  value={finderBaseUrl}
                  onChange={(event) => setFinderBaseUrl(event.target.value)}
                  placeholder={DEFAULT_FINDER_BASE_URL}
                  className="field-input"
                />
              </label>
              <label className="field-shell">
                <span className="field-label">分析任务 ID</span>
                <input
                  value={finderRunId}
                  onChange={(event) => setFinderRunId(event.target.value)}
                  placeholder="留空读取最近完成的 Finder 任务"
                  className="field-input"
                />
              </label>
            </div>
          ) : (
            <label className="field-shell">
              <span className="field-label">粘贴地址资料</span>
              <textarea
                value={pastedText}
                onChange={(event) => setPastedText(event.target.value)}
                placeholder={TEMPLATE_TEXT}
                className="field-input field-textarea"
              />
            </label>
          )}

          <div className="subtle-row" style={{ marginTop: "0.85rem" }}>
            <span>
              {sourceMode === "finder"
                ? "读取 Finder 的 selected_wallets 和钱包详情，先走 AI 识别预览，再确认写库。"
                : previewMode === "ai"
                ? "默认按 Gemini → Groq → 文本解析 的顺序降级，尽量保留搜索系统 AI 返回的重点结果。"
                : "跳过 AI，直接用本地解析规则生成预览。"}
            </span>
            <button
              type="button"
              className="secondary-button"
              disabled={pending === "preview"}
              onClick={() => {
                void loadPreview();
              }}
            >
              {pending === "preview"
                ? sourceMode === "finder"
                  ? "读取中..."
                  : "生成中..."
                : sourceMode === "finder"
                  ? "读取 Finder 候选"
                  : "生成预览"}
            </button>
          </div>

          <div className="status-line" style={{ marginTop: "0.85rem" }}>
              {status ??
              (sourceMode === "finder"
                ? "Finder 导入会保护已有手动维护字段，不会直接覆盖手动备注和手动标签。"
                : "导入前会先生成预览，不会直接写库。")}
          </div>
        </div>

        <div className="stack-item import-guide">
          <h4 className="inline-title" style={{ marginBottom: "0.5rem" }}>
            {sourceMode === "finder" ? "Finder 导入指南" : "AI 导入指南"}
          </h4>
          <div className="stack-list">
            {WEATHER_GUIDE_BLOCKS.map((block) => (
              <div key={block.title} className="import-guide__item">
                <div className="subtle-row">
                  <strong>{block.title}</strong>
                </div>
                <p className="inline-copy">{block.body}</p>
              </div>
            ))}
          </div>

          <div className="import-guide__item" style={{ marginTop: "0.85rem" }}>
            <div className="subtle-row">
              <strong>推荐模板</strong>
            </div>
            <pre className="identity-address" style={{ whiteSpace: "pre-wrap", margin: 0 }}>
              {TEMPLATE_TEXT}
            </pre>
          </div>

          <details className="import-guide" style={{ marginTop: "0.85rem" }}>
            <summary className="import-guide__summary">接受的字段与别名</summary>
            <div className="stack-list" style={{ marginTop: "0.85rem" }}>
              {WALLET_IMPORT_FIELD_GUIDE.map((field) => (
                <div key={field.key} className="import-guide__item">
                  <div className="subtle-row">
                    <strong>{field.label}</strong>
                    <span>{field.required ? "必填" : "可选"}</span>
                  </div>
                  <p className="inline-copy">{field.description}</p>
                  <div className="badge-cluster">
                    {field.examples.map((example) => (
                      <span key={example} className="eyebrow">
                        {example}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </details>
        </div>
      </div>

      {preview ? (
        <div className="import-preview">
          <div className="subtle-row">
            <span>总条数 {preview.length}</span>
            <span>可导入 {validRows}</span>
            <span>异常 {preview.length - validRows}</span>
            {previewMeta?.pulledRows ? <span>Finder 拉取 {previewMeta.pulledRows}</span> : null}
            {previewMeta?.matchedRows !== undefined ? <span>命中标签 {previewMeta.matchedRows}</span> : null}
            {previewMeta?.filteredOutRows ? <span>已过滤 {previewMeta.filteredOutRows}</span> : null}
            {previewMeta?.detectedFormat ? (
              <span>格式 {previewMeta.detectedFormat.toUpperCase()}</span>
            ) : null}
            {previewMeta?.finderRunId ? <span>Finder {previewMeta.finderRunId}</span> : null}
            {previewMeta?.providerMeta ? (
              <span>
                Provider {previewMeta.providerMeta.provider} / {previewMeta.providerMeta.model}
              </span>
            ) : null}
          </div>

          {previewMeta?.fallbackReason ? (
            <div className="empty-state">AI 不可用，已自动退回文本解析：{previewMeta.fallbackReason}</div>
          ) : null}

          <div className="stack-list">
            {preview.slice(0, 6).map((row) => {
              const primarySignals = getPreviewSignals(row);
              const primaryTags = getPrimarySignalTags(row);
              const tags = primaryTags.length > 0 ? primaryTags : getPreviewTags(row);
              const metrics = getPreviewMetrics(row);

              return (
                <div key={row.rowNumber} className="stack-item">
                  <div className="subtle-row">
                    <strong>
                      第 {row.rowNumber} 条 · {row.wallet.alias ?? row.wallet.displayName}
                    </strong>
                    <span>{row.errors.length > 0 ? "不可导入" : "可导入"}</span>
                  </div>

                  <div className="identity-address">{row.wallet.address}</div>

                  <div className="subtle-row" style={{ justifyContent: "space-between" }}>
                    <span className="status-dot" data-tone={getSignalQualityTone(row)}>
                      {getSignalQualityLabel(row)}
                    </span>
                    <span>{row.wallet.strategyFocus ?? "暂无交易摘要"}</span>
                  </div>

                  {tags.length > 0 ? (
                    <div className="badge-cluster" style={{ marginBottom: "0.35rem" }}>
                      {tags.map((tag) => (
                        <span key={tag} className="eyebrow">
                          {tag}
                        </span>
                      ))}
                    </div>
                  ) : null}

                  {primarySignals.length > 0 ? (
                    <p className="inline-copy" style={{ marginBottom: "0.35rem" }}>
                      {primarySignals
                        .map((signal) =>
                          signal.metricText ? `${signal.label} · ${signal.metricText}` : signal.label
                        )
                        .join(" / ")}
                    </p>
                  ) : null}

                  {metrics.length > 0 ? (
                    <div className="badge-cluster" style={{ marginBottom: "0.35rem" }}>
                      {metrics.map((metric) => (
                        <span key={metric} className="eyebrow">
                          {metric}
                        </span>
                      ))}
                    </div>
                  ) : null}

                  <p className="inline-copy">
                    {row.sourceExcerpt ? shortText(row.sourceExcerpt, 180) : "暂无原文证据摘录"}
                  </p>

                  {row.warnings.length > 0 ? (
                    <div className="status-line">提示：{row.warnings.join(" / ")}</div>
                  ) : null}

                  {row.errors.length > 0 ? (
                    <div className="status-line">错误：{row.errors.join(" / ")}</div>
                  ) : null}
                </div>
              );
            })}
          </div>

          {result ? (
            <div className="stack-item">
              <div className="subtle-row">
                <span>新增 {result.createdCount}</span>
                <span>更新 {result.updatedCount}</span>
                {sourceMode === "finder" ? <span>Finder AI {result.finderAiUpsertedCount ?? 0}</span> : null}
                <span>失败 {result.failedRows.length}</span>
              </div>
              {result.failedRows.slice(0, 5).map((item) => (
                <div key={`${item.rowNumber}-${item.displayName}`} className="subtle-row">
                  <span>
                    第 {item.rowNumber} 条 · {item.displayName}
                  </span>
                  <span>{item.reason}</span>
                </div>
              ))}
            </div>
          ) : null}

          <div className="subtle-row">
            <span>确认导入后会统一写库，并同步刷新地址标签版本。</span>
            <button
              type="button"
              className="primary-button"
              disabled={pending === "commit" || validRows === 0}
              onClick={() => {
                void commitImport();
              }}
            >
              {pending === "commit"
                ? "导入中..."
                : sourceMode === "finder"
                  ? "确认导入 Finder 地址"
                  : "确认导入"}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
};
