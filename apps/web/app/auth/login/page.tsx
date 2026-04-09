import Link from "next/link";
import { redirect } from "next/navigation";

import { getAdminLayoutState, getSafeNextPath } from "../../../lib/admin-auth";

export const dynamic = "force-dynamic";

const readQueryValue = (
  source: Record<string, string | string[] | undefined>,
  key: string
): string | undefined => {
  const value = source[key];
  return Array.isArray(value) ? value[0] : value;
};

export default async function LoginPage({
  searchParams
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolved = (await searchParams) ?? {};
  const nextPath = getSafeNextPath(readQueryValue(resolved, "next"));
  const authState = await getAdminLayoutState();

  if (authState.session) {
    redirect(nextPath);
  }

  const error = readQueryValue(resolved, "error");
  const message = readQueryValue(resolved, "message");
  const reason = readQueryValue(resolved, "reason");
  const accessEmail = authState.accessEmail;
  const needsRegister = Boolean(accessEmail && !authState.hasAccountForAccessEmail);

  return (
    <div className="auth-shell">
      <section className="section-card auth-card">
        <div className="auth-hero">
          <span className="eyebrow">Admin Auth</span>
          <h1 className="auth-title">后台安全登录</h1>
          <p className="auth-copy">
            这里保留双层保护。先通过 Cloudflare Access 完成你自己的邮箱一次性验证码验证，再使用同一邮箱对应的后台密码登录。
          </p>
        </div>

        {reason === "access" ? (
          <div className="auth-callout auth-callout--warning">
            当前请求还没有检测到 Cloudflare Access 验证邮箱。请先完成 Access 邮箱验证码验证，再回到后台。
          </div>
        ) : null}
        {message ? <div className="auth-callout auth-callout--success">{message}</div> : null}
        {error ? <div className="auth-callout auth-callout--danger">{error}</div> : null}

        <div className="auth-grid">
          <form action="/api/auth/login" method="post" className="auth-form">
            <input type="hidden" name="next" value={nextPath} />

            {accessEmail ? (
              <div className="field-shell">
                <span className="field-label">已验证邮箱</span>
                <div className="auth-verified-email">{accessEmail}</div>
              </div>
            ) : (
              <label className="field-shell">
                <span className="field-label">登录邮箱</span>
                <input
                  className="field-input"
                  type="email"
                  name="email"
                  placeholder="admin@example.com"
                  autoComplete="email"
                  required
                />
              </label>
            )}

            <label className="field-shell">
              <span className="field-label">密码</span>
              <input
                className="field-input"
                type="password"
                name="password"
                placeholder="输入后台密码"
                autoComplete="current-password"
                minLength={8}
                required
              />
            </label>

            <div className="toolbar-row">
              <button type="submit" className="primary-button">
                登录后台
              </button>
              <Link
                href={needsRegister ? `/auth/register?next=${encodeURIComponent(nextPath)}` : "/auth/register"}
                className="secondary-button"
              >
                去注册
              </Link>
            </div>
          </form>

          <aside className="auth-panel">
            <div className="auth-panel__section">
              <h2>当前登录规则</h2>
              <ul className="auth-list">
                <li>正式环境先经过 Cloudflare Access 邮箱 OTP。</li>
                <li>后台登录邮箱必须与当前 Access 验证邮箱一致。</li>
                <li>密码只在服务端校验，并写入 httpOnly session cookie。</li>
              </ul>
            </div>

            <div className="auth-panel__section">
              <h2>注册说明</h2>
              <p>注册页会在 Access 邮箱验证完成之后，再额外要求管理员审批码。你的 QQ 邮箱审批码是第二道门。</p>
            </div>
          </aside>
        </div>
      </section>
    </div>
  );
}
