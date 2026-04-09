import { NextRequest, NextResponse } from "next/server";

import { requireAdminApiSession } from "../../../lib/admin-auth";
import { listMarkets } from "../../../lib/demo-store";

export async function GET(request: NextRequest) {
  const auth = await requireAdminApiSession(request);
  if (!auth.ok) {
    return auth.response;
  }

  const sector = request.nextUrl.searchParams.get("sector");
  return NextResponse.json({
    data: listMarkets(sector === "weather" ? "weather" : "weather")
  });
}
