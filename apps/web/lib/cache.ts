import { NextResponse } from "next/server";

import { getSmartMoneyBindings } from "./cloudflare-env";

// 读缓存：热门读接口（列表/筛选/详情/仪表盘）命中缓存时几乎零 CPU 返回，
// 避免在 Workers Free（10ms CPU）上每次都跑全量 D1 聚合触发 Error 1102。
//
// 三层结构，从快到慢：
//   1. isolate 内存 Map —— 零成本、零写入，同一个 isolate 内的后续请求直接命中
//   2. KV —— 跨 isolate / 跨 colo 共享，但每日写入配额有限（Free 1000 次/账号/天，
//      且与其他项目共用），所以只做「降级缓存」，写入前必须过软 TTL 节流
//   3. 回源 D1 —— 前两层都没有时的兜底
//
// 缓存是优化，不是功能依赖：任何一层出错都必须降级到下一层，绝不能冒泡成 5xx。
//
// 另外这里缓存的是「已经序列化好的 JSON 字符串」而不是对象，
// 避免同一份大列表（地址库 600+ 行约 1.7MB）被 JSON.stringify 两遍。

const GEN_KEY = "smw:cache:gen";
const KEY_PREFIX = "smw:cache:v";
const DEFAULT_TTL_SECONDS = 900;

// KV 写入节流：软 TTL 取硬 TTL 的一半，即同一个 key 在半衰期内不重复写 KV。
// 这样即使接口被高频访问，每日 KV 写入次数也被压到「TTL/软TTL」倍频次上限。
const KV_REFRESH_RATIO = 0.5;

// isolate 内存缓存比 KV 短，但足够覆盖同一 colo 内的连续访问。
const MEMORY_TTL_SECONDS = 60;
// 内存层最多保留的条数，防止大 payload 把 isolate 内存吃满。
const MEMORY_MAX_ENTRIES = 48;

type KvBinding = NonNullable<
  Awaited<ReturnType<typeof getSmartMoneyBindings>>
>["SMART_MONEY_CACHE"];

interface MemoryEntry {
  value: string;
  expiresAt: number;
}

const memoryCache = new Map<string, MemoryEntry>();

// 记录每个 key 最近一次成功写 KV 的时间，用来节流 KV 写入。
const kvWriteThrottle = new Map<string, number>();

const readMemory = (key: string): string | null => {
  const hit = memoryCache.get(key);
  if (!hit) {
    return null;
  }
  if (hit.expiresAt <= Date.now()) {
    memoryCache.delete(key);
    return null;
  }
  return hit.value;
};

const writeMemory = (key: string, value: string, ttlSeconds: number): void => {
  if (memoryCache.size >= MEMORY_MAX_ENTRIES) {
    // 简单淘汰最早过期的若干条，够用且不需要额外排序结构。
    const now = Date.now();
    for (const [existingKey, entry] of memoryCache) {
      if (entry.expiresAt <= now || memoryCache.size >= MEMORY_MAX_ENTRIES) {
        memoryCache.delete(existingKey);
      }
      if (memoryCache.size < MEMORY_MAX_ENTRIES) {
        break;
      }
    }
  }
  memoryCache.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
};

const safeKv = async (): Promise<KvBinding | null> => {
  try {
    const bindings = await getSmartMoneyBindings();
    return bindings?.SMART_MONEY_CACHE ?? null;
  } catch {
    return null;
  }
};

const readGen = async (kv: KvBinding | null): Promise<string> => {
  if (!kv) {
    return "local";
  }
  try {
    return (await kv.get(GEN_KEY)) || "1";
  } catch {
    return "1";
  }
};

