import { NextResponse } from "next/server";

import { requireAdminApiSession } from "../../../../../lib/admin-auth";
import { previewWalletImportAi, previewWalletImportText } from "../../../../../lib/data";

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
    const aiPreview = await previewWalletImportAi({
      text: body.text,
      sourceName: body.sourceName
    });

    return NextResponse.json({
      data: {
        rows: aiPreview.rows,
        providerMeta: aiPreview.providerMeta
      }
    });
  } catch (error) {
    const fallbackPreview = await previewWalletImportText(body.text, body.sourceName || "wallets.txt");
    return NextResponse.json({
      data: {
        rows: fallbackPreview.rows,
        providerMeta: {
          provider: "none",
          model: "deterministic-parser",
          fallbackUsed: true
        },
        fallbackReason: error instanceof Error ? error.message : "ai preview failed"
      }
    });
  }
}
