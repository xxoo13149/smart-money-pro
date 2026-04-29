import { ImportsConsole } from "../../components/ImportsConsole";
import { requireAdminPageSession } from "../../lib/admin-auth";
import { getWalletImportsPageData } from "../../lib/data";
import type { WalletImportSourceMode } from "../../components/WalletImportPanel";

export const dynamic = "force-dynamic";

const resolveSourceMode = (value?: string | string[]): WalletImportSourceMode => {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw === "finder" || raw === "paste" || raw === "file" ? raw : "finder";
};

export default async function ImportsPage({
  searchParams
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdminPageSession("/imports");
  const resolved = (await searchParams) ?? {};
  const batch = Array.isArray(resolved.batch) ? resolved.batch[0] : resolved.batch;
  const source = resolveSourceMode(resolved.source);
  const data = await getWalletImportsPageData(batch);

  return <ImportsConsole data={data} initialSourceMode={source} view="overview" />;
}
