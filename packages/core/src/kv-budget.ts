/**
 * Cloudflare KV 写入预算。
 *
 * KV 免费额度是每天 1000 次 put()，这是整个扩展唯一真正稀缺的资源：D1 读、
 * Cache API 写、Polymarket 拉取都不消耗它。额度耗尽后 KV put() 会抛
 * "KV put() limit exceeded for the day."，而缓存写入一旦抛错，链路会把
 * **已经构建好的 payload 一起丢掉**，市场标注直接退化成 error。
 *
 * 这里做两件事：
 * 1. 识别配额错误，把「缓存写不进去」和「缓存写错了」区分开 —— 只有前者需要熔断；
 * 2. 提供软上限，在真正触到硬额度之前就主动停写，留出余量给必须写的路径。
 *
 * 计数按 isolate 内存维护。它不是全局精确计数器（Workers 有多个 isolate），
 * 作用是保证单个 isolate 不会独自烧穿额度；跨 isolate 的兜底靠配额错误熔断。
 */

/** Cloudflare KV 免费额度：每天 1000 次写入。 */
export const KV_DAILY_WRITE_LIMIT = 1000;

/**
 * 软上限。留出 20% 余量给 AI hover note 等必须写的路径，
 * 避免缓存类写入把额度抢光、导致关键写入也失败。
 */
export const KV_DAILY_WRITE_SOFT_LIMIT = 800;

/**
 * KV 配额错误的特征串。Cloudflare 目前返回的是
 * "KV put() limit exceeded for the day."，但不同 API 路径措辞略有差异
 * （limit exceeded / too many / exceeded for the day），所以放宽匹配。
 */
const KV_QUOTA_ERROR_PATTERN =
  /limit exceeded|exceeded for the day|kv put\(\).*limit|too many (writes|operations)/i;

/** 把可能层层嵌套的错误摊平成可搜索的文本。 */
const flattenErrorText = (error: unknown, depth = 0): string => {
  if (error === null || error === undefined) {
    return "";
  }
  if (typeof error === "string") {
    return error;
  }
  if (typeof error !== "object") {
    return String(error);
  }
  // 深度上限防止自引用结构把展开变成死循环。
  if (depth >= 4) {
    return "";
  }

  const record = error as Record<string, unknown>;
  return [
    typeof record.message === "string" ? record.message : "",
    typeof record.code === "string" ? record.code : "",
    flattenErrorText(record.errors, depth + 1),
    ...(Array.isArray(record.errors) ? record.errors.map((item) => flattenErrorText(item, depth + 1)) : [])
  ]
    .filter(Boolean)
    .join(" ");
};

/** 判断一个异常是不是 KV 写入配额耗尽，而不是普通写入失败。 */
export const isKvQuotaError = (error: unknown): boolean => KV_QUOTA_ERROR_PATTERN.test(flattenErrorText(error));

/** UTC 日期键。KV 配额按 UTC 日重置，所以这里也必须用 UTC，不能用本地时区。 */
export const kvQuotaDay = (now: Date = new Date()): string => now.toISOString().slice(0, 10);

export interface KvWriteBudgetSnapshot {
  day: string;
  writes: number;
  softLimit: number;
  /** 已观察到配额错误，本日剩余时间不再尝试写入。 */
  quotaExceeded: boolean;
  /** 触发熔断的原因，仅用于日志。 */
  quotaExceededReason?: string;
}

export interface KvWriteBudget {
  /** 取一次写入许可。返回 false 表示已停写，调用方应跳过写入而不是报错。 */
  tryAcquire(): boolean;
  /** 记一次实际发生的写入（tryAcquire 通过后调用）。 */
  recordWrite(count?: number): void;
  /** 观察到配额错误后熔断本日写入。 */
  tripQuota(reason?: string): void;
  snapshot(): KvWriteBudgetSnapshot;
  /** 仅供测试和热重载使用。 */
  reset(): void;
}

export const createKvWriteBudget = (softLimit: number = KV_DAILY_WRITE_SOFT_LIMIT): KvWriteBudget => {
  // 软上限必须夹在硬额度之内，否则一个写错常数的调用方就能让预算彻底失效。
  const effectiveSoftLimit = Math.min(Math.max(1, Math.floor(softLimit)), KV_DAILY_WRITE_LIMIT);

  let day = kvQuotaDay();
  let writes = 0;
  let quotaExceeded = false;
  let quotaExceededReason: string | undefined;

  const rollDayIfNeeded = () => {
    const today = kvQuotaDay();
    if (today !== day) {
      day = today;
      writes = 0;
      quotaExceeded = false;
      quotaExceededReason = undefined;
    }
  };

  return {
    tryAcquire() {
      rollDayIfNeeded();
      return !quotaExceeded && writes < effectiveSoftLimit;
    },
    recordWrite(count = 1) {
      rollDayIfNeeded();
      writes += Math.max(0, Math.floor(count));
    },
    tripQuota(reason?: string) {
      rollDayIfNeeded();
      quotaExceeded = true;
      quotaExceededReason = reason;
    },
    snapshot() {
      rollDayIfNeeded();
      return {
        day,
        writes,
        softLimit: effectiveSoftLimit,
        quotaExceeded,
        ...(quotaExceededReason ? { quotaExceededReason } : {})
      };
    },
    reset() {
      day = kvQuotaDay();
      writes = 0;
      quotaExceeded = false;
      quotaExceededReason = undefined;
    }
  };
};
