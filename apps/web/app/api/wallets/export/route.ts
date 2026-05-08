import { NextRequest, NextResponse } from "next/server";

import { requireAdminApiSession } from "../../../../lib/admin-auth";
import { exportWalletLibrary } from "../../../../lib/data";
import { parseWalletListQueryInput } from "../../../../lib/wallets-query";

const readBoolean = (value: string | null, fallback: boolean) => {
  if (value === null) {
    return fallback;
  }

  return value === "true";
};

const readFirstParam = (params: URLSearchParams, ...keys: string[]) => {
  for (const key of keys) {
    const value = params.get(key);
    if (value !== null) {
      return value;
    }
  }

  return null;
};

export async function GET(request: NextRequest) {
  const auth = await requireAdminApiSession(request);
  if (!auth.ok) {
    return auth.response;
  }

  const searchParams = request.nextUrl.searchParams;
  const scope = searchParams.get("scope");
  const includeDeleted = readBoolean(readFirstParam(searchParams, "includeDeleted", "include_deleted"), true);
  const changedSince = readFirstParam(searchParams, "changedSince", "changed_since") ?? undefined;
  const query = scope === "all" ? undefined : parseWalletListQueryInput(searchParams);

  try {
    const data = await exportWalletLibrary({
      query,
      includeDeleted,
      changedSince
    });
    const timestamp = new Date().toISOString().replace(/[:]/g, "-");
    const modeSuffix = data.exportMode === "delta" ? "delta" : "full";
    const fileName = `smart-money-wallet-library-${modeSuffix}-${timestamp}.json`;

    return new NextResponse(JSON.stringify(data, null, 2), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Cache-Control": "no-store"
      }
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "导出失败" },
      { status: 400 }
    );
  }
}
