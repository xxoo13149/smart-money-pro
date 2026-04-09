"use client";

import { startTransition, useState } from "react";
import { useRouter } from "next/navigation";
import type { AdminExtensionInviteItem } from "@weather-smart-money/core";

const formatDate = (value?: string | null) =>
  value ? new Date(value).toLocaleString() : "未使用";

const labelByStatus: Record<AdminExtensionInviteItem["effectiveStatus"], string> = {
  active: "可用",
  disabled: "已停用",
  expired: "已过期"
};

const toneByStatus: Record<AdminExtensionInviteItem["effectiveStatus"], string> = {
  active: "success",
  disabled: "neutral",
  expired: "error"
};

export const ExtensionInviteTable = ({ invites }: { invites: AdminExtensionInviteItem[] }) => {
  const router = useRouter();
  const [busyCode, setBusyCode] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const toggleInvite = async (invite: AdminExtensionInviteItem) => {
    setBusyCode(invite.code);
    setMessage(null);

    const nextStatus = invite.status === "active" ? "disabled" : "active";
    const response = await fetch(`/api/admin/extension/invites/${encodeURIComponent(invite.code)}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        status: nextStatus
      })
    });

    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    if (!response.ok) {
      setMessage(payload.error ?? "更新邀请码状态失败");
      setBusyCode(null);
      return;
    }

    setBusyCode(null);
    setMessage(nextStatus === "active" ? "邀请码已恢复" : "邀请码已停用");
    startTransition(() => router.refresh());
  };

  const copyInvite = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setMessage(`邀请码已复制：${code}`);
    } catch {
      setMessage("复制失败，请检查浏览器权限");
    }
  };

  return (
    <div className="stack-list">
      {message ? <div className="status-line">{message}</div> : null}
      {invites.length > 0 ? (
        invites.map((invite) => (
          <div key={invite.code} className="stack-item extension-admin-card">
            <div className="subtle-row">
              <strong>{invite.memberLabel}</strong>
              <span
                className="extension-status-pill"
                data-tone={toneByStatus[invite.effectiveStatus]}
              >
                {labelByStatus[invite.effectiveStatus]}
              </span>
            </div>

            <div className="identity-address">{invite.code}</div>

            <div className="extension-admin-meta">
              <span>创建 {formatDate(invite.createdAt)}</span>
              <span>到期 {formatDate(invite.expiresAt)}</span>
              <span>最后使用 {formatDate(invite.lastUsedAt)}</span>
              <span>会话 {invite.sessionCount}</span>
              <span>活跃 {invite.activeSessionCount}</span>
            </div>

            <div className="subtle-row">
              <span>最近会话 {formatDate(invite.latestSessionAt)}</span>
              <div className="badge-cluster">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => {
                    void copyInvite(invite.code);
                  }}
                >
                  复制邀请码
                </button>
                <button
                  type="button"
                  className="secondary-button"
                  disabled={busyCode === invite.code}
                  onClick={() => {
                    void toggleInvite(invite);
                  }}
                >
                  {busyCode === invite.code
                    ? "处理中..."
                    : invite.status === "active"
                      ? "停用"
                      : "恢复"}
                </button>
              </div>
            </div>
          </div>
        ))
      ) : (
        <div className="empty-state">还没有邀请码，先生成一组给测试成员使用。</div>
      )}
    </div>
  );
};
