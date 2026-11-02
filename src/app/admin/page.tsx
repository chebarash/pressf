import { can } from "@/core/roles";
import { Overview } from "@/screens/admin/Overview";
import { requireSection } from "@/server/admin/viewer";
import { overview } from "@/server/admin/views";

export default async function AdminOverviewPage() {
  const viewer = await requireSection("overview");
  const data = await overview();
  return <Overview data={data} canSystem={can(viewer.role, "admin:system")} />;
}
