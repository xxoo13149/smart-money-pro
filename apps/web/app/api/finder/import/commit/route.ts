import { NextResponse } from "next/server";

import {
  finderOptionsResponse,
  requireFinderIntegrationRequest,
  withFinderCors
} from "../../../../../lib/finder-auth";
import { commitFinderImport, type FinderImportRequest } from "../../../../../lib/finder-sync";

export const OPTIONS = finderOptionsResponse;

export async function POST(request: Request) {
  const auth = await requireFinderIntegrationRequest(request);
  if (!auth.ok) {
    return auth.response;
  }

  const body = (await request.json().catch(() => ({}))) as FinderImportRequest;

  try {
    const data = await commitFinderImport(body, auth.actor);
    return withFinderCors(request, NextResponse.json({ ok: true, data }));
  } catch (error) {
    return withFinderCors(
      request,
      NextResponse.json(
        { error: error instanceof Error ? error.message : "finder commit failed" },
        { status: 400 }
      )
    );
  }
}
