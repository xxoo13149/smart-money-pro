import { NextResponse } from "next/server";

import { registerExtensionUser } from "@/lib/extension-auth";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    email?: string;
    password?: string;
    inviteCode?: string;
    deviceLabel?: string;
    extensionVersion?: string;
  };

  if (!body.email?.trim()) {
    return NextResponse.json({ error: "email is required" }, { status: 400 });
  }

  if (!body.password) {
    return NextResponse.json({ error: "password is required" }, { status: 400 });
  }

  if (!body.inviteCode?.trim()) {
    return NextResponse.json({ error: "inviteCode is required" }, { status: 400 });
  }

  try {
    const payload = registerExtensionUser({
      email: body.email,
      password: body.password,
      inviteCode: body.inviteCode.trim(),
      deviceLabel: body.deviceLabel,
      extensionVersion: body.extensionVersion
    });
    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "registration failed" },
      { status: 401 }
    );
  }
}
