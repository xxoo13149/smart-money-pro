import { NextResponse } from "next/server";

import { requireAdminApiSession } from "../../../../lib/admin-auth";
import { commitWalletImport, previewWalletImportText } from "../../../../lib/data";

export async function POST(request: Request) {
  const auth = await requireAdminApiSession(request);
  if (!auth.ok) {
    return auth.response;
  }

  const formData = await request.formData().catch(() => null);
  if (!formData) {
    return NextResponse.json({ error: "invalid form data" }, { status: 400 });
  }

  const file = formData.get("file");
  const previewOnly = `${formData.get("previewOnly") ?? "true"}` === "true";

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file is required" }, { status: 400 });
  }

  const text = await file.text();

  try {
    const preview = await previewWalletImportText(text, file.name || "wallet-import.txt");
    if (preview.totalRows === 0) {
      return NextResponse.json({ error: "no importable rows found" }, { status: 400 });
    }

    if (previewOnly) {
      return NextResponse.json({ data: preview });
    }

    const result = await commitWalletImport({
      rows: preview.rows,
      mode: "file",
      sourceName: file.name || "wallet-import.txt"
    }, auth.session.user.email);

    return NextResponse.json({
      data: {
        ...preview,
        ...result
      }
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "wallet import failed" },
      { status: 400 }
    );
  }
}
