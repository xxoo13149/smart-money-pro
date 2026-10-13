import { NextRequest } from "next/server";

import { requireAdminApiSession } from "../../../lib/admin-auth";
import { cachedJsonResponse } from "../../../lib/cache";
import { getDashboardData } from "../../../lib/data";

// 首页仪表盘数据（KPI / 来源与版本分布 / 最近导入 / 重点市场 / 盯防地址）走 KV 缓存，
// 避免每次访问都在 Worker 里跑聚合查询触发 Error 1102。
export async function GET(request: NextRequest) {
  const auth = await requireAdminApiSession(request);
  if (!auth.ok) {
    return auth.response;
  }

  const search = request.nextUrl.search;
  try {
    return await cachedJsonResponse(`dashboard:${search}`, async () => {
      return { data: await getDashboardData() };
    }, 180);
  } catch (error) {
    // 缓存/聚合链路出错时把真实原因带回来，别再只看到一个空 500。
    const message = error instanceof Error ? error.message : String(error);
    return Response.json({ error: "dashboard_failed", message }, { status: 500 });
  }
}