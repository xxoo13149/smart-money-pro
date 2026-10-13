"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

interface SessionSnapshot {
  authReady?: boolean;
  accessEmail?: string;
  session?: { user?: { email?: string } } | null;
}

// 会话信息在客户端读取 /api/auth/session，
// 这样 layout 可以静态渲染，不必在每次请求里解析 cookie 与会话表。
export function SessionHeader() {
  const [snapshot, setSnapshot] = useState<SessionSnapshot | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/auth/session")
      .then(async (response) => {
        const payload = (await response.json().catch(() => ({}))) as {
          data?: SessionSnapshot;
        };
        if (active && payload.data) {
          setSnapshot(payload.data);
        }
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  const email = snapshot?.session?.user?.email;

  if (email) {
    return (
      <div className="header__session">
        <span className="header__session-label">{email}</span>
        <form action="/api/auth/logout" method="post">
          <button type="submit" className="secondary-button small-button">
            退出
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="header__session">
      <span className="eyebrow">
        {snapshot?.accessEmail
          ? `Access 已检测：${snapshot.accessEmail}`
          : snapshot?.authReady
            ? "后台登录"
            : "等待云端鉴权环境"}
      </span>
      <Link href="/auth/login" className="secondary-button small-button">
        登录
      </Link>
      <Link href="/auth/register" className="primary-button small-button">
        注册
      </Link>
    </div>
  );
}