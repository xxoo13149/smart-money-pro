import {
  aggregatePolymarketHolders,
  type AddressSummary,
  type AddressSearchResult,
  type ChainId,
  type MarketAnnotationResponse,
  normalizeAddress,
  type PolymarketTokenHoldersGroup
} from "@weather-smart-money/core";
import {
  listAddressSummaries as listPersistedAddressSummaries,
  searchAddressSummaries as searchPersistedAddressSummaries
} from "@weather-smart-money/data";

import { lookupAddressSummaries, listWalletRows as listDemoWalletRows } from "./demo-store";
import { getSmartMoneyBindings } from "./cloudflare-env";

interface GammaMarketResponse {
  conditionId: string;
  slug: string;
  question: string;
  outcomes: string[] | string;
}

interface CachedPayload<T> {
  etag: string;
  expiresAt: number;
  payload: T;
}

const encoder = new TextEncoder();
const MARKET_ANNOTATION_TTL_MS = 45_000;
const gammaBaseUrl =
  process.env.POLYMARKET_GAMMA_URL?.trim() || "https://gamma-api.polymarket.com";
const dataBaseUrl =
  process.env.POLYMARKET_DATA_URL?.trim() || "https://data-api.polymarket.com";

const marketAnnotationCache = new Map<string, CachedPayload<MarketAnnotationResponse>>();

const hashText = async (value: string) => {
  const digest = await crypto.subtle.digest("SHA-1", encoder.encode(value));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
};

const createEtag = async (value: unknown) => `"${await hashText(JSON.stringify(value))}"`;

const parseOutcomes = (value: string[] | string): string[] => {
  if (Array.isArray(value)) {
    return value;
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
};

const createLabelsVersion = async (items: AddressSummary[]) =>
  items.length === 0
    ? "empty"
    : hashText(items.map((item) => `${item.normalizedAddress}:${item.version}`).join("|"));

const fetchJson = async <T,>(input: string): Promise<T> => {
  const response = await fetch(input, {
    headers: {
      Accept: "application/json"
    },
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`Request failed (${response.status}) for ${input}`);
  }

  return (await response.json()) as T;
};

const fetchGammaMarket = async (slug: string) => {
  const encodedSlug = encodeURIComponent(slug);
  const market = await fetchJson<GammaMarketResponse>(
    `${gammaBaseUrl.replace(/\/$/, "")}/markets/slug/${encodedSlug}`
  );

  return {
    conditionId: market.conditionId,
    slug: market.slug,
    title: market.question,
    outcomes: parseOutcomes(market.outcomes)
  };
};

const fetchTopHolders = async (conditionId: string) => {
  const url = new URL(`${dataBaseUrl.replace(/\/$/, "")}/holders`);
  url.searchParams.set("market", conditionId);
  url.searchParams.set("limit", "20");

  return fetchJson<PolymarketTokenHoldersGroup[]>(url.toString());
};

const buildErrorPayload = (slug: string): MarketAnnotationResponse => ({
  market: {
    slug,
    conditionId: "",
    title: slug,
    outcomes: []
  },
  holders: [],
  labelsVersion: "empty",
  refreshedAt: new Date().toISOString(),
  sourceStatus: "error"
});

export const lookupAddressSummariesPayload = async (
  addresses: string[],
  options?: { chain?: ChainId; baseUrl?: string }
) => {
  const chain = options?.chain ?? "polygon";
  const baseUrl = options?.baseUrl ?? "";
  const normalizedAddresses = Array.from(
    new Set(
      addresses.flatMap((address) => {
        const normalized = normalizeAddress(address);
        return normalized ? [normalized] : [];
      })
    )
  );
  const bindings = await getSmartMoneyBindings();
  const items = bindings?.SMART_MONEY_DB
    ? await listPersistedAddressSummaries(bindings.SMART_MONEY_DB, {
        chain,
        normalizedAddresses,
        adminBaseUrl: baseUrl
      })
    : lookupAddressSummaries(addresses, options);

  return {
    items,
    version: await createLabelsVersion(items)
  };
};

const searchDemoAddressSummaries = (
  query: string,
  options?: { chain?: ChainId; baseUrl?: string; limit?: number }
): AddressSearchResult[] => {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return [];
  }

  const chain = options?.chain ?? "polygon";
  const limit = Math.max(1, Math.min(25, options?.limit ?? 12));
  const rows = listDemoWalletRows()
    .filter((row) => row.wallet.chain === chain)
    .filter((row) => {
      const searchable = [
        row.wallet.address,
        row.wallet.normalizedAddress,
        row.wallet.displayName,
        row.wallet.alias,
        row.wallet.bio,
        row.wallet.strategyFocus,
        row.wallet.teamNote,
        ...row.labels.flatMap((label) => [label.name, label.value, label.evidence])
      ]
        .filter((value): value is string => Boolean(value))
        .join(" ")
        .toLowerCase();

      return searchable.includes(normalizedQuery);
    })
    .slice(0, limit);

  const summaryByAddress = new Map(
    lookupAddressSummaries(
      rows.map((row) => row.wallet.address),
      options
    ).map((summary) => [summary.normalizedAddress, summary] as const)
  );

  return rows.flatMap((row) => {
    const summary = summaryByAddress.get(row.wallet.normalizedAddress);
    if (!summary) {
      return [];
    }

    const item = {
      ...summary,
      displayName: summary.displayName ?? row.wallet.displayName,
      bio: row.wallet.bio || undefined,
      teamNote: row.wallet.teamNote || undefined
    } satisfies AddressSearchResult;

    return [item];
  });
};

