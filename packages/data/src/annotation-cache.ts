/**
 * 市场标注缓存的数据层，落 D1。
 *
 * 为什么不用 KV：KV 免费额度每天只有 1000 次写入，而市场标注缓存写在热路径上，
 * 人数一增长必然打满（这就是线上 "KV put() limit exceeded for the day." 的成因）。
 * D1 免费额度是每天 100,000 行写入，差 100 倍，而且可以按内容变化精确控制写入次数。
 *
 * 三条设计不变式：
 *
 * 1. 主键只含 slug。标签版本是普通字段，标签变了就 UPSERT 同一行。
 *    如果把 labelsVersion 放进主键（KV 时代就是这么做的），每次改标签都会留下一条
 *    永远读不到的死行 —— 表会随标签编辑次数无限膨胀，旧 payload 全部滞留。
 *
 * 2. 内容没变就不写。写入前先比对 etag，相同直接跳过。
 *    这样写入次数等于「真实数据变化次数」，而不是「请求次数」——
 *    10 个人看同一个市场，写入次数和 1 个人看是相同的。
 *
 * 3. 过期只影响新鲜度，不影响可用性。读到过期行时仍然返回，由调用方决定
 *    是先用着（sourceStatus: "stale"）还是重建，绝不能因为过期就当没缓存。
 */

export interface MarketAnnotationCacheRow {
  slug: string;
  labelsVersion: string;
  etag: string;
  payloadJson: string;
  cachedAt: string;
  updatedAt: string;
}

/** 缓存新鲜期。超过它仍然返回，但调用方应视为 stale 并触发后台重建。 */
export const MARKET_ANNOTATION_CACHE_TTL_SECONDS = 900;

export const readMarketAnnotationCacheRow = async (
  db: D1Database,
  slug: string
): Promise<MarketAnnotationCacheRow | null> => {
  const row = await db
    .prepare(
      `SELECT slug, labels_version, labels_version AS labelsVersion,
              etag, payload_json AS payloadJson, cached_at AS cachedAt, updated_at AS updatedAt
         FROM market_annotation_cache
        WHERE slug = ?`
    )
    .bind(slug)
    .first<{
      slug: string;
      labelsVersion: string;
      etag: string;
      payloadJson: string;
      cachedAt: string;
      updatedAt: string;
    }>();

  if (!row) {
    return null;
  }

  return {
    slug: row.slug,
    labelsVersion: row.labelsVersion,
    etag: row.etag,
    payloadJson: row.payloadJson,
    cachedAt: row.cachedAt,
    updatedAt: row.updatedAt
  };
};

export interface UpsertMarketAnnotationCacheInput {
  slug: string;
  labelsVersion: string;
  etag: string;
  payloadJson: string;
  cachedAt: string;
  now: string;
}

export type UpsertMarketAnnotationCacheResult = "written" | "unchanged";

/**
 * 写入缓存。etag 与现有行相同则跳过写入并返回 "unchanged" ——
 * 这是把写入量从「请求数」压到「变化数」的关键。
 */
export const upsertMarketAnnotationCache = async (
  db: D1Database,
  input: UpsertMarketAnnotationCacheInput
): Promise<UpsertMarketAnnotationCacheResult> => {
  const existing = await readMarketAnnotationCacheRow(db, input.slug);
  if (existing && existing.etag === input.etag && existing.labelsVersion === input.labelsVersion) {
    return "unchanged";
  }

  await db
    .prepare(
      `INSERT INTO market_annotation_cache
         (slug, labels_version, etag, payload_json, cached_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(slug) DO UPDATE SET
         labels_version = excluded.labels_version,
         etag           = excluded.etag,
         payload_json   = excluded.payload_json,
         cached_at      = excluded.cached_at,
         updated_at     = excluded.updated_at`
    )
    .bind(input.slug, input.labelsVersion, input.etag, input.payloadJson, input.cachedAt, input.now)
    .run();

  return "written";
};

/**
 * 清理长期未被访问的缓存行。
 * D1 免费额度有 5 GB 存储上限，虽然按 slug 去重后行数不会失控，
 * 但过期市场（天气市场每天都在换 slug）留着纯占空间。
 */
