# Weather Smart Money

面向小团队的 Polymarket 地址标注系统。当前仓库覆盖以下链路：

- 管理员在 `apps/web` 录入和维护地址、备注、标签、Watchlist。
- 公开查询接口运行在 `apps/worker`，供浏览器扩展读取授权与标注摘要。
- Chromium 扩展位于 `apps/extension`，在 Polymarket 页面给命中地址展示团队标注。

## Monorepo 结构

- `apps/web`
  Next.js 管理后台，Cloudflare Workers 部署目标，支持接入 Cloudflare Access。
- `apps/worker`
  Cloudflare Worker 公开 API，负责扩展认证、标签查询和市场注释接口。
- `apps/extension`
  Chromium Manifest V3 扩展。
- `packages/core`
  共享类型、领域模型和演示数据。
- `packages/data`
  D1 schema、repository、migration 和 seed。
- `docs`
  部署与配置说明。

## 本地开发

```bash
npm install
npm run dev:web
npm run dev:worker
```

扩展本地开发构建：

```bash
npm run build:dev -w apps/extension
```

## 常用脚本

```bash
npm run lint
npm run build
npm run test
```

Cloudflare 管理后台构建：

```bash
npm run build:cloudflare -w apps/web
```

## 扩展发布构建

扩展 release 构建依赖环境变量，不需要手动改 `manifest` 或 runtime 配置文件：

```powershell
$env:EXTENSION_BACKEND_URL="https://app.example.com"
$env:EXTENSION_ADMIN_BASE_URL="https://admin.example.com"
npm run build:release -w apps/extension
```

构建产物位于 `apps/extension/dist`。其中：

- `apps/extension/dist/manifest.json` 由 `apps/extension/public/manifest.template.json` 生成。
- `apps/extension/dist/runtime-config.json` 由 `apps/extension/public/runtime-config.template.json` 生成。

可选环境变量：

- `EXTENSION_WORKBENCH_PATH`
- `EXTENSION_PRIVACY_PATH`
- `EXTENSION_UPDATE_URL`

## Cloudflare 部署

- 手动部署文档：[`docs/cloudflare-deploy.md`](./docs/cloudflare-deploy.md)
- 一键脚本说明：[`docs/cloudflare-api-deploy.md`](./docs/cloudflare-api-deploy.md)

仓库根命令：

```bash
npm run deploy:cloudflare -- --domain example.com
```

## 当前边界

- 地址库主数据基于 Cloudflare D1 + KV。
- 扩展数据会通过接口和缓存自动更新，但扩展代码升级仍需要重新执行 release 构建并重新分发。
- `markets / trades / positions / alerts` 仍包含 demo/seed 数据，生产化能力还在继续补齐。

## 安全说明

- 不要把 Cloudflare API Token、`EXTENSION_TOKEN_SECRET`、模型 API Key 等 secrets 写进仓库。
- `wrangler` 配置中的真实域名和资源 ID 应以你自己的环境为准，文档中统一使用占位示例。
