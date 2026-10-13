import { NextResponse } from "next/server";

import {
  finderOptionsResponse,
  requireFinderIntegrationRequest,
  withFinderCors
} from "../../../../../lib/finder-auth";
import { searchFinderWallets } from "../../../../../lib/finder-sync";

export const OPTIONS = finderOptionsResponse;

export async function GET(request: Request) {
  const auth = await requireFinderIntegrationRequest(request);
  if (!auth.ok) {
    return auth.response;
  }

  const url = new URL(request.url);
  const query = url.searchParams.get("q")?.trim() || "";
  const limit = Number.parseInt(url.searchParams.get("limit") || "12", 10);

  if (!query) {
    return withFinderCors(request, NextResponse.json({ error: "q is required" }, { status: 400 }));
  }

  const items = await searchFinderWallets(query, limit);
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
