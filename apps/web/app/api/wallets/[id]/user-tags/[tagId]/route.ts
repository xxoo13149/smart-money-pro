import { NextResponse } from "next/server";
import type { WalletLabelKind } from "@weather-smart-money/core";

import { requireAdminApiSession } from "../../../../../../lib/admin-auth";
import { deleteUserTag, updateUserTag } from "../../../../../../lib/data";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; tagId: string }> }
) {
  const auth = await requireAdminApiSession(request);
  if (!auth.ok) {
    return auth.response;
  }

  try {
    const { id, tagId } = await params;
    const body = (await request.json().catch(() => ({}))) as {
      name?: string;
      value?: string;
      kind?: WalletLabelKind;
      evidence?: string;
      verificationNote?: string;
      sourceNote?: string;
    };

    if (body.name !== undefined && !body.name.trim()) {
      return NextResponse.json({ error: "name cannot be empty" }, { status: 400 });
    }
    if (body.value !== undefined && !body.value.trim()) {
      return NextResponse.json({ error: "value cannot be empty" }, { status: 400 });
    }

    const hasPatchField =
      body.name !== undefined ||
      body.value !== undefined ||
      body.kind !== undefined ||
      body.evidence !== undefined ||
      body.verificationNote !== undefined ||
      body.sourceNote !== undefined;
    if (!hasPatchField) {
      return NextResponse.json({ error: "at least one patch field is required" }, { status: 400 });
    }

    const tag = await updateUserTag(
      id,
      tagId,
      {
        name: body.name?.trim(),
        value: body.value?.trim(),
        kind: body.kind,
        source: "user",
        evidence: body.evidence !== undefined ? body.evidence.trim() : undefined,
        verificationNote:
          body.verificationNote !== undefined ? body.verificationNote.trim() : undefined,
        sourceNote: body.sourceNote !== undefined ? body.sourceNote.trim() : undefined
      },
      auth.session.user.email
    );

    if (tag === undefined) {
      return NextResponse.json({ error: "wallet not found" }, { status: 404 });
    }
    if (tag === null) {
      return NextResponse.json({ error: "tag not found" }, { status: 404 });
    }

    return NextResponse.json({ data: tag }, { status: 200 });
  } catch (error) {
    console.error("update user tag failed", error);
    return NextResponse.json({ error: "failed to update user tag" }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; tagId: string }> }
) {
  const auth = await requireAdminApiSession(request);
  if (!auth.ok) {
    return auth.response;
  }

  try {
    const { id, tagId } = await params;
    const removed = await deleteUserTag(id, tagId, auth.session.user.email);

    if (removed === undefined) {
      return NextResponse.json({ error: "wallet not found" }, { status: 404 });
    }
    if (removed === null) {
      return NextResponse.json({ error: "tag not found" }, { status: 404 });
    }

    return NextResponse.json({ data: removed }, { status: 200 });
  } catch (error) {
    console.error("delete user tag failed", error);
    return NextResponse.json({ error: "failed to delete user tag" }, { status: 500 });
  }
}
