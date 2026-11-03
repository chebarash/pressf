import { People } from "@/screens/admin/People";
import { requireSection } from "@/server/admin/viewer";
import { peoplePage } from "@/server/admin/views";
import { PEOPLE_SORTS } from "@/server/admin/sorts";
import { parseSort } from "@/core/sort";

export default async function AdminPeoplePage({ searchParams }: { searchParams: Promise<{ q?: string; id?: string; sort?: string; dir?: string }> }) {
  const viewer = await requireSection("people");
  const sp = await searchParams;
  const data = await peoplePage(sp.q ?? "", sp.id, new Date(), parseSort(sp, PEOPLE_SORTS));
  return <People key={data.selectedId ?? "none"} data={data} viewerId={viewer.id} />;
}
