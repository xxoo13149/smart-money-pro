import { describe, expect, it } from "vitest";

import { DASHBOARD_CITY_STATS_SQL, DASHBOARD_PROFILE_PIVOT_SQL } from "./repository";

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

// 城市战绩曾长期全空：Finder 侧 compact_finder_detail_for_import 是白名单式，
// weather_profile_v2 压根不在名单里，cities_json 全库为 0/49。
describe("DASHBOARD_CITY_STATS_SQL", () => {
  it("用 json_extract 展开 cities_json，同一个 json_each 下标坑", () => {
    expect(DASHBOARD_CITY_STATS_SQL).toContain("json_extract(c.value, '$.win_rate')");
    // 与 m.key 同一个坑：数组元素上 c.key 是下标，当字段名用会静默返回 NULL。
    expect(DASHBOARD_CITY_STATS_SQL).not.toMatch(/\bc\.key\b/);
  });

  it("覆盖仓位口径胜率所需的分子分母", () => {
    // 城市真实胜率 = won_positions / resolved_positions，必须两个都在 SQL 里取。
    expect(DASHBOARD_CITY_STATS_SQL).toContain("$.resolved_positions");
    expect(DASHBOARD_CITY_STATS_SQL).toContain("$.won_positions");
    expect(DASHBOARD_CITY_STATS_SQL).toContain("$.positions");
  });

  it("逐日胜率按可选字段处理", () => {
    expect(DASHBOARD_CITY_STATS_SQL).toContain("$.day_win_rate");
    // 用 COUNT 而非 SUM 统计覆盖行数：老 run 没有该字段，SUM 会整体变 0，
    // 无法区分「全都没数据」和「胜率真的是 0」。
    expect(DASHBOARD_CITY_STATS_SQL).toContain("COUNT(json_extract(c.value, '$.day_win_rate'))");
    expect(DASHBOARD_CITY_STATS_SQL).toContain("$.days");
    expect(DASHBOARD_CITY_STATS_SQL).toContain("$.win_days");
  });

  it("过滤非城市桶", () => {
    // 实测数据里混着 climate(63 仓位) / AQI(6) / air(8) / USA(24) / Tech(2)。
    for (const bucket of ["climate", "aqi", "air", "tech"]) {
      expect(DASHBOARD_CITY_STATS_SQL).toContain(`'${bucket}'`);
    }
  });

  it("带出钱包 id 供 TS 层按别名去重", () => {
    // NYC 与 nyc 是同一城市，合并时必须按 id 去重，只给计数会导致虚高。
    expect(DASHBOARD_CITY_STATS_SQL).toContain("GROUP_CONCAT(DISTINCT p.wallet_id)");
  });

  it("只统计未软删除的地址", () => {
    expect(DASHBOARD_CITY_STATS_SQL).toContain("w.deleted_at IS NULL");
  });

  it("GROUP BY 用完整表达式而不是输出别名", () => {
    // SQLite（D1 同源）在 GROUP BY 里不解析 SELECT 输出别名，写 city_key 会
    // 直接报 no such column: city_key。
    expect(DASHBOARD_CITY_STATS_SQL).not.toMatch(/GROUP BY\s+city_key/i);
  });
});
