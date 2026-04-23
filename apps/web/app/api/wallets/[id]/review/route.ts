import { NextResponse } from "next/server";
import type { WalletLabelKind } from "@weather-smart-money/core";

import { requireAdminApiSession } from "../../../../../lib/admin-auth";
import {
  applyWalletReviewAction,
  type WalletReviewAction
} from "../../../../../lib/data";

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
      action?: WalletReviewAction;
      labelId?: string;
      name?: string;
      value?: string;
      kind?: WalletLabelKind;
      evidence?: string;
      verificationNote?: string;
      sourceNote?: string;
    };

    if (!body.action) {
      return NextResponse.json({ error: "action is required" }, { status: 400 });
    }

    const detail = await applyWalletReviewAction(
      id,
      {
        action: body.action,
        labelId: body.labelId,
        name: body.name,
        value: body.value,
        kind: body.kind,
        evidence: body.evidence,
        verificationNote: body.verificationNote,
        sourceNote: body.sourceNote
      },
      auth.session.user.email
    );

    if (!detail) {
      return NextResponse.json({ error: "wallet not found" }, { status: 404 });
    }

    return NextResponse.json({ data: detail });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "review action failed" },
      { status: 400 }
    );
  }
}
