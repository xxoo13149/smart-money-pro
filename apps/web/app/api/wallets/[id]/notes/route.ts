import { NextResponse } from "next/server";

import { requireAdminApiSession } from "../../../../../lib/admin-auth";
import { createWalletNote } from "../../../../../lib/data";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdminApiSession(request);
  if (!auth.ok) {
    return auth.response;
  }

  const { id } = await params;
  const body = (await request.json()) as { content?: string };

  if (!body.content?.trim()) {
    return NextResponse.json({ error: "content is required" }, { status: 400 });
  }

  const note = await createWalletNote(id, body.content.trim(), auth.session.user.email);
  if (!note) {
    return NextResponse.json({ error: "wallet not found" }, { status: 404 });
  }

  return NextResponse.json({ data: note }, { status: 201 });
}
