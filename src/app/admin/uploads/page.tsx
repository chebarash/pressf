import { signedUrl } from "@/lib/storage";
import { Uploads } from "@/screens/admin/Uploads";
import { requireSection } from "@/server/admin/viewer";
import { uploadsPage, type UploadTab } from "@/server/admin/views";
import { UPLOAD_SORTS } from "@/server/admin/sorts";
import { parseSort } from "@/core/sort";

const TABS: UploadTab[] = ["waiting", "live", "rejected"];

export default async function AdminUploadsPage({ searchParams }: { searchParams: Promise<{ tab?: string; id?: string; sort?: string; dir?: string }> }) {
  await requireSection("uploads");
  const sp = await searchParams;
  const tab = TABS.includes(sp.tab as UploadTab) ? (sp.tab as UploadTab) : "waiting";
  const data = await uploadsPage(tab, sp.id, new Date(), parseSort(sp, UPLOAD_SORTS));
  // Signing is local (no network), so every item gets its preview link up front and J/K stays instant.
  const items = await Promise.all(
    data.items.map(async ({ storageKey, ...i }) => ({ ...i, previewUrl: storageKey ? await signedUrl(storageKey, i.fileName).catch(() => null) : null }))
  );
  return <Uploads key={data.tab} data={{ ...data, items }} />;
}
