"use client";

import { startTransition, useState } from "react";
import { useRouter } from "next/navigation";

type InviteCreateResponse = {
  data?: {
    code: string;
    memberLabel: string;
  };
  error?: string;
};

export const ExtensionInviteCreateForm = () => {
  const router = useRouter();
  const [memberLabel, setMemberLabel] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const submit = async () => {
    setPending(true);
    setMessage(null);

    const response = await fetch("/api/admin/extension/invites", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        memberLabel,
        expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null
      })
    });

    const payload = (await response.json().catch(() => ({}))) as InviteCreateResponse;
    if (!response.ok || !payload.data) {
      setMessage(payload.error ?? "生成邀请码失败");
      setPending(false);
      return;
    }

    setMessage(`邀请码已生成：${payload.data.code}`);
    setMemberLabel("");
    setExpiresAt("");
    setPending(false);
    startTransition(() => router.refresh());
  };

  return (
    <div className="stack-item">
      <div className="section-inline-header">
        <div>
          <h3 className="inline-title">生成邀请码</h3>
          <p className="inline-copy">
            一人一码。邀请码由服务端自动生成，默认允许该成员在多个浏览器或设备登录。
          </p>
        </div>
      </div>

      <div className="action-grid">
        <label className="field-shell">
          <span className="field-label">成员名</span>
          <input
            value={memberLabel}
            onChange={(event) => setMemberLabel(event.target.value)}
            placeholder="例如 Luka Team / tester-01"
            className="field-input"
          />
        </label>

        <label className="field-shell">
          <span className="field-label">到期时间</span>
          <input
            value={expiresAt}
            onChange={(event) => setExpiresAt(event.target.value)}
            type="datetime-local"
            className="field-input"
          />
        </label>
      </div>

      <div className="subtle-row">
        <span>邀请码格式：`luka-yyyymmdd-XXXXXXXX`</span>
        <button
          type="button"
          className="primary-button"
          disabled={pending || !memberLabel.trim()}
          onClick={() => {
            void submit();
          }}
        >
          {pending ? "生成中..." : "生成邀请码"}
        </button>
      </div>

      {message ? <div className="status-line">{message}</div> : null}
    </div>
  );
};
