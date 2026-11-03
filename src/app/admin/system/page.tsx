import { System } from "@/screens/admin/System";
import { requireSection } from "@/server/admin/viewer";
import { systemPage } from "@/server/admin/views";

export default async function AdminSystemPage() {
  await requireSection("system");
  return <System data={await systemPage()} />;
}
