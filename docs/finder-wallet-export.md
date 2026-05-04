# Finder 地址回灌对接说明

这版后台已经提供“地址库全量导出”能力，目标不是只给一份平面 CSV，而是给 Finder 一份可以继续增量分析、保留旧历史、再写回新标签的基准数据。

## 现在怎么导出

- 后台地址库页面右上角新增 `导出全库 JSON`
- 下载接口：

```text
GET /api/wallets/export?scope=all&includeDeleted=true
```

- 该接口需要管理员登录态
- 默认导出：
  - 全部地址
  - 已删除地址也会一起导出
  - 当前标签
  - 用户备注
  - 审计历史
  - Watchlist 信息
  - 导入批次信息
  - 当前派生摘要、状态徽标、交易/持仓/告警快照

## 导出结构

顶层结构：

```json
{
  "schemaVersion": "wallet-library-export/v1",
  "source": "smart-money-admin",
  "exportMode": "full",
  "exportedAt": "2026-05-04T00:00:00.000Z",
  "changedSince": null,
  "totalWallets": 123,
  "includeDeleted": true,
  "query": {},
  "mergeHints": {
    "primaryKey": "wallet.normalizedAddress",
    "deletedFlagField": "wallet.deletedAt",
    "walletUpdatedAtField": "wallet.updatedAt",
    "labelIdentityFields": ["kind", "value", "source"],
    "noteIdentityField": "id",
    "auditLogIdentityField": "id"
  },
  "wallets": []
}
```

说明：

- 当前主流程只需要用 `exportMode = full` 的全量导出
- `changedSince` 和 delta 能力已经预留在底层，但你当前这条 Finder 闭环不用依赖它

每条地址记录里主要包含：

- `wallet`
  地址主记录，包含 `id / address / normalizedAddress / displayName / alias / sourceType / updatedAt / deletedAt`
- `labels`
  当前后台有效标签，包含系统标签和人工标签
- `notes`
  真正的备注内容
- `auditLogs`
  操作历史，例如建档、编辑、打标签、删除、Watchlist 变更
- `importBatch`
  该地址最近关联的导入批次
- `summaryText / highlights / statusBadges / sourceMeta`
  后台当前工作台视图里已经整理好的摘要信息
- `metrics / trades / positions / alerts`
  当前项目可提供的分析快照

## Finder 项目怎么接

推荐 Finder 侧按下面规则处理。

### 1. 以标准化地址做主键

- 主键使用 `wallet.normalizedAddress`
- 不要用显示名或 alias 做唯一键
- 同地址重复导入时，应该落到同一条 Finder 记录上

### 2. 先落“主记录”，再落“历史”

建议 Finder 本地结构拆成两层：

- `wallet_profile`
  存地址当前主状态
- `wallet_history`
  存导入快照、旧标签、旧备注、旧审计事件

这样做的好处是：

- 当前展示可以读最新
- 旧标签和旧分析过程不会丢
- 后面重新跑分析时可以对比新旧结果

### 3. 标签不要整批硬覆盖

推荐标签合并键：

```text
kind + value + source
```

合并规则：

- 已存在的同键标签保留，更新时间取新的
- 新增标签直接追加
- 不要因为 Finder 新一轮没命中某个旧标签，就把后台旧标签直接删掉
- 可以给 Finder 新跑出来的标签单独打一个来源，例如 `finder_refresh`

### 4. 备注和审计历史按 ID 追加

- `notes` 用 `id` 去重
- `auditLogs` 用 `id` 去重
- 相同 ID 不重复写入
- 新 ID 直接追加

### 5. 删除状态不要物理删

如果导出里：

- `wallet.deletedAt` 有值

那 Finder 侧建议：

- 标记为 tombstone 或 inactive
- 不要物理删除整条历史

否则后面会把旧标签、旧备注、旧分析轨迹一起丢掉。

### 6. Finder 新分析结果回写建议

Finder 新跑完后，建议分两层回写：

- 更新 `wallet_profile`
  - 最新摘要
  - 最新分析时间
  - 最新状态
- 追加 `wallet_history`
  - 本轮分析原文
  - 本轮新增标签
  - 本轮命中证据

这样才能做到“保留旧历史 + 新结果继续长”。

## 当前最推荐的接入顺序

1. 先消费这份全量导出 JSON
2. 用 `normalizedAddress` 完成 Finder 侧去重建档
3. 把 `labels / notes / auditLogs` 全部落库
4. 再在 Finder 内部跑新一轮分析
5. 把 Finder 新标签作为新来源追加，不要覆盖原有后台标签
6. 再把 Finder 处理后的结果整包同步回后台，按同地址更新

## 后续可以继续补的

这一版已经先解决“全量导出可回灌”。下一步如果要继续顺滑，我建议再补两项：

- Finder 回写后台时的双向同步接口
- `sinceVersion` 或 webhook 级别的更细粒度同步
