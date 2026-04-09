# 天气专项 AI 导入实现规范

## 1. 目标与范围

本规范只适用于 `Polymarket 天气 / 最高温度` 场景下的地址导入。

本规范的唯一目标是：

- 让 AI 导入结果优先服务交易判断。
- 让扩展页内标注、后台列表和 AI 预览只展示高价值天气交易信息。
- 让人物背景、团队备注和长文本资料下沉到详情层，不污染主展示。

本规范 **MUST NOT** 被复用于非天气市场。后续扩展到其他赛道时，必须单独维护新的 taxonomy 和 prompt。

## 2. 产品原则

本轮实现 **MUST** 遵守以下原则：

- `交易决策优先`
- `高精度保守`
- `天气专项优先`
- `只用输入材料作为证据`
- `双层展示模型`

双层展示模型定义如下：

- Layer 1：扩展主标注、后台列表、AI 预览主卡片
  - 只显示一句话交易摘要
  - 只显示严格的天气交易标签
- Layer 2：地址详情页、`bio`、`teamNote`、审计记录
  - 保留人物背景
  - 保留团队备注
  - 保留长摘要与原文证据

## 3. 天气专项 Taxonomy

### 3.1 枚举维度

AI 预览与 commit 归一化 **MUST** 使用以下结构：

- `marketScope`
  - `single_city_max_temp`
  - `multi_city_temp`
  - `mixed_weather`
  - `unknown`
- `resolutionSource`
  - `nws_noaa`
  - `jma`
  - `kma`
  - `dwd`
  - `official_other`
  - `unknown`
- `forecastBasis`
  - `ensemble_guidance`
  - `official_grid`
  - `nowcast`
  - `station_observation`
  - `narrative_only`
  - `unknown`
- `timingWindow`
  - `d2_plus`
  - `d1`
  - `intraday`
  - `near_close`
  - `unknown`
- `edgeStyle`
  - `upper_tail`
  - `baseline_mean`
  - `range_threshold`
  - `late_reprice`
  - `obs_reaction`
  - `unknown`
- `weatherDrivers[]`
  - `cloud_cover`
  - `precip_timing`
  - `wind_shift`
  - `humidity_dewpoint`
  - `ridge_heat_dome`
  - `front_passage`
  - `urban_heat`
  - `storm_outflow`
  - `unknown`
- `evidenceQuality`
  - `explicit_numeric`
  - `source_named`
  - `qualitative_only`
  - `insufficient`

### 3.2 主展示高价值标签

Layer 1 **MUST** 只从以下维度生成短标签：

- `resolutionSource`
- `forecastBasis`
- `timingWindow`
- `edgeStyle`
- `weatherDrivers`

其中：

- `weatherDrivers` 最多保留 2 个。
- `marketScope` 和 `signalQuality` 可以写入数据层，但 **MUST NOT** 作为主展示标签优先显示。

## 4. Prompt 规则

AI 系统提示词 **MUST** 固定包含以下 5 段：

1. 角色
   - 你是 Polymarket 天气温度交易地址结构化助手。
2. 目标
   - 只提取会影响天气温度市场交易判断的信息。
3. 允许信息
   - 结算来源/站点
   - 预测依据
   - 时间窗口
   - 下注边
   - 天气驱动
   - 原文证据
4. 禁止信息
   - 编造
   - 联网补充
   - 空泛人格标签
   - 泛化地域词
   - 无证据的“聪明/高频/稳健/激进”
5. 输出要求
   - 只返回 JSON
   - 字段短、稳定、适合页内展示

Prompt **MUST** 包含 3 个 few-shot：

- 高质量正例
- 可导入但需 review 的中间例
- 负例：只有“天气高手/重点关注/亚洲风格”这类空泛描述

Prompt **MUST** 显式约束：

- `alias` 只有输入材料里出现清晰短称呼时才允许填写，否则留空。
- `strategyFocus` 必须是一句短交易摘要。
- 不得根据语气或人物画像自动生成 alias。
- 不得引入输入材料之外的市场、来源、城市、数值或结论。

## 5. 输入模板

导入面板 **SHOULD** 推荐用户按地址分块输入，字段顺序建议如下：

