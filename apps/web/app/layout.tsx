import "./globals.css";
import Link from "next/link";

import { getAdminLayoutState } from "../lib/admin-auth";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Polymarket Smart Money",
  description: "Polymarket 聪明钱地址库与扩展工作台"
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const authState = await getAdminLayoutState();

  return (
    <html lang="zh-CN">
      <body>
        <div className="app-shell">
          <header className="header">
            <div className="header__title">Polymarket Smart Money Workspace</div>
            <div className="header__actions">
              {authState.session ? (
                <>
                  <nav className="nav">
                    <Link href="/">首页</Link>
                    <Link href="/wallets">地址库</Link>
                    <Link href="/alerts">预警</Link>
                    <Link href="/runtime">运行时</Link>
                    <Link href="/extension">扩展</Link>
                  </nav>
                  <div className="header__session">
                    <span className="header__session-label">{authState.session.user.email}</span>
                    <form action="/api/auth/logout" method="post">
                      <button type="submit" className="secondary-button small-button">
                        退出
                      </button>
                    </form>
                  </div>
                </>
              ) : (
                <div className="header__session">
                  <span className="eyebrow">
                    {authState.accessEmail
                      ? `Access 已检测：${authState.accessEmail}`
                      : authState.authReady
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
              )}
            </div>
          </header>
          <main className="main-shell">{children}</main>
        </div>
      </body>
    </html>
  );
}
