# Cloudflare 部署与扩展发布

本文档对应当前仓库里的真实部署方式，重点对齐以下事实：

- 管理后台部署目标：`apps/web`
- 公开扩展 API：`apps/worker`
- 扩展 release 包输出目录：`apps/extension/dist`
- 扩展最终配置文件：
  - `apps/extension/dist/manifest.json`
  - `apps/extension/dist/runtime-config.json`

下文统一使用占位域名，不要把自己的 token、secret、邮箱或生产资源 ID 提交到仓库。

## 1. 目标域名

- `admin.<your-domain>`：管理后台，可挂 Cloudflare Access
- `app.<your-domain>`：公开扩展 API，不建议挂 Access

## 2. 预备条件

你需要准备：

- 一个由 Cloudflare 托管的根域名
- 可用的 Cloudflare 账号权限
- Node.js 与 npm
- Wrangler CLI 可执行环境

本仓库会用到的核心 Cloudflare 资源：

- D1：`smart-money-prod`
- KV：`smart-money-cache`
- Worker 路由：
  - `admin.<your-domain>`
  - `app.<your-domain>`

## 3. wrangler 配置文件

仓库中实际生效的配置文件是：

- `apps/web/wrangler.jsonc`
- `apps/worker/wrangler.toml`

需要保证这两个文件中的以下值彼此一致：

- `ADMIN_BASE_URL`
- `PUBLIC_EXTENSION_BASE_URL`
- `SMART_MONEY_CACHE`
- `SMART_MONEY_DB`
- 自定义域名路由

文档中只使用占位符示例：

- `admin.example.com`
- `app.example.com`
- `kv_namespace_id`
- `d1_database_id`

不要在文档、README 或提交说明中粘贴生产 token、模型密钥或其他 secrets。

## 4. 安装依赖

```bash
npm install
```

## 5. 初始化 D1

先执行 migration：

```bash
npx wrangler d1 execute smart-money-prod --file=packages/data/migrations/0001-init.sql --config apps/worker/wrangler.toml
```

再生成并导入 seed：

```bash
npm run seed -w packages/data > .tmp-smart-money-seed.sql
npx wrangler d1 execute smart-money-prod --file=.tmp-smart-money-seed.sql --config apps/worker/wrangler.toml
```

如果需要预置扩展邀请码，也可以直接写入 `extension_invites`：

```sql
INSERT OR REPLACE INTO extension_invites (
  code,
  member_label,
  status,
  expires_at,
  created_at,
  updated_at
) VALUES (
  'your-invite-code',
  'Your Team',
  'active',
  NULL,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
);
```

## 6. 配置 secrets 与公开变量

### `apps/worker`

必需 secret：

```bash
npx wrangler secret put EXTENSION_TOKEN_SECRET --config apps/worker/wrangler.toml
```

公开变量在 `apps/worker/wrangler.toml` 中声明：

- `ADMIN_BASE_URL`
- `PUBLIC_EXTENSION_BASE_URL`
- `POLYMARKET_GAMMA_URL`
- `POLYMARKET_DATA_URL`

### `apps/web`

`apps/web/wrangler.jsonc` 需要与 worker 使用相同的公开变量：

- `ADMIN_BASE_URL`
- `PUBLIC_EXTENSION_BASE_URL`
- `POLYMARKET_GAMMA_URL`
- `POLYMARKET_DATA_URL`

可选 secret：

- `GEMINI_API_KEY`
- `GROQ_API_KEY`

如果需要写入：

```bash
npx wrangler secret put GEMINI_API_KEY --config apps/web/wrangler.jsonc
npx wrangler secret put GROQ_API_KEY --config apps/web/wrangler.jsonc
```

## 7. 本地验证

### 公开扩展 API

```bash
npm run dev -w apps/worker
```

### 管理后台

```bash
npm run dev -w apps/web
```

本地 `next dev` 可用于页面和接口开发；正式部署时 `apps/web` 会通过 Cloudflare Workers + OpenNext 读取 D1/KV bindings。

## 8. 部署到 Cloudflare

### 部署公开 API Worker

```bash
npm run deploy -w apps/worker
```

### 部署管理后台

```bash
npm run deploy -w apps/web
```

`apps/web` 的 deploy 脚本实际会先执行：

```bash
npm run build:cloudflare -w apps/web
```

然后再调用 `wrangler deploy -c wrangler.jsonc`。

## 9. 配置 Cloudflare Access

建议仅对 `admin.<your-domain>` 启用 Access。

在 Zero Trust -> Access -> Applications 中：

1. 新建 Self-hosted Application。
2. 域名填写 `admin.<your-domain>`。
3. 按团队邮箱域、Google 或 GitHub 身份提供商配置策略。
4. `app.<your-domain>` 保持公开，供扩展访问。

## 10. 构建扩展 release 包

扩展 release 构建通过环境变量注入后端与后台地址：

```powershell
$env:EXTENSION_BACKEND_URL="https://app.<your-domain>"
$env:EXTENSION_ADMIN_BASE_URL="https://admin.<your-domain>"
npm run build:release -w apps/extension
```

可选变量：

```powershell
$env:EXTENSION_WORKBENCH_PATH="/wallets"
$env:EXTENSION_PRIVACY_PATH="/extension/privacy"
$env:EXTENSION_UPDATE_URL="https://example.com/updates.xml"
```

构建脚本 `apps/extension/scripts/copy-static.mjs` 会：

- 复制 `apps/extension/public/*` 到 `apps/extension/dist`
- 删除模板文件
- 生成最终的 `apps/extension/dist/manifest.json`
- 生成最终的 `apps/extension/dist/runtime-config.json`

默认值如下：

- `EXTENSION_BACKEND_URL` 默认回落到 `https://app.example.com`
- `EXTENSION_ADMIN_BASE_URL` 默认回落到 `https://admin.example.com`
- `EXTENSION_WORKBENCH_PATH` 默认 `/wallets`
- `EXTENSION_PRIVACY_PATH` 默认 `/extension/privacy`

如果要发布到你的环境，显式传入自己的域名，不要依赖默认值。

## 11. 分发给测试用户

1. 压缩 `apps/extension/dist`。
2. 让测试用户打开 `chrome://extensions` 或 `edge://extensions`。
3. 打开开发者模式。
4. 选择“加载已解压的扩展程序”。
5. 指向 `dist` 目录。

## 12. 闭环验证

建议按以下顺序验收：

1. 管理后台可以创建地址、标签和邀请码。
2. 扩展 popup 可以用邀请码登录。
3. 在 Polymarket 打开市场并展开 `Top Holders`，命中的地址能显示标注。
4. 回到 `admin.<your-domain>`，能看到邀请码与会话状态。
5. 修改 alias、标签或备注后，扩展在缓存更新后能看到变化。

## 13. 常见回退思路

- 如果扩展标注不更新，先确认 `app.<your-domain>` 是否可访问、`EXTENSION_TOKEN_SECRET` 是否已配置、`runtime-config.json` 是否写入了正确域名。
- 如果后台部署成功但页面无法访问，先检查 `apps/web/wrangler.jsonc` 的 route、OpenNext 构建产物和 Access 配置。
- 如果 release 包里还是旧域名，删除旧的 `apps/extension/dist` 后重新执行 `build:release`。
