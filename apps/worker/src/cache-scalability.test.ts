import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  readMarketAnnotationCache,
  readStaleMarketAnnotation,
  writeMarketAnnotationCache,
  writeLabelsLookupCache,
  readLabelsLookupCache
} from "./data.js";

/**
 * 这些用例锁的是扩展端能扛住多人的两条不变式：
 *
 * 1. **缓存写失败绝不能让请求失败。** KV 免费额度每天只有 1000 次写入，
 *    D1 是 100,000 行/天。以前 KV put() 抛错会冒泡到路由层，
 *    已经构建完成的正确 payload 被一起丢掉，整个标注功能退化成
 *    "降级运行 · market:KV put() limit exceeded for the day."。
 *
 * 2. **写入次数等于真实数据变化次数，而不是请求次数。**
 *    N 个人看同一个市场，应该和 1 个人看一样只写一次。
 *    这是人数增长后还能扛住的关键 —— etag 没变就跳过写入。
 */

const QUOTA_ERROR = new Error("KV put() limit exceeded for the day.");

type D1Call = { sql: string; params: unknown[] };

const createD1Stub = (options: { failWith?: Error | null; rows?: Map<string, Record<string, unknown>> } = {}) => {
  const rows = options.rows ?? new Map<string, Record<string, unknown>>();
  const statements: D1Call[] = [];
  let writes = 0;

  const tableOf = (sql: string) => {
    const match = sql.match(/INTO\s+(\w+)/i) ?? sql.match(/FROM\s+(\w+)/i);
    return match?.[1] ?? "";
  };

  return {
    rows,
    statements,
    get writes() {
      return writes;
    },
    prepare(sql: string) {
      return {
        bind(...params: unknown[]) {
          return {
            async first<T>(): Promise<T | null> {
              if (options.failWith) {
                throw options.failWith;
              }
              const table = tableOf(sql);
              const key = String(params[0] ?? "");
              const row = rows.get(`${table}:${key}`);
              return (row as T) ?? null;
            },
            async run() {
              if (options.failWith) {
                throw options.failWith;
              }
              writes += 1;
              statements.push({ sql, params });
              const table = tableOf(sql);
              const key = String(params[0] ?? "");
              // 复刻真实 D1：SELECT 里写了 AS 的列名会以别名返回，
              // 所以存的时候就直接存成别名后的形状，否则读取侧拿到 undefined。
              rows.set(`${table}:${key}`, {
                cacheKey: key,
                slug: key,
                labelsVersion: params[1],
                version: params[1],
                etag: params[2],
                payloadJson: params[3],
                cachedAt: params[4],
                updatedAt: params[5]
              });
              return { success: true };
            },
            async all<T>(): Promise<{ results: T[] }> {
              return { results: [] };
            }
          };
        }
      };
    },
    async batch() {
      return [];
    }
  };
};

const createEnv = (d1: ReturnType<typeof createD1Stub>) =>
  ({
    SMART_MONEY_DB: d1,
    PUBLIC_EXTENSION_BASE_URL: "https://app.example.com"
  }) as never;

const makeEnvelope = (etag: string, marker: string) => ({
  etag,
  cachedAt: new Date().toISOString(),
  payload: {
    market: { slug: marker, conditionId: "c", title: marker, outcomes: [] },
    holders: [],
    labelsVersion: "v1",
    refreshedAt: new Date().toISOString(),
    sourceStatus: "live" as const,
    matchedSummaryCount: 0,
    resolvedBy: "event_slug" as const
  }
});

/** Workers runtime 才有 caches，node 测试环境里补一个最小实现。 */
const stubEdgeCache = () => {
  const store = new Map<string, string>();
  vi.stubGlobal("caches", {
    default: {
      match: vi.fn(async (request: Request) => {
        const body = store.get(request.url);
        // 复刻真实 Cache API：match 返回 Response，调用方再 .json()。
        return body === undefined ? undefined : new Response(body, { headers: { "Content-Type": "application/json" } });
      }),
      put: vi.fn(async (request: Request, response: Response) => {
        store.set(request.url, await response.text());
      })
    }
  });
  return store;
};

