import { NextResponse } from "next/server";

import { requireAdminApiSession } from "../../../lib/admin-auth";
import { removeWatchlistEntry, upsertWatchlistEntry } from "../../../lib/data";

export async function POST(request: Request) {
  const auth = await requireAdminApiSession(request);
  if (!auth.ok) {
    return auth.response;
  }

  const body = (await request.json()) as { walletId?: string; note?: string };
  if (!body.walletId) {
    return NextResponse.json({ error: "walletId is required" }, { status: 400 });
  }

  const entry = await upsertWatchlistEntry(body.walletId, body.note, auth.session.user.email);
  if (!entry) {
    return NextResponse.json({ error: "wallet not found" }, { status: 404 });
  }

  return NextResponse.json({ data: entry }, { status: 201 });
}

export async function DELETE(request: Request) {
  const auth = await requireAdminApiSession(request);
  if (!auth.ok) {
    return auth.response;
  }

  const body = (await request.json().catch(() => ({}))) as { walletId?: string };
  if (!body.walletId) {
    return NextResponse.json({ error: "walletId is required" }, { status: 400 });
  }

  const wallet = await removeWatchlistEntry(body.walletId, auth.session.user.email);
  if (!wallet) {
    return NextResponse.json({ error: "wallet not found" }, { status: 404 });
  }

  return NextResponse.json({ data: wallet });
}
