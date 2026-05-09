"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";

import { AppLink } from "./AppLink";
import { Metric } from "./Metric";
import { Section } from "./Section";

type RuntimeMode = "cloudflare" | "demo";

interface RuntimeSchemaStatus {
  tables: string[];
  walletColumns: string[];
  missingTables: string[];
  missingWalletColumns: string[];
  datasetVersion: number;
  isReady: boolean;
}

interface RuntimeHealthReport {
  mode: RuntimeMode;
  capturedAt: string;
  appVersion: string;
  access: {
    protected: boolean;
    actorEmail: string | null;
    checkedHeaders: string[];
  };
  bindings: {
    smartMoneyDb: boolean;
    smartMoneyCache: boolean;
    adminBaseUrlConfigured: boolean;
    publicExtensionBaseUrlConfigured: boolean;
    geminiConfigured: boolean;
    groqConfigured: boolean;
    walletAiProviderOrder: string[];
  };
  schema: RuntimeSchemaStatus | null;
  selfChecks: Array<{
    id: string;
    ok: boolean;
    detail: string;
  }>;
}

interface RuntimeBudgetReport {
  mode: RuntimeMode;
  capturedAt: string;
  labelsVersion: number;
  cachePolicy: {
    marketAnnotations: {
      edgeTtlSeconds: number;
      kvTtlSeconds: number;
      staleTtlSeconds: number;
      requestCoalescing: boolean;
    };
    labelsLookup: {
      kvTtlSeconds: number;
      visibleRowsOnly: boolean;
    };
    extensionRefresh: {
      minIntervalMs: number;
      activeTabOnly: boolean;
    };
  };
  approximateDataset: {
    wallets: {
      total: number;
      active: number;
      deleted: number;
      reviewNeeded: number;
      watchlisted: number;
    };
    extension: {
      invites: number;
      sessions: number;
    };
  };
  budgetNotes: string[];
}

interface RuntimeRecoveryReport {
  mode: RuntimeMode;
  capturedAt: string;
  datasetVersion: number;
  timeTravel: {
    available: boolean;
    provider: string;
    note: string;
  };
  logicalExport: {
    configured: boolean;
    lastSuccessfulAt: string | null;
    note: string;
  };
  recentActivity: {
    latestAuditAt: string | null;
    latestImportAt: string | null;
  };
  recoverySop: string[];
}

interface EndpointState<T> {
  data: T | null;
  error: string | null;
}

interface RuntimeSnapshot {
  health: EndpointState<RuntimeHealthReport>;
  budget: EndpointState<RuntimeBudgetReport>;
  recovery: EndpointState<RuntimeRecoveryReport>;
  refreshedAt?: string;
}

type Tone = "healthy" | "warning" | "critical" | "neutral";

const initialSnapshot: RuntimeSnapshot = {
  health: {
    data: null,
    error: null
  },
  budget: {
    data: null,
    error: null
  },
  recovery: {
    data: null,
    error: null
  }
};

const sectionGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
  gap: "1rem"
};

const stackStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "1rem"
};

const statusSurfaceStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "1rem",
  padding: "1.15rem",
  borderRadius: "1.15rem",
  border: "1px solid rgba(214, 221, 233, 0.14)",
  background:
    "radial-gradient(circle at top left, rgba(118, 128, 255, 0.14), transparent 34%), rgba(255, 255, 255, 0.03)"
};

const keyValueRowStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: "1rem",
  padding: "0.7rem 0",
  borderBottom: "1px solid rgba(214, 221, 233, 0.08)"
};

const subtleMetaStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: "0.75rem"
};

const pillToneStyles: Record<Tone, CSSProperties> = {
  healthy: {
    color: "#8ff1c9",
    background: "rgba(56, 196, 131, 0.16)",
    border: "1px solid rgba(56, 196, 131, 0.24)"
  },
  warning: {
    color: "#ffd08a",
    background: "rgba(255, 176, 71, 0.16)",
    border: "1px solid rgba(255, 176, 71, 0.24)"
  },
  critical: {
    color: "#ffae9c",
    background: "rgba(255, 111, 76, 0.16)",
    border: "1px solid rgba(255, 111, 76, 0.24)"
  },
  neutral: {
    color: "#d6e0ee",
    background: "rgba(255, 255, 255, 0.06)",
    border: "1px solid rgba(214, 221, 233, 0.14)"
  }
};

