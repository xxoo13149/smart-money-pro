import { NextResponse } from "next/server";

import { createSessionFromInvite } from "@/lib/extension-auth";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    inviteCode?: string;
    deviceLabel?: string;
    extensionVersion?: string;
  };

  if (!body.inviteCode?.trim()) {
    return NextResponse.json({ error: "inviteCode is required" }, { status: 400 });
  }

  try {
    const payload = createSessionFromInvite({
      inviteCode: body.inviteCode,
      deviceLabel: body.deviceLabel,
      extensionVersion: body.extensionVersion
    });
    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "invalid invite" },
      { status: 401 }
    );
  }
}
