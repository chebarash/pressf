import { Coverage } from "@/screens/admin/Coverage";
import { coverage } from "@/server/admin/coverage";
import { requireSection } from "@/server/admin/viewer";

export default async function AdminCoveragePage({ searchParams }: { searchParams: Promise<{ tab?: string; faculty?: string; program?: string; year?: string; show?: string }> }) {
  await requireSection("coverage");
  const [data, sp] = await Promise.all([coverage(), searchParams]);
  return (
    <Coverage
      data={data}
      tab={sp.tab === "materials" ? "materials" : "faculty"}
      filter={{ faculty: sp.faculty?.slice(0, 200) ?? "", program: sp.program?.slice(0, 40) ?? "", year: sp.year?.slice(0, 2) ?? "", show: sp.show === "none" || sp.show === "lms" ? sp.show : "" }}
    />
  );
}
