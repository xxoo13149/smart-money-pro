import { NextRequest, NextResponse } from "next/server";

import { requireAdminApiSession } from "../../../../../lib/admin-auth";
import { getWalletMetrics } from "../../../../../lib/demo-store";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdminApiSession(request);
  if (!auth.ok) {
    return auth.response;
  }

  const { id } = await params;
  const windowParam = request.nextUrl.searchParams.get("window") ?? "30_trades";
  const tradeWindow = windowParam === "30_trades" ? 30 : Number.parseInt(windowParam, 10);

  const metrics = getWalletMetrics(id, Number.isFinite(tradeWindow) ? tradeWindow : 30);
  if (!metrics) {
    return NextResponse.json({ error: "wallet not found" }, { status: 404 });
  }

  return NextResponse.json({ data: metrics });
}
