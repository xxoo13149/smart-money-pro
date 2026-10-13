import { NextResponse } from "next/server";

import {
  finderOptionsResponse,
  requireFinderIntegrationRequest,
  withFinderCors
} from "../../../../../lib/finder-auth";
import { previewFinderImport, type FinderImportRequest } from "../../../../../lib/finder-sync";

export const OPTIONS = finderOptionsResponse;
const MAX_FINDER_PREVIEW_LIMIT = 500;

export async function POST(request: Request) {
  const auth = await requireFinderIntegrationRequest(request);
  if (!auth.ok) {
    return auth.response;
  }

  const body = (await request.json().catch(() => ({}))) as FinderImportRequest;
  const limit = Number(body.limit ?? 100);

  if (!Number.isFinite(limit) || limit < 1 || limit > MAX_FINDER_PREVIEW_LIMIT) {
    return withFinderCors(
      request,
      NextResponse.json(
        { error: `limit must be between 1 and ${MAX_FINDER_PREVIEW_LIMIT}` },
        { status: 400 }
      )
    );
  }

  try {
    const data = await previewFinderImport({ ...body, limit: Math.floor(limit) });
    return withFinderCors(request, NextResponse.json({ ok: true, data }));
  } catch (error) {
    return withFinderCors(
      request,
      NextResponse.json(
        { error: error instanceof Error ? error.message : "finder preview failed" },
        { status: 400 }
      )
    );
  }
}
