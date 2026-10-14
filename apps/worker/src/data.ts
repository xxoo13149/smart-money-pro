import {
  aggregatePolymarketHolders,
  type AnnotatedHolder,
  type HolderSurfaceHint,
  type MarketAnnotationResolvedBy,
  type MarketAnnotationResponse
} from "@weather-smart-money/core";
import {
  MARKET_ANNOTATION_CACHE_TTL_SECONDS,
  bootstrapSmartMoneyDb,
  getDatasetVersion,
  listAddressSummaries,
  readMarketAnnotationCacheRow,
  upsertMarketAnnotationCache,
  readResponseCacheRow,
  upsertResponseCacheIfChanged
} from "@weather-smart-money/data";

import type { Env } from "./env";
import {
  enrichAddressSummariesWithAiHoverNotes,
  type WorkerWaitUntilContext
} from "./hover-note-ai";
import { hashValue, isoNow } from "./utils";

const SCHEMA_READY = new Map<string, Promise<void>>();

/**
 * Edge cache 的 TTL。它不消耗任何写入额度，是真正的热路径层，
 * 所以可以保持很短以保证新鲜度；持久层交给 D1。
 */
const EDGE_CACHE_TTL_SECONDS = 60;


interface GammaMarketResponse {
  conditionId: string;
  slug: string;
  question: string;
  outcomes: string[] | string;
  groupItemTitle?: string;
}

interface GammaEventResponse {
  id: string;
  slug: string;
  title: string;
  markets?: GammaMarketResponse[];
}

interface ResolvedMarketMetadata {
  pageSlug: string;
  title: string;
  primaryConditionId: string;
  conditionIds: string[];
  outcomes: string[];
  resolvedBy: MarketAnnotationResolvedBy;
}

interface CacheEnvelope<T> {
  etag: string;
  payload: T;
  cachedAt: string;
}

const buildScopeKey = (env: Env) => env.PUBLIC_EXTENSION_BASE_URL || "default";
const POLYMARKET_SITE_ORIGIN = "https://polymarket.com";

const parseOutcomes = (value: string[] | string) => {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string");
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const fetchJson = async <T,>(input: string) => {
  const response = await fetch(input, {
    headers: {
      Accept: "application/json"
    },
    ...( { cf: { cacheTtl: 0 } } as RequestInit )
  } as RequestInit);

  if (!response.ok) {
    throw new Error(`upstream request failed: ${response.status}`);
  }

  return (await response.json()) as T;
};

const fetchJsonOrNull = async <T,>(input: string) => {
  const response = await fetch(input, {
    headers: {
      Accept: "application/json"
    },
    ...( { cf: { cacheTtl: 0 } } as RequestInit )
  } as RequestInit);

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`upstream request failed: ${response.status}`);
  }

  return (await response.json()) as T;
};

const fetchText = async (input: string) => {
  const response = await fetch(input, {
    headers: {
      Accept: "text/html,application/xhtml+xml"
    },
    ...( { cf: { cacheTtl: 0 } } as RequestInit )
  } as RequestInit);

  if (!response.ok) {
    throw new Error(`upstream request failed: ${response.status}`);
  }

  return response.text();
};

const buildResolvedMarketMetadata = (
  pageSlug: string,
  title: string,
  markets: Array<Pick<GammaMarketResponse, "conditionId" | "slug" | "question" | "outcomes" | "groupItemTitle">>,
  resolvedBy: MarketAnnotationResolvedBy
): ResolvedMarketMetadata => {
  const normalizedMarkets = markets
    .filter((market) => typeof market.conditionId === "string" && market.conditionId.trim().length > 0)
    .map((market) => ({
      conditionId: market.conditionId.trim(),
      slug: market.slug?.trim() || pageSlug,
      title: market.groupItemTitle?.trim() || market.question?.trim() || market.slug?.trim() || market.conditionId,
      outcomes: parseOutcomes(market.outcomes)
    }));

  const conditionIds = Array.from(new Set(normalizedMarkets.map((market) => market.conditionId)));
  if (conditionIds.length === 0) {
    throw new Error("no condition ids resolved for page slug");
  }

  return {
    pageSlug,
    title,
    primaryConditionId: conditionIds[0] ?? "",
    conditionIds,
    resolvedBy,
    outcomes:
      normalizedMarkets.length === 1
        ? normalizedMarkets[0]?.outcomes ?? []
        : normalizedMarkets.map((market) => market.title)
  };
};

