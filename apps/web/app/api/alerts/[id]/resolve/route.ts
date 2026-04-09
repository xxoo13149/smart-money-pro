import { NextResponse } from "next/server";

import { requireAdminApiSession } from "../../../../../lib/admin-auth";
import { resolveAlert } from "../../../../../lib/demo-store";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdminApiSession(request);
  if (!auth.ok) {
    return auth.response;
  }

  const { id } = await params;
  const alert = resolveAlert(id, auth.session.user.email);

  if (!alert) {
    return NextResponse.json({ error: "alert not found" }, { status: 404 });
  }

  return NextResponse.json({ data: alert });
}
