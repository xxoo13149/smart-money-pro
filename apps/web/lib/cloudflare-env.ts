import type { D1Database, KVNamespace } from "@cloudflare/workers-types";

export interface SmartMoneyBindings {
  SMART_MONEY_DB?: D1Database;
  SMART_MONEY_CACHE?: KVNamespace;
  ADMIN_BASE_URL?: string;
  ADMIN_SESSION_TTL_DAYS?: string;
  ADMIN_APPROVAL_OWNER_EMAIL?: string;
  ADMIN_APPROVAL_SENDER_EMAIL?: string;
  ADMIN_APPROVAL_SENDER_NAME?: string;
  ADMIN_APPROVAL_CODE_TTL_MINUTES?: string;
  ADMIN_APPROVAL_RESEND_COOLDOWN_SECONDS?: string;
  ADMIN_APPROVAL_SHARED_SECRET?: string;
  PUBLIC_EXTENSION_BASE_URL?: string;
  GEMINI_API_KEY?: string;
  GROQ_API_KEY?: string;
  WALLET_AI_PROVIDER_ORDER?: string;
  WALLET_AI_GEMINI_MODEL?: string;
  WALLET_AI_GROQ_MODEL?: string;
  FINDER_SYNC_TOKEN?: string;
  FINDER_ALLOWED_ORIGINS?: string;
}

export const getSmartMoneyBindings = async (): Promise<SmartMoneyBindings | null> => {
  try {
    const mod = (await import("@opennextjs/cloudflare")) as {
      getCloudflareContext: (options?: unknown) => Promise<{ env?: SmartMoneyBindings } | undefined> | { env?: SmartMoneyBindings } | undefined;
    };
    const context = await Promise.resolve(mod.getCloudflareContext({ async: true }));
    return (context?.env as SmartMoneyBindings | undefined) ?? null;
  } catch {
    return null;
  }
};
