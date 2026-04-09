import { AlertRow } from "../../components/AlertRow";
import { ResolveAlertButton } from "../../components/ResolveAlertButton";
import { Section } from "../../components/Section";
import { requireAdminPageSession } from "../../lib/admin-auth";
import { getAlertItems } from "../../lib/data";

export const dynamic = "force-dynamic";

export default async function AlertsPage() {
  await requireAdminPageSession("/alerts");
  const alerts = await getAlertItems();

  return (
    <Section
      title="预警中心"
      description="优先处理赛道切换、仓位突增、追高入场等红旗事件，减少跟错地址。"
    >
      <div className="stack-list">
        {alerts.map((item) => (
          <div key={item.alert.id} className="stack-item">
            <div className="subtle-row">
              <span>{item.wallet.alias ?? item.wallet.displayName}</span>
              <span>{item.market?.title ?? item.alert.marketId}</span>
            </div>
            <AlertRow alert={item.alert} />
            <div className="subtle-row">
              <span>{item.eventDescription}</span>
              {item.alert.status === "open" ? (
                <ResolveAlertButton alertId={item.alert.id} />
              ) : (
                <span className="badge">已处理</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}
