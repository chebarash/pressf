import { Professors } from "@/screens/admin/Professors";
import { ProfessorFaces } from "@/screens/admin/ProfessorFaces";
import { NewuuUnmatched } from "@/screens/admin/NewuuUnmatched";
import { ProfessorProfiles } from "@/screens/admin/ProfessorProfiles";
import { can } from "@/core/roles";
import { profilesPage, unmatchedPage } from "@/server/admin/profiles";
import { facesPage, type FacesShow } from "@/server/admin/faces";
import { requireSection } from "@/server/admin/viewer";
import { professorsPage } from "@/server/admin/views";

type Search = { tab?: string; pair?: string; show?: string; q?: string; id?: string; person?: string };

export default async function AdminProfessorsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const viewer = await requireSection("professors");
  const sp = await searchParams;
  const canEdit = can(viewer.role, "admin:catalog");
  if (sp.tab === "profile") {
    const data = await profilesPage(sp.q ?? "", sp.id);
    return <ProfessorProfiles data={data} canEdit={canEdit} />;
  }
  if (sp.tab === "newuu") {
    const data = await unmatchedPage(sp.q ?? "", sp.person ? Number(sp.person) : undefined);
    return <NewuuUnmatched key={data.selected?.siteId ?? 0} data={data} canEdit={canEdit} />;
  }
  if (sp.tab === "faces") {
    const show: FacesShow = sp.show === "with" ? "with" : "missing";
    const data = await facesPage(show, sp.q ?? "", sp.id);
    return <ProfessorFaces key={`${data.show}:${data.selected?.id ?? ""}`} data={data} />;
  }
  const data = await professorsPage(sp.tab === "all" ? "all" : "duplicates", sp.pair);
  return <Professors key={`${data.tab}:${data.selected?.key ?? ""}`} data={data} />;
}