const parseEventMetadataFromNextData = (html: string, slug: string) => {
  const match = html.match(
    /<script id="__NEXT_DATA__"[^>]*type="application\/json"[^>]*>([\s\S]*?)<\/script>/i
  );

  if (!match?.[1]) {
    return null;
  }

  try {
    const payload = JSON.parse(match[1]) as {
      props?: { pageProps?: { dehydratedState?: { queries?: unknown[] } } };
    };
    const queries = payload.props?.pageProps?.dehydratedState?.queries;
    if (!Array.isArray(queries)) {
      return null;
    }

    const eventData = queries
      .map((query) => (isObject(query) ? query : null))
      .find((query) => {
        const queryKey = query?.queryKey;
        if (!Array.isArray(queryKey) || queryKey[0] !== "/api/event/slug") {
          return false;
        }

        const querySlug = typeof queryKey[1] === "string" ? queryKey[1].trim() : "";
        return !querySlug || querySlug === slug;
      });

    const data = isObject(eventData?.state) && isObject(eventData.state.data) ? eventData.state.data : null;
    if (!data) {
      return null;
    }

    const title = typeof data.title === "string" && data.title.trim() ? data.title.trim() : slug;
    const pageSlug = typeof data.slug === "string" && data.slug.trim() ? data.slug.trim() : slug;
    const markets = Array.isArray(data.markets)
      ? data.markets.filter(isObject).map((market) => ({
          conditionId: typeof market.conditionId === "string" ? market.conditionId : "",
          slug: typeof market.slug === "string" ? market.slug : pageSlug,
          question: typeof market.question === "string" ? market.question : title,
          outcomes: Array.isArray(market.outcomes) || typeof market.outcomes === "string" ? market.outcomes : [],
          groupItemTitle: typeof market.groupItemTitle === "string" ? market.groupItemTitle : undefined
        }))
      : [];

    return buildResolvedMarketMetadata(pageSlug, title, markets, "next_data_event");
  } catch {
    return null;
  }
};

const resolveMarketMetadata = async (env: Env, slug: string): Promise<ResolvedMarketMetadata> => {
  const gammaBaseUrl = env.POLYMARKET_GAMMA_URL?.trim() || "https://gamma-api.polymarket.com";
  const gammaOrigin = gammaBaseUrl.replace(/\/$/, "");

  const event = await fetchJsonOrNull<GammaEventResponse>(
    `${gammaOrigin}/events/slug/${encodeURIComponent(slug)}`
  );
  if (event?.markets?.length) {
    return buildResolvedMarketMetadata(
      event.slug?.trim() || slug,
      event.title?.trim() || slug,
      event.markets,
      "event_slug"
    );
  }

  const market =
    (await fetchJsonOrNull<GammaMarketResponse>(
      `${gammaOrigin}/markets/slug/${encodeURIComponent(slug)}`
    )) ??
    (await fetchJsonOrNull<GammaMarketResponse[]>(
      `${gammaOrigin}/markets?slug=${encodeURIComponent(slug)}`
    ))?.[0];

  if (market) {
    return buildResolvedMarketMetadata(slug, market.question?.trim() || slug, [market], "market_slug");
  }

  const html = await fetchText(`${POLYMARKET_SITE_ORIGIN}/event/${encodeURIComponent(slug)}`);
  const nextDataMetadata = parseEventMetadataFromNextData(html, slug);
  if (nextDataMetadata) {
    return nextDataMetadata;
  }

  throw new Error(`market metadata not found for slug: ${slug}`);
};

const getCacheRequest = (env: Env, pathname: string, search: URLSearchParams) => {
  const url = new URL(pathname, env.PUBLIC_EXTENSION_BASE_URL);
  url.search = search.toString();
  return new Request(url.toString(), { method: "GET" });
};

const readEdgeCache = async <T,>(request: Request) => {
  const cache = (caches as unknown as { default: Cache }).default;
  const cached = await cache.match(request);
  if (!cached) {
    return null;
  }

  return (await cached.json()) as CacheEnvelope<T>;
};

// 缓存是优化，不是依赖。Cache API 和 KV 都可能因为配额、网络或瞬时故障拒绝写入，
// 而此时 payload 已经构建完成、内容完全正确。让写入失败冒泡出去，等于为了省一次
// 缓存写入而丢弃一整份好数据 —— 这正是 KV 配额耗尽时市场标注整体退化成 error 的原因。
// 所以这里吞掉所有写入错误：写不进去只是下次慢一点，不该让本次请求失败。
const writeEdgeCache = async <T,>(request: Request, envelope: CacheEnvelope<T>, ttlSeconds: number) => {
  const cache = (caches as unknown as { default: Cache }).default;
  try {
    await cache.put(
      request,
      new Response(JSON.stringify(envelope), {
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": `public, max-age=${ttlSeconds}`
        }
      })
    );
    return true;
  } catch (error) {
    console.warn("edge cache put failed", {
      error: error instanceof Error ? error.message : String(error)
    });
    return false;
  }
};

