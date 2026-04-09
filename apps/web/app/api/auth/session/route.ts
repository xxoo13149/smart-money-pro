import { NextResponse } from "next/server";

import { getAdminSessionSnapshot } from "../../../../lib/admin-auth";

export async function GET() {
  return NextResponse.json({
    data: await getAdminSessionSnapshot()
  });
}
