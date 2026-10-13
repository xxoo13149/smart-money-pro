import { NextResponse } from "next/server";

import {
  finderOptionsResponse,
  requireFinderIntegrationRequest,
  withFinderCors
} from "../../../../../lib/finder-auth";
import { lookupFinderWallets } from "../../../../../lib/finder-sync";

export const OPTIONS = finderOptionsResponse;

export async function POST(request: Request) {
  const auth = await requireFinderIntegrationRequest(request);
  if (!auth.ok) {
    return auth.response;
  }

  const body = (await request.json().catch(() => ({}))) as {
    addresses?: string[];
  };

  if (!Array.isArray(body.addresses) || body.addresses.length === 0) {
    return withFinderCors(
      request,
      NextResponse.json({ error: "addresses is required" }, { status: 400 })
    );
  }

  const items = await lookupFinderWallets(body.addresses.slice(0, 500));
  return withFinderCors(
    request,
    NextResponse.json({
      ok: true,
      data: {
        items,
        count: items.length
      }
    })
  );
}