// ---- D1 缓存层（KV 之前的替代方案，见 MARKET_ANNOTATION_CACHE_TTL_SECONDS 注释） ----

/**
 * D1 写入也是 best-effort。
 *
 * D1 额度比 KV 宽 100 倍，但「缓存写不进去就让请求失败」这个错误依然要避免：
 * payload 此时已经构建完成、内容正确，写失败只该影响下次快不快。
 */
const writeCacheRowBestEffort = async <T>(
  label: string,
  run: () => Promise<void>
): Promise<boolean> => {
  try {
    await run();
    return true;
  } catch (error) {
    console.warn(`${label} write failed`, { error: error instanceof Error ? error.message : String(error) });
    return false;
  }
};

const parseCacheEnvelope = <T,>(row: { etag: string; payloadJson: string; cachedAt: string } | null): CacheEnvelope<T> | null => {
  if (!row) {
    return null;
  }
  try {
    return {
      etag: row.etag,
      payload: JSON.parse(row.payloadJson) as T,
      cachedAt: row.cachedAt
    };
  } catch (error) {
    // 缓存行损坏时必须当成「没缓存」而不是抛错，否则一行坏数据会永久卡死这个市场。
    console.warn("cache payload parse failed", { error: error instanceof Error ? error.message : String(error) });
    return null;
  }
};

/**
 * 从 D1 读缓存。
 *
 * labelsVersion 不匹配时仍然返回，但标记为 stale —— 这样标签刚更新时，
 * 用户还能看到上一版标注，而不是整页空白。调用方据此决定要不要后台重建。
 */
const readAnnotationCacheRow = async <T,>(
  env: Env,
  slug: string,
  labelsVersion: string
): Promise<{ envelope: CacheEnvelope<T>; stale: boolean } | null> => {
  try {
    const row = await readMarketAnnotationCacheRow(env.SMART_MONEY_DB, slug);
    const envelope = parseCacheEnvelope<T>(row);
    if (!envelope || !row) {
      return null;
    }
    return { envelope, stale: row.labelsVersion !== labelsVersion };
  } catch (error) {
    console.warn("D1 annotation cache read failed", {
      slug,
      error: error instanceof Error ? error.message : String(error)
    });
    return null;
  }
};

const writeAnnotationCacheRow = async <T,>(
  env: Env,
  slug: string,
  labelsVersion: string,
  envelope: CacheEnvelope<T>
): Promise<boolean> =>
  writeCacheRowBestEffort("D1 annotation cache", async () => {
    await upsertMarketAnnotationCache(env.SMART_MONEY_DB, {
      slug,
      labelsVersion,
      etag: envelope.etag,
      payloadJson: JSON.stringify(envelope.payload),
      cachedAt: envelope.cachedAt,
      now: isoNow()
    });
  });

export const ensureSchema = async (env: Env) => {
  const scopeKey = buildScopeKey(env);
  if (!SCHEMA_READY.has(scopeKey)) {
    const ready = (async () => {
      await bootstrapSmartMoneyDb(env.SMART_MONEY_DB);
    })();
    SCHEMA_READY.set(scopeKey, ready);
    ready.catch(() => {
      if (SCHEMA_READY.get(scopeKey) === ready) {
        SCHEMA_READY.delete(scopeKey);
      }
    });
  }

  const ready = SCHEMA_READY.get(scopeKey);
  if (ready) {
    await ready;
  }
};

export const getCacheEnvelopeEtag = async <T,>(payload: T) => `"${await hashValue(JSON.stringify(payload))}"`;

export interface MarketAnnotationCacheRead {
  envelope: CacheEnvelope<MarketAnnotationResponse>;
  /**
   * true = 缓存里的 labelsVersion 和当前不一致，或已超过新鲜期。
   * 调用方应当把它当成「可用的旧数据」：先返回给用户，再在后台重建。
   */
  stale: boolean;
}

/**
 * 读缓存。Edge cache 是 L1（不消耗任何写入额度，同 colo 内直接命中），
 * D1 是 L2。命中 D1 后顺手回填 Edge cache，让后续请求连 D1 都不用查。
 */
