"use client";

import { startTransition, useDeferredValue, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { WalletAdminRow } from "@weather-smart-money/core";

const shortAddress = (address: string) =>
  address.length > 18 ? `${address.slice(0, 8)}...${address.slice(-6)}` : address;

const formatDate = (value: string | undefined) => {
  if (!value) {
    return "--";
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("zh-CN", { hour12: false });
};

export const WalletLibrary = ({ rows }: { rows: WalletAdminRow[] }) => {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const deferredQuery = useDeferredValue(query);
  const normalized = deferredQuery.trim().toLowerCase();

  const filteredRows = normalized
    ? rows.filter((row) =>
        [
          row.wallet.displayName,
          row.wallet.alias,
          row.wallet.address,
          row.wallet.strategyFocus,
          row.wallet.teamNote,
          ...row.labels.map((label) => `${label.name} ${label.value}`)
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(normalized)
      )
    : rows;

  const removeWallet = async (walletId: string, displayName: string) => {
    const confirmed = window.confirm(`确认删除地址 “${displayName}” 吗？这次是软删除，后续可以按时间审计。`);
    if (!confirmed) {
      return;
    }

    setPendingDeleteId(walletId);
    setMessage(null);

    const response = await fetch(`/api/wallets/${walletId}`, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ reason: "wallet-library-delete" })
    });
    const payload = (await response.json().catch(() => ({}))) as { error?: string };

    if (!response.ok) {
      setMessage(payload.error ?? "删除失败");
      setPendingDeleteId(null);
      return;
    }

    setPendingDeleteId(null);
    setMessage("地址已软删除，默认列表和扩展标注会自动隐藏。");
    startTransition(() => router.refresh());
  };

  return (
    <div className="wallet-library">
      <div className="wallet-library__toolbar">
        <label className="field-shell">
          <span className="field-label">搜索地址、别名、标签</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="例如 Wumai / 天气 / 0xA8C9"
            className="field-input"
          />
        </label>
        <div className="subtle-row">
          <span>结果 {filteredRows.length}</span>
          <span>默认只展示未删除地址</span>
        </div>
      </div>

      {message ? <div className="status-line">{message}</div> : null}

      <div className="data-table__scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th>地址</th>
              <th>显示名</th>
              <th>扩展别名</th>
              <th>高价值标签</th>
              <th>创建时间</th>
              <th>更新时间</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.length > 0 ? (
              filteredRows.map((row) => (
                <tr key={row.wallet.id}>
                  <td>
                    <div className="cell-mono">{shortAddress(row.wallet.address)}</div>
                    <div className="cell-subtle">{row.wallet.normalizedAddress}</div>
                  </td>
                  <td>
                    <div className="cell-title">{row.wallet.displayName}</div>
                    <div className="cell-subtle">{row.wallet.strategyFocus || row.wallet.teamNote || "暂无摘要"}</div>
                  </td>
                  <td>
                    <div className="cell-title">{row.wallet.alias || row.wallet.displayName}</div>
                  </td>
                  <td>
                    <div className="badge-cluster">
                      {row.highlights.length > 0 ? (
                        row.highlights.slice(0, 3).map((badge) => (
                          <span key={badge.id} className="badge">
                            {badge.text}
                          </span>
                        ))
                      ) : (
                        <span className="eyebrow">暂无标签</span>
                      )}
                    </div>
                  </td>
                  <td>
                    <div className="cell-subtle">{formatDate(row.wallet.createdAt)}</div>
                  </td>
                  <td>
                    <div className="cell-subtle">{formatDate(row.wallet.updatedAt)}</div>
                  </td>
                  <td>
                    <div className="row-actions">
                      <Link href={`/wallets/${row.wallet.id}`} className="secondary-button small-button">
                        查看详情
                      </Link>
                      <button
                        type="button"
                        className="danger-button small-icon-button"
                        disabled={pendingDeleteId === row.wallet.id}
                        onClick={() => {
                          void removeWallet(row.wallet.id, row.wallet.alias || row.wallet.displayName);
                        }}
                        aria-label={`删除 ${row.wallet.displayName}`}
                      >
                        {pendingDeleteId === row.wallet.id ? "..." : "×"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={7}>
                  <div className="empty-state">
                    没有匹配结果。可以尝试搜索地址片段、别名、团队备注或标签关键词。
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
