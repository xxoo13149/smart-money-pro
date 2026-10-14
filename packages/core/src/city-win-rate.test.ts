import { describe, expect, it } from "vitest";

import {
  MIN_CITY_WIN_RATE_SAMPLE,
  canonicalCityName,
  cityFromMarketSlug,
  isNonCityBucket,
  normalizeCityKey,
  resolveCityDayWinRate,
  resolveCityWinRate
} from "./city-win-rate.js";

describe("resolveCityWinRate", () => {
  it("接受样本充足的仓位口径胜率", () => {
    const view = resolveCityWinRate({ winRate: 0.6041666666, resolvedCount: 48 });
    expect(view.confidence).toBe("trusted");
    expect(view.winRate).toBeCloseTo(0.6041666666, 6);
    // 原始值必须保留，否则数据核对时无法追溯 Finder 的原始输出。
    expect(view.rawWinRate).toBeCloseTo(0.6041666666, 6);
  });

  it("样本不足时压制胜率，但保留原始值", () => {
    const view = resolveCityWinRate({ winRate: 1, resolvedCount: 2 });
    expect(view.confidence).toBe("insufficient");
    // 2/2 = 100% 不许对外展示，但也不能抹掉。
    expect(view.winRate).toBeUndefined();
    expect(view.rawWinRate).toBe(1);
    expect(view.resolvedCount).toBe(2);
  });

  it("胜率越界或非有限时判为 unknown", () => {
    expect(resolveCityWinRate({ winRate: 1.4, resolvedCount: 50 }).confidence).toBe("unknown");
    expect(resolveCityWinRate({ winRate: -0.2, resolvedCount: 50 }).confidence).toBe("unknown");
    expect(resolveCityWinRate({ winRate: Number.NaN, resolvedCount: 50 }).confidence).toBe("unknown");
    expect(resolveCityWinRate({ winRate: undefined, resolvedCount: 50 }).confidence).toBe("unknown");
  });

  it("缺 resolvedCount 时不信任胜率", () => {
    const view = resolveCityWinRate({ winRate: 0.8 });
    expect(view.confidence).toBe("unknown");
    expect(view.winRate).toBeUndefined();
  });

  it("门槛边界：恰好等于门槛时可信", () => {
    expect(resolveCityWinRate({ winRate: 0.4, resolvedCount: MIN_CITY_WIN_RATE_SAMPLE }).confidence)
      .toBe("trusted");
    expect(
      resolveCityWinRate({ winRate: 0.4, resolvedCount: MIN_CITY_WIN_RATE_SAMPLE - 1 }).confidence
    ).toBe("insufficient");
  });

  it("0% 是合法值（真的全亏），不应被当成缺失", () => {
    const view = resolveCityWinRate({ winRate: 0, resolvedCount: 20 });
    expect(view.confidence).toBe("trusted");
    expect(view.winRate).toBe(0);
  });
});

describe("resolveCityDayWinRate", () => {
  it("有 days 时按逐日门槛裁决", () => {
    expect(resolveCityDayWinRate({ dayWinRate: 0.6188, tradeDays: 223 }).confidence).toBe("trusted");
    expect(resolveCityDayWinRate({ dayWinRate: 0.6188, tradeDays: 1 }).confidence).toBe("insufficient");
  });

  it("老 run 没有 days 时是 unknown 而不是 0%", () => {
    const view = resolveCityDayWinRate({ dayWinRate: undefined, tradeDays: undefined });
    expect(view.confidence).toBe("unknown");
    expect(view.winRate).toBeUndefined();
    expect(view.rawWinRate).toBeUndefined();
  });
});

describe("非城市桶过滤", () => {
  it("过滤市场类型与地区桶", () => {
    for (const bucket of ["climate", "AQI", "air", "USA", "Tech", "unknown", "", "  "]) {
      expect(isNonCityBucket(bucket)).toBe(true);
    }
  });

  it("保留真实城市", () => {
    for (const city of ["London", "NYC", "nyc", "上海", "Wuhan", "Buenos Aires"]) {
      expect(isNonCityBucket(city)).toBe(false);
    }
  });
});

