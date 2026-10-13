# Finder 侧 AI 深度解读需求文档

## 1. 这次要解决什么

我们决定把“AI 归纳解读 / AI 深度解读”的主要生成工作前移到 Finder 侧，而不是继续放在 Smart Money 扩展或页面侧临时生成。

原因很直接：

- Finder 在爬取和分析地址时，天然能拿到更多原始数据、证据、交易样本和上下文
- Smart Money 当前更适合做展示、筛选、回写、审计和人工复核
- 如果每次在扩展里临时再跑一次 AI，会浪费 token，也会让体验变慢、不稳定
- 真正高质量的地址解读，前提不是“模型更会写”，而是“喂给模型的数据更完整”

一句话决策：

**Finder 负责发现、采集、结构化和生成 AI 解读；Smart Money 负责接收、展示、归档、人工裁决和历史留存。**

---

## 2. 目标

本次需求的目标不是产出一篇长报告，而是让 Finder 为每个命中标签的钱包，产出一份可同步到 Smart Money 的“结论包”。

这个结论包至少要包含：

- 一句策略焦点总结
- 一段给用户看的 AI 归纳解读
- 一组结构化标签
- 一组关键指标
- 一段证据摘录
- 置信度 / 是否需要复核

用户真正想从这段 AI 解读里看到的是三件事：

1. 这个地址更像什么类型的钱包
2. 为什么会得出这个判断
3. 现在值不值得继续关注，或者哪里需要谨慎

---

## 3. 核心原则

### 3.1 规则定标签，AI 只写解释

Finder 侧最稳妥的方案不是“让模型重新判断标签”，而是：

- 先由规则层、统计层、结构化解析层产出最终标签
- 再由 DeepSeek 把这些已有事实翻译成用户能看懂的说明

也就是说：

- `AI 标签` 是真相层
- `AI 归纳解读` 是翻译层

AI 不负责发明标签，不负责替代规则，不负责拍脑袋补结论。

### 3.2 Finder 输出素材和结论包，Smart Money 输出最终展示

职责边界明确如下：

#### 放在 Finder 的工作

- 候选钱包发现
- 原始证据采集
- 标签命中判定
- 结构化指标计算
- DeepSeek 生成 AI 归纳解读
- 输出可同步的结果包

#### 留在 Smart Money 的工作

- 地址主档归一化
- 按 `normalizedAddress` 做 upsert
- 人工标签和人工备注保护
- 审计日志、导入批次、软删除、watchlist 留痕
- 后台列表 / hover / 地址详情展示
- 人工复核和最终口径裁决

### 3.3 Smart Money 不应该承载完整长文研究报告

Smart Money 侧最终更适合展示：

- `strategyFocus`
- AI 标签
- AI 归纳解读
- 关键指标
- 证据摘录

完整长文、全量分析原文、细颗粒度过程记录，应优先留在 Finder 内部。

---

## 4. Finder 侧需要补采和保留哪些数据

如果想让 DeepSeek 真正解读得更深入，Finder 不能只保留标签和少量 key metrics，必须把“为什么命中这些标签”的材料也留下来。

下面按优先级分层。

### 4.1 必须有

#### 1. 地址级原始证据块

用途：给 AI 提供可回溯、可引用的 grounding。

建议字段：

- `normalizedAddress`
- `runId`
- `sourceType`
- `sourceDocId` / `sourceUrl`
- `sourceExcerpt`
- `fullRawText`
- `evidenceSpans`
- `language`
- `capturedAt`

#### 2. 标签命中明细，而不是只有最终标签

用途：让 AI 解释“为什么这个钱包被判成这种风格”，而不是只会复读标签名。

建议字段：

- `labelKey`
- `matched`
- `displayName`
- `reason`
- `details`
- `numericEvidence`
- `sampleSize`
- `lookbackWindow`
- `exampleMarkets[]`
- `confidence`

#### 3. 天气专项结构化 taxonomy

用途：这是 Polymarket 天气钱包解读的核心骨架。

建议字段：

- `marketScope`
- `resolutionSource`
- `forecastBasis`
- `timingWindow`
- `edgeStyle`
- `weatherDrivers[]`
- `evidenceQuality`

#### 4. 钱包-市场-交易样本明细

用途：让 AI 看出这个钱包到底是早进场、近收盘重定价、追高、反手快，还是只做某些城市 / 某些天气驱动。

建议字段：

