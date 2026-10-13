import "./globals.css";

import { AdminNav } from "../components/AdminNav";
import { UpdateNotice } from "../components/UpdateNotice";
import { SessionHeader } from "../components/SessionHeader";

export const metadata = {
  title: "Polymarket Smart Money",
  description: "Polymarket 聪明钱地址库与扩展工作台"
};

// layout 保持静态渲染：会话状态交给 SessionHeader 在客户端读取。
// 页面级登录门禁由各页面/接口的 requireAdmin* 负责，避免每次请求都在
// Worker 里跑一次 session 解析（Error 1102 的主要来源之一）。
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>
        <div className="app-shell">
          <header className="header">
            <div className="header__title">Polymarket Smart Money Workspace</div>
            <div className="header__actions">
              <SessionHeader />
              <AdminNav />
              <UpdateNotice />
            </div>
          </header>
          <main className="main-shell">{children}</main>
        </div>
      </body>
    </html>
  );
}