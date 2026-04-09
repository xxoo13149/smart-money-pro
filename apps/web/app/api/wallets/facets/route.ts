import { NextRequest, NextResponse } from "next/server";

import { requireAdminApiSession } from "../../../../lib/admin-auth";
import { getWalletFacetSummary } from "../../../../lib/data";

export async function GET(request: NextRequest) {
  const auth = await requireAdminApiSession(request);
  if (!auth.ok) {
    return auth.response;
  }

  const labels = request.nextUrl.searchParams
    .getAll("labels")
    .flatMap((value) => value.split(",").map((item) => item.trim()).filter(Boolean));

  const data = await getWalletFacetSummary({
    q: request.nextUrl.searchParams.get("q")?.trim() || undefined,
    status:
      (request.nextUrl.searchParams.get("status")?.trim() as
        | "all"
        | "active"
        | "watchlist"
        | "review_needed"
        | "deleted"
        | null) ?? undefined,
    source:
      (request.nextUrl.searchParams.get("source")?.trim() as
        | "all"
        | "manual"
        | "ai"
        | "file"
        | "system"
        | null) ?? undefined,
    includeDeleted: request.nextUrl.searchParams.get("includeDeleted") === "true",
    createdAfter: request.nextUrl.searchParams.get("createdAfter")?.trim() || undefined,
    createdBefore: request.nextUrl.searchParams.get("createdBefore")?.trim() || undefined,
    labels: labels.length > 0 ? labels : undefined
  });

  return NextResponse.json({ data });
}
