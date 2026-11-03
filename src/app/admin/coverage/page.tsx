import { can } from "@/core/roles";
import { Coverage } from "@/screens/admin/Coverage";
import { coverage } from "@/server/admin/coverage";
import { requireSection } from "@/server/admin/viewer";

export default async function AdminCoveragePage({ searchParams }: { searchParams: Promise<{ tab?: string; school?: string; program?: string; year?: string; show?: string }> }) {
  const viewer = await requireSection("coverage");
  const [data, sp] = await Promise.all([coverage(), searchParams]);
  return (
    <Coverage
      data={data}
      tab={sp.tab === "materials" ? "materials" : "school"}
      canMove={can(viewer.role, "admin:catalog")}
      filter={{ school: sp.school?.slice(0, 200) ?? "", program: sp.program?.slice(0, 40) ?? "", year: sp.year?.slice(0, 2) ?? "", show: sp.show === "none" || sp.show === "lms" ? sp.show : "" }}
    />
  );
}