export const invalidateWalletCache = async (): Promise<void> => {
  // 写路径变了，内存层必须立刻清掉，否则会读到旧数据。
  memoryCache.clear();
  kvWriteThrottle.clear();

  const kv = await safeKv();
  if (!kv) {
    return;
  }
  try {
    const current = Number.parseInt((await kv.get(GEN_KEY)) || "1", 10);
    const next = (Number.isFinite(current) ? current : 1) + 1;
    await kv.put(GEN_KEY, String(next));
  } catch {
    // 失效失败只是让 KV 里的旧值多留一会儿；
    // 内存层已清空，最坏情况是重新回源一次，不影响正确性。
  }
};

const respond = (serialized: string): NextResponse =>
  new NextResponse(serialized, {
    headers: { "content-type": "application/json; charset=utf-8" }
  });

const loadCached = async (
  kv: KvBinding | null,
  fullKey: string
): Promise<string | null> => {
  if (!kv) {
    return null;
  }
  try {
    const hit = await kv.get(fullKey);
    return typeof hit === "string" ? hit : null;
  } catch {
    // 读缓存失败：直接回源。
    return null;
  }
};

const storeCached = async (
  kv: KvBinding | null,
  fullKey: string,
  serialized: string,
  ttlSeconds: number
): Promise<void> => {
  if (!kv) {
    return;
  }
  // 软 TTL 节流：这个 key 距上次写 KV 还不到半衰期，就跳过写入。
  const lastWrite = kvWriteThrottle.get(fullKey) ?? 0;
  if (Date.now() - lastWrite < ttlSeconds * KV_REFRESH_RATIO * 1000) {
    return;
  }
  try {
    await kv.put(fullKey, serialized, { expirationTtl: ttlSeconds });
    kvWriteThrottle.set(fullKey, Date.now());
  } catch {
    // 写缓存失败（最常见原因是当日 KV 写入配额耗尽 code 10048）：
    // 记一次节流时间，避免在配额耗尽期间每个请求都去撞一次配额错误。
    kvWriteThrottle.set(fullKey, Date.now());
  }
};

// build 返回 undefined 视为「资源不存在」，直接 404，不入缓存
export const cachedJsonOrNotFound = async <T>(
  key: string,
  build: () => Promise<T | undefined>,
  ttlSeconds: number = DEFAULT_TTL_SECONDS
): Promise<NextResponse> => {
  const kv = await safeKv();
  const gen = await readGen(kv);
  const fullKey = `${KEY_PREFIX}:${gen}:${key}`;

  const memoryHit = readMemory(fullKey);
  if (memoryHit !== null) {
    return respond(memoryHit);
  }

  const kvHit = await loadCached(kv, fullKey);
  if (kvHit !== null) {
    writeMemory(fullKey, kvHit, MEMORY_TTL_SECONDS);
    return respond(kvHit);
  }

  const value = await build();
  if (value === undefined) {
    return NextResponse.json({ error: "wallet not found" }, { status: 404 });
  }

  const serialized = JSON.stringify(value);
  writeMemory(fullKey, serialized, Math.min(ttlSeconds, MEMORY_TTL_SECONDS));
  await storeCached(kv, fullKey, serialized, ttlSeconds);
  return respond(serialized);
};

export const cachedJsonResponse = async <T>(
  key: string,
  build: () => Promise<T>,
  ttlSeconds: number = DEFAULT_TTL_SECONDS
): Promise<NextResponse> => {
  const kv = await safeKv();
  const gen = await readGen(kv);
  const fullKey = `${KEY_PREFIX}:${gen}:${key}`;

  const memoryHit = readMemory(fullKey);
  if (memoryHit !== null) {
    return respond(memoryHit);
  }

  const kvHit = await loadCached(kv, fullKey);
  if (kvHit !== null) {
    writeMemory(fullKey, kvHit, MEMORY_TTL_SECONDS);
    return respond(kvHit);
  }

  const serialized = JSON.stringify(await build());
  writeMemory(fullKey, serialized, Math.min(ttlSeconds, MEMORY_TTL_SECONDS));
  await storeCached(kv, fullKey, serialized, ttlSeconds);
  return respond(serialized);
};