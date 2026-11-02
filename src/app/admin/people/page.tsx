import { People } from "@/screens/admin/People";
import { requireSection } from "@/server/admin/viewer";
import { peoplePage } from "@/server/admin/views";

export default async function AdminPeoplePage({ searchParams }: { searchParams: Promise<{ q?: string; id?: string }> }) {
  const viewer = await requireSection("people");
  const sp = await searchParams;
  const data = await peoplePage(sp.q ?? "", sp.id);
  return <People key={data.selectedId ?? "none"} data={data} viewerId={viewer.id} />;
}
