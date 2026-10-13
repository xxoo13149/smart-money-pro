import { NextResponse } from "next/server";
import type { WalletImportCommitRequest } from "@weather-smart-money/core";

import { requireAdminApiSession } from "../../../../../lib/admin-auth";
import { commitWalletImport } from "../../../../../lib/data";

const MAX_IMPORT_ROWS = 500;
const VALID_IMPORT_MODES = new Set(["file", "text", "ai", "finder"]);
const VALID_SOURCE_TYPES = new Set(["manual", "finder", "ai", "file", "system"]);

export async function POST(request: Request) {
  const auth = await requireAdminApiSession(request);
  if (!auth.ok) {
    return auth.response;
  }

  const body = (await request.json().catch(() => ({}))) as WalletImportCommitRequest;

  if (!Array.isArray(body.rows)) {
    return NextResponse.json({ error: "rows are required" }, { status: 400 });
  }

  if (body.rows.length > MAX_IMPORT_ROWS) {
    return NextResponse.json(
      { error: `rows cannot exceed ${MAX_IMPORT_ROWS} per import` },
      { status: 413 }
    );
  }

  if (body.mode && !VALID_IMPORT_MODES.has(body.mode)) {
    return NextResponse.json({ error: "mode is invalid" }, { status: 400 });
  }

  if (body.sourceType && !VALID_SOURCE_TYPES.has(body.sourceType)) {
    return NextResponse.json({ error: "sourceType is invalid" }, { status: 400 });
  }

  try {
    const result = await commitWalletImport(body, auth.session.user.email);
    return NextResponse.json({ data: result });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "wallet import commit failed" },
      { status: 400 }
    );
  }
}
