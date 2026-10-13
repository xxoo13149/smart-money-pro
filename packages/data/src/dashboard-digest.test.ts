import { describe, expect, it } from "vitest";

import { DASHBOARD_PROFILE_PIVOT_SQL } from "./repository";

// 回归锁：首页曾经把真实地址和 demo seed 假市场/假成交做 join，导致
// 「重点市场」「盯防地址」面板恒为 0。修复方式是全部改走 D1 画像透视，
// 这里锁住两条不会退回的错误写法。
describe("DASHBOARD_PROFILE_PIVOT_SQL", () => {
  it("必须用 json_extract 取指标名，不能用 json_each 的 key（下标）", () => {
    expect(DASHBOARD_PROFILE_PIVOT_SQL).toContain("json_extract(m.value, '$.key')");
    // 数组元素上 m.key 返回的是下标（0/1/2…），一旦用它做指标名匹配，
    // 所有 CASE WHEN 都会落空，透视结果是整表 NULL —— 不报错，只是全 0。
    expect(DASHBOARD_PROFILE_PIVOT_SQL).not.toMatch(/\bm\.key\b/);
    expect(DASHBOARD_PROFILE_PIVOT_SQL).not.toMatch(/CAST\(m\.value AS REAL\)/);
  });

  it("只统计未软删除的地址", () => {
    expect(DASHBOARD_PROFILE_PIVOT_SQL).toContain("w.deleted_at IS NULL");
  });

  it("覆盖首页所有要用的指标列", () => {
    for (const key of [
      "total_pnl_usd",
      "volume_usd",
      "trades",
      "resolved_positions",
      "position_win_rate",
      "dominant_region",
      "weather_notional_ratio",
      "highest_burst"
    ]) {
      expect(DASHBOARD_PROFILE_PIVOT_SQL).toContain(key);
    }
  });
});
