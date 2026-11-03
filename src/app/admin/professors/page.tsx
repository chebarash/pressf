import { Professors } from "@/screens/admin/Professors";
import { ProfessorFaces } from "@/screens/admin/ProfessorFaces";
import { facesPage, type FacesShow } from "@/server/admin/faces";
import { requireSection } from "@/server/admin/viewer";
import { professorsPage } from "@/server/admin/views";

type Search = { tab?: string; pair?: string; show?: string; q?: string; id?: string };

export default async function AdminProfessorsPage({ searchParams }: { searchParams: Promise<Search> }) {
  await requireSection("professors");
  const sp = await searchParams;
  if (sp.tab === "faces") {
    const show: FacesShow = sp.show === "with" ? "with" : "missing";
    const data = await facesPage(show, sp.q ?? "", sp.id);
    return <ProfessorFaces key={`${data.show}:${data.selected?.id ?? ""}`} data={data} />;
  }
  const data = await professorsPage(sp.tab === "all" ? "all" : "duplicates", sp.pair);
  return <Professors key={`${data.tab}:${data.selected?.key ?? ""}`} data={data} />;
}
