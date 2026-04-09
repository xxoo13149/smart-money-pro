import { NextRequest, NextResponse } from "next/server";

import { requireAdminApiSession } from "../../../../../lib/admin-auth";
import { listAdminExtensionSessions } from "../../../../../lib/data";
import type { AdminExtensionSessionItem } from "@weather-smart-money/core";

export async function GET(request: NextRequest) {
  const auth = await requireAdminApiSession(request);
  if (!auth.ok) {
    return auth.response;
  }

  const query = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  const status = (request.nextUrl.searchParams.get("status")?.trim() ?? "all") as
    | AdminExtensionSessionItem["status"]
    | "all";

  if (!["all", "active", "idle", "expired", "revoked"].includes(status)) {
    return NextResponse.json({ error: "invalid status" }, { status: 400 });
  }

  try {
    const data = await listAdminExtensionSessions({
      query,
      status
    });
    return NextResponse.json({ data });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "extension sessions list failed" },
      { status: 500 }
    );
  }
}
