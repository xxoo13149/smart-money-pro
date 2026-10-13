import { NextRequest } from "next/server";

import { requireAdminApiSession } from "../../../../lib/admin-auth";
import { cachedJsonResponse } from "../../../../lib/cache";
import { parseWalletListQueryInput } from "../../../../lib/wallets-query";
import { getWalletsPageData } from "../../../../lib/wallets-page-data";

// 地址库工作台的整页初始数据（列表 + 分面 + 保存视图 + 选中详情）。
// 之前这段是在服务端组件里直接执行的，改由客户端取数后，这里加 KV 缓存。
export async function GET(request: NextRequest) {
  const auth = await requireAdminApiSession(request);
  if (!auth.ok) {
    return auth.response;
  }

  const search = request.nextUrl.search;
  try {
    return await cachedJsonResponse(`wallets:page-data:${search}`, async () => {
      const query = parseWalletListQueryInput(request.nextUrl.searchParams);
      return { data: await getWalletsPageData(query) };
    }, 120);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return Response.json({ error: "page_data_failed", message }, { status: 500 });
  }
}