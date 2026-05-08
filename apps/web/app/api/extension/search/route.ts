import { NextRequest, NextResponse } from "next/server";

import { isExtensionReadOnlyRequestAuthorized } from "@/lib/extension-auth";
import { searchAddressSummariesPayload } from "@/lib/extension-data";

const parseLimit = (value: string | null) => {
  const parsed = Number(value ?? "12");
  if (!Number.isFinite(parsed)) {
    return 12;
  }

  return Math.max(1, Math.min(25, Math.floor(parsed)));
};

export async function GET(request: NextRequest) {
  if (!isExtensionReadOnlyRequestAuthorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const query = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (!query) {
    return NextResponse.json({ error: "q is required" }, { status: 400 });
  }

  const payload = await searchAddressSummariesPayload(query, {
    chain: "polygon",
    baseUrl: request.nextUrl.origin,
    limit: parseLimit(request.nextUrl.searchParams.get("limit"))
  });

  return NextResponse.json(payload, {
    headers: {
      ETag: `"${payload.version}"`,
      "Cache-Control": "private, max-age=0, must-revalidate"
    }
  });
}
