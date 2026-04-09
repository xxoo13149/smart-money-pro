import { NextResponse } from "next/server";

import { requireAdminApiSession } from "../../../../../lib/admin-auth";
import { createUserTag } from "../../../../../lib/data";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdminApiSession(request);
  if (!auth.ok) {
    return auth.response;
  }

  const { id } = await params;
  const body = (await request.json()) as {
    name?: string;
    value?: string;
    kind?:
      | "group"
      | "alias"
      | "confidence"
      | "strategy"
      | "risk"
      | "specialty"
      | "performance"
      | "style"
      | "wallet_age";
    evidence?: string;
  };

  if (!body.name?.trim() || !body.value?.trim()) {
    return NextResponse.json({ error: "name and value are required" }, { status: 400 });
  }

  const tag = await createUserTag(
    id,
    {
      name: body.name.trim(),
      value: body.value.trim(),
      kind: body.kind,
      evidence: body.evidence?.trim()
    },
    auth.session.user.email
  );

  if (!tag) {
    return NextResponse.json({ error: "wallet not found" }, { status: 404 });
  }

  return NextResponse.json({ data: tag }, { status: 201 });
}
