import { NextResponse } from "next/server";

import { requireAdminApiSession } from "../../../../../lib/admin-auth";
import { getAdminExtensionOverview } from "../../../../../lib/data";

export async function GET(request: Request) {
  const auth = await requireAdminApiSession(request);
  if (!auth.ok) {
    return auth.response;
  }

  try {
    const data = await getAdminExtensionOverview();
    return NextResponse.json({ data });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "extension overview failed" },
      { status: 500 }
    );
  }
}
