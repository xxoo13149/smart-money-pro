import { NextResponse } from "next/server";

import { requireAdminApiSession } from "../../../../../lib/admin-auth";
import { getRuntimeRecoveryReport } from "../../../../../lib/runtime-admin";

export async function GET(request: Request) {
  const auth = await requireAdminApiSession(request);
  if (!auth.ok) {
    return auth.response;
  }

  return NextResponse.json({
    data: await getRuntimeRecoveryReport()
  }, {
    headers: {
      "Cache-Control": "no-store"
    }
  });
}
