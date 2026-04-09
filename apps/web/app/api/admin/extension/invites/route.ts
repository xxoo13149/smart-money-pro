import { NextRequest, NextResponse } from "next/server";

import { requireAdminApiSession } from "../../../../../lib/admin-auth";
import { createAdminExtensionInvite, listAdminExtensionInvites } from "../../../../../lib/data";

export async function GET(request: Request) {
  const auth = await requireAdminApiSession(request);
  if (!auth.ok) {
    return auth.response;
  }

  try {
    const data = await listAdminExtensionInvites();
    return NextResponse.json({ data });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "extension invites list failed" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAdminApiSession(request);
  if (!auth.ok) {
    return auth.response;
  }

  const body = (await request.json().catch(() => ({}))) as {
    memberLabel?: string;
    expiresAt?: string | null;
  };

  if (!body.memberLabel?.trim()) {
    return NextResponse.json({ error: "memberLabel is required" }, { status: 400 });
  }

  try {
    const data = await createAdminExtensionInvite({
      memberLabel: body.memberLabel,
      expiresAt: body.expiresAt?.trim() || null
    });

    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "extension invite create failed" },
      { status: 400 }
    );
  }
}