describe("城市别名归一", () => {
  it("大小写与缩写归一到同一城市", () => {
    // 真实数据里 NYC(6 钱包/65 仓位) 与 nyc(2 钱包/7 仓位) 是同一座城，
    // 不归一就会在榜单上算成两个城市、且各自胜率都偏。
    expect(canonicalCityName("NYC")).toBe(canonicalCityName("nyc"));
    expect(normalizeCityKey(canonicalCityName("NYC"))).toBe(
      normalizeCityKey(canonicalCityName("nyc"))
    );
  });

  it("New York / New York City / NYC 归一", () => {
    const target = canonicalCityName("New York City");
    expect(canonicalCityName("New York")).toBe(target);
    expect(canonicalCityName("NYC")).toBe(target);
  });

  it("未知城市原样返回，不丢数据", () => {
    expect(canonicalCityName("Kandahar")).toBe("Kandahar");
    expect(canonicalCityName("  Toronto  ")).toBe("Toronto");
  });

  it("归一保持稳定（幂等）", () => {
    const once = canonicalCityName("nyc");
    expect(canonicalCityName(once)).toBe(once);
  });
});

describe("cityFromMarketSlug", () => {
  it("解析 Polymarket 最高温 slug", () => {
    expect(cityFromMarketSlug("highest-temperature-in-london-on-january-5th")).toBe("London");
    expect(cityFromMarketSlug("will-the-highest-temperature-in-nyc-be-above-90f")).toBe(
      "New York City"
    );
    expect(cityFromMarketSlug("highest-temperature-in-shanghai-on-december-25th")).toBe("Shanghai");
  });

  it("剥离序数日期", () => {
    expect(cityFromMarketSlug("highest-temperature-in-austin-on-january-3rd")).toBe("Austin");
    expect(cityFromMarketSlug("highest-temperature-in-austin-on-january-21st")).toBe("Austin");
  });

  it("解析不出来时返回空串，让调用方回退而不是猜", () => {
    expect(cityFromMarketSlug("")).toBe("");
    expect(cityFromMarketSlug(undefined)).toBe("");
    expect(cityFromMarketSlug(null)).toBe("");
  });

  it("解析出来的城市能通过非城市桶校验", () => {
    expect(isNonCityBucket(cityFromMarketSlug("highest-temperature-in-london-on-january-5th"))).toBe(
      false
    );
  });

  // 城市段可能在中间：Polymarket 真实 slug 里阈值可以排在城市前面
  it("城市段在中间时也能解析", () => {
    expect(cityFromMarketSlug("will-the-highest-temperature-be-above-90f-in-london-today")).toBe(
      "London"
    );
    expect(
      cityFromMarketSlug("will-the-highest-temperature-in-london-be-above-20c-on-january-5th")
    ).toBe("London");
    expect(
      cityFromMarketSlug("will-the-highest-temperature-in-nyc-be-above-95f-on-july-4th")
    ).toBe("New York City");
    expect(cityFromMarketSlug("will-the-highest-temperature-in-seoul-be-or-above-25c")).toBe(
      "Seoul"
    );
    expect(cityFromMarketSlug("highest-temperature-in-hong-kong-tomorrow")).toBe("Hong Kong");
    expect(
      cityFromMarketSlug("will-the-highest-temperature-in-tokyo-reach-35c-on-2026-01-05")
    ).toBe("Tokyo");
  });

  it("别名表没收录的城市标题化，而不是透传小写", () => {
    expect(cityFromMarketSlug("temperature-in-munich")).toBe("Munich");
    expect(cityFromMarketSlug("highest-temperature-in-kuala-lumpur-on-march-3rd")).toBe(
      "Kuala Lumpur"
    );
  });

  it("非温度市场直接拒绝，不能把任意 slug 当城市名", () => {
    expect(cityFromMarketSlug("gibberish-market")).toBe("");
    expect(cityFromMarketSlug("will-trump-win-the-2024-election")).toBe("");
    expect(cityFromMarketSlug("bitcoin-above-100000")).toBe("");
  });
});
