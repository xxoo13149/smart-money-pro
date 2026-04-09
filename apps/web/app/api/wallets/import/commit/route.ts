import { NextResponse } from "next/server";
import type { WalletImportCommitRequest } from "@weather-smart-money/core";

import { requireAdminApiSession } from "../../../../../lib/admin-auth";
import { commitWalletImport } from "../../../../../lib/data";

export async function POST(request: Request) {
  const auth = await requireAdminApiSession(request);
  if (!auth.ok) {
    return auth.response;
  }

  const body = (await request.json().catch(() => ({}))) as WalletImportCommitRequest;

  if (!Array.isArray(body.rows)) {
    return NextResponse.json({ error: "rows are required" }, { status: 400 });
  }

  try {
    const result = await commitWalletImport(body, auth.session.user.email);
    return NextResponse.json({ data: result });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "wallet import commit failed" },
      { status: 400 }
    );
  }
}
