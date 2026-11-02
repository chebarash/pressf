import { Reports } from "@/screens/admin/Reports";
import { requireSection } from "@/server/admin/viewer";
import { reportsPage } from "@/server/admin/views";

export default async function AdminReportsPage({ searchParams }: { searchParams: Promise<{ tab?: string; item?: string }> }) {
  await requireSection("reports");
  const sp = await searchParams;
  const data = await reportsPage(sp.tab === "resolved" ? "resolved" : "open", sp.item);
  return <Reports key={data.tab} data={data} />;
}