export const pruneMarketAnnotationCache = async (
  db: D1Database,
  olderThanIso: string,
  limit = 500
): Promise<number> => {
  const result = await db
    .prepare(
      `DELETE FROM market_annotation_cache
        WHERE updated_at < ?
          AND slug IN (
            SELECT slug FROM market_annotation_cache
             WHERE updated_at < ?
             ORDER BY updated_at ASC
             LIMIT ?
          )`
    )
    .bind(olderThanIso, olderThanIso, limit)
    .run();

  const changes = (result as unknown as { meta?: { changes?: number } })?.meta?.changes;
  return typeof changes === "number" ? changes : 0;
};

// ---- AI hover note 缓存 ----

export interface AiHoverNoteCacheRow {
  cacheKey: string;
  summaryText: string;
  model: string;
  generatedAt: string;
}

export const readAiHoverNoteCache = async (
  db: D1Database,
  cacheKey: string
): Promise<AiHoverNoteCacheRow | null> => {
  const row = await db
    .prepare(
      `SELECT cache_key AS cacheKey, summary_text AS summaryText, model, generated_at AS generatedAt
         FROM ai_hover_note_cache
        WHERE cache_key = ?`
    )
    .bind(cacheKey)
    .first<AiHoverNoteCacheRow>();

  return row ?? null;
};

export const readAiHoverNoteCacheBatch = async (
  db: D1Database,
  cacheKeys: string[]
): Promise<Map<string, AiHoverNoteCacheRow>> => {
  const found = new Map<string, AiHoverNoteCacheRow>();
  if (cacheKeys.length === 0) {
    return found;
  }

  // D1 单条语句的绑定参数有上限，分批查避免超限。
  const batchSize = 50;
  for (let index = 0; index < cacheKeys.length; index += batchSize) {
    const batch = cacheKeys.slice(index, index + batchSize);
    const placeholders = batch.map(() => "?").join(", ");
    const { results } = await db
      .prepare(
        `SELECT cache_key AS cacheKey, summary_text AS summaryText, model, generated_at AS generatedAt
           FROM ai_hover_note_cache
          WHERE cache_key IN (${placeholders})`
      )
      .bind(...batch)
      .all<AiHoverNoteCacheRow>();

    for (const row of results) {
      found.set(row.cacheKey, row);
    }
  }

  return found;
};

export const writeAiHoverNoteCache = async (
  db: D1Database,
  entries: Array<{ cacheKey: string; summaryText: string; model: string; generatedAt: string; now: string }>
): Promise<number> => {
  if (entries.length === 0) {
    return 0;
  }

  let written = 0;
  const batchSize = 25;
  for (let index = 0; index < entries.length; index += batchSize) {
    const batch = entries.slice(index, index + batchSize);
    const statements = batch.map((entry) =>
      db
        .prepare(
          `INSERT INTO ai_hover_note_cache
             (cache_key, summary_text, model, generated_at, updated_at)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(cache_key) DO UPDATE SET
             summary_text = excluded.summary_text,
             model        = excluded.model,
             generated_at = excluded.generated_at,
             updated_at   = excluded.updated_at`
        )
        .bind(entry.cacheKey, entry.summaryText, entry.model, entry.generatedAt, entry.now)
    );
    await db.batch(statements);
    written += batch.length;
  }

  return written;
};

/**
 * hover note 只在内容真的变了时才写。AI 输出理论上稳定，
 * 但重复写同样的行依然消耗 D1 行写入额度，人数一多就会被放大。
 */
export const writeAiHoverNoteCacheIfChanged = async (
  db: D1Database,
  entries: Array<{ cacheKey: string; summaryText: string; model: string; generatedAt: string; now: string }>
): Promise<number> => {
  if (entries.length === 0) {
    return 0;
  }

  const keys = entries.map((entry) => entry.cacheKey);
  const existing = await readAiHoverNoteCacheBatch(db, keys);
  const changed = entries.filter((entry) => {
    const current = existing.get(entry.cacheKey);
    return !current || current.summaryText !== entry.summaryText || current.model !== entry.model;
  });

  if (changed.length === 0) {
    return 0;
  }

  return writeAiHoverNoteCache(db, changed);
};

// ---- 通用响应缓存（labels lookup / address search） ----

export interface ResponseCacheRow {
  cacheKey: string;
  version: string;
  etag: string;
  payloadJson: string;
  cachedAt: string;
}

