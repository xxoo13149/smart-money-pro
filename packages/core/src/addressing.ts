import type { ChainId, NormalizedAddress } from "./types.js";

const ADDRESS_PATTERN = /^0x[a-fA-F0-9]{40}$/;

export const normalizeAddress = (value: string): NormalizedAddress | null => {
  const trimmed = value.trim();
  if (!ADDRESS_PATTERN.test(trimmed)) {
    return null;
  }

  return trimmed.toLowerCase() as NormalizedAddress;
};

export const getChainAddressKey = (chain: ChainId, address: string) => {
  const normalized = normalizeAddress(address);
  return normalized ? `${chain}:${normalized}` : null;
};

export const shortenAddress = (value: string, start = 6, end = 4) => {
  if (value.length <= start + end + 3) {
    return value;
  }

  return `${value.slice(0, start)}...${value.slice(-end)}`;
};
