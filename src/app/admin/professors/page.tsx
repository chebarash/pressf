import { Professors } from "@/screens/admin/Professors";
import { requireSection } from "@/server/admin/viewer";
import { professorsPage } from "@/server/admin/views";

export default async function AdminProfessorsPage({ searchParams }: { searchParams: Promise<{ tab?: string; pair?: string }> }) {
  await requireSection("professors");
  const sp = await searchParams;
  const data = await professorsPage(sp.tab === "all" ? "all" : "duplicates", sp.pair);
  return <Professors key={`${data.tab}:${data.selected?.key ?? ""}`} data={data} />;
}
