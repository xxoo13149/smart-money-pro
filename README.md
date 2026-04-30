# Weather Smart Money

面向小团队内测的 Polymarket 地址标注与研究工作台。

这个仓库把 5 条核心链路放在同一套 Cloudflare 原生架构里：

- 地址录入与 AI 导入
- 地址库维护与复核
- 浏览器扩展登录与邀请码体系
- Polymarket 页内地址标签注入与悬浮详情
- 管理后台、运行状态与恢复能力

项目当前重点不是做公开 SaaS，而是先把「稳定可用、低成本、便于团队维护」打牢。

## 项目目标

- 为 Polymarket，尤其是天气/温度交易场景，建立一套可维护的地址库
- 让扩展在页内直接显示更有用的地址标签、摘要与 hover 详情
- 让管理端可以持续导入、整理、复核、删除和恢复地址数据
- 尽量使用 Cloudflare 原生能力，控制成本与系统复杂度

## 当前架构

- `apps/web`
  Next.js 管理后台，负责地址库工作台、AI 导入、复核、详情页和部分管理接口
- `apps/worker`
  Cloudflare Worker，对外提供扩展鉴权、标签查询、市场标注等运行时 API
- `apps/extension`
  Chromium Manifest V3 扩展，在 Polymarket 页面内注入地址标签、悬浮卡片和侧边面板
- `packages/core`
  共享类型、taxonomy、领域模型与通用工具
- `packages/data`
  D1 schema、repository、数据访问与迁移逻辑
- `docs`
  部署说明与专项规范文档

## 主要能力

- 地址库工作台
  支持搜索、筛选、分页、复核、软删除、保存视图与详情查看
- AI 导入
  支持文本/文件输入，先做结构化预览，再确认写库
- 标签体系
  支持 AI 标签、人工标签、官方备注、悬浮卡片分层展示
- 浏览器扩展
  支持 Polymarket 页内注入、Hover Card、Side Panel、登录状态保持
- 云端数据
  以 Cloudflare D1 为权威源，KV / Cache 仅做缓存与派生读取

## Monorepo 结构

```text
.
├─ apps/
│  ├─ web/         # Next.js 管理后台
│  ├─ worker/      # Cloudflare Worker API
│  └─ extension/   # Chromium MV3 扩展
├─ packages/
│  ├─ core/        # 共享类型与领域逻辑
│  └─ data/        # D1 schema / repository / migrations
├─ docs/
│  ├─ cloudflare-deploy.md
│  ├─ cloudflare-api-deploy.md
│  └─ spec/
│     └─ weather-ai-import-spec.md
└─ scripts/        # 部署与辅助脚本
```

## 本地开发

先安装依赖：

```bash
npm install
```

启动后台：

```bash
npm run dev:web
```

启动 Worker 本地调试：

```bash
npm run dev:worker
```

一键打开常用开发窗口：

```bash
npm run dev:open
```

## 扩展构建

开发构建：

```bash
npm run build:dev -w apps/extension
```

发布构建：

```bash
npm run build:release -w apps/extension
```

构建产物位于：

```text
apps/extension/dist
```

加载方式：

1. 打开 Chrome 或 Edge 的扩展管理页
2. 开启开发者模式
3. 选择“加载已解压的扩展程序”
4. 指向 `apps/extension/dist`

## 常用命令

全仓类型检查与构建校验：

```bash
npm run lint
```

全仓构建：

```bash
npm run build
```

核心测试：

```bash
npm run test
```

Web Cloudflare 构建：

```bash
npm run build:cloudflare -w apps/web
```

Worker 构建：

```bash
npm run build -w apps/worker
```

## Cloudflare 部署

仓库内提供了两份部署文档：

- [Cloudflare 手动部署说明](./docs/cloudflare-deploy.md)
- [Cloudflare API 部署脚本说明](./docs/cloudflare-api-deploy.md)

一键部署入口：

```bash
npm run deploy:cloudflare -- --domain example.com
```

说明：

- `apps/web` 与 `apps/worker` 都基于 Cloudflare 部署
- D1 是唯一权威数据源
- KV / Cache API 只做缓存，不承担权威写入职责
- 真实域名、邮件路由、Access、D1、KV、R2、Secrets 请使用你自己的环境配置

## 运行与数据原则

- 后台管理读写默认只认 D1 最新数据
- 扩展查询链路使用缓存，但默认排除软删除地址
- AI 导入默认先预览再确认，不直接自动写库
- 同地址重复导入时，应保留最新地址主记录并替换旧 AI 系统标签
- 人工标签优先级高于 AI 标签

## 最近进展（2026-05-01）

- Finder 同步导入已改为只保留“命中标签的钱包”，不再把整批候选地址无差别导入后台
- Finder 预览状态新增 4 个关键计数：`拉取总数 / 命中标签 / 已过滤 / 可导入`
- 当 Finder 本次结果没有命中标签钱包时，后台会直接给出跳过提示，不再生成误导性的空白导入结果
- Polymarket 扩展加强了 feed 区域 `Top Holders / Positions / Activity / Comments` 相邻面板识别，降低切换或异步渲染时的挂载失败
- 扩展侧对页内标注挂载 key 与文本提取做了稳定性修补，重点缓解个别地址出现的一闪一闪、重复挂载和识别漂移问题

## 文档与规范

- [天气 AI 导入规范](./docs/spec/weather-ai-import-spec.md)

如果后面扩展到非天气赛道，建议不要直接复用天气专项 taxonomy，而是单独维护一份新规范。

## 安全说明

- 不要把任何真实密钥、Token、邮箱验证码配置、Cloudflare 账号信息提交进仓库
- `wrangler` 配置中的域名、邮箱、路由、资源 ID 应按你自己的环境管理
- 推荐把敏感配置放在 Cloudflare Secrets、本地环境变量或未提交的私有配置文件中

## 当前阶段说明

这个仓库仍在持续迭代中，当前重点是：

- 提升扩展页内标签注入稳定性
- 继续打磨 Finder 到后台地址库的筛选、同步反馈与去重更新链路
- 优化地址库工作台的整理与复核体验
- 提升 AI 导入结果的可读性、去重与可维护性
- 完善 Cloudflare 原生部署、恢复和成本控制

如果你准备继续接手这个项目，建议先按下面顺序阅读：

1. 本文档
2. `docs/cloudflare-deploy.md`
3. `docs/spec/weather-ai-import-spec.md`
4. `apps/web`、`apps/worker`、`apps/extension` 的入口代码
