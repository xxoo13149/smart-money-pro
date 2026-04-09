import { describe, expect, it } from "vitest";

import { computeWalletMetrics, computeDashboardSummary } from "./analytics";
import { generateAlertEvents, deriveSystemLabels } from "./alerts";
import { alertEvents, walletLabels, wallets } from "./mock-data";

describe("computeWalletMetrics", () => {
  it("computes weather wallet metrics for the tracked wallets", () => {
    const metrics = computeWalletMetrics(wallets[0]!);

    expect(metrics.weatherWinRate).toBeGreaterThanOrEqual(60);
    expect(metrics.averageEntryLeadMinutes).toBeGreaterThan(0);
    expect(metrics.last30Trades.length).toBeGreaterThan(0);
  });
});

describe("deriveSystemLabels", () => {
  it("adds explainable system labels without mutating existing user labels", () => {
    const derived = deriveSystemLabels(wallets, walletLabels);
    const systemLabels = derived.filter((label) => label.source === "system");

    expect(systemLabels.some((label) => label.name === "Weather专精")).toBe(true);
    expect(systemLabels.some((label) => label.name === "PnL曲线稳健")).toBe(true);
    expect(derived.filter((label) => label.source === "user").length).toBe(walletLabels.length);
  });
});

describe("generateAlertEvents", () => {
  it("generates red flag alerts on top of the seeded alerts", () => {
    const generated = generateAlertEvents(wallets);

    expect(generated.length).toBeGreaterThan(alertEvents.length);
    expect(generated.some((event) => event.eventType === "chasing_entry")).toBe(true);
    expect(generated.some((event) => event.eventType === "sector_rotation")).toBe(true);
  });
});

describe("computeDashboardSummary", () => {
  it("aggregates summary metrics for the workspace", () => {
    const summary = computeDashboardSummary(wallets, 3);

    expect(summary.trackedWallets).toBe(wallets.length);
    expect(summary.openAlerts).toBe(3);
    expect(summary.averageWeatherWinRate).toBeGreaterThan(0);
  });
});
