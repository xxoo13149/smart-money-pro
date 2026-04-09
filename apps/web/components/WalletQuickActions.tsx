"use client";

import { startTransition, useState } from "react";
import { useRouter } from "next/navigation";

type WalletQuickActionsSection = "notes" | "tags" | "watchlist";

export const WalletQuickActions = ({
  walletId,
  sections = ["notes", "tags", "watchlist"]
}: {
  walletId: string;
  sections?: WalletQuickActionsSection[];
}) => {
  const router = useRouter();
  const showNotes = sections.includes("notes");
  const showTags = sections.includes("tags");
  const showWatchlist = sections.includes("watchlist");
  const [note, setNote] = useState("");
  const [tagName, setTagName] = useState("");
  const [tagValue, setTagValue] = useState("");
  const [watchlistNote, setWatchlistNote] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const runRequest = async (
    input: RequestInfo,
    init: RequestInit,
    successMessage: string
  ) => {
    setPending(true);
    setMessage(null);

    try {
      const response = await fetch(input, init);
      const payload = (await response.json().catch(() => ({}))) as { error?: string };

      if (!response.ok) {
        setMessage(payload.error ?? "操作失败");
        setPending(false);
        return false;
      }

      setMessage(successMessage);
      setPending(false);
      startTransition(() => router.refresh());
      return true;
    } catch {
      setMessage("请求失败，请稍后重试");
      setPending(false);
      return false;
    }
  };

  return (
    <div className="action-grid">
      {showNotes ? (
        <label className="field-shell">
          <span className="field-label">新增备注</span>
          <textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="例如：过去 3 个月东京相关市场累计 +180%"
            className="field-input field-textarea"
          />
          <button
            type="button"
            className="primary-button"
            disabled={pending || !note.trim()}
            onClick={async () => {
              const ok = await runRequest(
                `/api/wallets/${walletId}/notes`,
                {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ content: note })
                },
                "备注已保存"
              );
              if (ok) {
                setNote("");
              }
            }}
          >
            保存备注
          </button>
        </label>
      ) : null}

      {showTags ? (
        <label className="field-shell">
          <span className="field-label">自定义标签</span>
          <input
            value={tagName}
            onChange={(event) => setTagName(event.target.value)}
            placeholder="标签名，例如 分组"
            className="field-input"
          />
          <input
            value={tagValue}
            onChange={(event) => setTagValue(event.target.value)}
            placeholder="标签值，例如 东京核心观察"
            className="field-input"
          />
          <button
            type="button"
            className="primary-button"
            disabled={pending || !tagName.trim() || !tagValue.trim()}
            onClick={async () => {
              const ok = await runRequest(
                `/api/wallets/${walletId}/user-tags`,
                {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ name: tagName, value: tagValue, kind: "group" })
                },
                "标签已添加"
              );
              if (ok) {
                setTagName("");
                setTagValue("");
              }
            }}
          >
            添加标签
          </button>
        </label>
      ) : null}

      {showWatchlist ? (
        <label className="field-shell">
          <span className="field-label">加入关注列表</span>
          <input
            value={watchlistNote}
            onChange={(event) => setWatchlistNote(event.target.value)}
            placeholder="给团队留一句跟踪理由"
            className="field-input"
          />
          <button
            type="button"
            className="primary-button"
            disabled={pending}
            onClick={async () => {
              const ok = await runRequest(
                "/api/watchlists",
                {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ walletId, note: watchlistNote })
                },
                "已加入关注列表"
              );
              if (ok) {
                setWatchlistNote("");
              }
            }}
          >
            快速跟踪
          </button>
        </label>
      ) : null}

      {message ? <div className="status-line">{message}</div> : null}
    </div>
  );
};
