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

export default async function RegisterPage({
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

  if (authState.accessEmail && authState.hasAccountForAccessEmail) {
    redirect(
      `/auth/login?next=${encodeURIComponent(nextPath)}&message=${encodeURIComponent("该邮箱已经注册，请直接登录")}`
    );
  }

  const error = readQueryValue(resolved, "error");
  const message = readQueryValue(resolved, "message");
  const accessEmail = authState.accessEmail;
  const approval = authState.registrationApproval;

  return (
    <div className="auth-shell">
      <section className="section-card auth-card">
        <div className="auth-hero">
          <span className="eyebrow">Register</span>
          <h1 className="auth-title">注册后台账户</h1>
          <p className="auth-copy">
            注册流程现在是双层校验：先通过你自己的 Cloudflare Access 邮箱 OTP，再向管理员审批邮箱发送审批码。只有两层都通过，账户才会建立。
          </p>
        </div>

        {message ? <div className="auth-callout auth-callout--success">{message}</div> : null}
        {error ? <div className="auth-callout auth-callout--danger">{error}</div> : null}

        {accessEmail ? (
          <div className="auth-grid">
            <div className="auth-form-stack">
              <form action="/api/auth/request-approval-code" method="post" className="auth-form">
                <input type="hidden" name="next" value={nextPath} />
                <input type="hidden" name="email" value={accessEmail} />

                <div className="field-shell">
                  <span className="field-label">已验证邮箱</span>
                  <div className="auth-verified-email">{accessEmail}</div>
                </div>

                <div className="auth-helper">
                  这个邮箱来自当前 Access 验证结果，不能手动改。审批码会发到管理员审批邮箱，而不是发到申请人邮箱。
                </div>

                <div className="toolbar-row">
                  <button type="submit" className="secondary-button">
                    发送审批码
                  </button>
                </div>
              </form>

              <form action="/api/auth/register" method="post" className="auth-form">
                <input type="hidden" name="next" value={nextPath} />
                <input type="hidden" name="email" value={accessEmail} />

                <div className="field-shell">
                  <span className="field-label">注册邮箱</span>
                  <div className="auth-verified-email">{accessEmail}</div>
                </div>

                <label className="field-shell">
                  <span className="field-label">管理员审批码</span>
                  <input
                    className="field-input"
                    type="text"
                    name="approvalCode"
                    placeholder="输入管理员转发给你的 6 位审批码"
                    autoComplete="one-time-code"
                    inputMode="numeric"
                    required
                  />
                </label>

                <label className="field-shell">
                  <span className="field-label">设置密码</span>
                  <input
                    className="field-input"
                    type="password"
                    name="password"
                    placeholder="至少 8 位"
                    autoComplete="new-password"
                    minLength={8}
                    required
                  />
                </label>

                <label className="field-shell">
                  <span className="field-label">确认密码</span>
                  <input
                    className="field-input"
                    type="password"
                    name="confirmPassword"
                    placeholder="再次输入密码"
                    autoComplete="new-password"
                    minLength={8}
                    required
                  />
                </label>

                <div className="toolbar-row">
                  <button type="submit" className="primary-button">
                    完成注册
                  </button>
                  <Link href={`/auth/login?next=${encodeURIComponent(nextPath)}`} className="secondary-button">
                    返回登录
                  </Link>
                </div>
              </form>
            </div>

            <aside className="auth-panel">
              <div className="auth-panel__section">
                <h2>当前注册规则</h2>
                <ul className="auth-list">
                  <li>第一层：申请人自己的邮箱必须先通过 Access 一次性验证码验证。</li>
                  <li>第二层：管理员审批码会发送到审批邮箱 {approval.ownerEmailMasked}。</li>
                  <li>审批码默认 {approval.ttlMinutes} 分钟内有效。</li>
                </ul>
              </div>

              <div className="auth-panel__section">
                <h2>推荐流程</h2>
                <ul className="auth-list">
                  <li>先完成 Access 邮箱 OTP。</li>
                  <li>点击“发送审批码”。</li>
                  <li>管理员审核后把审批码转发给申请人。</li>
                  <li>申请人输入审批码和密码，完成注册。</li>
                </ul>
              </div>
            </aside>
          </div>
        ) : (
          <div className="auth-empty">
            <div className="auth-callout auth-callout--warning">
              当前没有检测到 Access 验证邮箱，所以现在不能注册。请先通过 Cloudflare Access 完成你自己的邮箱验证码验证，再回到这里。
            </div>
            <div className="toolbar-row">
              <Link href="/auth/login" className="secondary-button">
                返回登录
              </Link>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
