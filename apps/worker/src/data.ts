import {
  aggregatePolymarketHolders,
  type AnnotatedHolder,
  type HolderSurfaceHint,
  type MarketAnnotationResolvedBy,
  type MarketAnnotationResponse
} from "@weather-smart-money/core";
import {
  bootstrapSmartMoneyDb,
  getDatasetVersion,
  listAddressSummaries,
} from "@weather-smart-money/data";

import type { Env } from "./env";
import {
  enrichAddressSummariesWithAiHoverNotes,
  type WorkerWaitUntilContext
} from "./hover-note-ai";
import { hashValue, isoNow } from "./utils";

const SCHEMA_READY = new Map<string, Promise<void>>();
const STALE_TTL_SECONDS = 300;

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

const writeEdgeCache = async <T,>(request: Request, envelope: CacheEnvelope<T>, ttlSeconds: number) => {
  const cache = (caches as unknown as { default: Cache }).default;
  await cache.put(
    request,
    new Response(JSON.stringify(envelope), {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": `public, max-age=${ttlSeconds}`
      }
    })
  );
};

const readKvEnvelope = async <T,>(env: Env, key: string) => {
  const cached = await env.SMART_MONEY_CACHE.get(key, "json");
  return (cached ?? null) as CacheEnvelope<T> | null;
};

const writeKvEnvelope = async <T,>(env: Env, key: string, envelope: CacheEnvelope<T>, ttlSeconds: number) => {
  await env.SMART_MONEY_CACHE.put(key, JSON.stringify(envelope), {
    expirationTtl: ttlSeconds
  });
};

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

export const readMarketAnnotationCache = async (
  env: Env,
  slug: string,
  labelsVersion: string
) => {
  const search = new URLSearchParams({ slug, labelsVersion });
  const edgeRequest = getCacheRequest(env, "/__cache/market-annotations", search);
  const kvKey = `market-annotations:${labelsVersion}:${slug}`;

  const edgeEnvelope = await readEdgeCache<MarketAnnotationResponse>(edgeRequest);
  if (edgeEnvelope) {
    return edgeEnvelope;
  }

  const kvEnvelope = await readKvEnvelope<MarketAnnotationResponse>(env, kvKey);
  if (kvEnvelope) {
    await writeEdgeCache(edgeRequest, kvEnvelope, 60);
  }
  return kvEnvelope;
};

export const writeMarketAnnotationCache = async (
  env: Env,
  slug: string,
  labelsVersion: string,
  envelope: CacheEnvelope<MarketAnnotationResponse>
) => {
  const search = new URLSearchParams({ slug, labelsVersion });
  const edgeRequest = getCacheRequest(env, "/__cache/market-annotations", search);
  const kvKey = `market-annotations:${labelsVersion}:${slug}`;
  const staleKey = `market-annotations:latest:${slug}`;

  await Promise.all([
    writeEdgeCache(edgeRequest, envelope, 60),
    writeKvEnvelope(env, kvKey, envelope, 60),
    writeKvEnvelope(env, staleKey, envelope, STALE_TTL_SECONDS)
  ]);
};

export const readStaleMarketAnnotation = async (env: Env, slug: string) =>
  readKvEnvelope<MarketAnnotationResponse>(env, `market-annotations:latest:${slug}`);

export const readLabelsLookupCache = async <T,>(env: Env, key: string) =>
  readKvEnvelope<T>(env, key);

export const writeLabelsLookupCache = async <T,>(env: Env, key: string, envelope: CacheEnvelope<T>) =>
  writeKvEnvelope(env, key, envelope, 15 * 60);

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