export const searchAddressSummariesPayload = async (
  query: string,
  options?: { chain?: ChainId; baseUrl?: string; limit?: number }
) => {
  const chain = options?.chain ?? "polygon";
  const baseUrl = options?.baseUrl ?? "";
  const bindings = await getSmartMoneyBindings();
  const items = bindings?.SMART_MONEY_DB
    ? await searchPersistedAddressSummaries(bindings.SMART_MONEY_DB, {
        query,
        chain,
        adminBaseUrl: baseUrl,
        limit: options?.limit
      })
    : searchDemoAddressSummaries(query, options);

  return {
    items,
    version: await createLabelsVersion(items)
  };
};

export const buildMarketAnnotations = async (
  slug: string,
  options?: { chain?: ChainId; baseUrl?: string }
): Promise<MarketAnnotationResponse> => {
  const market = await fetchGammaMarket(slug);
  const holdersByToken = await fetchTopHolders(market.conditionId);
  const holders = aggregatePolymarketHolders(holdersByToken);
  const summaries = await lookupAddressSummariesPayload(
    holders.map((holder) => holder.normalizedAddress),
    options
  );
  const summaryMap = new Map(
    summaries.items.map((summary) => [summary.normalizedAddress, summary] as const)
  );

  return {
    market,
    holders: holders.map((holder) => ({
      ...holder,
      summary: summaryMap.get(holder.normalizedAddress)
    })),
    labelsVersion: summaries.version,
    refreshedAt: new Date().toISOString(),
    sourceStatus: "live"
  };
};

export const getMarketAnnotationsResponse = async (
  slug: string,
  options?: {
    chain?: ChainId;
    baseUrl?: string;
    ifNoneMatch?: string | null;
  }
) => {
  const cacheKey = `${options?.chain ?? "polygon"}:${slug}`;
  const cached = marketAnnotationCache.get(cacheKey);
  const now = Date.now();

  if (cached && cached.expiresAt > now) {
    return {
      status: options?.ifNoneMatch === cached.etag ? 304 : 200,
      etag: cached.etag,
      payload: cached.payload
    } as const;
  }

  try {
    const payload = await buildMarketAnnotations(slug, options);
    const etag = await createEtag(payload);

    marketAnnotationCache.set(cacheKey, {
      etag,
      expiresAt: now + MARKET_ANNOTATION_TTL_MS,
      payload
    });

    return {
      status: options?.ifNoneMatch === etag ? 304 : 200,
      etag,
      payload
    } as const;
  } catch {
    if (cached) {
      return {
        status: options?.ifNoneMatch === cached.etag ? 304 : 200,
        etag: cached.etag,
        payload: {
          ...cached.payload,
          refreshedAt: new Date().toISOString(),
          sourceStatus: "stale"
        }
      } as const;
    }

    const payload = buildErrorPayload(slug);
    const etag = await createEtag(payload);
    marketAnnotationCache.set(cacheKey, {
      etag,
      expiresAt: now + 15_000,
      payload
    });

    return {
      status: options?.ifNoneMatch === etag ? 304 : 200,
      etag,
      payload
    } as const;
  }
};
