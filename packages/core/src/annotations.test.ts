import { describe, expect, it } from "vitest";

import {
  aggregatePolymarketHolders,
  normalizeAddress,
  resolvePolymarketMarketSlug
} from "./index";

describe("normalizeAddress", () => {
  it("normalizes valid polygon addresses", () => {
    expect(normalizeAddress("0x3EAE62BDE2D83ABA0FE84018921B2693EC645E6D")).toBe(
      "0x3eae62bde2d83aba0fe84018921b2693ec645e6d"
    );
  });

  it("rejects truncated addresses", () => {
    expect(normalizeAddress("0x3eae...5e6d")).toBeNull();
  });
});

describe("aggregatePolymarketHolders", () => {
  it("deduplicates holders across outcome token groups and sums per outcome", () => {
    const holders = aggregatePolymarketHolders([
      {
        token: "yes-token",
        holders: [
          {
            proxyWallet: "0x3eae62bde2d83aba0fe84018921b2693ec645e6d",
            bio: "",
            asset: "yes-token",
            pseudonym: "Kooky-Certification",
            amount: 200,
            displayUsernamePublic: true,
            outcomeIndex: 0,
            name: "insidero",
            profileImage: "",
            profileImageOptimized: "",
            verified: false
          }
        ]
      },
      {
        token: "no-token",
        holders: [
          {
            proxyWallet: "0x3eae62bde2d83aba0fe84018921b2693ec645e6d",
            bio: "",
            asset: "no-token",
            pseudonym: "",
            amount: 15.5,
            displayUsernamePublic: false,
            outcomeIndex: 1,
            name: "",
            profileImage: "",
            profileImageOptimized: "",
            verified: false
          }
        ]
      }
    ]);

    expect(holders).toHaveLength(1);
    expect(holders[0]?.displayName).toBe("insidero");
    expect(holders[0]?.amount).toBe(215.5);
    expect(holders[0]?.amountByOutcome).toEqual([
      { outcomeIndex: 0, amount: 200 },
      { outcomeIndex: 1, amount: 15.5 }
    ]);
  });
});

describe("resolvePolymarketMarketSlug", () => {
  it("prefers the last event path segment", () => {
    expect(resolvePolymarketMarketSlug("/zh/event/powell-bingo-march/powell-bingo-march")).toBe(
      "powell-bingo-march"
    );
  });

  it("falls back to Next.js dehydrated query data", () => {
    expect(
      resolvePolymarketMarketSlug(undefined, {
        query: { slug: ["event-slug", "market-slug"] }
      })
    ).toBe("market-slug");
  });
});
