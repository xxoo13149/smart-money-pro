"use client";

import { startTransition, useState } from "react";
import { useRouter } from "next/navigation";
import type { Wallet } from "@weather-smart-money/core";

const formatDate = (value: string | undefined) => {
  if (!value) {
    return "--";
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("zh-CN", { hour12: false });
};

export const WalletEditForm = ({ wallet }: { wallet: Wallet }) => {
  const router = useRouter();
  const [form, setForm] = useState({
    address: wallet.address,
    displayName: wallet.displayName,
    alias: wallet.alias ?? "",
    bio: wallet.bio,
    strategyFocus: wallet.strategyFocus,
    teamNote: wallet.teamNote ?? ""
  });
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const updateField = (key: keyof typeof form, value: string) =>
    setForm((current) => ({ ...current, [key]: value }));

  const submit = async () => {
    setPending(true);
    setMessage(null);

    const response = await fetch(`/api/wallets/${wallet.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(form)
    });
    const payload = (await response.json().catch(() => ({}))) as { error?: string };

    if (!response.ok) {
      setMessage(payload.error ?? "保存失败");
      setPending(false);
      return;
    }

    setMessage("资料已更新，扩展会在缓存刷新后自动同步。");
    setPending(false);
    startTransition(() => router.refresh());
  };

  return (
    <div className="stack-list">
      <div className="detail-meta-grid">
        <div className="stack-item">
          <div className="field-label">系统时间戳</div>
          <div className="detail-kv-list">
            <div className="detail-kv">
              <span>首次发现</span>
              <strong>{formatDate(wallet.firstSeenAt)}</strong>
            </div>
            <div className="detail-kv">
              <span>创建时间</span>
              <strong>{formatDate(wallet.createdAt)}</strong>
            </div>
            <div className="detail-kv">
              <span>更新时间</span>
              <strong>{formatDate(wallet.updatedAt)}</strong>
            </div>
            <div className="detail-kv">
              <span>删除状态</span>
              <strong>{wallet.deletedAt ? `已删除 · ${formatDate(wallet.deletedAt)}` : "正常"}</strong>
            </div>
          </div>
        </div>
      </div>

      <div className="action-grid">
        <label className="field-shell">
          <span className="field-label">地址</span>
          <input
            value={form.address}
            onChange={(event) => updateField("address", event.target.value)}
            className="field-input"
          />
        </label>

        <label className="field-shell">
          <span className="field-label">显示名</span>
          <input
            value={form.displayName}
            onChange={(event) => updateField("displayName", event.target.value)}
            className="field-input"
          />
        </label>

        <label className="field-shell">
          <span className="field-label">扩展别名</span>
          <input
            value={form.alias}
            onChange={(event) => updateField("alias", event.target.value)}
            className="field-input"
          />
        </label>
      </div>

      <div className="action-grid">
        <label className="field-shell">
          <span className="field-label">一句话摘要</span>
          <textarea
            value={form.strategyFocus}
            onChange={(event) => updateField("strategyFocus", event.target.value)}
            className="field-input field-textarea"
          />
        </label>

        <label className="field-shell">
          <span className="field-label">详细背景</span>
          <textarea
            value={form.bio}
            onChange={(event) => updateField("bio", event.target.value)}
            className="field-input field-textarea"
          />
        </label>

        <label className="field-shell">
          <span className="field-label">团队备注</span>
          <textarea
            value={form.teamNote}
            onChange={(event) => updateField("teamNote", event.target.value)}
            className="field-input field-textarea"
          />
        </label>
      </div>

      <div className="subtle-row">
        <span>保存后会影响扩展标注、搜索结果和详情页摘要。</span>
        <button
          type="button"
          className="primary-button"
          disabled={pending || !form.address.trim() || !form.displayName.trim()}
          onClick={() => {
            void submit();
          }}
        >
          {pending ? "保存中..." : "更新资料"}
        </button>
      </div>

      {message ? <div className="status-line">{message}</div> : null}
    </div>
  );
};