export const readMarketAnnotationCache = async (
  env: Env,
  slug: string,
  labelsVersion: string
): Promise<MarketAnnotationCacheRead | null> => {
  const search = new URLSearchParams({ slug, labelsVersion });
  const edgeRequest = getCacheRequest(env, "/__cache/market-annotations", search);

  const edgeEnvelope = await readEdgeCache<MarketAnnotationResponse>(edgeRequest);
  if (edgeEnvelope) {
    // Edge cache 的 TTL 就是新鲜期本身，命中即新鲜。
    return { envelope: edgeEnvelope, stale: false };
  }

  const row = await readAnnotationCacheRow<MarketAnnotationResponse>(env, slug, labelsVersion);
  if (!row) {
    return null;
  }

  await writeEdgeCache(edgeRequest, row.envelope, EDGE_CACHE_TTL_SECONDS);

  const ageSeconds = (Date.now() - Date.parse(row.envelope.cachedAt)) / 1000;
  const expired = !Number.isFinite(ageSeconds) || ageSeconds > MARKET_ANNOTATION_CACHE_TTL_SECONDS;
  return { envelope: row.envelope, stale: row.stale || expired };
};

/**
 * 写缓存。Edge cache 照写（免费），D1 只在内容真的变了时才落一行 ——
 * 这是把写入量从「请求数」压到「变化数」的关键，人数增加不再线性消耗额度。
 */
export const writeMarketAnnotationCache = async (
  env: Env,
  slug: string,
  labelsVersion: string,
  envelope: CacheEnvelope<MarketAnnotationResponse>
) => {
  const search = new URLSearchParams({ slug, labelsVersion });
  const edgeRequest = getCacheRequest(env, "/__cache/market-annotations", search);
  await writeEdgeCache(edgeRequest, envelope, EDGE_CACHE_TTL_SECONDS);
  await writeAnnotationCacheRow(env, slug, labelsVersion, envelope);
};

/**
 * 构建失败时的兜底：返回任意版本的上一份 payload。
 * 以前这需要额外维护一条 `latest:` KV key，每次构建都写一遍（写入量直接翻倍），
 * 现在 D1 里本来就只有一行，标签版本变化也只会 UPSERT 覆盖，天然就是「上一份」。
 */
export const readStaleMarketAnnotation = async (
  env: Env,
  slug: string
): Promise<CacheEnvelope<MarketAnnotationResponse> | null> => {
  const row = await readAnnotationCacheRow<MarketAnnotationResponse>(env, slug, "");
  return row?.envelope ?? null;
};

// labels lookup / address search 的缓存也一并离开 KV。
// 这两类的 key 是「地址组合的哈希」，空间几乎无穷；旧实现把 labels 版本拼进 key，
// 每改一次标签就换一批新 key，配上 KV 一天 1000 次写入必然打满。
// 现在 key 不含版本，版本作为字段比对，正常浏览路径上 etag 基本不变，写入会被跳过。
export const readLabelsLookupCache = async <T,>(env: Env, key: string, version?: string) => {
  try {
    const row = await readResponseCacheRow(env.SMART_MONEY_DB, key);
    if (!row) {
      return null;
    }
    const envelope = parseCacheEnvelope<T>(row);
    if (!envelope) {
      return null;
    }
    // 版本不一致时仍然返回，但交给调用方判断新鲜度，避免标签刚更新就整页空白。
    return { envelope, stale: version !== undefined && row.version !== version };
  } catch (error) {
    console.warn("D1 response cache read failed", {
      key,
      error: error instanceof Error ? error.message : String(error)
    });
    return null;
  }
};

export const writeLabelsLookupCache = async <T,>(
  env: Env,
  key: string,
  version: string,
  envelope: CacheEnvelope<T>
) =>
  writeCacheRowBestEffort("D1 response cache", async () => {
    await upsertResponseCacheIfChanged(env.SMART_MONEY_DB, {
      cacheKey: key,
      version,
      etag: envelope.etag,
      payloadJson: JSON.stringify(envelope.payload),
      cachedAt: envelope.cachedAt,
      now: isoNow()
    });
  });

const collectHolderSummaries = (holders: AnnotatedHolder[]) => {
  const holdersWithSummary = holders.map((holder) => ({
    ...holder,
    summary: holder.summary ?? undefined
  }));
  const matchedSummaryCount = holdersWithSummary.filter((holder) => Boolean(holder.summary)).length;
  return { holdersWithSummary, matchedSummaryCount };
};