1. 地址
2. 显示名
3. 主要市场/城市
4. 结算来源或站点
5. 主要依据
6. 常用时间窗口
7. 常见下注方式
8. 天气驱动
9. 重点观察原因
10. 原文证据摘录
11. 团队备注

推荐模板示例：

```text
地址: 0x...
显示名: Wumai
主要市场/城市: Singapore
结算来源或站点: NWS/NOAA
主要依据: ensemble guidance + station observation
常用时间窗口: D1
常见下注方式: upper tail near threshold
天气驱动: cloud cover, precip timing
重点观察原因: 持续跟踪样本
原文证据摘录: Uses NWS/NOAA obs, watches D1 ensemble spread, leans upper tail when cloud cover clears late.
```

## 6. 黑名单与噪音规则

以下词汇 **MUST NOT** 进入 Layer 1 主展示标签：

- `天气`
- `亚洲 / 美国 / 欧洲` 这类未绑定市场范围的地域词
- `高频`
- `稳健`
- `激进`
- `聪明钱`
- `经验丰富`
- 团队身份、社群身份、口号式评价
- 泛气候叙事但没有时间、来源、市场或数值支撑的描述

若这些信息确实出现在输入材料中：

- **MAY** 下沉到 `bio` 或 `teamNote`
- **MUST NOT** 作为扩展主标注或列表主标签

## 7. Signal Quality 与 Review 规则

### 7.1 通过门槛

AI 预览通过门槛 **MUST** 满足：

- 有有效地址
- 有显示名
- `sourceExcerpt` 非空
- 至少命中 2 个非 `unknown` 的高价值天气信号

### 7.2 Signal Quality

- `high_signal`
  - 至少 3 个高价值信号明确
  - 且 `evidenceQuality` 为 `explicit_numeric` 或 `source_named`
- `needs_review`
  - 只有 1-2 个高价值信号
  - 或只有定性证据
- `low_signal`
  - 只有空泛描述
  - 或全部关键维度为 `unknown`
  - 或证据不足

### 7.3 Review Required

以下情况 **MUST** 进入 `review_needed`：

- `signalQuality !== high_signal`
- 缺少 `sourceExcerpt`
- 标签过滤后高价值标签不足
- `watchlist=true` 但材料没有明确跟踪语义
- `strategyFocus` 无法体现天气交易摘要

## 8. Commit 二次过滤规则

服务端在 commit 前 **MUST** 做二次归一化，不能直接信任 preview 结果。

二次过滤规则如下：

1. 重新归一化 `weatherSignals`
2. 重新计算 `signalQuality`
3. 重新生成 `strategyFocus`
   - 由 `forecastBasis + timingWindow + edgeStyle + 1 个 weatherDriver` 组合
4. 丢弃黑名单标签
5. 限制标签数量
   - `weatherDrivers` 最多 2 个
6. 过长摘要截断
7. 过长 alias 清空回退
8. `watchlist=true` 只有在材料明确表达重点跟踪时才允许保留

commit 写库时 **MUST** 遵守：

- `high_signal` -> `curationStatus = active`
- `needs_review` / `low_signal` -> `curationStatus = review_needed`

## 9. UI 展示规则

AI 预览卡片 **MUST** 按以下顺序展示：

1. `signalQuality`
2. `strategyFocus`
3. 2-4 个高价值天气标签
4. warning / error
5. `sourceExcerpt`

以下信息 **MUST NOT** 进入预览主卡片：

- 人物风格标签
- 长背景
- 团队内评价
- 无证据泛化词

## 10. 非 AI 回退规则

当 `Gemini -> Groq` 全部失败时：

- 系统 **MAY** 回退到文本解析预览
- 但文本解析结果 **MUST** 继续遵守天气专项字段与噪音约束
- 文本解析生成的结果 **SHOULD** 带有明显的降级提示

## 11. 维护约束

本文件是以下实现的单一事实来源：

- `apps/web/lib/wallet-ai.ts`
- `apps/web/lib/wallet-import.ts`
- `apps/web/lib/data-service.ts`
- `apps/web/components/WalletImportPanel.tsx`

未来若要修改：

- taxonomy
- prompt 规则
- review 规则
- commit 过滤规则

必须先更新本文件，再更新代码实现。
