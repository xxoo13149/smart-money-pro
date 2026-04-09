# Cloudflare 一键部署脚本

仓库根目录提供了一键脚本：

```bash
npm run deploy:cloudflare -- --domain example.com
```

实际入口是：

```bash
node scripts/deploy-cloudflare.mjs
```

## 脚本会做什么

当前脚本会按顺序执行这些动作：

1. 识别 Cloudflare 账号与 Zone。
2. 创建或复用 D1：`smart-money-prod`。
3. 创建或复用 KV：`smart-money-cache`。
4. 重写：
   - `apps/worker/wrangler.toml`
   - `apps/web/wrangler.jsonc`
5. 设置 worker secret：`EXTENSION_TOKEN_SECRET`。
6. 可选设置 admin secrets：
   - `GEMINI_API_KEY`
   - `GROQ_API_KEY`
7. 执行 D1 migration 与 seed，默认还会写入邀请码。
8. 部署 `apps/worker`。
9. 构建并部署 `apps/web`。
10. 构建扩展 release 包到 `apps/extension/dist`。
11. 对 D1 schema、公开 API 和管理后台端点做基础验证。

## 认证方式

支持两种 Cloudflare 认证方式。

### 1. API Token

```powershell
$env:CLOUDFLARE_API_TOKEN="your-token"
npm run deploy:cloudflare -- --domain example.com
```

也支持环境变量别名：

- `CF_API_TOKEN`
- `CLOUDFLARE_API_TOKEN`

### 2. Global API Key

使用 Global API Key 时，必须同时提供 Cloudflare 登录邮箱：

```powershell
$env:CLOUDFLARE_API_KEY="your-global-key"
$env:CLOUDFLARE_EMAIL="you@example.com"
npm run deploy:cloudflare -- --domain example.com
```

也支持以下别名：

- `CF_API_KEY`
- `CF_GLOBAL_API_KEY`
- `CF_EMAIL`

## 常用参数

```bash
npm run deploy:cloudflare -- --domain example.com --app-host app.example.com --admin-host admin.example.com
```

可选参数与脚本当前实现保持一致：

- `--account-id`
- `--zone-id`
- `--app-host`
- `--admin-host`
- `--extension-secret`
- `--invite-code`
- `--gemini-key`
- `--groq-key`
- `--skip-seed`
- `--skip-worker`
- `--skip-web`
- `--skip-extension`
- `--dry-run`
- `--help`

## 环境变量映射

脚本支持以下环境变量：

- `CF_API_TOKEN` / `CLOUDFLARE_API_TOKEN`
- `CF_API_KEY` / `CLOUDFLARE_API_KEY` / `CF_GLOBAL_API_KEY`
- `CF_EMAIL` / `CLOUDFLARE_EMAIL`
- `CF_ACCOUNT_ID` / `CLOUDFLARE_ACCOUNT_ID`
- `CF_ZONE_ID` / `CLOUDFLARE_ZONE_ID`
- `CF_DOMAIN` / `CLOUDFLARE_DOMAIN`
- `CF_APP_HOST` / `CLOUDFLARE_APP_HOST`
- `CF_ADMIN_HOST` / `CLOUDFLARE_ADMIN_HOST`
- `EXTENSION_TOKEN_SECRET`
- `EXTENSION_INVITE_CODE`
- `GEMINI_API_KEY`
- `GROQ_API_KEY`

## 扩展 release 包的真实生成方式

脚本在未加 `--skip-extension` 时，会执行：

```bash
npm run build:release -w apps/extension
```

并自动注入：

- `EXTENSION_BACKEND_URL=https://app.<domain>`
- `EXTENSION_ADMIN_BASE_URL=https://admin.<domain>`

最终输出目录是：

- `apps/extension/dist`

生成文件包括：

- `apps/extension/dist/manifest.json`
- `apps/extension/dist/runtime-config.json`

它们分别来自：

- `apps/extension/public/manifest.template.json`
- `apps/extension/public/runtime-config.template.json`

## `--dry-run` 的作用

`--dry-run` 只会：

- 校验 Cloudflare 认证
- 解析 Zone / Account
- 确保 D1 / KV 可解析
- 重写 wrangler 配置文件

不会执行：

- secret 写入
- migration / seed
- worker/web deploy
- 扩展 release 构建

## 脚本不负责的事情

这些步骤仍需要人工确认或补齐：

- Cloudflare Access 策略配置
- Chrome Web Store / Edge Add-ons 上架
- 生产 secrets 的长期托管与轮换
- 对重写后的 wrangler 配置做最终审阅

## 安全边界

- 不要在命令历史、README、issue 或提交说明里暴露真实 token、邮箱、secret。
- `--extension-secret`、`--gemini-key`、`--groq-key` 只建议通过临时环境变量或安全注入方式传递。
- 脚本会重写 `apps/worker/wrangler.toml` 和 `apps/web/wrangler.jsonc`，执行前后都应做一次 diff 检查。
