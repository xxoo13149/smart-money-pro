import { notFound } from "next/navigation";

import { ImportsConsole } from "../../../../components/ImportsConsole";
import { requireAdminPageSession } from "../../../../lib/admin-auth";
import { getWalletImportsPageData } from "../../../../lib/data";

export const dynamic = "force-dynamic";

export default async function ImportBatchPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requireAdminPageSession(`/imports/batches/${id}`);
  const data = await getWalletImportsPageData(id);

  if (!data.selectedBatch || data.selectedBatch.batch.id !== id) {
    notFound();
  }

  return <ImportsConsole data={data} initialSourceMode="finder" view="batch" />;
}
