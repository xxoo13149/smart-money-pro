import { NextResponse } from "next/server";

import { isExtensionReadOnlyRequestAuthorized } from "@/lib/extension-auth";
import { lookupAddressSummariesPayload } from "@/lib/extension-data";

export async function POST(request: Request) {
  if (!isExtensionReadOnlyRequestAuthorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    chain?: "polygon";
    addresses?: string[];
  };

  if (!Array.isArray(body.addresses) || body.addresses.length === 0) {
    return NextResponse.json({ error: "addresses is required" }, { status: 400 });
  }

  const payload = await lookupAddressSummariesPayload(body.addresses, {
    chain: body.chain ?? "polygon",
    baseUrl: request.url ? new URL(request.url).origin : undefined
  });

  return NextResponse.json(payload, {
    headers: {
      ETag: `"${payload.version}"`,
      "Cache-Control": "private, max-age=0, must-revalidate"
    }
  });
}
