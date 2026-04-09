import { NextResponse } from "next/server";

import { requireAdminApiSession } from "../../../../../lib/admin-auth";
import { previewWalletImportText } from "../../../../../lib/data";

export async function POST(request: Request) {
  const auth = await requireAdminApiSession(request);
  if (!auth.ok) {
    return auth.response;
  }

  const body = (await request.json().catch(() => ({}))) as {
    text?: string;
    sourceName?: string;
  };

  if (!body.text?.trim()) {
    return NextResponse.json({ error: "text is required" }, { status: 400 });
  }

  try {
    const preview = await previewWalletImportText(body.text, body.sourceName || "wallets.txt");
    return NextResponse.json({ data: preview });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "text preview failed" },
      { status: 400 }
    );
  }
}