const readRuntimeReport = async <T,>(pathname: string): Promise<T> => {
  const response = await fetch(pathname, {
    cache: "no-store",
    headers: {
      Accept: "application/json"
    }
  });

  const payload = (await response.json().catch(() => null)) as { data?: T; error?: string } | null;
  if (!response.ok) {
    throw new Error(payload?.error ?? `${pathname} returned ${response.status}`);
  }

  if (!payload || !("data" in payload)) {
    throw new Error(`${pathname} returned an invalid payload.`);
  }

  return payload.data as T;
};

const formatDateTime = (value?: string | null) => {
  if (!value) {
    return "未记录";
  }

  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
};

const formatBooleanText = (value: boolean, positive = "已就绪", negative = "未就绪") =>
  value ? positive : negative;

const formatRuntimeMode = (mode?: RuntimeMode) => {
  if (mode === "cloudflare") {
    return "Cloudflare";
  }

  if (mode === "demo") {
    return "Demo";
  }

  return "Unknown";
};

const buildEndpointError = (label: string, error: string | null) => (error ? `${label}: ${error}` : null);

const StatusPill = ({ tone, children }: { tone: Tone; children: React.ReactNode }) => (
  <span
    className="badge"
    style={{
      ...pillToneStyles[tone],
      fontSize: "0.76rem",
      letterSpacing: "0.08em",
      textTransform: "uppercase"
    }}
  >
    {children}
  </span>
);

const SurfaceMeta = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div
    style={{
      padding: "0.8rem 0.9rem",
      borderRadius: "0.95rem",
      background: "rgba(255, 255, 255, 0.03)",
      border: "1px solid rgba(214, 221, 233, 0.08)"
    }}
  >
    <div className="metric-label" style={{ marginBottom: "0.35rem" }}>
      {label}
    </div>
    <div style={{ fontSize: "0.95rem", color: "#f6fbff" }}>{value}</div>
  </div>
);

const KeyValueRow = ({
  label,
  value,
  borderless = false
}: {
  label: string;
  value: React.ReactNode;
  borderless?: boolean;
}) => (
  <div
    style={{
      ...keyValueRowStyle,
      borderBottom: borderless ? "none" : keyValueRowStyle.borderBottom
    }}
  >
    <span className="metric-label" style={{ maxWidth: "18ch" }}>
      {label}
    </span>
    <span style={{ color: "#eef4ff", textAlign: "right", lineHeight: 1.45 }}>{value}</span>
  </div>
);

const InlineActionLink = ({ href, children }: { href: string; children: React.ReactNode }) => (
  <AppLink
    href={href}
    className="secondary-button"
    style={{
      display: "inline-flex",
      alignItems: "center",
      textDecoration: "none"
    }}
  >
    {children}
  </AppLink>
);

