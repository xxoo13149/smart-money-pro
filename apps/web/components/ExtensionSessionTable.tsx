"use client";

import { useEffect, useMemo, useState } from "react";
import { startTransition } from "react";
import { useRouter } from "next/navigation";
import type { AdminExtensionSessionItem } from "@weather-smart-money/core";

type SessionListResponse = {
  data?: AdminExtensionSessionItem[];
  error?: string;
};

const STATUS_OPTIONS = [
  { value: "all", label: "全部" },
  { value: "active", label: "活跃" },
  { value: "idle", label: "空闲" },
  { value: "expired", label: "已过期" },
  { value: "revoked", label: "已撤销" }
] as const;

const toneByStatus: Record<AdminExtensionSessionItem["status"], string> = {
  active: "success",
  idle: "neutral",
  expired: "error",
  revoked: "error"
};

const labelByStatus: Record<AdminExtensionSessionItem["status"], string> = {
  active: "活跃",
  idle: "空闲",
  expired: "已过期",
  revoked: "已撤销"
};

const formatDate = (value?: string | null) =>
  value ? new Date(value).toLocaleString() : "无";

export const ExtensionSessionTable = ({
  initialSessions
}: {
  initialSessions: AdminExtensionSessionItem[];
}) => {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<(typeof STATUS_OPTIONS)[number]["value"]>("all");
  const [sessions, setSessions] = useState(initialSessions);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [busySessionId, setBusySessionId] = useState<string | null>(null);

  const currentQueryString = useMemo(() => {
    const search = new URLSearchParams();
    if (query.trim()) {
      search.set("q", query.trim());
    }
    if (status !== "all") {
      search.set("status", status);
    }
    return search.toString();
  }, [query, status]);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setLoading(true);
      void fetch(`/api/admin/extension/sessions${currentQueryString ? `?${currentQueryString}` : ""}`, {
        cache: "no-store"
      })
        .then(async (response) => {
          const payload = (await response.json().catch(() => ({}))) as SessionListResponse;
          if (!response.ok || !payload.data) {
            throw new Error(payload.error ?? "读取会话失败");
          }
          if (!cancelled) {
            setSessions(payload.data);
          }
        })
        .catch((error) => {
          if (!cancelled) {
            setMessage(error instanceof Error ? error.message : "读取会话失败");
          }
        })
        .finally(() => {
          if (!cancelled) {
            setLoading(false);
          }
        });
    }, 220);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [currentQueryString]);

  const revokeSession = async (sessionId: string) => {
    setBusySessionId(sessionId);
    setMessage(null);

    const response = await fetch(`/api/admin/extension/sessions/${sessionId}/revoke`, {
      method: "POST"
    });
    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    if (!response.ok) {
      setMessage(payload.error ?? "撤销会话失败");
      setBusySessionId(null);
      return;
    }

    setBusySessionId(null);
    setMessage("会话已撤销");
    startTransition(() => router.refresh());
  };

  return (
    <div className="stack-list">
      <div className="extension-toolbar">
        <label className="field-shell">
          <span className="field-label">搜索</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="成员名 / 邀请码 / 设备名"
            className="field-input"
          />
        </label>

        <label className="field-shell extension-toolbar__select">
          <span className="field-label">状态</span>
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value as typeof status)}
            className="field-input"
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {message ? <div className="status-line">{message}</div> : null}
      {loading ? <div className="empty-state">正在刷新会话列表...</div> : null}

      {sessions.length > 0 ? (
        sessions.map((session) => (
          <div key={session.id} className="stack-item extension-admin-card">
            <div className="subtle-row">
              <strong>{session.memberLabel}</strong>
              <span className="extension-status-pill" data-tone={toneByStatus[session.status]}>
                {labelByStatus[session.status]}
              </span>
            </div>

            <div className="identity-address">{session.inviteCode}</div>

            <div className="extension-admin-meta">
              <span>设备 {session.deviceLabel || "未上报"}</span>
              <span>版本 {session.extensionVersion || "未知"}</span>
              <span>首次登录 {formatDate(session.createdAt)}</span>
              <span>最近活跃 {formatDate(session.lastSeenAt)}</span>
              <span>续期截止 {formatDate(session.refreshExpiresAt)}</span>
            </div>

            <div className="subtle-row">
              <span>ID {session.id}</span>
              <button
                type="button"
                className="secondary-button"
                disabled={busySessionId === session.id || session.status === "revoked"}
                onClick={() => {
                  void revokeSession(session.id);
                }}
              >
                {busySessionId === session.id ? "撤销中..." : "撤销会话"}
              </button>
            </div>
          </div>
        ))
      ) : (
        <div className="empty-state">当前筛选条件下没有会话记录。</div>
      )}
    </div>
  );
};
