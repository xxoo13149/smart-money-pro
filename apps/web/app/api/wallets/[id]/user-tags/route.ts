import { NextResponse } from "next/server";
import type { WalletLabelKind } from "@weather-smart-money/core";

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

  try {
    const { id } = await params;
    const body = (await request.json().catch(() => ({}))) as {
      name?: string;
      value?: string;
      kind?: WalletLabelKind;
      evidence?: string;
      verificationNote?: string;
      sourceNote?: string;
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
        source: "user",
        evidence: body.evidence?.trim(),
        verificationNote: body.verificationNote?.trim(),
        sourceNote: body.sourceNote?.trim()
      },
      auth.session.user.email
    );

    if (!tag) {
      return NextResponse.json({ error: "wallet not found" }, { status: 404 });
    }

    return NextResponse.json({ data: tag }, { status: 201 });
  } catch (error) {
    console.error("create user tag failed", error);
    return NextResponse.json({ error: "failed to create user tag" }, { status: 500 });
  }
}
