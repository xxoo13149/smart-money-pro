import { NextResponse } from "next/server";

import { refreshSession } from "@/lib/extension-auth";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    refreshToken?: string;
  };

  if (!body.refreshToken) {
    return NextResponse.json({ error: "refreshToken is required" }, { status: 400 });
  }

  const payload = refreshSession({ refreshToken: body.refreshToken });
  if (!payload) {
    return NextResponse.json({ error: "invalid or expired refresh token" }, { status: 401 });
  }

  return NextResponse.json(payload);
}