- `marketSlug`
- `conditionId`
- `eventSlug`
- `marketTitle`
- `city`
- `weatherType`
- `side`
- `sizeUsd`
- `entryPrice`
- `exitPrice` / `currentPrice`
- `enteredAt`
- `exitedAt`
- `minutesToCloseAtEntry`
- `minutesToPeakVolume`
- `priceVs1hAvg`
- `realizedPnlUsd`
- `outcome`

#### 5. 持仓时间序列

用途：让 AI 看到“建仓-加仓-减仓-翻向”的轨迹，而不是只看一个时点快照。

建议字段：

- `capturedAt`
- `marketId`
- `side`
- `exposureUsd`
- `avgEntryPrice`
- `unrealizedPnlUsd`
- `deltaExposureUsd`
- `positionLifecycleState`

#### 6. 市场上下文元数据

用途：把钱包行为放回天气市场的具体语境里，避免泛化。

建议字段：

- `marketTitle`
- `location` / `city`
- `category`
- `resolutionSource`
- `openAt`
- `closeAt`
- `status`
- `outcomes[]`
- `peakVolumeAt`
- `marketLiquidity`
- `marketVolume`

#### 7. 样本期与统计口径

用途：让 AI 知道它看到的是短期现象还是长期稳定习惯。

建议字段：

- `lookbackDays`
- `tradeCount`
- `weatherTradeCount`
- `settledTradeCount`
- `sampleCoverage`
- `computedAt`

### 4.2 强烈建议

#### 1. 分布统计

用途：更适合钱包画像，也更稳。

建议字段：

- `cityDistribution`
- `resolutionSourceDistribution`
- `timingWindowDistribution`
- `edgeStyleDistribution`
- `driverDistribution`

#### 2. 负样本与未命中信息

用途：让 AI 不只会说“看到了什么”，也会说“还缺什么、哪里证据弱”。

建议字段：

- `missingFields[]`
- `unknownDimensions[]`
- `labelRejectedReasons[]`
- `evidenceWeakPoints[]`

#### 3. 预警触发前后行为片段

用途：把预警做成更像研究笔记的说明。

建议字段：

- `alertType`
- `triggeredAt`
- `preAlertTrades[]`
- `postAlertTrades[]`
- `baselineMetric`
- `deviationMetric`

#### 4. 标签 / 摘要版本历史

用途：让 AI 能识别“这个钱包最近风格变了”。

建议字段：

- `analysisVersion`
- `previousLabels[]`
- `previousSummary`
- `diffFlags[]`
- `changedAt`

#### 5. 人工复核与 watchlist 理由

用途：把团队经验纳入 AI 解读，而不是只依赖机器标签。

建议字段：

- `watchlisted`
- `watchReason`
- `reviewStatus`
- `reviewActor`
- `verificationNote`
- `sourceNote`

#### 6. 导入批次 / 来源链路信息

用途：帮助判断结论的新鲜度和可靠性。

建议字段：

- `importBatchId`
- `sourceName`
- `provider`
- `model`
- `fallbackUsed`
- `pulledAt`
- `lastImportedAt`

### 4.3 可选增强

#### 1. 外部天气证据快照

建议字段：

- `obsTemp`
- `forecastTemp`
- `ensembleSpread`
- `cloudCover`
- `precipTiming`
- `dewpoint`
- `windShift`
- `sourceAgencyTimestamp`

#### 2. 市场微观结构

建议字段：

- `bidAskSpread`
- `slippageEstimate`
- `volumeBurst`
- `holderConcentration`
- `topHolderChange`

#### 3. 共现 / 跟单网络

建议字段：

- `coTradeWallets[]`
- `sameMarketOverlapRate`
- `leadLagMinutes`
- `contrarianPairs[]`

#### 4. 原始截图 / HTML 片段 / prompt-output 对照

建议字段：

- `screenshotRef`
- `htmlFragmentRef`
- `promptVersion`
- `rawModelOutput`
- `postProcessedOutput`

---

## 5. DeepSeek 在 Finder 侧怎么用

本次明确使用：

- `provider = deepseek`
- `model = deepseek-v4-flash`

### 5.1 生成时机

不建议把深度解读放到 Smart Money 页面打开时再现算。

建议改成下面两档：

#### 批量短解读

在 Finder 一次 run 结束后，对通过最低证据门槛的钱包批量生成。

#### 按需深解读

只在以下场景生成：

- 进入 Top N
- 被建议加入 watchlist
- 用户打开 Finder 内部详情
- 准备同步回 Smart Money

