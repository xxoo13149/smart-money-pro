import { NextRequest, NextResponse } from "next/server";

import { isExtensionReadOnlyRequestAuthorized } from "@/lib/extension-auth";
import { cachedJsonResponse } from "@/lib/cache";
import { getSmartMoneyBindings } from "@/lib/cloudflare-env";
import { findCitySuggestions, getCityWinRatePayload } from "@/lib/city-win-rate-data";

/**
 * 城市真实战绩接口（扩展端用）。
 *
 * GET /api/extension/city-win-rate?slug=highest-temperature-in-london-on-january-5th
 * GET /api/extension/city-win-rate?city=London
 * GET /api/extension/city-win-rate?q=lon        （解析失败时的模糊匹配兜底）
 *
 * 胜率口径来自 Finder 的城市层级战绩：按**已结算仓位**（won / resolved），
 * 样本不足（< 5 个已结算仓位）时不返回百分比，只返回样本数与 confidence，
 * 避免把 2/2 的 100% 当成战绩展示。
 *
 * 缓存 180 秒：城市战绩随 Finder run 批量更新，分钟级新鲜度足够，
 * 但用户切市场时会高频请求同一城市，必须缓存以守住 Workers Free 的 CPU。
 */
export async function GET(request: NextRequest) {
  if (!isExtensionReadOnlyRequestAuthorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const params = request.nextUrl.searchParams;
  const slug = params.get("slug")?.trim() || null;
  const city = params.get("city")?.trim() || null;
  const query = params.get("q")?.trim() || null;

  const bindings = await getSmartMoneyBindings();
  const db = bindings?.SMART_MONEY_DB ?? null;
  if (!db) {
    return NextResponse.json({ error: "database_unavailable" }, { status: 503 });
  }

  try {
    // 模糊匹配兜底：不走完整战绩查询，payload 小得多，也不需要缓存。
    if (query && !slug && !city) {
      const suggestions = await findCitySuggestions(db, query, 6);
      return NextResponse.json(
        { data: { suggestions, refreshedAt: new Date().toISOString() } },
        { headers: { "Cache-Control": "private, max-age=120" } }
      );
    }

    if (!slug && !city) {
      return NextResponse.json({ error: "slug or city is required" }, { status: 400 });
    }

    // cachedJsonResponse 已经返回完整 NextResponse（含它自己的缓存头），
    // 这里不要再包一层 JSON，否则会把响应体二次序列化。
    return await cachedJsonResponse(
      `city-win-rate:${city ?? slug ?? ""}`,
      async () => {
        const result = await getCityWinRatePayload(db, { slug, city });
        // 城市解析不出或库里没有该城市时返回 null，扩展端据此跳过展示，
        // 而不是画一个空的「暂无战绩」面板。200 + data:null 好过 404，
        // 因为「这个城市我们没数据」不是错误。
        return { data: result };
      },
      180
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: "city_win_rate_failed", message }, { status: 500 });
  }
}
