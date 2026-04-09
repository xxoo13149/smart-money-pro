import { NextRequest, NextResponse } from "next/server";

import { requireAdminApiSession } from "../../../../../../lib/admin-auth";
import { updateAdminExtensionInviteStatus } from "../../../../../../lib/data";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const auth = await requireAdminApiSession(request);
  if (!auth.ok) {
    return auth.response;
  }

  const body = (await request.json().catch(() => ({}))) as {
    status?: "active" | "disabled";
  };
  const { code } = await params;

  if (!body.status || !["active", "disabled"].includes(body.status)) {
    return NextResponse.json({ error: "valid status is required" }, { status: 400 });
  }

  try {
    const data = await updateAdminExtensionInviteStatus(code, body.status);
    if (!data) {
      return NextResponse.json({ error: "invite not found" }, { status: 404 });
    }

    return NextResponse.json({ data });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "extension invite update failed" },
      { status: 400 }
    );
  }
}