const buildHolderSurfaceHints = (holders: AnnotatedHolder[]): HolderSurfaceHint[] =>
  holders
    .filter((holder) => holder.summary)
    .slice(0, 8)
    .map((holder) => ({
      normalizedAddress: holder.normalizedAddress,
      alias: holder.summary?.alias,
      badges: holder.summary?.badges.map((badge) => badge.text) ?? [],
      watchlisted: holder.summary?.watchlisted ?? false,
      detailUrl: holder.summary?.detailUrl
    }));

export const buildMarketAnnotationPayload = async (
  env: Env,
  slug: string,
  ctx?: WorkerWaitUntilContext
): Promise<MarketAnnotationResponse> => {
  const dataBaseUrl = env.POLYMARKET_DATA_URL?.trim() || "https://data-api.polymarket.com";
  const metadata = await resolveMarketMetadata(env, slug);
  const holders = await fetchJson<unknown[]>(
    `${dataBaseUrl.replace(/\/$/, "")}/holders?market=${encodeURIComponent(metadata.conditionIds.join(","))}&limit=20`
  );

  const aggregatedHolders = aggregatePolymarketHolders(holders as Parameters<typeof aggregatePolymarketHolders>[0]);
  const summaries = await enrichAddressSummariesWithAiHoverNotes(
    env,
    await listAddressSummaries(env.SMART_MONEY_DB, {
      chain: "polygon",
      normalizedAddresses: aggregatedHolders.map((holder) => holder.normalizedAddress),
      adminBaseUrl: env.ADMIN_BASE_URL
    }),
    {
      executionContext: ctx,
      backgroundOnMiss: true
    }
  );
  const summaryByAddress = new Map(
    summaries.map((summary) => [summary.normalizedAddress, summary] as const)
  );
  const labelsVersion = `v${await getDatasetVersion(env.SMART_MONEY_DB, "address_labels")}`;
  const holdersWithSummary = aggregatedHolders.map((holder) => ({
    ...holder,
    summary: summaryByAddress.get(holder.normalizedAddress)
  }));
  const matchedSummaryCount = holdersWithSummary.filter((holder) => holder.summary).length;
  const holderSurfaceHints = buildHolderSurfaceHints(holdersWithSummary);

  return {
    market: {
      slug: metadata.pageSlug,
      conditionId: metadata.primaryConditionId,
      title: metadata.title,
      outcomes: metadata.outcomes
    },
    holders: holdersWithSummary,
    labelsVersion,
    refreshedAt: isoNow(),
    sourceStatus: "live",
    matchedSummaryCount,
    resolvedBy: metadata.resolvedBy,
    holderSurfaceHints: holderSurfaceHints.length ? holderSurfaceHints : undefined
  };
};

export const refreshMarketAnnotationPayloadSummaries = async (
  env: Env,
  payload: MarketAnnotationResponse,
  overrides?: Partial<Pick<MarketAnnotationResponse, "labelsVersion" | "refreshedAt" | "sourceStatus">>,
  ctx?: WorkerWaitUntilContext
): Promise<MarketAnnotationResponse> => {
  const summaries = await enrichAddressSummariesWithAiHoverNotes(
    env,
    await listAddressSummaries(env.SMART_MONEY_DB, {
      chain: "polygon",
      normalizedAddresses: payload.holders.map((holder) => holder.normalizedAddress),
      adminBaseUrl: env.ADMIN_BASE_URL
    }),
    {
      executionContext: ctx,
      backgroundOnMiss: true
    }
  );
  const summaryByAddress = new Map(
    summaries.map((summary) => [summary.normalizedAddress, summary] as const)
  );
  const holders = payload.holders.map((holder) => ({
    ...holder,
    summary: summaryByAddress.get(holder.normalizedAddress)
  }));
  const { matchedSummaryCount } = collectHolderSummaries(holders);
  const holderSurfaceHints = buildHolderSurfaceHints(holders);

  return {
    ...payload,
    holders,
    labelsVersion: overrides?.labelsVersion ?? payload.labelsVersion,
    refreshedAt: overrides?.refreshedAt ?? payload.refreshedAt,
    sourceStatus: overrides?.sourceStatus ?? payload.sourceStatus,
    matchedSummaryCount,
    holderSurfaceHints: holderSurfaceHints.length ? holderSurfaceHints : undefined
  };
};

export const buildErrorMarketAnnotationPayload = async (env: Env, slug: string) => ({
  market: {
    slug,
    conditionId: "",
    title: slug,
    outcomes: []
  },
  holders: [],
  labelsVersion: `v${await getDatasetVersion(env.SMART_MONEY_DB, "address_labels")}`,
  refreshedAt: isoNow(),
  sourceStatus: "error",
  matchedSummaryCount: 0,
  resolvedBy: "error"
} satisfies MarketAnnotationResponse);
