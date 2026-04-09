import { NextResponse } from "next/server";
import type { WalletSavedView } from "@weather-smart-money/core";

import { requireAdminApiSession } from "../../../../lib/admin-auth";
import {
  createWalletSavedView,
  deleteWalletSavedView,
  listWalletSavedViews,
  updateWalletSavedView
} from "../../../../lib/data";

export async function GET(request: Request) {
  const auth = await requireAdminApiSession(request);
  if (!auth.ok) {
    return auth.response;
  }

  return NextResponse.json({ data: await listWalletSavedViews() });
}

export async function POST(request: Request) {
  const auth = await requireAdminApiSession(request);
  if (!auth.ok) {
    return auth.response;
  }

  const body = (await request.json().catch(() => ({}))) as {
    name?: string;
    query?: WalletSavedView["query"];
  };

  if (!body.name?.trim()) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const data = await createWalletSavedView({
    name: body.name.trim(),
    query: body.query ?? {}
  });

  return NextResponse.json({ data }, { status: 201 });
}

export async function PATCH(request: Request) {
  const auth = await requireAdminApiSession(request);
  if (!auth.ok) {
    return auth.response;
  }

  const body = (await request.json().catch(() => ({}))) as {
    id?: string;
    name?: string;
    query?: WalletSavedView["query"];
  };

  if (!body.id?.trim()) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const data = await updateWalletSavedView(body.id, {
    name: body.name,
    query: body.query
  });

  if (!data) {
    return NextResponse.json({ error: "view not found" }, { status: 404 });
  }

  return NextResponse.json({ data });
}

export async function DELETE(request: Request) {
  const auth = await requireAdminApiSession(request);
  if (!auth.ok) {
    return auth.response;
  }

  const body = (await request.json().catch(() => ({}))) as { id?: string };
  if (!body.id?.trim()) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  await deleteWalletSavedView(body.id);
  return NextResponse.json({ data: { id: body.id } });
}
