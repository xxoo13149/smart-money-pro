"use client";

import { startTransition, useState } from "react";
import { useRouter } from "next/navigation";

export const WalletCreateForm = ({
  variant = "panel",
  onSuccess
}: {
  variant?: "panel" | "modal";
  onSuccess?: () => void;
}) => {
  const router = useRouter();
  const [form, setForm] = useState({
    address: "",
    displayName: "",
    alias: "",
    labelsText: "",
    teamNote: ""
  });
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const updateField = (key: keyof typeof form, value: string) =>
    setForm((current) => ({ ...current, [key]: value }));

  const submit = async () => {
    setPending(true);
    setMessage(null);

    const response = await fetch("/api/wallets", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(form)
    });
    const payload = (await response.json().catch(() => ({}))) as { error?: string };

    if (!response.ok) {
      setMessage(payload.error ?? "新增地址失败");
      setPending(false);
      return;
    }

    setForm({
      address: "",
      displayName: "",
      alias: "",
      labelsText: "",
      teamNote: ""
    });
    setMessage("地址已写入地址库，扩展会在缓存刷新后自动同步。");
    setPending(false);

    if (onSuccess) {
      onSuccess();
      return;
    }

    startTransition(() => router.refresh());
  };

  return (
    <div className={variant === "panel" ? "stack-item" : undefined}>
      {variant === "panel" ? (
        <div className="section-inline-header">
          <div>
            <h3 className="inline-title">手动新增</h3>
            <p className="inline-copy">
              这里只保留最小字段：地址、显示名、扩展别名、标签串和团队备注。创建时间与更新时间由系统自动记录。
            </p>
          </div>
        </div>
      ) : null}

      <div className="action-grid">
        <label className="field-shell">
          <span className="field-label">地址</span>
          <input
            value={form.address}
            onChange={(event) => updateField("address", event.target.value)}
            placeholder="0x..."
            className="field-input"
          />
        </label>

        <label className="field-shell">
          <span className="field-label">显示名</span>
          <input
            value={form.displayName}
            onChange={(event) => updateField("displayName", event.target.value)}
            placeholder="例如：Wumai"
            className="field-input"
          />
        </label>

        <label className="field-shell">
          <span className="field-label">扩展别名</span>
          <input
            value={form.alias}
            onChange={(event) => updateField("alias", event.target.value)}
            placeholder="例如：聪明钱样本"
            className="field-input"
          />
        </label>

        <label className="field-shell">
          <span className="field-label">标签串</span>
          <input
            value={form.labelsText}
            onChange={(event) => updateField("labelsText", event.target.value)}
            placeholder="用中文逗号分隔，例如：天气，亚洲，快进快出"
            className="field-input"
          />
        </label>
      </div>

      <label className="field-shell">
        <span className="field-label">团队备注</span>
        <textarea
          value={form.teamNote}
          onChange={(event) => updateField("teamNote", event.target.value)}
          placeholder="可选。更长的背景、判断和上下文放这里。"
          className="field-input field-textarea"
        />
      </label>

      <div className="subtle-row">
        <span>必填：地址、显示名</span>
        <button
          type="button"
          className="primary-button"
          disabled={pending || !form.address.trim() || !form.displayName.trim()}
          onClick={() => {
            void submit();
          }}
        >
          {pending ? "保存中..." : "保存地址"}
        </button>
      </div>

      {message ? <div className="status-line">{message}</div> : null}
    </div>
  );
};
