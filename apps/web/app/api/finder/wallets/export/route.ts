import { NextResponse } from "next/server";

import {
  finderOptionsResponse,
  requireFinderIntegrationRequest,
  withFinderCors
} from "../../../../../lib/finder-auth";
import { listWalletAdminRowsPage } from "../../../../../lib/data";
import { parseWalletListQueryInput } from "../../../../../lib/wallets-query";

export const OPTIONS = finderOptionsResponse;

const clampLimit = (value: string | null) => {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed)) {
    return 100;
  }
  return Math.max(1, Math.min(200, parsed));
};

export async function GET(request: Request) {
  const auth = await requireFinderIntegrationRequest(request);
  if (!auth.ok) {
    return auth.response;
  }

  const url = new URL(request.url);
  const query = parseWalletListQueryInput(url.searchParams);
  const data = await listWalletAdminRowsPage({
    ...query,
    includeDeleted: url.searchParams.get("includeDeleted") === "true",
    limit: clampLimit(url.searchParams.get("limit"))
  });

  const items = data.items.map((row) => ({
    wallet: {
      address: row.wallet.address,
      normalizedAddress: row.wallet.normalizedAddress,
      displayName: row.wallet.displayName,
      alias: row.wallet.alias,
      sourceType: row.wallet.sourceType,
      curationStatus: row.wallet.curationStatus,
      watchlisted: row.wallet.watchlisted,
      updatedAt: row.wallet.updatedAt
    },
    labels: row.labels.map((label) => ({
      kind: label.kind,
      value: label.value,
      source: label.source
    })),
    finderAi: row.finderAi
      ? {
          strategyFocus: row.finderAi.strategyFocus,
          aiBriefShort: row.finderAi.aiBriefShort,
          updatedAt: row.finderAi.updatedAt
        }
      : undefined,
    lastActivityAt: row.lastActivityAt
  }));

  return withFinderCors(
    request,
    NextResponse.json({
      ok: true,
      data: {
        schemaVersion: "finder-wallet-export-page/v1",
        items,
        nextCursor: data.nextCursor,
        totalCount: data.totalCount,
        pageMeta: data.pageMeta
      }
    })
  );
}
