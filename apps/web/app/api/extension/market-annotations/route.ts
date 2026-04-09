import { NextRequest, NextResponse } from "next/server";

import { isExtensionReadOnlyRequestAuthorized } from "@/lib/extension-auth";
import { getMarketAnnotationsResponse } from "@/lib/extension-data";

export async function GET(request: NextRequest) {
  if (!isExtensionReadOnlyRequestAuthorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const slug = request.nextUrl.searchParams.get("slug")?.trim();
  if (!slug) {
    return NextResponse.json({ error: "slug is required" }, { status: 400 });
  }

  const result = await getMarketAnnotationsResponse(slug, {
    chain: "polygon",
    baseUrl: request.nextUrl.origin,
    ifNoneMatch: request.headers.get("if-none-match")
  });

  if (result.status === 304) {
    return new NextResponse(null, {
      status: 304,
      headers: {
        ETag: result.etag,
        "Cache-Control": "private, max-age=0, must-revalidate"
      }
    });
  }

  return NextResponse.json(result.payload, {
    headers: {
      ETag: result.etag,
      "Cache-Control": "private, max-age=0, must-revalidate"
    }
  });
}
