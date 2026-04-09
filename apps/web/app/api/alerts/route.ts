import { NextRequest, NextResponse } from "next/server";

import { requireAdminApiSession } from "../../../lib/admin-auth";
import { getAlertItems } from "../../../lib/data";

export async function GET(request: NextRequest) {
  const auth = await requireAdminApiSession(request);
  if (!auth.ok) {
    return auth.response;
  }

  const status = request.nextUrl.searchParams.get("status");
  const normalized = status === "open" || status === "resolved" ? status : "all";

  return NextResponse.json({ data: await getAlertItems(normalized) });
}
