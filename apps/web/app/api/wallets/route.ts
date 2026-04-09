import { NextRequest, NextResponse } from "next/server";
import type { WalletManualCreateInput } from "@weather-smart-money/core";

import { requireAdminApiSession } from "../../../lib/admin-auth";
import { createManualWallet, listWalletAdminRowsPage } from "../../../lib/data";
import { parseWalletListQueryInput } from "../../../lib/wallets-query";

export async function GET(request: NextRequest) {
  const auth = await requireAdminApiSession(request);
  if (!auth.ok) {
    return auth.response;
  }

  const query = parseWalletListQueryInput(request.nextUrl.searchParams);
  const data = await listWalletAdminRowsPage(query);

  return NextResponse.json({ data });
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
    return NextResponse.json({ data: wallet }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "wallet create failed" },
      { status: 400 }
    );
  }
}
