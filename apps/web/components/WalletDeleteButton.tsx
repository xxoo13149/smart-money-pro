"use client";

import { useState } from "react";

const WORKSPACE_FLASH_KEY = "wallet-workspace-flash";

export const WalletDeleteButton = ({
  walletId,
  disabled = false
}: {
  walletId: string;
  disabled?: boolean;
}) => {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const removeWallet = async () => {
    const confirmed = window.confirm(
      "确认软删除这个地址吗？删除后默认列表和扩展标注都会隐藏。"
    );
    if (!confirmed) {
      return;
    }

    const reason = window.prompt("可以留一个删除原因（可选）", "detail-page-delete") ?? "";

    setPending(true);
    setMessage(null);

    const response = await fetch(`/api/wallets/${walletId}`, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        reason: reason.trim() || undefined
      })
    });
    const payload = (await response.json().catch(() => ({}))) as { error?: string };

    if (!response.ok) {
      setMessage(payload.error ?? "删除失败");
      setPending(false);
      return;
    }

    setMessage("地址已软删除。");
    setPending(false);
    window.sessionStorage.setItem(
      WORKSPACE_FLASH_KEY,
      "地址已软删除，默认列表和扩展标注已隐藏。"
    );
    window.location.assign("/wallets");
  };

  return (
    <div className="danger-card">
      <div>
        <h4 className="inline-title">删除地址</h4>
        <p className="inline-copy">
          这是软删除，不会清空审计流、标签或备注，但默认列表和扩展会立刻隐藏这个地址。
        </p>
      </div>
      <div className="subtle-row">
        <button
          type="button"
          className="danger-button"
          disabled={disabled || pending}
          onClick={() => {
            void removeWallet();
          }}
        >
          {pending ? "删除中..." : "软删除地址"}
        </button>
      </div>
      {message ? <div className="status-line">{message}</div> : null}
    </div>
  );
};