### 5.2 生成门槛

至少满足下面条件之一才生成 AI 归纳解读：

- 有 `normalizedAddress`
- 至少 2 条结构化证据
- 或者 1 条强证据 + `sourceExcerpt`

没有达到门槛时：

- 只保留结构化字段
- 不强行生成“看起来很像那么回事”的 AI 文案

### 5.3 输入分层

建议 DeepSeek 输入按下面四层组织：

#### L0 身份层

- `normalizedAddress`
- `sourceName`
- `runId`
- `updatedAt`
- `version`

#### L1 权威事实层

- 人工标签
- 人工备注
- `watchlisted`
- `reviewStatus`

#### L2 Finder 结构层

- `primarySignals`
- `labels`
- `keyMetrics`
- `sourceExcerpt`
- `strategyFocusCandidate`

#### L3 文本补充层

- 最新 note
- `teamNote`
- 必要的 `bio`

注意：

- 输入应为紧凑 JSON
- 不要先拼长报告，再拿长报告去让 AI 二次总结
- 输入优先级必须是 `L1 > L2 > L3`

### 5.4 输出要求

AI 解读不是长文报告，建议分两档：

#### `brief`

- 80 到 120 字
- 用于 Smart Money 列表、hover、轻量展示

#### `deep`

- 180 到 280 字
- 用于 Finder 内部详情页或重点钱包

### 5.5 文案要求

AI 解读要回答三件事：

1. 这个钱包更像什么
2. 为什么这么判断
3. 当前要留意什么

同时必须避免：

- 空泛吹捧
- 无证据预测
- 和标签完全重复的同义改写
- 模型思维过程
- 投资建议口吻

### 5.6 防幻觉要求

- 模型只写解释，不产最终标签
- 标签由 Finder 规则层产出
- 模型最多返回：
  - `evidenceLevel`
  - `hasConflict`
  - `needsReview`

如出现信号冲突：

- 直接说明“信号有分歧，需复核”
- 不允许强行统一口径

### 5.7 成本控制

- 单钱包输入先裁剪，再送模型
- 最多保留 4 个官方 / 人工标签
- 最多保留 5 个 AI 标签
- 最多保留 6 到 8 条关键指标
- 只带 1 段最关键的 `sourceExcerpt`
- 同样输入哈希绝不重算

### 5.8 缓存和重算

建议缓存键：

`address + inputHash + promptVersion + model + outputSchemaVersion`

建议保留：

- 成功缓存长 TTL
- 失败缓存短 TTL

建议触发重算的条件：

- `runId` 变化
- `sourceExcerpt` 变化
- `labels` 变化
- `primarySignals` 变化
- `keyMetrics` 变化
- 人工标签或人工备注变化
- `promptVersion` 变化
- `model` 变化

---

## 6. Finder 最终应该产出什么结果包

Finder 侧最终产出的不是一段孤立文案，而是一份“可回传、可展示、可复核、可缓存”的结果包。

建议结构如下：

```json
{
  "sourceName": "finder",
  "runId": "2026-05-04-weather-001",
  "normalizedAddress": "0x...",
  "wallet": {
    "address": "0x...",
    "displayName": "Weather-Central",
    "alias": "Weather-Central"
  },
  "matched": true,
  "strategyFocus": "偏向在天气温度市场里做有明确时间窗口的提前埋伏。",
  "aiBriefNote": "更像是有固定天气交易框架的钱包，判断主要来自其在特定城市和时间窗口上的重复下注行为。",
  "aiDeepNote": "这个地址更像在天气温度市场中围绕固定城市和固定时间窗口做重复交易的选手。其优势不在广撒网，而在对少数市场和少数天气驱动的持续跟踪，当前更值得关注的是它是否仍然保持同样的节奏与命中来源。",
  "evidenceLevel": "medium",
  "hasConflict": false,
  "needsReview": false,
  "labels": [
    {
      "kind": "timing_window",
      "value": "D1",
      "source": "finder_ai",
      "evidence": "..."
    }
  ],
  "primarySignals": [],
  "keyMetrics": [],
  "sourceExcerpt": "Uses NWS/NOAA obs, watches D1 ensemble spread...",
  "weatherSignals": {
    "marketScope": "single_city_max_temp",
    "resolutionSource": "nws_noaa",
    "forecastBasis": "ensemble_guidance",
    "timingWindow": "d1",
    "edgeStyle": "upper_tail",
    "weatherDrivers": ["cloud_cover"],
    "evidenceQuality": "source_named"
  },
  "providerMeta": {
    "provider": "deepseek",
    "model": "deepseek-v4-flash",
    "promptVersion": "finder-weather-narrative-v1",
    "generatedAt": "2026-05-04T12:00:00.000Z",
    "inputHash": "sha256:...",
    "generationScope": "brief"
  }
}
```

