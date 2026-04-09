import { NextResponse } from "next/server";

import { requireAdminApiSession } from "../../../../../lib/admin-auth";
import { getSmartMoneySchemaStatusReport } from "../../../../../lib/data";

export async function GET(request: Request) {
  const auth = await requireAdminApiSession(request);
  if (!auth.ok) {
    return auth.response;
  }

  return NextResponse.json({
    data: await getSmartMoneySchemaStatusReport()
  });
}
