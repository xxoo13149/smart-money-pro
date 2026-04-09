interface SendEmailBinding {
  send(message: unknown): Promise<void>;
}

export interface Env {
  SMART_MONEY_DB: D1Database;
  SMART_MONEY_CACHE: KVNamespace;
  ADMIN_APPROVAL_EMAIL: SendEmailBinding;
  ADMIN_APPROVAL_OWNER_EMAIL: string;
  ADMIN_APPROVAL_SENDER_EMAIL: string;
  ADMIN_APPROVAL_SENDER_NAME?: string;
  ADMIN_APPROVAL_SHARED_SECRET: string;
  EXTENSION_TOKEN_SECRET: string;
  ADMIN_BASE_URL: string;
  PUBLIC_EXTENSION_BASE_URL: string;
  POLYMARKET_GAMMA_URL?: string;
  POLYMARKET_DATA_URL?: string;
}
