import { normalizeAddress, shortenAddress } from "./addressing.js";
import type {
  AnnotatedHolder,
  NormalizedAddress,
  PolymarketTokenHoldersGroup
} from "./types.js";

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const parseNextDataSlug = (value: unknown): string | null => {
  if (!isObject(value)) {
    return null;
  }

  const query = value.query;
  if (isObject(query)) {
    const slug = query.slug;
    if (typeof slug === "string") {
      return slug;
    }
    if (Array.isArray(slug)) {
      const last = slug.at(-1);
      return typeof last === "string" ? last : null;
    }
  }

  const props = value.props;
  if (!isObject(props)) {
    return null;
  }

  const pageProps = props.pageProps;
  if (!isObject(pageProps)) {
    return null;
  }

  const marketSlug = pageProps.mslug;
  return typeof marketSlug === "string" && marketSlug.length > 0 ? marketSlug : null;
};

export const resolvePolymarketMarketSlug = (
  pathname?: string,
  nextData?: unknown
): string | null => {
  if (pathname) {
    const segments = pathname
      .split("/")
      .map((segment) => segment.trim())
      .filter(Boolean);
    const eventIndex = segments.indexOf("event");

    if (eventIndex >= 0) {
      const slug = segments.at(-1);
      if (slug) {
        return slug;
      }
    }
  }

  return parseNextDataSlug(nextData);
};

const GENERATED_ADDRESS_NAME = /^0x[a-fA-F0-9]{40}(?:-\d+)?$/;

const pickHolderDisplayName = (name: string, pseudonym: string, address: NormalizedAddress) => {
  const normalizedName = name.trim();
  const normalizedPseudonym = pseudonym.trim();

  if (normalizedName && !GENERATED_ADDRESS_NAME.test(normalizedName)) {
    return normalizedName;
  }

  if (normalizedPseudonym) {
    return normalizedPseudonym;
  }

  if (normalizedName) {
    return normalizedName;
  }

  return shortenAddress(address);
};

export const aggregatePolymarketHolders = (
  groups: PolymarketTokenHoldersGroup[]
): AnnotatedHolder[] => {
  const aggregated = new Map<
    NormalizedAddress,
    {
      proxyWallet: string;
      displayName: string;
      amount: number;
      amountByOutcome: Map<number, number>;
    }
  >();

  groups.forEach((group) => {
    group.holders.forEach((holder) => {
      const normalizedAddress = normalizeAddress(holder.proxyWallet);
      if (!normalizedAddress) {
        return;
      }

      const current = aggregated.get(normalizedAddress) ?? {
        proxyWallet: holder.proxyWallet,
        displayName: pickHolderDisplayName(holder.name, holder.pseudonym, normalizedAddress),
        amount: 0,
        amountByOutcome: new Map<number, number>()
      };

      current.amount += holder.amount;
      current.amountByOutcome.set(
        holder.outcomeIndex,
        (current.amountByOutcome.get(holder.outcomeIndex) ?? 0) + holder.amount
      );

      if (!current.displayName || current.displayName === shortenAddress(normalizedAddress)) {
        current.displayName = pickHolderDisplayName(holder.name, holder.pseudonym, normalizedAddress);
      }

      aggregated.set(normalizedAddress, current);
    });
  });

  return [...aggregated.entries()]
    .map(([normalizedAddress, holder]) => {
      const amountByOutcome = [...holder.amountByOutcome.entries()]
        .map(([outcomeIndex, amount]) => ({ outcomeIndex, amount }))
        .sort((left, right) => right.amount - left.amount);

      return {
        proxyWallet: holder.proxyWallet,
        normalizedAddress,
        displayName: holder.displayName,
        outcomeIndex: amountByOutcome[0]?.outcomeIndex ?? 0,
        amount: Number(holder.amount.toFixed(6)),
        amountByOutcome: amountByOutcome.map((item) => ({
          outcomeIndex: item.outcomeIndex,
          amount: Number(item.amount.toFixed(6))
        }))
      };
    })
    .sort((left, right) => right.amount - left.amount);
};
