import { describe, expect, it } from "vitest";

import {
  FINDER_LABEL_CATALOG,
  HIDDEN_LABEL_KINDS,
  fallbackFinderLabelMeta,
  getFinderLabelMeta,
  getLabelKindTone
} from "./finder-labels.js";
import { getAddressBadgePriority, getLabelKindPriority } from "./taxonomy.js";

describe("finder label catalog", () => {
  it("maps core screening keys with primary signal kinds", () => {
    const meta = getFinderLabelMeta("high_daily_region_profit");
    expect(meta?.kind).toBe("payout_region");
    expect(meta?.group).toBe("core_screening");
    expect(meta?.signalKind).toBe("payout_region");
  });

  it("maps new style portrait keys from the Finder big update", () => {
    for (const [key, value] of [
      ["model_follower", "模型共识跟随"],
      ["contrarian_hot", "逆高温"],
      ["contrarian_cold", "逆低温"],
      ["favorite_grinder", "热门价位交易者"],
      ["longshot_hunter", "低价博弈者"],
      ["no_seller", "NO 仓偏好"],
      ["scalper", "短线退出"],
      ["holder", "持有到结算"],
      ["d1_planner", "提前一天布局"],
      ["intraday_sniper", "日内入场"],
      ["city_specialist", "城市专注"]
    ] as const) {
      const meta = getFinderLabelMeta(key);
      expect(meta?.kind, key).toBe("portrait_style");
      expect(meta?.fallbackValue, key).toBe(value);
    }
  });

  it("strips finder:/husky: prefixes on lookup", () => {
    expect(getFinderLabelMeta("finder:favorite_grinder")?.kind).toBe("portrait_style");
    expect(getFinderLabelMeta("husky:no_seller")?.kind).toBe("portrait_style");
  });

  it("maps husky external exclusive keys and operational states", () => {
    expect(getFinderLabelMeta("cashout_closer")?.kind).toBe("husky_profile");
    expect(getFinderLabelMeta("derisk_manager")?.kind).toBe("husky_profile");
    expect(getFinderLabelMeta("globetrotter")?.kind).toBe("husky_profile");
    expect(getFinderLabelMeta("sample_small")?.kind).toBe("data_status");
    expect(getFinderLabelMeta("finder:full_history_pending")?.kind).toBe("data_status");
    expect(getFinderLabelMeta("finder:model_history_pending")?.kind).toBe("data_status");
    expect(getFinderLabelMeta("finder:chain_evidence_pending")?.kind).toBe("data_status");
  });

  it("keeps legacy activity and new wallet keys working", () => {
    expect(getFinderLabelMeta("normal_active")?.kind).toBe("activity_level");
    expect(getFinderLabelMeta("low_active")?.kind).toBe("activity_level");
    expect(getFinderLabelMeta("new_wallet")?.kind).toBe("new_wallet_signal");
    expect(getFinderLabelMeta("hidden_expert_new_wallet")?.fallbackValue).toBe("隐藏高手新钱包");
    expect(getFinderLabelMeta("early_positioning")?.kind).toBe("early_entry_signal");
  });

  it("never drops unknown keys", () => {
    const fallback = fallbackFinderLabelMeta("finder:some_new_label");
    expect(fallback.kind).toBe("portrait_style");
    expect(fallback.fallbackValue).toBe("finder:some_new_label");

    const external = fallbackFinderLabelMeta("husky:some_new_label", "external_calibration_snapshot");
    expect(external.kind).toBe("husky_profile");
    expect(getFinderLabelMeta("definitely-missing")).toBeUndefined();
  });

  it("covers every catalog key with a value", () => {
    for (const meta of Object.values(FINDER_LABEL_CATALOG)) {
      expect(meta.fallbackValue.length, meta.key).toBeGreaterThan(0);
      expect(meta.name.length, meta.key).toBeGreaterThan(0);
    }
  });
});

describe("label tone mapping", () => {
  it("colors core/portrait/external kinds distinctly and keeps legacy neutral", () => {
    expect(getLabelKindTone("payout_region")).toBe("core");
    expect(getLabelKindTone("frequency_region")).toBe("core");
    expect(getLabelKindTone("winrate_region")).toBe("core");
    expect(getLabelKindTone("trader_archetype")).toBe("core");
    expect(getLabelKindTone("portrait_style")).toBe("portrait");
    expect(getLabelKindTone("style")).toBe("portrait");
    expect(getLabelKindTone("husky_profile")).toBe("external");
    expect(getLabelKindTone("data_status")).toBe("ai-review");
    expect(getLabelKindTone("group")).toBe("neutral");
    expect(getLabelKindTone("strategy")).toBe("neutral");
    expect(getLabelKindTone(undefined)).toBe("neutral");
  });

  it("keeps core label kinds ranked above portrait and husky kinds", () => {
    expect(getLabelKindPriority("payout_region")).toBeGreaterThan(
      getLabelKindPriority("portrait_style")
    );
    expect(getLabelKindPriority("portrait_style")).toBeGreaterThan(
      getLabelKindPriority("husky_profile")
    );
    expect(getLabelKindPriority("husky_profile")).toBeGreaterThan(
      getLabelKindPriority("data_status")
    );
  });

  it("ranks tone priority: core above accent above portrait above external", () => {
    const base = { priority: 0, isPrimary: false };
    const score = (tone: Parameters<typeof getAddressBadgePriority>[0]["tone"]) =>
      getAddressBadgePriority({ ...base, tone });
    expect(score("core")).toBeGreaterThan(score("accent"));
    expect(score("accent")).toBeGreaterThan(score("portrait"));
    expect(score("portrait")).toBeGreaterThan(score("external"));
    expect(score("external")).toBeGreaterThan(score("neutral"));
  });

  it("hides data status labels from summary display", () => {
    expect(HIDDEN_LABEL_KINDS.has("data_status")).toBe(true);
    expect(HIDDEN_LABEL_KINDS.has("activity_level")).toBe(true);
    expect(HIDDEN_LABEL_KINDS.has("portrait_style")).toBe(false);
    expect(HIDDEN_LABEL_KINDS.has("husky_profile")).toBe(false);
    expect(HIDDEN_LABEL_KINDS.has("group")).toBe(false);
  });
});