export function RuntimeAdminConsole() {
  const [snapshot, setSnapshot] = useState<RuntimeSnapshot>(initialSnapshot);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const mountedRef = useRef(false);
  const requestIdRef = useRef(0);

  const loadReports = async (options?: { silent?: boolean }) => {
    const requestId = ++requestIdRef.current;
    if (!options?.silent) {
      setIsRefreshing(true);
    }

    try {
      const [healthResult, budgetResult, recoveryResult] = await Promise.allSettled([
        readRuntimeReport<RuntimeHealthReport>("/api/admin/runtime/health"),
        readRuntimeReport<RuntimeBudgetReport>("/api/admin/runtime/budget"),
        readRuntimeReport<RuntimeRecoveryReport>("/api/admin/runtime/recovery")
      ]);

      if (!mountedRef.current || requestId !== requestIdRef.current) {
        return;
      }

      setSnapshot((previous) => ({
        health:
          healthResult.status === "fulfilled"
            ? {
                data: healthResult.value,
                error: null
              }
            : {
                data: previous.health.data,
                error: healthResult.reason instanceof Error ? healthResult.reason.message : "health 接口加载失败。"
              },
        budget:
          budgetResult.status === "fulfilled"
            ? {
                data: budgetResult.value,
                error: null
              }
            : {
                data: previous.budget.data,
                error: budgetResult.reason instanceof Error ? budgetResult.reason.message : "budget 接口加载失败。"
              },
        recovery:
          recoveryResult.status === "fulfilled"
            ? {
                data: recoveryResult.value,
                error: null
              }
            : {
                data: previous.recovery.data,
                error:
                  recoveryResult.reason instanceof Error ? recoveryResult.reason.message : "recovery 接口加载失败。"
              },
        refreshedAt: new Date().toISOString()
      }));
      setHasLoadedOnce(true);
    } finally {
      if (mountedRef.current && requestId === requestIdRef.current && !options?.silent) {
        setIsRefreshing(false);
      }
    }
  };

  useEffect(() => {
    mountedRef.current = true;
    void loadReports();

    const intervalId = window.setInterval(() => {
      void loadReports({ silent: true });
    }, 60_000);

    return () => {
      mountedRef.current = false;
      window.clearInterval(intervalId);
    };
  }, []);

  const health = snapshot.health.data;
  const budget = snapshot.budget.data;
  const recovery = snapshot.recovery.data;
  const failingChecks = health?.selfChecks.filter((item) => !item.ok).length ?? 0;
  const labelsVersion = budget?.labelsVersion ?? health?.schema?.datasetVersion ?? recovery?.datasetVersion ?? 0;
  const endpointErrors = [
    buildEndpointError("health", snapshot.health.error),
    buildEndpointError("budget", snapshot.budget.error),
    buildEndpointError("recovery", snapshot.recovery.error)
  ].filter(Boolean) as string[];

  const overallTone: Tone = !health
    ? endpointErrors.length > 0
      ? "critical"
      : "neutral"
    : !health.bindings.smartMoneyDb || !health.schema?.isReady
      ? "critical"
      : failingChecks > 0
        ? "warning"
        : "healthy";

  const overallLabel =
    overallTone === "healthy"
      ? "运行正常"
      : overallTone === "warning"
        ? "需要关注"
        : overallTone === "critical"
          ? "需要修复"
          : "加载中";

  const overviewCopy = health
    ? overallTone === "healthy"
      ? "数据库、缓存、Schema 与访问链路均已就绪，可以把这里当作后台运行时的第一观察面板。"
      : overallTone === "warning"
        ? "核心链路可用，但有检查项未通过，建议优先处理失败项后再继续扩展后台功能。"
        : "当前运行时还没有达到稳定运营状态，先处理数据库绑定、Schema 完整性或访问保护。"
    : hasLoadedOnce
      ? "至少有一个运行时接口未成功返回，页面保留了已经拿到的结果。"
      : "正在从 admin runtime 接口读取状态。";

  return (
    <>
      <Section
        title="后台运行时"
        description="直接读取 runtime health、budget、recovery 三条管理接口，集中查看环境、预算与恢复准备度。"
        action={
          <div style={{ display: "flex", gap: "0.75rem", alignItems: "center", flexWrap: "wrap" }}>
            <span className="eyebrow">60s 自动刷新</span>
            <button type="button" className="secondary-button" onClick={() => void loadReports()} disabled={isRefreshing}>
              {isRefreshing ? "刷新中..." : "立即刷新"}
            </button>
          </div>
        }
      >
        <div style={stackStyle}>
          <div style={statusSurfaceStyle}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
              <div style={{ maxWidth: "70ch" }}>
                <div className="eyebrow">Runtime overview</div>
                <h3 className="inline-title" style={{ fontSize: "1.35rem", marginTop: "0.7rem" }}>
                  {overallLabel}
                </h3>
                <p className="inline-copy">{overviewCopy}</p>
              </div>
              <StatusPill tone={overallTone}>{overallLabel}</StatusPill>
            </div>

            <div className="badge-cluster">
              <StatusPill tone={health?.access.protected ? "healthy" : "warning"}>
                {health?.access.protected ? "Access Protected" : "Access Open"}
              </StatusPill>
              <span className="eyebrow">Mode {formatRuntimeMode(health?.mode ?? budget?.mode ?? recovery?.mode)}</span>
              <span className="eyebrow">Labels v{labelsVersion}</span>
              <span className="eyebrow">最近刷新 {formatDateTime(snapshot.refreshedAt)}</span>
            </div>

            <div style={subtleMetaStyle}>
              <SurfaceMeta label="应用版本" value={health?.appVersion ?? "未返回"} />
              <SurfaceMeta label="调用身份" value={health?.access.actorEmail ?? "未检测到 Access identity"} />
              <SurfaceMeta label="Schema" value={health?.schema?.isReady ? "Ready" : "Pending"} />
              <SurfaceMeta label="最近快照" value={formatDateTime(health?.capturedAt ?? budget?.capturedAt ?? recovery?.capturedAt)} />
            </div>

            <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
              <InlineActionLink href="/extension">查看扩展中心</InlineActionLink>
              <InlineActionLink href="/wallets">查看地址库</InlineActionLink>
            </div>
          </div>

          {endpointErrors.length > 0 ? <div className="status-line">{endpointErrors.join(" | ")}</div> : null}

          <div className="grid">
            <Metric label="失败检查项" value={failingChecks} />
            <Metric label="活跃钱包" value={budget?.approximateDataset.wallets.active ?? 0} />
            <Metric label="观察名单" value={budget?.approximateDataset.wallets.watchlisted ?? 0} />
            <Metric label="扩展会话" value={budget?.approximateDataset.extension.sessions ?? 0} />
            <Metric label="待补充地址" value={budget?.approximateDataset.wallets.reviewNeeded ?? 0} />
            <Metric label="恢复版本" value={recovery?.datasetVersion ?? 0} />
          </div>
        </div>
      </Section>

      <Section
        title="健康链路"
        description="把环境绑定、访问保护、Schema 准备度与自检结果拆开看，优先定位会阻断后台运营的问题。"
        action={<span className="eyebrow">快照 {formatDateTime(health?.capturedAt)}</span>}
      >
        {snapshot.health.error ? <div className="status-line" style={{ marginBottom: "1rem" }}>{snapshot.health.error}</div> : null}
        <div style={sectionGridStyle}>
          <div className="stack-item">
            <div className="section-inline-header">
              <div>
                <h3 className="inline-title">运行自检</h3>
                <p className="inline-copy">失败项越少，后台运行与扩展注入越接近可运营状态。</p>
              </div>
              <StatusPill tone={failingChecks === 0 ? "healthy" : "warning"}>
                {failingChecks === 0 ? "All clear" : `${failingChecks} failed`}
              </StatusPill>
            </div>
            {health?.selfChecks.length ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                {health.selfChecks.map((item) => (
                  <div
                    key={item.id}
                    style={{
                      padding: "0.9rem 1rem",
                      borderRadius: "1rem",
                      border: "1px solid rgba(214, 221, 233, 0.08)",
                      background: "rgba(255, 255, 255, 0.03)"
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: "0.75rem", flexWrap: "wrap" }}>
                      <strong style={{ fontSize: "0.92rem" }}>{item.id}</strong>
                      <StatusPill tone={item.ok ? "healthy" : "warning"}>{item.ok ? "OK" : "Check"}</StatusPill>
                    </div>
                    <p className="inline-copy" style={{ marginTop: "0.55rem" }}>
                      {item.detail}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-state">尚未拿到 health 自检结果。</div>
            )}
          </div>

          <div className="stack-item">
            <div className="section-inline-header">
              <div>
                <h3 className="inline-title">访问与绑定</h3>
                <p className="inline-copy">确认请求入口、存储绑定和 AI Provider 顺序是否完整。</p>
              </div>
              <StatusPill tone={health?.bindings.smartMoneyDb ? "healthy" : "critical"}>
                {health?.bindings.smartMoneyDb ? "DB ready" : "DB missing"}
              </StatusPill>
            </div>
            <div>
              <KeyValueRow
                label="Cloudflare Access"
                value={formatBooleanText(health?.access.protected ?? false, "已保护", "未检测到保护头")}
              />
              <KeyValueRow
                label="SMART_MONEY_DB"
                value={formatBooleanText(health?.bindings.smartMoneyDb ?? false)}
              />
              <KeyValueRow
                label="SMART_MONEY_CACHE"
                value={formatBooleanText(health?.bindings.smartMoneyCache ?? false)}
              />
              <KeyValueRow
                label="ADMIN_BASE_URL"
                value={formatBooleanText(health?.bindings.adminBaseUrlConfigured ?? false, "已配置", "缺失")}
              />
              <KeyValueRow
                label="PUBLIC_EXTENSION_BASE_URL"
                value={formatBooleanText(
                  health?.bindings.publicExtensionBaseUrlConfigured ?? false,
                  "已配置",
                  "缺失"
                )}
              />
              <KeyValueRow
                label="AI Providers"
                value={
                  health?.bindings.walletAiProviderOrder.length
                    ? health.bindings.walletAiProviderOrder.join(" / ")
                    : "未配置 provider 顺序"
                }
                borderless
              />
            </div>
          </div>

          <div className="stack-item">
            <div className="section-inline-header">
              <div>
                <h3 className="inline-title">Schema 准备度</h3>
                <p className="inline-copy">优先关注缺失表、钱包字段和当前 dataset version。</p>
              </div>
              <StatusPill tone={health?.schema?.isReady ? "healthy" : "critical"}>
                {health?.schema?.isReady ? "Ready" : "Pending"}
              </StatusPill>
            </div>
            <div>
              <KeyValueRow label="dataset version" value={health?.schema?.datasetVersion ?? 0} />
              <KeyValueRow
                label="缺失表"
                value={
                  health?.schema?.missingTables.length
                    ? health.schema.missingTables.join(" / ")
                    : "无"
                }
              />
              <KeyValueRow
                label="缺失 wallets 字段"
                value={
                  health?.schema?.missingWalletColumns.length
                    ? health.schema.missingWalletColumns.join(" / ")
                    : "无"
                }
                borderless
              />
            </div>
          </div>
        </div>
      </Section>

      <Section
        title="预算与缓存策略"
        description="把数据量、缓存 TTL 和扩展刷新节奏放在一屏内，方便评估 10k 规模下的后台浏览成本。"
        action={<span className="eyebrow">快照 {formatDateTime(budget?.capturedAt)}</span>}
      >
        {snapshot.budget.error ? <div className="status-line" style={{ marginBottom: "1rem" }}>{snapshot.budget.error}</div> : null}

        <div style={stackStyle}>
          <div className="grid">
            <Metric label="地址总量" value={budget?.approximateDataset.wallets.total ?? 0} />
            <Metric label="有效地址" value={budget?.approximateDataset.wallets.active ?? 0} />
            <Metric label="已删除地址" value={budget?.approximateDataset.wallets.deleted ?? 0} />
            <Metric label="观察名单" value={budget?.approximateDataset.wallets.watchlisted ?? 0} />
            <Metric label="扩展邀请码" value={budget?.approximateDataset.extension.invites ?? 0} />
            <Metric label="Labels Version" value={budget?.labelsVersion ?? 0} />
          </div>

          <div style={sectionGridStyle}>
            <div className="stack-item">
              <div className="section-inline-header">
                <div>
                  <h3 className="inline-title">Market annotations</h3>
                  <p className="inline-copy">主数据接口的边缘缓存与陈旧窗口。</p>
                </div>
                <StatusPill tone={budget?.cachePolicy.marketAnnotations.requestCoalescing ? "healthy" : "warning"}>
                  {budget?.cachePolicy.marketAnnotations.requestCoalescing ? "Coalesced" : "Direct"}
                </StatusPill>
              </div>
              <div>
                <KeyValueRow label="Edge TTL" value={`${budget?.cachePolicy.marketAnnotations.edgeTtlSeconds ?? 0}s`} />
                <KeyValueRow label="KV TTL" value={`${budget?.cachePolicy.marketAnnotations.kvTtlSeconds ?? 0}s`} />
                <KeyValueRow label="Stale TTL" value={`${budget?.cachePolicy.marketAnnotations.staleTtlSeconds ?? 0}s`} borderless />
              </div>
            </div>

            <div className="stack-item">
              <div className="section-inline-header">
                <div>
                  <h3 className="inline-title">Labels lookup</h3>
                  <p className="inline-copy">直查地址标签时的缓存边界和可见行策略。</p>
                </div>
                <StatusPill tone={budget?.cachePolicy.labelsLookup.visibleRowsOnly ? "healthy" : "warning"}>
                  {budget?.cachePolicy.labelsLookup.visibleRowsOnly ? "Visible rows" : "Full table"}
                </StatusPill>
              </div>
              <div>
                <KeyValueRow label="KV TTL" value={`${budget?.cachePolicy.labelsLookup.kvTtlSeconds ?? 0}s`} />
                <KeyValueRow
                  label="Visible rows only"
                  value={formatBooleanText(budget?.cachePolicy.labelsLookup.visibleRowsOnly ?? false, "是", "否")}
                  borderless
                />
              </div>
            </div>

            <div className="stack-item">
              <div className="section-inline-header">
                <div>
                  <h3 className="inline-title">Extension refresh</h3>
                  <p className="inline-copy">限制扩展刷新频率，避免后台与扩展链路同步放大读压。</p>
                </div>
                <StatusPill tone={budget?.cachePolicy.extensionRefresh.activeTabOnly ? "healthy" : "warning"}>
                  {budget?.cachePolicy.extensionRefresh.activeTabOnly ? "Active tab" : "All tabs"}
                </StatusPill>
              </div>
              <div>
                <KeyValueRow
                  label="Min interval"
                  value={`${Math.round((budget?.cachePolicy.extensionRefresh.minIntervalMs ?? 0) / 1000)}s`}
                />
                <KeyValueRow
                  label="Active tab only"
                  value={formatBooleanText(budget?.cachePolicy.extensionRefresh.activeTabOnly ?? false, "是", "否")}
                  borderless
                />
              </div>
            </div>
          </div>

          <div className="stack-item">
            <div className="section-inline-header">
              <div>
                <h3 className="inline-title">预算注记</h3>
                <p className="inline-copy">这些是当前后台与扩展联合运行时的预算约束。</p>
              </div>
            </div>
            {budget?.budgetNotes.length ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                {budget.budgetNotes.map((note) => (
                  <div key={note} className="stack-item" style={{ padding: "0.9rem 1rem" }}>
                    <div className="metric-inline">{note}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-state">尚未拿到预算注记。</div>
            )}
          </div>
        </div>
      </Section>

      <Section
        title="恢复准备"
        description="把 Time Travel、逻辑导出和最近后台操作时间集中展示，便于判断回滚路径是否清晰。"
        action={<span className="eyebrow">快照 {formatDateTime(recovery?.capturedAt)}</span>}
      >
        {snapshot.recovery.error ? (
          <div className="status-line" style={{ marginBottom: "1rem" }}>
            {snapshot.recovery.error}
          </div>
        ) : null}

        <div style={stackStyle}>
          <div style={sectionGridStyle}>
            <div className="stack-item">
              <div className="section-inline-header">
                <div>
                  <h3 className="inline-title">Time Travel</h3>
                  <p className="inline-copy">最近窗口内优先走 D1 Time Travel，而不是先做逻辑恢复。</p>
                </div>
                <StatusPill tone={recovery?.timeTravel.available ? "healthy" : "critical"}>
                  {recovery?.timeTravel.available ? "Available" : "Unavailable"}
                </StatusPill>
              </div>
              <div>
                <KeyValueRow label="Provider" value={recovery?.timeTravel.provider ?? "未返回"} />
                <KeyValueRow label="说明" value={recovery?.timeTravel.note ?? "未返回"} borderless />
              </div>
            </div>

            <div className="stack-item">
              <div className="section-inline-header">
                <div>
                  <h3 className="inline-title">逻辑导出</h3>
                  <p className="inline-copy">如果 Time Travel 不够，需要确认逻辑快照是否真正可用。</p>
                </div>
                <StatusPill tone={recovery?.logicalExport.configured ? "healthy" : "warning"}>
                  {recovery?.logicalExport.configured ? "Configured" : "Manual"}
                </StatusPill>
              </div>
              <div>
                <KeyValueRow
                  label="当前状态"
                  value={formatBooleanText(recovery?.logicalExport.configured ?? false, "已配置", "未接自动化")}
                />
                <KeyValueRow label="最近成功" value={formatDateTime(recovery?.logicalExport.lastSuccessfulAt)} />
                <KeyValueRow label="说明" value={recovery?.logicalExport.note ?? "未返回"} borderless />
              </div>
            </div>

            <div className="stack-item">
              <div className="section-inline-header">
                <div>
                  <h3 className="inline-title">最近后台活动</h3>
                  <p className="inline-copy">确认最近导入和审计记录，帮助缩小回滚影响范围。</p>
                </div>
                <StatusPill tone={recovery?.recentActivity.latestAuditAt ? "healthy" : "warning"}>
                  {recovery?.recentActivity.latestAuditAt ? "Tracked" : "Missing"}
                </StatusPill>
              </div>
              <div>
                <KeyValueRow label="最近审计" value={formatDateTime(recovery?.recentActivity.latestAuditAt)} />
                <KeyValueRow label="最近导入" value={formatDateTime(recovery?.recentActivity.latestImportAt)} />
                <KeyValueRow label="dataset version" value={recovery?.datasetVersion ?? 0} borderless />
              </div>
            </div>
          </div>

          <div className="stack-item">
            <div className="section-inline-header">
              <div>
                <h3 className="inline-title">恢复顺序</h3>
                <p className="inline-copy">把恢复 SOP 明确写在页面上，避免事故现场重新拼流程。</p>
              </div>
            </div>
            {recovery?.recoverySop.length ? (
              <ol
                style={{
                  margin: 0,
                  paddingLeft: "1.2rem",
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.8rem",
                  color: "var(--text-soft)"
                }}
              >
                {recovery.recoverySop.map((step) => (
                  <li key={step} style={{ lineHeight: 1.6 }}>
                    {step}
                  </li>
                ))}
              </ol>
            ) : (
              <div className="empty-state">尚未拿到恢复 SOP。</div>
            )}
          </div>
        </div>
      </Section>
    </>
  );
}
