interface SendEmailBinding {
  send(message: unknown): Promise<void>;
}

export interface Env {
  SMART_MONEY_DB: D1Database;
  /**
   * 已退出热路径。
   *
   * 缓存全部落 D1（见 packages/data/src/annotation-cache.ts）：
   * KV 免费额度每天只有 1000 次写入，放在热路径上人数一多必然打满。
   * 绑定先保留，方便回滚；确认稳定后可以连同 wrangler.toml 里的
   * [[kv_namespaces]] 一起删除。
   */
  SMART_MONEY_CACHE: KVNamespace;
  ADMIN_APPROVAL_EMAIL: SendEmailBinding;
  ADMIN_APPROVAL_OWNER_EMAIL: string;
  ADMIN_APPROVAL_SENDER_EMAIL: string;
  ADMIN_APPROVAL_SENDER_NAME?: string;
  ADMIN_APPROVAL_SHARED_SECRET: string;
  EXTENSION_TOKEN_SECRET: string;
  EXTENSION_TOKEN_KEY_ID?: string;
  ADMIN_BASE_URL: string;
  PUBLIC_EXTENSION_BASE_URL: string;
  POLYMARKET_GAMMA_URL?: string;
  POLYMARKET_DATA_URL?: string;
  DEEPSEEK_API_KEY?: string;
  DEEPSEEK_BASE_URL?: string;
  DEEPSEEK_MODEL?: string;
}