export const readResponseCacheRow = async (
  db: D1Database,
  cacheKey: string
): Promise<ResponseCacheRow | null> => {
  const row = await db
    .prepare(
      `SELECT cache_key AS cacheKey, version, etag,
              payload_json AS payloadJson, cached_at AS cachedAt
         FROM response_cache
        WHERE cache_key = ?`
    )
    .bind(cacheKey)
    .first<ResponseCacheRow>();

  return row ?? null;
};

/**
 * 写入响应缓存，etag 未变则跳过。
 *
 * labels lookup 的 key 是「地址集合的哈希」，正常浏览路径上会反复请求同一批地址，
 * etag 基本不变，所以绝大多数写入都会被跳过 —— KV 时代每次都实打实写一条，
 * 一天 1000 次配额就是这样耗尽的。
 */
export const upsertResponseCacheIfChanged = async (
  db: D1Database,
  input: { cacheKey: string; version: string; etag: string; payloadJson: string; cachedAt: string; now: string }
): Promise<"written" | "unchanged"> => {
  const existing = await readResponseCacheRow(db, input.cacheKey);
  if (existing && existing.etag === input.etag && existing.version === input.version) {
    return "unchanged";
  }

  await db
    .prepare(
      `INSERT INTO response_cache (cache_key, version, etag, payload_json, cached_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(cache_key) DO UPDATE SET
         version      = excluded.version,
         etag         = excluded.etag,
         payload_json = excluded.payload_json,
         cached_at    = excluded.cached_at,
         updated_at   = excluded.updated_at`
    )
    .bind(input.cacheKey, input.version, input.etag, input.payloadJson, input.cachedAt, input.now)
    .run();

  return "written";
};

/** 清理长期未访问的响应缓存行，控制 D1 存储占用。 */
export const pruneResponseCache = async (
  db: D1Database,
  olderThanIso: string,
  limit = 500
): Promise<number> => {
  const result = await db
    .prepare(
      `DELETE FROM response_cache
        WHERE updated_at < ?
          AND cache_key IN (
            SELECT cache_key FROM response_cache
             WHERE updated_at < ?
             ORDER BY updated_at ASC
             LIMIT ?
          )`
    )
    .bind(olderThanIso, olderThanIso, limit)
    .run();

  const changes = (result as unknown as { meta?: { changes?: number } })?.meta?.changes;
  return typeof changes === "number" ? changes : 0;
};

/**
 * AI 生成失败标记。
 *
 * 复用 response_cache 表：etag 用固定值，于是「同一天内同一地址只写一次」，
 * D1 侧自动去重；TTL 由 cached_at 的年龄判断，不需要额外的过期机制。
 */
export const readAiFailMarker = async (
  db: D1Database,
  cacheKey: string,
  ttlSeconds: number,
  now: Date = new Date()
): Promise<boolean> => {
  const row = await readResponseCacheRow(db, cacheKey);
  if (!row) {
    return false;
  }
  const cachedAt = Date.parse(row.cachedAt);
  if (!Number.isFinite(cachedAt)) {
    return false;
  }
  return (now.getTime() - cachedAt) / 1000 < ttlSeconds;
};

/** 标记生成失败。已有新鲜标记时跳过写入，避免每次重试都打一行。 */
export const writeAiFailMarker = async (
  db: D1Database,
  cacheKeys: string[],
  now: string,
  ttlSeconds: number
): Promise<number> => {
  if (cacheKeys.length === 0) {
    return 0;
  }

  let written = 0;
  const batchSize = 25;
  for (let index = 0; index < cacheKeys.length; index += batchSize) {
    const batch = cacheKeys.slice(index, index + batchSize);
    const statements = batch.map((cacheKey) =>
      db
        .prepare(
          `INSERT INTO response_cache (cache_key, version, etag, payload_json, cached_at, updated_at)
           VALUES (?, '1', ?, '"1"', ?, ?)
           ON CONFLICT(cache_key) DO UPDATE SET
             cached_at  = excluded.cached_at,
             updated_at = excluded.updated_at
           WHERE response_cache.cached_at < ?`
        )
        // WHERE 让「标记还新鲜」的写入变成 no-op，同样省掉行写入额度。
        .bind(cacheKey, cacheKey, now, now, new Date(Date.parse(now) - ttlSeconds * 1000).toISOString())
    );
    const results = await db.batch(statements);
    written += results.filter((result) => (result as { success?: boolean })?.success !== false).length;
  }

  return written;
};
