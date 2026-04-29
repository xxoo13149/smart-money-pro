import { NextResponse } from "next/server";

import {
  finderOptionsResponse,
  requireFinderIntegrationRequest,
  withFinderCors
} from "../../../../../lib/finder-auth";
import { getFinderWalletDetail } from "../../../../../lib/finder-sync";

export const OPTIONS = finderOptionsResponse;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ address: string }> }
) {
  const auth = await requireFinderIntegrationRequest(request);
  if (!auth.ok) {
    return auth.response;
  }

  const { address } = await params;
  const data = await getFinderWalletDetail(address);
  if (!data) {
    return withFinderCors(request, NextResponse.json({ error: "wallet not found" }, { status: 404 }));
  }

  return withFinderCors(request, NextResponse.json({ ok: true, data }));
}
