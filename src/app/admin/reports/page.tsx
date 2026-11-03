import { MentionLinks } from "@/screens/admin/MentionLinks";
import { Reports } from "@/screens/admin/Reports";
import { mentionLinksPage, reportCounts } from "@/server/admin/mention-links";
import { requireSection } from "@/server/admin/viewer";
import { reportsPage } from "@/server/admin/views";

type Search = { tab?: string; item?: string; q?: string; kind?: string; target?: string };

export default async function AdminReportsPage({ searchParams }: { searchParams: Promise<Search> }) {
  await requireSection("reports");
  const sp = await searchParams;
  if (sp.tab === "links") {
    const kind = sp.kind === "course" || sp.kind === "teacher" ? sp.kind : undefined;
    const [data, counts] = await Promise.all([mentionLinksPage({ q: sp.q, kind, target: kind ? sp.target?.slice(0, 80) : undefined }), reportCounts()]);
    return <MentionLinks key="links" data={data} counts={counts} />;
  }
  const data = await reportsPage(sp.tab === "resolved" ? "resolved" : "open", sp.item);
  return <Reports key={data.tab} data={data} />;
}
