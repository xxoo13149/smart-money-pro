import { notFound } from "next/navigation";

import { AlertRow } from "../../../components/AlertRow";
import { Metric } from "../../../components/Metric";
import { Section } from "../../../components/Section";
import { WalletDeleteButton } from "../../../components/WalletDeleteButton";
import { WalletEditForm } from "../../../components/WalletEditForm";
import { WalletQuickActions } from "../../../components/WalletQuickActions";
import { requireAdminPageSession } from "../../../lib/admin-auth";
import { getWalletById } from "../../../lib/data";

export const dynamic = "force-dynamic";

const EmptyState = ({ text }: { text: string }) => <div className="empty-state">{text}</div>;

const formatDate = (value: string | undefined) => {
  if (!value) {
    return "--";
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("zh-CN", { hour12: false });
};

export default async function WalletDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireAdminPageSession(`/wallets/${id}`);
  const data = await getWalletById(id);
  if (!data) {
    notFound();
  }

  const { wallet, metrics, labels, trades, alerts, notes, positions, watchlistEntry, finderAi } = data;
  const finderAiMeta = [
    finderAi?.providerMeta?.model,
    finderAi?.providerMeta?.promptVersion,
    finderAi?.evidenceLevel
  ].filter(Boolean).join(" / ");

  return (
    <>
      <Section
        title={wallet.alias ?? wallet.displayName}
        description={
          wallet.strategyFocus || wallet.bio || "这个地址已经录入地址库，可以继续补充资料、标签和记录。"
        }
        action={
          <div className="badge-cluster">
            <span className="action-pill">{watchlistEntry ? "关注列表" : "普通地址"}</span>
            {wallet.deletedAt ? (
              <span className="extension-status-pill" data-tone="error">
                已删除
              </span>
            ) : null}
          </div>
        }
      >
        <div className="identity-grid">
          <div>
            <div className="identity-address">{wallet.address}</div>
            <p className="identity-copy">{wallet.bio || "暂无详细背景"}</p>
          </div>
          <div className="detail-kv-list">
            <div className="detail-kv">
              <span>首次发现</span>
              <strong>{formatDate(wallet.firstSeenAt)}</strong>
            </div>
            <div className="detail-kv">
              <span>创建时间</span>
              <strong>{formatDate(wallet.createdAt)}</strong>
            </div>
            <div className="detail-kv">
              <span>更新时间</span>
              <strong>{formatDate(wallet.updatedAt)}</strong>
            </div>
            <div className="detail-kv">
              <span>删除时间</span>
              <strong>{wallet.deletedAt ? formatDate(wallet.deletedAt) : "未删除"}</strong>
            </div>
          </div>
        </div>
      </Section>

      {finderAi ? (
        <Section
          title="Finder AI v6"
          description="Finder 同步过来的深度分析会原样保留在这里，扩展页内标注也会优先读取这组摘要。"
          action={
            <div className="badge-cluster">
              <span className="action-pill">{finderAi.needsReview ? "需复核" : "已同步"}</span>
              {finderAi.hasConflict ? <span className="eyebrow">有冲突</span> : null}
              {finderAiMeta ? <span className="eyebrow">{finderAiMeta}</span> : null}
            </div>
          }
        >
          <div className="stack-list">
            <div className="stack-item">
              <div className="subtle-row">
                <span>结论 / 策略结论</span>
                <span>{formatDate(finderAi.updatedAt)}</span>
              </div>
              <div className="metric-inline">{finderAi.aiBriefShort || finderAi.strategyFocus || "待补充"}</div>
            </div>

            {finderAi.aiBriefNote ? (
              <div className="stack-item">
                <div className="subtle-row">
                  <span>摘要说明</span>
                </div>
                <p>{finderAi.aiBriefNote}</p>
              </div>
            ) : null}

            {finderAi.aiDeepNote ? (
              <div className="stack-item">
                <div className="subtle-row">
                  <span>深度解读</span>
                </div>
                <p>{finderAi.aiDeepNote}</p>
              </div>
            ) : null}

            <div className="detail-grid">
              {finderAi.keyMetrics?.length ? (
                <div className="stack-item">
                  <h3 className="inline-title">关键指标</h3>
                  <div className="badge-cluster">
                    {finderAi.keyMetrics.map((metric, index) => (
                      <span key={`${metric.key ?? metric.label}-${index}`} className="badge">
                        {metric.label}: {String(metric.value ?? "--")}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}

              {finderAi.labels?.length ? (
                <div className="stack-item">
                  <h3 className="inline-title">同步标签</h3>
                  <div className="badge-cluster">
                    {finderAi.labels.map((label, index) => (
                      <span key={`${label.kind ?? "label"}-${label.value}-${index}`} className="badge">
                        {label.kind ? `${label.kind}: ` : ""}
                        {label.value}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>

            {finderAi.primarySignals?.length ? (
              <div className="stack-item">
                <h3 className="inline-title">命中信号</h3>
                <div className="stack-list">
                  {finderAi.primarySignals.map((signal, index) => (
                    <div key={`${signal.key ?? signal.label}-${index}`} className="stack-item">
                      <div className="subtle-row">
                        <span>{signal.label}</span>
                        <span>{signal.matched === false ? "未命中" : "命中"}</span>
                      </div>
                      {signal.reason ? <p>{signal.reason}</p> : null}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {finderAi.sourceExcerpt ? (
              <div className="stack-item">
                <div className="subtle-row">
                  <span>来源摘录</span>
                  <span>{finderAi.runId || "未记录 Run ID"}</span>
                </div>
                <p>{finderAi.sourceExcerpt}</p>
              </div>
            ) : null}
          </div>
        </Section>
      ) : null}

      <Section
        title="资料"
        description="这里维护地址的核心资料。保存后会直接影响扩展页内标注、搜索结果和详情摘要。"
      >
        <WalletEditForm wallet={wallet} />
      </Section>

      <Section
        title="标签"
        description="管理自定义标签和 Watchlist。这里优先放短标签，便于扩展侧快速展示。"
      >
        <div className="stack-list">
          <div className="badge-cluster">
            {labels.length > 0 ? (
              labels.map((label) => (
                <span key={label.id} className="badge">
                  {label.value || label.name}
                </span>
              ))
            ) : (
              <span className="eyebrow">暂无标签</span>
            )}
          </div>
          <WalletQuickActions walletId={wallet.id} sections={["tags", "watchlist"]} />
        </div>
      </Section>

      <Section
        title="记录"
        description="备注、标签写入和删除动作都会进入审计流，方便后续按时间清理或回溯。"
      >
        <div className="stack-list">
          <WalletQuickActions walletId={wallet.id} sections={["notes"]} />
          <div className="stack-list">
            {notes.length > 0 ? (
              notes.map((note) => (
                <div key={note.id} className="stack-item">
                  <div className="subtle-row">
                    <span>{note.action}</span>
                    <span>{note.actor}</span>
                  </div>
                  <div className="metric-inline">{note.content}</div>
                  <p>{formatDate(note.createdAt)}</p>
                </div>
              ))
            ) : (
              <EmptyState text="还没有记录。新增备注、标签或删除动作后会出现在这里。" />
            )}
          </div>
          <WalletDeleteButton walletId={wallet.id} disabled={Boolean(wallet.deletedAt)} />
        </div>
      </Section>

      <Section
        title="分析"
        description="分析模块继续保留，但降级为附属区块，不干扰地址库维护主流程。"
      >
        <div className="stack-list">
          <div className="grid">
            <Metric label="胜率" value={metrics.weatherWinRate} suffix="%" />
            <Metric label="平均提前" value={metrics.averageEntryLeadMinutes} suffix="m" />
            <Metric label="风险收益比" value={metrics.avgRiskReward} />
            <Metric label="总 PnL" value={metrics.totalRealizedPnlUsd} suffix="USD" />
            <Metric label="市场占比" value={metrics.weatherTradeShare} suffix="%" />
            <Metric label="稳定度" value={metrics.stableCurveScore} />
          </div>

          <div className="detail-grid">
            <div className="stack-list">
              <h3 className="inline-title">持仓</h3>
              {positions.length > 0 ? (
                positions.map((position) => (
                  <div key={position.id} className="stack-item">
                    <div className="subtle-row">
                      <span>{position.marketId}</span>
                      <span>{position.side.toUpperCase()}</span>
                    </div>
                    <div className="metric-inline">敞口 {position.exposureUsd} USD</div>
                    <p>
                      均价 {position.avgEntryPrice} / 浮盈亏 {position.unrealizedPnlUsd} USD
                    </p>
                  </div>
                ))
              ) : (
                <EmptyState text="这个地址目前没有接入真实持仓快照，先显示空态。" />
              )}
            </div>

            <div className="stack-list">
              <h3 className="inline-title">交易</h3>
              {trades.length > 0 ? (
                trades.slice(0, 6).map((trade) => (
                  <div key={trade.id} className="stack-item">
                    <div className="subtle-row">
                      <span>{trade.marketId}</span>
                      <span>{trade.side.toUpperCase()}</span>
                    </div>
                    <div className="metric-inline">价格 {trade.price} / 成交 {trade.sizeUsd} USD</div>
                    <p>
                      {trade.outcome === "pending" ? "未结算" : trade.outcome} / 入场 {formatDate(trade.enteredAt)}
                    </p>
                  </div>
                ))
              ) : (
                <EmptyState text="新录入地址默认没有 demo trades，后续接入真实分析流水后会自动补齐。" />
              )}
            </div>
          </div>

          <div className="stack-list">
            <h3 className="inline-title">预警</h3>
            {alerts.length > 0 ? (
              alerts.map((alertItem) => (
                <div key={alertItem.alert.id} className="stack-item">
                  <div className="subtle-row">
                    <span>{alertItem.market?.title ?? alertItem.alert.marketId}</span>
                    <span>{alertItem.eventLabel}</span>
                  </div>
                  <AlertRow alert={alertItem.alert} />
                </div>
              ))
            ) : (
              <EmptyState text="这个地址目前没有 demo 预警。" />
            )}
          </div>
        </div>
      </Section>
    </>
  );
}
