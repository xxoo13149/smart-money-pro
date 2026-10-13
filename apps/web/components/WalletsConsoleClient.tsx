"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

import type { WalletDetailData } from "../lib/data";
import type {
  WalletListQuery,
  WalletListResponse,
} from "@weather-smart-money/core";

// 地址库工作台是重客户端组件：改为客户端动态加载，
// 避免在服务端渲染大表格消耗 Worker CPU（免费版 10ms 限制会触发 Error 1102）。
const WalletsConsole = dynamic(() => import("./WalletsConsole").then((mod) => mod.WalletsConsole), {
  ssr: false,
  loading: () => (
    <div className="stack-list">
      <div className="eyebrow">正在加载地址库工作台…</div>
    </div>
  )
});

interface WalletsPagePayload {
  query: WalletListQuery;
  listPage: WalletListResponse;
  selectedWalletDetail: WalletDetailData | null;
}

// 整页初始数据（列表 + 选中详情）改由客户端请求
// /api/wallets/page-data 获取，服务端不再重复跑一次聚合查询。
export function WalletsConsoleLoader() {
  const [payload, setPayload] = useState<WalletsPagePayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const search = window.location.search;
    fetch(`/api/wallets/page-data${search}`)
      .then(async (response) => {
        const body = (await response.json().catch(() => ({}))) as {
          data?: WalletsPagePayload;
          error?: string;
        };
        if (response.status === 401) {
          window.location.replace(`/auth/login?next=${encodeURIComponent(`/wallets${search}`)}`);
          return;
        }
        if (!response.ok || !body.data) {
          throw new Error(body.error || `HTTP ${response.status}`);
        }
        if (active) {
          setPayload(body.data);
        }
      })
      .catch((cause: unknown) => {
        if (active) {
          setError(cause instanceof Error ? cause.message : "地址库加载失败");
        }
      });
    return () => {
      active = false;
    };
  }, []);

  if (error) {
    return <div className="empty-state">地址库加载失败：{error}</div>;
  }

  if (!payload) {
    return (
      <div className="stack-list">
        <div className="eyebrow">正在加载地址库工作台…</div>
      </div>
    );
  }

  return (
    <WalletsConsole
      initialData={payload.listPage}
      initialQuery={payload.query}
      initialSelectedWalletDetail={payload.selectedWalletDetail}
    />
  );
}