---

## 7. Finder 回写到 Smart Money 时的同步规则

### 7.1 地址去重

必须统一用：

- `wallet.normalizedAddress`

不能用：

- `displayName`
- `alias`
- 用户名
- 页面昵称

### 7.2 标签去重

标签合同层统一使用：

- `kind + value + source`

### 7.3 历史处理

必须遵守：

- `notes` 按 `id` 去重追加
- `auditLogs` 按 `id` 去重追加
- `deletedAt` 只作为 tombstone，不物理删库

### 7.4 不覆盖人工字段

Finder 回写只能作为新的来源层，不能覆盖：

- 人工标签
- 人工备注
- 人工 watchlist 判断

### 7.5 只同步命中标签的钱包

本轮与 Finder 的协作目标仍然保持：

- **只同步命中标签的钱包**

不要把未命中、空分析、无证据的钱包也批量灌进 Smart Money。

---

## 8. Smart Money 侧最终建议保留哪些展示字段

为了让展示克制、清晰，Smart Money 侧最终保留这些就够了：

- `address`
- `normalizedAddress`
- `displayName`
- `alias`
- `strategyFocus`
- `AI 短标签`
- `AI 归纳解读`
- `keyMetrics`
- `sourceExcerpt`
- `signalQuality`
- `updatedAt`
- `sourceMeta`

完整长文、全量分析原文、prompt 原文、原始截图等，不建议塞进主界面。

---

## 9. 一期最小落地版本

如果想先做一个真正能跑、又不过度复杂的一期，我建议只要求 Finder 团队先做到下面这些：

### 必做

1. 只处理命中标签的钱包
2. 增加原始证据块保留
3. 增加标签命中明细保留
4. 增加天气专项 `weatherSignals`
5. 增加近 N 笔天气交易样本
6. 用 `deepseek-v4-flash` 生成 `aiBriefNote`
7. 回传 `strategyFocus + aiBriefNote + labels + sourceExcerpt + providerMeta`
8. 用 `normalizedAddress` 做 upsert，同地址只更新，不重复新增

### 可以放到二期

1. `aiDeepNote`
2. 持仓时间序列的更深分析
3. 标签版本变化对比
4. 外部天气证据快照
5. 共现 / 跟单网络

---

## 10. 这次需求明确不做什么

- 不让 Smart Money 扩展每次 hover 都重新跑一次 AI
- 不让模型自由发明最终标签
- 不把 Finder 内部长报告原样搬进 Smart Money hover
- 不覆盖后台已有人工标签和人工备注
- 不把未命中标签的钱包批量导入

---

## 11. 给 Finder 团队的明确要求

可以直接把下面这几条发给 Finder 团队：

1. 这次的 AI 深度解读要迁到 Finder 侧做，Smart Money 侧只做展示和同步接收。
2. DeepSeek 使用 `deepseek-v4-flash`。
3. 先做结构化标签和证据，再做 AI 文案，不允许让模型直接决定最终标签。
4. 只处理命中标签的钱包。
5. 回传时必须带稳定的 `runId`、`sourceName`、`inputHash`、`promptVersion`、`generatedAt`。
6. 地址主键必须用 `normalizedAddress`。
7. 标签合并必须按 `kind + value + source`。
8. 历史记录只追加不硬删。
9. 不要覆盖人工标签和人工备注。
10. 一期先把 `brief` 做稳，不着急上长篇深解读。

---

## 12. 四位专家的共识总结

这次四个视角最后收敛出来的共识很一致：

- 产品视角认为，用户最需要的是“为什么值得看”，不是长文故事
- 数据视角认为，真正缺的不是模型，而是原始证据、标签命中明细、交易样本、天气专项结构化字段
- AI 视角认为，最稳妥的方案是“规则定标签，AI 写解释”
- 系统集成视角认为，最合理的边界是“Finder 负责发现与供料，Smart Money 负责归一化、入库、裁决与留痕”

所以这次迁移的本质不是“把模型换个地方调用”，而是把整个 AI 解读流程放到更合适的数据源头去做。
