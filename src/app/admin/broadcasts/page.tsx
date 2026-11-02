import { Broadcasts } from "@/screens/admin/Broadcasts";
import { requireSection } from "@/server/admin/viewer";
import { broadcastsPage } from "@/server/admin/views";

export default async function AdminBroadcastsPage() {
  await requireSection("broadcasts");
  return <Broadcasts data={await broadcastsPage()} />;
}
