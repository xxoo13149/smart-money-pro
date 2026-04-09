import { RuntimeAdminConsole } from "../../components/RuntimeAdminConsole";
import { requireAdminPageSession } from "../../lib/admin-auth";

export const dynamic = "force-dynamic";

export default async function RuntimePage() {
  await requireAdminPageSession("/runtime");
  return <RuntimeAdminConsole />;
}
