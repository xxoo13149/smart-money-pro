import { WalletsConsole } from "../../components/WalletsConsole";
import { requireAdminPageSession } from "../../lib/admin-auth";
import { getWalletsPageData, parseWalletListQueryInput } from "../../lib/data";

export const dynamic = "force-dynamic";

export default async function WalletsPage({
  searchParams
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdminPageSession("/wallets");
  const resolved = (await searchParams) ?? {};
  const pageData = await getWalletsPageData(parseWalletListQueryInput(resolved));

  return (
    <WalletsConsole
      initialData={pageData.listPage}
      savedViews={pageData.savedViews}
      initialQuery={pageData.query}
      initialSelectedWalletDetail={pageData.selectedWalletDetail}
    />
  );
}
