"use client";

import { startTransition, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type {
  WalletAiExtractPreviewRow,
  WalletAiProviderMeta,
  WalletImportPreviewRow
} from "@weather-smart-money/core";

import { WALLET_IMPORT_FIELD_GUIDE, type WalletImportPreview } from "../lib/wallet-import";

type PreviewMode = "ai" | "text";
type SourceMode = "file" | "paste";

interface AiPreviewResponse {
  rows: WalletAiExtractPreviewRow[];
  providerMeta?: WalletAiProviderMeta;
  fallbackReason?: string;
}

const WEATHER_LABEL_KINDS = new Set([
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
      "优先写清结算来源、预测依据、时间窗口、下注边和天气驱动。对温度市场来说，这些信息比人物风格标签更能直接影响交易判断。"
  },
  {
    title: "什么信息是噪音",
    body:
      "避免“聪明钱、稳健、高频、亚洲风格、经验丰富”这类空泛描述。没有来源、时间或天气证据支撑的泛化词，都会被系统降权或过滤。"
  },
  {
    title: "推荐输入模板",
    body:
      "建议按地址分块提供：地址、显示名、主要市场/城市、结算来源或站点、主要依据、常用时间窗口、常见下注方式、天气驱动、重点观察原因、原文证据摘录。"
  },
  {
    title: "坏示例",
    body:
      "例如“Wumai 是天气高手，亚洲风格，很聪明，值得关注”这种内容没有交易证据，也没有天气维度，会被判定为低信号。"
  },
  {
    title: "AI 只依据你给的材料",
    body:
      "系统不会联网补充，也不会自己猜市场来源。材料里没写清楚的内容，AI 会保守留空或标记为需复核。"
  }
] as const;

const TEMPLATE_TEXT = `地址: 0x...
显示名: Wumai
主要市场/城市: Singapore
结算来源或站点: NWS/NOAA
主要依据: ensemble guidance + station observation
常用时间窗口: D1
常见下注方式: upper tail near threshold
天气驱动: cloud cover, precip timing
重点观察原因: 持续跟踪样本
原文证据摘录: Uses NWS/NOAA obs, watches D1 ensemble spread, leans upper tail when cloud cover clears late.`;

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
      return "需复核";
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
      return "ai-review";
    default:
      return "danger";
  }
};

const getPreviewTags = (row: WalletImportPreviewRow) =>
  row.labels
    .filter((label) => WEATHER_LABEL_KINDS.has(label.kind))
    .map((label) => label.value)
    .slice(0, 4);

export const WalletImportPanel = ({
  onCommitted
}: {
  onCommitted?: () => void;
}) => {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [sourceMode, setSourceMode] = useState<SourceMode>("file");
  const [previewMode, setPreviewMode] = useState<PreviewMode>("ai");
  const [file, setFile] = useState<File | null>(null);
  const [pastedText, setPastedText] = useState("");
  const [preview, setPreview] = useState<WalletImportPreviewRow[] | null>(null);
  const [previewMeta, setPreviewMeta] = useState<{
    sourceName: string;
    detectedFormat?: string;
    providerMeta?: WalletAiProviderMeta;
    fallbackReason?: string;
  } | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [pending, setPending] = useState<"preview" | "commit" | null>(null);
  const [result, setResult] = useState<{
    createdCount: number;
    updatedCount: number;
    failedRows: Array<{ rowNumber: number; displayName: string; reason: string }>;
  } | null>(null);

  useEffect(() => {
    setPreview(null);
    setPreviewMeta(null);
    setResult(null);
    setStatus(null);
  }, [previewMode, sourceMode]);

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
      previewMode === "ai"
        ? "正在调用 AI 做天气交易结构化提取..."
        : "正在生成文本预览..."
    );

    try {
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
    setStatus("正在提交地址资料并写入地址库...");

    try {
      const response = await fetch("/api/wallets/import/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rows: preview,
          mode:
            previewMode === "ai" && previewMeta.providerMeta?.provider !== "none"
              ? "ai"
              : sourceMode === "paste"
                ? "text"
                : "file",
          sourceName: previewMeta.sourceName
        })
      });
      const payload = (await response.json().catch(() => ({}))) as {
        data?: {
          createdCount: number;
          updatedCount: number;
          failedRows: Array<{ rowNumber: number; displayName: string; reason: string }>;
        };
        error?: string;
      };

      if (!response.ok || !payload.data) {
        throw new Error(payload.error ?? "导入失败，请检查数据后重试。");
      }

      setResult(payload.data);
      setStatus(
        `导入完成：新增 ${payload.data.createdCount} 条，更新 ${payload.data.updatedCount} 条，失败 ${payload.data.failedRows.length} 条。`
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
            支持文件上传和文本粘贴。默认先做天气温度交易专用的 AI 结构化预览，再确认写库。
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
      </div>

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
              {previewMode === "ai"
                ? "默认按 Gemini → Groq → 文本解析 的顺序降级，始终只使用你提供的材料。"
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
              {pending === "preview" ? "生成中..." : "生成预览"}
            </button>
          </div>

          <div className="status-line" style={{ marginTop: "0.85rem" }}>
            {status ?? "导入前会先生成预览，不会直接写库。"}
          </div>
        </div>

        <div className="stack-item import-guide">
          <h4 className="inline-title" style={{ marginBottom: "0.5rem" }}>
            天气温度交易导入指南
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
            {previewMeta?.detectedFormat ? (
              <span>格式 {previewMeta.detectedFormat.toUpperCase()}</span>
            ) : null}
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
              const tags = getPreviewTags(row);

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
              {pending === "commit" ? "导入中..." : "确认导入"}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
};
