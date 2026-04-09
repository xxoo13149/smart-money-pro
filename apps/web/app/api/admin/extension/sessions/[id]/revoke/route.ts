import { NextResponse } from "next/server";

import { requireAdminApiSession } from "../../../../../../../lib/admin-auth";
import { revokeAdminExtensionSession } from "../../../../../../../lib/data";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdminApiSession(request);
  if (!auth.ok) {
    return auth.response;
  }

  const { id } = await params;

  try {
    const data = await revokeAdminExtensionSession(id);
    if (!data) {
      return NextResponse.json({ error: "session not found" }, { status: 404 });
    }

    return NextResponse.json({ data });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "session revoke failed" },
      { status: 400 }
    );
  }
}
