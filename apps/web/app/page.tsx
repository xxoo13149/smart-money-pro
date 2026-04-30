import Link from "next/link";

import { AlertRow } from "../components/AlertRow";
import { AppLink } from "../components/AppLink";
import { Metric } from "../components/Metric";
import { Section } from "../components/Section";
import { WalletPreview } from "../components/WalletPreview";
import { requireAdminPageSession } from "../lib/admin-auth";
import { getDashboardData, getWalletList } from "../lib/data";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  await requireAdminPageSession("/");
  const data = await getDashboardData();
  const spotlightWallets = data.spotlightWallets ?? (await getWalletList()).slice(0, 3);

  return (
    <>
      <Section
        title="今日 Polymarket 工作台"
        description="把重点市场、聪明钱地址和红旗预警放在一屏内，先判断，再跟踪。"
        action={<AppLink href="/wallets">管理地址库</AppLink>}
      >
        <div className="grid">
          <Metric label="活跃市场" value={data.summary.activeWeatherMarkets} />
          <Metric label="追踪地址" value={data.summary.trackedWallets} />
          <Metric label="待处理预警" value={data.summary.openAlerts} />
          <Metric label="平均胜率" value={data.summary.averageWeatherWinRate} suffix="%" />
        </div>
      </Section>

      <Section title="重点市场" description="用链上活跃流量和重点地址参与情况快速扫一遍今日主战场。">
        <div className="market-strip">
          {data.markets.map((market) => (
            <article key={market.marketId} className="market-strip__item">
              <div className="subtle-row">
                <span>{market.location}</span>
                <span>{market.status}</span>
              </div>
              <h3>{market.title}</h3>
              <div className="metric-inline">净流入 {market.netTrackedFlowUsd} USD</div>
              <p>{market.notableWallets.join(" / ") || "暂无重点地址"}</p>
            </article>
          ))}
        </div>
      </Section>

      <Section
        title="核心地址"
        description="优先盯稳曲线、专精和已加入观察列表的钱包。"
        action={<AppLink href="/wallets">查看全部</AppLink>}
      >
        <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
          {spotlightWallets.map((item) => (
            <WalletPreview
              key={item.wallet.id}
              wallet={item.wallet}
              metrics={item.metrics}
              labels={item.labels}
              alerts={data.alerts
                .filter((alertItem) => alertItem.wallet.id === item.wallet.id)
                .map((alertItem) => alertItem.alert)}
            />
          ))}
        </div>
      </Section>

      <Section
        title="待处理红旗"
        description="高分事件优先处理，点进地址详情后可以继续写备注、打标签和加入 watchlist。"
        action={<AppLink href="/alerts">前往预警中心</AppLink>}
      >
        <div className="stack-list">
          {data.alerts.slice(0, 4).map((item) => (
            <div key={item.alert.id} className="alert-shell">
              <AlertRow alert={item.alert} />
              <div className="subtle-row">
                <span>{item.wallet.alias ?? item.wallet.displayName}</span>
                <span>{item.market?.title ?? item.alert.marketId}</span>
              </div>
            </div>
          ))}
        </div>
      </Section>
    </>
  );
}