describe("D1 缓存层的可扩展性保证", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    stubEdgeCache();
  });

  it("D1 写入失败时 writeMarketAnnotationCache 不抛错", async () => {
    const d1 = createD1Stub({ failWith: QUOTA_ERROR });
    await expect(
      writeMarketAnnotationCache(createEnv(d1), "quota-slug", "v1", makeEnvelope('"a"', "m"))
    ).resolves.toBeUndefined();
  });

  it("D1 写入失败时 writeLabelsLookupCache 不抛错", async () => {
    const d1 = createD1Stub({ failWith: QUOTA_ERROR });
    // 返回 false 表示没写进去，而不是抛错。
    await expect(
      writeLabelsLookupCache(createEnv(d1), "labels-lookup:x", "v1", makeEnvelope('"a"', "m"))
    ).resolves.toBe(false);
  });

  it("D1 读失败时当作没有缓存，而不是抛错", async () => {
    const d1 = createD1Stub({ failWith: new Error("D1_ERROR: network") });
    await expect(readMarketAnnotationCache(createEnv(d1), "read-fail", "v1")).resolves.toBeNull();
    await expect(readStaleMarketAnnotation(createEnv(d1), "read-fail")).resolves.toBeNull();
    await expect(readLabelsLookupCache(createEnv(d1), "labels-lookup:x", "v1")).resolves.toBeNull();
  });

  it("etag 未变时跳过写入 —— 这是人数增长还能扛住的关键", async () => {
    const d1 = createD1Stub();
    const env = createEnv(d1);

    // 模拟 10 个用户反复请求同一个市场、内容完全没变。
    for (let i = 0; i < 10; i += 1) {
      await writeMarketAnnotationCache(env, "hot-slug", "v1", makeEnvelope('"same"', "hot"));
    }

    expect(d1.writes).toBe(1);
  });

  it("内容真的变了才写入", async () => {
    const d1 = createD1Stub();
    const env = createEnv(d1);

    await writeMarketAnnotationCache(env, "churn-slug", "v1", makeEnvelope('"a"', "m"));
    await writeMarketAnnotationCache(env, "churn-slug", "v1", makeEnvelope('"a"', "m"));
    await writeMarketAnnotationCache(env, "churn-slug", "v1", makeEnvelope('"b"', "m"));

    expect(d1.writes).toBe(2);
  });

  it("标签版本变化走 UPSERT，不新增行", async () => {
    const d1 = createD1Stub();
    const env = createEnv(d1);

    await writeMarketAnnotationCache(env, "versioned-slug", "v1", makeEnvelope('"a"', "m"));
    await writeMarketAnnotationCache(env, "versioned-slug", "v2", makeEnvelope('"a"', "m"));

    // 主键只有 slug，版本是字段，所以改标签仍然只有一行。
    expect(d1.rows.size).toBe(1);
    const insertStatements = d1.statements.filter((call) => /INSERT/i.test(call.sql));
    expect(insertStatements.every((call) => /ON CONFLICT/i.test(call.sql))).toBe(true);
  });

  it("labels lookup 的 key 不含版本，避免改标签时 key 空间膨胀", async () => {
    const d1 = createD1Stub();
    const env = createEnv(d1);

    await writeLabelsLookupCache(env, "labels-lookup:hash1", "v1", makeEnvelope('"a"', "m"));
    await writeLabelsLookupCache(env, "labels-lookup:hash1", "v2", makeEnvelope('"a"', "m"));

    expect(d1.rows.size).toBe(1);
  });

  it("写入后能读回，stale 正确反映版本不一致", async () => {
    const d1 = createD1Stub();
    const env = createEnv(d1);

    await writeMarketAnnotationCache(env, "read-back", "v1", makeEnvelope('"a"', "slug-a"));

    const fresh = await readMarketAnnotationCache(env, "read-back", "v1");
    const stale = await readMarketAnnotationCache(env, "read-back", "v2");

    expect(fresh?.envelope.payload.market.slug).toBe("slug-a");
    expect(fresh?.stale).toBe(false);
    // 标签刚更新时仍能返回上一版数据，而不是整页空白。
    expect(stale?.envelope.payload.market.slug).toBe("slug-a");
    expect(stale?.stale).toBe(true);
  });
});
