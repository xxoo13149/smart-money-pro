import { ImportsConsole } from "../../../components/ImportsConsole";
import { requireAdminPageSession } from "../../../lib/admin-auth";
import { getWalletImportsPageData } from "../../../lib/data";

export const dynamic = "force-dynamic";

export default async function FinderImportsPage() {
  await requireAdminPageSession("/imports/finder");
  const data = await getWalletImportsPageData();

  return <ImportsConsole data={data} initialSourceMode="finder" view="finder" />;
}
