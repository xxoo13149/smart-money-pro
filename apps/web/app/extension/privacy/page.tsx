import { Section } from "../../../components/Section";

const updatedAt = "2026-04-07";

export const dynamic = "force-dynamic";

export default function ExtensionPrivacyPage() {
  return (
    <Section
      title="浏览器扩展隐私说明"
      description="Polymarket 顶级持仓者标注扩展只收集运行所必需的最少数据，用于把团队地址知识库安全地展示到页面里。"
    >
      <div className="stack-list">
        <article className="alert-shell">
          <h3>会读取哪些数据？</h3>
          <p>
            扩展只会在 <code>polymarket.com</code> 页面读取当前市场 slug，以及 Top Holders
            区域中公开可见的钱包地址或 profile 链接。它不会读取你的浏览历史、剪贴板、键盘输入，也不会访问与标注无关的站点内容。
          </p>
        </article>

        <article className="alert-shell">
          <h3>会发送哪些请求？</h3>
          <p>
            扩展不会直接请求 Polymarket 以外的第三方服务来识别你的账户。页内标注只会访问我们自己的扩展接口，由后端统一聚合市场、holder
            与地址标签摘要，并返回只读展示数据。
          </p>
        </article>

        <article className="alert-shell">
          <h3>邀请码与会话</h3>
          <p>
            首次使用时，你需要输入一次团队邀请码来换取短期 access token 和长期 refresh token。它们只保存在扩展自己的{" "}
            <code>chrome.storage.local</code> 中，用于续期只读会话，不会替代或上传你的 Polymarket 登录凭证。
          </p>
        </article>

        <article className="alert-shell">
          <h3>本地缓存</h3>
          <p>
            为了让滚动、切页、回退和重新打开页面时尽快恢复标注，扩展会缓存最近访问市场的聚合结果、ETag、登录状态和启用开关。退出登录后，受保护的会话信息会被清除，市场缓存也会随之失效。
          </p>
        </article>

        <article className="alert-shell">
          <h3>扩展不会做什么？</h3>
          <p>
            扩展不会代表你下单、修改 Polymarket 的交易行为，也不会在扩展内提供写标签能力。所有地址编辑、备注、watchlist
            和标签管理仍然留在团队工作台中完成。
          </p>
        </article>

        <article className="alert-shell">
          <h3>联系我们</h3>
          <p>
            如果你需要撤销访问、反馈问题或获取最新版隐私说明，请联系团队管理员。本文档最后更新时间为 {updatedAt}。
          </p>
        </article>
      </div>
    </Section>
  );
}
