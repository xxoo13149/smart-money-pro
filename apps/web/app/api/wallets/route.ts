import { NextRequest, NextResponse } from "next/server";
import type { WalletManualCreateInput } from "@weather-smart-money/core";

import { requireAdminApiSession } from "../../../lib/admin-auth";
import { cachedJsonResponse, invalidateWalletCache } from "../../../lib/cache";
import { createManualWallet, listWalletAdminRowsPage } from "../../../lib/data";
import { parseWalletListQueryInput } from "../../../lib/wallets-query";

export async function GET(request: NextRequest) {
  const auth = await requireAdminApiSession(request);
  if (!auth.ok) {
    return auth.response;
  }

  const search = request.nextUrl.search;
  return cachedJsonResponse(`wallets:list:${search}`, async () => {
    const query = parseWalletListQueryInput(request.nextUrl.searchParams);
    return { data: await listWalletAdminRowsPage(query) };
  });
}

export async function POST(request: Request) {
  const auth = await requireAdminApiSession(request);
  if (!auth.ok) {
    return auth.response;
  }

  const body = (await request.json().catch(() => ({}))) as WalletManualCreateInput;

  if (!body.address?.trim() || !body.displayName?.trim()) {
    return NextResponse.json({ error: "address and displayName are required" }, { status: 400 });
  }

  try {
    const wallet = await createManualWallet(body, auth.session.user.email);
    await invalidateWalletCache();
    return NextResponse.json({ data: wallet }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "wallet create failed" },
      { status: 400 }
    );
  }
}
