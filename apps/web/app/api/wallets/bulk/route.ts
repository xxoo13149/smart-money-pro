import { NextResponse } from "next/server";

import { requireAdminApiSession } from "../../../../lib/admin-auth";
import { deleteWallet, removeWatchlistEntry, upsertWatchlistEntry } from "../../../../lib/data";

type WalletBulkAction = "soft_delete" | "watchlist_add" | "watchlist_remove";

interface WalletBulkRequest {
  action?: WalletBulkAction;
  walletIds?: string[];
  reason?: string | null;
  note?: string | null;
}

export async function POST(request: Request) {
  const auth = await requireAdminApiSession(request);
  if (!auth.ok) {
    return auth.response;
  }

  const body = (await request.json().catch(() => ({}))) as WalletBulkRequest;
  const actor = auth.session.user.email;
  const walletIds = Array.from(
    new Set((body.walletIds ?? []).map((walletId) => walletId.trim()).filter(Boolean))
  );

  if (!body.action || !["soft_delete", "watchlist_add", "watchlist_remove"].includes(body.action)) {
    return NextResponse.json({ error: "action is required" }, { status: 400 });
  }

  if (walletIds.length === 0) {
    return NextResponse.json({ error: "walletIds is required" }, { status: 400 });
  }

  const results = await Promise.all(
    walletIds.map(async (walletId) => {
      try {
        if (body.action === "soft_delete") {
          const wallet = await deleteWallet(walletId, {
            actor,
            reason: body.reason?.trim() || "wallet-workspace-bulk-delete"
          });
          if (!wallet) {
            throw new Error("wallet not found");
          }

          return { ok: true as const, walletId };
        }

        if (body.action === "watchlist_add") {
          const entry = await upsertWatchlistEntry(walletId, body.note?.trim() || undefined, actor);
          if (!entry) {
            throw new Error("wallet not found");
          }

          return { ok: true as const, walletId };
        }

        const wallet = await removeWatchlistEntry(walletId, actor);
        if (!wallet) {
          throw new Error("wallet not found");
        }

        return { ok: true as const, walletId };
      } catch (error) {
        return {
          ok: false as const,
          walletId,
          error: error instanceof Error ? error.message : "wallet bulk action failed"
        };
      }
    })
  );

  const successIds = results.filter((result) => result.ok).map((result) => result.walletId);
  const failed = results
    .filter((result): result is Extract<(typeof results)[number], { ok: false }> => !result.ok)
    .map((result) => ({ walletId: result.walletId, error: result.error }));

  return NextResponse.json(
    {
      data: {
        action: body.action,
        requestedCount: walletIds.length,
        successCount: successIds.length,
        successIds,
        failed
      }
    },
    { status: failed.length > 0 ? 207 : 200 }
  );
}
