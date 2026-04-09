import type {
  AdminExtensionInviteItem,
  AdminExtensionOverview,
  AdminExtensionSessionItem
} from "@weather-smart-money/core";

import { ExtensionInviteCreateForm } from "../../components/ExtensionInviteCreateForm";
import { ExtensionInviteTable } from "../../components/ExtensionInviteTable";
import { ExtensionSessionTable } from "../../components/ExtensionSessionTable";
import { Metric } from "../../components/Metric";
import { Section } from "../../components/Section";
import { requireAdminPageSession } from "../../lib/admin-auth";
import {
  getAdminExtensionOverview,
  listAdminExtensionInvites,
  listAdminExtensionSessions
} from "../../lib/data";

export const dynamic = "force-dynamic";

export default async function ExtensionAdminPage() {
  await requireAdminPageSession("/extension");
  let loadError: string | null = null;
  const fallbackOverview: AdminExtensionOverview = {
    totalInvites: 0,
    activeInvites: 0,
    disabledInvites: 0,
    expiredInvites: 0,
    activeSessions: 0,
    idleSessions: 0,
    expiredSessions: 0,
    revokedSessions: 0
  };
  let overview: AdminExtensionOverview = fallbackOverview;
  let invites: AdminExtensionInviteItem[] = [];
  let sessions: AdminExtensionSessionItem[] = [];

  try {
    [overview, invites, sessions] = await Promise.all([
      getAdminExtensionOverview(),
      listAdminExtensionInvites(),
      listAdminExtensionSessions({ status: "all" })
    ]);
  } catch (error) {
    loadError = error instanceof Error ? error.message : "扩展中心数据加载失败";
  }

  return (
    <>
      <Section
        title="扩展中心"
        description="集中管理邀请码、会话状态和扩展使用情况。这里展示的是管理员视角，不会暴露给公开扩展 API。"
      >
        <div className="grid">
          <Metric label="邀请码总数" value={overview.totalInvites} />
          <Metric label="可用邀请码" value={overview.activeInvites} />
          <Metric label="已停用邀请码" value={overview.disabledInvites} />
          <Metric label="当前活跃会话" value={overview.activeSessions} />
          <Metric label="空闲会话" value={overview.idleSessions} />
          <Metric label="已过期/已撤销会话" value={overview.expiredSessions + overview.revokedSessions} />
        </div>
        {loadError ? <div className="status-line" style={{ marginTop: "1rem" }}>{loadError}</div> : null}
      </Section>

      <Section
        title="邀请码管理"
        description="默认一人一码，同一成员可在多设备复用。停用邀请码只会阻止新登录，不会自动踢掉已有会话。"
      >
        <div className="stack-list">
          <ExtensionInviteCreateForm />
          <ExtensionInviteTable invites={invites} />
        </div>
      </Section>

      <Section
        title="使用状态"
        description="按成员名、邀请码或设备名搜索会话，支持查看活跃状态并手动撤销单个会话。"
      >
        <ExtensionSessionTable initialSessions={sessions} />
      </Section>
    </>
  );
}
