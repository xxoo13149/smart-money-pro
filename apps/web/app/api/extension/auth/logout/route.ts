import { NextResponse } from "next/server";

import { logoutSession } from "@/lib/extension-auth";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    refreshToken?: string;
  };

  if (!body.refreshToken) {
    return NextResponse.json({ error: "refreshToken is required" }, { status: 400 });
  }

  const ok = logoutSession({ refreshToken: body.refreshToken });
  if (!ok) {
    return NextResponse.json({ error: "invalid refresh token" }, { status: 401 });
  }

  return new NextResponse(null, { status: 204 });
}
