import { NextResponse } from "next/server";

import { requireAdminApiSession } from "../../../../lib/admin-auth";
import { deleteWallet, getWalletById, updateWallet } from "../../../../lib/data";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdminApiSession(request);
  if (!auth.ok) {
    return auth.response;
  }

  const { id } = await params;
  const detail = await getWalletById(id);

  if (!detail) {
    return NextResponse.json({ error: "wallet not found" }, { status: 404 });
  }

  return NextResponse.json({ data: detail });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdminApiSession(request);
  if (!auth.ok) {
    return auth.response;
  }

  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as {
    address?: string;
    displayName?: string;
    alias?: string | null;
    bio?: string | null;
    strategyFocus?: string | null;
    teamNote?: string | null;
    firstSeenAt?: string;
  };

  try {
    const wallet = await updateWallet(id, body, auth.session.user.email);
    if (!wallet) {
      return NextResponse.json({ error: "wallet not found" }, { status: 404 });
    }

    return NextResponse.json({ data: wallet });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "wallet update failed" },
      { status: 400 }
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdminApiSession(request);
  if (!auth.ok) {
    return auth.response;
  }

  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as {
    reason?: string | null;
  };

  try {
    const wallet = await deleteWallet(id, {
      reason: body.reason,
      actor: auth.session.user.email
    });

    if (!wallet) {
      return NextResponse.json({ error: "wallet not found" }, { status: 404 });
    }

    return NextResponse.json({ data: wallet });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "wallet delete failed" },
      { status: 400 }
    );
  }
}
